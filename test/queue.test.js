import test from 'node:test';
import assert from 'node:assert/strict';
import { Queue } from '../src/domain/waitlistQueue.js';

test('a new queue has size zero', () => {
  const queue = new Queue();

  assert.equal(queue.size, 0);
});
test('enqueue increases the queue size', () => {
    const queue = new Queue();
  
    queue.enqueue('Ada');
  
    assert.equal(queue.size, 1);
  });
  
  test('dequeue returns the oldest item', () => {
    const queue = new Queue();
  
    queue.enqueue('Ada');
    queue.enqueue('Chidi');
  
    assert.equal(queue.dequeue(), 'Ada');
    assert.equal(queue.dequeue(), 'Chidi');
  });
  
  test('dequeue reduces the queue size', () => {
    const queue = new Queue();
  
    queue.enqueue('Ada');
    queue.dequeue();
  
    assert.equal(queue.size, 0);
  });
  test('queue preserves FIFO order with multiple items', () => {
    const queue = new Queue();
  
    queue.enqueue('Ada');
    queue.enqueue('Chidi');
    queue.enqueue('Ngozi');
  
    assert.equal(queue.dequeue(), 'Ada');
    assert.equal(queue.dequeue(), 'Chidi');
    assert.equal(queue.dequeue(), 'Ngozi');
  });
  
  test('queue is empty after removing all items', () => {
    const queue = new Queue();
  
    queue.enqueue('Ada');
    queue.enqueue('Chidi');
  
    queue.dequeue();
    queue.dequeue();
  
    assert.equal(queue.size, 0);
  });
  