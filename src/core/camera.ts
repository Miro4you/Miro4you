import { DEG, type Box, type Vec } from './geom';
import type { ViewState } from './types';

export const MIN_SCALE = 0.05; // px per mm
export const MAX_SCALE = 400;
/** View rotation snaps to multiples of this angle when within ROT_SNAP_TOL. */
const ROT_SNAP_STEP = 45 * DEG;
const ROT_SNAP_TOL = 4 * DEG;

/**
 * World (mm) ↔ screen (CSS px) transform: screen = R(rot) · scale · world + t.
 */
export class Camera {
  scale = 4;
  rot = 0;
  tx = 0;
  ty = 0;

  get state(): ViewState {
    return { scale: this.scale, rot: this.rot, tx: this.tx, ty: this.ty };
  }

  set state(v: ViewState) {
    this.scale = clamp(v.scale, MIN_SCALE, MAX_SCALE);
    this.rot = v.rot;
    this.tx = v.tx;
    this.ty = v.ty;
  }

  /** Canvas matrix components (a, b, c, d, e, f) for world → screen. */
  matrix(): [number, number, number, number, number, number] {
    const c = Math.cos(this.rot) * this.scale;
    const s = Math.sin(this.rot) * this.scale;
    return [c, s, -s, c, this.tx, this.ty];
  }

  toScreen(p: Vec): Vec {
    const c = Math.cos(this.rot) * this.scale;
    const s = Math.sin(this.rot) * this.scale;
    return { x: c * p.x - s * p.y + this.tx, y: s * p.x + c * p.y + this.ty };
  }

  toWorld(p: Vec): Vec {
    const x = p.x - this.tx;
    const y = p.y - this.ty;
    const c = Math.cos(this.rot) / this.scale;
    const s = Math.sin(this.rot) / this.scale;
    return { x: c * x + s * y, y: -s * x + c * y };
  }

  /** Converts a screen-space length to world units. */
  px(n: number): number {
    return n / this.scale;
  }

  panBy(dx: number, dy: number): void {
    this.tx += dx;
    this.ty += dy;
  }

  zoomAt(screen: Vec, factor: number): void {
    const w = this.toWorld(screen);
    this.scale = clamp(this.scale * factor, MIN_SCALE, MAX_SCALE);
    this.anchor(w, screen);
  }

  /** Rotate the view around a screen point. */
  rotateAt(screen: Vec, rot: number): void {
    const w = this.toWorld(screen);
    this.rot = rot;
    this.anchor(w, screen);
  }

  /** Translate so that world point w appears at screen point s. */
  anchor(w: Vec, s: Vec): void {
    this.tx = 0;
    this.ty = 0;
    const p = this.toScreen(w);
    this.tx = s.x - p.x;
    this.ty = s.y - p.y;
  }

  /**
   * Two-finger gesture: keep the world points w1, w2 (grabbed at gesture start)
   * under the current finger positions s1, s2 as well as possible.
   * `baseRot` is the view rotation at gesture start, `rotate` enables rotation.
   */
  gesture(w1: Vec, w2: Vec, s1: Vec, s2: Vec, rotate: boolean, baseRot: number): void {
    const wd = { x: w2.x - w1.x, y: w2.y - w1.y };
    const sd = { x: s2.x - s1.x, y: s2.y - s1.y };
    const wl = Math.hypot(wd.x, wd.y);
    const sl = Math.hypot(sd.x, sd.y);
    if (wl > 1e-9 && sl > 1e-3) this.scale = clamp(sl / wl, MIN_SCALE, MAX_SCALE);
    if (rotate && wl > 1e-9 && sl > 1e-3) {
      this.rot = snapRotation(Math.atan2(sd.y, sd.x) - Math.atan2(wd.y, wd.x));
    } else {
      this.rot = baseRot;
    }
    const wm = { x: (w1.x + w2.x) / 2, y: (w1.y + w2.y) / 2 };
    const sm = { x: (s1.x + s2.x) / 2, y: (s1.y + s2.y) / 2 };
    this.anchor(wm, sm);
  }

  /** World-space bounding box of the screen rectangle (handles rotation). */
  visibleBox(width: number, height: number): Box {
    const corners = [
      this.toWorld({ x: 0, y: 0 }),
      this.toWorld({ x: width, y: 0 }),
      this.toWorld({ x: 0, y: height }),
      this.toWorld({ x: width, y: height }),
    ];
    return {
      minX: Math.min(...corners.map((c) => c.x)),
      minY: Math.min(...corners.map((c) => c.y)),
      maxX: Math.max(...corners.map((c) => c.x)),
      maxY: Math.max(...corners.map((c) => c.y)),
    };
  }

  /** Fit a world box into the screen with a margin (keeps rotation). */
  fit(box: Box, width: number, height: number, margin = 60): void {
    const bw = Math.max(box.maxX - box.minX, 1);
    const bh = Math.max(box.maxY - box.minY, 1);
    // Extent of the rotated box on screen per unit scale.
    const c = Math.abs(Math.cos(this.rot));
    const s = Math.abs(Math.sin(this.rot));
    const ew = bw * c + bh * s;
    const eh = bw * s + bh * c;
    const sc = Math.min((width - 2 * margin) / ew, (height - 2 * margin) / eh);
    this.scale = clamp(sc, MIN_SCALE, MAX_SCALE);
    this.anchor({ x: (box.minX + box.maxX) / 2, y: (box.minY + box.maxY) / 2 }, { x: width / 2, y: height / 2 });
  }
}

/** Snap a rotation (radians) to 0°/45°/90°… when close; returns it normalised to (-π, π]. */
export function snapRotation(r: number): number {
  let a = Math.atan2(Math.sin(r), Math.cos(r));
  const k = Math.round(a / ROT_SNAP_STEP);
  if (Math.abs(a - k * ROT_SNAP_STEP) < ROT_SNAP_TOL) a = k * ROT_SNAP_STEP;
  return a;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
