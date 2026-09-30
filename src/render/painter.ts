import type { Camera } from '../core/camera';
import type { Box } from '../core/geom';
import { dashArray, penColor } from '../core/pens';
import type { Entity } from '../core/types';
import { grain } from './grain';
import { hashString, traceEntity } from './paths';
import { roughAmpAtScale, traceRough } from './rough';

/** Thinnest line drawn on screen, in CSS px, so fine pens stay visible when zoomed out. */
export const MIN_LINE_PX = 0.7;
const PENCIL_ALPHA = 0.9;

/**
 * Strokes entities onto a canvas in world coordinates.
 * One painter per canvas context (it caches pencil grain patterns per frame).
 */
export class Painter {
  private patterns = new Map<string, CanvasPattern | null>();
  private patternMatrix: DOMMatrix | null = null;
  private scale = 1;
  private view: Box = { minX: -Infinity, minY: -Infinity, maxX: Infinity, maxY: Infinity };

  constructor(private ctx: CanvasRenderingContext2D) {}

  /** Set the world transform for this frame; `view` is the visible world box. */
  begin(cam: Camera, dpr: number, view: Box): void {
    const [a, b, c, d, e, f] = cam.matrix();
    this.ctx.setTransform(a * dpr, b * dpr, c * dpr, d * dpr, e * dpr, f * dpr);
    this.scale = cam.scale;
    this.view = view;
    grain.update(cam.scale, dpr);
    // Pattern space → world: one grain texel is `grain.texel` mm on the paper.
    try {
      this.patternMatrix = new DOMMatrix().scale(grain.texel);
    } catch {
      this.patternMatrix = null;
    }
    this.patterns.clear();
  }

  effectiveWidth(width: number): number {
    return Math.max(width, MIN_LINE_PX / this.scale);
  }

  private pencilPattern(color: string): CanvasPattern | null {
    if (this.patterns.has(color)) return this.patterns.get(color)!;
    let p: CanvasPattern | null = null;
    if (this.patternMatrix) {
      p = this.ctx.createPattern(grain.tile(color) as CanvasImageSource, 'repeat');
      // Without pattern transforms the grain can't follow the paper; plain graphite then.
      if (p && typeof p.setTransform === 'function') p.setTransform(this.patternMatrix);
      else p = null;
    }
    this.patterns.set(color, p);
    return p;
  }

  draw(e: Entity, alpha = 1): void {
    const ctx = this.ctx;
    const s = e.style;
    const color = penColor(s);
    const w = this.effectiveWidth(s.width);
    const dash = dashArray(s.lineType, w);

    if (s.pen === 'pencil') {
      ctx.globalAlpha = alpha * PENCIL_ALPHA;
      const paint = this.pencilPattern(color) ?? color;
      const amp = roughAmpAtScale(s.width, this.scale);
      if (amp > 0) {
        // Up close: ragged graphite edge, filled as one outline.
        ctx.fillStyle = paint;
        ctx.beginPath();
        traceRough(ctx, e, { width: w, dash, amp, pxPerMm: this.scale, view: this.view, seed: hashString(e.id) });
        ctx.fill('nonzero');
        ctx.globalAlpha = 1;
        return;
      }
      ctx.strokeStyle = paint;
    } else {
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
    }
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash(dash);
    ctx.beginPath();
    traceEntity(ctx, e);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}
