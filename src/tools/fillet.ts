import type { App } from '../app';
import { newId } from '../core/document';
import { closestOnSegment, dist, type Vec } from '../core/geom';
import type { ArcEntity, LineEntity } from '../core/types';
import { ACCENT, drawPill, formatLength } from '../render/overlay';
import type { Tool, ToolEvent } from './tool';

/** How far (CSS px) from the tap the corner may lie. */
const CORNER_PX = 60;
const DRAG_PX = 8;

export interface Fillet {
  l1: LineEntity;
  l2: LineEntity;
  /** Corner (intersection of the infinite lines). */
  v: Vec;
  /** Unit directions from the corner along the kept parts. */
  u1: Vec;
  u2: Vec;
  /** Kept far ends. */
  e1: Vec;
  e2: Vec;
}

const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y;
const unit = (v: Vec): Vec => {
  const l = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / l, y: v.y / l };
};

function cross(l1: LineEntity, l2: LineEntity): Vec | null {
  const r = sub(l1.b, l1.a);
  const s = sub(l2.b, l2.a);
  const den = r.x * s.y - r.y * s.x;
  if (Math.abs(den) < 1e-6 * Math.hypot(r.x, r.y) * Math.hypot(s.x, s.y)) return null;
  const t = ((l2.a.x - l1.a.x) * s.y - (l2.a.y - l1.a.y) * s.x) / den;
  return { x: l1.a.x + r.x * t, y: l1.a.y + r.y * t };
}

/** Which way along the line from v is kept, and its far end. */
function side(l: LineEntity, v: Vec, tap: Vec): { u: Vec; end: Vec } {
  const d = unit(sub(l.b, l.a));
  const ta = dot(sub(l.a, v), d);
  const tb = dot(sub(l.b, v), d);
  const eps = 1e-6;
  let s: number;
  if (Math.min(ta, tb) > -eps) s = 1;
  else if (Math.max(ta, tb) < eps) s = -1;
  else s = Math.sign(dot(sub(tap, v), d)) || 1;
  const u = { x: d.x * s, y: d.y * s };
  return { u, end: ta * s >= tb * s ? l.a : l.b };
}

/** The corner between two lines nearest to a tap, or null. */
export function findCorner(lines: LineEntity[], tap: Vec, maxDist: number): Fillet | null {
  const near = lines
    .map((l) => ({ l, d: dist(closestOnSegment(tap, l.a, l.b).point, tap) }))
    .filter((x) => x.d < maxDist)
    .sort((a, b) => a.d - b.d)
    .slice(0, 8);
  let best: Fillet | null = null;
  let bd = maxDist;
  for (let i = 0; i < near.length; i++)
    for (let j = i + 1; j < near.length; j++) {
      const l1 = near[i].l;
      const l2 = near[j].l;
      const v = cross(l1, l2);
      if (!v) continue;
      const d = dist(v, tap);
      if (d >= bd) continue;
      const s1 = side(l1, v, tap);
      const s2 = side(l2, v, tap);
      bd = d;
      best = { l1, l2, v, u1: s1.u, u2: s2.u, e1: s1.end, e2: s2.end };
    }
  return best;
}

/** Arc midpoint distance from the corner for radius r (used to set r by dragging). */
function bulge(f: Fillet): number {
  const half = Math.acos(Math.max(-1, Math.min(1, dot(f.u1, f.u2)))) / 2;
  return 1 / Math.sin(half) - 1;
}

/**
 * The trimmed lines and the tangent arc for radius r (r = 0: sharp corner), or an
 * error message when the radius doesn't fit.
 */
export function makeFillet(f: Fillet, r: number): { l1: LineEntity; l2: LineEntity; arc: Omit<ArcEntity, 'id' | 'z'> | null } | string {
  const cos = Math.max(-1, Math.min(1, dot(f.u1, f.u2)));
  const theta = Math.acos(cos);
  if (theta < 1e-3 || Math.PI - theta < 1e-3) return 'Die Linien liegen auf einer Geraden';
  const t = r / Math.tan(theta / 2);
  const len1 = dot(sub(f.e1, f.v), f.u1);
  const len2 = dot(sub(f.e2, f.v), f.u2);
  if (t >= len1 - 1e-6 || t >= len2 - 1e-6) return 'Radius zu groß für diese Ecke';
  const t1 = { x: f.v.x + f.u1.x * t, y: f.v.y + f.u1.y * t };
  const t2 = { x: f.v.x + f.u2.x * t, y: f.v.y + f.u2.y * t };
  const keepA = (l: LineEntity, end: Vec, p: Vec): LineEntity => (dist(l.a, end) < dist(l.b, end) ? { ...l, a: end, b: p } : { ...l, a: p, b: end });
  const l1 = keepA(f.l1, f.e1, t1);
  const l2 = keepA(f.l2, f.e2, t2);
  if (r <= 0) return { l1, l2, arc: null };
  const bis = unit({ x: f.u1.x + f.u2.x, y: f.u1.y + f.u2.y });
  const h = r / Math.sin(theta / 2);
  const c = { x: f.v.x + bis.x * h, y: f.v.y + bis.y * h };
  const start = Math.atan2(t1.y - c.y, t1.x - c.x);
  const end = Math.atan2(t2.y - c.y, t2.x - c.x);
  const sweep = Math.atan2(Math.sin(end - start), Math.cos(end - start));
  return { l1, l2, arc: { kind: 'arc', layerId: f.l1.layerId, style: f.l1.style, c, r, start, sweep } };
}

