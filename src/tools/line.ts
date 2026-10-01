import type { App } from '../app';
import { dist, type Vec } from '../core/geom';
import type { SnapHit } from '../core/snap';
import type { LineEntity } from '../core/types';
import { drawGuideLine, drawMeasureLabel, drawSnapMarker } from '../render/overlay';
import { drawGrips, GripDrag, gripsFor, hitGrip } from './grips';
import type { Tool, ToolEvent } from './tool';

/** Pen travel (CSS px) below which a press counts as a tap, not a line. */
const TAP_PX = 3;

type State =
  | { k: 'idle' }
  | { k: 'draw'; start: Vec; startHit: SnapHit | null; end: Vec; endHit: SnapHit | null }
  | { k: 'grip'; drag: GripDrag };

/**
 * Straight line: press and drag shows a dashed guide with live length/angle,
 * lifting the pen creates the line. Endpoints snap to existing geometry and the
 * angle to 5° steps (depending on settings). Optional knobs beyond the ends of the
 * most recent line allow correcting it.
 */
export class LineTool implements Tool {
  readonly id = 'line';
  private state: State = { k: 'idle' };
  private handleId: string | null = null;

  constructor(private app: App) {}

  get busy(): boolean {
    return this.state.k !== 'idle';
  }

  get hoverSnap(): boolean {
    return this.state.k === 'idle';
  }

  /** The last drawn line, if its correction knobs should show. */
  private handleLine(): LineEntity | null {
    if (!this.handleId || !this.app.settings.handles) return null;
    const e = this.app.doc.get(this.handleId);
    if (!e || e.kind !== 'line' || !this.app.isEditable(e)) return null;
    return e;
  }

  down(ev: ToolEvent): void {
    const line = this.handleLine();
    if (line) {
      const g = hitGrip(this.app, gripsFor(this.app, line, 'knobs'), ev.screen, this.app.handleHitRadius(ev.pointerType));
      if (g) {
        this.state = { k: 'grip', drag: new GripDrag(this.app, g, line, ev.screen) };
        this.app.requestOverlay();
        return;
      }
    }
    this.handleId = null;
    if (!this.app.ensureDrawableLayer()) return;
    const s = this.app.snapPoint(ev.world, ev.pointerType);
    this.state = { k: 'draw', start: s.p, startHit: s.hit, end: s.p, endHit: null };
    this.app.requestOverlay();
  }

  move(ev: ToolEvent): void {
    const st = this.state;
    if (st.k === 'draw') {
      const r = this.app.resolveEnd(st.start, ev.world, ev.pointerType);
      st.end = r.p;
      st.endHit = r.hit;
      this.app.requestOverlay();
    } else if (st.k === 'grip') {
      st.drag.move(ev);
    }
  }

  up(ev: ToolEvent): void {
    const st = this.state;
    if (st.k === 'draw') {
      this.move(ev);
      this.state = { k: 'idle' };
      const cam = this.app.cam;
      if (dist(cam.toScreen(st.start), cam.toScreen(st.end)) >= TAP_PX) {
        // A centre line (dash-dot) becomes a symmetry axis with mirroring on.
        const axis = this.app.style.lineType === 'dashdot';
        const e = this.app.newEntity<LineEntity>({ kind: 'line', a: st.start, b: st.end, ...(axis ? { axis: true, mirror: true } : {}) });
        this.app.addDrawn(e);
        this.handleId = this.app.settings.handles ? e.id : null;
      }
    } else if (st.k === 'grip') {
      st.drag.move(ev);
      st.drag.end();
      this.state = { k: 'idle' };
    }
    this.app.requestOverlay();
  }

  cancel(): void {
    if (this.state.k === 'grip') this.state.drag.cancel();
    this.state = { k: 'idle' };
    this.app.requestOverlay();
  }

  hover(): void {}

  reset(): void {
    this.cancel();
    this.handleId = null;
  }

  overlay(ctx: CanvasRenderingContext2D): void {
    const cam = this.app.cam;
    const st = this.state;
    if (st.k === 'draw') {
      const a = cam.toScreen(st.start);
      const b = cam.toScreen(st.end);
      if (dist(a, b) >= TAP_PX) {
        this.app.paintGuide(
          { kind: 'line', id: 'preview', layerId: '', z: 0, style: this.app.style, a: st.start, b: st.end },
          true,
        );
      }
      drawGuideLine(ctx, a, b);
      if (st.startHit) drawSnapMarker(ctx, a, st.startHit.kind);
      if (st.endHit) drawSnapMarker(ctx, b, st.endHit.kind);
      if (dist(a, b) >= TAP_PX) drawMeasureLabel(ctx, a, b, this.app.measureText(st.start, st.end));
      return;
    }
    const line = this.handleLine();
    if (line) {
      const grips = gripsFor(this.app, line, 'knobs');
      if (st.k === 'grip') st.drag.overlay(ctx);
      drawGrips(this.app, ctx, grips, 'knobs', st.k === 'grip' ? st.drag.grip.key : undefined);
    }
  }
}
