import type { App } from '../app';
import {
  deleteSelection,
  duplicateSelection,
  mirrorSelection,
  moveSelectionToLayer,
  rotateSelection,
  toggleAxis,
  toggleMarks,
} from '../tools/selection-actions';
import { dimText } from '../core/annotations';
import type { Entity } from '../core/types';
import { askGtol, askText } from './dialogs';
import { editSheet } from './sheet-dialog';
import { h } from './dom';
import { icons } from './icons';

/** Contextual bar at the top while objects are selected. */
export class SelectionBar {
  readonly el = h('div', { class: 'selbar panel', role: 'toolbar', 'aria-label': 'Auswahl' });
  private count = h('span', { class: 'selcount' });
  private axisBtn: HTMLButtonElement;
  private marksBtn: HTMLButtonElement;
  private editBtn: HTMLButtonElement;
  private layerMenu = h('div', { class: 'layer-menu panel' });

  constructor(private app: App) {
    const btn = (title: string, icon: string, fn: () => void, cls = '') => {
      const b = h('button', { class: `btn ${cls}`, title, 'aria-label': title, html: icon });
      b.addEventListener('click', fn);
      return b;
    };
    this.axisBtn = btn('Als Symmetrieachse verwenden / aufheben', icons.axis, () => toggleAxis(app));
    this.marksBtn = btn('Mittellinien ein/aus', icons.centerMark, () => toggleMarks(app));
    this.editBtn = btn('Text bearbeiten', icons.editText, () => void this.editText());
    const layerBtn = btn('Auf andere Ebene verschieben', icons.layers, () => this.toggleLayerMenu(layerBtn));
    this.el.append(
      this.count,
      h('div', { class: 'sep' }),
      btn('Duplizieren (⌘D)', icons.duplicate, () => duplicateSelection(app)),
      btn('90° drehen', icons.rotate90, () => rotateSelection(app, 90)),
      btn('Waagerecht spiegeln', icons.flipH, () => mirrorSelection(app, 'h')),
      btn('Senkrecht spiegeln', icons.flipV, () => mirrorSelection(app, 'v')),
      layerBtn,
      this.axisBtn,
      this.marksBtn,
      this.editBtn,
      h('div', { class: 'sep' }),
      btn('Löschen (Entf)', icons.trash, () => deleteSelection(app), 'danger'),
      this.layerMenu,
    );
    app.onUiChange(() => this.update());
    this.update();
  }

  /** Edit the text of a selected dimension, datum or tolerance frame. */
  private async editText(): Promise<void> {
    const sel = this.app.selectedEntities();
    const e = sel.length === 1 ? sel[0] : null;
    if (!e) return;
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
      await editSheet(this.app);
      return;
    } else if (e.kind === 'gtol') {
      const spec = await askGtol({ sym: e.sym, value: e.value, dia: e.dia, datums: e.datums }, 'Übernehmen');
      if (!spec) return;
      next = { ...e, ...spec };
    }
    const cur = this.app.doc.get(e.id);
    if (next && cur) this.app.doc.update(next, cur);
  }

  private toggleLayerMenu(anchor: HTMLElement): void {
    if (this.layerMenu.classList.toggle('open')) {
      this.layerMenu.replaceChildren(
        ...[...this.app.doc.layers].reverse().map((l) => {
          const b = h('button', { class: 'menu-item', text: l.name + (l.locked ? ' (gesperrt)' : '') });
          b.disabled = l.locked || !l.visible;
          b.addEventListener('click', () => {
            this.layerMenu.classList.remove('open');
            moveSelectionToLayer(this.app, l.id);
          });
          return b;
        }),
      );
      this.layerMenu.style.left = `${anchor.offsetLeft}px`;
    }
  }

  private update(): void {
    const sel = this.app.toolId === 'select' ? this.app.selectedEntities() : [];
    this.el.classList.toggle('open', sel.length > 0);
    if (!sel.length) {
      this.layerMenu.classList.remove('open');
      return;
    }
    this.count.textContent = sel.length === 1 ? '1 Objekt' : `${sel.length} Objekte`;
    const single = sel.length === 1 ? sel[0] : null;
    this.axisBtn.hidden = !(single && single.kind === 'line');
    this.axisBtn.classList.toggle('active', !!(single && single.kind === 'line' && single.axis));
    this.editBtn.hidden = !(single && ['dim', 'datum', 'gtol', 'text', 'sheet'].includes(single.kind));
    const round = sel.filter((e) => e.kind === 'circle' || e.kind === 'arc');
    this.marksBtn.hidden = round.length === 0;
    this.marksBtn.classList.toggle('active', round.length > 0 && round.every((e) => (e.kind === 'circle' || e.kind === 'arc') && e.mark));
  }
}
