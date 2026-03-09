const { createCacheEntry } = require("../types/cacheEntry");

class Cache {
  constructor(maxSize = 100) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.hits = 0;
    this.misses = 0;
    console.log(`✅ Cache initialized | maxSize: ${maxSize}`);
  }

  _isExpired(entry) {
    return entry.expiresAt !== null && Date.now() > entry.expiresAt;
  }

  set(key, value, ttl = null) {
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
      console.log(`🗑️ Evicted oldest entry: "${oldestKey}"`);
    }
    const entry = createCacheEntry(key, value, ttl);
    this.cache.set(key, entry);
    console.log(
      `📝 SET: "${key}" | ${entry.size} bytes | ttl: ${ttl !== null ? ttl + "ms" : "none"}`,
    );
    return entry;
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) {
      this.misses++;
      console.log(`❌ MISS: "${key}"`);
      return null;
    }
    if (this._isExpired(entry)) {
      this.cache.delete(key);
      this.misses++;
      console.log(`⏰ EXPIRED: "${key}"`);
      return null;
    }
    this.hits++;
    entry.lastAccessed = Date.now();
    console.log(`✅ HIT: "${key}"`);
    return entry.value;
  }

  delete(key) {
    const existed = this.cache.delete(key);
    console.log(existed ? `🗑️ DELETED: "${key}"` : `⚠️ NOT FOUND: "${key}"`);
    return existed;
  }

  clear() {
    const count = this.cache.size;
    this.cache.clear();
    console.log(`🧹 Cleared ${count} items`);
    return count;
  }

  size() {
    return this.cache.size;
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

module.exports = { Cache };
