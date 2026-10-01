import type { Vec } from '../core/geom';
import type { SnapKind } from '../core/snap';

export const ACCENT = '#2b63e6';
/** Red for things about to be deleted. */
export const DANGER = '#e0483b';
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

/** Small dot where a hovering pen would touch, with a halo so it shows on any line. */
export function drawCursorDot(ctx: CanvasRenderingContext2D, p: Vec, color: string, halo: string): void {
  ctx.save();
  ctx.fillStyle = halo;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 3.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 2.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Snap marker; `faint` for points nearby that are not (yet) caught. */
export function drawSnapMarker(ctx: CanvasRenderingContext2D, p: Vec, kind: SnapKind, faint = false): void {
  const r = faint ? 4 : 6;
  ctx.save();
  if (faint) ctx.globalAlpha = 0.45;
  ctx.lineWidth = faint ? 1 : 1.5;
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
  } else if (kind === 'cen') {
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  } else if (kind === 'on') {
    // Point on a curve: small hourglass.
    ctx.moveTo(p.x - r + 1, p.y - r + 1);
    ctx.lineTo(p.x + r - 1, p.y - r + 1);
    ctx.lineTo(p.x - r + 1, p.y + r - 1);
    ctx.lineTo(p.x + r - 1, p.y + r - 1);
    ctx.closePath();
  } else if (kind === 'quad') {
    ctx.moveTo(p.x, p.y - r - 1);
    ctx.lineTo(p.x + r + 1, p.y);
    ctx.lineTo(p.x, p.y + r + 1);
    ctx.lineTo(p.x - r - 1, p.y);
    ctx.closePath();
  } else {
    ctx.moveTo(p.x - r, p.y - r);
    ctx.lineTo(p.x + r, p.y + r);
    ctx.moveTo(p.x + r, p.y - r);
    ctx.lineTo(p.x - r, p.y + r);
  }
  if (kind !== 'int') ctx.fill();
  ctx.stroke();
  if (kind === 'cen') {
    ctx.fillStyle = ACCENT;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 1.75, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export type KnobKind = 'end' | 'move' | 'radius' | 'rotate';

/**
 * Handle knob at screen point p, optionally tied by a thin stub to the point it
 * controls (`anchor`). Move knobs show a cross of arrows, rotate knobs a turn arrow.
 */
export function drawKnob(ctx: CanvasRenderingContext2D, p: Vec, kind: KnobKind, active = false, anchor?: Vec): void {
  ctx.save();
  ctx.strokeStyle = ACCENT;
  if (anchor) {
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(anchor.x, anchor.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(anchor.x, anchor.y, 2.25, 0, Math.PI * 2);
    ctx.fillStyle = ACCENT;
    ctx.fill();
  }
  const r = kind === 'end' ? (active ? 7 : 6) : active ? 10 : 9;
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fillStyle = active ? ACCENT : '#ffffff';
  ctx.lineWidth = 1.75;
  ctx.shadowColor = 'rgba(20, 30, 60, 0.25)';
  ctx.shadowBlur = 4;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.stroke();
  ctx.strokeStyle = active ? '#ffffff' : ACCENT;
  ctx.fillStyle = ctx.strokeStyle;
  ctx.lineWidth = 1.4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (kind === 'move') {
    const a = 5;
    ctx.beginPath();
    ctx.moveTo(p.x - a, p.y);
    ctx.lineTo(p.x + a, p.y);
    ctx.moveTo(p.x, p.y - a);
    ctx.lineTo(p.x, p.y + a);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      ctx.moveTo(p.x + dx * a - dy * 2 - dx * 2, p.y + dy * a - dx * 2 - dy * 2);
      ctx.lineTo(p.x + dx * a, p.y + dy * a);
      ctx.lineTo(p.x + dx * a + dy * 2 - dx * 2, p.y + dy * a + dx * 2 - dy * 2);
    }
    ctx.stroke();
  } else if (kind === 'radius') {
    ctx.beginPath();
    ctx.moveTo(p.x - 4.5, p.y);
    ctx.lineTo(p.x + 4.5, p.y);
    ctx.moveTo(p.x + 2, p.y - 2.5);
    ctx.lineTo(p.x + 4.5, p.y);
    ctx.lineTo(p.x + 2, p.y + 2.5);
    ctx.moveTo(p.x - 2, p.y - 2.5);
    ctx.lineTo(p.x - 4.5, p.y);
    ctx.lineTo(p.x - 2, p.y + 2.5);
    ctx.stroke();
  } else if (kind === 'rotate') {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4.5, -Math.PI * 0.9, Math.PI * 0.45);
    ctx.stroke();
    const ex = p.x + Math.cos(Math.PI * 0.45) * 4.5;
    const ey = p.y + Math.sin(Math.PI * 0.45) * 4.5;
    ctx.beginPath();
    ctx.moveTo(ex + 2.6, ey - 0.6);
    ctx.lineTo(ex, ey);
    ctx.lineTo(ex - 0.4, ey - 2.8);
    ctx.stroke();
  }
  ctx.restore();
}

/** Square grip sitting right on a point (selection editing). */
export function drawGrip(ctx: CanvasRenderingContext2D, p: Vec, active = false): void {
  const r = active ? 5.5 : 4.5;
  ctx.save();
  ctx.fillStyle = active ? ACCENT : '#ffffff';
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 1.5;
  ctx.shadowColor = 'rgba(20, 30, 60, 0.2)';
  ctx.shadowBlur = 3;
  ctx.beginPath();
  ctx.rect(p.x - r, p.y - r, r * 2, r * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.stroke();
  ctx.restore();
}

/** Round toggle next to a symmetry axis: two mirrored triangles, filled when mirroring is on. */
export function drawMirrorToggle(ctx: CanvasRenderingContext2D, p: Vec, on: boolean, dir: Vec): void {
  const r = 13;
  ctx.save();
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fillStyle = on ? ACCENT : '#ffffff';
  ctx.strokeStyle = on ? ACCENT : 'rgba(22, 27, 38, 0.25)';
  ctx.lineWidth = 1.25;
  ctx.shadowColor = 'rgba(20, 30, 60, 0.28)';
  ctx.shadowBlur = 6;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.stroke();
  // Icon aligned with the axis: the axis runs along `dir`, triangles point at it from both sides.
  const ux = dir.x;
  const uy = dir.y;
  const vx = -uy;
  const vy = ux;
  const q = (a: number, b: number) => ({ x: p.x + ux * a + vx * b, y: p.y + uy * a + vy * b });
  ctx.fillStyle = on ? '#ffffff' : '#5b6072';
  ctx.strokeStyle = ctx.fillStyle;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  const t1 = [q(-4.5, -2), q(4.5, -2), q(0, -6.5)];
  const t2 = [q(-4.5, 2), q(4.5, 2), q(0, 6.5)];
  for (const t of [t1, t2]) {
    ctx.moveTo(t[0].x, t[0].y);
    ctx.lineTo(t[1].x, t[1].y);
    ctx.lineTo(t[2].x, t[2].y);
    ctx.closePath();
  }
  if (on) ctx.fill();
  else ctx.stroke();
  ctx.setLineDash([1.5, 1.5]);
  ctx.beginPath();
  const l0 = q(-7, 0);
  const l1 = q(7, 0);
  ctx.moveTo(l0.x, l0.y);
  ctx.lineTo(l1.x, l1.y);
  ctx.stroke();
  ctx.restore();
}

/** Eraser cursor: circle of the eraser's size. */
export function drawEraserCursor(ctx: CanvasRenderingContext2D, p: Vec, r: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.fill();
  ctx.lineWidth = 1.25;
  ctx.strokeStyle = 'rgba(22, 27, 38, 0.55)';
  ctx.stroke();
  ctx.restore();
}

/** Freeform selection loop (screen points). */
export function drawLasso(ctx: CanvasRenderingContext2D, pts: Vec[]): void {
  if (pts.length < 2) return;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.fillStyle = 'rgba(43, 99, 230, 0.07)';
  ctx.fill();
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 1.25;
  ctx.setLineDash([5, 4]);
  ctx.stroke();
  ctx.restore();
}

/** Fence line of the trim swipe (screen points). */
export function drawFence(ctx: CanvasRenderingContext2D, pts: Vec[]): void {
  if (pts.length < 2) return;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.strokeStyle = 'rgba(207, 58, 47, 0.7)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 4]);
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
