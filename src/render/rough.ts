import type { Box } from '../core/geom';
import type { Entity } from '../core/types';
import { centerline } from './paths';

/**
 * Ragged graphite edges for pencil strokes seen up close.
 *
 * Instead of stroking, the stroke outline is built as a polygon whose two edges are
 * displaced by 1D value noise along the arc length. The noise lives in world units
 * (seeded per entity), so the edge stays put while zooming; octaves finer than the
 * screen can show fade out, and the whole effect fades in only when it would be
 * larger than a fraction of a pixel. Joins follow the approach of stroke outliners:
 * the inner side of a turn is routed through the centreline vertex and the outer
 * side gets a round join, so all pieces wind the same way and a single nonzero fill
 * yields their union without holes. Only the visible part of the path is built.
 */

type PathCtx = Pick<CanvasRenderingContext2D, 'moveTo' | 'lineTo' | 'closePath'>;

/** Noise octaves along the edge: wavelength in mm and relative weight. */
const OCTAVES = [
  { len: 0.11, weight: 0.6 },
  { len: 0.042, weight: 0.3 },
  { len: 0.016, weight: 0.1 },
];
/** Chord error (px) for round caps and joins. */
const ARC_TOL_PX = 0.3;

/** Largest edge displacement (mm) for a pencil of the given width. */
export function roughAmplitude(width: number): number {
  return 0.014 + 0.04 * width;
}

