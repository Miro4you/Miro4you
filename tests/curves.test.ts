import { describe, expect, it } from 'vitest';
import {
  capsuleRanges,
  cutParams,
  entityLength,
  geomBox,
  intersectEntities,
  pointAt,
  project,
  removeRanges,
  segmentInCapsule,
  subEntity,
  TAU,
  trimRange,
} from '../src/core/curves';
import type { ArcEntity, CircleEntity, Entity, LineEntity, StrokeEntity } from '../src/core/types';

const style = { pen: 'ink' as const, width: 0.35, lineType: 'solid' as const, color: null };
let n = 0;
const id = () => `x${++n}`;
const line = (ax: number, ay: number, bx: number, by: number): LineEntity => ({
  kind: 'line',
  id: id(),
  layerId: 'l',
  z: 1,
  style,
  a: { x: ax, y: ay },
  b: { x: bx, y: by },
});
const circle = (x: number, y: number, r: number): CircleEntity => ({ kind: 'circle', id: id(), layerId: 'l', z: 1, style, c: { x, y }, r });
const arc = (x: number, y: number, r: number, start: number, sweep: number): ArcEntity => ({
  kind: 'arc',
  id: id(),
  layerId: 'l',
  z: 1,
  style,
  c: { x, y },
  r,
  start,
  sweep,
});
const close = (a: { x: number; y: number }, b: { x: number; y: number }, d = 6) => {
  expect(a.x).toBeCloseTo(b.x, d);
  expect(a.y).toBeCloseTo(b.y, d);
};
const sortPts = (p: { x: number; y: number }[]) => [...p].sort((a, b) => a.x - b.x || a.y - b.y);

describe('measures and projection', () => {
  it('parametrises circles and arcs by arc length', () => {
    const c = circle(0, 0, 10);
    expect(entityLength(c)).toBeCloseTo(TAU * 10);
    close(pointAt(c, 0), { x: 10, y: 0 });
    close(pointAt(c, (Math.PI / 2) * 10), { x: 0, y: 10 });
    const a = arc(0, 0, 10, 0, -Math.PI / 2); // counter-clockwise quarter on screen: (10,0) → (0,-10)
    close(pointAt(a, entityLength(a)), { x: 0, y: -10 });
    expect(project(a, { x: 7, y: -7 }).s).toBeCloseTo((Math.PI / 4) * 10);
    // Outside the arc's range the nearest end wins.
    expect(project(a, { x: -5, y: 8 }).s).toBeGreaterThanOrEqual(0);
  });

  it('bounds an arc by the axis extremes it passes', () => {
    const b = geomBox(arc(0, 0, 10, -Math.PI / 4, Math.PI / 2)); // passes angle 0
    expect(b.maxX).toBeCloseTo(10);
    expect(b.minX).toBeCloseTo(10 * Math.cos(Math.PI / 4));
  });
});

describe('intersections', () => {
  it('line × circle', () => {
    const p = intersectEntities(line(-20, 0, 20, 0), circle(0, 0, 10));
    const s = sortPts(p);
    expect(s.length).toBe(2);
    close(s[0], { x: -10, y: 0 });
    close(s[1], { x: 10, y: 0 });
  });

  it('line × arc keeps only points on the arc', () => {
    const p = intersectEntities(line(-20, 0, 20, 0), arc(0, 0, 10, -Math.PI / 2, Math.PI));
    expect(p.length).toBe(1);
    close(p[0], { x: 10, y: 0 });
  });

  it('circle × circle', () => {
    const p = sortPts(intersectEntities(circle(0, 0, 5), circle(8, 0, 5)));
    expect(p.length).toBe(2);
    close(p[0], { x: 4, y: -3 });
    close(p[1], { x: 4, y: 3 });
    expect(intersectEntities(circle(0, 0, 5), circle(20, 0, 5))).toEqual([]);
    expect(intersectEntities(circle(0, 0, 5), circle(0, 0, 3))).toEqual([]);
  });

  it('stroke × line via its centreline', () => {
    const s: StrokeEntity = { kind: 'stroke', id: id(), layerId: 'l', z: 1, style, pts: [0, -5, 0.2, 0, 0, 5] };
    const p = intersectEntities(s, line(-3, 0, 3, 0));
    expect(p.length).toBe(1);
    expect(p[0].y).toBeCloseTo(0, 6);
  });
});

