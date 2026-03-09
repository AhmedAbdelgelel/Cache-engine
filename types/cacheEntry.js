function createCacheEntry(key, value, ttl = null) {
  const now = Date.now();
  return {
    key,
    value,
    ttl,
    createdAt: now,
    expiresAt: ttl !== null ? now + ttl : null,
    lastAccessed: now,
    size: Buffer.byteLength(JSON.stringify(value)),
  };
}

module.exports = { createCacheEntry };
