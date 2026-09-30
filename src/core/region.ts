import { simplifyFlat } from './geom';

/**
 * Raster helpers for finding the closed area around a point (hatch fill).
 * The mask marks barrier pixels (drawn lines, thickened so small gaps close);
 * the area is flood-filled from the seed and its outline traced back to polygons.
 */

export type FillResult = { ok: true; filled: Uint8Array } | { ok: false; reason: 'onLine' | 'open' };

/** 4-connected flood fill of non-barrier pixels from (sx, sy). Fails if it reaches the border. */
export function floodFill(barrier: Uint8Array, w: number, h: number, sx: number, sy: number): FillResult {
  if (sx < 0 || sy < 0 || sx >= w || sy >= h) return { ok: false, reason: 'open' };
  const start = sy * w + sx;
  if (barrier[start]) return { ok: false, reason: 'onLine' };
  const filled = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let top = 0;
  stack[top++] = start;
  filled[start] = 1;
  while (top > 0) {
    const i = stack[--top];
    const x = i % w;
    const y = (i - x) / w;
    if (x === 0 || y === 0 || x === w - 1 || y === h - 1) return { ok: false, reason: 'open' };
    const nb = [i - 1, i + 1, i - w, i + w];
    for (const j of nb) {
      if (!filled[j] && !barrier[j]) {
        filled[j] = 1;
        stack[top++] = j;
      }
    }
  }
  return { ok: true, filled };
}

/** Grow the filled area by r pixels (square), so its edge reaches the middle of the lines. */
export function dilate(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  if (r <= 0) return mask;
  // Separable: horizontal then vertical running maximum.
  const tmp = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    let last = -Infinity;
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x]) last = x;
      if (x - last <= r) tmp[y * w + x] = 1;
    }
    last = Infinity;
    for (let x = w - 1; x >= 0; x--) {
      if (mask[y * w + x]) last = x;
      if (last - x <= r) tmp[y * w + x] = 1;
    }
  }
  const out = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) {
    let last = -Infinity;
    for (let y = 0; y < h; y++) {
      if (tmp[y * w + x]) last = y;
      if (y - last <= r) out[y * w + x] = 1;
    }
    last = Infinity;
    for (let y = h - 1; y >= 0; y--) {
      if (tmp[y * w + x]) last = y;
      if (last - y <= r) out[y * w + x] = 1;
    }
  }
  return out;
}

/**
 * Outlines of the set pixels as closed loops of pixel-corner coordinates
 * (flat [x0, y0, …]), simplified with tolerance `tol` pixels. Outer outlines and
 * holes both come out; fill them with the even-odd rule.
 */
export function traceLoops(mask: Uint8Array, w: number, h: number, tol = 0.7): number[][] {
  const W = w + 1;
  const next = new Map<number, number[]>();
  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1;
  const edge = (x0: number, y0: number, x1: number, y1: number) => {
    const k = y0 * W + x0;
    const v = y1 * W + x1;
    const list = next.get(k);
    if (list) list.push(v);
    else next.set(k, [v]);
  };
  // Directed boundary edges with the inside on the right (clockwise on screen).
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!at(x, y)) continue;
      if (!at(x, y - 1)) edge(x, y, x + 1, y);
      if (!at(x + 1, y)) edge(x + 1, y, x + 1, y + 1);
      if (!at(x, y + 1)) edge(x + 1, y + 1, x, y + 1);
      if (!at(x - 1, y)) edge(x, y + 1, x, y);
    }
  }
  const loops: number[][] = [];
  for (const [startKey, outs] of next) {
    while (outs.length) {
      const pts: number[] = [];
      let k = startKey;
      let guard = 0;
      do {
        pts.push(k % W, Math.floor(k / W));
        const list = next.get(k);
        if (!list || !list.length) break;
        k = list.pop()!;
      } while (k !== startKey && ++guard < 4_000_000);
      if (pts.length >= 6) {
        pts.push(pts[0], pts[1]);
        const simple = simplifyFlat(pts, tol);
        simple.length -= 2; // drop the repeated start
        if (simple.length >= 6) loops.push(simple);
      }
    }
  }
  return loops;
}

/** Signed area of a loop (positive = clockwise on screen with y down). */
export function loopArea(loop: number[]): number {
  let a = 0;
  const n = loop.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) a += (loop[j * 2] - loop[i * 2]) * (loop[j * 2 + 1] + loop[i * 2 + 1]);
  return a / 2;
}
