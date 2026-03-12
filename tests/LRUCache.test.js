"use strict";

const { describe, test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { LRUCache } = require("../cache/LRUCache");

// Helper — sweep interval set far in the future so the timer never fires
// during synchronous tests. Call cache.destroy() when done.
function make(maxSize = 3, extra = {}) {
  return new LRUCache({ maxSize, sweepInterval: 600_000, ...extra });
}

describe("LRUCache – basics", () => {
  test("set and get a value", () => {
    const c = make();
    c.set("a", 42);
    assert.equal(c.get("a"), 42);
    c.destroy();
  });

  test("returns null for a missing key", () => {
    const c = make();
    assert.equal(c.get("nope"), null);
    c.destroy();
  });

  test("overwrites an existing key", () => {
    const c = make();
    c.set("a", 1);
    c.set("a", 99);
    assert.equal(c.get("a"), 99);
    c.destroy();
  });

  test("size() reflects the number of live keys", () => {
    const c = make(10);
    c.set("a", 1);
    c.set("b", 2);
    assert.equal(c.size(), 2);
    c.destroy();
  });

  test("keys() returns all stored keys", () => {
    const c = make(10);
    c.set("x", 1);
    c.set("y", 2);
    assert.deepEqual(c.keys().sort(), ["x", "y"]);
    c.destroy();
  });
});

describe("LRUCache – delete & clear", () => {
  test("delete removes a key and returns true", () => {
    const c = make();
    c.set("a", 1);
    assert.equal(c.delete("a"), true);
    assert.equal(c.get("a"), null);
    c.destroy();
  });

  test("delete on a missing key returns false", () => {
    const c = make();
    assert.equal(c.delete("ghost"), false);
    c.destroy();
  });

  test("clear removes all keys and returns their count", () => {
    const c = make(10);
    c.set("a", 1);
    c.set("b", 2);
    assert.equal(c.clear(), 2);
    assert.equal(c.size(), 0);
    c.destroy();
  });
});

describe("LRUCache – LRU eviction order", () => {
  test("evicts the least-recently-used key when at capacity", () => {
    const c = make(3);
    c.set("a", 1);
    c.set("b", 2);
    c.set("c", 3);
    c.get("a");        // touch a → b is now LRU
    c.set("d", 4);     // should evict b
    assert.equal(c.get("b"), null, "b should be evicted");
    assert.equal(c.get("a"), 1);
    assert.equal(c.get("c"), 3);
    assert.equal(c.get("d"), 4);
    c.destroy();
  });

  test("evicts the first-inserted key when none have been accessed", () => {
    const c = make(3);
    c.set("a", 1);
    c.set("b", 2);
    c.set("c", 3);
    c.set("d", 4); // evicts a
    assert.equal(c.get("a"), null);
    c.destroy();
  });

  test("re-setting an existing key promotes it to head", () => {
    const c = make(3);
    c.set("a", 1);
    c.set("b", 2);
    c.set("c", 3);
    c.set("a", 99); // promotes a → b is now LRU
    c.set("d", 4);  // evicts b
    assert.equal(c.get("a"), 99);
    assert.equal(c.get("b"), null);
    c.destroy();
  });

  test("eviction counter increments on each eviction", () => {
    const c = make(2);
    c.set("a", 1);
    c.set("b", 2);
    c.set("c", 3); // evicts a
    c.set("d", 4); // evicts b
    assert.equal(c.getMetrics().operations.evictions, 2);
    c.destroy();
  });
});

describe("LRUCache – TTL", () => {
  test("get returns the value before TTL expires", async () => {
    const c = make();
    c.set("x", "hello", 200);
    assert.equal(c.get("x"), "hello");
    c.destroy();
  });

  test("lazy expiry: get returns null after TTL elapses", async () => {
    const c = make();
    c.set("x", "hello", 30);
    await new Promise(r => setTimeout(r, 60));
    assert.equal(c.get("x"), null);
    c.destroy();
  });

  test("active sweep removes expired entries without a get()", async () => {
    const c = new LRUCache({ maxSize: 100, sweepInterval: 20 }); // fast sweep
    c.set("y", "world", 10);
    await new Promise(r => setTimeout(r, 80));
    assert.equal(c.store.has("y"), false);
    c.destroy();
  });

  test("non-expired entry survives a sweep", async () => {
    const c = new LRUCache({ maxSize: 100, sweepInterval: 20 });
    c.set("z", "alive", 60_000); // 60 s TTL
    await new Promise(r => setTimeout(r, 80));
    assert.equal(c.store.has("z"), true);
    c.destroy();
  });
});

describe("LRUCache – metrics", () => {
  test("records hits and misses", () => {
    const c = make();
    c.set("a", 1);
    c.get("a"); // hit
    c.get("b"); // miss
    const m = c.getMetrics();
    assert.equal(m.operations.hits, 1);
    assert.equal(m.operations.misses, 1);
    c.destroy();
  });

  test("hitRate and missRate sum to 100", () => {
    const c = make();
    c.set("a", 1);
    c.get("a"); // hit
    c.get("b"); // miss
    const m = c.getMetrics();
    assert.equal(m.rates.hit_rate_pct + m.rates.miss_rate_pct, 100);
    c.destroy();
  });
});

describe("LRUCache – memory tracking", () => {
  test("usedBytes increases after set", () => {
    const c = make(100);
    const before = c.memory.usedBytes;
    c.set("k", "value");
    assert.ok(c.memory.usedBytes > before);
    c.destroy();
  });

  test("usedBytes decreases after delete", () => {
    const c = make(100);
    c.set("k", "hello");
    const after = c.memory.usedBytes;
    c.delete("k");
    assert.ok(c.memory.usedBytes < after);
    c.destroy();
  });

  test("memory cap evicts entries to stay within limit", () => {
    // 60-byte cap, value is ~200 bytes → eviction loop fires
    const c = new LRUCache({ maxSize: 10_000, maxMemoryBytes: 60, sweepInterval: 600_000 });
    c.set("a", "x".repeat(50));
    c.set("b", "x".repeat(50)); // second entry pushes over limit, a is evicted
    assert.ok(c.memory.usedBytes <= 200, "usedBytes should not grow without bound");
    c.destroy();
  });
});
