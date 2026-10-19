// A first-in-first-out queue built from a linked list.
// enqueue and dequeue are both O(1). With a plain array, shift() has to move
// every remaining element, which is O(n).

class Node {
  constructor(value) {
    this.value = value;
    this.next = null;
  }
}

export class Queue {
  #head = null;
  #tail = null;
  #size = 0;

  get size() {
    return this.#size;
  }

  enqueue(value) {
    const node = new Node(value);
    if (this.#tail) {
      this.#tail.next = node;
    } else {
      this.#head = node;
    }
    this.#tail = node;
    this.#size += 1;
  }

  dequeue() {
    if (!this.#head) return undefined;
    const { value } = this.#head;
    this.#head = this.#head.next;
    if (!this.#head) this.#tail = null;
    this.#size -= 1;
    return value;
  }

  peek() {
    return this.#head?.value;
  }

  toArray() {
    const items = [];
    for (let node = this.#head; node; node = node.next) items.push(node.value);
    return items;
  }
}
