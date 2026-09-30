import type { App, ToolId } from '../app';
import { formatWidth, INK_WIDTHS, LINE_TYPES, PEN_NAMES, PENCIL_WIDTHS } from '../core/pens';
import type { LineType, PenKind } from '../core/types';
import { loadPref, savePref } from '../storage/idb';
import { icons, lineTypeIcon } from './icons';
import { h } from './dom';
import { Flyout } from './flyout';
import { ColorPopover } from './colors';
import { penColor } from '../core/pens';

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


type ShapeId = 'line' | 'circle' | 'arc' | 'arc-center' | 'cross';
type EraseId = 'delete' | 'trim' | 'erase';

const SHAPES: { id: ShapeId; tool: ToolId; title: string; icon: string }[] = [
  { id: 'line', tool: 'line', title: 'Linie (L)', icon: icons.line },
  { id: 'circle', tool: 'circle', title: 'Kreis: Mittelpunkt, dann Radius (C)', icon: icons.circle },
  { id: 'arc', tool: 'arc', title: 'Bogen: am Linienende tangential, sonst Mittelpunkt zuerst (B)', icon: icons.arc },
  { id: 'arc-center', tool: 'arc', title: 'Bogen um Mittelpunkt', icon: icons.arcCenter },
  { id: 'cross', tool: 'cross', title: 'Achsenkreuz: Mittelpunkt, dann Armlänge (K)', icon: icons.cross },
];
const ERASERS: { id: EraseId; title: string; icon: string }[] = [
  { id: 'delete', title: 'Objekt löschen: antippen oder drüberwischen (X)', icon: icons.deleteObj },
  { id: 'trim', title: 'Trimmen bis zum nächsten Schnittpunkt (T)', icon: icons.trim },
  { id: 'erase', title: 'Radierer (E)', icon: icons.eraser },
];

/** Floating, draggable tool palette with pop-out groups. */
export class Palette {
  readonly el: HTMLElement;
  private prefs: PalettePrefs = loadPref<PalettePrefs>('palette', { x: null, y: null, orient: 'h', collapsed: false });
  private selectBtn: HTMLButtonElement;
  private freeBtn: HTMLButtonElement;
  private shapeBtn: HTMLButtonElement;
  private eraseBtn: HTMLButtonElement;
  private penBtn: HTMLButtonElement;
  private lineBtn: HTMLButtonElement;
  private colorBtn: HTMLButtonElement;
  private snapBtn: HTMLButtonElement;
  private angleBtn: HTMLButtonElement;
  private undoBtn: HTMLButtonElement;
  private redoBtn: HTMLButtonElement;
  private colors: ColorPopover;
  private flyouts: Flyout[] = [];
  private lastShape: ShapeId = loadPref<{ id: ShapeId }>('lastShape', { id: 'line' }).id;
  private lastErase: EraseId = loadPref<{ id: EraseId }>('lastErase', { id: 'trim' }).id;
  private shapeItems = new Map<ShapeId, HTMLButtonElement>();
  private eraseItems = new Map<EraseId, HTMLButtonElement>();
  private penItems: HTMLButtonElement[] = [];
  private lineItems = new Map<LineType, HTMLButtonElement>();
  private angleItems = new Map<string, HTMLButtonElement>();
  private stabilizer: HTMLInputElement;
  private stabilizerValue: HTMLElement;

