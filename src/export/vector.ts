/**
 * A recording stand-in for the canvas 2D context (the subset the annotation and
 * path code uses). Drawing is collected as paths and texts in world mm and can
 * then be written as SVG or PDF.
 */

export type Seg = ['M', number, number] | ['L', number, number] | ['C', number, number, number, number, number, number] | ['Z'];

export interface StrokeStyle {
  color: string;
  alpha: number;
  width: number;
  cap: CanvasLineCap;
  join: CanvasLineJoin;
  dash: number[];
  dashOffset: number;
}

export interface FillStyle {
  color: string;
  alpha: number;
  rule: CanvasFillRule;
}

export interface Clip {
  segs: Seg[];
  rule: CanvasFillRule;
  parent: number | null;
}

export type Item =
  | { kind: 'path'; segs: Seg[]; stroke?: StrokeStyle; fill?: FillStyle; clip: number | null }
  | {
      kind: 'text';
      text: string;
      /** Centre of the baseline, world mm. */
      x: number;
      y: number;
      /** Direction of writing (radians, world, y down). */
      angle: number;
      size: number;
      color: string;
      alpha: number;
      clip: number | null;
    };

type M = [number, number, number, number, number, number];

interface State {
  m: M;
  lineWidth: number;
  lineCap: CanvasLineCap;
  lineJoin: CanvasLineJoin;
  strokeStyle: string;
  fillStyle: string;
  globalAlpha: number;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  dash: number[];
  dashOffset: number;
  clip: number | null;
}

const TAU = Math.PI * 2;

function mul(a: M, b: M): M {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4],
    a[1] * b[4] + a[3] * b[5] + a[5],
  ];
}

function colorString(v: unknown): string {
  return typeof v === 'string' ? v : '#000000';
}

export class VectorRecorder {
  items: Item[] = [];
  clips: Clip[] = [];
  private st: State = {
    m: [1, 0, 0, 1, 0, 0],
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    strokeStyle: '#000',
    fillStyle: '#000',
    globalAlpha: 1,
    font: '10px sans-serif',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    dash: [],
    dashOffset: 0,
    clip: null,
  };
  private stack: State[] = [];
  private path: Seg[] = [];
  private cur: [number, number] | null = null;
  private start: [number, number] | null = null;

  // ---- state -----------------------------------------------------------------------------

  get lineWidth(): number {
    return this.st.lineWidth;
  }
  set lineWidth(v: number) {
    this.st.lineWidth = v;
  }
  get lineCap(): CanvasLineCap {
    return this.st.lineCap;
  }
  set lineCap(v: CanvasLineCap) {
    this.st.lineCap = v;
  }
  get lineJoin(): CanvasLineJoin {
    return this.st.lineJoin;
  }
  set lineJoin(v: CanvasLineJoin) {
    this.st.lineJoin = v;
  }
  get strokeStyle(): string {
    return this.st.strokeStyle;
  }
  set strokeStyle(v: string | CanvasGradient | CanvasPattern) {
    this.st.strokeStyle = colorString(v);
  }
  get fillStyle(): string {
    return this.st.fillStyle;
  }
  set fillStyle(v: string | CanvasGradient | CanvasPattern) {
    this.st.fillStyle = colorString(v);
  }
  get globalAlpha(): number {
    return this.st.globalAlpha;
  }
  set globalAlpha(v: number) {
    this.st.globalAlpha = v;
  }
  get font(): string {
    return this.st.font;
  }
  set font(v: string) {
    this.st.font = v;
  }
  get textAlign(): CanvasTextAlign {
    return this.st.textAlign;
  }
  set textAlign(v: CanvasTextAlign) {
    this.st.textAlign = v;
  }
  get textBaseline(): CanvasTextBaseline {
    return this.st.textBaseline;
  }
  set textBaseline(v: CanvasTextBaseline) {
    this.st.textBaseline = v;
  }
  get lineDashOffset(): number {
    return this.st.dashOffset;
  }
  set lineDashOffset(v: number) {
    this.st.dashOffset = v;
  }

