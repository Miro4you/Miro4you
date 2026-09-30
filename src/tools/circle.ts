import type { App } from '../app';
import { dist, type Vec } from '../core/geom';
import type { SnapHit } from '../core/snap';
import type { CircleEntity } from '../core/types';
import { ACCENT, drawPill, drawSnapMarker } from '../render/overlay';
import { drawGrips, GripDrag, gripsFor, hitGrip } from './grips';
import type { Tool, ToolEvent } from './tool';

/** Smallest radius (CSS px) that creates a circle; below it the press was a tap. */
const MIN_R_PX = 3;

type State =
  | { k: 'idle' }
  | { k: 'draw'; c: Vec; cHit: SnapHit | null; p: Vec; pHit: SnapHit | null }
  | { k: 'grip'; drag: GripDrag };

/**
 * Circle from centre and radius: press at the centre, drag out the radius (dashed
 * preview with R and Ø), lift to create. Knobs on the new circle move it or change
 * its radius afterwards.
 */
export class CircleTool implements Tool {
  readonly id = 'circle';
  private state: State = { k: 'idle' };
  private handleId: string | null = null;
  private hoverHit: SnapHit | null = null;

  constructor(private app: App) {}

  get busy(): boolean {
    return this.state.k !== 'idle';
  }

  private handleCircle(): CircleEntity | null {
    if (!this.handleId || !this.app.settings.handles) return null;
    const e = this.app.doc.get(this.handleId);
    if (!e || e.kind !== 'circle' || !this.app.isEditable(e)) return null;
    return e;
  }

  down(ev: ToolEvent): void {
    this.hoverHit = null;
    const circle = this.handleCircle();
    if (circle) {
      const g = hitGrip(this.app, gripsFor(this.app, circle, 'knobs'), ev.screen, this.app.handleHitRadius(ev.pointerType));
      if (g) {
        this.state = { k: 'grip', drag: new GripDrag(this.app, g, circle, ev.screen) };
        this.app.requestOverlay();
        return;
      }
    }
    this.handleId = null;
    if (!this.app.ensureDrawableLayer()) return;
    const s = this.app.snapPoint(ev.world, ev.pointerType);
    this.state = { k: 'draw', c: s.p, cHit: s.hit, p: s.p, pHit: null };
    this.app.requestOverlay();
  }

  move(ev: ToolEvent): void {
    const st = this.state;
    if (st.k === 'draw') {
      const s = this.app.snapPoint(ev.world, ev.pointerType);
      // Snapping onto the centre itself would give radius 0.
      if (s.hit && dist(s.hit.p, st.c) < 1e-9) {
        st.p = ev.world;
        st.pHit = null;
      } else {
        st.p = s.p;
        st.pHit = s.hit;
      }
      this.app.requestOverlay();
    } else if (st.k === 'grip') {
      st.drag.move(ev);
    }
  }

  up(ev: ToolEvent): void {
    const st = this.state;
    if (st.k === 'draw') {
      this.move(ev);
      this.state = { k: 'idle' };
      const r = dist(st.c, st.p);
      if (r * this.app.cam.scale >= MIN_R_PX) {
        const e = this.app.newEntity<CircleEntity>({
          kind: 'circle',
          c: st.c,
          r,
          ...(this.app.settings.centerMarks ? { mark: true } : {}),
        });
        this.app.addDrawn(e);
        this.handleId = this.app.settings.handles ? e.id : null;
      }
    } else if (st.k === 'grip') {
      st.drag.move(ev);
      st.drag.end();
      this.state = { k: 'idle' };
    }
    this.app.requestOverlay();
  }

  cancel(): void {
    if (this.state.k === 'grip') this.state.drag.cancel();
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

  overlay(ctx: CanvasRenderingContext2D): void {
    const cam = this.app.cam;
    const st = this.state;
    if (st.k === 'draw') {
      const c = cam.toScreen(st.c);
      const p = cam.toScreen(st.p);
      const r = dist(st.c, st.p);
      const rpx = r * cam.scale;
      if (rpx >= MIN_R_PX) {
        this.app.paintGuide({ kind: 'circle', id: 'preview', layerId: '', z: 0, style: this.app.style, c: st.c, r });
        // Radius line and centre cross.
        ctx.save();
        ctx.strokeStyle = ACCENT;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(c.x, c.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        ctx.restore();
        drawPill(ctx, { x: c.x, y: c.y - rpx - 26 }, this.app.radiusText(r));
      }
      ctx.save();
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(c.x - 5, c.y);
      ctx.lineTo(c.x + 5, c.y);
      ctx.moveTo(c.x, c.y - 5);
      ctx.lineTo(c.x, c.y + 5);
      ctx.stroke();
      ctx.restore();
      if (st.cHit) drawSnapMarker(ctx, c, st.cHit.kind);
      if (st.pHit) drawSnapMarker(ctx, p, st.pHit.kind);
      return;
    }
    const circle = this.handleCircle();
    if (circle) {
      if (st.k === 'grip') st.drag.overlay(ctx);
      drawGrips(this.app, ctx, gripsFor(this.app, circle, 'knobs'), 'knobs', st.k === 'grip' ? st.drag.grip.key : undefined);
    }
    if (st.k === 'idle' && this.hoverHit) drawSnapMarker(ctx, cam.toScreen(this.hoverHit.p), this.hoverHit.kind);
  }
}
