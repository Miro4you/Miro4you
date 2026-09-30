import type { Vec } from '../core/geom';
import type { Entity } from '../core/types';

type PathCtx = Pick<CanvasRenderingContext2D, 'moveTo' | 'lineTo' | 'quadraticCurveTo'>;

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Hand-drawn look for a straight segment (ISO freehand line for break edges):
 * a gentle, deterministic wave perpendicular to a→b that fades out at both ends
 * so the endpoints stay exact.
 */
export function wobblePoints(a: Vec, b: Vec, seed: string, width: number): Vec[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L = Math.hypot(dx, dy);
  if (L < 1e-6) return [a, b];
  const nx = -dy / L;
  const ny = dx / L;
  const h = hashString(seed);
  const p1 = ((h & 0xff) / 255) * Math.PI * 2;
  const p2 = (((h >> 8) & 0xff) / 255) * Math.PI * 2;
  const p3 = (((h >> 16) & 0xff) / 255) * Math.PI * 2;
  const amp = Math.min(0.5 + width * 0.5, L * 0.035);
  const wave = 22; // mm
  const steps = Math.max(8, Math.ceil(L / 1.5));
  const out: Vec[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const s = t * L;
    const fade = Math.min(1, t * 6, (1 - t) * 6);
    const off =
      amp *
      fade *
      (0.62 * Math.sin((s / wave) * Math.PI * 2 + p1) +
        0.28 * Math.sin((s / (wave * 0.47)) * Math.PI * 2 + p2) +
        0.1 * Math.sin((s / (wave * 0.29)) * Math.PI * 2 + p3));
    out.push({ x: a.x + dx * t + nx * off, y: a.y + dy * t + ny * off });
  }
  return out;
}

/** Smooth polyline through a flat point list using midpoint quadratic curves. */
export function traceStroke(ctx: PathCtx, pts: number[]): void {
  const n = pts.length / 2;
  if (n === 0) return;
  ctx.moveTo(pts[0], pts[1]);
  if (n === 1) {
    ctx.lineTo(pts[0], pts[1]);
    return;
  }
  if (n === 2) {
    ctx.lineTo(pts[2], pts[3]);
    return;
  }
  for (let i = 1; i < n - 1; i++) {
    const x = pts[i * 2];
    const y = pts[i * 2 + 1];
    const mx = (x + pts[i * 2 + 2]) / 2;
    const my = (y + pts[i * 2 + 3]) / 2;
    ctx.quadraticCurveTo(x, y, mx, my);
  }
  ctx.lineTo(pts[(n - 1) * 2], pts[(n - 1) * 2 + 1]);
}

/** Add the entity's geometry to the current path (world units). */
export function traceEntity(ctx: PathCtx, e: Entity): void {
  if (e.kind === 'line') {
    if (e.style.lineType === 'freehand') {
      traceStroke(ctx, wobblePoints(e.a, e.b, e.id, e.style.width).flatMap((p) => [p.x, p.y]));
    } else {
      ctx.moveTo(e.a.x, e.a.y);
      ctx.lineTo(e.b.x, e.b.y);
    }
  } else {
    traceStroke(ctx, e.pts);
  }
}
