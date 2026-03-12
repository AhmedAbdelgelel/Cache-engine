"use strict";

// ExpirationManager is exercised through LRUCache because it needs direct
// access to cache.store, cache.list, cache.memory, and cache.metrics.

const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const { LRUCache } = require("../cache/LRUCache");

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

describe("ExpirationManager – manual sweepNow()", () => {
  test("sweepNow removes expired entries and returns count", async () => {
    const cache = new LRUCache({ maxSize: 100, sweepInterval: 600_000 });
    cache.set("exp",   "val", 1);      // 1 ms TTL — will expire
    cache.set("alive", "val", 60_000); // 60 s TTL — will not expire

    await delay(20);
    const swept = cache.expirer.sweepNow();

    assert.equal(swept, 1);
    assert.equal(cache.store.has("exp"),   false);
    assert.equal(cache.store.has("alive"), true);
    cache.destroy();
  });

  test("sweepNow does not touch entries without a TTL", () => {
    const cache = new LRUCache({ maxSize: 100, sweepInterval: 600_000 });
    cache.set("a", 1);
    cache.set("b", 2);

    const swept = cache.expirer.sweepNow();

    assert.equal(swept, 0);
    assert.equal(cache.size(), 2);
    cache.destroy();
  });

  test("sweepNow increments metrics.expirations", async () => {
    const cache = new LRUCache({ maxSize: 100, sweepInterval: 600_000 });
    cache.set("a", 1, 1);
    cache.set("b", 2, 1);

    await delay(20);
    cache.expirer.sweepNow();

    assert.equal(cache.getMetrics().operations.expirations, 2);
    cache.destroy();
  });

  test("totalExpired accumulates across multiple sweeps", async () => {
    const cache = new LRUCache({ maxSize: 100, sweepInterval: 600_000 });
    cache.set("a", 1, 1);
    cache.set("b", 2, 1);
    cache.set("c", 3, 1);

    await delay(20);
    cache.expirer.sweepNow();
    cache.expirer.sweepNow(); // second sweep finds nothing new, total stays

    assert.equal(cache.expirer.totalExpired, 3);
    cache.destroy();
  });

  test("sweepNow credits memory back for each removed entry", async () => {
    const cache = new LRUCache({ maxSize: 100, sweepInterval: 600_000 });
    cache.set("e", "x".repeat(50), 1);
    const bytesAfterSet = cache.memory.usedBytes;

    await delay(20);
    cache.expirer.sweepNow();

    assert.ok(cache.memory.usedBytes < bytesAfterSet);
    cache.destroy();
  });
});

describe("ExpirationManager – automatic timer", () => {
  test("auto sweep fires and removes expired entries without a get()", async () => {
    const cache = new LRUCache({ maxSize: 100, sweepInterval: 20 }); // fast sweep
    cache.set("gone", "val", 10); // 10 ms TTL

    await delay(100); // wait for at least one sweep cycle

    assert.equal(cache.store.has("gone"), false);
    cache.destroy();
  });

  test("stop() prevents further sweeps from running", async () => {
    const cache = new LRUCache({ maxSize: 100, sweepInterval: 20 });
    cache.set("x", "val", 10);
    cache.expirer.stop(); // kill the timer before it fires

    await delay(100);

    // The entry is expired but has not been swept — it is still in the store
    // (lazy expiry via get() would remove it, but no get() was called)
    assert.equal(cache.store.has("x"), true);
    cache.destroy();
  });
});
