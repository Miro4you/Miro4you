import { describe, expect, it } from 'vitest';
import { distToSegment } from '../src/core/geom';
import { dashArray } from '../src/core/pens';
import type { LineEntity, StrokeEntity } from '../src/core/types';
import { grainLevel } from '../src/render/grain';
import { clipSegment, roughAmpAtScale, roughAmplitude, traceRough } from '../src/render/rough';

function recorder() {
  const subpaths: number[][] = [];
  return {
    subpaths,
    moveTo(x: number, y: number) {
      subpaths.push([x, y]);
    },
    lineTo(x: number, y: number) {
      subpaths[subpaths.length - 1].push(x, y);
    },
    closePath() {},
  };
}

const style = { pen: 'pencil' as const, width: 0.5, lineType: 'solid' as const, color: null };
const line = (a: [number, number], b: [number, number], lineType: LineEntity['style']['lineType'] = 'solid'): LineEntity => ({
  kind: 'line',
  id: `L${a}${b}${lineType}`,
  layerId: 'l',
  z: 1,
  style: { ...style, lineType },
  a: { x: a[0], y: a[1] },
  b: { x: b[0], y: b[1] },
});
const bigView = { minX: -1e4, minY: -1e4, maxX: 1e4, maxY: 1e4 };

describe('grain level of detail', () => {
  it('keeps texels between 1.6 and 3.2 device px', () => {
    for (const scale of [0.05, 0.4, 3.78, 17, 120, 400]) {
      const { texel, fine } = grainLevel(scale, 2);
      const px = texel * scale * 2;
      expect(px).toBeGreaterThanOrEqual(1.6 - 1e-9);
      expect(px).toBeLessThan(3.2 + 1e-9);
      expect(fine).toBeGreaterThanOrEqual(0);
      expect(fine).toBeLessThanOrEqual(1);
    }
  });

  it('hands over between octaves without a jump', () => {
    // Zoom at which the fine texel reaches 3.2 device px and the next finer level takes over.
    const boundary = 3.2 / (2 * grainLevel(10, 2).texel);
    const below = grainLevel(boundary * 0.9999, 2);
    const above = grainLevel(boundary * 1.0001, 2);
    expect(below.fine).toBeGreaterThan(0.99);
    expect(above.fine).toBeLessThan(0.01);
    // The octave that was fine becomes the coarse one: same size on paper.
    expect(above.texel * 2).toBeCloseTo(below.texel);
  });
});

