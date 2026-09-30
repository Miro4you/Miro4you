import type { App } from '../app';
import { arcEnds, arcPoint, geomPoly, TAU } from '../core/curves';
import { dist, normAngle, type Vec } from '../core/geom';
import type { SnapHit } from '../core/snap';
import type { ArcEntity, CircleEntity, Entity, LineEntity } from '../core/types';
import { ACCENT, drawGuideLine, drawPill, drawSnapMarker, formatLength } from '../render/overlay';
import type { Tool, ToolEvent } from './tool';

const MIN_R_PX = 3;
/** Pull (CSS px) of the arc end towards sweeps of 45°, 90°, 135°, 180° … */
const SWEEP_MAGNET_PX = 10;

type ArcGeom = { c: Vec; r: number; start: number; sweep: number };

type State =
  | { k: 'idle' }
  /** Tangential: continues the path ending at p0 in direction t. */
  | { k: 'tan'; p0: Vec; t: Vec; p: Vec; hit: SnapHit | null; arc: ArcGeom | null }
  /** Centre mode, step 1: centre placed, dragging out radius and start point. */
  | { k: 'c1'; c: Vec; cHit: SnapHit | null; p: Vec; pHit: SnapHit | null }
  /** Centre mode, step 2: choose the end angle (hover or press and drag, lift to finish). */
  | { k: 'c2'; c: Vec; r: number; a0: number; a: number; last: number; pressed: boolean; hit: SnapHit | null };

