import { describe, expect, it } from 'vitest';
import { SketchDocument } from '../src/core/document';
import { drawingAngleDeg } from '../src/core/geom';
import { findSnap, snapAngle, softSnapAngle } from '../src/core/snap';
import type { LineEntity } from '../src/core/types';

const all = { end: true, mid: true, int: true };

function add(doc: SketchDocument, id: string, a: [number, number], b: [number, number]): void {
  const e: LineEntity = {
    kind: 'line',
    id,
    layerId: doc.activeLayerId,
    z: doc.allocZ(),
    style: { pen: 'ink', width: 0.35, lineType: 'solid', color: null },
    a: { x: a[0], y: a[1] },
    b: { x: b[0], y: b[1] },
  };
  doc.add(e);
}

describe('snapping', () => {
  it('snaps to endpoints, midpoints and intersections within the radius', () => {
    const doc = new SketchDocument();
    add(doc, 'h', [0, 0], [20, 0]);
    add(doc, 'v', [5, -10], [5, 10]);
    expect(findSnap(doc, { x: 19.6, y: 0.3 }, 1, all)).toEqual({ p: { x: 20, y: 0 }, kind: 'end' });
    expect(findSnap(doc, { x: 10.2, y: 0.2 }, 1, all)).toEqual({ p: { x: 10, y: 0 }, kind: 'mid' });
    const hit = findSnap(doc, { x: 5.3, y: 0.2 }, 1, all);
    expect(hit?.kind).toBe('int');
    expect(hit?.p.x).toBeCloseTo(5);
    expect(findSnap(doc, { x: 14, y: 3 }, 1, all)).toBeNull();
  });

  it('prefers endpoints over nearly equally close midpoints', () => {
    const doc = new SketchDocument();
    add(doc, 'a', [0, 0], [2, 0]); // midpoint at 1
    add(doc, 'b', [1.3, 0], [1.3, 5]); // endpoint at 1.3
    expect(findSnap(doc, { x: 1.14, y: 0 }, 1, all)?.kind).toBe('end');
  });

  it('ignores hidden layers and excluded entities', () => {
    const doc = new SketchDocument();
    add(doc, 'a', [0, 0], [10, 0]);
    expect(findSnap(doc, { x: 0.1, y: 0 }, 1, { ...all, exclude: new Set(['a']) })).toBeNull();
    doc.patchLayerView(doc.activeLayerId, { visible: false });
    expect(findSnap(doc, { x: 0.1, y: 0 }, 1, all)).toBeNull();
  });

  it('rounds angles to 5° steps keeping the length', () => {
    const s = { x: 0, y: 0 };
    const p = snapAngle(s, { x: 10, y: -3.4 }, 5); // ≈ 18.8°
    expect(drawingAngleDeg(s, p)).toBeCloseTo(20);
    expect(Math.hypot(p.x, p.y)).toBeCloseTo(Math.hypot(10, 3.4));
  });
});

describe('soft angle snap', () => {
  const s = { x: 0, y: 0 };
  const at = (deg: number) => ({ x: 50 * Math.cos((deg * Math.PI) / 180), y: -50 * Math.sin((deg * Math.PI) / 180) });

  it('settles onto 0°, 45° and 90° within the tolerance', () => {
    expect(drawingAngleDeg(s, softSnapAngle(s, at(0.8), 1))).toBeCloseTo(0);
    expect(drawingAngleDeg(s, softSnapAngle(s, at(359.3), 1))).toBeCloseTo(0);
    expect(drawingAngleDeg(s, softSnapAngle(s, at(44.2), 1))).toBeCloseTo(45);
    expect(drawingAngleDeg(s, softSnapAngle(s, at(90.9), 1))).toBeCloseTo(90);
  });

  it('leaves every other direction untouched', () => {
    const p = at(1.5);
    expect(softSnapAngle(s, p, 1)).toEqual(p);
    expect(drawingAngleDeg(s, softSnapAngle(s, at(37), 1))).toBeCloseTo(37);
  });
});
