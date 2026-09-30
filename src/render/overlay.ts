import type { Vec } from '../core/geom';
import type { SnapKind } from '../core/snap';

export const ACCENT = '#2b63e6';
const ACCENT_SOFT = 'rgba(43, 99, 230, 0.16)';

/** Overlay drawing in screen space (CSS px). The context transform must be set to dpr scaling. */

export function drawGuideLine(ctx: CanvasRenderingContext2D, a: Vec, b: Vec): void {
  ctx.save();
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'butt';
  ctx.strokeStyle = ACCENT;
  ctx.setLineDash([7, 5]);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = ACCENT;
  ctx.beginPath();
  ctx.arc(a.x, a.y, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawSnapMarker(ctx: CanvasRenderingContext2D, p: Vec, kind: SnapKind): void {
  const r = 6;
  ctx.save();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = ACCENT;
  ctx.fillStyle = ACCENT_SOFT;
  ctx.beginPath();
  if (kind === 'end') {
    ctx.rect(p.x - r, p.y - r, r * 2, r * 2);
  } else if (kind === 'mid') {
    ctx.moveTo(p.x, p.y - r - 1);
    ctx.lineTo(p.x + r + 1, p.y + r);
    ctx.lineTo(p.x - r - 1, p.y + r);
    ctx.closePath();
  } else {
    ctx.moveTo(p.x - r, p.y - r);
    ctx.lineTo(p.x + r, p.y + r);
    ctx.moveTo(p.x + r, p.y - r);
    ctx.lineTo(p.x - r, p.y + r);
  }
  if (kind !== 'int') ctx.fill();
  ctx.stroke();
  ctx.restore();
}

/** Endpoint handle: a small stub from the endpoint `end` to a round knob at `p`. */
export function drawHandle(ctx: CanvasRenderingContext2D, end: Vec, p: Vec, active = false): void {
  ctx.save();
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(p.x, p.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(end.x, end.y, 2.25, 0, Math.PI * 2);
  ctx.fillStyle = ACCENT;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(p.x, p.y, active ? 7 : 6, 0, Math.PI * 2);
  ctx.fillStyle = active ? ACCENT : '#ffffff';
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 1.75;
  ctx.shadowColor = 'rgba(20, 30, 60, 0.25)';
  ctx.shadowBlur = 4;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.stroke();
  ctx.restore();
}

/**
 * Measurement pill next to segment a→b (screen coordinates), placed beside the
 * midpoint on the upper side so the drawing hand doesn't cover it.
 */
export function drawMeasureLabel(ctx: CanvasRenderingContext2D, a: Vec, b: Vec, text: string): void {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l = Math.hypot(dx, dy) || 1;
  let nx = -dy / l;
  let ny = dx / l;
  if (ny > 0 || (Math.abs(ny) < 1e-6 && nx > 0)) {
    nx = -nx;
    ny = -ny;
  }
  // Distance so the pill's edge (not its centre) keeps a gap to the line.
  const { w, h } = pillSize(ctx, text);
  const off = 10 + Math.abs(nx) * (w / 2) + Math.abs(ny) * (h / 2);
  drawPill(ctx, { x: mx + nx * off, y: my + ny * off }, text);
}

const PILL_FONT = '600 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif';
const PILL_H = 22;

function pillSize(ctx: CanvasRenderingContext2D, text: string): { w: number; h: number } {
  ctx.save();
  ctx.font = PILL_FONT;
  const w = ctx.measureText(text).width + 16;
  ctx.restore();
  return { w, h: PILL_H };
}

export function drawPill(ctx: CanvasRenderingContext2D, center: Vec, text: string): void {
  ctx.save();
  ctx.font = PILL_FONT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const w = ctx.measureText(text).width + 16;
  const h = PILL_H;
  const x = center.x - w / 2;
  const y = center.y - h / 2;
  ctx.fillStyle = 'rgba(24, 26, 32, 0.88)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, center.x, center.y + 0.5);
  ctx.restore();
}

/** "42,5 mm" – more decimals when zoomed in far. */
export function formatLength(mm: number, pxPerMm: number): string {
  const decimals = pxPerMm >= 40 ? 2 : 1;
  return `${mm.toFixed(decimals).replace('.', ',')} mm`;
}

export function formatAngle(deg: number): string {
  const r = Math.round(deg * 10) / 10;
  const v = r >= 360 ? 0 : r;
  return `${Number.isInteger(v) ? v.toFixed(0) : v.toFixed(1).replace('.', ',')}°`;
}
