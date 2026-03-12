const { LRUCache }      = require("../cache/LRUCache");
const { StampedeGuard } = require("../cache/StampedeGuard");

const cache = new LRUCache(100);
const guard = new StampedeGuard();

const setItem = (req, res) => {
  const { key, value, ttl } = req.body;

  if (!key || value === undefined) {
    return res.status(400).json({
      success: false,
      error: "key and value are required",
    });
  }

  const entry = cache.set(key, value, ttl || null);
  return res.status(201).json({
    success: true,
    message: `key "${key}" stored`,
    meta: {
      key: entry.key,
      size: entry.size,
      createdAt: entry.createdAt,
      expiresAt: entry.expiresAt,
    },
  });
};

const getItem = (req, res) => {
  const { key } = req.params;
  const value = cache.get(key);

  if (value === null) {
    return res.status(404).json({
      success: false,
      error: `key "${key}" not found or expired`,
    });
  }

  return res.status(200).json({
    success: true,
    key,
    value,
  });
};

const deleteItem = (req, res) => {
  const { key } = req.params;
  const deleted = cache.delete(key);

  if (!deleted) {
    return res.status(404).json({
      success: false,
      error: `key "${key}" not found`,
    });
  }

  return res.status(200).json({
    success: true,
    message: `key "${key}" deleted`,
  });
};

const getAllKeys = (req, res) => {
  return res.status(200).json({
    success: true,
    totalItems: cache.size(),
    hitRate: cache.hitRate(),
    missRate: cache.missRate(),
    keys: [...cache.store.keys()],
  });
};

const clearCache = (req, res) => {
  const count = cache.clear();
  return res.status(200).json({
    success: true,
    message: "Cache cleared",
    itemsRemoved: count,
  });
};

const getMetrics = (req, res) => {
  const m = cache.getMetrics();
  return res.json({
    success: true,
    hits: m.operations.hits,
    misses: m.operations.misses,
    evictions: m.operations.evictions,
    expirations: m.operations.expirations,
    hitRate: m.rates.hit_rate_pct + "%",
    missRate: m.rates.miss_rate_pct + "%",
    totalItems: cache.size(),
    memoryUsed: m.memory.used_mb + " MB",
    memoryPeak: m.memory.peak_mb + " MB",
    memoryLimit: m.memory.max_mb + " MB",
    latency_us: m.latency_us,
  });
};

const resetMetrics = (req, res) => {
  cache.metrics.reset();
  return res.json({ success: true, message: "Metrics reset" });
};

// POST /cache/fetch  { key, value, ttl, delay_ms? }
// Uses StampedeGuard: N concurrent requests for the same key trigger the
// loader only once. All waiters receive the same resolved value.
// `value` simulates what a real DB/API would return; `delay_ms` simulates latency.
const fetchItem = async (req, res, next) => {
  try {
    const { key, value, ttl, delay_ms = 0 } = req.body;
    if (!key) return res.status(400).json({ success: false, error: "key is required" });

    const result = await guard.fetch(key, async () => {
      const cached = cache.get(key);
      if (cached !== null) return cached;
      if (delay_ms > 0) await new Promise(r => setTimeout(r, delay_ms));
      const fetched = value !== undefined ? value : `fetched:${key}`;
      cache.set(key, fetched, ttl || null);
      return fetched;
    });

    return res.json({
      success: true,
      key,
      value: result,
      guard: guard.getStats(),
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  setItem,
  getItem,
  deleteItem,
  getAllKeys,
  clearCache,
  getMetrics,
  resetMetrics,
  fetchItem,
};
