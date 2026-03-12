"use strict";

const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const { MemoryTracker } = require("../memory/MemoryTracker");

describe("MemoryTracker – add / remove", () => {
  test("starts at zero usage", () => {
    const m = new MemoryTracker(1000);
    assert.equal(m.usedBytes, 0);
  });

  test("add increases usedBytes", () => {
    const m = new MemoryTracker(1000);
    m.add(100);
    assert.equal(m.usedBytes, 100);
  });

  test("multiple add calls accumulate", () => {
    const m = new MemoryTracker(1000);
    m.add(100);
    m.add(200);
    assert.equal(m.usedBytes, 300);
  });

  test("remove decreases usedBytes", () => {
    const m = new MemoryTracker(1000);
    m.add(200);
    m.remove(50);
    assert.equal(m.usedBytes, 150);
  });

  test("usedBytes never drops below zero", () => {
    const m = new MemoryTracker(1000);
    m.remove(500); // remove more than was ever added
    assert.equal(m.usedBytes, 0);
  });

  test("a sequence of add/remove tracks correctly", () => {
    const m = new MemoryTracker(10_000);
    m.add(100);
    m.add(200);
    m.remove(50);
    m.add(300);
    m.remove(100);
    // 100 + 200 - 50 + 300 - 100 = 450
    assert.equal(m.usedBytes, 450);
  });
});

describe("MemoryTracker – peakBytes", () => {
  test("peakBytes tracks the maximum usedBytes ever reached", () => {
    const m = new MemoryTracker(1000);
    m.add(300);
    m.add(200); // peak = 500
    m.remove(400);
    assert.equal(m.peakBytes, 500);
    assert.equal(m.usedBytes, 100);
  });

  test("peakBytes does not decrease when usage falls", () => {
    const m = new MemoryTracker(1000);
    m.add(800);
    m.remove(700);
    m.add(100);
    assert.equal(m.peakBytes, 800);
  });
});

describe("MemoryTracker – isOverLimit", () => {
  test("returns false when exactly at limit", () => {
    const m = new MemoryTracker(1000);
    m.add(1000);
    assert.equal(m.isOverLimit(), false);
  });

  test("returns false when under limit", () => {
    const m = new MemoryTracker(1000);
    m.add(999);
    assert.equal(m.isOverLimit(), false);
  });

  test("returns true when over limit", () => {
    const m = new MemoryTracker(1000);
    m.add(1001);
    assert.equal(m.isOverLimit(), true);
  });

  test("transitions from over to under limit after remove", () => {
    const m = new MemoryTracker(100);
    m.add(200);
    assert.equal(m.isOverLimit(), true);
    m.remove(150);
    assert.equal(m.isOverLimit(), false);
  });
});

describe("MemoryTracker – getStats", () => {
  test("returns correct MB conversion for used, max, and peak", () => {
    const m = new MemoryTracker(1024 * 1024); // 1 MiB
    m.add(512 * 1024);                         // 0.5 MiB
    const s = m.getStats();
    assert.equal(s.max_mb, 1);
    assert.equal(s.used_mb, 0.5);
    assert.equal(s.peak_mb, 0.5);
  });

  test("usage_pct is correct", () => {
    const m = new MemoryTracker(1000);
    m.add(250);
    assert.equal(m.getStats().usage_pct, 25);
  });

  test("usage_pct is 0 when maxBytes is 0", () => {
    const m = new MemoryTracker(0);
    assert.equal(m.getStats().usage_pct, 0);
  });
});

describe("MemoryTracker – reset", () => {
  test("reset zeros usedBytes and peakBytes", () => {
    const m = new MemoryTracker(1000);
    m.add(500);
    m.reset();
    assert.equal(m.usedBytes, 0);
    assert.equal(m.peakBytes, 0);
  });

  test("isOverLimit is false after reset regardless of prior state", () => {
    const m = new MemoryTracker(100);
    m.add(500);
    m.reset();
    assert.equal(m.isOverLimit(), false);
  });
});
