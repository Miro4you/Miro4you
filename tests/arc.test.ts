import { describe, expect, it } from 'vitest';
import type { ArcEntity, CircleEntity, LineEntity } from '../src/core/types';
import { startDirection, tangentArc, tangentAxes } from '../src/tools/arc';

const style = { pen: 'ink' as const, width: 0.5, lineType: 'solid' as const, color: null };
const line = (id: string, ax: number, ay: number, bx: number, by: number, z = 0): LineEntity => ({ kind: 'line', id, layerId: 'l', z, style, a: { x: ax, y: ay }, b: { x: bx, y: by } });

describe('arc start direction', () => {
  it('finds the curves through a point anywhere on them', () => {
    const h = line('h', 0, 0, 40, 0);
    const v = line('v', 0, 0, 0, 30, 1);
    const c: CircleEntity = { kind: 'circle', id: 'c', layerId: 'l', z: 2, style, c: { x: 20, y: 10 }, r: 10 };
    // Middle of h and top of the circle: the same direction, listed once.
    expect(tangentAxes([h, v, c], { x: 20, y: 0 })).toHaveLength(1);
    expect(tangentAxes([h, v, c], { x: 30, y: 10 })).toEqual([{ x: -0, y: 1 }]);
    const corner = tangentAxes([h, v], { x: 0, y: 0 });
    expect(corner).toHaveLength(2);
    expect(Math.abs(corner[0].y)).toBeCloseTo(1); // higher z first
    expect(tangentAxes([h], { x: 20, y: 3 })).toHaveLength(0);
  });

  it('respects the extent of arcs', () => {
    const a: ArcEntity = { kind: 'arc', id: 'a', layerId: 'l', z: 0, style, c: { x: 0, y: 0 }, r: 10, start: 0, sweep: Math.PI / 2 };
    expect(tangentAxes([a], { x: 0, y: 10 })).toHaveLength(1);
    expect(tangentAxes([a], { x: 0, y: -10 })).toHaveLength(0);
  });

  it('picks the axis and sense that match the movement', () => {
    const axes = [{ x: 1, y: 0 }, { x: 0, y: 1 }];
    expect(startDirection(axes, { x: 0, y: 0 }, { x: -5, y: 1 })).toEqual({ x: -1, y: -0 });
    expect(startDirection(axes, { x: 0, y: 0 }, { x: 1, y: 6 })).toEqual({ x: 0, y: 1 });
    const free = startDirection([], { x: 0, y: 0 }, { x: 3, y: 4 });
    expect(free.x).toBeCloseTo(0.6);
  });

  it('bends towards the pen, backwards along a line as well', () => {
    // Leaving (0,0) to the left and ending below: quarter circle with centre (-10, 10).
    const g = tangentArc({ x: 0, y: 0 }, { x: -1, y: 0 }, { x: -10, y: 10 })!;
    expect(g.c.x).toBeCloseTo(0);
    expect(g.c.y).toBeCloseTo(10);
    expect(g.r).toBeCloseTo(10);
    expect(Math.abs(g.sweep)).toBeCloseTo(Math.PI / 2);
  });
});
