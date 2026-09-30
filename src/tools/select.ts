import type { App } from '../app';
import { geomPoly } from '../core/curves';
import { dist, type Vec } from '../core/geom';
import { keyPoints, type SnapHit } from '../core/snap';
import { rotation, transformEntity, translation } from '../core/transform';
import type { Entity } from '../core/types';
import { ACCENT, drawKnob, drawLasso, drawMeasureLabel, drawPill, drawSnapMarker, formatAngle } from '../render/overlay';
import { drawGrips, GripDrag, gripsFor, hitGrip } from './grips';
import { selectionBox } from './selection-actions';
import type { Tool, ToolEvent } from './tool';

/** Movement (CSS px) after which a press becomes a drag. */
const DRAG_PX = 6;
/** Distance (CSS px) of the rotate knob above the selection frame. */
const ROTATE_KNOB_PX = 30;

type State =
  | { k: 'idle' }
  | { k: 'press'; screen: Vec; world: Vec; hit: Entity | null }
  | { k: 'move'; press: Vec; ref: Vec; target: Vec; hit: SnapHit | null; before: Entity[] }
  | { k: 'rotate'; c: Vec; a0: number; deg: number; before: Entity[] }
  | { k: 'grip'; drag: GripDrag }
  | { k: 'lasso'; pts: Vec[] };