  setLineDash(d: number[]): void {
    this.st.dash = [...d];
  }

  save(): void {
    this.stack.push({ ...this.st, dash: [...this.st.dash] });
  }

  restore(): void {
    const s = this.stack.pop();
    if (s) this.st = s;
  }

  translate(x: number, y: number): void {
    this.st.m = mul(this.st.m, [1, 0, 0, 1, x, y]);
  }

  rotate(a: number): void {
    const c = Math.cos(a);
    const s = Math.sin(a);
    this.st.m = mul(this.st.m, [c, s, -s, c, 0, 0]);
  }

  /** Scale factor of the current transform (uniform transforms only). */
  private get k(): number {
    const m = this.st.m;
    return Math.hypot(m[0], m[1]);
  }

  private tp(x: number, y: number): [number, number] {
    const m = this.st.m;
    return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  }

  // ---- paths -------------------------------------------------------------------------------

  beginPath(): void {
    this.path = [];
    this.cur = null;
    this.start = null;
  }

  moveTo(x: number, y: number): void {
    const p = this.tp(x, y);
    this.path.push(['M', p[0], p[1]]);
    this.cur = p;
    this.start = p;
  }

  lineTo(x: number, y: number): void {
    const p = this.tp(x, y);
    if (!this.cur) {
      this.path.push(['M', p[0], p[1]]);
      this.start = p;
    } else this.path.push(['L', p[0], p[1]]);
    this.cur = p;
  }

  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void {
    const c = this.tp(cx, cy);
    const p = this.tp(x, y);
    const s = this.cur ?? c;
    if (!this.cur) this.path.push(['M', s[0], s[1]]);
    this.path.push(['C', s[0] + ((c[0] - s[0]) * 2) / 3, s[1] + ((c[1] - s[1]) * 2) / 3, p[0] + ((c[0] - p[0]) * 2) / 3, p[1] + ((c[1] - p[1]) * 2) / 3, p[0], p[1]]);
    this.cur = p;
  }

  arc(cx: number, cy: number, r: number, a0: number, a1: number, ccw = false): void {
    let sweep = a1 - a0;
    if (!ccw) {
      if (sweep >= TAU) sweep = TAU;
      else sweep = ((sweep % TAU) + TAU) % TAU;
    } else {
      if (sweep <= -TAU) sweep = -TAU;
      else sweep = -((((-sweep) % TAU) + TAU) % TAU);
    }
    const pt = (a: number) => this.tp(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    const p0 = pt(a0);
    if (!this.cur) {
      this.path.push(['M', p0[0], p0[1]]);
      this.start = p0;
    } else if (Math.hypot(this.cur[0] - p0[0], this.cur[1] - p0[1]) > 1e-9) this.path.push(['L', p0[0], p0[1]]);
    const n = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 2) - 1e-9));
    const d = sweep / n;
    const t = (4 / 3) * Math.tan(d / 4);
    let a = a0;
    for (let i = 0; i < n; i++) {
      const b = a + d;
      const c1 = this.tp(cx + r * (Math.cos(a) - t * Math.sin(a)), cy + r * (Math.sin(a) + t * Math.cos(a)));
      const c2 = this.tp(cx + r * (Math.cos(b) + t * Math.sin(b)), cy + r * (Math.sin(b) - t * Math.cos(b)));
      const e = pt(b);
      this.path.push(['C', c1[0], c1[1], c2[0], c2[1], e[0], e[1]]);
      a = b;
    }
    this.cur = pt(a0 + sweep);
  }

  closePath(): void {
    if (!this.cur) return;
    this.path.push(['Z']);
    this.cur = this.start;
  }

  stroke(): void {
    if (!this.path.length) return;
    const k = this.k;
    this.items.push({
      kind: 'path',
      segs: [...this.path],
      stroke: {
        color: this.st.strokeStyle,
        alpha: this.st.globalAlpha,
        width: this.st.lineWidth * k,
        cap: this.st.lineCap,
        join: this.st.lineJoin,
        dash: this.st.dash.map((v) => v * k),
        dashOffset: this.st.dashOffset * k,
      },
      clip: this.st.clip,
    });
  }

  fill(rule: CanvasFillRule = 'nonzero'): void {
    if (!this.path.length) return;
    this.items.push({ kind: 'path', segs: [...this.path], fill: { color: this.st.fillStyle, alpha: this.st.globalAlpha, rule }, clip: this.st.clip });
  }

  clip(rule: CanvasFillRule = 'nonzero'): void {
    this.clips.push({ segs: [...this.path], rule, parent: this.st.clip });
    this.st.clip = this.clips.length - 1;
  }

  fillText(text: string, x: number, y: number): void {
    const size = (Number(/([\d.]+)px/.exec(this.st.font)?.[1]) || 10) * this.k;
    const m = this.st.m;
    const angle = Math.atan2(m[1], m[0]);
    const k = this.k;
    // Baseline position (the writers centre the text on it).
    let dy = y;
    if (this.st.textBaseline === 'middle') dy = y + (size / k) * 0.36;
    else if (this.st.textBaseline === 'top' || this.st.textBaseline === 'hanging') dy = y + (size / k) * 0.75;
    const p = this.tp(x, dy);
    let px = p[0];
    let py = p[1];
    if (this.st.textAlign !== 'center') {
      // Only centred text is used; shift others so they still land roughly right.
      const w = textWidthMm(text, size) / 2;
      const s = this.st.textAlign === 'right' || this.st.textAlign === 'end' ? -1 : 1;
      px += Math.cos(angle) * w * s;
      py += Math.sin(angle) * w * s;
    }
    this.items.push({ kind: 'text', text, x: px, y: py, angle, size, color: this.st.fillStyle, alpha: this.st.globalAlpha, clip: this.st.clip });
  }

  /** Not supported: pattern fills fall back to the plain colour. */
  createPattern(): null {
    return null;
  }
}

