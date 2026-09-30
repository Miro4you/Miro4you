import type { App, ToolId } from '../app';
import { formatWidth, INK_WIDTHS, LINE_TYPES, PEN_NAMES, PENCIL_WIDTHS } from '../core/pens';
import type { LineType, PenKind } from '../core/types';
import { loadPref, savePref } from '../storage/idb';
import { icons, lineTypeIcon } from './icons';
import { h } from './dom';

type Orient = 'h' | 'v';
interface PalettePrefs {
  x: number | null;
  y: number | null;
  orient: Orient;
  collapsed: boolean;
}

/** Index 0–8 across both pen sets (keyboard 1–9). */
export const ALL_PENS: { pen: PenKind; width: number }[] = [
  ...PENCIL_WIDTHS.map((width) => ({ pen: 'pencil' as const, width })),
  ...INK_WIDTHS.map((width) => ({ pen: 'ink' as const, width })),
];

const LINE_DASH: Record<LineType, string> = {
  solid: '',
  dashed: '3.2 4.2',
  dashdot: '7 3.6 0.01 3.6',
  dashdotdot: '5.5 3 0.01 3 0.01 3',
  freehand: '',
};

const ANGLE_LABEL = { snap: '5°', show: 'Anzeige', off: 'Aus' } as const;
const ANGLE_TITLE = {
  snap: 'Winkelfang: rastet in 5°-Schritten ein (A)',
  show: 'Winkel: nur Anzeige, kein Einrasten (A)',
  off: 'Winkel: aus (A)',
} as const;

/** Floating, draggable tool palette. */
export class Palette {
  readonly el: HTMLElement;
  private prefs: PalettePrefs = loadPref<PalettePrefs>('palette', { x: null, y: null, orient: 'h', collapsed: false });
  private toolBtns = new Map<ToolId, HTMLButtonElement>();
  private penBtns: HTMLButtonElement[] = [];
  private lineBtns = new Map<LineType, HTMLButtonElement>();
  private snapBtn: HTMLButtonElement;
  private angleBtn: HTMLButtonElement;
  private undoBtn: HTMLButtonElement;
  private redoBtn: HTMLButtonElement;

  constructor(private app: App) {
    const tools = h('div', { class: 'group tools' });
    for (const [id, title, icon] of [
      ['freehand', 'Freihand (F)', icons.freehand],
      ['line', 'Linie (L)', icons.line],
    ] as const) {
      const b = h('button', { class: 'btn', title, 'aria-label': title, html: icon });
      b.addEventListener('click', () => app.setTool(id));
      this.toolBtns.set(id, b);
      tools.append(b);
    }

    const pencils = h('div', { class: 'group pens', 'data-pen': 'pencil' });
    const inks = h('div', { class: 'group pens', 'data-pen': 'ink' });
    ALL_PENS.forEach((p, i) => {
      const title = `${PEN_NAMES[p.pen]} ${formatWidth(p.width)} mm (${i + 1})`;
      const size = 3.5 + p.width * 12;
      const b = h('button', { class: `chip ${p.pen}`, title, 'aria-label': title });
      b.append(
        h('span', { class: 'dot', style: `width:${size}px;height:${size}px` }),
        h('span', { class: 'cap', text: formatWidth(p.width) }),
      );
      b.addEventListener('click', () => this.selectPen(i));
      this.penBtns.push(b);
      (p.pen === 'pencil' ? pencils : inks).append(b);
    });

    const lines = h('div', { class: 'group linetypes' });
    for (const lt of LINE_TYPES) {
      const title = `${lt.name} – ${lt.use}`;
      const b = h('button', { class: 'btn lt', title, 'aria-label': title, html: lineTypeIcon(LINE_DASH[lt.id], lt.id === 'freehand') });
      b.addEventListener('click', () => app.setStyle({ lineType: lt.id }));
      this.lineBtns.set(lt.id, b);
      lines.append(b);
    }

    this.snapBtn = h('button', { class: 'btn toggle', title: 'Fang an Endpunkten, Mitten, Schnittpunkten (S)' });
    this.snapBtn.innerHTML = `${icons.snap}<span class="cap">Fang</span>`;
    this.snapBtn.addEventListener('click', () => app.updateSettings({ snap: !app.settings.snap }));
    this.angleBtn = h('button', { class: 'btn toggle' });
    this.angleBtn.addEventListener('click', () => {
      const next = { snap: 'show', show: 'off', off: 'snap' } as const;
      app.updateSettings({ angleMode: next[app.settings.angleMode] });
    });
    const toggles = h('div', { class: 'group toggles' }, [this.snapBtn, this.angleBtn]);

    this.undoBtn = h('button', { class: 'btn', title: 'Rückgängig (⌘Z · Zwei-Finger-Tipp)', html: icons.undo });
    this.redoBtn = h('button', { class: 'btn', title: 'Wiederholen (⇧⌘Z · Drei-Finger-Tipp)', html: icons.redo });
    this.undoBtn.addEventListener('click', () => app.undo());
    this.redoBtn.addEventListener('click', () => app.redo());
    const history = h('div', { class: 'group history' }, [this.undoBtn, this.redoBtn]);

    const grip = h('div', { class: 'grip', title: 'Ziehen zum Verschieben · Doppeltippen: quer/hoch', html: icons.grip });
    const collapse = h('button', { class: 'btn collapse', title: 'Einklappen' });
    collapse.addEventListener('click', () => {
      this.prefs.collapsed = !this.prefs.collapsed;
      this.applyLayout();
      this.savePrefs();
    });

    const sep = () => h('div', { class: 'sep' });
    const body = h('div', { class: 'pal-body' }, [
      tools,
      sep(),
      pencils,
      inks,
      sep(),
      lines,
      sep(),
      toggles,
      sep(),
      history,
    ]);
    this.el = h('div', { class: 'palette panel' }, [grip, body, collapse]);
    this.setupDrag(grip);

    document.addEventListener('app:pen', (e) => this.selectPen((e as CustomEvent<number>).detail));
    app.onUiChange(() => this.update());
    window.addEventListener('resize', () => this.clampIntoView());
  }

