import type { Vec } from '../core/geom';

export type PointerKind = 'pen' | 'mouse' | 'touch';

export interface ToolEvent {
  /** CSS px relative to the canvas. */
  screen: Vec;
  /** World mm. */
  world: Vec;
  pressure: number;
  pointerType: PointerKind;
}

export interface Tool {
  readonly id: string;
  down(ev: ToolEvent): void;
  move(ev: ToolEvent): void;
  up(ev: ToolEvent): void;
  /** Abort the current gesture without committing. */
  cancel(): void;
  /** Pointer hovering without contact (mouse, Apple Pencil hover); null when it leaves. */
  hover(ev: ToolEvent | null): void;
  /** Draw previews in screen space (context scaled to CSS px). */
  overlay(ctx: CanvasRenderingContext2D): void;
  /** Called when switching away from the tool or when the document changes underneath. */
  reset(): void;
  /** True while a gesture is in progress. */
  readonly busy: boolean;
  /**
   * True when the next press snaps to geometry: the app then shows the snap
   * point (and nearby candidates) under the hovering pen or mouse.
   */
  readonly hoverSnap?: boolean;
}
