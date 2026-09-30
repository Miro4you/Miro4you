import type { App } from '../app';
import { dist, simplifyFlat, type Vec } from '../core/geom';
import { newId } from '../core/document';
import type { StrokeEntity } from '../core/types';
import type { Tool, ToolEvent } from './tool';

/** Minimum pointer travel (CSS px) before a new point is recorded. */
const MIN_STEP_PX = 0.8;
/** Simplification tolerance (CSS px) applied when the stroke is committed. */
const SIMPLIFY_PX = 0.3;

export class FreehandTool implements Tool {
  readonly id = 'freehand';
  private pts: number[] | null = null;
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
    this.last = ev.screen;
    this.strokeId = newId('S');
    this.app.requestOverlay();
  }

  move(ev: ToolEvent): void {
    if (!this.pts) return;
    if (dist(ev.screen, this.last) < MIN_STEP_PX) return;
    this.pts.push(ev.world.x, ev.world.y);
    this.last = ev.screen;
    this.app.requestOverlay();
  }

  up(ev: ToolEvent): void {
    if (!this.pts) return;
    const pts = this.pts;
    this.pts = null;
    const n = pts.length;
    if (ev.world.x !== pts[n - 2] || ev.world.y !== pts[n - 1]) pts.push(ev.world.x, ev.world.y);
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

  overlay(): void {
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
  }
}
