import type { App } from '../app';
import { dist, type Vec } from '../core/geom';
import { newId } from '../core/document';
import type { SnapHit } from '../core/snap';
import type { LineEntity } from '../core/types';
import { drawGuideLine, drawHandle, drawMeasureLabel, drawSnapMarker } from '../render/overlay';
import type { PointerKind, Tool, ToolEvent } from './tool';

/** Pen travel (CSS px) below which a press counts as a tap, not a line. */
const TAP_PX = 3;
/**
 * Handles sit this far (CSS px) beyond each line end, so pressing right on an
 * endpoint still starts a new connected line instead of grabbing the handle.
 */
const KNOB_OFFSET_PX = 24;

type State =
  | { k: 'idle' }
  | { k: 'draw'; start: Vec; startHit: SnapHit | null; end: Vec; endHit: SnapHit | null }
  | { k: 'drag'; id: string; which: 0 | 1; before: LineEntity; hit: SnapHit | null; grab: Vec };

/**
 * Straight line: press and drag shows a dashed guide with live length/angle,
 * lifting the pen creates the line. Endpoints snap to existing geometry and the
 * angle to 5° steps (depending on settings). Optional handles allow correcting
 * the ends of the most recent line.
 */
export class LineTool implements Tool {
  readonly id = 'line';
  private state: State = { k: 'idle' };
  private handleId: string | null = null;
  private hoverHit: SnapHit | null = null;

  constructor(private app: App) {}

  get busy(): boolean {
    return this.state.k !== 'idle';
  }

  private handleLine(): LineEntity | null {
    if (!this.handleId || !this.app.settings.handles) return null;
    const e = this.app.doc.get(this.handleId);
    if (!e || e.kind !== 'line') return null;
    const layer = this.app.doc.layer(e.layerId);
    if (!layer || !layer.visible || layer.locked) return null;
    return e;
  }

  down(ev: ToolEvent): void {
    this.hoverHit = null;
    const line = this.handleLine();
    if (line) {
      const r = this.app.handleHitRadius(ev.pointerType);
      const k = this.knobs(line);
      const da = dist(k.ka, ev.screen);
      const db = dist(k.kb, ev.screen);
      if (Math.min(da, db) <= r) {
        const which = da <= db ? 0 : 1;
        // Remember where on the knob it was grabbed relative to the endpoint.
        const end = which === 0 ? k.a : k.b;
        const grab = { x: ev.screen.x - end.x, y: ev.screen.y - end.y };
        this.state = { k: 'drag', id: line.id, which, before: line, hit: null, grab };
        this.app.requestOverlay();
        return;
      }
    }
    this.handleId = null;
    if (!this.app.ensureDrawableLayer()) return;
    const s = this.app.snapPoint(ev.world, ev.pointerType);
    this.state = { k: 'draw', start: s.p, startHit: s.hit, end: s.p, endHit: null };
    this.app.requestOverlay();
  }

  move(ev: ToolEvent): void {
    const st = this.state;
    if (st.k === 'draw') {
      const r = this.app.resolveEnd(st.start, ev.world, ev.pointerType);
      st.end = r.p;
      st.endHit = r.hit;
      this.app.requestOverlay();
    } else if (st.k === 'drag') {
      this.dragTo(st, ev.screen, ev.pointerType);
    }
  }

  /** Screen positions of both ends and their handle knobs. */
  private knobs(line: LineEntity): { a: Vec; b: Vec; ka: Vec; kb: Vec } {
    const cam = this.app.cam;
    const a = cam.toScreen(line.a);
    const b = cam.toScreen(line.b);
    const l = dist(a, b);
    const ux = l > 1e-6 ? (b.x - a.x) / l : 1;
    const uy = l > 1e-6 ? (b.y - a.y) / l : 0;
    return {
      a,
      b,
      ka: { x: a.x - ux * KNOB_OFFSET_PX, y: a.y - uy * KNOB_OFFSET_PX },
      kb: { x: b.x + ux * KNOB_OFFSET_PX, y: b.y + uy * KNOB_OFFSET_PX },
    };
  }

