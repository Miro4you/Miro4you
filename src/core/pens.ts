import type { LineType, PenKind, Style } from './types';

export const PENCIL_WIDTHS = [0.3, 0.5, 0.7, 0.9] as const;
export const INK_WIDTHS = [0.18, 0.25, 0.35, 0.5, 0.7] as const;

export type Theme = 'light' | 'dark';

/** Standard pen colours per theme: graphite and black on paper, light greys on dark. */
const THEME_PENS: Record<Theme, Record<PenKind, string>> = {
  light: { pencil: '#42454c', ink: '#121212' },
  dark: { pencil: '#b4b8c1', ink: '#eeeef1' },
};

export const PAPER_COLORS: Record<Theme, string> = { light: '#fbfaf6', dark: '#1c1d21' };

let theme: Theme = 'light';

/** Colour scheme for standard pen colours and paper (exports always use 'light'). */
export function setPenTheme(t: Theme): void {
  theme = t;
}

export function currentTheme(): Theme {
  return theme;
}

export function standardColor(pen: PenKind): string {
  return THEME_PENS[theme][pen];
}

export const PEN_NAMES: Record<PenKind, string> = {
  pencil: 'Bleistift',
  ink: 'Tusche',
};

export interface LineTypeInfo {
  id: LineType;
  name: string;
  use: string;
}

/** Line types offered in the palette (freehand stays readable in old drawings). */
export const LINE_TYPES: LineTypeInfo[] = [
  { id: 'solid', name: 'Volllinie', use: 'Sichtbare Kanten' },
  { id: 'dashed', name: 'Strichlinie', use: 'Verdeckte Kanten' },
  { id: 'dashdot', name: 'Strich-Punkt-Linie', use: 'Mittel- und Symmetrielinien' },
  { id: 'dashdotdot', name: 'Strich-Zweipunkt-Linie', use: 'Grenzstellungen, angrenzende Teile' },
];

/**
 * ISO 128-20 line elements as multiples of the line width d:
 * dash 12d, long dash 24d, gap 3d, dot ≤ 0.5d.
 * Entries alternate [visible, gap, visible, gap, …].
 */
const ISO_ELEMENTS: Record<LineType, number[] | null> = {
  solid: null,
  freehand: null,
  dashed: [12, 3],
  dashdot: [24, 3, 0.5, 3],
  dashdotdot: [24, 3, 0.5, 3, 0.5, 3],
};

/**
 * Canvas dash array for a line type drawn with round caps at width `d`.
 * Round caps add d/2 at each end of every dash, so visible parts are shortened
 * by d and gaps lengthened by d; dots collapse to (almost) zero length and are
 * rendered by the cap as a round dot of diameter d.
 */
export function dashArray(lineType: LineType, d: number): number[] {
  const el = ISO_ELEMENTS[lineType];
  if (!el) return [];
  return el.map((k, i) => (i % 2 === 0 ? Math.max(k * d - d, 0.001 * d) : k * d + d));
}

export function penColor(style: Style): string {
  return style.color ?? standardColor(style.pen);
}

export function formatWidth(w: number): string {
  return w.toFixed(2).replace(/0$/, '').replace('.', ',');
}

export const DEFAULT_STYLE: Style = { pen: 'pencil', width: 0.5, lineType: 'solid', color: null };
