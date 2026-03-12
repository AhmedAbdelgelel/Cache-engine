"use strict";

const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const { StampedeGuard } = require("../cache/StampedeGuard");

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

describe("StampedeGuard – single fetch", () => {
  test("calls the loader exactly once and returns its value", async () => {
    const guard = new StampedeGuard();
    let calls = 0;
    const result = await guard.fetch("k", async () => { calls++; return "result"; });
    assert.equal(result, "result");
    assert.equal(calls, 1);
  });

  test("after the promise resolves, the key is removed from inflight", async () => {
    const guard = new StampedeGuard();
    await guard.fetch("k", async () => "x");
    assert.equal(guard.getStats().inflight, 0);
  });
});

describe("StampedeGuard – concurrent fetches (thundering herd)", () => {
  test("N concurrent fetches for the same key trigger the loader only once", async () => {
    const guard = new StampedeGuard();
    let calls = 0;
    const loader = () => delay(20).then(() => { calls++; return "value"; });

    const results = await Promise.all(
      Array.from({ length: 10 }, () => guard.fetch("hot", loader))
    );

    assert.equal(calls, 1, "loader should be called exactly once");
    assert.ok(results.every(r => r === "value"), "all callers should get the same value");
  });

  test("deduplicated counter reflects coalesced calls", async () => {
    const guard = new StampedeGuard();
    const loader = () => delay(20).then(() => "x");

    await Promise.all(
      Array.from({ length: 5 }, () => guard.fetch("k", loader))
    );

    // 5 calls total, 1 real, 4 deduplicated
    assert.equal(guard.getStats().deduplicated, 4);
  });

  test("different keys each call their own loader independently", async () => {
    const guard = new StampedeGuard();
    const calls = { a: 0, b: 0 };

    await Promise.all([
      guard.fetch("a", async () => { calls.a++; return "a"; }),
      guard.fetch("b", async () => { calls.b++; return "b"; }),
    ]);

    assert.equal(calls.a, 1);
    assert.equal(calls.b, 1);
  });
});

describe("StampedeGuard – lifecycle after resolution", () => {
  test("a subsequent fetch after resolution calls the loader again", async () => {
    const guard = new StampedeGuard();
    let calls = 0;
    const loader = async () => { calls++; return calls; };

    await guard.fetch("k", loader);
    await guard.fetch("k", loader); // key is no longer inflight

    assert.equal(calls, 2);
  });

  test("inflight count is 1 while the loader is pending", async () => {
    const guard = new StampedeGuard();
    let resolve;
    const loader = () => new Promise(r => { resolve = r; });

    const p = guard.fetch("k", loader);
    assert.equal(guard.getStats().inflight, 1);

    resolve("done");
    await p;
    assert.equal(guard.getStats().inflight, 0);
  });
});

describe("StampedeGuard – reset", () => {
  test("reset clears deduplicated count and inflight map", async () => {
    const guard = new StampedeGuard();
    const loader = () => delay(10).then(() => "x");

    await Promise.all([
      guard.fetch("k", loader),
      guard.fetch("k", loader),
    ]);

    guard.reset();
    assert.equal(guard.getStats().deduplicated, 0);
    assert.equal(guard.getStats().inflight, 0);
  });
});
