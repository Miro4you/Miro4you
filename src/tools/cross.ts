import type { App } from '../app';
import { dist, polar, drawingAngleDeg, type Vec } from '../core/geom';
import { INK_WIDTHS, PENCIL_WIDTHS } from '../core/pens';
import type { SnapHit } from '../core/snap';
import type { LineEntity } from '../core/types';
import { drawMeasureLabel, drawSnapMarker } from '../render/overlay';
import type { Tool, ToolEvent } from './tool';

/** Arm length (mm) of a cross placed with a tap. */
const DEFAULT_ARM = 10;
const TAP_PX = 3;

type State = { k: 'idle' } | { k: 'draw'; c: Vec; cHit: SnapHit | null; p: Vec };

/**
 * Axis cross: two perpendicular centre lines through a point (e.g. for a hole).
 * They don't mirror; a line can be made a symmetry axis from the selection bar.
 * Drag from the centre to set arm length and direction, or tap for a default cross.
 */
export class CrossTool implements Tool {
  readonly id = 'cross';
  private state: State = { k: 'idle' };

  constructor(private app: App) {}

  get busy(): boolean {
    return this.state.k !== 'idle';
  }

  get hoverSnap(): boolean {
    return this.state.k === 'idle';
  }

  /** The two lines of the cross for centre c and arm end p. */
  private lines(c: Vec, p: Vec): LineEntity[] {
    const arm = Math.max(dist(c, p), 1e-6);
    const deg = dist(c, p) > 0 ? drawingAngleDeg(c, p) : 0;
    const width = this.app.style.pen === 'pencil' ? PENCIL_WIDTHS[0] : INK_WIDTHS[1];
    const style = { ...this.app.style, width, lineType: 'dashdot' as const };
    const mk = (d: number): LineEntity => ({
      kind: 'line',
      id: 'preview',
      layerId: '',
      z: 0,
      style,
      a: polar(c, d + 180, arm),
      b: polar(c, d, arm),
    });
    return [mk(deg), mk(deg + 90)];
  }

  down(ev: ToolEvent): void {
    if (!this.app.ensureDrawableLayer()) return;
    const s = this.app.snapPoint(ev.world, ev.pointerType);
    this.state = { k: 'draw', c: s.p, cHit: s.hit, p: s.p };
    this.app.requestOverlay();
  }

  move(ev: ToolEvent): void {
    const st = this.state;
    if (st.k !== 'draw') return;
    st.p = this.app.resolveEnd(st.c, ev.world, ev.pointerType).p;
    this.app.requestOverlay();
  }

  up(ev: ToolEvent): void {
    const st = this.state;
    if (st.k !== 'draw') return;
    this.move(ev);
    this.state = { k: 'idle' };
    const cam = this.app.cam;
    const p = dist(cam.toScreen(st.c), cam.toScreen(st.p)) < TAP_PX ? { x: st.c.x + DEFAULT_ARM, y: st.c.y } : st.p;
    const [h, v] = this.lines(st.c, p);
    const mk = (l: LineEntity) => {
      const e = this.app.newEntity<LineEntity>({ kind: 'line', a: l.a, b: l.b });
      return { ...e, style: l.style };
    };
    this.app.addDrawn(mk(h), mk(v));
    this.app.requestOverlay();
  }

  cancel(): void {
    this.state = { k: 'idle' };
    this.app.requestOverlay();
  }

  hover(): void {}

  reset(): void {
    this.cancel();
  }

  overlay(ctx: CanvasRenderingContext2D): void {
    const st = this.state;
    const cam = this.app.cam;
    if (st.k === 'draw') {
      const p = dist(cam.toScreen(st.c), cam.toScreen(st.p)) < TAP_PX ? { x: st.c.x + DEFAULT_ARM, y: st.c.y } : st.p;
      for (const l of this.lines(st.c, p)) this.app.paintWorld(l);
      if (st.cHit) drawSnapMarker(ctx, cam.toScreen(st.c), st.cHit.kind);
      drawMeasureLabel(ctx, cam.toScreen(st.c), cam.toScreen(p), this.app.measureText(st.c, p));
    }
  }
}
