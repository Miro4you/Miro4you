/** Basic 2D geometry. World units are millimetres, y points down (like the screen). */

export interface Vec {
  x: number;
  y: number;
}

export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export const vec = (x: number, y: number): Vec => ({ x, y });
export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec, s: number): Vec => ({ x: a.x * s, y: a.y * s });
export const dot = (a: Vec, b: Vec): number => a.x * b.x + a.y * b.y;
export const cross = (a: Vec, b: Vec): number => a.x * b.y - a.y * b.x;
export const len = (a: Vec): number => Math.hypot(a.x, a.y);
export const dist = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y);
export const lerp = (a: Vec, b: Vec, t: number): Vec => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
export const mid = (a: Vec, b: Vec): Vec => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export const DEG = Math.PI / 180;

/** Normalise an angle in radians to [0, 2π). */
export function normAngle(a: number): number {
  const t = a % (2 * Math.PI);
  return t < 0 ? t + 2 * Math.PI : t;
}

/**
 * Drawing angle of the direction a→b in degrees, counter-clockwise with 0° pointing right,
 * as a draughtsman reads it on paper (world y points down, hence the sign flip).
 */
export function drawingAngleDeg(a: Vec, b: Vec): number {
  const deg = normAngle(Math.atan2(-(b.y - a.y), b.x - a.x)) / DEG;
  return deg >= 359.9995 ? 0 : deg;
}

/** Point at distance `length` from `origin` in drawing angle `deg` (see drawingAngleDeg). */
export function polar(origin: Vec, deg: number, length: number): Vec {
  const r = deg * DEG;
  return { x: origin.x + Math.cos(r) * length, y: origin.y - Math.sin(r) * length };
}

/** Closest point on segment ab to p, with its parameter t ∈ [0,1]. */
export function closestOnSegment(p: Vec, a: Vec, b: Vec): { point: Vec; t: number } {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  if (l2 === 0) return { point: { ...a }, t: 0 };
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
  return { point: lerp(a, b, t), t };
}

export function distToSegment(p: Vec, a: Vec, b: Vec): number {
  return dist(p, closestOnSegment(p, a, b).point);
}

/** Intersection point of segments ab and cd, or null if they do not cross. */
export function segmentIntersection(a: Vec, b: Vec, c: Vec, d: Vec): Vec | null {
  const r = sub(b, a);
  const s = sub(d, c);
  const denom = cross(r, s);
  if (Math.abs(denom) < 1e-12) return null; // parallel or collinear
  const ca = sub(c, a);
  const t = cross(ca, s) / denom;
  const u = cross(ca, r) / denom;
  const eps = 1e-9;
  if (t < -eps || t > 1 + eps || u < -eps || u > 1 + eps) return null;
  return lerp(a, b, t);
}

export function emptyBox(): Box {
  return { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
}

export function boxAddPoint(bx: Box, x: number, y: number): Box {
  if (x < bx.minX) bx.minX = x;
  if (y < bx.minY) bx.minY = y;
  if (x > bx.maxX) bx.maxX = x;
  if (y > bx.maxY) bx.maxY = y;
  return bx;
}

export function boxExpand(bx: Box, m: number): Box {
  return { minX: bx.minX - m, minY: bx.minY - m, maxX: bx.maxX + m, maxY: bx.maxY + m };
}

export function boxUnion(a: Box, b: Box): Box {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

export function boxesIntersect(a: Box, b: Box): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

export function boxContainsPoint(bx: Box, p: Vec, margin = 0): boolean {
  return p.x >= bx.minX - margin && p.x <= bx.maxX + margin && p.y >= bx.minY - margin && p.y <= bx.maxY + margin;
}

export function isEmptyBox(bx: Box): boolean {
  return !(bx.minX <= bx.maxX && bx.minY <= bx.maxY);
}

/**
 * Ramer–Douglas–Peucker simplification on a flat [x0,y0,x1,y1,…] array.
 * Keeps the first and last point; `tol` is in the same units as the coordinates.
 */
export function simplifyFlat(pts: number[], tol: number): number[] {
  const n = pts.length / 2;
  if (n <= 2) return pts.slice();
  const keep = new Uint8Array(n);
  keep[0] = 1;
  keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  const tol2 = tol * tol;
  while (stack.length) {
    const [i0, i1] = stack.pop()!;
    const ax = pts[i0 * 2], ay = pts[i0 * 2 + 1];
    const bx = pts[i1 * 2], by = pts[i1 * 2 + 1];
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy;
    let maxD = -1;
    let idx = -1;
    for (let i = i0 + 1; i < i1; i++) {
      const px = pts[i * 2], py = pts[i * 2 + 1];
      let d2: number;
      if (l2 === 0) {
        d2 = (px - ax) ** 2 + (py - ay) ** 2;
      } else {
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
        d2 = (px - (ax + t * dx)) ** 2 + (py - (ay + t * dy)) ** 2;
      }
      if (d2 > maxD) {
        maxD = d2;
        idx = i;
      }
    }
    if (idx >= 0 && maxD > tol2) {
      keep[idx] = 1;
      stack.push([i0, idx], [idx, i1]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[i * 2], pts[i * 2 + 1]);
  return out;
}
