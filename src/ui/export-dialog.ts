import type { App } from '../app';
import { EXT, exportDrawing, exportSize, type ExportFormat } from '../export/export';
import { loadPref, savePref } from '../storage/idb';
import { baseDialog } from './dialogs';
import { h } from './dom';

interface ExportPrefs {
  format: ExportFormat;
  dpi: number;
  transparent: boolean;
  selection: boolean;
}

const FORMATS: { id: ExportFormat; label: string; hint: string }[] = [
  { id: 'pdf', label: 'PDF', hint: 'Vektor, Maßstab 1:1 – zum Drucken und Weitergeben' },
  { id: 'svg', label: 'SVG', hint: 'Vektor, Maßstab 1:1 – für Grafik- und CAD-Programme' },
  { id: 'png', label: 'PNG', hint: 'Bild mit Bleistift-Struktur, optional transparent' },
  { id: 'jpeg', label: 'JPEG', hint: 'Bild mit Bleistift-Struktur, kleinere Datei' },
];

function saveBlob(blob: Blob, name: string): void {
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 20_000);
}

function fileName(format: ExportFormat): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `skizze-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.${EXT[format]}`;
}

const mm = (v: number) => v.toFixed(0);

/** Export dialog: format, area, resolution and background. */
export function showExportDialog(app: App): void {
  const prefs = loadPref<ExportPrefs>('export', { format: 'pdf', dpi: 300, transparent: false, selection: false });
  const selection = app.toolId === 'select' ? new Set(app.selectedEntities().map((e) => e.id)) : new Set<string>();
  const { dlg, body, actions } = baseDialog('Exportieren');
  dlg.classList.add('export-dlg');

  const seg = <T extends string | number>(items: { id: T; label: string }[], get: () => T, set: (v: T) => void) => {
    const row = h('div', { class: 'seg' });
    const btns = items.map((it) => {
      const b = h('button', { class: 'seg-btn', text: it.label });
      b.addEventListener('click', () => {
        set(it.id);
        refresh();
      });
      row.append(b);
      return [it.id, b] as const;
    });
    return { row, sync: () => btns.forEach(([id, b]) => b.classList.toggle('active', id === get())) };
  };

  const fmt = seg(FORMATS, () => prefs.format, (v) => (prefs.format = v));
  const hint = h('p', { class: 'exp-hint' });
  const area = seg(
    [
      { id: 'all', label: 'Alles' },
      { id: 'sel', label: selection.size ? `Auswahl (${selection.size})` : 'Auswahl' },
    ],
    () => (prefs.selection && selection.size ? 'sel' : 'all'),
    (v) => (prefs.selection = v === 'sel'),
  );
  const areaBtn = area.row.lastElementChild as HTMLButtonElement;
  areaBtn.disabled = selection.size === 0;
  const dpi = seg(
    [
      { id: 150, label: '150 dpi' },
      { id: 300, label: '300 dpi' },
      { id: 600, label: '600 dpi' },
    ],
    () => prefs.dpi,
    (v) => (prefs.dpi = v),
  );
  const bg = seg(
    [
      { id: 'white', label: 'Weiß' },
      { id: 'none', label: 'Transparent' },
    ],
    () => (prefs.transparent ? 'none' : 'white'),
    (v) => (prefs.transparent = v === 'none'),
  );
  const size = h('p', { class: 'exp-hint' });
  const dpiField = h('div', { class: 'exp-field' }, [h('span', { text: 'Auflösung' }), dpi.row]);
  const bgField = h('div', { class: 'exp-field' }, [h('span', { text: 'Hintergrund' }), bg.row]);
  body.append(
    h('div', { class: 'exp-field' }, [h('span', { text: 'Format' }), fmt.row]),
    hint,
    h('div', { class: 'exp-field' }, [h('span', { text: 'Bereich' }), area.row]),
    dpiField,
    bgField,
    size,
  );

  function refresh(): void {
    for (const s of [fmt, area, dpi, bg]) s.sync();
    const raster = prefs.format === 'png' || prefs.format === 'jpeg';
    hint.textContent = FORMATS.find((f) => f.id === prefs.format)!.hint;
    dpiField.hidden = !raster;
    bgField.hidden = prefs.format === 'jpeg' || prefs.format === 'pdf';
    const sz = exportSize(app.doc, { only: prefs.selection && selection.size ? selection : undefined, margin: 10 });
    if (!sz) size.textContent = 'Nichts zu exportieren.';
    else {
      let text = `${mm(sz.w)} × ${mm(sz.h)} mm`;
      if (raster) {
        const k = prefs.dpi / 25.4;
        let pw = sz.w * k;
        let ph = sz.h * k;
        const cap = Math.sqrt(16_000_000 / (pw * ph));
        if (cap < 1) {
          pw *= cap;
          ph *= cap;
        }
        text += ` · ${Math.round(pw)} × ${Math.round(ph)} px${cap < 1 ? ' (verkleinert)' : ''}`;
      }
      size.textContent = text;
    }
    ok.disabled = !sz;
  }

  const cancel = h('button', { class: 'dlg-btn', text: 'Abbrechen' });
  const ok = h('button', { class: 'dlg-btn primary', text: 'Exportieren' });
  actions.append(cancel, ok);
  const close = () => {
    dlg.close();
    dlg.remove();
  };
  cancel.addEventListener('click', close);
  dlg.addEventListener('cancel', (e) => {
    e.preventDefault();
    close();
  });
  ok.addEventListener('click', async () => {
    savePref('export', prefs);
    ok.disabled = true;
    ok.textContent = 'Erzeuge …';
    try {
      const transparent = prefs.transparent && (prefs.format === 'png' || prefs.format === 'svg');
      const blob = await exportDrawing(app.doc, {
        format: prefs.format,
        only: prefs.selection && selection.size ? selection : undefined,
        dpi: prefs.dpi,
        background: transparent ? null : '#ffffff',
        margin: 10,
      });
      close();
      if (!blob) {
        app.toast('Nichts zu exportieren');
        return;
      }
      saveBlob(blob, fileName(prefs.format));
      app.toast(`${FORMATS.find((f) => f.id === prefs.format)!.label} exportiert`);
    } catch (err) {
      close();
      app.toast(`Export fehlgeschlagen: ${(err as Error).message}`);
    }
  });
  refresh();
  dlg.showModal();
}
