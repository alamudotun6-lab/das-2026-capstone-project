import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mergeSort } from '../src/domain/sorting.js';

describe('mergeSort', () => {
  it('returns a new array and does not modify the original', () => {
    const original = [3, 1, 2];
    const sorted = mergeSort(original);
    assert.deepEqual(sorted, [1, 2, 3]);
    assert.deepEqual(original, [3, 1, 2]); // original unchanged
  });

  it('handles empty and single-item lists', () => {
    assert.deepEqual(mergeSort([]), []);
    assert.deepEqual(mergeSort([42]), [42]);
  });

  it('is stable: equal items keep their original relative order', () => {
    // Two items that compare equal must stay in the same order they appeared.
    const items = [
      { value: 2, label: 'first' },
      { value: 1, label: 'a' },
      { value: 2, label: 'second' },
      { value: 1, label: 'b' },
    ];
    const sorted = mergeSort(items, (a, b) => a.value - b.value);
    assert.equal(sorted[0].label, 'a');
    assert.equal(sorted[1].label, 'b');
    assert.equal(sorted[2].label, 'first');
    assert.equal(sorted[3].label, 'second');
  });

  it('sorts numbers ascending by default', () => {
    assert.deepEqual(mergeSort([5, 3, 8, 1, 2]), [1, 2, 3, 5, 8]);
  });
});