// ---- Helvetica metrics (for PDF text centring) ------------------------------------------------

const HELV: Record<string, number> = {};
{
  const ascii =
    ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~';
  const w = [
    278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278,
    584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944,
    667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500,
    278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
  ];
  [...ascii].forEach((c, i) => (HELV[c] = w[i]));
  Object.assign(HELV, { 'Ø': 778, 'ø': 611, '°': 400, '±': 584, 'µ': 556, 'Ä': 667, 'Ö': 778, 'Ü': 722, 'ä': 556, 'ö': 556, 'ü': 556, 'ß': 611, '×': 584, '²': 333, '³': 333 });
}

/** Width of a text in Helvetica at font size `size` (same unit as size). */
export function textWidthMm(text: string, size: number): number {
  let w = 0;
  for (const c of text) w += HELV[c] ?? 556;
  return (w / 1000) * size;
}

// ---- colours -------------------------------------------------------------------------------

function parseColor(c: string): [number, number, number] {
  const s = c.trim();
  let m = /^#([0-9a-f]{3})$/i.exec(s);
  if (m) return [0, 1, 2].map((i) => parseInt(m![1][i] + m![1][i], 16) / 255) as [number, number, number];
  m = /^#([0-9a-f]{6})/i.exec(s);
  if (m) return [0, 2, 4].map((i) => parseInt(m![1].slice(i, i + 2), 16) / 255) as [number, number, number];
  m = /^rgba?\(([^)]+)\)/i.exec(s);
  if (m) {
    const v = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return [v[0] / 255, v[1] / 255, v[2] / 255];
  }
  return [0, 0, 0];
}

function hex(c: [number, number, number]): string {
  return `#${c.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('')}`;
}

/** Colour with alpha pre-blended onto white (PDF has no plain alpha without extra objects). */
function onWhite(color: string, alpha: number): [number, number, number] {
  const c = parseColor(color);
  return c.map((v) => 1 - alpha * (1 - v)) as [number, number, number];
}

// ---- SVG ---------------------------------------------------------------------------------------

export interface Page {
  minX: number;
  minY: number;
  width: number;
  height: number;
  /** Background colour or null for transparent. */
  background: string | null;
}