type State = { k: 'idle' } | { k: 'press'; start: Vec; corner: Fillet | null; r: number; moved: boolean };

/**
 * Fillet ("Ecken verrunden"): tap near a corner of two lines to round it with the
 * set radius, or press and drag to size the radius live. Radius 0 closes the
 * corner sharply (trims or extends both lines).
 */
export class FilletTool implements Tool {
  readonly id = 'fillet';
  private state: State = { k: 'idle' };
  private hoverCorner: Fillet | null = null;

  constructor(private app: App) {}

  get busy(): boolean {
    return this.state.k !== 'idle';
  }

  private corner(world: Vec): Fillet | null {
    const lines: LineEntity[] = [];
    for (const e of this.app.doc.visibleEntities(false)) if (e.kind === 'line' && !e.axis) lines.push(e);
    return findCorner(lines, world, this.app.cam.px(CORNER_PX));
  }

  down(ev: ToolEvent): void {
    this.hoverCorner = null;
    this.state = { k: 'press', start: ev.screen, corner: this.corner(ev.world), r: this.app.settings.filletRadius, moved: false };
    this.app.requestOverlay();
  }

  move(ev: ToolEvent): void {
    const st = this.state;
    if (st.k !== 'press' || !st.corner) return;
    if (!st.moved && dist(st.start, ev.screen) > DRAG_PX) st.moved = true;
    if (st.moved) {
      const b = bulge(st.corner);
      let r = b > 1e-6 ? dist(st.corner.v, ev.world) / b : 0;
      // Round to a sensible step for the zoom level.
      const step = this.app.cam.scale > 8 ? 0.1 : this.app.cam.scale > 2 ? 0.5 : 1;
      r = Math.round(r / step) * step;
      st.r = r;
    }
    this.app.requestOverlay();
  }

  up(ev: ToolEvent): void {
    const st = this.state;
    if (st.k !== 'press') return;
    this.move(ev);
    this.state = { k: 'idle' };
    this.app.requestOverlay();
    if (!st.corner) {
      this.app.toast('Nahe an eine Ecke zwischen zwei Linien tippen');
      return;
    }
    const res = makeFillet(st.corner, st.r);
    if (typeof res === 'string') {
      this.app.toast(res);
      return;
    }
    const doc = this.app.doc;
    doc.begin();
    doc.update(res.l1);
    doc.update(res.l2);
    if (res.arc) doc.add({ ...res.arc, id: newId('E'), z: doc.allocZ() } as ArcEntity);
    doc.commit();
    if (st.moved) this.app.updateSettings({ filletRadius: st.r });
  }

  cancel(): void {
    this.state = { k: 'idle' };
    this.app.requestOverlay();
  }

  hover(ev: ToolEvent | null): void {
    const c = ev ? this.corner(ev.world) : null;
    if (c?.l1.id !== this.hoverCorner?.l1.id || c?.l2.id !== this.hoverCorner?.l2.id || c?.u1.x !== this.hoverCorner?.u1.x) {
      this.hoverCorner = c;
      this.app.requestOverlay();
    }
  }

  reset(): void {
    this.cancel();
    this.hoverCorner = null;
  }

  overlay(ctx: CanvasRenderingContext2D): void {
    const st = this.state;
    const f = st.k === 'press' ? st.corner : this.hoverCorner;
    if (!f) return;
    const r = st.k === 'press' ? st.r : this.app.settings.filletRadius;
    this.app.paintHighlight([f.l1, f.l2], ACCENT, 0.25);
    const res = makeFillet(f, r);
    const cam = this.app.cam;
    if (typeof res !== 'string' && res.arc) {
      this.app.paintGuide({ ...res.arc, id: 'preview-fillet', z: 0 } as ArcEntity);
    }
    const s = cam.toScreen(f.v);
    drawPill(ctx, { x: s.x, y: s.y - 30 }, typeof res === 'string' ? res : r > 0 ? `R ${formatLength(r, cam.scale)}` : 'Ecke schließen');
  }
}
