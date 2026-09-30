import { arcEnds, arcPoint, intersectEntities, project } from './curves';
import { entityBox } from './document';
import type { SketchDocument } from './document';
import { boxContainsPoint, dist, drawingAngleDeg, mid, polar, type Vec } from './geom';
import type { Entity } from './types';

/** end = endpoint, mid = midpoint, int = intersection, cen = centre, quad = quadrant point of a circle. */
export type SnapKind = 'end' | 'mid' | 'int' | 'cen' | 'quad';

export interface SnapHit {
  p: Vec;
  kind: SnapKind;
}

export interface SnapOptions {
  end: boolean;
  mid: boolean;
  int: boolean;
  /** Centres and quadrant points of circles and arcs (default on). */
  cen?: boolean;
  /** Entity ids to ignore (e.g. the one being edited). */
  exclude?: ReadonlySet<string>;
}

/** Lower value wins when two candidates are about equally close. */
const PRIORITY: Record<SnapKind, number> = { end: 0, cen: 0.5, int: 1, quad: 1.5, mid: 2 };

/**
 * Find the best snap point within `radius` (world units) of `p`.
 * Endpoints beat centres beat intersections beat quadrants and midpoints,
 * unless another kind is clearly closer.
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
  const centres = opts.cen !== false;

  const near: Entity[] = [];
  for (const e of doc.visibleEntities()) {
    if (opts.exclude?.has(e.id)) continue;
    const box = entityBox(e);
    // Centres may lie far from the drawn curve, so test them before culling.
    if ((e.kind === 'circle' || e.kind === 'arc') && centres) consider(e.c, 'cen');
    if (!boxContainsPoint(box, p, radius)) continue;
    switch (e.kind) {
      case 'line':
        if (opts.end) {
          consider(e.a, 'end');
          consider(e.b, 'end');
        }
        if (opts.mid) consider(mid(e.a, e.b), 'mid');
        break;
      case 'stroke':
        if (opts.end) {
          const n = e.pts.length;
          consider({ x: e.pts[0], y: e.pts[1] }, 'end');
          consider({ x: e.pts[n - 2], y: e.pts[n - 1] }, 'end');
        }
        break;
      case 'circle':
        if (centres) for (let k = 0; k < 4; k++) consider(arcPoint(e.c, e.r, (k * Math.PI) / 2), 'quad');
        break;
      case 'arc': {
        const [a, b] = arcEnds(e);
        if (opts.end) {
          consider(a, 'end');
          consider(b, 'end');
        }
        if (opts.mid) consider(arcPoint(e.c, e.r, e.start + e.sweep / 2), 'mid');
        break;
      }
    }
    // Candidates for intersections: curves passing close to the pointer (not freehand strokes).
    if (opts.int && e.kind !== 'stroke' && project(e, p).d <= radius) near.push(e);
  }

  if (opts.int && near.length > 1) {
    for (let i = 0; i < near.length; i++) {
      for (let j = i + 1; j < near.length; j++) {
        for (const x of intersectEntities(near[i], near[j])) consider(x, 'int');
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

/** Characteristic points of an entity (ends, centre) – e.g. to pick a move reference. */
export function keyPoints(e: Entity): Vec[] {
  switch (e.kind) {
    case 'line':
      return [e.a, e.b, mid(e.a, e.b)];
    case 'stroke': {
      const n = e.pts.length;
      return [
        { x: e.pts[0], y: e.pts[1] },
        { x: e.pts[n - 2], y: e.pts[n - 1] },
      ];
    }
    case 'circle':
      return [e.c, ...[0, 1, 2, 3].map((k) => arcPoint(e.c, e.r, (k * Math.PI) / 2))];
    case 'arc':
      return [...arcEnds(e), e.c, arcPoint(e.c, e.r, e.start + e.sweep / 2)];
  }
}
