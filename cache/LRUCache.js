const { createCacheEntry } = require("../types/cacheEntry");
const { DoublyLinkedList } = require("./DoublyLinkedList");
const { Node } = require("./Node");
const { MemoryTracker } = require("../memory/MemoryTracker");
const { ExpirationManager } = require("../expiration/ExpirationManager");
const { Metrics } = require("../metrics/Metrics");

const SAMPLE_RATE = 0.01;

class LRUCache {
  constructor(opts = {}) {
    if (typeof opts === "number") opts = { maxSize: opts };
    this.maxSize = opts.maxSize || 100;
    this.store = new Map();
    this.list = new DoublyLinkedList();
    this.memory = new MemoryTracker(opts.maxMemoryBytes || 64 * 1024 * 1024);
    this.metrics = new Metrics();
    this.expirer = new ExpirationManager(this, opts.sweepInterval || 1000);
  }

  _isExpired(entry) {
    return entry.expiresAt !== null && Date.now() > entry.expiresAt;
  }

  _evictOne() {
    const lruNode = this.list.removeTail();
    if (!lruNode) return false;
    const record = this.store.get(lruNode.key);
    if (record) this.memory.remove(record.entry.size || 0);
    this.store.delete(lruNode.key);
    this.metrics.recordEviction();
    return true;
  }

  set(key, value, ttl = null) {
    const sample = Math.random() < SAMPLE_RATE;
    const hr = sample ? process.hrtime() : null;

    if (this.store.has(key)) {
      const record = this.store.get(key);
      this.memory.remove(record.entry.size || 0);
      const entry = createCacheEntry(key, value, ttl);
      record.entry = entry;
      record.node.value = value;
      this.list.moveToHead(record.node);
      this.memory.add(entry.size);
      this.metrics.recordSet();
      if (hr) this.metrics.recordLatency("set", hr);
      return entry;
    }

    while (this.store.size >= this.maxSize) {
      if (!this._evictOne()) break;
    }

    const entry = createCacheEntry(key, value, ttl);
    this.memory.add(entry.size);

    while (this.memory.isOverLimit()) {
      if (!this._evictOne()) break;
    }

    const node = new Node(key, value);
    this.list.addToHead(node);
    this.store.set(key, { entry, node });
    this.metrics.recordSet();
    if (hr) this.metrics.recordLatency("set", hr);
    return entry;
  }

  get(key) {
    const sample = Math.random() < SAMPLE_RATE;
    const hr = sample ? process.hrtime() : null;
    this.metrics.recordGet();
    const record = this.store.get(key);

    if (!record) {
      this.metrics.recordMiss();
      if (hr) this.metrics.recordLatency("get", hr);
      return null;
    }

    if (this._isExpired(record.entry)) {
      this.list.remove(record.node);
      this.memory.remove(record.entry.size || 0);
      this.store.delete(key);
      this.metrics.recordMiss();
      if (hr) this.metrics.recordLatency("get", hr);
      return null;
    }

    record.entry.lastAccessed = Date.now();
    this.list.moveToHead(record.node);
    this.metrics.recordHit();
    if (hr) this.metrics.recordLatency("get", hr);
    return record.entry.value;
  }

  delete(key) {
    const sample = Math.random() < SAMPLE_RATE;
    const hr = sample ? process.hrtime() : null;
    this.metrics.recordDelete();
    const record = this.store.get(key);
    if (!record) {
      if (hr) this.metrics.recordLatency("delete", hr);
      return false;
    }
    this.list.remove(record.node);
    this.memory.remove(record.entry.size || 0);
    this.store.delete(key);
    if (hr) this.metrics.recordLatency("delete", hr);
    return true;
  }

  clear() {
    const count = this.store.size;
    this.store.clear();
    this.list = new DoublyLinkedList();
    this.memory.reset();
    return count;
  }

  size() {
    return this.store.size;
  }

  keys() {
    return [...this.store.keys()];
  }

  hitRate() {
    return this.metrics.hitRate() + "%";
  }

  missRate() {
    return this.metrics.missRate() + "%";
  }

  getMetrics() {
    return this.metrics.getSnapshot(this.memory.getStats());
  }

  destroy() {
    this.expirer.stop();
  }
}

module.exports = { LRUCache };
