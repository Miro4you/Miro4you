import { Camera } from './core/camera';
import { project } from './core/curves';
import { entityBox, newId, SketchDocument } from './core/document';
import { boxUnion, drawingAngleDeg, dist, emptyBox, isEmptyBox, type Vec } from './core/geom';
import { DEFAULT_STYLE } from './core/pens';
import { findSnap, snapAngle, softSnapAngle, type AngleMode, type SnapHit } from './core/snap';
import { mirrorGroup, transformEntity, type Affine } from './core/transform';
import type { Entity, LineEntity, Style } from './core/types';
import { ACCENT, drawMirrorToggle, formatAngle, formatLength } from './render/overlay';
import { Painter } from './render/painter';
import { SceneRenderer } from './render/scene';
import { idbGet, idbSet, loadPref, savePref } from './storage/idb';
import { ArcTool } from './tools/arc';
import { CircleTool } from './tools/circle';
import { DeleteTool } from './tools/delete';
import { EraserTool } from './tools/eraser';
import { FreehandTool } from './tools/freehand';
import { LineTool } from './tools/line';
import { SelectTool } from './tools/select';
import type { PointerKind, Tool } from './tools/tool';
import { TrimTool } from './tools/trim';

export type ToolId = 'select' | 'freehand' | 'line' | 'circle' | 'arc' | 'delete' | 'trim' | 'erase';

export interface Settings {
  grid: boolean;
  /** Endpoint/midpoint/intersection snapping. */
  snap: boolean;
  angleMode: AngleMode;
  /** Correction handles on the most recent line or circle. */
  handles: boolean;
  /** Draw with the finger (otherwise one finger pans). */
  fingerDraws: boolean;
  /** Two-finger rotation of the view. */
  rotate: boolean;
  /** New circles get a centre-line cross. */
  centerMarks: boolean;
  /** Arc tool: 'auto' = tangential at line/arc ends, else centre first; 'center' = always centre first. */
  arcMode: 'auto' | 'center';
}

export const ANGLE_STEP = 5;
/** With the angle snap off, lines still settle onto 0°/45°/90°… when this close (degrees). */
export const SOFT_ANGLE_TOL = 1;
/** CSS px per mm at 100 % zoom (96 dpi). */
export const MM_PX = 96 / 25.4;
const SNAP_PX: Record<PointerKind, number> = { pen: 12, mouse: 10, touch: 20 };
const HANDLE_PX: Record<PointerKind, number> = { pen: 16, mouse: 12, touch: 24 };
/** How close (CSS px) the pointer must be to pick an entity. */
const HIT_PX: Record<PointerKind, number> = { pen: 10, mouse: 8, touch: 16 };
const AUTOSAVE_KEY = 'current';

const DEFAULT_SETTINGS: Settings = {
  grid: true,
  snap: true,
  angleMode: 'snap',
  handles: true,
  fingerDraws: false,
  rotate: true,
  centerMarks: true,
  arcMode: 'auto',
};

interface Widget {
  p: Vec;
  r: number;
  onTap: () => void;
}

/** Central application state and render loop. */
export class App {
  readonly doc = new SketchDocument();
  readonly cam = new Camera();
  settings: Settings = loadPref('settings', DEFAULT_SETTINGS);
  style: Style = loadPref('style', DEFAULT_STYLE);
  toolId: ToolId;
  readonly tools: Record<ToolId, Tool>;
  /** Selected entity ids (only used by the selection tool). */
  selection = new Set<string>();
  /** Set by the input controller (Alt key / finger held while drawing with the pen). */
  snapSuspended = false;

  width = 0;
  height = 0;
  dpr = 1;

  private scene: SceneRenderer;
  private overlayCtx: CanvasRenderingContext2D;
  private overlayPainter: Painter;
  private sceneDirty = true;
  private overlayDirty = true;
  private frameRequested = false;
  private uiListeners = new Set<() => void>();
  private viewListeners = new Set<() => void>();
  private viewDirty = false;
  private toastFn: (msg: string) => void = () => {};
  private saveTimer: number | undefined;
  private loaded = false;
  private widgets: Widget[] = [];
  private mirrorCache: { version: number; list: Affine[] } | null = null;

