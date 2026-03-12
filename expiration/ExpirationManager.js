class ExpirationManager {
  constructor(cache, intervalMs = 1000) {
    this.cache = cache;
    this.intervalMs = intervalMs;
    this.timer = null;
    this.totalExpired = 0;
    this.start();
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.sweepNow(), this.intervalMs);
    if (this.timer.unref) this.timer.unref();
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  sweepNow() {
    const now = Date.now();
    let expired = 0;
    for (const [key, record] of this.cache.store) {
      const entry = record.entry || record;
      if (entry.expiresAt !== null && now > entry.expiresAt) {
        if (record.node) this.cache.list.remove(record.node);
        if (this.cache.memory) this.cache.memory.remove(entry.size || 0);
        this.cache.store.delete(key);
        expired++;
      }
    }
    this.totalExpired += expired;
    if (this.cache.metrics) this.cache.metrics.addExpirations(expired);
    return expired;
  }
}

module.exports = { ExpirationManager };
