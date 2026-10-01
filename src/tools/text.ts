import type { App } from '../app';
import { dist, type Vec } from '../core/geom';
import type { SnapHit } from '../core/snap';
import type { TextEntity } from '../core/types';
import { drawGuideLine, drawSnapMarker } from '../render/overlay';
import { askText } from '../ui/dialogs';
import type { Tool, ToolEvent } from './tool';

const DRAG_PX = 8;

type State = { k: 'idle' } | { k: 'press'; start: Vec; at: Vec; hit: SnapHit | null; p: Vec; moved: boolean };

/**
 * Text: tap where the text starts (bottom left of the first line) and type it;
 * drag first to write along a direction. Tapping an existing text edits it.
 */
export class TextTool implements Tool {
  readonly id = 'text';
  private state: State = { k: 'idle' };
  private hoverHit: SnapHit | null = null;
  private dialogOpen = false;

  constructor(private app: App) {}

  get busy(): boolean {
    return this.state.k !== 'idle';
  }

  /** Direction of the screen's x axis in the world (text stays horizontal on screen). */
  private viewAngle(): number {
    const o = this.app.cam.toWorld({ x: 0, y: 0 });
    const r = this.app.cam.toWorld({ x: 1, y: 0 });
    return Math.atan2(r.y - o.y, r.x - o.x);
  }

  down(ev: ToolEvent): void {
    this.hoverHit = null;
    if (this.dialogOpen) return;
    const s = this.app.snapPoint(ev.world, ev.pointerType);
    this.state = { k: 'press', start: ev.screen, at: s.p, hit: s.hit, p: s.p, moved: false };
    this.app.requestOverlay();
  }

  move(ev: ToolEvent): void {
    const st = this.state;
    if (st.k !== 'press') return;
    if (!st.moved && dist(st.start, ev.screen) > DRAG_PX) st.moved = true;
    if (st.moved) st.p = this.app.resolveEnd(st.at, ev.world, ev.pointerType).p;
    this.app.requestOverlay();
  }

  up(ev: ToolEvent): void {
    const st = this.state;
    if (st.k !== 'press') return;
    this.move(ev);
    this.state = { k: 'idle' };
    this.app.requestOverlay();
    if (!st.moved) {
      const hit = this.app.hitEntity(ev.world, ev.pointerType);
      if (hit?.e.kind === 'text') {
        void this.edit(hit.e);
        return;
      }
    }
    if (!this.app.ensureDrawableLayer()) return;
    const angle = st.moved ? Math.atan2(st.p.y - st.at.y, st.p.x - st.at.x) : this.viewAngle();
    this.dialogOpen = true;
    void askText('Text', '', 'Einfügen', undefined, false, true).then((text) => {
      this.dialogOpen = false;
      if (!text) return;
      const size = this.app.settings.textSize;
      const e = this.app.newEntity<TextEntity>({ kind: 'text', at: st.at, text, size, angle }, 'T');
      this.app.addDrawn({ ...e, style: { ...e.style, lineType: 'solid' } });
    });
  }

  private async edit(e: TextEntity): Promise<void> {
    this.dialogOpen = true;
    const text = await askText('Text bearbeiten', e.text, 'Übernehmen', undefined, false, true);
    this.dialogOpen = false;
    const cur = this.app.doc.get(e.id);
    if (!cur) return;
    if (text === null) return;
    this.app.doc.update({ ...(cur as TextEntity), text }, cur);
  }

  cancel(): void {
    this.state = { k: 'idle' };
    this.app.requestOverlay();
  }

  hover(ev: ToolEvent | null): void {
    if (this.state.k !== 'idle') return;
    const hit = ev ? this.app.snapPoint(ev.world, ev.pointerType).hit : null;
    if (hit?.p.x !== this.hoverHit?.p.x || hit?.p.y !== this.hoverHit?.p.y) {
      this.hoverHit = hit;
      this.app.requestOverlay();
    }
  }

  reset(): void {
    this.cancel();
    this.hoverHit = null;
  }

  overlay(ctx: CanvasRenderingContext2D): void {
    const st = this.state;
    const cam = this.app.cam;
    if (st.k === 'press') {
      if (st.hit) drawSnapMarker(ctx, cam.toScreen(st.at), st.hit.kind);
      if (st.moved) drawGuideLine(ctx, cam.toScreen(st.at), cam.toScreen(st.p));
    } else if (this.hoverHit) {
      drawSnapMarker(ctx, cam.toScreen(this.hoverHit.p), this.hoverHit.kind);
    }
  }
}
