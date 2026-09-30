import { dist, type Vec } from './geom';
import type { Annotation, DatumEntity, DimEntity, GpsSymbol, GtolEntity } from './types';

/**
 * Layout of annotations as plain geometry (world mm): thin lines and arcs, filled
 * polygons (arrowheads, datum triangles), rectangles and texts. Rendering, hit
 * testing, bounds and export all use the same layout.
 */

/** Text height (DIN 406: 3.5 mm) and derived sizes. */
export const TEXT_H = 3.5;
const ARROW_L = 2.5;
const ARROW_HALF = 0.42;
const EXT_OVER = 2;
const TEXT_GAP = 0.9;
const FRAME_H = 7;
const CELL = 7;

export interface AnnoText {
  p: Vec;
  /** Reading direction in radians (world). */
  angle: number;
  text: string;
  size: number;
  /** 'bottom': p is the middle of the baseline side; 'middle': p is the text centre. */
  baseline: 'bottom' | 'middle';
}

export interface AnnoArc {
  c: Vec;
  r: number;
  start: number;
  sweep: number;
}

export interface AnnoLayout {
  lines: [Vec, Vec][];
  arcs: AnnoArc[];
  fills: Vec[][];
  texts: AnnoText[];
}

const add = (a: Vec, b: Vec, k = 1): Vec => ({ x: a.x + b.x * k, y: a.y + b.y * k });
const unit = (v: Vec): Vec => {
  const l = Math.hypot(v.x, v.y) || 1;
  return { x: v.x / l, y: v.y / l };
};
const perp = (v: Vec): Vec => ({ x: -v.y, y: v.x });

