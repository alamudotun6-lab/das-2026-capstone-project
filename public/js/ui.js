/**
 * Tiny DOM helper. Never uses innerHTML for data – only textContent / attributes.
 * el('div', { className: 'card' }, [el('h2', null, 'Title'), 'plain text'])
 */
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);

  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value === undefined || value === null) continue;
      if (key === 'className') {
        node.className = value;
      } else if (key === 'textContent') {
        node.textContent = value;
      } else if (key.startsWith('on') && typeof value === 'function') {
        node.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (key === 'dataset' && typeof value === 'object') {
        for (const [dk, dv] of Object.entries(value)) {
          node.dataset[dk] = dv;
        }
      } else if (key in node) {
        node[key] = value;
      } else {
        node.setAttribute(key, value);
      }
    }
  }

  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (child === null || child === undefined || child === false) continue;
    if (typeof child === 'string' || typeof child === 'number') {
      node.appendChild(document.createTextNode(String(child)));
    } else {
      node.appendChild(child);
    }
  }

  return node;
}

/** Format whole cents as ₦2,500 */
export function formatPrice(cents) {
  if (cents === null || cents === undefined) return '—';
  const naira = (cents / 100).toLocaleString('en-NG', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return `₦${naira}`;
}

/** Format an ISO date for display */
export function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString('en-NG', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}
