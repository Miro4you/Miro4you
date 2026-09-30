import { describe, expect, it } from 'vitest';
import {
  closestOnSegment,
  drawingAngleDeg,
  polar,
  segmentIntersection,
  simplifyFlat,
} from '../src/core/geom';

describe('geom', () => {
  it('measures drawing angles counter-clockwise with y pointing down', () => {
    const o = { x: 0, y: 0 };
    expect(drawingAngleDeg(o, { x: 10, y: 0 })).toBeCloseTo(0);
    expect(drawingAngleDeg(o, { x: 0, y: -10 })).toBeCloseTo(90);
    expect(drawingAngleDeg(o, { x: -10, y: 0 })).toBeCloseTo(180);
    expect(drawingAngleDeg(o, { x: 0, y: 10 })).toBeCloseTo(270);
    expect(drawingAngleDeg(o, { x: 10, y: 1e-9 })).toBe(0);
  });

  it('polar is the inverse of drawingAngleDeg', () => {
    const o = { x: 3, y: 4 };
    const p = polar(o, 35, 20);
    expect(drawingAngleDeg(o, p)).toBeCloseTo(35);
    expect(Math.hypot(p.x - o.x, p.y - o.y)).toBeCloseTo(20);
  });

  it('finds segment intersections and rejects misses', () => {
    const x = segmentIntersection({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 });
    expect(x).not.toBeNull();
    expect(x!.x).toBeCloseTo(5);
    expect(x!.y).toBeCloseTo(5);
    expect(segmentIntersection({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: -1 }, { x: 2, y: 1 })).toBeNull();
    expect(segmentIntersection({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 })).toBeNull();
  });

  it('clamps the closest point to the segment', () => {
    expect(closestOnSegment({ x: -5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 }).point).toEqual({ x: 0, y: 0 });
    expect(closestOnSegment({ x: 4, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 }).t).toBeCloseTo(0.4);
  });

  it('simplifies collinear points but keeps corners and ends', () => {
    const pts = [0, 0, 1, 0.001, 2, 0, 3, 0, 3, 1, 3, 2];
    expect(simplifyFlat(pts, 0.01)).toEqual([0, 0, 3, 0, 3, 2]);
  });
});