/** Rough text width for layout (proportional sans). */
export function textWidth(text: string, size = TEXT_H): number {
  let w = 0;
  for (const ch of text) w += (/[.,:;'|il1]/.test(ch) ? 0.32 : /[°]/.test(ch) ? 0.4 : /[MWØ]/.test(ch) ? 0.8 : 0.6) * size;
  return w;
}

/** "42,5" / "25" – one decimal, trailing zero dropped. */
export function formatMeasure(v: number): string {
  const r = Math.round(v * 10) / 10;
  return (Number.isInteger(r) ? r.toFixed(0) : r.toFixed(1)).replace('.', ',');
}

function arrow(tip: Vec, dir: Vec): Vec[] {
  // dir: direction the arrow points to (towards the tip).
  const d = unit(dir);
  const n = perp(d);
  const base = add(tip, d, -ARROW_L);
  return [tip, add(base, n, ARROW_HALF), add(base, n, -ARROW_HALF)];
}

/** Reading direction for text along direction u: readable from below or from the right. */
function readable(u: Vec): Vec {
  return u.x < -1e-9 || (Math.abs(u.x) <= 1e-9 && u.y > 0) ? { x: -u.x, y: -u.y } : u;
}

/** Side "above" text written along r (y points down in world). */
function above(r: Vec): Vec {
  return { x: r.y, y: -r.x };
}

export function dimValue(e: DimEntity): number {
  switch (e.type) {
    case 'lin': {
      const u = { x: Math.cos(e.dir ?? 0), y: Math.sin(e.dir ?? 0) };
      return Math.abs((e.p2.x - e.p1.x) * u.x + (e.p2.y - e.p1.y) * u.y);
    }
    case 'dia':
      return 2 * dist(e.p1, e.p2);
    case 'rad':
      return dist(e.p1, e.p2);
    case 'ang': {
      const a1 = Math.atan2(e.p2.y - e.p1.y, e.p2.x - e.p1.x);
      const a2 = Math.atan2((e.p3 ?? e.p2).y - e.p1.y, (e.p3 ?? e.p2).x - e.p1.x);
      return (Math.abs(Math.atan2(Math.sin(a2 - a1), Math.cos(a2 - a1))) * 180) / Math.PI;
    }
  }
}

export function dimText(e: DimEntity): string {
  if (e.text) return e.text;
  const v = dimValue(e);
  switch (e.type) {
    case 'lin':
      return formatMeasure(v);
    case 'dia':
      return `Ø${formatMeasure(v)}`;
    case 'rad':
      return `R${formatMeasure(v)}`;
    case 'ang':
      return `${formatMeasure(v)}°`;
  }
}

function layoutDim(e: DimEntity): AnnoLayout {
  const L: AnnoLayout = { lines: [], arcs: [], fills: [], texts: [] };
  const text = dimText(e);
  if (e.type === 'lin') {
    const u = { x: Math.cos(e.dir ?? 0), y: Math.sin(e.dir ?? 0) };
    const n = perp(u);
    const s1 = e.p1.x * n.x + e.p1.y * n.y;
    const s2 = e.p2.x * n.x + e.p2.y * n.y;
    const base = s1 + e.off;
    const d1 = add(e.p1, n, base - s1);
    const d2 = add(e.p2, n, base - s2);
    // Extension lines run from the feature past the dimension line.
    for (const [p, d, s] of [
      [e.p1, d1, s1],
      [e.p2, d2, s2],
    ] as [Vec, Vec, number][]) {
      const side = Math.sign(base - s) || 1;
      L.lines.push([p, add(d, n, side * EXT_OVER)]);
    }
    L.lines.push([d1, d2]);
    const len = dist(d1, d2);
    const along = unit({ x: d2.x - d1.x, y: d2.y - d1.y });
    if (len > 2 * ARROW_L + 0.5) {
      L.fills.push(arrow(d1, { x: -along.x, y: -along.y }), arrow(d2, along));
    } else {
      // Short: arrows outside pointing in.
      L.fills.push(arrow(d1, along), arrow(d2, { x: -along.x, y: -along.y }));
      L.lines.push([d1, add(d1, along, -ARROW_L * 2)], [d2, add(d2, along, ARROW_L * 2)]);
    }
    const r = readable(len > 1e-9 ? along : u);
    const m = { x: (d1.x + d2.x) / 2, y: (d1.y + d2.y) / 2 };
    L.texts.push({ p: add(m, above(r), TEXT_GAP), angle: Math.atan2(r.y, r.x), text, size: TEXT_H, baseline: 'bottom' });
  } else if (e.type === 'dia' || e.type === 'rad') {
    const c = e.p1;
    const rad = dist(c, e.p2);
    const u = unit({ x: e.p2.x - c.x, y: e.p2.y - c.y });
    const tip = add(c, u, rad);
    const from = e.type === 'dia' ? add(c, u, -rad) : c;
    L.lines.push([from, tip]);
    L.fills.push(arrow(tip, u));
    if (e.type === 'dia') L.fills.push(arrow(from, { x: -u.x, y: -u.y }));
    const r = readable(u);
    const m = e.type === 'dia' ? add(c, u, rad * 0.5) : add(c, u, rad * 0.5);
    L.texts.push({ p: add(m, above(r), TEXT_GAP), angle: Math.atan2(r.y, r.x), text, size: TEXT_H, baseline: 'bottom' });
  } else {
    const v = e.p1;
    const p3 = e.p3 ?? e.p2;
    const a1 = Math.atan2(e.p2.y - v.y, e.p2.x - v.x);
    const a2 = Math.atan2(p3.y - v.y, p3.x - v.x);
    const sweep = Math.atan2(Math.sin(a2 - a1), Math.cos(a2 - a1));
    const R = Math.max(e.off, 1);
    L.arcs.push({ c: v, r: R, start: a1, sweep });
    // Extension lines where the legs end before the arc.
    for (const [p, a] of [
      [e.p2, a1],
      [p3, a2],
    ] as [Vec, number][]) {
      const lp = dist(v, p);
      const dir = { x: Math.cos(a), y: Math.sin(a) };
      if (lp < R) L.lines.push([add(v, dir, lp), add(v, dir, R + EXT_OVER)]);
    }
    const sgn = Math.sign(sweep) || 1;
    const end1 = add(v, { x: Math.cos(a1), y: Math.sin(a1) }, R);
    const end2 = add(v, { x: Math.cos(a1 + sweep), y: Math.sin(a1 + sweep) }, R);
    // Arrow directions: tangents pointing outwards at both ends.
    const t1 = { x: sgn * Math.sin(a1), y: -sgn * Math.cos(a1) };
    const t2 = { x: -sgn * Math.sin(a1 + sweep), y: sgn * Math.cos(a1 + sweep) };
    L.fills.push(arrow(end1, t1), arrow(end2, t2));
    const am = a1 + sweep / 2;
    const mid = add(v, { x: Math.cos(am), y: Math.sin(am) }, R);
    const tangent = { x: -Math.sin(am), y: Math.cos(am) };
    const r = readable(tangent);
    const out = { x: Math.cos(am), y: Math.sin(am) };
    // Put the text on the outer side of the arc.
    const up = above(r);
    const side = up.x * out.x + up.y * out.y >= 0 ? 1 : -1;
    L.texts.push({
      p: add(mid, out, side > 0 ? TEXT_GAP : TEXT_GAP + TEXT_H),
      angle: Math.atan2(r.y, r.x),
      text,
      size: TEXT_H,
      baseline: 'bottom',
    });
  }
  return L;
}

function rect(x: number, y: number, w: number, h: number): [Vec, Vec][] {
  const a = { x, y };
  const b = { x: x + w, y };
  const c = { x: x + w, y: y + h };
  const d = { x, y: y + h };
  return [
    [a, b],
    [b, c],
    [c, d],
    [d, a],
  ];
}

function layoutDatum(e: DatumEntity): AnnoLayout {
  const L: AnnoLayout = { lines: [], arcs: [], fills: [], texts: [] };
  const d = unit({ x: e.p.x - e.at.x, y: e.p.y - e.at.y });
  const n = perp(d);
  const hTri = 2.6;
  const halfBase = 1.6;
  L.fills.push([add(e.at, n, halfBase), add(e.at, n, -halfBase), add(e.at, d, hTri)]);
  const half = FRAME_H / 2;
  // Leader from the triangle to the nearest point of the frame.
  const box = { minX: e.p.x - half, maxX: e.p.x + half, minY: e.p.y - half, maxY: e.p.y + half };
  const apex = add(e.at, d, hTri);
  const toFrame = clampToBoxEdge(apex, e.p, box);
  if (dist(apex, toFrame) > 0.2) L.lines.push([apex, toFrame]);
  L.lines.push(...rect(e.p.x - half, e.p.y - half, FRAME_H, FRAME_H));
  L.texts.push({ p: e.p, angle: 0, text: e.letter, size: TEXT_H, baseline: 'middle' });
  return L;
}

/** Point where the segment from outside point q to box centre c crosses the box edge. */
function clampToBoxEdge(q: Vec, c: Vec, box: { minX: number; maxX: number; minY: number; maxY: number }): Vec {
  const dx = q.x - c.x;
  const dy = q.y - c.y;
  const hx = (box.maxX - box.minX) / 2;
  const hy = (box.maxY - box.minY) / 2;
  const t = Math.min(dx !== 0 ? hx / Math.abs(dx) : Infinity, dy !== 0 ? hy / Math.abs(dy) : Infinity);
  if (t >= 1) return q;
  return { x: c.x + dx * t, y: c.y + dy * t };
}

/** Width of the cells of a tolerance frame. */
export function gtolCells(e: GtolEntity): number[] {
  const value = (e.dia ? 'Ø' : '') + e.value;
  return [CELL, Math.max(10, textWidth(value) + 3), ...e.datums.map((d) => Math.max(CELL, textWidth(d) + 3))];
}

function layoutGtol(e: GtolEntity): AnnoLayout {
  const L: AnnoLayout = { lines: [], arcs: [], fills: [], texts: [] };
  const cells = gtolCells(e);
  const total = cells.reduce((a, b) => a + b, 0);
  const x0 = e.p.x;
  const y0 = e.p.y - FRAME_H / 2;
  L.lines.push(...rect(x0, y0, total, FRAME_H));
  let x = x0;
  cells.forEach((w, i) => {
    if (i > 0) L.lines.push([{ x, y: y0 }, { x, y: y0 + FRAME_H }]);
    const c = { x: x + w / 2, y: e.p.y };
    if (i === 0) addSymbol(L, e.sym, c);
    else if (i === 1) L.texts.push({ p: c, angle: 0, text: (e.dia ? 'Ø' : '') + e.value, size: TEXT_H, baseline: 'middle' });
    else L.texts.push({ p: c, angle: 0, text: e.datums[i - 2], size: TEXT_H, baseline: 'middle' });
    x += w;
  });
  // Leader from the nearest frame side to the feature, arrow at the feature.
  const box = { minX: x0, maxX: x0 + total, minY: y0, maxY: y0 + FRAME_H };
  let start: Vec;
  if (e.at.x < box.minX) start = { x: box.minX, y: e.p.y };
  else if (e.at.x > box.maxX) start = { x: box.maxX, y: e.p.y };
  else start = { x: x0 + cells[0] / 2, y: e.at.y < box.minY ? box.minY : box.maxY };
  if (dist(start, e.at) > ARROW_L) {
    L.lines.push([start, e.at]);
    L.fills.push(arrow(e.at, { x: e.at.x - start.x, y: e.at.y - start.y }));
  }
  return L;
}

/** ISO 1101 characteristic symbols drawn with lines and arcs, centred at c (height ≈ 3.5 mm). */
function addSymbol(L: AnnoLayout, sym: GpsSymbol, c: Vec): void {
  const s = TEXT_H / 2; // half size
  const P = (x: number, y: number): Vec => ({ x: c.x + x * s, y: c.y + y * s });
  const line = (x1: number, y1: number, x2: number, y2: number) => L.lines.push([P(x1, y1), P(x2, y2)]);
  const circle = (r: number, x = 0, y = 0) => L.arcs.push({ c: P(x, y), r: r * s, start: 0, sweep: Math.PI * 2 });
  const tip = (x: number, y: number, dx: number, dy: number) => L.fills.push(arrowSmall(P(x, y), { x: dx, y: dy }));
  switch (sym) {
    case 'straightness':
      line(-1, 0, 1, 0);
      break;
    case 'flatness':
      line(-0.7, -0.5, 1, -0.5);
      line(1, -0.5, 0.7, 0.5);
      line(0.7, 0.5, -1, 0.5);
      line(-1, 0.5, -0.7, -0.5);
      break;
    case 'circularity':
      circle(0.9);
      break;
    case 'cylindricity':
      // Circle with two parallel slanted tangents.
      circle(0.6);
      line(0.25, 1.1, 0.88, -0.7);
      line(-0.88, 0.7, -0.25, -1.1);
      break;
    case 'profileLine':
      L.arcs.push({ c: P(0, 0.4), r: 0.9 * s, start: Math.PI, sweep: Math.PI });
      break;
    case 'profileSurface':
      L.arcs.push({ c: P(0, 0.4), r: 0.9 * s, start: Math.PI, sweep: Math.PI });
      line(-0.9, 0.4, 0.9, 0.4);
      break;
    case 'parallelism':
      line(-0.8, 0.8, -0.1, -0.8);
      line(0.1, 0.8, 0.8, -0.8);
      break;
    case 'perpendicularity':
      line(-0.9, 0.8, 0.9, 0.8);
      line(0, 0.8, 0, -0.9);
      break;
    case 'angularity':
      line(-0.9, 0.8, 0.9, 0.8);
      line(-0.9, 0.8, 0.7, -0.6);
      break;
    case 'position':
      circle(0.6);
      line(-1, 0, 1, 0);
      line(0, -1, 0, 1);
      break;
    case 'concentricity':
      circle(0.9);
      circle(0.45);
      break;
    case 'symmetry':
      line(-1, 0, 1, 0);
      line(-0.6, -0.55, 0.6, -0.55);
      line(-0.6, 0.55, 0.6, 0.55);
      break;
    case 'runout':
      line(-0.6, 0.9, 0.5, -0.7);
      tip(0.55, -0.8, 0.6, -1);
      break;
    case 'totalRunout':
      line(-0.9, 0.9, 0.9, 0.9);
      line(-0.9, 0.9, -0.2, -0.8);
      line(0.1, 0.9, 0.8, -0.8);
      tip(-0.15, -0.9, 0.4, -1);
      tip(0.85, -0.9, 0.4, -1);
      break;
  }
}

/** Layout of a characteristic symbol alone, centred at the origin (for buttons). */
export function symbolLayout(sym: GpsSymbol): AnnoLayout {
  const L: AnnoLayout = { lines: [], arcs: [], fills: [], texts: [] };
  addSymbol(L, sym, { x: 0, y: 0 });
  return L;
}

export const GPS_NAMES: Record<GpsSymbol, string> = {
  straightness: 'Geradheit',
  flatness: 'Ebenheit',
  circularity: 'Rundheit',
  cylindricity: 'Zylinderform',
  profileLine: 'Linienform',
  profileSurface: 'Flächenform',
  parallelism: 'Parallelität',
  perpendicularity: 'Rechtwinkligkeit',
  angularity: 'Neigung',
  position: 'Position',
  concentricity: 'Koaxialität',
  symmetry: 'Symmetrie',
  runout: 'Lauf',
  totalRunout: 'Gesamtlauf',
};

/** Characteristics that refer to datums (the others are form tolerances). */
export const GPS_NEEDS_DATUM: Record<GpsSymbol, boolean> = {
  straightness: false,
  flatness: false,
  circularity: false,
  cylindricity: false,
  profileLine: false,
  profileSurface: false,
  parallelism: true,
  perpendicularity: true,
  angularity: true,
  position: true,
  concentricity: true,
  symmetry: true,
  runout: true,
  totalRunout: true,
};

function arrowSmall(tip: Vec, dir: Vec): Vec[] {
  const d = unit(dir);
  const n = perp(d);
  const base = add(tip, d, -1.1);
  return [tip, add(base, n, 0.35), add(base, n, -0.35)];
}

const layoutCache = new WeakMap<Annotation, AnnoLayout>();

/** Layout of a dimension or GPS symbol (hatches have none). */
export function layoutAnno(e: DimEntity | DatumEntity | GtolEntity): AnnoLayout {
  let l = layoutCache.get(e);
  if (!l) {
    l = e.kind === 'dim' ? layoutDim(e) : e.kind === 'datum' ? layoutDatum(e) : layoutGtol(e);
    layoutCache.set(e, l);
  }
  return l;
}

/** Corners of a text box (for bounds and hit tests). */
export function textCorners(t: AnnoText): Vec[] {
  const w = textWidth(t.text, t.size);
  const r = { x: Math.cos(t.angle), y: Math.sin(t.angle) };
  const up = above(r);
  const origin = t.baseline === 'bottom' ? add(t.p, r, -w / 2) : add(add(t.p, r, -w / 2), up, -t.size / 2);
  const a = origin;
  const b = add(origin, r, w);
  return [a, b, add(b, up, t.size), add(a, up, t.size)];
}

/** All outline segments of a layout (texts as boxes, arcs flattened) – for hit tests and bounds. */
export function layoutSegments(l: AnnoLayout): [Vec, Vec][] {
  const out: [Vec, Vec][] = [...l.lines];
  for (const a of l.arcs) {
    const n = Math.max(8, Math.ceil(Math.abs(a.sweep) / 0.2));
    let prev = add(a.c, { x: Math.cos(a.start), y: Math.sin(a.start) }, a.r);
    for (let k = 1; k <= n; k++) {
      const t = a.start + (a.sweep * k) / n;
      const q = add(a.c, { x: Math.cos(t), y: Math.sin(t) }, a.r);
      out.push([prev, q]);
      prev = q;
    }
  }
  for (const f of l.fills) for (let i = 0; i < f.length; i++) out.push([f[i], f[(i + 1) % f.length]]);
  for (const t of l.texts) {
    const c = textCorners(t);
    for (let i = 0; i < 4; i++) out.push([c[i], c[(i + 1) % 4]]);
  }
  return out;
}
