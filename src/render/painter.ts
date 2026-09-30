import type { Camera } from '../core/camera';
import { dashArray, penColor } from '../core/pens';
import type { Entity } from '../core/types';
import { grainTile } from './grain';
import { traceEntity } from './paths';

/** Thinnest line drawn on screen, in CSS px, so fine pens stay visible when zoomed out. */
export const MIN_LINE_PX = 0.7;
const PENCIL_ALPHA = 0.9;

/**
 * Strokes entities onto a canvas in world coordinates.
 * One painter per canvas context (it caches pencil grain patterns).
 */
export class Painter {
  private patterns = new Map<string, CanvasPattern>();
  private patternMatrix: DOMMatrix | null = null;
  private scale = 1;

  constructor(private ctx: CanvasRenderingContext2D) {}

  /** Set the world transform for this frame. */
  begin(cam: Camera, dpr: number): void {
    const [a, b, c, d, e, f] = cam.matrix();
    const m: [number, number, number, number, number, number] = [a * dpr, b * dpr, c * dpr, d * dpr, e * dpr, f * dpr];
    this.ctx.setTransform(...m);
    this.scale = cam.scale;
    // Grain is anchored to the world origin on screen but keeps a constant pixel size.
    const k = Math.max(1, dpr * 0.6);
    try {
      this.patternMatrix = new DOMMatrix(m).inverse().multiply(new DOMMatrix().translate(m[4], m[5]).scale(k));
    } catch {
      this.patternMatrix = null;
    }
    this.patterns.clear();
  }

  effectiveWidth(width: number): number {
    return Math.max(width, MIN_LINE_PX / this.scale);
  }

  private pencilPattern(color: string): CanvasPattern | null {
    let p = this.patterns.get(color);
    if (p) return p;
    p = this.ctx.createPattern(grainTile(color) as CanvasImageSource, 'repeat') ?? undefined;
    if (!p) return null;
    if (this.patternMatrix) {
      try {
        p.setTransform(this.patternMatrix);
      } catch {
        /* older Safari: grain stays screen-aligned */
      }
    }
    this.patterns.set(color, p);
    return p;
  }

  draw(e: Entity, alpha = 1): void {
    const ctx = this.ctx;
    const s = e.style;
    const color = penColor(s);
    const w = this.effectiveWidth(s.width);
    ctx.lineWidth = w;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash(dashArray(s.lineType, w));
    if (s.pen === 'pencil') {
      ctx.globalAlpha = alpha * PENCIL_ALPHA;
      ctx.strokeStyle = this.pencilPattern(color) ?? color;
    } else {
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = color;
    }
    ctx.beginPath();
    traceEntity(ctx, e);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}
