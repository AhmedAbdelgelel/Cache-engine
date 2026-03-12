class StampedeGuard {
  constructor() {
    this.inflight = new Map();
    this.deduplicated = 0;
  }

  async fetch(key, loader) {
    if (this.inflight.has(key)) {
      this.deduplicated++;
      return this.inflight.get(key);
    }

    const promise = loader().finally(() => {
      this.inflight.delete(key);
    });

    this.inflight.set(key, promise);
    return promise;
  }

  getStats() {
    return {
      inflight: this.inflight.size,
      deduplicated: this.deduplicated,
    };
  }

  reset() {
    this.inflight.clear();
    this.deduplicated = 0;
  }
}

module.exports = { StampedeGuard };