function pointInPolygon(p: Vec, poly: Vec[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/**
 * Selection: tap objects to add or remove them, tap empty paper to clear,
 * draw a loop on empty paper to add everything inside. Drag a selected object
 * to move the selection (with snapping), use the knob above the frame to rotate,
 * and the grips of a single object to edit it.
 */
export class SelectTool implements Tool {
  readonly id = 'select';
  private state: State = { k: 'idle' };

  constructor(private app: App) {}

  get busy(): boolean {
    return this.state.k !== 'idle';
  }

  /** Screen corners of the selection frame and the rotate knob position. */
  private frame(sel: Entity[]): { corners: Vec[]; knob: Vec; top: Vec; centre: Vec } | null {
    const bx = selectionBox(sel);
    if (!bx) return null;
    const cam = this.app.cam;
    const pad = cam.px(8);
    const b = { minX: bx.minX - pad, minY: bx.minY - pad, maxX: bx.maxX + pad, maxY: bx.maxY + pad };
    const corners = [
      { x: b.minX, y: b.minY },
      { x: b.maxX, y: b.minY },
      { x: b.maxX, y: b.maxY },
      { x: b.minX, y: b.maxY },
    ].map((p) => cam.toScreen(p));
    const top = cam.toScreen({ x: (b.minX + b.maxX) / 2, y: b.minY });
    const below = cam.toScreen({ x: (b.minX + b.maxX) / 2, y: b.minY + 1 });
    const l = dist(top, below) || 1;
    const knob = { x: top.x - ((below.x - top.x) / l) * ROTATE_KNOB_PX, y: top.y - ((below.y - top.y) / l) * ROTATE_KNOB_PX };
    return { corners, knob, top, centre: { x: (bx.minX + bx.maxX) / 2, y: (bx.minY + bx.maxY) / 2 } };
  }

  private singleGrips(sel: Entity[]) {
    return sel.length === 1 ? gripsFor(this.app, sel[0], 'grips') : [];
  }

  down(ev: ToolEvent): void {
    const sel = this.app.selectedEntities();
    const r = this.app.handleHitRadius(ev.pointerType);
    const g = hitGrip(this.app, this.singleGrips(sel), ev.screen, r);
    if (g) {
      this.state = { k: 'grip', drag: new GripDrag(this.app, g, sel[0], ev.screen) };
      this.app.requestOverlay();
      return;
    }
    const f = this.frame(sel);
    if (f && dist(f.knob, ev.screen) <= r) {
      const a0 = Math.atan2(ev.world.y - f.centre.y, ev.world.x - f.centre.x);
      this.state = { k: 'rotate', c: f.centre, a0, deg: 0, before: sel };
      this.app.requestOverlay();
      return;
    }
    const hit = this.app.hitEntity(ev.world, ev.pointerType)?.e ?? null;
    this.state = { k: 'press', screen: ev.screen, world: ev.world, hit };
  }

  move(ev: ToolEvent): void {
    const st = this.state;
    switch (st.k) {
      case 'press': {
        if (dist(st.screen, ev.screen) < DRAG_PX) return;
        const sel = this.app.selectedEntities();
        const f = this.frame(sel);
        const insideFrame = f && pointInPolygon(st.screen, f.corners);
        if (st.hit || insideFrame) {
          if (st.hit && !this.app.selection.has(st.hit.id)) this.app.setSelection([st.hit.id]);
          const moving = this.app.selectedEntities();
          this.state = { k: 'move', press: st.world, ref: this.moveReference(moving, st.world, ev), target: st.world, hit: null, before: moving };
          this.move(ev);
        } else {
          this.state = { k: 'lasso', pts: [st.screen, ev.screen] };
          this.app.requestOverlay();
        }
        return;
      }
      case 'move': {
        const exclude = new Set(st.before.map((e) => e.id));
        const raw = { x: st.ref.x + ev.world.x - st.press.x, y: st.ref.y + ev.world.y - st.press.y };
        const r = this.app.resolveEnd(st.ref, raw, ev.pointerType, exclude, false);
        st.target = r.p;
        st.hit = r.hit;
        const m = translation(r.p.x - st.ref.x, r.p.y - st.ref.y);
        for (const e of st.before) this.app.doc.replaceTransient(transformEntity(e, m));
        this.app.requestOverlay();
        return;
      }
      case 'rotate': {
        const a = Math.atan2(ev.world.y - st.c.y, ev.world.x - st.c.x);
        let deg = (-(a - st.a0) * 180) / Math.PI;
        deg = ((((deg + 180) % 360) + 360) % 360) - 180;
        st.deg = this.app.snapDegrees(deg);
        const m = rotation(st.c, (-st.deg * Math.PI) / 180);
        for (const e of st.before) this.app.doc.replaceTransient(transformEntity(e, m));
        this.app.requestOverlay();
        return;
      }
      case 'grip':
        st.drag.move(ev);
        return;
      case 'lasso':
        st.pts.push(ev.screen);
        this.app.requestOverlay();
        return;
    }
  }

  /** Snap reference: a characteristic point of the selection near the press, else the press itself. */
  private moveReference(sel: Entity[], press: Vec, ev: ToolEvent): Vec {
    const r = this.app.snapRadius(ev.pointerType);
    let best: Vec = press;
    let bd = r;
    for (const e of sel) {
      for (const p of keyPoints(e)) {
        const d = dist(p, press);
        if (d < bd) {
          bd = d;
          best = p;
        }
      }
    }
    return best;
  }

  up(ev: ToolEvent): void {
    const st = this.state;
    this.state = { k: 'idle' };
    switch (st.k) {
      case 'press': {
        // Tap: toggle the object, or clear on empty paper.
        if (st.hit) {
          const next = new Set(this.app.selection);
          if (next.has(st.hit.id)) next.delete(st.hit.id);
          else next.add(st.hit.id);
          this.app.setSelection(next);
        } else {
          this.app.setSelection([]);
        }
        break;
      }
      case 'move':
      case 'rotate':
        this.commit(st.before);
        break;
      case 'grip':
        st.drag.move(ev);
        st.drag.end();
        break;
      case 'lasso':
        this.finishLasso(st.pts);
        break;
    }
    this.app.requestOverlay();
  }

  private commit(before: Entity[]): void {
    const doc = this.app.doc;
    doc.begin();
    for (const b of before) {
      const after = doc.get(b.id);
      if (after && after !== b) doc.update(after, b);
    }
    doc.commit();
  }

  private finishLasso(pts: Vec[]): void {
    if (pts.length < 3) return;
    const cam = this.app.cam;
    const next = new Set(this.app.selection);
    for (const e of this.app.doc.visibleEntities(false)) {
      const poly = geomPoly(e);
      const n = poly.s.length;
      const step = Math.max(1, Math.floor(n / 64));
      let inside = true;
      for (let i = 0; i < n && inside; i += step) {
        if (!pointInPolygon(cam.toScreen({ x: poly.pts[i * 2], y: poly.pts[i * 2 + 1] }), pts)) inside = false;
      }
      if (inside && !pointInPolygon(cam.toScreen({ x: poly.pts[(n - 1) * 2], y: poly.pts[(n - 1) * 2 + 1] }), pts)) inside = false;
      if (inside) next.add(e.id);
    }
    this.app.setSelection(next);
  }

  cancel(): void {
    const st = this.state;
    if (st.k === 'move' || st.k === 'rotate') {
      for (const b of st.before) if (this.app.doc.get(b.id)) this.app.doc.replaceTransient(b);
    } else if (st.k === 'grip') {
      st.drag.cancel();
    }
    this.state = { k: 'idle' };
    this.app.requestOverlay();
  }

  hover(): void {}

  reset(): void {
    this.cancel();
    this.app.setSelection([]);
  }

  overlay(ctx: CanvasRenderingContext2D): void {
    const st = this.state;
    const sel = this.app.selectedEntities();
    if (sel.length) this.app.paintHighlight(sel, ACCENT, 0.28, 6);

    if (st.k === 'lasso') {
      drawLasso(ctx, st.pts);
      return;
    }
    const f = this.frame(sel);
    if (f && st.k !== 'grip') {
      ctx.save();
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      f.corners.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(f.top.x, f.top.y);
      ctx.lineTo(f.knob.x, f.knob.y);
      ctx.stroke();
      ctx.restore();
      drawKnob(ctx, f.knob, 'rotate', st.k === 'rotate');
    }
    if (st.k === 'grip') {
      st.drag.overlay(ctx);
      drawGrips(this.app, ctx, this.singleGrips(sel), 'grips', st.drag.grip.key);
      return;
    }
    if (st.k !== 'move' && st.k !== 'rotate') drawGrips(this.app, ctx, this.singleGrips(sel), 'grips');

    if (st.k === 'move') {
      const a = this.app.cam.toScreen(st.ref);
      const b = this.app.cam.toScreen(st.target);
      if (st.hit) drawSnapMarker(ctx, b, st.hit.kind);
      if (dist(a, b) > 2) drawMeasureLabel(ctx, a, b, this.app.measureText(st.ref, st.target));
    } else if (st.k === 'rotate' && f) {
      drawPill(ctx, { x: f.knob.x, y: f.knob.y - 26 }, `↻ ${formatAngle(st.deg < 0 ? st.deg + 360 : st.deg)}`);
    }
  }
}
