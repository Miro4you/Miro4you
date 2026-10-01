import type { App } from '../app';
import { dimText } from '../core/annotations';
import type { Entity } from '../core/types';
import { askGtol, askText } from './dialogs';
import { editSheet } from './sheet-dialog';

/** Whether an entity has text that can be edited (dimension, datum, frame, text, sheet). */
export function hasEditableText(e: Entity): boolean {
  return e.kind === 'dim' || e.kind === 'datum' || e.kind === 'gtol' || e.kind === 'text' || e.kind === 'sheet';
}

/** Open the editor for the text of a dimension, datum, tolerance frame, text or sheet. */
export async function editAnnotation(app: App, e: Entity): Promise<void> {
  let next: Entity | null = null;
  if (e.kind === 'dim') {
    const v = await askText('Maßtext', e.text ?? dimText(e), 'Übernehmen', 'Leer lassen für den gemessenen Wert.', true);
    if (v === null) return;
    const measured = dimText({ ...e, text: undefined });
    next = { ...e, text: v && v !== measured ? v : undefined };
  } else if (e.kind === 'datum') {
    const v = await askText('Bezugsbuchstabe', e.letter);
    if (!v) return;
    next = { ...e, letter: v.toUpperCase().slice(0, 3) };
  } else if (e.kind === 'text') {
    const v = await askText('Text bearbeiten', e.text, 'Übernehmen', undefined, false, true);
    if (!v) return;
    next = { ...e, text: v };
  } else if (e.kind === 'sheet') {
    await editSheet(app);
    return;
  } else if (e.kind === 'gtol') {
    const spec = await askGtol({ sym: e.sym, value: e.value, dia: e.dia, datums: e.datums }, 'Übernehmen');
    if (!spec) return;
    next = { ...e, ...spec };
  }
  // The entity may have changed meanwhile (e.g. undo): edit what is there now.
  const cur = app.doc.get(e.id);
  if (next && cur) app.doc.update({ ...next, ...pick(cur) } as Entity, cur);
}

/** Geometry of the current entity, so only the text edit is applied on top. */
function pick(cur: Entity): Partial<Entity> {
  switch (cur.kind) {
    case 'dim':
      return { p1: cur.p1, p2: cur.p2, p3: cur.p3, dir: cur.dir, off: cur.off, tpos: cur.tpos, layerId: cur.layerId, z: cur.z };
    case 'datum':
    case 'gtol':
      return { at: cur.at, p: cur.p, layerId: cur.layerId, z: cur.z };
    case 'text':
      return { at: cur.at, angle: cur.angle, size: cur.size, layerId: cur.layerId, z: cur.z };
    default:
      return {};
  }
}
