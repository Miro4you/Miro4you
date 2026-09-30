import { chordPoly, geomPoly, TAU, type Poly } from '../core/curves';
import type { Vec } from '../core/geom';
import type { Entity } from '../core/types';

type PathCtx = Pick<CanvasRenderingContext2D, 'moveTo' | 'lineTo' | 'quadraticCurveTo' | 'arc'>;

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Wave of the hand-drawn look (ISO freehand line for break edges): wavelength factor and weight. */
const WAVE = 22; // mm
const WAVE_PARTS: [number, number][] = [
  [1, 0.62],
  [0.47, 0.28],
  [0.29, 0.1],
];

function waveAmp(width: number, length: number): number {
  return Math.min(0.5 + width * 0.5, length * 0.035);
}

function phases(seed: string): number[] {
  const h = hashString(seed);
  return [h & 0xff, (h >> 8) & 0xff, (h >> 16) & 0xff].map((v) => (v / 255) * TAU);
}

/**
 * Hand-drawn look for a straight segment: a gentle, deterministic wave
 * perpendicular to a→b that fades out at both ends so the endpoints stay exact.
 */
export function wobblePoints(a: Vec, b: Vec, seed: string, width: number): Vec[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const L = Math.hypot(dx, dy);
  if (L < 1e-6) return [a, b];
  const nx = -dy / L;
  const ny = dx / L;
  const ph = phases(seed);
  const amp = waveAmp(width, L);
  const steps = Math.max(8, Math.ceil(L / 1.5));
  const out: Vec[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const s = t * L;
    const fade = Math.min(1, t * 6, (1 - t) * 6);
    let off = 0;
    WAVE_PARTS.forEach(([f, w], k) => (off += w * Math.sin((s / (WAVE * f)) * TAU + ph[k])));
    off *= amp * fade;
    out.push({ x: a.x + dx * t + nx * off, y: a.y + dy * t + ny * off });
  }
  return out;
}

/**
 * The same wave applied along a curve (circles, arcs). Closed curves get a whole
 * number of waves per turn so the seam matches up.
 */
function wobbleCurve(poly: Poly, seed: string, width: number): number[] {
  const n = poly.s.length;
  const L = poly.s[n - 1];
  const ph = phases(seed);
  const amp = waveAmp(width, L);
  const steps = Math.max(12, Math.ceil(L / 1.5));
  const freqs = WAVE_PARTS.map(([f]) => (poly.closed ? Math.max(1, Math.round(L / (WAVE * f))) / L : 1 / (WAVE * f)));
  const out: number[] = [];
  let j = 0;
  for (let i = 0; i <= steps; i++) {
    const s = (i / steps) * L;
    while (j < n - 2 && poly.s[j + 1] < s) j++;
    const len = poly.s[j + 1] - poly.s[j] || 1;
    const t = Math.min(1, Math.max(0, (s - poly.s[j]) / len));
    const x0 = poly.pts[j * 2];
    const y0 = poly.pts[j * 2 + 1];
    const x1 = poly.pts[j * 2 + 2];
    const y1 = poly.pts[j * 2 + 3];
    const dl = Math.hypot(x1 - x0, y1 - y0) || 1;
    const nx = -(y1 - y0) / dl;
    const ny = (x1 - x0) / dl;
    const fade = poly.closed ? 1 : Math.min(1, (s / L) * 6, (1 - s / L) * 6);
    let off = 0;
    WAVE_PARTS.forEach(([, w], k) => (off += w * Math.sin(s * freqs[k] * TAU + ph[k])));
    off *= amp * fade;
    out.push(x0 + (x1 - x0) * t + nx * off, y0 + (y1 - y0) * t + ny * off);
  }
  return out;
}

/** Smooth polyline through a flat point list using midpoint quadratic curves. */
export function traceStroke(ctx: PathCtx, pts: ArrayLike<number>): void {
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

const wobbleCache = new WeakMap<Entity, number[]>();

/** Points of the freehand wave for entities drawn with the freehand line type (not strokes). */
function wobbled(e: Entity): number[] | null {
  if (e.style.lineType !== 'freehand' || e.kind === 'stroke') return null;
  let w = wobbleCache.get(e);
  if (!w) {
    w =
      e.kind === 'line'
        ? wobblePoints(e.a, e.b, e.id, e.style.width).flatMap((p) => [p.x, p.y])
        : wobbleCurve(geomPoly(e), e.id, e.style.width);
    wobbleCache.set(e, w);
  }
  return w;
}

/** Add the entity's visible geometry to the current path (world units). */
export function traceEntity(ctx: PathCtx, e: Entity): void {
  const w = wobbled(e);
  if (w) {
    traceStroke(ctx, w);
    return;
  }
  switch (e.kind) {
    case 'line':
      ctx.moveTo(e.a.x, e.a.y);
      ctx.lineTo(e.b.x, e.b.y);
      break;
    case 'stroke':
      traceStroke(ctx, e.pts);
      break;
    case 'circle':
      ctx.moveTo(e.c.x + e.r, e.c.y);
      ctx.arc(e.c.x, e.c.y, e.r, 0, TAU);
      break;
    case 'arc':
      ctx.moveTo(e.c.x + Math.cos(e.start) * e.r, e.c.y + Math.sin(e.start) * e.r);
      ctx.arc(e.c.x, e.c.y, e.r, e.start, e.start + e.sweep, e.sweep < 0);
      break;
  }
}

const centerlineCache = new WeakMap<Entity, Poly>();

/** Visible centreline of an entity as a polyline (including the freehand wave). */
export function centerline(e: Entity): Poly {
  const w = wobbled(e);
  if (!w) return geomPoly(e);
  let c = centerlineCache.get(e);
  if (!c) {
    c = chordPoly(w, e.kind === 'circle');
    centerlineCache.set(e, c);
  }
  return c;
}