function wrapPi(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/**
 * Circle through p that touches direction t at p0; null when p lies on the tangent
 * (a straight continuation).
 */
export function tangentArc(p0: Vec, t: Vec, p: Vec): ArcGeom | null {
  const dx = p.x - p0.x;
  const dy = p.y - p0.y;
  const dd = dx * dx + dy * dy;
  if (dd < 1e-18) return null;
  const nx = -t.y;
  const ny = t.x;
  const dn = dx * nx + dy * ny;
  if (Math.abs(dn) < 1e-6 * Math.sqrt(dd)) return null;
  const rs = dd / (2 * dn);
  const c = { x: p0.x + nx * rs, y: p0.y + ny * rs };
  const start = Math.atan2(p0.y - c.y, p0.x - c.x);
  const end = Math.atan2(p.y - c.y, p.x - c.x);
  const sweep = rs > 0 ? normAngle(end - start) : -normAngle(start - end);
  return { c, r: Math.abs(rs), start, sweep };
}

/** Direction in which a path ending at p would continue, if some line or arc ends there. */
function tangentAt(app: App, p: Vec): Vec | null {
  let best: { t: Vec; z: number } | null = null;
  const eps = 1e-6;
  const consider = (t: Vec, e: Entity) => {
    const l = Math.hypot(t.x, t.y);
    if (l < 1e-12) return;
    if (!best || e.z > best.z) best = { t: { x: t.x / l, y: t.y / l }, z: e.z };
  };
  for (const e of app.doc.visibleEntities()) {
    if (e.kind === 'line') {
      if (dist(e.a, p) < eps) consider({ x: e.a.x - e.b.x, y: e.a.y - e.b.y }, e);
      else if (dist(e.b, p) < eps) consider({ x: e.b.x - e.a.x, y: e.b.y - e.a.y }, e);
    } else if (e.kind === 'arc') {
      const [p0, p1] = arcEnds(e);
      const sign = Math.sign(e.sweep || 1);
      if (dist(p0, p) < eps) {
        const a = e.start;
        consider({ x: sign * Math.sin(a), y: -sign * Math.cos(a) }, e);
      } else if (dist(p1, p) < eps) {
        const a = e.start + e.sweep;
        consider({ x: -sign * Math.sin(a), y: sign * Math.cos(a) }, e);
      }
    } else if (e.kind === 'stroke') {
      const poly = geomPoly(e);
      const n = poly.s.length;
      if (dist({ x: poly.pts[0], y: poly.pts[1] }, p) < 1e-3) {
        consider({ x: poly.pts[0] - poly.pts[2], y: poly.pts[1] - poly.pts[3] }, e);
      } else if (dist({ x: poly.pts[(n - 1) * 2], y: poly.pts[(n - 1) * 2 + 1] }, p) < 1e-3) {
        consider({ x: poly.pts[(n - 1) * 2] - poly.pts[(n - 2) * 2], y: poly.pts[(n - 1) * 2 + 1] - poly.pts[(n - 2) * 2 + 1] }, e);
      }
    }
  }
  return best ? (best as { t: Vec }).t : null;
}

/**
 * Arc tool. Starting on the end of a line or arc gives a tangential arc (a rounded
 * corner): drag to where it should end and lift. Anywhere else – or always, in
 * centre mode – the first drag sets centre and radius, the second the end angle.
 */
export class ArcTool implements Tool {
  readonly id = 'arc';
  private state: State = { k: 'idle' };
  private hoverHit: SnapHit | null = null;

  constructor(private app: App) {}

  get busy(): boolean {
    return this.state.k !== 'idle';
  }

  private preview(g: ArcGeom): ArcEntity {
    return { kind: 'arc', id: 'preview', layerId: '', z: 0, style: this.app.style, ...g };
  }

  down(ev: ToolEvent): void {
    this.hoverHit = null;
    const st = this.state;
    if (st.k === 'c2') {
      st.pressed = true;
      this.updateSweep(st, ev);
      return;
    }
    if (!this.app.ensureDrawableLayer()) return;
    const s = this.app.snapPoint(ev.world, ev.pointerType);
    if (this.app.settings.arcMode === 'auto' && s.hit?.kind === 'end') {
      const t = tangentAt(this.app, s.p);
      if (t) {
        this.state = { k: 'tan', p0: s.p, t, p: s.p, hit: null, arc: null };
        this.app.requestOverlay();
        return;
      }
    }
    this.state = { k: 'c1', c: s.p, cHit: s.hit, p: s.p, pHit: null };
    this.app.requestOverlay();
  }

  move(ev: ToolEvent): void {
    const st = this.state;
    if (st.k === 'tan') this.updateTangent(st, ev);
    else if (st.k === 'c1') {
      const s = this.app.snapPoint(ev.world, ev.pointerType);
      const onCentre = s.hit && dist(s.hit.p, st.c) < 1e-9;
      st.p = onCentre ? ev.world : s.p;
      st.pHit = onCentre ? null : s.hit;
      this.app.requestOverlay();
    } else if (st.k === 'c2' && st.pressed) this.updateSweep(st, ev);
  }

  up(ev: ToolEvent): void {
    const st = this.state;
    if (st.k === 'tan') {
      this.updateTangent(st, ev);
      this.state = { k: 'idle' };
      if (st.arc) this.commit(st.arc);
      else if (dist(this.app.cam.toScreen(st.p0), this.app.cam.toScreen(st.p)) >= MIN_R_PX) {
        // Pen went straight on: continue with a line.
        this.app.addDrawn(this.app.newEntity<LineEntity>({ kind: 'line', a: st.p0, b: st.p }));
      }
    } else if (st.k === 'c1') {
      this.move(ev);
      const r = dist(st.c, st.p);
      if (r * this.app.cam.scale < MIN_R_PX) {
        this.state = { k: 'idle' };
      } else {
        const a0 = Math.atan2(st.p.y - st.c.y, st.p.x - st.c.x);
        this.state = { k: 'c2', c: st.c, r, a0, a: a0, last: a0, pressed: false, hit: null };
        this.app.toast('Jetzt den Bogen bis zum Endpunkt ziehen');
      }
    } else if (st.k === 'c2' && st.pressed) {
      this.updateSweep(st, ev);
      this.state = { k: 'idle' };
      const sweep = st.a - st.a0;
      if (Math.abs(sweep) >= TAU - 1e-6) {
        this.app.addDrawn(
          this.app.newEntity<CircleEntity>({ kind: 'circle', c: st.c, r: st.r, ...(this.app.settings.centerMarks ? { mark: true } : {}) }),
        );
      } else if (Math.abs(sweep) * st.r * this.app.cam.scale >= MIN_R_PX) {
        this.commit({ c: st.c, r: st.r, start: st.a0, sweep });
      }
    }
    this.app.requestOverlay();
  }

  private commit(g: ArcGeom): void {
    this.app.addDrawn(this.app.newEntity<ArcEntity>({ kind: 'arc', ...g }));
  }

  private updateTangent(st: Extract<State, { k: 'tan' }>, ev: ToolEvent): void {
    const s = this.app.snapPoint(ev.world, ev.pointerType);
    const hit = s.hit && dist(s.hit.p, st.p0) > 1e-9 ? s.hit : null;
    const target = hit ? hit.p : ev.world;
    let arc = tangentArc(st.p0, st.t, target);
    if (arc && !hit) arc = this.snapSweep(arc, target);
    st.hit = hit;
    st.arc = arc && arc.r * this.app.cam.scale >= MIN_R_PX && Math.abs(arc.sweep) > 1e-3 ? arc : null;
    st.p = st.arc ? arcEnds(this.preview(st.arc))[1] : target;
    this.app.requestOverlay();
  }

  /** Sweep snapping: 5° steps with the angle snap on, else a magnet towards multiples of 45°. */
  private snapSweep(arc: ArcGeom, pen: Vec): ArcGeom {
    if (this.app.snapSuspended) return arc;
    const deg = (Math.abs(arc.sweep) * 180) / Math.PI;
    const sign = Math.sign(arc.sweep);
    let target = deg;
    if (this.app.settings.angleMode === 'snap') target = this.app.snapDegrees(deg);
    else {
      const k = Math.round(deg / 45) * 45;
      const end = arcPoint(arc.c, arc.r, arc.start + (sign * k * Math.PI) / 180);
      if (k > 0 && dist(this.app.cam.toScreen(end), this.app.cam.toScreen(pen)) <= SWEEP_MAGNET_PX) target = k;
    }
    if (target <= 0 || target >= 360) return arc;
    return { ...arc, sweep: (sign * target * Math.PI) / 180 };
  }

  private updateSweep(st: Extract<State, { k: 'c2' }>, ev: ToolEvent): void {
    const s = this.app.snapPoint(ev.world, ev.pointerType);
    const hit = s.hit && dist(s.hit.p, st.c) > 1e-9 ? s.hit : null;
    const q = hit ? hit.p : ev.world;
    const theta = Math.atan2(q.y - st.c.y, q.x - st.c.x);
    st.a += wrapPi(theta - st.last);
    st.last = theta;
    st.hit = hit;
    if (!hit) {
      const sweep = st.a - st.a0;
      const deg = (Math.abs(sweep) * 180) / Math.PI;
      let snapped = deg;
      if (this.app.settings.angleMode === 'snap') snapped = this.app.snapDegrees(deg);
      else {
        const k = Math.round(deg / 45) * 45;
        const end = arcPoint(st.c, st.r, st.a0 + (Math.sign(sweep) * k * Math.PI) / 180);
        const pen = arcPoint(st.c, st.r, st.a);
        if (dist(this.app.cam.toScreen(end), this.app.cam.toScreen(pen)) <= SWEEP_MAGNET_PX) snapped = k;
      }
      if (snapped !== deg) st.a = st.a0 + (Math.sign(sweep) * snapped * Math.PI) / 180;
    }
    this.app.requestOverlay();
  }

  cancel(): void {
    this.state = { k: 'idle' };
    this.app.requestOverlay();
  }

  hover(ev: ToolEvent | null): void {
    const st = this.state;
    if (st.k === 'c2') {
      if (ev) this.updateSweep(st, ev);
      return;
    }
    if (st.k !== 'idle') return;
    const hit = ev ? this.app.snapPoint(ev.world, ev.pointerType).hit : null;
    if (hit?.p.x !== this.hoverHit?.p.x || hit?.p.y !== this.hoverHit?.p.y) {
      this.hoverHit = hit;
      this.app.requestOverlay();
    }
  }

  reset(): void {
    this.cancel();
    this.hoverHit = null;
  }

  overlay(ctx: CanvasRenderingContext2D): void {
    const cam = this.app.cam;
    const st = this.state;
    const radiusLine = (c: Vec, p: Vec) => {
      const a = cam.toScreen(c);
      const b = cam.toScreen(p);
      ctx.save();
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.restore();
    };
    const label = (c: Vec, r: number, text: string) => {
      const p = cam.toScreen(c);
      drawPill(ctx, { x: p.x, y: p.y - r * cam.scale - 26 }, text);
    };
    if (st.k === 'tan') {
      const p0 = cam.toScreen(st.p0);
      if (st.arc) {
        this.app.paintGuide(this.preview(st.arc));
        radiusLine(st.arc.c, st.p0);
        radiusLine(st.arc.c, st.p);
        label(st.arc.c, st.arc.r, this.app.arcText(st.arc.r, st.arc.sweep));
      } else {
        drawGuideLine(ctx, p0, cam.toScreen(st.p));
      }
      drawSnapMarker(ctx, p0, 'end');
      if (st.hit) drawSnapMarker(ctx, cam.toScreen(st.hit.p), st.hit.kind);
    } else if (st.k === 'c1') {
      const r = dist(st.c, st.p);
      if (r * cam.scale >= MIN_R_PX) {
        this.app.paintGuide({ kind: 'circle', id: 'preview', layerId: '', z: 0, style: this.app.style, c: st.c, r }, false);
        radiusLine(st.c, st.p);
        label(st.c, r, `R ${formatLength(r, cam.scale)}`);
      }
      if (st.cHit) drawSnapMarker(ctx, cam.toScreen(st.c), st.cHit.kind);
      if (st.pHit) drawSnapMarker(ctx, cam.toScreen(st.p), st.pHit.kind);
    } else if (st.k === 'c2') {
      const circle: CircleEntity = { kind: 'circle', id: 'preview', layerId: '', z: 0, style: this.app.style, c: st.c, r: st.r };
      this.app.paintGuide(circle, false, 0.3);
      const sweep = st.a - st.a0;
      if (Math.abs(sweep) > 1e-4) {
        const g = { c: st.c, r: st.r, start: st.a0, sweep };
        this.app.paintGuide(this.preview(g));
        const [, end] = arcEnds(this.preview(g));
        radiusLine(st.c, end);
      }
      radiusLine(st.c, arcPoint(st.c, st.r, st.a0));
      label(st.c, st.r, this.app.arcText(st.r, sweep));
      if (st.hit) drawSnapMarker(ctx, cam.toScreen(st.hit.p), st.hit.kind);
    } else if (this.hoverHit) {
      drawSnapMarker(ctx, cam.toScreen(this.hoverHit.p), this.hoverHit.kind);
    }
  }
}
