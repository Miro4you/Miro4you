import { Camera } from './core/camera';
import { entityBox, SketchDocument } from './core/document';
import { boxUnion, drawingAngleDeg, dist, emptyBox, isEmptyBox, type Vec } from './core/geom';
import { DEFAULT_STYLE } from './core/pens';
import { findSnap, snapAngle, softSnapAngle, type AngleMode, type SnapHit } from './core/snap';
import type { Entity, Style } from './core/types';
import { formatAngle, formatLength } from './render/overlay';
import { Painter } from './render/painter';
import { SceneRenderer } from './render/scene';
import { idbGet, idbSet, loadPref, savePref } from './storage/idb';
import { FreehandTool } from './tools/freehand';
import { LineTool } from './tools/line';
import type { PointerKind, Tool } from './tools/tool';

export type ToolId = 'freehand' | 'line';

export interface Settings {
  grid: boolean;
  /** Endpoint/midpoint/intersection snapping. */
  snap: boolean;
  angleMode: AngleMode;
  /** Correction handles on the most recent line. */
  handles: boolean;
  /** Draw with the finger (otherwise one finger pans). */
  fingerDraws: boolean;
  /** Two-finger rotation of the view. */
  rotate: boolean;
}

export const ANGLE_STEP = 5;
/** With the angle snap off, lines still settle onto 0°/45°/90°… when this close (degrees). */
export const SOFT_ANGLE_TOL = 1;
/** CSS px per mm at 100 % zoom (96 dpi). */
export const MM_PX = 96 / 25.4;
const SNAP_PX: Record<PointerKind, number> = { pen: 12, mouse: 10, touch: 20 };
const HANDLE_PX: Record<PointerKind, number> = { pen: 16, mouse: 12, touch: 24 };
const AUTOSAVE_KEY = 'current';

const DEFAULT_SETTINGS: Settings = {
  grid: true,
  snap: true,
  angleMode: 'snap',
  handles: true,
  fingerDraws: false,
  rotate: true,
};

/** Central application state and render loop. */
export class App {
  readonly doc = new SketchDocument();
  readonly cam = new Camera();
  settings: Settings = loadPref('settings', DEFAULT_SETTINGS);
  style: Style = loadPref('style', DEFAULT_STYLE);
  toolId: ToolId;
  readonly tools: Record<ToolId, Tool>;
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

  constructor(
    private sceneCanvas: HTMLCanvasElement,
    private overlayCanvas: HTMLCanvasElement,
  ) {
    this.scene = new SceneRenderer(sceneCanvas);
    const octx = overlayCanvas.getContext('2d');
    if (!octx) throw new Error('Canvas 2D wird nicht unterstützt');
    this.overlayCtx = octx;
    this.overlayPainter = new Painter(octx);
    this.tools = { freehand: new FreehandTool(this), line: new LineTool(this) };
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
    savePref('tool', { id });
    this.requestOverlay();
    this.emit();
  }

  setStyle(p: Partial<Style>): void {
    this.style = { ...this.style, ...p };
    savePref('style', this.style);
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

  measureText(a: Vec, b: Vec): string {
    const len = formatLength(dist(a, b), this.cam.scale);
    if (this.settings.angleMode === 'off') return len;
    return `${len}  ·  ${formatAngle(drawingAngleDeg(a, b))}`;
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
      this.tool.overlay(ctx);
    }
  }

  /** Paint an entity preview in world space onto the overlay (used by tools). */
  paintWorld(e: Entity): void {
    this.overlayPainter.begin(this.cam, this.dpr, this.cam.visibleBox(this.width, this.height));
    this.overlayPainter.draw(e);
    this.overlayCtx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
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
    this.doc.reset();
    this.resetView();
  }

  loadDrawing(data: unknown): void {
    this.tool.reset();
    const view = this.doc.loadFile(data).view;
    if (view) {
      this.cam.state = view;
      this.viewChanged();
    } else {
      this.fitAll();
    }
  }
}
