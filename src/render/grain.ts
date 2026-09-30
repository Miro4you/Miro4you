/**
 * Paper-grain texture for graphite strokes: the pen colour with per-pixel alpha
 * variation, used as a canvas pattern.
 */

const SIZE = 256;
let alphaMap: Uint8ClampedArray | null = null;
const cache = new Map<string, HTMLCanvasElement | OffscreenCanvas>();

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tileable value noise at a given cell size. */
function valueNoise(rand: () => number, cell: number): Float32Array {
  const n = SIZE / cell;
  const grid = new Float32Array(n * n);
  for (let i = 0; i < grid.length; i++) grid[i] = rand();
  const out = new Float32Array(SIZE * SIZE);
  const smooth = (t: number) => t * t * (3 - 2 * t);
  for (let y = 0; y < SIZE; y++) {
    const gy = y / cell;
    const y0 = Math.floor(gy) % n;
    const y1 = (y0 + 1) % n;
    const fy = smooth(gy - Math.floor(gy));
    for (let x = 0; x < SIZE; x++) {
      const gx = x / cell;
      const x0 = Math.floor(gx) % n;
      const x1 = (x0 + 1) % n;
      const fx = smooth(gx - Math.floor(gx));
      const a = grid[y0 * n + x0] + (grid[y0 * n + x1] - grid[y0 * n + x0]) * fx;
      const b = grid[y1 * n + x0] + (grid[y1 * n + x1] - grid[y1 * n + x0]) * fx;
      out[y * SIZE + x] = a + (b - a) * fy;
    }
  }
  return out;
}

function getAlphaMap(): Uint8ClampedArray {
  if (alphaMap) return alphaMap;
  const rand = mulberry32(1337);
  const coarse = valueNoise(rand, 16);
  const fine = valueNoise(rand, 4);
  alphaMap = new Uint8ClampedArray(SIZE * SIZE);
  for (let i = 0; i < alphaMap.length; i++) {
    const speck = rand();
    let v = 0.25 * coarse[i] + 0.35 * fine[i] + 0.4 * speck;
    // Paper tooth: bright valleys where graphite doesn't reach.
    v = 0.5 + 0.62 * v;
    if (speck > 0.93) v *= 0.55;
    alphaMap[i] = Math.round(Math.min(1, v) * 255);
  }
  return alphaMap;
}

function parseColor(color: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return [66, 69, 76];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function makeCanvas(): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(SIZE, SIZE);
  const c = document.createElement('canvas');
  c.width = SIZE;
  c.height = SIZE;
  return c;
}

export function grainTile(color: string): HTMLCanvasElement | OffscreenCanvas {
  let tile = cache.get(color);
  if (tile) return tile;
  tile = makeCanvas();
  const ctx = tile.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (ctx) {
    const img = ctx.createImageData(SIZE, SIZE);
    const [r, g, b] = parseColor(color);
    const alpha = getAlphaMap();
    for (let i = 0; i < alpha.length; i++) {
      img.data[i * 4] = r;
      img.data[i * 4 + 1] = g;
      img.data[i * 4 + 2] = b;
      img.data[i * 4 + 3] = alpha[i];
    }
    ctx.putImageData(img, 0, 0);
  }
  cache.set(color, tile);
  return tile;
}
