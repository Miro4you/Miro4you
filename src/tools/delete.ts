import type { App } from '../app';
import { capsuleRanges } from '../core/curves';
import type { Vec } from '../core/geom';
import type { Entity } from '../core/types';
import { DANGER } from '../render/overlay';
import type { Tool, ToolEvent } from './tool';

type State = { k: 'idle' } | { k: 'drag'; last: Vec; marked: Map<string, Entity> };

/**
 * Deletes whole objects: tap one, or swipe across several. Everything touched is
 * shown in red and removed when the pen lifts (one undo step).
 */
export class DeleteTool implements Tool {
  readonly id = 'delete';
  private state: State = { k: 'idle' };
  private hover_: Entity | null = null;

  constructor(private app: App) {}

  get busy(): boolean {
    return this.state.k !== 'idle';
  }

  down(ev: ToolEvent): void {
    this.hover_ = null;
    const marked = new Map<string, Entity>();
    const hit = this.app.hitEntity(ev.world, ev.pointerType);
    if (hit) marked.set(hit.e.id, hit.e);
    this.state = { k: 'drag', last: ev.world, marked };
    this.app.requestOverlay();
  }

  move(ev: ToolEvent): void {
    const st = this.state;
    if (st.k !== 'drag') return;
    const R = this.app.hitRadius(ev.pointerType);
    for (const e of this.app.doc.visibleEntities(false)) {
      // Hatch outlines lie on the lines around them: hatches go only when tapped inside.
      if (st.marked.has(e.id) || e.kind === 'hatch') continue;
      if (capsuleRanges(e, st.last, ev.world, R + e.style.width / 2).length) st.marked.set(e.id, e);
    }
    st.last = ev.world;
    this.app.requestOverlay();
  }

  up(ev: ToolEvent): void {
    const st = this.state;
    if (st.k !== 'drag') return;
    this.move(ev);
    this.state = { k: 'idle' };
    if (st.marked.size) {
      this.app.doc.begin();
      for (const id of st.marked.keys()) this.app.doc.remove(id);
      this.app.doc.commit();
    }
    this.app.requestOverlay();
  }

  cancel(): void {
    this.state = { k: 'idle' };
    this.app.requestOverlay();
  }

  hover(ev: ToolEvent | null): void {
    if (this.state.k !== 'idle') return;
    const hit = ev ? this.app.hitEntity(ev.world, ev.pointerType)?.e ?? null : null;
    if (hit !== this.hover_) {
      this.hover_ = hit;
      this.app.requestOverlay();
    }
  }

  reset(): void {
    this.cancel();
    this.hover_ = null;
  }

  overlay(): void {
    const st = this.state;
    if (st.k === 'drag') this.app.paintHighlight(st.marked.values(), DANGER, 0.55);
    else if (this.hover_ && this.app.doc.get(this.hover_.id)) this.app.paintHighlight([this.hover_], DANGER, 0.3);
  }
}
