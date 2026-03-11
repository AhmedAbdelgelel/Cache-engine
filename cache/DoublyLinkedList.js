const { Node } = require("./Node");

class DoublyLinkedList {
  constructor() {
    this.head = new Node(null, null);
    this.tail = new Node(null, null);
    this.head.next = this.tail;
    this.tail.prev = this.head;
  }

  // Insert node right after HEAD (most recently used position)
  addToHead(node) {
    node.prev = this.head;
    node.next = this.head.next;
    this.head.next.prev = node;
    this.head.next = node;
  }

  // Remove an arbitrary node in O(1) using its pointers
  remove(node) {
    node.prev.next = node.next;
    node.next.prev = node.prev;
  }

  // Move existing node to head (called on every cache hit)
  moveToHead(node) {
    this.remove(node);
    this.addToHead(node);
  }

  // Remove and return the LRU node (just before TAIL)
  removeTail() {
    const lru = this.tail.prev;
    if (lru === this.head) return null;
    this.remove(lru);
    return lru;
  }
}

module.exports = { DoublyLinkedList };
