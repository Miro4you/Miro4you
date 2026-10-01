import type { App } from '../app';
import type { Vec } from '../core/geom';
import type { SnapHit } from '../core/snap';
import type { LineEntity } from '../core/types';
import { drawPill, drawSnapMarker, formatLength } from '../render/overlay';
import type { Tool, ToolEvent } from './tool';

type State = { k: 'idle' } | { k: 'draw'; a: Vec; aHit: SnapHit | null; p: Vec; pHit: SnapHit | null };

/**
 * Rectangle from corner to corner, aligned with the view. It is made of four
 * ordinary lines, so trimming, filleting and snapping work on its sides.
 */
export class RectTool implements Tool {
  readonly id = 'rect';
  private state: State = { k: 'idle' };

  constructor(private app: App) {}

  get busy(): boolean {
    return this.state.k !== 'idle';
  }

  get hoverSnap(): boolean {
    return this.state.k === 'idle';
  }

  /** World directions of screen right and screen down. */
  private axes(): [Vec, Vec] {
    const cam = this.app.cam;
    const o = cam.toWorld({ x: 0, y: 0 });
    const r = cam.toWorld({ x: 1, y: 0 });
    const l = Math.hypot(r.x - o.x, r.y - o.y) || 1;
    const ux = { x: (r.x - o.x) / l, y: (r.y - o.y) / l };
    return [ux, { x: -ux.y, y: ux.x }];
  }

  /** Corners (a, b, c, d) and side lengths for opposite corners a and p. */
  private corners(a: Vec, p: Vec): { pts: Vec[]; w: number; h: number } {
    const [ux, uy] = this.axes();
    const dx = (p.x - a.x) * ux.x + (p.y - a.y) * ux.y;
    const dy = (p.x - a.x) * uy.x + (p.y - a.y) * uy.y;
    const b = { x: a.x + ux.x * dx, y: a.y + ux.y * dx };
    const d = { x: a.x + uy.x * dy, y: a.y + uy.y * dy };
    const c = { x: b.x + uy.x * dy, y: b.y + uy.y * dy };
    return { pts: [a, b, c, d], w: Math.abs(dx), h: Math.abs(dy) };
  }

  private lines(a: Vec, p: Vec, preview: boolean): LineEntity[] {
    const { pts } = this.corners(a, p);
    return pts.map((q, i) => {
      const next = pts[(i + 1) % 4];
      if (preview) return { kind: 'line', id: `preview-rect-${i}`, layerId: '', z: 0, style: this.app.style, a: q, b: next };
      return this.app.newEntity<LineEntity>({ kind: 'line', a: q, b: next });
    });
  }

  down(ev: ToolEvent): void {
    if (!this.app.ensureDrawableLayer()) return;
    const s = this.app.snapPoint(ev.world, ev.pointerType);
    this.state = { k: 'draw', a: s.p, aHit: s.hit, p: s.p, pHit: null };
    this.app.requestOverlay();
  }

  move(ev: ToolEvent): void {
    const st = this.state;
    if (st.k !== 'draw') return;
    const s = this.app.snapPoint(ev.world, ev.pointerType);
    st.p = s.p;
    st.pHit = s.hit;
    this.app.requestOverlay();
  }

  up(ev: ToolEvent): void {
    const st = this.state;
    if (st.k !== 'draw') return;
    this.move(ev);
    this.state = { k: 'idle' };
    const { w, h } = this.corners(st.a, st.p);
    const min = this.app.cam.px(4);
    if (w < min || h < min) {
      if (w < min && h < min) this.app.toast('Rechteck: von Ecke zu Ecke ziehen');
      this.app.requestOverlay();
      return;
    }
    this.app.addDrawn(...this.lines(st.a, st.p, false));
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
      for (const l of this.lines(st.a, st.p, true)) this.app.paintWorld(l);
      if (st.aHit) drawSnapMarker(ctx, cam.toScreen(st.a), st.aHit.kind);
      if (st.pHit) drawSnapMarker(ctx, cam.toScreen(st.p), st.pHit.kind);
      const { w, h } = this.corners(st.a, st.p);
      const s = cam.toScreen(st.p);
      drawPill(ctx, { x: s.x, y: s.y + 34 }, `${formatLength(w, cam.scale)} × ${formatLength(h, cam.scale)}`);
    }
  }
}
