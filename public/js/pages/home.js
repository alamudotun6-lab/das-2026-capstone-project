import { el, formatPrice, formatDate, clear } from '../ui.js';
import { listEvents } from '../api.js';

const listEl = document.getElementById('event-list');
const formEl = document.getElementById('filters');

async function load() {
  const formData = new FormData(formEl);
  const criteria = {
    q: formData.get('q') || undefined,
    city: formData.get('city') || undefined,
    maxPriceCents: formData.get('maxPriceCents') || undefined,
    onlyAvailable: formData.get('onlyAvailable') === 'on' ? true : undefined,
    sort: formData.get('sort') || 'date',
  };

  clear(listEl);
  listEl.appendChild(el('p', { className: 'muted' }, 'Loading…'));

  try {
    const events = await listEvents(criteria);
    clear(listEl);

    if (events.length === 0) {
      listEl.appendChild(
        el('div', { className: 'empty' }, 'No events match your filters.')
      );
      return;
    }

    for (const event of events) {
      listEl.appendChild(renderCard(event));
    }
  } catch (err) {
    clear(listEl);
    listEl.appendChild(
      el('div', { className: 'empty' }, `Could not load events: ${err.message}`)
    );
  }
}

function renderCard(event) {
  const soldOut = event.seatsLeft <= 0;
  return el('article', { className: 'event-card' }, [
    el('h2', null, [
      el('a', { href: `event.html?id=${encodeURIComponent(event.id)}` }, event.title),
    ]),
    el('div', { className: 'meta' }, [
      `${event.city} · ${event.venue || 'TBA'} · ${formatDate(event.startsAt)}`,
    ]),
    el('div', { className: 'price' }, [
      soldOut
        ? el('span', { className: 'badge' }, 'Sold out')
        : `From ${formatPrice(event.minPriceCents)} · ${event.seatsLeft} seats left`,
    ]),
  ]);
}

formEl.addEventListener('submit', (e) => {
  e.preventDefault();
  load();
});

formEl.addEventListener('change', () => load());

load();