  constructor(
    private sceneCanvas: HTMLCanvasElement,
    private overlayCanvas: HTMLCanvasElement,
  ) {
    this.scene = new SceneRenderer(sceneCanvas);
    const octx = overlayCanvas.getContext('2d');
    if (!octx) throw new Error('Canvas 2D wird nicht unterstützt');
    this.overlayCtx = octx;
    this.overlayPainter = new Painter(octx);
    this.tools = {
      select: new SelectTool(this),
      freehand: new FreehandTool(this),
      line: new LineTool(this),
      circle: new CircleTool(this),
      arc: new ArcTool(this),
      delete: new DeleteTool(this),
      trim: new TrimTool(this),
      erase: new EraserTool(this),
    };
    const savedTool = loadPref<{ id: ToolId }>('tool', { id: 'line' }).id;
    this.toolId = savedTool in this.tools ? savedTool : 'line';

    this.doc.onChange(() => {
      this.sceneDirty = true;
      this.overlayDirty = true;
      this.scheduleFrame();
      this.emit();
      this.scheduleSave();
    });
  }

  get tool(): Tool {
    return this.tools[this.toolId];
  }

  // ---- lifecycle ------------------------------------------------------------

  async load(): Promise<void> {
    const saved = await idbGet<unknown>(AUTOSAVE_KEY);
    let viewRestored = false;
    if (saved) {
      try {
        const view = this.doc.loadFile(saved).view;
        if (view) {
          this.cam.state = view;
          viewRestored = true;
        }
      } catch (err) {
        console.warn('Autosave konnte nicht geladen werden', err);
        this.doc.reset();
      }
    }
    if (!viewRestored) this.resetView();
    this.loaded = true;
    this.viewChanged();
    this.emit();
  }

  resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (w === this.width && h === this.height && dpr === this.dpr) return;
    // Keep the view centre stable across rotations of the device.
    if (this.width > 0) this.cam.panBy((w - this.width) / 2, (h - this.height) / 2);
    this.width = w;
    this.height = h;
    this.dpr = dpr;
    for (const c of [this.sceneCanvas, this.overlayCanvas]) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      c.style.width = `${w}px`;
      c.style.height = `${h}px`;
    }
    this.viewChanged();
  }

  // ---- UI plumbing ----------------------------------------------------------

  onUiChange(fn: () => void): void {
    this.uiListeners.add(fn);
  }

  emit(): void {
    for (const fn of this.uiListeners) fn();
  }

  /** Called once per frame after the view (pan/zoom/rotation) changed. */
  onViewChange(fn: () => void): void {
    this.viewListeners.add(fn);
  }

  setToast(fn: (msg: string) => void): void {
    this.toastFn = fn;
  }

  toast(msg: string): void {
    this.toastFn(msg);
  }

  setTool(id: ToolId): void {
    if (id === this.toolId) return;
    this.tool.reset();
    this.toolId = id;
    if (id !== 'select') this.selection.clear();
    savePref('tool', { id });
    this.requestOverlay();
    this.emit();
  }

  /**
   * Change the drawing style. With a selection in the selection tool the change
   * also applies to the selected entities (one undo step).
   */
  setStyle(p: Partial<Style>): void {
    this.style = { ...this.style, ...p };
    savePref('style', this.style);
    const sel = this.selectedEntities();
    if (this.toolId === 'select' && sel.length) {
      this.doc.begin();
      for (const e of sel) this.doc.update({ ...e, style: { ...e.style, ...p } } as Entity);
      this.doc.commit();
    }
    this.emit();
  }

  updateSettings(p: Partial<Settings>): void {
    this.settings = { ...this.settings, ...p };
    savePref('settings', this.settings);
    this.sceneDirty = true;
    this.overlayDirty = true;
    this.scheduleFrame();
    this.emit();
  }

  undo(): void {
    this.tool.cancel();
    if (!this.doc.undo()) this.toast('Nichts zum Rückgängigmachen');
  }

  redo(): void {
    this.tool.cancel();
    if (!this.doc.redo()) this.toast('Nichts zum Wiederherstellen');
  }

  /** Checks that the active layer can take new drawing; otherwise explains why not. */
  ensureDrawableLayer(): boolean {
    const l = this.doc.activeLayer;
    if (!l.visible) {
      this.toast(`Ebene „${l.name}“ ist ausgeblendet`);
      return false;
    }
    if (l.locked) {
      this.toast(`Ebene „${l.name}“ ist gesperrt`);
      return false;
    }
    return true;
  }

  /** A new entity on the active layer with the current style. */
  newEntity<T extends Entity>(data: Omit<T, 'id' | 'layerId' | 'z' | 'style'>, prefix = 'E'): T {
    return {
      ...data,
      id: newId(prefix),
      layerId: this.doc.activeLayerId,
      z: this.doc.allocZ(),
      style: { ...this.style },
    } as T;
  }

  // ---- selection --------------------------------------------------------------

  /** Selected entities that still exist (undo may have removed some). */
  selectedEntities(): Entity[] {
    const out: Entity[] = [];
    for (const id of [...this.selection]) {
      const e = this.doc.get(id);
      if (e && this.isEditable(e)) out.push(e);
      else this.selection.delete(id);
    }
    return out;
  }

  setSelection(ids: Iterable<string>): void {
    this.selection = new Set(ids);
    this.requestOverlay();
    this.emit();
  }

  /** Entity on a visible, unlocked layer. */
  isEditable(e: Entity): boolean {
    const l = this.doc.layer(e.layerId);
    return !!l && l.visible && !l.locked;
  }

  selectAll(): void {
    this.setTool('select');
    const ids: string[] = [];
    for (const e of this.doc.visibleEntities(false)) ids.push(e.id);
    this.setSelection(ids);
  }

  /** Nearest entity under a pointer (visible; `editable` = on unlocked layers only). */
  hitEntity(world: Vec, pointerType: PointerKind, editable = true): { e: Entity; d: number; s: number } | null {
    const r = this.cam.px(HIT_PX[pointerType]);
    let best: { e: Entity; d: number; s: number } | null = null;
    for (const e of this.doc.visibleEntities(!editable)) {
      const bx = entityBox(e);
      const m = r + e.style.width / 2;
      if (world.x < bx.minX - m || world.x > bx.maxX + m || world.y < bx.minY - m || world.y > bx.maxY + m) continue;
      const pr = project(e, world);
      const d = Math.max(0, pr.d - e.style.width / 2);
      // Later (upper) entities win ties.
      if (d <= r && (!best || d <= best.d)) best = { e, d, s: pr.s };
    }
    return best;
  }

  hitRadius(pointerType: PointerKind): number {
    return this.cam.px(HIT_PX[pointerType]);
  }

  // ---- symmetry -------------------------------------------------------------------

  /** Active symmetry axes: lines marked as axis with mirroring on, on visible layers. */
  axes(): LineEntity[] {
    const out: LineEntity[] = [];
    for (const e of this.doc.visibleEntities()) if (e.kind === 'line' && e.axis) out.push(e);
    return out;
  }

  /** Transforms producing the mirrored copies of new drawing (empty without active axes). */
  mirrors(): Affine[] {
    if (this.mirrorCache && this.mirrorCache.version === this.doc.version) return this.mirrorCache.list;
    const list = mirrorGroup(this.axes().filter((a) => a.mirror).map((a) => [a.a, a.b] as [Vec, Vec]));
    this.mirrorCache = { version: this.doc.version, list };
    return list;
  }

  /** Mirrored copies of an entity; previews get stable ids so their look doesn't flicker. */
  mirrorCopies<T extends Entity>(e: T, preview = false): T[] {
    return this.mirrors().map((m, i) => transformEntity(e, m, preview ? `${e.id}~${i}` : newId('M')));
  }

  /** Add new entities together with their mirrored copies as one undo step. */
  addDrawn(...entities: Entity[]): void {
    this.doc.begin();
    for (const e of entities) {
      this.doc.add(e);
      for (const c of this.mirrorCopies(e)) this.doc.add({ ...c, z: this.doc.allocZ() });
    }
    this.doc.commit();
  }

  toggleMirror(axis: LineEntity): void {
    const on = !axis.mirror;
    this.doc.update({ ...axis, mirror: on });
    this.toast(on ? 'Spiegeln an dieser Achse: an' : 'Spiegeln an dieser Achse: aus');
  }

  /** Tap on an on-canvas control (e.g. mirror toggle)? Handles it and returns true. */
  tapWidget(screen: Vec): boolean {
    for (const w of this.widgets) {
      if (dist(w.p, screen) <= w.r) {
        w.onTap();
        return true;
      }
    }
    return false;
  }

  private drawAxes(ctx: CanvasRenderingContext2D): void {
    this.widgets = [];
    const W = this.width;
    const H = this.height;
    for (const axis of this.axes()) {
      const a = this.cam.toScreen(axis.a);
      const b = this.cam.toScreen(axis.b);
      const len = dist(a, b);
      if (len < 1e-6) continue;
      const u = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
      // The whole infinite line across the screen.
      const far = W + H;
      const p0 = { x: a.x - u.x * far, y: a.y - u.y * far };
      const p1 = { x: a.x + u.x * far, y: a.y + u.y * far };
      if (axis.mirror) {
        ctx.save();
        ctx.strokeStyle = ACCENT;
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 6]);
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
        ctx.restore();
      }
      // Toggle beyond the axis end, pulled back on screen if necessary.
      const inset = 28;
      const inside = (p: Vec) => p.x >= inset && p.x <= W - inset && p.y >= inset && p.y <= H - inset;
      // Prefer the upper end: the palette usually sits at the bottom.
      const atB = { x: b.x + u.x * 26, y: b.y + u.y * 26 };
      const atA = { x: a.x - u.x * 26, y: a.y - u.y * 26 };
      let pos = atA.y <= atB.y ? atA : atB;
      if (!inside(pos)) pos = pos === atA ? atB : atA;
      if (!inside(pos)) {
        // Walk along the infinite line to the last on-screen spot on b's side.
        let best: Vec | null = null;
        for (let t = -far; t <= far; t += 8) {
          const q = { x: a.x + u.x * t, y: a.y + u.y * t };
          if (inside(q) && (!best || t > 0)) best = q;
        }
        if (!best) continue;
        pos = best;
      }
      drawMirrorToggle(ctx, pos, !!axis.mirror, u);
      this.widgets.push({ p: pos, r: 18, onTap: () => this.toggleMirror(axis) });
    }
  }

  // ---- snapping ---------------------------------------------------------------

  snapRadius(pointerType: PointerKind): number {
    return this.cam.px(SNAP_PX[pointerType]);
  }

  handleHitRadius(pointerType: PointerKind): number {
    return HANDLE_PX[pointerType];
  }

  /** Snap a free point (e.g. line start) to existing geometry. */
  snapPoint(world: Vec, pointerType: PointerKind, exclude?: ReadonlySet<string>): { p: Vec; hit: SnapHit | null } {
    if (!this.settings.snap || this.snapSuspended) return { p: world, hit: null };
    const hit = findSnap(this.doc, world, this.snapRadius(pointerType), { end: true, mid: true, int: true, exclude });
    return hit ? { p: hit.p, hit } : { p: world, hit: null };
  }

  /** Resolve the moving end of a segment anchored at `anchor`: geometry snap first, then angle snap. */
  resolveEnd(
    anchor: Vec,
    world: Vec,
    pointerType: PointerKind,
    exclude?: ReadonlySet<string>,
  ): { p: Vec; hit: SnapHit | null } {
    const s = this.snapPoint(world, pointerType, exclude);
    if (s.hit && dist(s.hit.p, anchor) > 1e-9) return s;
    if (this.snapSuspended) return { p: world, hit: null };
    if (this.settings.angleMode === 'snap') return { p: snapAngle(anchor, world, ANGLE_STEP), hit: null };
    return { p: softSnapAngle(anchor, world, SOFT_ANGLE_TOL), hit: null };
  }

  /**
   * Snap an angle in degrees (rotation, arc sweep): 5° steps with the angle snap on,
   * otherwise only a gentle pull to multiples of 45°.
   */
  snapDegrees(deg: number): number {
    if (this.snapSuspended) return deg;
    if (this.settings.angleMode === 'snap') return Math.round(deg / ANGLE_STEP) * ANGLE_STEP;
    const t = Math.round(deg / 45) * 45;
    return Math.abs(deg - t) <= SOFT_ANGLE_TOL ? t : deg;
  }

  measureText(a: Vec, b: Vec): string {
    const len = formatLength(dist(a, b), this.cam.scale);
    if (this.settings.angleMode === 'off') return len;
    return `${len}  ·  ${formatAngle(drawingAngleDeg(a, b))}`;
  }

  radiusText(r: number): string {
    const f = (v: number) => formatLength(v, this.cam.scale).replace(' mm', '');
    return `R ${f(r)}  ·  Ø ${f(2 * r)} mm`;
  }

  arcText(r: number, sweep: number): string {
    const f = formatLength(r, this.cam.scale).replace(' mm', '');
    return `R ${f} mm  ·  ${formatAngle((Math.abs(sweep) * 180) / Math.PI)}`;
  }

  // ---- view -----------------------------------------------------------------

  viewChanged(): void {
    this.sceneDirty = true;
    this.overlayDirty = true;
    this.viewDirty = true;
    this.scheduleFrame();
    this.scheduleSave();
  }

  resetView(): void {
    this.cam.state = { scale: MM_PX, rot: 0, tx: 0, ty: 0 };
    this.cam.anchor({ x: 0, y: 0 }, { x: this.width / 2, y: this.height / 2 });
    this.viewChanged();
  }

  /** Zoom to show the whole drawing (or reset when empty). */
  fitAll(): void {
    let bx = emptyBox();
    for (const e of this.doc.visibleEntities()) bx = boxUnion(bx, entityBox(e));
    if (isEmptyBox(bx)) {
      this.resetView();
      return;
    }
    this.cam.fit(bx, this.width, this.height, Math.min(80, Math.min(this.width, this.height) / 6));
    this.viewChanged();
  }

  resetRotation(): void {
    this.cam.rotateAt({ x: this.width / 2, y: this.height / 2 }, 0);
    this.viewChanged();
  }

  // ---- rendering --------------------------------------------------------------

  requestOverlay(): void {
    this.overlayDirty = true;
    this.scheduleFrame();
  }

  private scheduleFrame(): void {
    if (this.frameRequested) return;
    this.frameRequested = true;
    requestAnimationFrame(() => {
      this.frameRequested = false;
      this.frame();
    });
  }

  private frame(): void {
    if (this.viewDirty) {
      this.viewDirty = false;
      for (const fn of this.viewListeners) fn();
    }
    if (this.sceneDirty) {
      this.sceneDirty = false;
      this.scene.render(this.doc, this.cam, this.width, this.height, this.dpr, { grid: this.settings.grid });
    }
    if (this.overlayDirty) {
      this.overlayDirty = false;
      const ctx = this.overlayCtx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.drawAxes(ctx);
      this.tool.overlay(ctx);
    }
  }

  private worldPainter(): Painter {
    this.overlayPainter.begin(this.cam, this.dpr, this.cam.visibleBox(this.width, this.height));
    return this.overlayPainter;
  }

  private screenSpace(): void {
    this.overlayCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  /** Paint an entity preview (and its mirrored copies) onto the overlay. */
  paintWorld(e: Entity): void {
    const p = this.worldPainter();
    p.draw(e);
    for (const c of this.mirrorCopies(e, true)) p.draw(c, 0.55);
    this.screenSpace();
  }

  /**
   * Dashed construction guide of an entity plus its mirrored copies; `mirrorsOnly`
   * skips the original (when the tool draws it itself).
   */
  paintGuide(e: Entity, mirrorsOnly = false, alpha = 1): void {
    const p = this.worldPainter();
    if (!mirrorsOnly) p.guide(e, ACCENT, alpha);
    for (const c of this.mirrorCopies(e, true)) p.guide(c, ACCENT, alpha * 0.5);
    this.screenSpace();
  }

  /** Coloured halo around entities (selection, delete preview). */
  paintHighlight(entities: Iterable<Entity>, color: string, alpha: number, extraPx = 5): void {
    const p = this.worldPainter();
    for (const e of entities) p.highlight(e, color, alpha, extraPx);
    this.screenSpace();
  }

  // ---- persistence ------------------------------------------------------------

  private scheduleSave(): void {
    if (!this.loaded) return;
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => void this.saveNow(), 600);
  }

  async saveNow(): Promise<void> {
    window.clearTimeout(this.saveTimer);
    if (!this.loaded) return;
    const ok = await idbSet(AUTOSAVE_KEY, this.doc.toFile(this.cam.state));
    if (!ok) console.warn('Automatisches Speichern fehlgeschlagen');
  }

  newDrawing(): void {
    this.tool.reset();
    this.selection.clear();
    this.doc.reset();
    this.resetView();
  }

  loadDrawing(data: unknown): void {
    this.tool.reset();
    this.selection.clear();
    const view = this.doc.loadFile(data).view;
    if (view) {
      this.cam.state = view;
      this.viewChanged();
    } else {
      this.fitAll();
    }
  }
}
