import { describe, expect, it } from 'vitest';
import { dashArray, formatWidth } from '../src/core/pens';

describe('pens', () => {
  it('builds ISO 128 dash patterns compensated for round caps', () => {
    expect(dashArray('solid', 0.5)).toEqual([]);
    const d = 0.5;
    const dashed = dashArray('dashed', d);
    // dash 12d, gap 3d – round caps add d/2 on each end
    expect(dashed[0] + d).toBeCloseTo(12 * d);
    expect(dashed[1] - d).toBeCloseTo(3 * d);
    const dd = dashArray('dashdotdot', d);
    expect(dd.length).toBe(6);
    expect(dd[2]).toBeLessThan(0.01);
  });

  it('formats widths the German way', () => {
    expect(formatWidth(0.18)).toBe('0,18');
    expect(formatWidth(0.5)).toBe('0,5');
    expect(formatWidth(0.7)).toBe('0,7');
  });
});
