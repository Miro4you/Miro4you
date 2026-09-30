import { h } from './dom';

const HOVER_OPEN_MS = 260;
const HOVER_CLOSE_MS = 450;
const LONG_PRESS_MS = 380;

let openFlyout: Flyout | null = null;

/**
 * Small pop-out panel attached to a trigger button. Opens on tap (via `open()`),
 * on long press, or when the Apple Pencil (or mouse) hovers over the trigger.
 * Press on the trigger, slide onto an item and lift to pick it in one gesture.
 */
export class Flyout {
  readonly el: HTMLElement;
  private anchor: HTMLElement | null = null;
  private hoverOpened = false;
  private hoverTimer: number | undefined;
  private closeTimer: number | undefined;

  constructor(
    content: HTMLElement[],
    private side: () => 'above' | 'right' = () => 'above',
    cls = '',
  ) {
    this.el = h('div', { class: `flyout panel ${cls}`, role: 'menu' }, content);
    document.body.append(this.el);
    this.el.addEventListener('pointerenter', () => window.clearTimeout(this.closeTimer));
    this.el.addEventListener('pointerleave', () => this.scheduleHoverClose());
    document.addEventListener('pointerdown', (e) => {
      if (openFlyout !== this) return;
      const t = e.target as Node;
      if (!this.el.contains(t) && !this.anchor?.contains(t)) this.close();
    });
  }

  get isOpen(): boolean {
    return openFlyout === this;
  }

  open(anchor: HTMLElement, viaHover = false): void {
    if (openFlyout && openFlyout !== this) openFlyout.close();
    openFlyout = this;
    this.anchor = anchor;
    this.hoverOpened = viaHover;
    window.clearTimeout(this.closeTimer);
    this.el.classList.add('open');
    this.place();
  }

  close(): void {
    if (openFlyout === this) openFlyout = null;
    this.el.classList.remove('open');
    window.clearTimeout(this.hoverTimer);
    window.clearTimeout(this.closeTimer);
  }

  /** Re-place after the content changed size. */
  reposition(): void {
    if (this.isOpen) this.place();
  }

  toggle(anchor: HTMLElement): void {
    if (this.isOpen && this.anchor === anchor) this.close();
    else this.open(anchor);
  }

  private place(): void {
    if (!this.anchor) return;
    const r = this.anchor.getBoundingClientRect();
    const w = this.el.offsetWidth;
    const hh = this.el.offsetHeight;
    const gap = 10;
    let x: number;
    let y: number;
    if (this.side() === 'right') {
      x = r.right + gap;
      if (x + w > window.innerWidth - 8) x = r.left - gap - w;
      y = r.top + r.height / 2 - hh / 2;
    } else {
      x = r.left + r.width / 2 - w / 2;
      y = r.top - gap - hh;
      if (y < 8) y = r.bottom + gap;
    }
    this.el.style.left = `${Math.min(Math.max(8, x), window.innerWidth - w - 8)}px`;
    this.el.style.top = `${Math.min(Math.max(8, y), window.innerHeight - hh - 8)}px`;
  }

  private scheduleHoverClose(): void {
    if (!this.hoverOpened) return;
    window.clearTimeout(this.closeTimer);
    this.closeTimer = window.setTimeout(() => this.close(), HOVER_CLOSE_MS);
  }

  /**
   * Wire a trigger: hover (pen/mouse without contact) and long press open the
   * flyout; `onTap` handles a normal tap. Sliding from the trigger onto an item
   * and lifting picks the item.
   */
  attach(trigger: HTMLElement, onTap: () => void): void {
    let press: { id: number; timer: number; opened: boolean } | null = null;
    trigger.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'touch' || e.buttons) return;
      window.clearTimeout(this.hoverTimer);
      this.hoverTimer = window.setTimeout(() => this.open(trigger, true), HOVER_OPEN_MS);
    });
    trigger.addEventListener('pointerleave', () => {
      window.clearTimeout(this.hoverTimer);
      if (this.isOpen) this.scheduleHoverClose();
    });
    trigger.addEventListener('pointerdown', (e) => {
      window.clearTimeout(this.hoverTimer);
      const timer = window.setTimeout(() => {
        if (press) press.opened = true;
        this.open(trigger);
      }, LONG_PRESS_MS);
      press = { id: e.pointerId, timer, opened: false };
      trigger.releasePointerCapture?.(e.pointerId);
    });
    const finish = (e: PointerEvent, cancelled: boolean) => {
      if (!press || press.id !== e.pointerId) return;
      window.clearTimeout(press.timer);
      const opened = press.opened;
      press = null;
      if (cancelled) return;
      const target = document.elementFromPoint(e.clientX, e.clientY);
      const item = target?.closest('[data-item]') as HTMLElement | null;
      if (item && this.el.contains(item)) {
        item.click();
        return;
      }
      if (!opened && trigger.contains(target)) onTap();
    };
    document.addEventListener('pointerup', (e) => finish(e, false));
    document.addEventListener('pointercancel', (e) => finish(e, true));
  }
}

/** Close whatever flyout is open (e.g. when drawing starts). */
export function closeFlyouts(): void {
  openFlyout?.close();
}
