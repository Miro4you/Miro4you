type Attrs = Record<string, string | undefined> & { text?: string; html?: string };

/** Tiny element helper: h('button', { class: 'btn', text: 'OK' }, [children]). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined) continue;
    if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v);
  }
  if (tag === 'button' && !attrs.type) el.setAttribute('type', 'button');
  el.append(...children);
  return el;
}
