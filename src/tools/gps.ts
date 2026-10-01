import type { App } from '../app';
import { dist, type Vec } from '../core/geom';
import { INK_WIDTHS, PENCIL_WIDTHS } from '../core/pens';
import type { SnapHit } from '../core/snap';
import type { DatumEntity, Entity, GtolEntity } from '../core/types';
import { drawSnapMarker } from '../render/overlay';
import { askGtol, type GtolSpec } from '../ui/dialogs';
import type { Tool, ToolEvent } from './tool';

const DRAG_PX = 8;
/** Letters for datums (ISO 5459 avoids I, O and Q). */
const DATUM_LETTERS = 'ABCDEFGHJKLMNPRSTUVWXYZ';

type State = { k: 'idle' } | { k: 'press'; start: Vec; at: Vec; hit: SnapHit | null; p: Vec; moved: boolean };

/** Next datum letter not used in the drawing yet. */
export function nextDatumLetter(entities: Iterable<Entity>): string {
  const used = new Set<string>();
  for (const e of entities) if (e.kind === 'datum') used.add(e.letter);
  for (const l of DATUM_LETTERS) if (!used.has(l)) return l;
  return 'A';
}

/**
 * ISO GPS symbols: press on the feature and drag to where the symbol goes (a tap
 * uses a default distance). Datum symbols get the next free letter; tolerance
 * frames open an editor for characteristic, value and datums.
 */
export class GpsTool implements Tool {
  readonly id = 'gps';
  private state: State = { k: 'idle' };
  private lastSpec: GtolSpec = { sym: 'flatness', value: '0,05', dia: false, datums: [] };

  constructor(private app: App) {}

  get busy(): boolean {
    return this.state.k !== 'idle';
  }

  get hoverSnap(): boolean {
    return this.state.k === 'idle';
  }

  private get mode(): 'datum' | 'gtol' {
    return this.app.settings.gpsMode;
  }

  private thin<T extends Entity>(e: T): T {
    const width = this.app.style.pen === 'pencil' ? PENCIL_WIDTHS[0] : INK_WIDTHS[1];
    return { ...e, style: { ...e.style, width, lineType: 'solid' } };
  }

  /** World direction pointing up on screen. */
  private screenDir(x: number, y: number): Vec {
    const a = this.app.cam.toWorld({ x: 0, y: 0 });
    const b = this.app.cam.toWorld({ x, y });
    const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    return { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
  }

  /** Symbol position for a tap on `at`: off the feature, away from it. */
  private defaultPos(at: Vec, world: Vec, type: ToolEvent['pointerType']): Vec {
    const up = this.screenDir(0, -1);
    let n = up;
    const hit = this.app.hitEntity(world, type, false);
    if (hit?.e.kind === 'line') {
      const d = { x: hit.e.b.x - hit.e.a.x, y: hit.e.b.y - hit.e.a.y };
      const l = Math.hypot(d.x, d.y) || 1;
      n = { x: -d.y / l, y: d.x / l };
      if (n.x * up.x + n.y * up.y < 0) n = { x: -n.x, y: -n.y };
    }
    if (this.mode === 'datum') return { x: at.x + n.x * 10, y: at.y + n.y * 10 };
    const right = this.screenDir(1, 0);
    return { x: at.x + n.x * 10 + right.x * 6, y: at.y + n.y * 10 + right.y * 6 };
  }

  private preview(at: Vec, p: Vec): Entity {
    const width = this.app.style.pen === 'pencil' ? PENCIL_WIDTHS[0] : INK_WIDTHS[1];
    const base = { id: 'preview-gps', layerId: '', z: 0, style: { ...this.app.style, width, lineType: 'solid' as const } };
    if (this.mode === 'datum') return { ...base, kind: 'datum', at, p, letter: nextDatumLetter(this.app.doc.visibleEntities()) };
    return { ...base, kind: 'gtol', at, p, ...this.lastSpec };
  }

  down(ev: ToolEvent): void {
    if (!this.app.ensureDrawableLayer()) return;
    const s = this.app.snapPoint(ev.world, ev.pointerType);
    this.state = { k: 'press', start: ev.screen, at: s.p, hit: s.hit, p: s.p, moved: false };
    this.app.requestOverlay();
  }

  move(ev: ToolEvent): void {
    const st = this.state;
    if (st.k !== 'press') return;
    if (!st.moved && dist(st.start, ev.screen) > DRAG_PX) st.moved = true;
    if (st.moved) st.p = this.mode === 'datum' ? this.app.resolveEnd(st.at, ev.world, ev.pointerType).p : ev.world;
    this.app.requestOverlay();
  }

  up(ev: ToolEvent): void {
    const st = this.state;
    if (st.k !== 'press') return;
    this.move(ev);
    this.state = { k: 'idle' };
    const p = st.moved ? st.p : this.defaultPos(st.at, ev.world, ev.pointerType);
    if (this.mode === 'datum') {
      const letter = nextDatumLetter(this.app.doc.visibleEntities());
      this.app.addDrawn(this.thin(this.app.newEntity<DatumEntity>({ kind: 'datum', at: st.at, p, letter }, 'G')));
      this.app.requestOverlay();
      return;
    }
    this.app.requestOverlay();
    void askGtol(this.lastSpec).then((spec) => {
      if (!spec) return;
      this.lastSpec = spec;
      this.app.addDrawn(this.thin(this.app.newEntity<GtolEntity>({ kind: 'gtol', at: st.at, p, ...spec }, 'G')));
    });
  }

  cancel(): void {
    this.state = { k: 'idle' };
    this.app.requestOverlay();
  }

  hover(): void {}

  reset(): void {
    this.cancel();
  }

  overlay(ctx: CanvasRenderingContext2D): void {
    const st = this.state;
    const cam = this.app.cam;
    if (st.k === 'press') {
      if (st.hit) drawSnapMarker(ctx, cam.toScreen(st.at), st.hit.kind);
      if (st.moved) this.app.paintWorld(this.preview(st.at, st.p));
    }
  }
}
