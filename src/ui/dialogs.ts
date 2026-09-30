import { h } from './dom';

/**
 * In-app replacements for confirm()/prompt(): styled like the rest of the UI and
 * available in embedded contexts where the native dialogs are blocked.
 */

interface AskOptions {
  title: string;
  message?: string;
  confirm: string;
  cancel?: string;
  danger?: boolean;
}

function baseDialog(title: string): { dlg: HTMLDialogElement; body: HTMLElement; actions: HTMLElement } {
  const body = h('div', { class: 'dlg-body' });
  const actions = h('div', { class: 'dlg-actions' });
  const dlg = h('dialog', { class: 'panel ask' }, [h('h2', { class: 'dlg-title', text: title }), body, actions]);
  document.body.append(dlg);
  return { dlg, body, actions };
}

function finish<T>(dlg: HTMLDialogElement, resolve: (v: T) => void, value: T): void {
  dlg.close();
  dlg.remove();
  resolve(value);
}

export function ask(opts: AskOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const { dlg, body, actions } = baseDialog(opts.title);
    if (opts.message) body.append(h('p', { text: opts.message }));
    const cancel = h('button', { class: 'dlg-btn', text: opts.cancel ?? 'Abbrechen' });
    const ok = h('button', { class: `dlg-btn primary${opts.danger ? ' danger' : ''}`, text: opts.confirm });
    actions.append(cancel, ok);
    cancel.addEventListener('click', () => finish(dlg, resolve, false));
    ok.addEventListener('click', () => finish(dlg, resolve, true));
    dlg.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(dlg, resolve, false);
    });
    dlg.showModal();
    ok.focus();
  });
}

export function askText(title: string, value: string, confirm = 'Übernehmen'): Promise<string | null> {
  return new Promise((resolve) => {
    const { dlg, body, actions } = baseDialog(title);
    const input = h('input', { class: 'dlg-input', type: 'text', id: 'dlg-text', autocomplete: 'off' });
    input.value = value;
    const form = h('form', { method: 'dialog' }, [input]);
    body.append(form);
    const cancel = h('button', { class: 'dlg-btn', text: 'Abbrechen' });
    const ok = h('button', { class: 'dlg-btn primary', text: confirm });
    actions.append(cancel, ok);
    const submit = () => {
      const v = input.value.trim();
      finish(dlg, resolve, v ? v : null);
    };
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      submit();
    });
    ok.addEventListener('click', submit);
    cancel.addEventListener('click', () => finish(dlg, resolve, null));
    dlg.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(dlg, resolve, null);
    });
    dlg.showModal();
    input.focus();
    input.select();
  });
}
