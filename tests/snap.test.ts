import { describe, expect, it } from 'vitest';
import { SketchDocument } from '../src/core/document';
import { drawingAngleDeg } from '../src/core/geom';
import { findSnap, snapAngle } from '../src/core/snap';
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
