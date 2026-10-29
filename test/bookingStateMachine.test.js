import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BOOKING_STATES,
  canTransition,
  assertTransition,
} from '../src/domain/bookingStateMachine.js';
import { DomainError } from '../src/domain/errors.js';

describe('booking state machine', () => {
  it('lists the expected states', () => {
    assert.deepEqual(BOOKING_STATES, ['pending', 'paid', 'cancelled', 'refunded', 'checked_in']);
  });

  it('allows the legal transitions from pending', () => {
    assert.equal(canTransition('pending', 'paid'), true);
    assert.equal(canTransition('pending', 'cancelled'), true);
  });

  it('allows the legal transitions from paid', () => {
    assert.equal(canTransition('paid', 'checked_in'), true);
    assert.equal(canTransition('paid', 'refunded'), true);
    assert.equal(canTransition('paid', 'cancelled'), true);
  });

  it('forbids moves out of final states', () => {
    for (const final of ['cancelled', 'refunded', 'checked_in']) {
      for (const target of BOOKING_STATES) {
        assert.equal(canTransition(final, target), false, `${final} → ${target}`);
      }
    }
  });

  it('forbids illegal moves from pending and paid', () => {
    assert.equal(canTransition('pending', 'refunded'), false);
    assert.equal(canTransition('pending', 'checked_in'), false);
    assert.equal(canTransition('paid', 'pending'), false);
  });

  it('assertTransition throws INVALID_TRANSITION for illegal moves', () => {
    assert.throws(
      () => assertTransition('cancelled', 'paid'),
      (err) => err instanceof DomainError && err.code === 'INVALID_TRANSITION'
    );
    assert.throws(
      () => assertTransition('pending', 'checked_in'),
      (err) => err instanceof DomainError && err.code === 'INVALID_TRANSITION'
    );
  });

  it('assertTransition returns true for legal moves', () => {
    assert.equal(assertTransition('pending', 'paid'), true);
    assert.equal(assertTransition('paid', 'refunded'), true);
  });
});
