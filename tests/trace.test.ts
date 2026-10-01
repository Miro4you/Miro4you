import { describe, expect, it } from 'vitest';
import type { ArcEntity, LineEntity } from '../src/core/types';
import { sameGeometry } from '../src/tools/trace';

const style = { pen: 'pencil' as const, width: 0.5, lineType: 'solid' as const, color: null };
const line = (ax: number, ay: number, bx: number, by: number): LineEntity => ({ kind: 'line', id: 'x', layerId: 'l', z: 0, style, a: { x: ax, y: ay }, b: { x: bx, y: by } });
const arc = (start: number, sweep: number): ArcEntity => ({ kind: 'arc', id: 'a', layerId: 'l', z: 0, style, c: { x: 0, y: 0 }, r: 5, start, sweep });

describe('trace', () => {
  it('recognises copies already traced (either direction)', () => {
    expect(sameGeometry(line(0, 0, 10, 0), line(10, 0, 0, 0))).toBe(true);
    expect(sameGeometry(line(0, 0, 10, 0), line(0, 0, 10, 1))).toBe(false);
    expect(sameGeometry(arc(0, 1), arc(1, -1))).toBe(true);
    expect(sameGeometry(arc(0, 1), arc(0, 1.5))).toBe(false);
  });
});
