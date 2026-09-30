/**
 * Paper grain for graphite strokes.
 *
 * The grain is anchored to the paper (world coordinates), so it moves and scales
 * exactly with the drawing instead of swimming over it while zooming. To keep it
 * crisp at every zoom level it works like a mip-map: two octaves of the same noise
 * (one texel = `texel` mm and one twice as large) are blended by how far the zoom
 * has progressed through the current octave. When the fine octave has grown to the
 * size of the coarse one, the roles swap without any visible jump.
 */

const BASE = 256;
const TILE = BASE * 2;
/** Smallest on-screen size (device px) of a grain texel; smaller would shimmer. */
const MIN_TEXEL_PX = 1.6;

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
type AnyCtx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

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
  const n = BASE / cell;
  const grid = new Float32Array(n * n);
  for (let i = 0; i < grid.length; i++) grid[i] = rand();
  const out = new Float32Array(BASE * BASE);
  const smooth = (t: number) => t * t * (3 - 2 * t);
  for (let y = 0; y < BASE; y++) {
    const gy = y / cell;
    const y0 = Math.floor(gy) % n;
    const y1 = (y0 + 1) % n;
    const fy = smooth(gy - Math.floor(gy));
    for (let x = 0; x < BASE; x++) {
      const gx = x / cell;
      const x0 = Math.floor(gx) % n;
      const x1 = (x0 + 1) % n;
      const fx = smooth(gx - Math.floor(gx));
      const a = grid[y0 * n + x0] + (grid[y0 * n + x1] - grid[y0 * n + x0]) * fx;
      const b = grid[y1 * n + x0] + (grid[y1 * n + x1] - grid[y1 * n + x0]) * fx;
      out[y * BASE + x] = a + (b - a) * fy;
    }
  }
  return out;
}

/** Graphite coverage per texel (0–255): mostly dense with paper-tooth gaps and specks. */
function alphaMap(): Uint8ClampedArray {
  const rand = mulberry32(1337);
  const coarse = valueNoise(rand, 16);
  const fine = valueNoise(rand, 4);
  const out = new Uint8ClampedArray(BASE * BASE);
  for (let i = 0; i < out.length; i++) {
    const speck = rand();
    let v = 0.25 * coarse[i] + 0.35 * fine[i] + 0.4 * speck;
    // Spread a bit wider than it looks: blending two octaves softens the contrast again.
    v = 0.42 + 0.78 * v;
    if (speck > 0.93) v *= 0.55;
    out[i] = Math.round(Math.min(1, v) * 255);
  }
  return out;
}

function makeCanvas(w: number, h = w): AnyCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function ctx2d(c: AnyCanvas): AnyCtx {
  const ctx = c.getContext('2d') as AnyCtx | null;
  if (!ctx) throw new Error('Canvas 2D wird nicht unterstützt');
  return ctx;
}

/**
 * Grain level for a zoom: `texel` is the world size (mm) of one fine texel, a power
 * of two chosen so it covers [MIN, 2·MIN) device px; `fine` ∈ [0,1) is the weight of
 * that fine octave (the coarse octave gets 1 − fine).
 */
export function grainLevel(pxPerMm: number, dpr: number): { texel: number; fine: number } {
  const dev = pxPerMm * dpr;
  const texel = Math.pow(2, Math.ceil(Math.log2(MIN_TEXEL_PX / dev)));
  const fine = Math.min(1, Math.max(0, Math.log2((texel * dev) / MIN_TEXEL_PX)));
  return { texel, fine };
}

class GrainLod {
  /** World size (mm) of one fine texel of the current tile. */
  texel = 1;
  private base: AnyCanvas | null = null;
  private blend: AnyCanvas | null = null;
  private blendKey = NaN;
  private colored = new Map<string, AnyCanvas>();

  /** Base tile with a one-texel wrap-around border, so scaled draws blend across tile edges. */
  private baseTile(): AnyCanvas {
    if (this.base) return this.base;
    const size = BASE + 2;
    const c = makeCanvas(size);
    const ctx = ctx2d(c);
    const img = ctx.createImageData(size, size);
    const a = alphaMap();
    for (let y = 0; y < size; y++) {
      const sy = (y - 1 + BASE) % BASE;
      for (let x = 0; x < size; x++) {
        const sx = (x - 1 + BASE) % BASE;
        img.data[(y * size + x) * 4 + 3] = a[sy * BASE + sx]; // black with coverage as alpha
      }
    }
    ctx.putImageData(img, 0, 0);
    this.base = c;
    return c;
  }

  /** Prepare the tile for the current zoom; cheap when nothing changed. */
  update(pxPerMm: number, dpr: number): void {
    const { texel, fine } = grainLevel(pxPerMm, dpr);
    this.texel = texel;
    const key = Math.round(fine * 32) / 32;
    if (key === this.blendKey && this.blend) return;
    this.blendKey = key;
    const base = this.baseTile();
    const c = this.blend ?? (this.blend = makeCanvas(TILE));
    const ctx = ctx2d(c);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, TILE, TILE);
    ctx.imageSmoothingEnabled = true;
    // Fine octave: the base tile 1:1, repeated 2×2.
    ctx.globalAlpha = key;
    for (const x of [0, BASE]) for (const y of [0, BASE]) ctx.drawImage(base, 1, 1, BASE, BASE, x, y, BASE, BASE);
    // Coarse octave: the same tile at twice the size; 'lighter' adds coverage linearly.
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 1 - key;
    ctx.drawImage(base, 1, 1, BASE, BASE, 0, 0, TILE, TILE);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    this.colored.clear();
  }

  /** The current tile in the given colour (coverage as alpha). */
  tile(color: string): AnyCanvas {
    let t = this.colored.get(color);
    if (t) return t;
    t = makeCanvas(TILE);
    const ctx = ctx2d(t);
    if (this.blend) ctx.drawImage(this.blend, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, TILE, TILE);
    this.colored.set(color, t);
    return t;
  }
}

/** Shared by all painters, which always render at the same zoom. */
export const grain = new GrainLod();
