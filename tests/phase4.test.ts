import { describe, expect, it } from 'vitest';
import { layoutAnno, paperSize, scaleText, sheetBox, textWidth } from '../src/core/annotations';
import { reflection, transformEntity } from '../src/core/transform';
import type { LineEntity, SheetEntity, TextEntity } from '../src/core/types';
import { findCorner, makeFillet } from '../src/tools/fillet';

const style = { pen: 'ink' as const, width: 0.5, lineType: 'solid' as const, color: null };
const line = (id: string, ax: number, ay: number, bx: number, by: number): LineEntity => ({ kind: 'line', id, layerId: 'l', z: 0, style, a: { x: ax, y: ay }, b: { x: bx, y: by } });

describe('fillet', () => {
  it('rounds an L corner with tangent points at distance r', () => {
    const h = line('h', 0, 0, 50, 0);
    const v = line('v', 0, 0, 0, 30);
    const f = findCorner([h, v], { x: 2, y: 2 }, 10)!;
    expect(f.v).toEqual({ x: 0, y: 0 });
    const r = makeFillet(f, 5);
    if (typeof r === 'string') throw new Error(r);
    expect([r.l1.a, r.l1.b].map((p) => Math.round(p.x * 1e6) / 1e6).sort((a, b) => a - b)).toEqual([5, 50]);
    expect([r.l2.a, r.l2.b].map((p) => Math.round(p.y * 1e6) / 1e6).sort((a, b) => a - b)).toEqual([5, 30]);
    expect(r.arc!.c.x).toBeCloseTo(5);
    expect(r.arc!.c.y).toBeCloseTo(5);
    expect(Math.abs(r.arc!.sweep)).toBeCloseTo(Math.PI / 2);
  });

  it('closes a gap sharply with radius 0 and picks the tapped quadrant of a cross', () => {
    const h = line('h', -20, 0, -5, 0);
    const v = line('v', 0, 5, 0, 20);
    const f = findCorner([h, v], { x: -3, y: 3 }, 20)!;
    const r = makeFillet(f, 0);
    if (typeof r === 'string') throw new Error(r);
    expect(r.arc).toBeNull();
    expect([r.l1.a.x, r.l1.b.x].sort((a, b) => a - b)).toEqual([-20, 0]);
    const x1 = line('x1', -20, 0, 20, 0);
    const x2 = line('x2', 0, -20, 0, 20);
    const g = findCorner([x1, x2], { x: 3, y: -3 }, 20)!;
    expect(g.u1.x * 1 + g.u2.x * 1).toBeGreaterThan(0);
    expect(g.u1.y + g.u2.y).toBeLessThan(0);
  });

  it('refuses radii that do not fit', () => {
    const f = findCorner([line('h', 0, 0, 4, 0), line('v', 0, 0, 0, 30)], { x: 1, y: 1 }, 10)!;
    expect(makeFillet(f, 10)).toBe('Radius zu groß für diese Ecke');
  });
});

describe('sheets and text', () => {
  const sheet: SheetEntity = {
    kind: 'sheet',
    id: 's',
    layerId: 'l',
    z: 0,
    style,
    at: { x: 0, y: 0 },
    format: 'A4',
    landscape: true,
    scale: 2,
    fields: { title: 'Welle', number: 'Z-1', material: 'S235', drawnBy: 'FH', date: '1.10.2026', company: '' },
  };

  it('sizes sheets by format, orientation and scale', () => {
    expect(paperSize('A3', false)).toEqual([297, 420]);
    expect(sheetBox(sheet)).toEqual({ minX: 0, minY: 0, maxX: 594, maxY: 420 });
    expect(scaleText(2)).toBe('1:2');
    expect(scaleText(0.5)).toBe('2:1');
  });

  it('lays out the title block with the fields', () => {
    const texts = layoutAnno(sheet).texts.map((t) => t.text);
    expect(texts).toContain('Welle');
    expect(texts).toContain('1:2');
    expect(texts).toContain('Benennung');
  });

  it('keeps mirrored text readable', () => {
    const t: TextEntity = { kind: 'text', id: 't', layerId: 'l', z: 0, style, at: { x: 10, y: 0 }, text: 'AB', size: 5, angle: 0 };
    const m = transformEntity(t, reflection({ x: 0, y: -1 }, { x: 0, y: 1 }));
    expect(Math.abs(Math.cos(m.angle))).toBeCloseTo(1);
    expect(Math.cos(m.angle)).toBeCloseTo(1);
    expect(m.at.x).toBeCloseTo(-10 - textWidth('AB', 5));
  });
});
