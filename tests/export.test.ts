import { describe, expect, it } from 'vitest';
import { dimText, dimValue, formatMeasure } from '../src/core/annotations';
import type { DimEntity } from '../src/core/types';
import { linearDim } from '../src/tools/dim';
import { textWidthMm, toPdf, toSvg, VectorRecorder } from '../src/export/vector';

const style = { pen: 'ink' as const, width: 0.25, lineType: 'solid' as const, color: null };
const dim = (d: Partial<DimEntity>): DimEntity => ({ kind: 'dim', id: 'd', layerId: 'l', z: 0, style, type: 'lin', p1: { x: 0, y: 0 }, p2: { x: 30, y: 40 }, off: 5, ...d });

describe('dimensions', () => {
  it('measures along the chosen direction', () => {
    expect(dimValue(dim({ dir: 0 }))).toBeCloseTo(30);
    expect(dimValue(dim({ dir: Math.PI / 2 }))).toBeCloseTo(40);
    expect(dimValue(dim({ dir: Math.atan2(40, 30) }))).toBeCloseTo(50);
    expect(dimText(dim({ type: 'dia', p2: { x: 12.5, y: 0 } }))).toBe('Ø25');
    expect(dimText(dim({ type: 'ang', p2: { x: 10, y: 0 }, p3: { x: 0, y: 10 } }))).toBe('90°');
    expect(formatMeasure(42.54)).toBe('42,5');
  });

  it('picks horizontal, vertical or aligned from the pointer', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 30, y: 40 };
    expect(linearDim(a, b, { x: 15, y: -10 }).dir).toBe(0);
    expect(linearDim(a, b, { x: 50, y: 20 }).dir).toBeCloseTo(Math.PI / 2);
    expect(linearDim(a, b, { x: -20, y: 50 }).dir).toBeCloseTo(Math.atan2(40, 30));
    // Offset is the signed distance of the pointer from p1 across the direction.
    expect(linearDim(a, b, { x: 15, y: -10 }).off).toBeCloseTo(-10);
  });
});

describe('vector export', () => {
  it('turns arcs into cubic Béziers on the circle', () => {
    const r = new VectorRecorder();
    r.beginPath();
    r.arc(0, 0, 10, 0, Math.PI * 2);
    r.stroke();
    const it = r.items[0];
    expect(it.kind).toBe('path');
    if (it.kind !== 'path') return;
    const cs = it.segs.filter((s) => s[0] === 'C');
    expect(cs.length).toBe(4);
    for (const s of cs) expect(Math.hypot(s[5] as number, s[6] as number)).toBeCloseTo(10);
  });

  it('applies transforms to paths and texts', () => {
    const r = new VectorRecorder();
    r.save();
    r.translate(10, 5);
    r.rotate(Math.PI / 2);
    r.font = '3.5px Helvetica';
    r.textAlign = 'center';
    r.fillText('A', 0, 0);
    r.beginPath();
    r.moveTo(0, 0);
    r.lineTo(1, 0);
    r.stroke();
    r.restore();
    const t = r.items[0];
    expect(t.kind === 'text' && [t.x, t.y, t.size]).toEqual([10, 5, 3.5]);
    const p = r.items[1];
    expect(p.kind === 'path' && p.segs[1][1]).toBeCloseTo(10);
    expect(p.kind === 'path' && p.segs[1][2]).toBeCloseTo(6);
  });

  it('writes SVG in mm and a well-formed PDF', () => {
    const r = new VectorRecorder();
    r.strokeStyle = '#123456';
    r.lineWidth = 0.5;
    r.setLineDash([1, 2]);
    r.beginPath();
    r.moveTo(0, 0);
    r.lineTo(20, 10);
    r.stroke();
    r.fillStyle = '#000';
    r.font = '3.5px x';
    r.textAlign = 'center';
    r.fillText('Ø12 (A)', 5, 5);
    const page = { minX: -5, minY: -5, width: 30, height: 20, background: '#ffffff' };
    const svg = toSvg(r, page);
    expect(svg).toContain('width="30mm"');
    expect(svg).toContain('stroke-dasharray="1 2"');
    expect(svg).toContain('Ø12 (A)');
    const pdf = new TextDecoder('latin1').decode(toPdf(r, page));
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf).toContain('\\330');
    expect(pdf).toContain('\\(A\\)');
    // xref offsets point at the objects.
    const xref = Number(/startxref\n(\d+)/.exec(pdf)![1]);
    expect(pdf.slice(xref, xref + 4)).toBe('xref');
    const offs = [...pdf.slice(xref).matchAll(/^(\d{10}) 00000 n/gm)].map((m) => Number(m[1]));
    offs.forEach((o, i) => expect(pdf.slice(o, o + 7)).toBe(`${i + 1} 0 obj`));
  });

  it('measures Helvetica text', () => {
    expect(textWidthMm('10', 10)).toBeCloseTo(11.12);
  });
});
