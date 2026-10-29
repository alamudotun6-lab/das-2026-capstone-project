import { el, formatPrice, formatDate, clear } from '../ui.js';
import { getEvent, createBooking, payBooking, HOLD_MS } from '../api.js';

const params = new URLSearchParams(location.search);
const eventId = params.get('id');

const root = document.getElementById('event-root');
const checkoutEl = document.getElementById('checkout');

let countdownTimer = null;
let currentBooking = null;

async function load() {
  if (!eventId) {
    clear(root);
    root.appendChild(el('p', null, 'Missing event id.'));
    return;
  }

  clear(root);
  root.appendChild(el('p', { className: 'muted' }, 'Loading…'));

  try {
    const event = await getEvent(eventId);
    clear(root);
    root.appendChild(renderHero(event));
    root.appendChild(renderTiers(event));
  } catch (err) {
    clear(root);
    root.appendChild(el('p', null, err.message || 'Event not found'));
  }
}

function renderHero(event) {
  return el('section', { className: 'event-hero' }, [
    el('p', null, [el('a', { href: 'index.html' }, '← All events')]),
    el('h1', null, event.title),
    el('p', { className: 'meta' }, [
      `${event.city} · ${event.venue || 'TBA'} · ${formatDate(event.startsAt)}`,
    ]),
  ]);
}

function renderTiers(event) {
  const container = el('section', { className: 'tiers' }, [
    el('h2', null, 'Tickets'),
  ]);

  for (const tier of event.tiers) {
    const seatsLeft = tier.capacity - tier.sold;
    const soldOut = seatsLeft <= 0;

    const qtyInput = el('input', {
      type: 'number',
      id: `qty-${tier.id}`,
      min: 1,
      max: Math.min(10, Math.max(1, seatsLeft)),
      value: 1,
      disabled: soldOut,
      'aria-label': `Quantity for ${tier.name}`,
    });

    const bookBtn = el(
      'button',
      {
        type: 'button',
        disabled: soldOut,
        onClick: () => startCheckout(event, tier, Number(qtyInput.value)),
      },
      soldOut ? 'Sold out' : 'Book'
    );

    const card = el('article', { className: `tier-card${soldOut ? ' sold-out' : ''}` }, [
      el('div', null, [
        el('strong', null, tier.name),
        ' · ',
        formatPrice(tier.priceCents),
        el('div', { className: 'meta' }, [
          soldOut
            ? el('span', { className: 'badge' }, 'Sold out')
            : `${seatsLeft} seat${seatsLeft === 1 ? '' : 's'} left`,
        ]),
      ]),
      el('div', { className: 'tier-actions' }, [
        el('label', { className: 'sr-only', htmlFor: `qty-${tier.id}` }, 'Quantity'),
        qtyInput,
        bookBtn,
      ]),
    ]);

    container.appendChild(card);
  }

  return container;
}

async function startCheckout(event, tier, quantity) {
  const seatsLeft = tier.capacity - tier.sold;
  const qty = Math.max(1, Math.min(10, quantity, seatsLeft));

  clear(checkoutEl);
  checkoutEl.hidden = false;
  checkoutEl.appendChild(el('p', { className: 'muted' }, 'Reserving seats…'));

  try {
    const booking = await createBooking({ tierId: tier.id, quantity: qty });
    currentBooking = booking;
    renderCheckout(booking, event, tier);
  } catch (err) {
    clear(checkoutEl);
    checkoutEl.appendChild(
      el('div', { className: 'error' }, err.message || 'Could not reserve seats')
    );
  }
}

function renderCheckout(booking, event, tier) {
  clear(checkoutEl);
  if (countdownTimer) clearInterval(countdownTimer);

  const countdownEl = el('div', { className: 'countdown' }, '');
  const errorEl = el('div', { className: 'error', hidden: true }, '');
  const successEl = el('div', { className: 'success', hidden: true }, '');

  function updateCountdown() {
    const remaining = Math.max(0, new Date(booking.holdUntil) - Date.now());
    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    countdownEl.textContent =
      remaining > 0
        ? `Seats held for ${mins}:${String(secs).padStart(2, '0')}`
        : 'Hold expired – please book again';
    if (remaining <= 0 && countdownTimer) {
      clearInterval(countdownTimer);
      payBtn.disabled = true;
    }
  }
  updateCountdown();
  countdownTimer = setInterval(updateCountdown, 1000);

  const cardNumber = el('input', {
    type: 'text',
    id: 'card-number',
    placeholder: '4242 4242 4242 4242',
    autocomplete: 'cc-number',
    required: true,
  });
  const cardExpiry = el('input', {
    type: 'text',
    id: 'card-expiry',
    placeholder: 'MM/YY',
    autocomplete: 'cc-exp',
    required: true,
  });
  const cardCvc = el('input', {
    type: 'text',
    id: 'card-cvc',
    placeholder: 'CVC',
    autocomplete: 'cc-csc',
    required: true,
  });

  // Demo helper: a card ending in 0000 is declined
  const declineHint = el(
    'p',
    { className: 'meta' },
    'Demo: use any card except one ending in 0000 (those are declined).'
  );

  const payBtn = el('button', { type: 'submit' }, `Pay ${formatPrice(booking.amountCents)}`);

  const form = el('form', { className: 'card-form' }, [
    el('label', { htmlFor: 'card-number' }, ['Card number', cardNumber]),
    el('div', { className: 'row' }, [
      el('label', { htmlFor: 'card-expiry' }, ['Expiry', cardExpiry]),
      el('label', { htmlFor: 'card-cvc' }, ['CVC', cardCvc]),
    ]),
    declineHint,
    payBtn,
  ]);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.hidden = true;
    successEl.hidden = true;
    payBtn.disabled = true;
    payBtn.textContent = 'Processing…';

    const decline = String(cardNumber.value).replace(/\s/g, '').endsWith('0000');

    try {
      const paid = await payBooking(booking.reference, { decline });
      successEl.textContent = `Payment successful. Reference: ${paid.reference}`;
      successEl.hidden = false;
      form.hidden = true;
      if (countdownTimer) clearInterval(countdownTimer);
      countdownEl.textContent = 'Paid';
    } catch (err) {
      errorEl.textContent = err.message || 'Payment failed';
      errorEl.hidden = false;
      payBtn.disabled = false;
      payBtn.textContent = `Pay ${formatPrice(booking.amountCents)}`;
    }
  });

  checkoutEl.append(
    el('h2', null, 'Checkout'),
    countdownEl,
    el('p', null, [
      `${booking.quantity} × ${tier.name} for `,
      el('strong', null, event.title),
      ` — ${formatPrice(booking.amountCents)}`,
    ]),
    errorEl,
    successEl,
    form
  );
}

load();
