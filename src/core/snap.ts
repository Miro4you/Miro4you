import { entityBox } from './document';
import type { SketchDocument } from './document';
import {
  boxContainsPoint,
  dist,
  distToSegment,
  drawingAngleDeg,
  mid,
  polar,
  segmentIntersection,
  type Vec,
} from './geom';
import type { Entity, LineEntity } from './types';

export type SnapKind = 'end' | 'mid' | 'int';

export interface SnapHit {
  p: Vec;
  kind: SnapKind;
}

export interface SnapOptions {
  end: boolean;
  mid: boolean;
  int: boolean;
  /** Entity ids to ignore (e.g. the one being edited). */
  exclude?: ReadonlySet<string>;
}

/** Lower value wins when two candidates are about equally close. */
const PRIORITY: Record<SnapKind, number> = { end: 0, int: 1, mid: 2 };

/**
 * Find the best snap point within `radius` (world units) of `p`.
 * Endpoints beat intersections beat midpoints unless another kind is clearly closer.
 */
export function findSnap(doc: SketchDocument, p: Vec, radius: number, opts: SnapOptions): SnapHit | null {
  let best: SnapHit | null = null;
  let bestScore = Infinity;
  const consider = (q: Vec, kind: SnapKind) => {
    const d = dist(p, q);
    if (d > radius) return;
    // Bias by kind: a lower-priority candidate must be noticeably closer to win.
    const score = d + PRIORITY[kind] * radius * 0.25;
    if (score < bestScore) {
      bestScore = score;
      best = { p: q, kind };
    }
  };

  const nearLines: LineEntity[] = [];
  for (const e of doc.visibleEntities()) {
    if (opts.exclude?.has(e.id)) continue;
    if (!boxContainsPoint(entityBox(e), p, radius)) continue;
    if (e.kind === 'line') {
      if (opts.end) {
        consider(e.a, 'end');
        consider(e.b, 'end');
      }
      if (opts.mid) consider(mid(e.a, e.b), 'mid');
      if (opts.int && distToSegment(p, e.a, e.b) <= radius) nearLines.push(e);
    } else if (opts.end) {
      const n = e.pts.length;
      consider({ x: e.pts[0], y: e.pts[1] }, 'end');
      consider({ x: e.pts[n - 2], y: e.pts[n - 1] }, 'end');
    }
  }

  if (opts.int && nearLines.length > 1) {
    for (let i = 0; i < nearLines.length; i++) {
      for (let j = i + 1; j < nearLines.length; j++) {
        const a = nearLines[i];
        const b = nearLines[j];
        const x = segmentIntersection(a.a, a.b, b.a, b.b);
        if (x) consider(x, 'int');
      }
    }
  }
  return best;
}

export type AngleMode = 'snap' | 'show' | 'off';

/**
 * Gentle magnet towards the main directions (every 45°): only pulls when the
 * direction start→end is within `tolDeg` of one, otherwise returns `end` unchanged.
 */
export function softSnapAngle(start: Vec, end: Vec, tolDeg: number, stepDeg = 45): Vec {
  const l = dist(start, end);
  if (l === 0) return { ...end };
  const deg = drawingAngleDeg(start, end);
  const target = Math.round(deg / stepDeg) * stepDeg;
  if (Math.abs(deg - target) > tolDeg) return { ...end };
  return polar(start, target, l);
}

/** Round the direction start→end to a multiple of `stepDeg`, keeping the length. */
export function snapAngle(start: Vec, end: Vec, stepDeg: number): Vec {
  const l = dist(start, end);
  if (l === 0) return { ...end };
  const deg = Math.round(drawingAngleDeg(start, end) / stepDeg) * stepDeg;
  return polar(start, deg, l);
}

/** Endpoints of an entity, for handles and hit testing. */
export function endpoints(e: Entity): Vec[] {
  if (e.kind === 'line') return [e.a, e.b];
  const n = e.pts.length;
  return [
    { x: e.pts[0], y: e.pts[1] },
    { x: e.pts[n - 2], y: e.pts[n - 1] },
  ];
}