  mount(parent: HTMLElement): void {
    parent.append(this.el);
    this.applyLayout();
    this.update();
  }

  private selectPen(i: number): void {
    const p = ALL_PENS[i];
    if (p) this.app.setStyle({ pen: p.pen, width: p.width });
  }

  update(): void {
    const { style, settings, toolId, doc } = this.app;
    for (const [id, b] of this.toolBtns) b.classList.toggle('active', id === toolId);
    ALL_PENS.forEach((p, i) => this.penBtns[i].classList.toggle('active', p.pen === style.pen && p.width === style.width));
    for (const [id, b] of this.lineBtns) b.classList.toggle('active', id === style.lineType);
    this.snapBtn.classList.toggle('active', settings.snap);
    this.snapBtn.classList.toggle('paused', settings.snap && this.app.snapSuspended);
    if (this.angleBtn.dataset.mode !== settings.angleMode) {
      this.angleBtn.dataset.mode = settings.angleMode;
      this.angleBtn.classList.toggle('active', settings.angleMode === 'snap');
      this.angleBtn.title = ANGLE_TITLE[settings.angleMode];
      this.angleBtn.innerHTML = `${icons.angle}<span class="cap">${ANGLE_LABEL[settings.angleMode]}</span>`;
    }
    this.undoBtn.disabled = !doc.canUndo;
    this.redoBtn.disabled = !doc.canRedo;
  }

  // ---- layout & dragging ------------------------------------------------------------

  private applyLayout(): void {
    this.el.dataset.orient = this.prefs.orient;
    this.el.classList.toggle('collapsed', this.prefs.collapsed);
    const c = this.el.querySelector('.collapse') as HTMLElement;
    c.innerHTML = this.prefs.collapsed ? icons.expand : icons.collapse;
    c.title = this.prefs.collapsed ? 'Ausklappen' : 'Einklappen';
    if (this.prefs.x === null || this.prefs.y === null) {
      // Default: centred at the bottom.
      requestAnimationFrame(() => {
        const r = this.el.getBoundingClientRect();
        this.setPos((window.innerWidth - r.width) / 2, window.innerHeight - r.height - 18);
      });
    } else {
      requestAnimationFrame(() => this.setPos(this.prefs.x!, this.prefs.y!));
    }
  }

  private setPos(x: number, y: number): void {
    const r = this.el.getBoundingClientRect();
    const m = 8;
    const cx = Math.min(Math.max(m, x), Math.max(m, window.innerWidth - r.width - m));
    const cy = Math.min(Math.max(m, y), Math.max(m, window.innerHeight - r.height - m));
    this.el.style.left = `${cx}px`;
    this.el.style.top = `${cy}px`;
    this.prefs.x = cx;
    this.prefs.y = cy;
  }

  private clampIntoView(): void {
    if (this.prefs.x !== null && this.prefs.y !== null) this.setPos(this.prefs.x, this.prefs.y);
    else this.applyLayout();
  }

  private savePrefs(): void {
    savePref('palette', this.prefs);
  }

  /**
   * Switch orientation, keeping the palette attached to the side it was dropped at
   * (`dock`), or centred on its previous centre when toggled by double tap.
   */
  private setOrient(o: Orient, dock: 'left' | 'right' | 'top' | 'bottom' | null): void {
    const before = this.el.getBoundingClientRect();
    if (o !== this.prefs.orient) {
      this.prefs.orient = o;
      this.el.dataset.orient = o;
    }
    const r = this.el.getBoundingClientRect();
    const cx = before.left + before.width / 2;
    const cy = before.top + before.height / 2;
    let x = cx - r.width / 2;
    let y = cy - r.height / 2;
    if (dock === 'left') x = before.left;
    else if (dock === 'right') x = before.right - r.width;
    else if (dock === 'top') y = before.top;
    else if (dock === 'bottom') y = before.bottom - r.height;
    this.setPos(x, y);
  }

  private setupDrag(grip: HTMLElement): void {
    let drag: { id: number; dx: number; dy: number; sx: number; sy: number; moved: boolean } | null = null;
    let lastTap = 0;
    grip.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const r = this.el.getBoundingClientRect();
      drag = { id: e.pointerId, dx: e.clientX - r.left, dy: e.clientY - r.top, sx: e.clientX, sy: e.clientY, moved: false };
      grip.setPointerCapture(e.pointerId);
      this.el.classList.add('dragging');
    });
    grip.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 5) return;
      drag.moved = true;
      this.setPos(e.clientX - drag.dx, e.clientY - drag.dy);
    });
    const end = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      const moved = drag.moved;
      drag = null;
      this.el.classList.remove('dragging');
      const r = this.el.getBoundingClientRect();
      if (moved) {
        // Docking near a side edge turns the palette upright, near top/bottom flat.
        const edge = 72;
        if (r.left < edge) this.setOrient('v', 'left');
        else if (r.right > window.innerWidth - edge) this.setOrient('v', 'right');
        else if (r.top < edge) this.setOrient('h', 'top');
        else if (r.bottom > window.innerHeight - edge) this.setOrient('h', 'bottom');
      } else {
        const now = performance.now();
        if (now - lastTap < 350) this.setOrient(this.prefs.orient === 'h' ? 'v' : 'h', null);
        lastTap = now;
      }
      this.savePrefs();
    };
    grip.addEventListener('pointerup', end);
    grip.addEventListener('pointercancel', end);
  }
}