const f = (v: number) => {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? '0' : String(r);
};

function svgPath(segs: Seg[]): string {
  return segs
    .map((s) => {
      switch (s[0]) {
        case 'M':
        case 'L':
          return `${s[0]}${f(s[1])} ${f(s[2])}`;
        case 'C':
          return `C${f(s[1])} ${f(s[2])} ${f(s[3])} ${f(s[4])} ${f(s[5])} ${f(s[6])}`;
        case 'Z':
          return 'Z';
      }
    })
    .join('');
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function toSvg(rec: VectorRecorder, page: Page, title = 'Skizze'): string {
  const out: string[] = [];
  out.push(
    `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${f(page.width)}mm" height="${f(page.height)}mm" viewBox="${f(page.minX)} ${f(page.minY)} ${f(page.width)} ${f(page.height)}">`,
    `<title>${esc(title)}</title>`,
  );
  if (rec.clips.length) {
    out.push('<defs>');
    rec.clips.forEach((c, i) => {
      const parent = c.parent !== null ? ` clip-path="url(#c${c.parent})"` : '';
      out.push(`<clipPath id="c${i}"${parent}><path d="${svgPath(c.segs)}" clip-rule="${c.rule}"/></clipPath>`);
    });
    out.push('</defs>');
  }
  if (page.background) out.push(`<rect x="${f(page.minX)}" y="${f(page.minY)}" width="${f(page.width)}" height="${f(page.height)}" fill="${page.background}"/>`);
  for (const it of rec.items) {
    const clip = it.clip !== null ? ` clip-path="url(#c${it.clip})"` : '';
    if (it.kind === 'path') {
      const a: string[] = [`d="${svgPath(it.segs)}"`];
      if (it.fill) {
        a.push(`fill="${hex(parseColor(it.fill.color))}"`);
        if (it.fill.rule === 'evenodd') a.push('fill-rule="evenodd"');
        if (it.fill.alpha < 1) a.push(`fill-opacity="${f(it.fill.alpha)}"`);
      } else a.push('fill="none"');
      if (it.stroke) {
        const s = it.stroke;
        a.push(`stroke="${hex(parseColor(s.color))}"`, `stroke-width="${f(s.width)}"`, `stroke-linecap="${s.cap}"`, `stroke-linejoin="${s.join}"`);
        if (s.dash.length) a.push(`stroke-dasharray="${s.dash.map(f).join(' ')}"`);
        if (s.dash.length && s.dashOffset) a.push(`stroke-dashoffset="${f(s.dashOffset)}"`);
        if (s.alpha < 1) a.push(`stroke-opacity="${f(s.alpha)}"`);
      }
      out.push(`<path ${a.join(' ')}${clip}/>`);
    } else {
      const deg = (it.angle * 180) / Math.PI;
      const op = it.alpha < 1 ? ` fill-opacity="${f(it.alpha)}"` : '';
      out.push(
        `<text transform="translate(${f(it.x)} ${f(it.y)}) rotate(${f(deg)})" font-family="Helvetica, Arial, sans-serif" font-size="${f(it.size)}" text-anchor="middle" fill="${hex(parseColor(it.color))}"${op}${clip}>${esc(it.text)}</text>`,
      );
    }
  }
  out.push('</svg>\n');
  return out.join('\n');
}

// ---- PDF -----------------------------------------------------------------------------------

const PT = 72 / 25.4;

function pdfNum(v: number): string {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? '0' : String(r);
}

function pdfPath(segs: Seg[]): string {
  const o: string[] = [];
  for (const s of segs) {
    if (s[0] === 'M') o.push(`${pdfNum(s[1])} ${pdfNum(s[2])} m`);
    else if (s[0] === 'L') o.push(`${pdfNum(s[1])} ${pdfNum(s[2])} l`);
    else if (s[0] === 'C') o.push(`${s.slice(1).map((v) => pdfNum(v as number)).join(' ')} c`);
    else o.push('h');
  }
  return o.join('\n');
}

/** Text as a WinAnsi PDF string literal. */
function pdfString(text: string): string {
  let out = '(';
  for (const ch of text) {
    let code = ch.codePointAt(0)!;
    if (ch === '⌀') code = 0xd8;
    if (code > 255 || (code >= 0x80 && code < 0xa0)) code = 0x3f; // '?'
    const c = String.fromCharCode(code);
    if (c === '(' || c === ')' || c === '\\') out += `\\${c}`;
    else if (code < 32 || code > 126) out += `\\${code.toString(8).padStart(3, '0')}`;
    else out += c;
  }
  return `${out})`;
}

const CAP = { butt: 0, round: 1, square: 2 } as const;
const JOIN = { miter: 0, round: 1, bevel: 2 } as const;

/** A single-page PDF at 1:1 (world mm = paper mm). Returns the file bytes. */
export function toPdf(rec: VectorRecorder, page: Page, title = 'Skizze'): Uint8Array {
  const c: string[] = [];
  // Page space: origin bottom left, pt. World: mm, y down.
  c.push(`${pdfNum(PT)} 0 0 ${pdfNum(-PT)} ${pdfNum(-page.minX * PT)} ${pdfNum((page.minY + page.height) * PT)} cm`);
  if (page.background) {
    const [r, g, b] = parseColor(page.background);
    c.push(`${pdfNum(r)} ${pdfNum(g)} ${pdfNum(b)} rg`, `${pdfNum(page.minX)} ${pdfNum(page.minY)} ${pdfNum(page.width)} ${pdfNum(page.height)} re f`);
  }
  const clipOps = (id: number | null): string[] => {
    const chain: Clip[] = [];
    for (let i = id; i !== null; i = rec.clips[i].parent) chain.unshift(rec.clips[i]);
    return chain.map((cl) => `${pdfPath(cl.segs)}\n${cl.rule === 'evenodd' ? 'W*' : 'W'} n`);
  };
  for (const it of rec.items) {
    c.push('q', ...clipOps(it.clip));
    if (it.kind === 'path') {
      if (it.fill) {
        const [r, g, b] = onWhite(it.fill.color, it.fill.alpha);
        c.push(`${pdfNum(r)} ${pdfNum(g)} ${pdfNum(b)} rg`, pdfPath(it.segs), it.fill.rule === 'evenodd' ? 'f*' : 'f');
      }
      if (it.stroke) {
        const s = it.stroke;
        const [r, g, b] = onWhite(s.color, s.alpha);
        c.push(
          `${pdfNum(r)} ${pdfNum(g)} ${pdfNum(b)} RG`,
          `${pdfNum(s.width)} w ${CAP[s.cap]} J ${JOIN[s.join]} j`,
          `[${s.dash.map(pdfNum).join(' ')}] ${pdfNum(s.dashOffset)} d`,
          pdfPath(it.segs),
          'S',
        );
      }
    } else {
      const [r, g, b] = onWhite(it.color, it.alpha);
      const w = textWidthMm(it.text, it.size);
      const co = Math.cos(it.angle);
      const si = Math.sin(it.angle);
      // Glyph x → writing direction, glyph y (up) → "above" in world (y down).
      const x0 = it.x - co * (w / 2);
      const y0 = it.y - si * (w / 2);
      c.push(
        `${pdfNum(r)} ${pdfNum(g)} ${pdfNum(b)} rg`,
        'BT',
        `/F1 ${pdfNum(it.size)} Tf`,
        `${pdfNum(co)} ${pdfNum(si)} ${pdfNum(si)} ${pdfNum(-co)} ${pdfNum(x0)} ${pdfNum(y0)} Tm`,
        `${pdfString(it.text)} Tj`,
        'ET',
      );
    }
    c.push('Q');
  }
  const content = c.join('\n');
  const W = page.width * PT;
  const H = page.height * PT;
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pdfNum(W)} ${pdfNum(H)}] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>`,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    `<< /Title ${pdfString(title)} /Producer (Skizzen-CAD) >>`,
  ];
  let pdf = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info ${objs.length} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
  return bytes;
}
