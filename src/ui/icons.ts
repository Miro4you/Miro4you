/** Inline SVG icons (24×24, stroke = currentColor). */

const svg = (body: string, extra = '') =>
  `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${body}</svg>`;

export const icons = {
  freehand: svg('<path d="M3.5 16.5c1.6-2.9 3-7.5 5.2-7.5 2.4 0 .6 7.2 3.3 7.2 2.3 0 3.1-6.7 5.6-6.7 1.4 0 2 1.3 2.9 2.6"/>'),
  line: svg('<path d="M5.5 18.5 18.5 5.5"/><circle cx="5" cy="19" r="1.7" fill="currentColor" stroke="none"/><circle cx="19" cy="5" r="1.7" fill="currentColor" stroke="none"/>'),
  select: svg('<path d="M6 3.5 18 13l-5.2.9 3.1 5.8-2.2 1.2-3.1-5.8L6.6 19z"/>'),
  circle: svg('<circle cx="12" cy="12" r="7.5"/><path d="M12 12h7.5" stroke-dasharray="2 2"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/>'),
  arc: svg('<path d="M4.5 19.5V13a8.5 8.5 0 0 1 8.5-8.5h6.5"/><circle cx="4.5" cy="19.5" r="1.5" fill="currentColor" stroke="none"/><circle cx="19.5" cy="4.5" r="1.5" fill="currentColor" stroke="none"/>'),
  deleteObj: svg('<path d="M4 17 15.5 5.5"/><path d="m13.5 14.5 6 6m0-6-6 6"/>'),
  trim: svg('<circle cx="6.5" cy="17.5" r="2.5"/><circle cx="6.5" cy="6.5" r="2.5"/><path d="M8.6 8.2 20 18.5M8.6 15.8 20 5.5"/>'),
  eraser: svg('<path d="m14.5 4.5 5 5-9.5 9.5H5.5L3 16.5z"/><path d="m9.5 9.5 5 5"/><path d="M10 19h10"/>'),
  duplicate: svg('<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>'),
  rotate90: svg('<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4h-4"/>'),
  flipH: svg('<path d="M12 3.5v17" stroke-dasharray="2 2"/><path d="M9 7 3.5 17H9zM15 7l5.5 10H15z"/>'),
  flipV: svg('<path d="M3.5 12h17" stroke-dasharray="2 2"/><path d="M7 9 17 3.5V9zM7 15l10 5.5V15z"/>'),
  axis: svg('<path d="M12 2.5v19" stroke-dasharray="5 2 1 2"/><path d="M9 8 4 12l5 4zM15 8l5 4-5 4z"/>'),
  centerMark: svg('<circle cx="12" cy="12" r="6.5"/><path d="M12 2.5v19M2.5 12h19" stroke-dasharray="5 2 1 2"/>'),
  undo: svg('<path d="M9 14 4.5 9.5 9 5"/><path d="M4.5 9.5H14a5.5 5.5 0 0 1 0 11h-3"/>'),
  redo: svg('<path d="m15 14 4.5-4.5L15 5"/><path d="M19.5 9.5H10a5.5 5.5 0 0 0 0 11h3"/>'),
  snap: svg('<path d="M3.5 20.5 11 13"/><path d="M13 11h7.5"/><rect x="9.5" y="8.5" width="5" height="5" rx=".6"/>'),
  angle: svg('<path d="M4 19.5h16"/><path d="M4 19.5 15.5 6"/><path d="M11 19.5a7 7 0 0 0-2.1-5"/>'),
  layers: svg('<path d="m12 4 8.5 4.5L12 13 3.5 8.5z"/><path d="m3.5 12.5 8.5 4.5 8.5-4.5"/><path d="m3.5 16.5 8.5 4.5 8.5-4.5" opacity=".55"/>'),
  more: svg('<circle cx="5.5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="18.5" cy="12" r="1.3" fill="currentColor"/>'),
  grip: svg('<circle cx="9" cy="7" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="7" r="1.1" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.1" fill="currentColor" stroke="none"/><circle cx="9" cy="17" r="1.1" fill="currentColor" stroke="none"/><circle cx="15" cy="17" r="1.1" fill="currentColor" stroke="none"/>'),
  collapse: svg('<path d="m7 10 5 5 5-5"/>'),
  expand: svg('<path d="m7 14 5-5 5 5"/>'),
  eye: svg('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>'),
  eyeOff: svg('<path d="M3 3l18 18"/><path d="M10.6 5.6A9.6 9.6 0 0 1 12 5.5C18 5.5 21.5 12 21.5 12a17 17 0 0 1-3 3.8M6.2 7.4A16.6 16.6 0 0 0 2.5 12S6 18.5 12 18.5a9 9 0 0 0 4.4-1.1"/><path d="M9.9 10a2.8 2.8 0 0 0 4 4"/>'),
  lock: svg('<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>'),
  unlock: svg('<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 7.7-1.5"/>'),
  dim: svg('<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none" opacity=".35"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  trash: svg('<path d="M4.5 7h15"/><path d="M9.5 7V4.8h5V7"/><path d="M6.5 7l1 12.2h9L17.5 7"/>'),
  up: svg('<path d="m7 14 5-5 5 5"/>'),
  down: svg('<path d="m7 10 5 5 5-5"/>'),
  rename: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>'),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  fit: svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  compass: (rotDeg: number) =>
    svg(
      `<circle cx="12" cy="12" r="9" opacity=".35"/><g transform="rotate(${rotDeg} 12 12)"><path d="M12 4.5 14.2 12h-4.4z" fill="#d6453d" stroke="none"/><path d="M12 19.5 9.8 12h4.4z" fill="currentColor" stroke="none" opacity=".55"/></g>`,
    ),
};

/** Small preview of an ISO line type for the palette. */
export function lineTypeIcon(dash: string, freehand = false): string {
  const path = freehand ? 'M2 12.5c3-2.4 5-2.2 7.5-.3s5 2.2 7.5-.2 3.7-1.8 5-.8' : 'M2 12h20';
  return `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="${path}" ${dash ? `stroke-dasharray="${dash}"` : ''}/></svg>`;
}
