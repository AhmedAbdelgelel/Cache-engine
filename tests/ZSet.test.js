"use strict";

const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const { ZSet } = require("../cache/ZSet");

function make() { return new ZSet(); }

describe("ZSet – zadd", () => {
  test("zadd returns 1 for a new member", () => {
    assert.equal(make().zadd("alice", 100), 1);
  });

  test("zadd returns 0 when updating an existing member", () => {
    const zs = make();
    zs.zadd("alice", 100);
    assert.equal(zs.zadd("alice", 200), 0);
  });

  test("updated score is reflected by zscore", () => {
    const zs = make();
    zs.zadd("alice", 10);
    zs.zadd("alice", 99);
    assert.equal(zs.zscore("alice"), 99);
  });
});

describe("ZSet – zscore", () => {
  test("returns the correct score", () => {
    const zs = make();
    zs.zadd("alice", 42);
    assert.equal(zs.zscore("alice"), 42);
  });

  test("returns null for a missing member", () => {
    assert.equal(make().zscore("ghost"), null);
  });
});

describe("ZSet – zincrby", () => {
  test("increments score and returns new value", () => {
    const zs = make();
    zs.zadd("a", 10);
    assert.equal(zs.zincrby("a", 5), 15);
    assert.equal(zs.zscore("a"), 15);
  });

  test("creates member with given increment when it does not exist", () => {
    const zs = make();
    assert.equal(zs.zincrby("new", 7), 7);
    assert.equal(zs.zcard(), 1);
  });

  test("zincrby with negative value decreases score", () => {
    const zs = make();
    zs.zadd("a", 100);
    assert.equal(zs.zincrby("a", -30), 70);
  });
});

describe("ZSet – zrank / zrevrank", () => {
  test("zrank returns 0-based ascending rank", () => {
    const zs = make();
    zs.zadd("a", 10);
    zs.zadd("b", 20);
    zs.zadd("c", 30);
    assert.equal(zs.zrank("a"), 0);
    assert.equal(zs.zrank("b"), 1);
    assert.equal(zs.zrank("c"), 2);
  });

  test("zrank returns null for a missing member", () => {
    assert.equal(make().zrank("ghost"), null);
  });

  test("zrevrank returns 0-based descending rank", () => {
    const zs = make();
    zs.zadd("a", 10);
    zs.zadd("b", 20);
    zs.zadd("c", 30);
    assert.equal(zs.zrevrank("c"), 0); // highest score → rank 0 descending
    assert.equal(zs.zrevrank("a"), 2);
  });

  test("zrevrank returns null for a missing member", () => {
    assert.equal(make().zrevrank("ghost"), null);
  });

  test("rank updates correctly after score change", () => {
    const zs = make();
    zs.zadd("a", 100);
    zs.zadd("b", 50);
    zs.zadd("c", 75);
    // initial ascending: b=0, c=1, a=2
    assert.equal(zs.zrank("b"), 0);
    zs.zadd("b", 200); // b is now highest
    assert.equal(zs.zrank("b"), 2);
  });
});

describe("ZSet – zrange / zrevrange", () => {
  test("zrange returns members in ascending score order", () => {
    const zs = make();
    zs.zadd("b", 20);
    zs.zadd("a", 10);
    zs.zadd("c", 30);
    const members = zs.zrange(0, -1).map(r => r.member);
    assert.deepEqual(members, ["a", "b", "c"]);
  });

  test("zrange slices correctly with start/stop", () => {
    const zs = make();
    for (let i = 1; i <= 5; i++) zs.zadd(`m${i}`, i * 10);
    const result = zs.zrange(1, 3);
    assert.equal(result.length, 3);
    assert.equal(result[0].score, 20);
    assert.equal(result[2].score, 40);
  });

  test("zrevrange returns members in descending score order", () => {
    const zs = make();
    zs.zadd("a", 10);
    zs.zadd("b", 20);
    zs.zadd("c", 30);
    const members = zs.zrevrange(0, -1).map(r => r.member);
    assert.deepEqual(members, ["c", "b", "a"]);
  });

  test("ties in score are broken by member name (lexicographic)", () => {
    const zs = make();
    zs.zadd("beta",  5);
    zs.zadd("alpha", 5);
    zs.zadd("gamma", 5);
    const members = zs.zrange(0, -1).map(r => r.member);
    assert.deepEqual(members, ["alpha", "beta", "gamma"]);
  });
});

describe("ZSet – zrangebyscore", () => {
  test("returns members with score in [min, max] inclusive", () => {
    const zs = make();
    zs.zadd("a", 10);
    zs.zadd("b", 20);
    zs.zadd("c", 30);
    const result = zs.zrangebyscore(10, 20);
    assert.equal(result.length, 2);
    assert.equal(result[0].member, "a");
    assert.equal(result[1].member, "b");
  });

  test("returns empty array when no members are in range", () => {
    const zs = make();
    zs.zadd("a", 5);
    assert.deepEqual(zs.zrangebyscore(10, 20), []);
  });
});

describe("ZSet – zrem", () => {
  test("removes a member and returns 1", () => {
    const zs = make();
    zs.zadd("a", 1);
    assert.equal(zs.zrem("a"), 1);
    assert.equal(zs.zscore("a"), null);
  });

  test("returns 0 for a missing member", () => {
    assert.equal(make().zrem("ghost"), 0);
  });

  test("removed member does not appear in zrange", () => {
    const zs = make();
    zs.zadd("a", 1);
    zs.zadd("b", 2);
    zs.zrem("a");
    const members = zs.zrange(0, -1).map(r => r.member);
    assert.deepEqual(members, ["b"]);
  });
});

describe("ZSet – zcard / zcount", () => {
  test("zcard returns 0 for empty set", () => {
    assert.equal(make().zcard(), 0);
  });

  test("zcard returns correct member count", () => {
    const zs = make();
    zs.zadd("a", 1);
    zs.zadd("b", 2);
    assert.equal(zs.zcard(), 2);
  });

  test("zcount counts members in score range", () => {
    const zs = make();
    for (let i = 1; i <= 10; i++) zs.zadd(`m${i}`, i * 10);
    assert.equal(zs.zcount(20, 50), 4); // scores 20,30,40,50
  });

  test("zcount returns 0 when nothing is in range", () => {
    const zs = make();
    zs.zadd("a", 1);
    assert.equal(zs.zcount(50, 100), 0);
  });
});
