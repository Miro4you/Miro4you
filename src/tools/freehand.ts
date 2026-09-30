import type { App } from '../app';
import { dist, simplifyFlat, type Vec } from '../core/geom';
import { newId } from '../core/document';
import type { StrokeEntity } from '../core/types';
import { ACCENT } from '../render/overlay';
import type { Tool, ToolEvent } from './tool';

/** Minimum pointer travel (CSS px) before a new point is recorded. */
const MIN_STEP_PX = 0.8;
/** Simplification tolerance (CSS px) applied when the stroke is committed. */
const SIMPLIFY_PX = 0.3;

/**
 * Freehand drawing. With smoothing on, the line hangs on a "lazy string": the
 * drawing point only follows once the pen is further away than the string
 * length, which irons out jitter and gives calm, flowing waves.
 */
export class FreehandTool implements Tool {
  readonly id = 'freehand';
  private pts: number[] | null = null;
  /** Drawing point (screen) at the end of the string. */
  private brush: Vec = { x: 0, y: 0 };
  private pen: Vec = { x: 0, y: 0 };
  private last: Vec = { x: 0, y: 0 };
  /** Id of the stroke in progress (the preview uses it too, so it looks identical). */
  private strokeId = '';

  constructor(private app: App) {}

  get busy(): boolean {
    return this.pts !== null;
  }

  down(ev: ToolEvent): void {
    if (!this.app.ensureDrawableLayer()) return;
    this.pts = [ev.world.x, ev.world.y];
    this.brush = ev.screen;
    this.pen = ev.screen;
    this.last = ev.screen;
    this.strokeId = newId('S');
    this.app.requestOverlay();
  }

  move(ev: ToolEvent): void {
    if (!this.pts) return;
    this.pen = ev.screen;
    const L = this.app.settings.stabilizer;
    if (L > 0) {
      // Pull the brush along the string.
      const d = dist(ev.screen, this.brush);
      if (d <= L) {
        this.app.requestOverlay();
        return;
      }
      const t = (d - L) / d;
      this.brush = { x: this.brush.x + (ev.screen.x - this.brush.x) * t, y: this.brush.y + (ev.screen.y - this.brush.y) * t };
    } else {
      this.brush = ev.screen;
    }
    if (dist(this.brush, this.last) < MIN_STEP_PX) {
      this.app.requestOverlay();
      return;
    }
    const w = this.app.cam.toWorld(this.brush);
    this.pts.push(w.x, w.y);
    this.last = this.brush;
    this.app.requestOverlay();
  }

  up(ev: ToolEvent): void {
    if (!this.pts) return;
    this.move(ev);
    const pts = this.pts;
    this.pts = null;
    // Without smoothing the line ends exactly where the pen lifted.
    if (this.app.settings.stabilizer <= 0) {
      const n = pts.length;
      if (ev.world.x !== pts[n - 2] || ev.world.y !== pts[n - 1]) pts.push(ev.world.x, ev.world.y);
    }
    let out = simplifyFlat(pts, this.app.cam.px(SIMPLIFY_PX));
    // A tap leaves a dot: two points a hair apart so round caps render it.
    if (out.length === 2 || (out.length === 4 && out[0] === out[2] && out[1] === out[3])) {
      out = [out[0], out[1], out[0] + 0.001, out[1]];
    }
    const e: StrokeEntity = {
      kind: 'stroke',
      id: this.strokeId,
      layerId: this.app.doc.activeLayerId,
      z: this.app.doc.allocZ(),
      style: { ...this.app.style },
      pts: out,
    };
    this.app.addDrawn(e);
    this.app.requestOverlay();
  }

  cancel(): void {
    this.pts = null;
    this.app.requestOverlay();
  }

  hover(): void {}

  reset(): void {
    this.cancel();
  }

  overlay(ctx: CanvasRenderingContext2D): void {
    if (!this.pts) return;
    const preview: StrokeEntity = {
      kind: 'stroke',
      id: this.strokeId,
      layerId: this.app.doc.activeLayerId,
      z: 0,
      style: this.app.style,
      pts: this.pts.length === 2 ? [this.pts[0], this.pts[1], this.pts[0] + 0.001, this.pts[1]] : this.pts,
    };
    this.app.paintWorld(preview);
    if (this.app.settings.stabilizer > 0) {
      // The string from the pen to the drawing point.
      ctx.save();
      ctx.strokeStyle = ACCENT;
      ctx.globalAlpha = 0.7;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(this.pen.x, this.pen.y);
      ctx.lineTo(this.brush.x, this.brush.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(this.pen.x, this.pen.y, 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
}
