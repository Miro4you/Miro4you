import type { App } from '../app';
import { geomBox, insideHatch, project } from '../core/curves';
import { boxesIntersect, boxExpand, emptyBox, boxAddPoint, simplifyFlat, type Box, type Vec } from '../core/geom';
import { INK_WIDTHS, PENCIL_WIDTHS } from '../core/pens';
import { dilate, floodFill, traceLoops } from '../core/region';
import { isAnnotation, type Entity, type HatchEntity } from '../core/types';
import { traceEntity } from '../render/paths';
import type { Tool, ToolEvent } from './tool';

/** Longest side of the raster used to find the area (CSS px are scaled down beyond this). */
const MAX_RASTER = 2400;

/** Lines that bound areas: everything except annotations and centre/axis lines. */
function isBoundary(e: Entity): boolean {
  if (isAnnotation(e)) return false;
  if (e.kind === 'line' && e.axis) return false;
  return e.style.lineType !== 'dashdot' && e.style.lineType !== 'dashdotdot';
}

export type RegionResult = { ok: true; loops: number[][] } | { ok: false; reason: 'onLine' | 'open' };

/**
 * The closed area around a world point, found on a raster of the current view:
 * boundary lines are drawn thickened by the gap tolerance (so gaps up to `gap` mm
 * close), the free space around the point is flood-filled, grown back to the line
 * centres, traced and snapped onto the nearby lines.
 */
export function findRegion(app: App, world: Vec, gap: number): RegionResult {
  const cam = app.cam;
  const k = Math.min(1, MAX_RASTER / Math.max(app.width, app.height, 1));
  const w = Math.max(8, Math.ceil(app.width * k));
  const h = Math.max(8, Math.ceil(app.height * k));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return { ok: false, reason: 'open' };
  const [a, b, c, d, e, f] = cam.matrix();
  ctx.setTransform(a * k, b * k, c * k, d * k, e * k, f * k);
  const pxPerMm = cam.scale * k;
  const view = boxExpand(cam.visibleBox(app.width, app.height), gap);
  const bounds: Entity[] = [];
  ctx.strokeStyle = '#000';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // At least 2 raster px so a line never leaks diagonally.
  const minW = 2 / pxPerMm;
  let maxHalf = 0;
  for (const ent of app.doc.visibleEntities()) {
    if (!isBoundary(ent) || !boxesIntersect(geomBox(ent), view)) continue;
    bounds.push(ent);
    const lw = Math.max(ent.style.width + gap, minW);
    maxHalf = Math.max(maxHalf, lw / 2);
    ctx.lineWidth = lw;
    ctx.beginPath();
    traceEntity(ctx, ent);
    ctx.stroke();
  }
  const img = ctx.getImageData(0, 0, w, h).data;
  const barrier = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) barrier[i] = img[i * 4 + 3] > 96 ? 1 : 0;

  const s = cam.toScreen(world);
  const fill = floodFill(barrier, w, h, Math.floor(s.x * k), Math.floor(s.y * k));
  if (!fill.ok) return fill;
  // Grow back to about the line centres (the barrier half width minus a little).
  const grow = Math.max(0, Math.round((gap / 2 + 0.1) * pxPerMm));
  const area = dilate(fill.filled, w, h, grow);
  const raw = traceLoops(area, w, h, 0);

  const snapTol = 2.5 / pxPerMm + 0.05;
  const loops: number[][] = [];
  for (const loop of raw) {
    let lb: Box = emptyBox();
    const pts: number[] = [];
    for (let i = 0; i < loop.length; i += 2) {
      const p = cam.toWorld({ x: loop[i] / k, y: loop[i + 1] / k });
      pts.push(p.x, p.y);
      lb = boxAddPoint(lb, p.x, p.y);
    }
    const near = bounds.filter((ent) => boxesIntersect(boxExpand(geomBox(ent), snapTol), lb));
    for (let i = 0; i < pts.length; i += 2) {
      const p = { x: pts[i], y: pts[i + 1] };
      let best: Vec | null = null;
      let bd = snapTol + maxHalf;
      for (const ent of near) {
        const r = project(ent, p);
        if (r.d < bd) {
          bd = r.d;
          best = r.point;
        }
      }
      if (best && bd <= snapTol + (maxHalf - gap / 2)) {
        pts[i] = best.x;
        pts[i + 1] = best.y;
      }
    }
    pts.push(pts[0], pts[1]);
    const simple = simplifyFlat(pts, Math.max(0.01, 0.3 / pxPerMm));
    simple.length -= 2;
    if (simple.length >= 6) loops.push(simple.map((v) => Math.round(v * 1000) / 1000));
  }
  return loops.length ? { ok: true, loops } : { ok: false, reason: 'open' };
}

/**
 * Hatch fill: tap inside a closed area. Tapping an existing hatch gives it the
 * current pattern and spacing instead.
 */
export class HatchTool implements Tool {
  readonly id = 'hatch';
  private pressed: Vec | null = null;

  constructor(private app: App) {}

  get busy(): boolean {
    return this.pressed !== null;
  }

  down(ev: ToolEvent): void {
    this.pressed = ev.screen;
  }

  move(): void {}

  up(ev: ToolEvent): void {
    const start = this.pressed;
    this.pressed = null;
    if (!start || Math.hypot(ev.screen.x - start.x, ev.screen.y - start.y) > 12) return;
    this.fillAt(ev.world);
  }

  /** Hatch the area around a world point. */
  fillAt(world: Vec): boolean {
    const app = this.app;
    const set = app.settings;
    const existing = [...app.doc.visibleEntities(false)]
      .reverse()
      .find((e): e is HatchEntity => e.kind === 'hatch' && insideHatch(e.loops, world));
    if (existing) {
      if (existing.pattern !== set.hatchPattern || existing.spacing !== set.hatchSpacing) {
        app.doc.update({ ...existing, pattern: set.hatchPattern, spacing: set.hatchSpacing });
      } else app.toast('Fläche ist schon schraffiert');
      return true;
    }
    if (!app.ensureDrawableLayer()) return false;
    const r = findRegion(app, world, set.hatchGap);
    if (!r.ok) {
      app.toast(
        r.reason === 'onLine'
          ? 'Bitte in eine Fläche tippen, nicht auf eine Linie'
          : 'Fläche nicht geschlossen – Lücke schließen oder herauszoomen, bis sie ganz sichtbar ist',
      );
      return false;
    }
    const width = app.style.pen === 'pencil' ? PENCIL_WIDTHS[0] : INK_WIDTHS[1];
    const e = app.newEntity<HatchEntity>({ kind: 'hatch', loops: r.loops, pattern: set.hatchPattern, angle: 0, spacing: set.hatchSpacing }, 'H');
    app.addDrawn({ ...e, style: { ...e.style, width, lineType: 'solid' } });
    return true;
  }

  cancel(): void {
    this.pressed = null;
  }

  hover(): void {}

  reset(): void {
    this.pressed = null;
  }

  overlay(): void {}
}
