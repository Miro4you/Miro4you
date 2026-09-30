import type { App } from '../app';
import { entityBox, newId } from '../core/document';
import { boxUnion, emptyBox, isEmptyBox, type Box, type Vec } from '../core/geom';
import { reflection, rotation, transformEntity, translation, type Affine } from '../core/transform';
import type { Entity } from '../core/types';

/** Operations on the current selection, used by the action bar and keyboard shortcuts. */

export function selectionBox(entities: Entity[]): Box | null {
  let bx = emptyBox();
  for (const e of entities) bx = boxUnion(bx, entityBox(e));
  return isEmptyBox(bx) ? null : bx;
}

function centre(bx: Box): Vec {
  return { x: (bx.minX + bx.maxX) / 2, y: (bx.minY + bx.maxY) / 2 };
}

/** Replace the selected entities by transformed versions (one undo step). */
export function transformSelection(app: App, m: Affine): void {
  const sel = app.selectedEntities();
  if (!sel.length) return;
  app.doc.begin();
  for (const e of sel) app.doc.update(transformEntity(e, m));
  app.doc.commit();
}

export function deleteSelection(app: App): void {
  const sel = app.selectedEntities();
  if (!sel.length) return;
  app.doc.begin();
  for (const e of sel) app.doc.remove(e.id);
  app.doc.commit();
  app.setSelection([]);
}

/** Copies offset a little down-right on screen; the copies become the selection. */
export function duplicateSelection(app: App): void {
  const sel = app.selectedEntities();
  if (!sel.length) return;
  const a = app.cam.toWorld({ x: 0, y: 0 });
  const b = app.cam.toWorld({ x: 24, y: 24 });
  const m = translation(b.x - a.x, b.y - a.y);
  const ids: string[] = [];
  app.doc.begin();
  for (const e of [...sel].sort((x, y) => x.z - y.z)) {
    const c = { ...transformEntity(e, m, newId('E')), z: app.doc.allocZ() };
    // A copy of an axis is a plain line; one axis per symmetry is enough.
    if (c.kind === 'line') {
      delete c.axis;
      delete c.mirror;
    }
    app.doc.add(c);
    ids.push(c.id);
  }
  app.doc.commit();
  app.setSelection(ids);
}

/** Rotate by `deg` counter-clockwise on paper around the selection centre. */
export function rotateSelection(app: App, deg: number): void {
  const bx = selectionBox(app.selectedEntities());
  if (bx) transformSelection(app, rotation(centre(bx), (-deg * Math.PI) / 180));
}

/** Flip left↔right ('h') or top↔bottom ('v') around the selection centre. */
export function mirrorSelection(app: App, dir: 'h' | 'v'): void {
  const bx = selectionBox(app.selectedEntities());
  if (!bx) return;
  const c = centre(bx);
  const m = dir === 'h' ? reflection(c, { x: c.x, y: c.y + 1 }) : reflection(c, { x: c.x + 1, y: c.y });
  transformSelection(app, m);
}

export function nudgeSelection(app: App, dx: number, dy: number): void {
  transformSelection(app, translation(dx, dy));
}

export function moveSelectionToLayer(app: App, layerId: string): void {
  const sel = app.selectedEntities();
  if (!sel.length) return;
  app.doc.begin();
  for (const e of sel) if (e.layerId !== layerId) app.doc.update({ ...e, layerId });
  app.doc.commit();
  const l = app.doc.layer(layerId);
  // Entities on a hidden or locked layer can't stay selected.
  if (l && (!l.visible || l.locked)) app.setSelection([]);
  app.toast(`Auf Ebene „${l?.name ?? ''}“ verschoben`);
}

/** Turn a single selected line into a symmetry axis (mirroring on) or back into a plain line. */
export function toggleAxis(app: App): void {
  const sel = app.selectedEntities();
  if (sel.length !== 1 || sel[0].kind !== 'line') return;
  const l = sel[0];
  if (l.axis) {
    const { axis: _a, mirror: _m, ...rest } = l;
    void _a;
    void _m;
    app.doc.update(rest);
    app.toast('Keine Symmetrieachse mehr');
  } else {
    app.doc.update({ ...l, axis: true, mirror: true });
    app.toast('Symmetrieachse: neue Linien werden gespiegelt');
  }
}

/** Centre-line cross on/off for the selected circles and arcs. */
export function toggleMarks(app: App): void {
  const round = app.selectedEntities().filter((e) => e.kind === 'circle' || e.kind === 'arc');
  if (!round.length) return;
  const on = !round.every((e) => (e.kind === 'circle' || e.kind === 'arc') && e.mark);
  app.doc.begin();
  for (const e of round) app.doc.update({ ...e, mark: on } as Entity);
  app.doc.commit();
}