/** Displacement to use at this zoom (px per mm); 0 means a plain stroke looks identical. */
export function roughAmpAtScale(width: number, pxPerMm: number): number {
  const amp = roughAmplitude(width);
  return amp * smoothstep(0.6, 2.2, amp * pxPerMm);
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function hash(seed: number, i: number): number {
  let h = (seed ^ Math.imul(i | 0, 0x27d4eb2d)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return ((h >>> 0) / 4294967295) * 2 - 1;
}

/** Smooth 1D value noise in [-1, 1]. */
function vnoise(seed: number, x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return hash(seed, i) * (1 - u) + hash(seed, i + 1) * u;
}

/** Edge displacement function for one zoom level. */
class EdgeNoise {
  private weights: number[];

  constructor(amp: number, pxPerMm: number) {
    // Octaves fade in once their wavelength spans a few pixels, avoiding shimmer.
    this.weights = OCTAVES.map((o) => amp * o.weight * smoothstep(2.5, 7, o.len * pxPerMm));
  }

  at(seed: number, s: number): number {
    let v = 0;
    for (let o = 0; o < OCTAVES.length; o++) {
      const w = this.weights[o];
      if (w > 0) v += w * vnoise(seed + o * 7919, s / OCTAVES[o].len);
    }
    return v;
  }
}

export interface RoughOptions {
  /** Line width in mm. */
  width: number;
  /** Canvas-style dash array for round caps ([] = solid). */
  dash: number[];
  /** Like ctx.lineDashOffset: pattern position at the start of the path. */
  dashOffset?: number;
  /** Edge displacement in mm (from roughAmpAtScale). */
  amp: number;
  /** Zoom in px per mm. */
  pxPerMm: number;
  /** Visible world box; geometry outside it is skipped. */
  view: Box;
  seed: number;
}

/**
 * Part of segment [x0,y0]→[x1,y1] inside the box, as parameters [t0, t1] ⊂ [0, 1],
 * or null when it misses the box (Liang–Barsky).
 */
export function clipSegment(x0: number, y0: number, x1: number, y1: number, b: Box): [number, number] | null {
  let t0 = 0;
  let t1 = 1;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const edges: [number, number][] = [
    [-dx, x0 - b.minX],
    [dx, b.maxX - x0],
    [-dy, y0 - b.minY],
    [dy, b.maxY - y0],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return null;
    } else {
      const t = q / p;
      if (p < 0) {
        if (t > t1) return null;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return null;
        if (t < t1) t1 = t;
      }
    }
  }
  return [t0, t1];
}

/** Add the ragged outline of a pencil entity to the current path (fill with nonzero). */
export function traceRough(ctx: PathCtx, e: Entity, o: RoughOptions): void {
  const { pts, s: S, closed } = centerline(e);
  const n = S.length;
  const r = o.width / 2;
  const edge = new EdgeNoise(o.amp, o.pxPerMm);
  const total = S[n - 1];
  // On closed curves blend into the start over the last stretch, so the edge meets itself.
  const blend = Math.min(total / 4, 0.5);
  const noise = {
    at(seed: number, s: number): number {
      const v = edge.at(seed, s);
      if (!closed || s < total - blend) return v;
      const t = (s - (total - blend)) / blend;
      const w = t * t * (3 - 2 * t);
      return v + (edge.at(seed, s - total) - v) * w;
    },
  };
  // Sample spacing ≈ 1 px, snapped to a power of two so sample positions stay fixed in the world.
  const h = Math.pow(2, Math.round(Math.log2(1 / o.pxPerMm)));
  const arcStep = (radius: number) => {
    const rp = Math.max(radius * o.pxPerMm, ARC_TOL_PX * 2);
    return 2 * Math.acos(1 - ARC_TOL_PX / rp);
  };
  const seedL = o.seed >>> 0;
  const seedR = (o.seed ^ 0x5bd1e995) >>> 0;
  // Geometry this far outside the view cannot reach into it.
  const margin = r + o.amp + 2 / o.pxPerMm;
  const clipBox: Box = {
    minX: o.view.minX - margin,
    minY: o.view.minY - margin,
    maxX: o.view.maxX + margin,
    maxY: o.view.maxY + margin,
  };

  const tan = (j: number): [number, number] => {
    const dx = pts[j * 2 + 2] - pts[j * 2];
    const dy = pts[j * 2 + 3] - pts[j * 2 + 1];
    const l = Math.hypot(dx, dy) || 1;
    return [dx / l, dy / l];
  };
  const pointAt = (j: number, s: number): [number, number] => {
    const len = S[j + 1] - S[j];
    const t = len > 0 ? Math.min(1, Math.max(0, (s - S[j]) / len)) : 0;
    return [pts[j * 2] + (pts[j * 2 + 2] - pts[j * 2]) * t, pts[j * 2 + 1] + (pts[j * 2 + 3] - pts[j * 2 + 1]) * t];
  };

  /** Round cap with a ragged rim that meets the edge noise at both ends (interior points only). */
  const cap = (j: number, s: number, start: boolean): number[] => {
    const [tx, ty] = tan(j);
    const nAngle = Math.atan2(tx, -ty);
    const [px, py] = pointAt(j, s);
    const eL = noise.at(seedL, s);
    const eR = noise.at(seedR, s);
    const capSeed = (o.seed ^ Math.imul(Math.round(s * 1000), 0x9e3779b1)) >>> 0;
    const steps = Math.max(2, Math.ceil(Math.PI / arcStep(r)));
    const from = start ? eR : eL;
    const to = start ? eL : eR;
    const out: number[] = [];
    for (let k = 1; k < steps; k++) {
      const tau = k / steps;
      // Start cap: right edge round the back to the left edge; end cap: left edge round the front.
      const phi = start ? nAngle + Math.PI - Math.PI * tau : nAngle - Math.PI * tau;
      const rad = r + from + (to - from) * tau + Math.sin(Math.PI * tau) * noise.at(capSeed, tau * Math.PI * r);
      out.push(px + Math.cos(phi) * rad, py + Math.sin(phi) * rad);
    }
    return out;
  };

  /** Outline of the on-interval [a, b], which lies on segments j0..j1. */
  const emitInterval = (a: number, b: number, j0: number, j1: number) => {
    const left: number[] = [];
    const right: number[] = [];
    let j = j0;
    while (j < j1 && S[j + 1] <= a) j++;
    const jStart = j;

    const sample = (seg: number, s: number) => {
      const [tx, ty] = tan(seg);
      const [cx, cy] = pointAt(seg, s);
      const rl = r + noise.at(seedL, s);
      const rr = r + noise.at(seedR, s);
      left.push(cx - ty * rl, cy + tx * rl);
      right.push(cx + ty * rr, cy - tx * rr);
    };

    const join = (seg: number, sv: number) => {
      const [t1x, t1y] = tan(seg);
      const [t2x, t2y] = tan(seg + 1);
      const cx = pts[(seg + 1) * 2];
      const cy = pts[(seg + 1) * 2 + 1];
      let cr = t1x * t2y - t1y * t2x;
      const dt = t1x * t2x + t1y * t2y;
      const rl = r + noise.at(seedL, sv);
      const rr = r + noise.at(seedR, sv);
      if (Math.abs(cr) < 1e-12) {
        if (dt > 0) return; // straight on: the samples already connect
        cr = 1e-12; // U-turn: treat as a turn towards the left
      }
      const delta = Math.atan2(cr, dt);
      if (cr > 0) {
        // Left side is inside the turn: route through the vertex. Right side: round join.
        left.push(cx, cy, cx - t2y * rl, cy + t2x * rl);
        const a0 = Math.atan2(-t1x, t1y);
        const steps = Math.max(1, Math.ceil(Math.abs(delta) / arcStep(rr)));
        for (let k = 1; k < steps; k++) {
          const ang = a0 + (delta * k) / steps;
          right.push(cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr);
        }
        right.push(cx + t2y * rr, cy - t2x * rr);
      } else {
        const a0 = Math.atan2(t1x, -t1y);
        const steps = Math.max(1, Math.ceil(Math.abs(delta) / arcStep(rl)));
        for (let k = 1; k < steps; k++) {
          const ang = a0 + (delta * k) / steps;
          left.push(cx + Math.cos(ang) * rl, cy + Math.sin(ang) * rl);
        }
        left.push(cx - t2y * rl, cy + t2x * rl);
        right.push(cx, cy, cx + t2y * rr, cy - t2x * rr);
      }
    };

    sample(j, a);
    let cur = a;
    for (;;) {
      const segEnd = S[j + 1];
      const stop = Math.min(b, segEnd);
      for (let g = Math.floor(cur / h) + 1; g * h < stop; g++) sample(j, g * h);
      if (b <= segEnd || j >= j1) {
        sample(j, stop);
        break;
      }
      sample(j, segEnd);
      join(j, segEnd);
      j++;
      cur = segEnd;
    }

    const startCap = cap(jStart, a, true);
    const endCap = cap(j, b, false);
    ctx.moveTo(right[0], right[1]);
    for (let i = 0; i < startCap.length; i += 2) ctx.lineTo(startCap[i], startCap[i + 1]);
    for (let i = 0; i < left.length; i += 2) ctx.lineTo(left[i], left[i + 1]);
    for (let i = 0; i < endCap.length; i += 2) ctx.lineTo(endCap[i], endCap[i + 1]);
    for (let i = right.length - 2; i >= 0; i -= 2) ctx.lineTo(right[i], right[i + 1]);
    ctx.closePath();
  };

  const period = o.dash.reduce((acc, v) => acc + v, 0);
  /** Emit the visible stretch [s0, s1] of the path (segments j0..j1), split into dashes. */
  const emitRun = (s0: number, s1: number, j0: number, j1: number) => {
    if (!o.dash.length || period <= 0) {
      emitInterval(s0, s1, j0, j1);
      return;
    }
    const off = o.dashOffset ?? 0;
    let pos = Math.floor((s0 + off) / period) * period - off;
    while (pos <= s1) {
      for (let i = 0; i < o.dash.length && pos <= s1; i++) {
        const len = o.dash[i];
        if (i % 2 === 0 && pos + len >= s0) emitInterval(Math.max(pos, s0), Math.min(pos + len, s1), j0, j1);
        pos += len;
      }
    }
  };

  // Clip every segment to the view and merge pieces that continue through a vertex.
  let run: { s0: number; s1: number; j0: number; j1: number } | null = null;
  for (let j = 0; j < n - 1; j++) {
    const c = clipSegment(pts[j * 2], pts[j * 2 + 1], pts[j * 2 + 2], pts[j * 2 + 3], clipBox);
    if (!c) continue;
    const len = S[j + 1] - S[j];
    const a = S[j] + c[0] * len;
    const b = S[j] + c[1] * len;
    if (run && run.j1 === j - 1 && run.s1 >= S[j] - 1e-9 && c[0] === 0) {
      run.s1 = b;
      run.j1 = j;
    } else {
      if (run) emitRun(run.s0, run.s1, run.j0, run.j1);
      run = { s0: a, s1: b, j0: j, j1: j };
    }
  }
  if (run) emitRun(run.s0, run.s1, run.j0, run.j1);
}
