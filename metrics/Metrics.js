const RESERVOIR_SIZE = 10_000;

class Metrics {
  constructor() {
    this.hits = 0;
    this.misses = 0;
    this.sets = 0;
    this.gets = 0;
    this.deletes = 0;
    this.evictions = 0;
    this.expirations = 0;
    this._reservoir = { get: [], set: [], delete: [] };
    this._counts = { get: 0, set: 0, delete: 0 };
  }

  recordHit() { this.hits++; }
  recordMiss() { this.misses++; }
  recordSet() { this.sets++; }
  recordGet() { this.gets++; }
  recordDelete() { this.deletes++; }
  recordEviction() { this.evictions++; }
  addExpirations(n) { this.expirations += n; }

  recordLatency(op, startHr) {
    const [s, ns] = process.hrtime(startHr);
    const us = Math.round(s * 1e6 + ns / 1e3);
    const bucket = this._reservoir[op];
    const n = ++this._counts[op];
    if (n <= RESERVOIR_SIZE) {
      bucket.push(us);
    } else {
      const j = Math.floor(Math.random() * n);
      if (j < RESERVOIR_SIZE) bucket[j] = us;
    }
  }

  getLatencyStats(op) {
    const arr = this._reservoir[op];
    if (!arr || arr.length === 0) return { count: 0, avg: 0, p50: 0, p95: 0, p99: 0 };
    const sorted = arr.slice().sort((a, b) => a - b);
    const len = sorted.length;
    let sum = 0;
    for (let i = 0; i < len; i++) sum += sorted[i];
    return {
      count: this._counts[op],
      avg: +(sum / len).toFixed(1),
      p50: sorted[Math.floor(len * 0.5)],
      p95: sorted[Math.floor(len * 0.95)],
      p99: sorted[Math.floor(len * 0.99)],
    };
  }

  getAllLatencyStats() {
    return {
      get: this.getLatencyStats("get"),
      set: this.getLatencyStats("set"),
      delete: this.getLatencyStats("delete"),
    };
  }

  hitRate() {
    const total = this.hits + this.misses;
    return total === 0 ? 0 : +((this.hits / total) * 100).toFixed(2);
  }

  missRate() {
    const total = this.hits + this.misses;
    return total === 0 ? 0 : +((this.misses / total) * 100).toFixed(2);
  }

  getSnapshot(memoryStats) {
    return {
      operations: {
        sets: this.sets,
        gets: this.gets,
        deletes: this.deletes,
        hits: this.hits,
        misses: this.misses,
        evictions: this.evictions,
        expirations: this.expirations,
      },
      rates: {
        hit_rate_pct: this.hitRate(),
        miss_rate_pct: this.missRate(),
      },
      latency_us: this.getAllLatencyStats(),
      memory: memoryStats || {},
    };
  }

  reset() {
    this.hits = 0;
    this.misses = 0;
    this.sets = 0;
    this.gets = 0;
    this.deletes = 0;
    this.evictions = 0;
    this.expirations = 0;
    this._reservoir = { get: [], set: [], delete: [] };
    this._counts = { get: 0, set: 0, delete: 0 };
  }
}

module.exports = { Metrics };