  constructor(private app: App) {
    this.colors = new ColorPopover(app);
    const side = () => (this.prefs.orient === 'v' ? 'right' : 'above') as 'above' | 'right';
    const btn = (title: string, html: string, cls = 'btn tool') => h('button', { class: cls, title, 'aria-label': title, html });
    const item = (title: string, html: string, onPick: () => void, fly: () => Flyout, cls = 'btn') => {
      const b = h('button', { class: `${cls} fly-item`, title, 'aria-label': title, html, 'data-item': '1' });
      b.addEventListener('click', () => {
        onPick();
        fly().close();
      });
      return b;
    };

    // Selection and freehand (with smoothing options).
    this.selectBtn = btn('Auswahl (V)', icons.select);
    this.selectBtn.addEventListener('click', () => app.setTool('select'));
    this.freeBtn = btn('Freihand (F) · nochmal tippen: Glättung', icons.freehand);
    this.stabilizer = h('input', { type: 'range', min: '0', max: '60', step: '2', id: 'stabilizer', 'aria-label': 'Glättung' });
    this.stabilizerValue = h('span', { class: 'range-value' });
    this.stabilizer.addEventListener('input', () => app.updateSettings({ stabilizer: Number(this.stabilizer.value) }));
    const freeFly = new Flyout(
      [
        h('div', { class: 'fly-title', text: 'Glättung (Schnur)' }),
        h('div', { class: 'range-row' }, [this.stabilizer, this.stabilizerValue]),
        h('div', { class: 'fly-hint', text: 'Die Linie folgt dem Stift an einer Schnur – ruhige Wellen, z. B. für Bruchkanten.' }),
      ],
      side,
      'fly-wide',
    );
    freeFly.attach(this.freeBtn, () => {
      if (app.toolId === 'freehand') freeFly.toggle(this.freeBtn);
      else app.setTool('freehand');
    });

    // Shapes group.
    this.shapeBtn = btn('Formen: Linie, Kreis, Bogen, Achsenkreuz', icons.line);
    const shapeFly: Flyout = new Flyout(
      SHAPES.map((s) => {
        const b = item(s.title, s.icon, () => this.pickShape(s.id), () => shapeFly);
        this.shapeItems.set(s.id, b);
        return b;
      }),
      side,
      'fly-row',
    );
    shapeFly.attach(this.shapeBtn, () => {
      if (SHAPES.some((s) => s.tool === app.toolId)) shapeFly.toggle(this.shapeBtn);
      else this.pickShape(this.lastShape);
    });

    // Erase group.
    this.eraseBtn = btn('Löschen: Objekt, Trimmen, Radierer', icons.trim);
    const eraseFly: Flyout = new Flyout(
      ERASERS.map((s) => {
        const b = item(s.title, s.icon, () => this.pickErase(s.id), () => eraseFly);
        this.eraseItems.set(s.id, b);
        return b;
      }),
      side,
      'fly-row',
    );
    eraseFly.attach(this.eraseBtn, () => {
      if (ERASERS.some((s) => s.id === app.toolId)) eraseFly.toggle(this.eraseBtn);
      else this.pickErase(this.lastErase);
    });

    // Pens.
    this.penBtn = h('button', { class: 'chip pen-trigger', title: 'Stift wählen (1–9)', 'aria-label': 'Stift' });
    const pencils = h('div', { class: 'pen-row' }, [h('span', { class: 'row-label', text: 'Bleistift' })]);
    const inks = h('div', { class: 'pen-row' }, [h('span', { class: 'row-label', text: 'Tusche' })]);
    const penFly: Flyout = new Flyout([pencils, inks], side, 'fly-pens');
    ALL_PENS.forEach((p, i) => {
      const title = `${PEN_NAMES[p.pen]} ${formatWidth(p.width)} mm (${i + 1})`;
      const b = item(title, '', () => this.selectPen(i), () => penFly, `chip ${p.pen}`);
      b.append(this.penDot(p.pen, p.width), h('span', { class: 'cap', text: formatWidth(p.width) }));
      this.penItems.push(b);
      (p.pen === 'pencil' ? pencils : inks).append(b);
    });
    penFly.attach(this.penBtn, () => penFly.toggle(this.penBtn));

    // Line types.
    this.lineBtn = btn('Linienart', '', 'btn lt');
    const lineFly: Flyout = new Flyout(
      LINE_TYPES.map((lt) => {
        const b = item(`${lt.name} – ${lt.use}`, lineTypeIcon(LINE_DASH[lt.id]), () => app.setStyle({ lineType: lt.id }), () => lineFly, 'btn lt');
        this.lineItems.set(lt.id, b);
        return b;
      }),
      side,
      'fly-row',
    );
    lineFly.attach(this.lineBtn, () => lineFly.toggle(this.lineBtn));

    // Colour.
    this.colorBtn = h('button', { class: 'btn color-btn', title: 'Farbe', 'aria-label': 'Farbe' });
    this.colorBtn.append(h('span', { class: 'swatch' }));
    this.colorBtn.addEventListener('click', () => this.colors.toggle(this.colorBtn));

    // Snapping.
    this.snapBtn = h('button', { class: 'btn toggle', title: 'Fang an Endpunkten, Mitten, Schnittpunkten (S)' });
    this.snapBtn.innerHTML = `${icons.snap}<span class="cap">Fang</span>`;
    this.snapBtn.addEventListener('click', () => app.updateSettings({ snap: !app.settings.snap }));
    this.angleBtn = h('button', { class: 'btn toggle', title: 'Winkelfang (A)' });
    const modeRow = h('div', { class: 'seg' });
    for (const [mode, label] of [
      ['snap', 'Einrasten'],
      ['show', 'Nur Anzeige'],
      ['off', 'Aus'],
    ] as const) {
      const b = h('button', { class: 'seg-btn', text: label, 'data-item': '1' });
      b.addEventListener('click', () => app.updateSettings({ angleMode: mode }));
      this.angleItems.set(mode, b);
      modeRow.append(b);
    }
    const stepRow = h('div', { class: 'seg' });
    for (const step of [5, 10, 15]) {
      const b = h('button', { class: 'seg-btn', text: `${step}°`, 'data-item': '1' });
      b.addEventListener('click', () => app.updateSettings({ angleStep: step, angleMode: 'snap' }));
      this.angleItems.set(`s${step}`, b);
      stepRow.append(b);
    }
    const angleFly = new Flyout(
      [h('div', { class: 'fly-title', text: 'Winkel' }), modeRow, h('div', { class: 'fly-title', text: 'Schritt' }), stepRow],
      side,
      'fly-wide',
    );
    angleFly.attach(this.angleBtn, () => angleFly.toggle(this.angleBtn));

    this.undoBtn = h('button', { class: 'btn', title: 'Rückgängig (⌘Z · Zwei-Finger-Tipp)', html: icons.undo });
    this.redoBtn = h('button', { class: 'btn', title: 'Wiederholen (⇧⌘Z · Drei-Finger-Tipp)', html: icons.redo });
    this.undoBtn.addEventListener('click', () => app.undo());
    this.redoBtn.addEventListener('click', () => app.redo());

    this.flyouts = [freeFly, shapeFly, eraseFly, penFly, lineFly, angleFly];

    const grip = h('div', { class: 'grip', title: 'Ziehen zum Verschieben · Doppeltippen: quer/hoch', html: icons.grip });
    const collapse = h('button', { class: 'btn collapse', title: 'Einklappen' });
    collapse.addEventListener('click', () => {
      this.prefs.collapsed = !this.prefs.collapsed;
      this.applyLayout();
      this.savePrefs();
    });

    const group = (...els: HTMLElement[]) => h('div', { class: 'group' }, els);
    const sep = () => h('div', { class: 'sep' });
    const body = h('div', { class: 'pal-body' }, [
      group(this.selectBtn, this.freeBtn, this.shapeBtn, this.eraseBtn),
      sep(),
      group(this.penBtn, this.lineBtn, this.colorBtn),
      sep(),
      group(this.snapBtn, this.angleBtn),
      sep(),
      group(this.undoBtn, this.redoBtn),
    ]);
    this.el = h('div', { class: 'palette panel' }, [grip, body, collapse]);
    this.setupDrag(grip);

    document.addEventListener('app:pen', (e) => this.selectPen((e as CustomEvent<number>).detail));
    app.onUiChange(() => this.update());
    window.addEventListener('resize', () => this.clampIntoView());
  }

