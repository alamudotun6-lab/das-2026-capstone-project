// Controllable clock so tests can freeze or advance time.

let nowFn = () => new Date();

export function now() {
  return nowFn();
}

export function setClock(dateOrFn) {
  if (typeof dateOrFn === 'function') {
    nowFn = dateOrFn;
  } else {
    const fixed = new Date(dateOrFn);
    nowFn = () => new Date(fixed);
  }
}

export function resetClock() {
  nowFn = () => new Date();
}

/** Advance the fixed clock by the given milliseconds (only works after setClock with a Date). */
export function advanceClock(ms) {
  const current = nowFn();
  const next = new Date(current.getTime() + ms);
  nowFn = () => new Date(next);
}
