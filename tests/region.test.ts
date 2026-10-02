import { describe, expect, it } from 'vitest';
import { dilate, floodFill, labelComponents, loopArea, traceLoops } from '../src/core/region';

/** Barrier mask from ASCII art: '#' = line. */
function grid(rows: string[]): { m: Uint8Array; w: number; h: number } {
  const h = rows.length;
  const w = rows[0].length;
  const m = new Uint8Array(w * h);
  rows.forEach((r, y) => [...r].forEach((c, x) => (m[y * w + x] = c === '#' ? 1 : 0)));
  return { m, w, h };
}

describe('region finding', () => {
  const box = grid([
    '..........',
    '.########.',
    '.#......#.',
    '.#.###..#.',
    '.#.#.#..#.',
    '.#.###..#.',
    '.#......#.',
    '.########.',
    '..........',
  ]);

  it('fills a closed area and leaves islands out', () => {
    const r = floodFill(box.m, box.w, box.h, 2, 2);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const count = r.filled.reduce((a, b) => a + b, 0);
    expect(count).toBe(6 * 5 - 9); // interior minus the 3×3 island
    expect(r.filled[4 * box.w + 4]).toBe(0);
  });

  it('reports open areas and taps on lines', () => {
    const open = grid(['.....', '.#.#.', '.#.#.', '.....']);
    expect(floodFill(open.m, open.w, open.h, 2, 1)).toEqual({ ok: false, reason: 'open' });
    expect(floodFill(box.m, box.w, box.h, 1, 1)).toEqual({ ok: false, reason: 'onLine' });
  });

  it('traces the outline and the hole', () => {
    const r = floodFill(box.m, box.w, box.h, 2, 2);
    if (!r.ok) throw new Error('fill failed');
    const loops = traceLoops(r.filled, box.w, box.h);
    expect(loops.length).toBe(2);
    const areas = loops.map(loopArea).map(Math.abs).sort((a, b) => b - a);
    expect(areas[0]).toBeCloseTo(30);
    expect(areas[1]).toBeCloseTo(9);
  });

  it('dilates by the given radius', () => {
    const m = new Uint8Array(25);
    m[12] = 1;
    const d = dilate(m, 5, 5, 1);
    expect(d.reduce((a, b) => a + b, 0)).toBe(9);
  });
});

describe('components', () => {
  it('labels areas and marks open ones', () => {
    const g = grid(['......', '.####.', '.#..#.', '.####.', '......']);
    const c = labelComponents(g.m, g.w, g.h);
    expect(c.size.length).toBe(3);
    const inner = c.labels[2 * g.w + 2];
    expect(c.size[inner]).toBe(2);
    expect(c.border[inner]).toBe(false);
    expect(c.border[c.labels[0]]).toBe(true);
  });
});