describe('ragged pencil edges', () => {
  it('only kick in when zoomed in far', () => {
    expect(roughAmpAtScale(0.5, 3.78)).toBe(0);
    expect(roughAmpAtScale(0.5, 12)).toBe(0);
    expect(roughAmpAtScale(0.5, 200)).toBeCloseTo(roughAmplitude(0.5));
  });

  it('keeps the outline within width/2 + amplitude of the centreline', () => {
    const e = line([0, 0], [10, 0]);
    const amp = roughAmplitude(0.5);
    const rec = recorder();
    traceRough(rec, e, { width: 0.5, dash: [], amp, pxPerMm: 150, view: bigView, seed: 7 });
    expect(rec.subpaths.length).toBe(1);
    const p = rec.subpaths[0];
    let minD = Infinity;
    let maxD = 0;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < p.length; i += 2) {
      const d = distToSegment({ x: p[i], y: p[i + 1] }, e.a, e.b);
      minD = Math.min(minD, d);
      maxD = Math.max(maxD, d);
      minY = Math.min(minY, p[i + 1]);
      maxY = Math.max(maxY, p[i + 1]);
    }
    expect(maxD).toBeLessThanOrEqual(0.25 + amp + 1e-9);
    expect(minD).toBeGreaterThanOrEqual(0.25 - amp - 1e-9);
    // Both edges are actually ragged, not straight.
    expect(maxY - 0.25).toBeGreaterThan(amp * 0.2);
    expect(-minY - 0.25).toBeGreaterThan(amp * 0.2);
  });

  it('is deterministic, so it does not flicker between frames', () => {
    const e = line([0, 0], [10, 3]);
    const opts = { width: 0.5, dash: [], amp: 0.04, pxPerMm: 120, view: bigView, seed: 42 };
    const a = recorder();
    const b = recorder();
    traceRough(a, e, opts);
    traceRough(b, e, opts);
    expect(a.subpaths).toEqual(b.subpaths);
  });

  it('keeps the visible edge fixed while panning', () => {
    const e = line([0, 0], [40, 0]);
    const opts = { width: 0.5, dash: [], amp: 0.04, pxPerMm: 120, seed: 3 };
    const a = recorder();
    const b = recorder();
    traceRough(a, e, { ...opts, view: { minX: 10, minY: -2, maxX: 20, maxY: 2 } });
    traceRough(b, e, { ...opts, view: { minX: 12.5, minY: -2, maxX: 22.5, maxY: 2 } });
    // Points inside the overlap of both views must coincide.
    const inside = (p: number[]) => {
      const out = new Set<string>();
      for (let i = 0; i < p.length; i += 2) if (p[i] > 13 && p[i] < 19) out.add(`${p[i].toFixed(9)},${p[i + 1].toFixed(9)}`);
      return out;
    };
    const pa = inside(a.subpaths[0]);
    const pb = inside(b.subpaths[0]);
    expect(pa.size).toBeGreaterThan(100);
    expect([...pa].every((k) => pb.has(k))).toBe(true);
  });

  it('builds one outline per dash', () => {
    const e = line([0, 0], [30, 0], 'dashed');
    const w = 0.5;
    const rec = recorder();
    traceRough(rec, e, { width: w, dash: dashArray('dashed', w), amp: 0.04, pxPerMm: 60, view: bigView, seed: 1 });
    // Dash period 15·w = 7.5 mm → four dashes on 30 mm (the last one starts right at 30).
    expect(rec.subpaths.length).toBeGreaterThanOrEqual(4);
    expect(rec.subpaths.length).toBeLessThanOrEqual(5);
  });

  it('only builds the visible part of a long line', () => {
    const e = line([-500, 0], [500, 0]);
    const rec = recorder();
    traceRough(rec, e, { width: 0.5, dash: [], amp: 0.04, pxPerMm: 200, view: { minX: 0, minY: -3, maxX: 5, maxY: 3 }, seed: 1 });
    const p = rec.subpaths.flat();
    expect(p.length / 2).toBeLessThan(5000);
    for (let i = 0; i < p.length; i += 2) {
      expect(p[i]).toBeGreaterThan(-1);
      expect(p[i]).toBeLessThan(6);
    }
  });

  it('handles sharp turns of freehand strokes without leaving the stroke', () => {
    const e: StrokeEntity = {
      kind: 'stroke',
      id: 'zigzag',
      layerId: 'l',
      z: 1,
      style,
      pts: [0, 0, 2, 1, 0, 2, 2, 3],
    };
    const rec = recorder();
    traceRough(rec, e, { width: 0.5, dash: [], amp: 0.04, pxPerMm: 150, view: bigView, seed: 9 });
    const p = rec.subpaths.flat();
    expect(p.every(Number.isFinite)).toBe(true);
    for (let i = 0; i < p.length; i += 2) {
      expect(p[i]).toBeGreaterThan(-0.4);
      expect(p[i]).toBeLessThan(2.4);
    }
  });
});

describe('clipSegment', () => {
  const box = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
  it('clips to the box', () => {
    expect(clipSegment(-10, 5, 20, 5, box)).toEqual([1 / 3, 2 / 3]);
    expect(clipSegment(2, 2, 3, 3, box)).toEqual([0, 1]);
    expect(clipSegment(-5, -5, -1, 20, box)).toBeNull();
  });
});
