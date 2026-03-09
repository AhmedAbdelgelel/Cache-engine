const { Cache } = require("../cache/cache");

const cache = new Cache(100);

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
    keys: [...cache.cache.keys()],
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

module.exports = {
  setItem,
  getItem,
  deleteItem,
  getAllKeys,
  clearCache,
};