  private dragTo(st: Extract<State, { k: 'drag' }>, screen: Vec, pointerType: PointerKind): void {
    const cur = this.app.doc.get(st.id);
    if (!cur || cur.kind !== 'line') return;
    const anchor = st.which === 0 ? st.before.b : st.before.a;
    const world = this.app.cam.toWorld({ x: screen.x - st.grab.x, y: screen.y - st.grab.y });
    const r = this.app.resolveEnd(anchor, world, pointerType, new Set([st.id]));
    st.hit = r.hit;
    const next: LineEntity = st.which === 0 ? { ...cur, a: r.p } : { ...cur, b: r.p };
    this.app.doc.replaceTransient(next);
    this.app.requestOverlay();
  }

  up(ev: ToolEvent): void {
    const st = this.state;
    if (st.k === 'draw') {
      this.move(ev);
      this.state = { k: 'idle' };
      const cam = this.app.cam;
      if (dist(cam.toScreen(st.start), cam.toScreen(st.end)) < TAP_PX) {
        this.app.requestOverlay();
        return;
      }
      const e: LineEntity = {
        kind: 'line',
        id: newId('E'),
        layerId: this.app.doc.activeLayerId,
        z: this.app.doc.allocZ(),
        style: { ...this.app.style },
        a: st.start,
        b: st.end,
      };
      this.app.doc.add(e);
      this.handleId = this.app.settings.handles ? e.id : null;
    } else if (st.k === 'drag') {
      this.dragTo(st, ev.screen, ev.pointerType);
      this.state = { k: 'idle' };
      const after = this.app.doc.get(st.id);
      if (after && after !== st.before) this.app.doc.update(after, st.before);
    }
    this.app.requestOverlay();
  }

  cancel(): void {
    const st = this.state;
    if (st.k === 'drag' && this.app.doc.get(st.id)) this.app.doc.replaceTransient(st.before);
    this.state = { k: 'idle' };
    this.app.requestOverlay();
  }

  hover(ev: ToolEvent | null): void {
    if (this.state.k !== 'idle') return;
    const hit = ev ? this.app.snapPoint(ev.world, ev.pointerType).hit : null;
    if (hit?.p.x !== this.hoverHit?.p.x || hit?.p.y !== this.hoverHit?.p.y) {
      this.hoverHit = hit;
      this.app.requestOverlay();
    }
  }

  reset(): void {
    this.cancel();
    this.handleId = null;
    this.hoverHit = null;
  }

  /** Drop the handles (e.g. after undo removed the line). */
  dropHandles(): void {
    this.handleId = null;
    this.app.requestOverlay();
  }

  overlay(ctx: CanvasRenderingContext2D): void {
    const cam = this.app.cam;
    const st = this.state;
    if (st.k === 'draw') {
      const a = cam.toScreen(st.start);
      const b = cam.toScreen(st.end);
      drawGuideLine(ctx, a, b);
      if (st.startHit) drawSnapMarker(ctx, a, st.startHit.kind);
      if (st.endHit) drawSnapMarker(ctx, b, st.endHit.kind);
      if (dist(a, b) >= TAP_PX) drawMeasureLabel(ctx, a, b, this.app.measureText(st.start, st.end));
      return;
    }
    const line = this.handleLine();
    if (line) {
      const { a, b, ka, kb } = this.knobs(line);
      if (st.k === 'drag') {
        const p = st.which === 0 ? a : b;
        if (st.hit) drawSnapMarker(ctx, p, st.hit.kind);
        drawMeasureLabel(ctx, a, b, this.app.measureText(line.a, line.b));
      }
      drawHandle(ctx, a, ka, st.k === 'drag' && st.which === 0);
      drawHandle(ctx, b, kb, st.k === 'drag' && st.which === 1);
    }
    if (st.k === 'idle' && this.hoverHit) drawSnapMarker(ctx, cam.toScreen(this.hoverHit.p), this.hoverHit.kind);
  }
}
