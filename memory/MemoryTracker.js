const { byteSize } = require("../utils/sizeCalculator");

class MemoryTracker {
  constructor(maxBytes = 64 * 1024 * 1024) {
    this.maxBytes = maxBytes;
    this.usedBytes = 0;
    this.peakBytes = 0;
  }

  add(bytes) {
    this.usedBytes += bytes;
    if (this.usedBytes > this.peakBytes) this.peakBytes = this.usedBytes;
  }

  remove(bytes) {
    this.usedBytes -= bytes;
    if (this.usedBytes < 0) this.usedBytes = 0;
  }

  isOverLimit() {
    return this.usedBytes > this.maxBytes;
  }

  getStats() {
    return {
      used_bytes: this.usedBytes,
      max_bytes: this.maxBytes,
      peak_bytes: this.peakBytes,
      used_mb: +(this.usedBytes / (1024 * 1024)).toFixed(2),
      max_mb: +(this.maxBytes / (1024 * 1024)).toFixed(2),
      peak_mb: +(this.peakBytes / (1024 * 1024)).toFixed(2),
      usage_pct: this.maxBytes === 0 ? 0 : +((this.usedBytes / this.maxBytes) * 100).toFixed(1),
    };
  }

  reset() {
    this.usedBytes = 0;
    this.peakBytes = 0;
  }
}

module.exports = { MemoryTracker };
