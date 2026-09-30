import type { LineType, PenKind, Style } from './types';

export const PENCIL_WIDTHS = [0.3, 0.5, 0.7, 0.9] as const;
export const INK_WIDTHS = [0.18, 0.25, 0.35, 0.5, 0.7] as const;

export const PEN_COLORS: Record<PenKind, string> = {
  pencil: '#42454c', // graphite
  ink: '#121212',
};

export const PEN_NAMES: Record<PenKind, string> = {
  pencil: 'Bleistift',
  ink: 'Tusche',
};

export interface LineTypeInfo {
  id: LineType;
  name: string;
  use: string;
}

export const LINE_TYPES: LineTypeInfo[] = [
  { id: 'solid', name: 'Volllinie', use: 'Sichtbare Kanten' },
  { id: 'dashed', name: 'Strichlinie', use: 'Verdeckte Kanten' },
  { id: 'dashdot', name: 'Strich-Punkt-Linie', use: 'Mittel- und Symmetrielinien' },
  { id: 'dashdotdot', name: 'Strich-Zweipunkt-Linie', use: 'Grenzstellungen, angrenzende Teile' },
  { id: 'freehand', name: 'Freihandlinie', use: 'Bruchkanten' },
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
  return style.color ?? PEN_COLORS[style.pen];
}

export function formatWidth(w: number): string {
  return w.toFixed(2).replace(/0$/, '').replace('.', ',');
}

export const DEFAULT_STYLE: Style = { pen: 'pencil', width: 0.5, lineType: 'solid', color: null };
