const { createCacheEntry } = require("../types/cacheEntry");
const { DoublyLinkedList } = require("./DoublyLinkedList");
const { Node } = require("./Node");

class LRUCache {
  constructor(maxSize = 100) {
    this.store = new Map();
    this.list = new DoublyLinkedList();
    this.maxSize = maxSize;
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
    console.log(`✅ LRUCache initialized | maxSize: ${maxSize}`);
  }

  _isExpired(entry) {
    return entry.expiresAt !== null && Date.now() > entry.expiresAt;
  }

  set(key, value, ttl = null) {
    if (this.store.has(key)) {
      // Update existing — refresh node position and entry data
      const { node } = this.store.get(key);
      const entry = createCacheEntry(key, value, ttl);
      node.value = value;
      this.store.set(key, { entry, node });
      this.list.moveToHead(node);
      console.log(
        `UPDATE: "${key}" | ttl: ${ttl !== null ? ttl + "ms" : "none"}`,
      );
      return entry;
    }

    if (this.store.size >= this.maxSize) {
      const lruNode = this.list.removeTail();
      if (lruNode) {
        this.store.delete(lruNode.key);
        this.evictions++;
        console.log(`🗑️  EVICTED (LRU): "${lruNode.key}"`);
      }
    }

    const entry = createCacheEntry(key, value, ttl);
    const node = new Node(key, value);
    this.list.addToHead(node);
    this.store.set(key, { entry, node });
    console.log(
      `📝 SET: "${key}" | ${entry.size} bytes | ttl: ${ttl !== null ? ttl + "ms" : "none"}`,
    );
    return entry;
  }

  get(key) {
    const record = this.store.get(key);
    if (!record) {
      this.misses++;
      console.log(`❌ MISS: "${key}"`);
      return null;
    }

    const { entry, node } = record;

    if (this._isExpired(entry)) {
      this.list.remove(node);
      this.store.delete(key);
      this.misses++;
      console.log(`⏰ EXPIRED: "${key}"`);
      return null;
    }

    entry.lastAccessed = Date.now();
    this.list.moveToHead(node);
    this.hits++;
    console.log(`✅ HIT: "${key}"`);
    return entry.value;
  }

  delete(key) {
    const record = this.store.get(key);
    if (!record) {
      console.log(`⚠️  NOT FOUND: "${key}"`);
      return false;
    }
    this.list.remove(record.node);
    this.store.delete(key);
    console.log(`🗑️  DELETED: "${key}"`);
    return true;
  }

  clear() {
    const count = this.store.size;
    this.store.clear();
    this.list = new DoublyLinkedList();
    console.log(`🧹 Cleared ${count} items`);
    return count;
  }

  size() {
    return this.store.size;
  }

  hitRate() {
    const total = this.hits + this.misses;
    return total === 0 ? "0%" : ((this.hits / total) * 100).toFixed(2) + "%";
  }

  missRate() {
    const total = this.hits + this.misses;
    return total === 0 ? "0%" : ((this.misses / total) * 100).toFixed(2) + "%";
  }
}

module.exports = { LRUCache };
