import type { App } from '../app';
import { PEN_COLORS } from '../core/pens';
import { h } from './dom';

/** Colours offered next to the standard graphite/black. */
const SWATCHES: [string, string][] = [
  ['#d33b31', 'Rot'],
  ['#e97c22', 'Orange'],
  ['#c9a227', 'Ocker'],
  ['#2f9150', 'Grün'],
  ['#1f8ea3', 'Petrol'],
  ['#2b63e6', 'Blau'],
  ['#6a4fc9', 'Violett'],
  ['#c23f86', 'Magenta'],
  ['#8a5a36', 'Braun'],
  ['#6f7685', 'Grau'],
];

/**
 * Colour choice for the pen: standard (graphite for pencils, black for ink),
 * a set of swatches and any colour via the system colour picker.
 * With a selection, the colour applies to the selected objects too.
 */
export class ColorPopover {
  readonly el = h('div', { class: 'color-pop panel', role: 'dialog', 'aria-label': 'Farbe' });
  private buttons: HTMLButtonElement[] = [];
  private custom: HTMLInputElement;
  private open = false;

  constructor(private app: App) {
    const std = h('button', { class: 'std-btn', text: 'Standard' });
    std.addEventListener('click', () => this.pick(null));
    const grid = h('div', { class: 'swatches' });
    for (const [c, name] of SWATCHES) {
      const b = h('button', { class: 'sw', title: name, 'aria-label': name, style: `background:${c}` });
      b.dataset.color = c;
      b.addEventListener('click', () => this.pick(c));
      this.buttons.push(b);
      grid.append(b);
    }
    this.custom = h('input', { type: 'color', id: 'pen-color', title: 'Eigene Farbe', 'aria-label': 'Eigene Farbe' });
    this.custom.addEventListener('input', () => this.pick(this.custom.value, false));
    this.custom.addEventListener('change', () => this.close());
    const customLabel = h('label', { class: 'custom-color' }, [this.custom, h('span', { text: 'Eigene Farbe …' })]);
    this.el.append(std, grid, customLabel);
    app.onUiChange(() => this.update());
    document.addEventListener('pointerdown', (e) => {
      if (!this.open) return;
      const t = e.target as Node;
      if (!this.el.contains(t) && !(t as HTMLElement).closest?.('.color-btn')) this.close();
    });
  }

  private pick(color: string | null, close = true): void {
    this.app.setStyle({ color });
    if (close) this.close();
  }

  private update(): void {
    const c = this.app.style.color;
    for (const b of this.buttons) b.classList.toggle('active', b.dataset.color === c);
    const std = this.el.querySelector('.std-btn') as HTMLElement;
    std.classList.toggle('active', c === null);
    std.style.setProperty('--std', PEN_COLORS[this.app.style.pen]);
    if (c) this.custom.value = c;
  }

  toggle(anchor: HTMLElement): void {
    if (this.open) {
      this.close();
      return;
    }
    this.open = true;
    this.el.classList.add('open');
    this.update();
    // Above the button if there is room, else below; kept on screen.
    const r = anchor.getBoundingClientRect();
    const w = this.el.offsetWidth || 220;
    const hgt = this.el.offsetHeight || 170;
    const x = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8);
    const y = r.top - hgt - 10 > 8 ? r.top - hgt - 10 : Math.min(r.bottom + 10, window.innerHeight - hgt - 8);
    this.el.style.left = `${x}px`;
    this.el.style.top = `${y}px`;
  }

  close(): void {
    this.open = false;
    this.el.classList.remove('open');
  }
}