  mount(parent: HTMLElement): void {
    parent.append(this.el, this.colors.el);
    this.applyLayout();
    this.update();
  }

  closeFlyouts(): void {
    for (const f of this.flyouts) f.close();
    this.colors.close();
  }

  private penDot(pen: string, width: number): HTMLElement {
    const size = 3.5 + width * 12;
    return h('span', { class: `dot ${pen}`, style: `width:${size}px;height:${size}px` });
  }

  private pickShape(id: ShapeId): void {
    const s = SHAPES.find((x) => x.id === id)!;
    if (s.tool === 'arc') this.app.updateSettings({ arcMode: id === 'arc-center' ? 'center' : 'auto' });
    this.app.setTool(s.tool);
    this.lastShape = id;
    savePref('lastShape', { id });
  }

  private pickErase(id: EraseId): void {
    this.app.setTool(id);
    this.lastErase = id;
    savePref('lastErase', { id });
  }

  private selectPen(i: number): void {
    const p = ALL_PENS[i];
    if (p) this.app.setStyle({ pen: p.pen, width: p.width });
  }

  update(): void {
    const { style, settings, toolId, doc } = this.app;
    this.selectBtn.classList.toggle('active', toolId === 'select');
    this.freeBtn.classList.toggle('active', toolId === 'freehand');
    // Shape group shows the active (or last used) shape.
    const shape: ShapeId =
      toolId === 'arc' ? (settings.arcMode === 'center' ? 'arc-center' : 'arc') : SHAPES.some((s) => s.id === toolId) ? (toolId as ShapeId) : this.lastShape;
    this.shapeBtn.innerHTML = SHAPES.find((s) => s.id === shape)!.icon;
    this.shapeBtn.classList.toggle('active', SHAPES.some((s) => s.tool === toolId));
    for (const [id, b] of this.shapeItems) b.classList.toggle('active', id === shape && SHAPES.some((s) => s.tool === toolId));
    const erase: EraseId = ERASERS.some((e) => e.id === toolId) ? (toolId as EraseId) : this.lastErase;
    this.eraseBtn.innerHTML = ERASERS.find((e) => e.id === erase)!.icon;
    this.eraseBtn.classList.toggle('active', ERASERS.some((e) => e.id === toolId));
    for (const [id, b] of this.eraseItems) b.classList.toggle('active', id === toolId);

    this.penBtn.className = `chip pen-trigger ${style.pen}`;
    this.penBtn.replaceChildren(this.penDot(style.pen, style.width), h('span', { class: 'cap', text: formatWidth(style.width) }));
    ALL_PENS.forEach((p, i) => this.penItems[i].classList.toggle('active', p.pen === style.pen && p.width === style.width));
    this.lineBtn.innerHTML = lineTypeIcon(LINE_DASH[style.lineType]);
    for (const [id, b] of this.lineItems) b.classList.toggle('active', id === style.lineType);
    const swatch = this.colorBtn.querySelector('.swatch') as HTMLElement;
    swatch.style.background = penColor(style);
    this.colorBtn.classList.toggle('custom', style.color !== null);

    this.snapBtn.classList.toggle('active', settings.snap);
    this.snapBtn.classList.toggle('paused', settings.snap && this.app.snapSuspended);
    this.angleBtn.dataset.mode = settings.angleMode;
    this.angleBtn.classList.toggle('active', settings.angleMode === 'snap');
    const cap = settings.angleMode === 'snap' ? `${settings.angleStep}°` : settings.angleMode === 'show' ? 'Anz.' : 'Aus';
    this.angleBtn.innerHTML = `${icons.angle}<span class="cap">${cap}</span>`;
    for (const [k, b] of this.angleItems) {
      b.classList.toggle('active', k === settings.angleMode || (settings.angleMode === 'snap' && k === `s${settings.angleStep}`));
    }
    this.stabilizer.value = String(settings.stabilizer);
    this.stabilizerValue.textContent = settings.stabilizer ? `${settings.stabilizer} px` : 'aus';
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
