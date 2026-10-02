import { describe, expect, it } from 'vitest';
import { partGeometry, PARTS, partLabel, type PartKind, type PartSpec } from '../src/core/parts';

const ext = (spec: PartSpec) => {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of partGeometry(spec)) {
    if (p.s === 'center') continue;
    const pts = p.t === 'line' ? [p.a, p.b] : [{ x: p.c.x - p.r, y: p.c.y - p.r }, { x: p.c.x + p.r, y: p.c.y + p.r }];
    for (const q of pts) (minX = Math.min(minX, q.x)), (maxX = Math.max(maxX, q.x)), (minY = Math.min(minY, q.y)), (maxY = Math.max(maxY, q.y));
  }
  return { w: maxX - minX, h: maxY - minY, minX, maxX };
};

describe('standard parts', () => {
  it('draws a socket head cap screw M8×30 to size', () => {
    const e = ext({ kind: 'socketScrew', size: 'M8', view: 'side', length: 30 });
    expect(e.minX).toBeCloseTo(-8); // head height k = 8
    expect(e.maxX).toBeCloseTo(30);
    expect(e.h).toBeCloseTo(13); // head diameter dk = 13
    const top = ext({ kind: 'socketScrew', size: 'M8', view: 'top', length: 30 });
    expect(top.w).toBeCloseTo(13);
  });

  it('draws a bearing 6204 as 20×47×14', () => {
    const e = ext({ kind: 'bearing', size: '6204', view: 'side', length: 0 });
    expect(e.w).toBeCloseTo(14);
    expect(e.h).toBeCloseTo(47);
    expect(ext({ kind: 'bearing', size: '6204', view: 'top', length: 0 }).w).toBeCloseTo(47);
  });

  it('draws a tapped hole with a 3/4 thread circle', () => {
    const prims = partGeometry({ kind: 'tapped', size: 'M6', view: 'top', length: 9 });
    const arc = prims.find((p) => p.t === 'arc');
    expect(arc && arc.t === 'arc' && arc.r).toBeCloseTo(3);
    expect(arc && arc.t === 'arc' && arc.sweep).toBeGreaterThan(Math.PI * 1.4);
  });

  it('builds every part in every view without NaN', () => {
    for (const k of Object.keys(PARTS) as PartKind[]) {
      const info = PARTS[k];
      for (const size of info.sizes)
        for (const view of info.views) {
          const spec: PartSpec = { kind: k, size, view, length: info.length?.def(size) ?? 0 };
          const prims = partGeometry(spec);
          expect(prims.length).toBeGreaterThan(0);
          expect(JSON.stringify(prims)).not.toContain('null');
          expect(partLabel(spec)).toContain(info.name);
        }
    }
  });
});
