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
import { h } from './dom';
import { icons } from './icons';

/** Contextual bar at the top while objects are selected. */
export class SelectionBar {
  readonly el = h('div', { class: 'selbar panel', role: 'toolbar', 'aria-label': 'Auswahl' });
  private count = h('span', { class: 'selcount' });
  private axisBtn: HTMLButtonElement;
  private marksBtn: HTMLButtonElement;
  private layerMenu = h('div', { class: 'layer-menu panel' });

  constructor(private app: App) {
    const btn = (title: string, icon: string, fn: () => void, cls = '') => {
      const b = h('button', { class: `btn ${cls}`, title, 'aria-label': title, html: icon });
      b.addEventListener('click', fn);
      return b;
    };
    this.axisBtn = btn('Als Symmetrieachse verwenden / aufheben', icons.axis, () => toggleAxis(app));
    this.marksBtn = btn('Mittellinien ein/aus', icons.centerMark, () => toggleMarks(app));
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
      h('div', { class: 'sep' }),
      btn('Löschen (Entf)', icons.trash, () => deleteSelection(app), 'danger'),
      this.layerMenu,
    );
    app.onUiChange(() => this.update());
    this.update();
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
    const round = sel.filter((e) => e.kind === 'circle' || e.kind === 'arc');
    this.marksBtn.hidden = round.length === 0;
    this.marksBtn.classList.toggle('active', round.length > 0 && round.every((e) => (e.kind === 'circle' || e.kind === 'arc') && e.mark));
  }
}