describe('pieces and trimming', () => {
  it('turns a circle part into an arc', () => {
    const c = circle(0, 0, 10);
    const a = subEntity(c, 0, (Math.PI / 2) * 10, 'p') as ArcEntity;
    expect(a.kind).toBe('arc');
    expect(a.start).toBeCloseTo(0);
    expect(a.sweep).toBeCloseTo(Math.PI / 2);
  });

  it('trims a line between two crossing lines', () => {
    const target = line(0, 0, 30, 0);
    const cutters = [line(10, -5, 10, 5), line(20, -5, 20, 5)];
    const cuts = cutParams(target, cutters);
    expect(cuts.map((c) => +c.toFixed(6))).toEqual([10, 20]);
    const r = trimRange(target, cuts, 15);
    expect(r).toEqual([10, 20]);
    const rest = removeRanges(target, [r], id) as LineEntity[];
    expect(rest.length).toBe(2);
    close(rest[0].b, { x: 10, y: 0 });
    close(rest[1].a, { x: 20, y: 0 });
    // Trimming the outer piece leaves one line.
    expect(removeRanges(target, [trimRange(target, cuts, 5)], id).length).toBe(1);
  });

  it('trims a circle to an arc between two cuts', () => {
    const c = circle(0, 0, 10);
    const cuts = cutParams(c, [line(-20, 0, 20, 0)]); // cuts at angle 0 and π
    expect(cuts.length).toBe(2);
    const r = trimRange(c, cuts, project(c, { x: 0, y: 10 }).s); // lower half on screen (y down)
    const rest = removeRanges(c, [r], id);
    expect(rest.length).toBe(1);
    const a = rest[0] as ArcEntity;
    expect(a.kind).toBe('arc');
    expect(Math.abs(a.sweep)).toBeCloseTo(Math.PI);
    // What is left is the upper half: its midpoint is (0, -10).
    close(pointAt(a, entityLength(a) / 2), { x: 0, y: -10 });
  });

  it('removes a circle completely when fewer than two cuts exist', () => {
    const c = circle(0, 0, 10);
    const r = trimRange(c, [5], 20);
    expect(removeRanges(c, [r], id)).toEqual([]);
  });

  it('handles removal ranges that wrap around the circle seam', () => {
    const c = circle(0, 0, 10);
    const L = entityLength(c);
    const rest = removeRanges(c, [[L - 5, L + 5]], id) as ArcEntity[];
    expect(rest.length).toBe(1);
    expect(entityLength(rest[0])).toBeCloseTo(L - 10);
  });
});

describe('eraser capsule', () => {
  it('finds where a segment runs through a capsule', () => {
    const t = segmentInCapsule({ x: -10, y: 0 }, { x: 10, y: 0 }, { x: 0, y: -5 }, { x: 0, y: 5 }, 1);
    expect(t).not.toBeNull();
    expect(t![0]).toBeCloseTo(0.45);
    expect(t![1]).toBeCloseTo(0.55);
    expect(segmentInCapsule({ x: -10, y: 8 }, { x: 10, y: 8 }, { x: 0, y: -5 }, { x: 0, y: 5 }, 1)).toBeNull();
    // Round end of the capsule.
    const r = segmentInCapsule({ x: -10, y: 5.5 }, { x: 10, y: 5.5 }, { x: 0, y: -5 }, { x: 0, y: 5 }, 1);
    expect(r).not.toBeNull();
    expect((r![1] - r![0]) * 20).toBeCloseTo(2 * Math.sqrt(1 - 0.25), 5);
  });

  it('erases a gap into a line and a circle', () => {
    const l = line(0, 0, 20, 0);
    const ranges = capsuleRanges(l, { x: 10, y: -3 }, { x: 10, y: 3 }, 1);
    expect(ranges.length).toBe(1);
    const parts = removeRanges(l, ranges, id) as LineEntity[];
    expect(parts.length).toBe(2);
    expect(parts[0].b.x).toBeCloseTo(9);
    expect(parts[1].a.x).toBeCloseTo(11);

    const c = circle(0, 0, 10);
    const cr = capsuleRanges(c, { x: 10, y: -2 }, { x: 10, y: 2 }, 0.5);
    const rest = removeRanges(c, cr, id);
    expect(rest.length).toBe(1);
    expect(rest[0].kind).toBe('arc');
  });

  it('erases a stroke into two strokes', () => {
    const pts: number[] = [];
    for (let i = 0; i <= 20; i++) pts.push(i, Math.sin(i / 3));
    const s: StrokeEntity = { kind: 'stroke', id: id(), layerId: 'l', z: 1, style, pts };
    const parts = removeRanges(s, capsuleRanges(s, { x: 10, y: -3 }, { x: 10, y: 3 }, 0.8), id) as Entity[];
    expect(parts.length).toBe(2);
    expect(parts.every((p) => p.kind === 'stroke')).toBe(true);
  });
});
