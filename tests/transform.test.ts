import { describe, expect, it } from 'vitest';
import { arcEnds } from '../src/core/curves';
import { applyAffine, mirrorGroup, reflection, rotation, transformEntity } from '../src/core/transform';
import type { ArcEntity } from '../src/core/types';

const close = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  expect(a.x).toBeCloseTo(b.x, 6);
  expect(a.y).toBeCloseTo(b.y, 6);
};

describe('transforms', () => {
  it('reflects across an arbitrary line', () => {
    const m = reflection({ x: 0, y: 0 }, { x: 1, y: 1 });
    close(applyAffine(m, { x: 3, y: 1 }), { x: 1, y: 3 });
    const v = reflection({ x: 5, y: 0 }, { x: 5, y: 10 });
    close(applyAffine(v, { x: 2, y: 7 }), { x: 8, y: 7 });
  });

  it('rotates around a centre', () => {
    const m = rotation({ x: 1, y: 1 }, Math.PI / 2);
    close(applyAffine(m, { x: 2, y: 1 }), { x: 1, y: 2 });
  });

  it('mirrors arcs so their ends swap sides correctly', () => {
    const a: ArcEntity = {
      kind: 'arc',
      id: 'a',
      layerId: 'l',
      z: 1,
      style: { pen: 'ink', width: 0.5, lineType: 'solid', color: null },
      c: { x: 2, y: 0 },
      r: 1,
      start: 0,
      sweep: Math.PI / 2,
    };
    const m = reflection({ x: 0, y: -5 }, { x: 0, y: 5 });
    const b = transformEntity(a, m, 'b');
    const [p0, p1] = arcEnds(a);
    const [q0, q1] = arcEnds(b);
    close(q0, applyAffine(m, p0));
    close(q1, applyAffine(m, p1));
    expect(b.sweep).toBeCloseTo(-Math.PI / 2);
  });
});

describe('mirror group', () => {
  it('gives three copies for two perpendicular axes', () => {
    const g = mirrorGroup([
      [{ x: 0, y: -1 }, { x: 0, y: 1 }],
      [{ x: -1, y: 0 }, { x: 1, y: 0 }],
    ]);
    expect(g.length).toBe(3);
    const pts = g.map((m) => applyAffine(m, { x: 2, y: 3 }));
    const key = (p: { x: number; y: number }) => `${Math.round(p.x)},${Math.round(p.y)}`;
    expect(new Set(pts.map(key))).toEqual(new Set(['-2,3', '2,-3', '-2,-3']));
  });

  it('gives one copy for a single axis and ignores duplicates', () => {
    const axis: [{ x: number; y: number }, { x: number; y: number }] = [
      { x: 0, y: 0 },
      { x: 0, y: 5 },
    ];
    expect(mirrorGroup([axis]).length).toBe(1);
    expect(mirrorGroup([axis, [{ x: 0, y: 2 }, { x: 0, y: 9 }]]).length).toBe(1);
  });

  it('falls back to single reflections when axes would repeat endlessly', () => {
    const a = 0.3;
    const g = mirrorGroup([
      [{ x: 0, y: 0 }, { x: 1, y: 0 }],
      [{ x: 0, y: 0 }, { x: Math.cos(a), y: Math.sin(a) }],
    ]);
    expect(g.length).toBe(2);
  });

  it('builds the full pattern for axes at 60°', () => {
    const a = Math.PI / 3;
    const g = mirrorGroup([
      [{ x: 0, y: 0 }, { x: 1, y: 0 }],
      [{ x: 0, y: 0 }, { x: Math.cos(a), y: Math.sin(a) }],
    ]);
    expect(g.length).toBe(5); // dihedral group of order 6 without the identity
  });
});
