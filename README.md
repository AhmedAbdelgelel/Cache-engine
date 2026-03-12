# Smart Cache Engine

![Node.js](https://img.shields.io/badge/Node.js-18%2B-brightgreen)
![Express](https://img.shields.io/badge/Express-5.x-blue)
![Tests](https://img.shields.io/badge/tests-79%20passed-brightgreen)
![License](https://img.shields.io/badge/license-ISC-lightgrey)

> A Redis-like **in-memory caching engine** built from scratch in Node.js and Express.
> Designed to teach how real cache systems work under the hood — LRU eviction, TTL expiration,
> memory cap enforcement, p99 latency metrics, sorted sets, stampede protection, and a full REST API.

---

## Table of Contents

- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Project Structure](#project-structure)
- [Architecture](#architecture)
- [Core Data Structures](#core-data-structures)
- [Core Logic](#core-logic)
- [API Reference](#api-reference)
- [Sorted Sets (ZSet)](#sorted-sets-zset)
- [Metrics](#metrics)
- [Testing](#testing)
- [Benchmarking](#benchmarking)
- [Implementation Roadmap](#implementation-roadmap)
- [License](#license)

---

## Features

- **O(1) key-value storage** via JavaScript `Map`
- **LRU eviction** — doubly-linked list + Map gives O(1) recency tracking
- **TTL expiration** — lazy check on `get()` + active background sweep every second
- **Memory cap** — evicts LRU entries when total byte usage exceeds a configurable limit
- **Metrics** — hits, misses, evictions, expirations, p50/p95/p99 latency per operation
- **Sorted Sets** — Redis-style `ZADD / ZRANK / ZRANGE / ZRANGEBYSCORE / ZINCRBY` (leaderboards, priority queues)
- **Stampede Guard** — coalesces concurrent cache-miss fetches for the same key into a single backend call
- **REST API** — full HTTP interface for all operations
- **Test suite** — 79 tests across 5 modules using Node's built-in test runner (zero extra dependencies)
- **Benchmark suite** — 10 scenarios covering throughput, Zipf hot keys, TTL storm, memory pressure, and more

---

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or higher
- npm v8 or higher

```bash
node --version   # v18+
npm --version    # v8+
```

---

## Installation

```bash
git clone https://github.com/AhmedAbdelgelel/Cache-engine.git
cd Cache-engine
npm install
```

---

## Quick Start

```bash
npm start
```

Server starts on `http://localhost:3000`

```
  Smart Cache Engine
  ==================
  Server  : http://localhost:3000
  Cache   : http://localhost:3000/cache
  Metrics : http://localhost:3000/cache/metrics
  ZSets   : http://localhost:3000/zset
  Health  : http://localhost:3000/health
```

---

## Project Structure

```
Smart-caching-engine/
├── app.js                        entry point — Express app, routes, global error handler
├── package.json
│
├── cache/
│   ├── cache.js                  original FIFO cache (Day 1, kept for reference)
│   ├── LRUCache.js               production cache — Map + DoublyLinkedList + subsystems
│   ├── DoublyLinkedList.js       O(1) recency tracking
│   ├── Node.js                   doubly linked list node
│   ├── StampedeGuard.js          promise deduplication — prevents thundering herd
│   └── ZSet.js                   Redis-style sorted set
│
├── expiration/
│   └── ExpirationManager.js      background setInterval sweep for stale TTL entries
│
├── memory/
│   └── MemoryTracker.js          byte budget — tracks used/peak, triggers eviction
│
├── metrics/
│   └── Metrics.js                counters + reservoir sampling for p50/p95/p99 latency
│
├── types/
│   └── cacheEntry.js             entry object factory (key, value, size, expiresAt, …)
│
├── services/
│   ├── cacheService.js           cache request handlers + StampedeGuard integration
│   └── zsetService.js            sorted-set request handlers
│
├── routes/
│   ├── cacheRoutes.js            /cache HTTP endpoints
│   ├── zsetRoutes.js             /zset HTTP endpoints
│   └── index.js
│
├── utils/
│   └── sizeCalculator.js         Buffer.byteLength(JSON.stringify(v)) helper
│
├── benchmark/
│   └── benchmark.js              10-scenario performance suite (1M ops/scenario)
│
└── tests/
    ├── LRUCache.test.js          24 tests — eviction order, TTL, metrics, memory cap
    ├── ZSet.test.js              25 tests — all operations, rank ordering, tie-breaking
    ├── StampedeGuard.test.js      7 tests — deduplication, concurrency, lifecycle
    ├── ExpirationManager.test.js  7 tests — sweep correctness, timer, memory credits
    └── MemoryTracker.test.js     16 tests — add/remove, peak, limit, stats, reset
```

---

## Architecture

```
        Client (curl / Postman / app)
                    |
            HTTP Server (Express)
              /             \
    cacheRoutes.js      zsetRoutes.js
         |                    |
  cacheService.js       zsetService.js
    (+ StampedeGuard)     (Map<name,ZSet>)
         |
    LRUCache
   /    |    \
Map  DblList  MemoryTracker
         |
  ExpirationManager ──► timer unref'd (won't block exit)
         |
      Metrics  (reservoir sampling, p50/p95/p99)
```

### Layer Responsibilities

| Layer       | File(s)                           | Responsibility                                       |
| ----------- | --------------------------------- | ---------------------------------------------------- |
| Entry point | `app.js`                          | mount routes, global error handler, startup banner   |
| Routes      | `routes/cacheRoutes.js`           | URL → handler mapping, route ordering (no shadowing) |
| Routes      | `routes/zsetRoutes.js`            | ZSet URL → handler mapping                           |
| Service     | `services/cacheService.js`        | validate input, call LRUCache, expose StampedeGuard  |
| Service     | `services/zsetService.js`         | named-set registry (`Map<name,ZSet>`), handlers      |
| Cache       | `cache/LRUCache.js`               | set/get/delete, two-path eviction, TTL               |
| Cache       | `cache/ZSet.js`                   | sorted set — Map + lazy-sorted array                 |
| Guard       | `cache/StampedeGuard.js`          | inflight promise dedup, `deduplicated` counter       |
| Expiry      | `expiration/ExpirationManager.js` | sweepNow(), auto-interval, totalExpired              |
| Memory      | `memory/MemoryTracker.js`         | usedBytes, peakBytes, isOverLimit(), getStats()      |
| Metrics     | `metrics/Metrics.js`              | counters + reservoir sampling (10k samples/op)       |
| Type        | `types/cacheEntry.js`             | builds the entry object with pre-computed size       |

---

## Core Data Structures

### Map + Doubly Linked List (LRU)

```
Map:         "user:1" → { entry, node }    O(1) lookup
             "user:2" → { entry, node }

List:  HEAD <-> [user:3] <-> [user:1] <-> [user:2] <-> TAIL
                most recent                least recent
```

Every `get()` hit moves the node to HEAD in O(1).
Eviction removes from TAIL in O(1).
Sentinel head/tail nodes eliminate null-pointer edge cases.

### Why Map + Linked List

```
Map alone:         O(1) lookup  — no recency order
Linked list alone: O(1) reorder — O(n) lookup
Map + List:        O(1) lookup + O(1) reorder = O(1) everything
```

### Sorted Set (ZSet)

```
members: Map<member, score>     O(1) score lookup / existence
sorted:  [{member, score}, …]   sorted array, rebuilt lazily on range queries
_dirty:  boolean                true after any write — sort deferred until needed
```

Writes (`zadd`, `zincrby`) mark `_dirty = true` but do not sort.
Range queries (`zrange`, `zrank`, `zrangebyscore`) call `_ensureSorted()` first.
This batches sort cost — multiple writes pay only one sort.

---

## Core Logic

### `set(key, value, ttl)`

```
1. Key already exists?
   YES → update entry in-place, move node to HEAD

2. store.size >= maxSize?
   YES → evict LRU tail (count-based eviction)

3. Build entry: createCacheEntry(key, value, ttl)
   → size = Buffer.byteLength(JSON.stringify(value))
   → expiresAt = ttl ? Date.now() + ttl : null

4. memory.add(entry.size)
   memory.isOverLimit()? → evict LRU tail (memory-based eviction)

5. addToHead(new Node), store.set(key, { entry, node })
```

### `get(key)`

```
1. store.get(key) — not found? → miss, return null

2. entry.expiresAt !== null && Date.now() > expiresAt?
   YES → remove node, credit memory, delete from store → miss, return null

3. list.moveToHead(node)

4. → hit, return entry.value
```

### TTL Expiration (two layers)

```
Lazy  (in get()): checks expiresAt on every access — catches hot expired keys instantly
Active (ExpirationManager): setInterval every 1s scans all entries — catches keys
                             that are never read again; timer.unref() won't block exit
```

### Eviction (two triggers)

```
Count trigger: store.size >= maxSize  → evict LRU tail
Memory trigger: usedBytes > maxBytes  → evict LRU tail (runs after every set)
```

---

## API Reference

### Cache — Key/Value

#### `POST /cache` — Store a value

```json
{ "key": "user:1", "value": { "name": "alice" }, "ttl": 5000 }
```

> `ttl` is optional (milliseconds). Omit for entries that never expire.

**Response `201`**

```json
{
  "success": true,
  "message": "key \"user:1\" stored",
  "meta": {
    "key": "user:1",
    "size": 18,
    "createdAt": 1700000000000,
    "expiresAt": 1700000005000
  }
}
```

---

#### `GET /cache/:key` — Retrieve a value

**Response `200`**

```json
{ "success": true, "key": "user:1", "value": { "name": "alice" } }
```

**Response `404`** — not found or expired

```json
{ "success": false, "error": "key \"user:1\" not found or expired" }
```

---

#### `DELETE /cache/:key` — Delete a key

**Response `200`**

```json
{ "success": true, "message": "key \"user:1\" deleted" }
```

---

#### `GET /cache` — List all keys and live stats

**Response `200`**

```json
{
  "success": true,
  "totalItems": 3,
  "hitRate": "85.71%",
  "missRate": "14.29%",
  "keys": ["user:1", "user:2", "session:abc"]
}
```

---

#### `DELETE /cache` — Clear entire cache

**Response `200`**

```json
{ "success": true, "message": "Cache cleared", "itemsRemoved": 3 }
```

---

#### `POST /cache/fetch` — Get-or-load with StampedeGuard

Protects against thundering herd: N concurrent requests for the same missing key
trigger the loader **once**. All waiters receive the same resolved value.

```json
{ "key": "user:1", "value": { "name": "alice" }, "ttl": 5000, "delay_ms": 50 }
```

> `delay_ms` simulates backend latency. `value` is what the loader returns on a miss.

**Response `200`**

```json
{
  "success": true,
  "key": "user:1",
  "value": { "name": "alice" },
  "guard": { "inflight": 0, "deduplicated": 499 }
}
```

---

### Cache — Metrics

#### `GET /cache/metrics` — Full metrics snapshot

**Response `200`**

```json
{
  "success": true,
  "hits": 8452,
  "misses": 1548,
  "evictions": 120,
  "expirations": 33,
  "hitRate": "84.52%",
  "missRate": "15.48%",
  "totalItems": 247,
  "memoryUsed": "1.24 MB",
  "memoryPeak": "3.10 MB",
  "memoryLimit": "64.00 MB",
  "latency_us": {
    "get": { "count": 100, "avg": 1.2, "p50": 1, "p95": 3, "p99": 8 },
    "set": { "count": 42, "avg": 2.1, "p50": 2, "p95": 5, "p99": 12 },
    "delete": { "count": 6, "avg": 1.0, "p50": 1, "p95": 2, "p99": 3 }
  }
}
```

#### `POST /cache/metrics/reset` — Zero all counters

**Response `200`**

```json
{ "success": true, "message": "Metrics reset" }
```

---

### Sorted Sets (ZSet)

All endpoints are namespaced — you can have multiple independent sets (`/zset/leaderboard`, `/zset/ratelimit`, etc.).

#### `POST /zset/:name` — Add / update a member

```json
{ "member": "alice", "score": 1500 }
```

**Response `201`**

```json
{ "success": true, "added": 1, "member": "alice", "score": 1500 }
```

> `added: 1` = new member, `added: 0` = score updated

---

#### `POST /zset/:name/incrby` — Increment a member's score

```json
{ "member": "alice", "increment": 50 }
```

**Response `200`**

```json
{ "success": true, "member": "alice", "score": 1550 }
```

---

#### `GET /zset/:name/score/:member` — Get a member's score

**Response `200`**

```json
{ "success": true, "member": "alice", "score": 1550 }
```

---

#### `GET /zset/:name/rank/:member` — Get a member's rank (ascending, 0-based)

**Response `200`**

```json
{ "success": true, "member": "alice", "rank": 2 }
```

---

#### `GET /zset/:name/range?start=0&stop=-1` — Get members by rank range

**Response `200`**

```json
{
  "success": true,
  "members": [
    { "member": "bob", "score": 900 },
    { "member": "alice", "score": 1550 }
  ]
}
```

---

#### `GET /zset/:name/rangebyscore?min=1000&max=2000` — Get members by score range

**Response `200`**

```json
{
  "success": true,
  "members": [{ "member": "alice", "score": 1550 }]
}
```

---

#### `GET /zset/:name/card` — Count members

**Response `200`**

```json
{ "success": true, "cardinality": 42 }
```

---

#### `DELETE /zset/:name/:member` — Remove a member

**Response `200`**

```json
{ "success": true, "removed": 1 }
```

---

## Metrics

| Metric        | Description                                                    |
| ------------- | -------------------------------------------------------------- |
| `hits`        | successful `get()` calls                                       |
| `misses`      | `get()` calls that returned null (key missing or expired)      |
| `evictions`   | entries removed because cache was full (count or memory limit) |
| `expirations` | entries removed by the active TTL sweep                        |
| `hitRate`     | `hits / (hits + misses) × 100`                                 |
| `latency p50` | median operation latency in microseconds                       |
| `latency p95` | 95th percentile — typical "slow" request                       |
| `latency p99` | 99th percentile — worst case (excluding outliers)              |
| `memoryUsed`  | current byte usage across all stored values                    |
| `memoryPeak`  | highest byte usage ever reached in this session                |

> Latency is sampled at 1% of operations using reservoir sampling (10,000 samples/op),
> giving statistically valid percentiles with near-zero overhead.

---

## Testing

Uses Node's built-in `node:test` and `node:assert` — **no extra dependencies**.

> Tests verify **correctness** — they assert that every module behaves exactly as specified.
> They do **not** measure speed. For performance numbers, see [Benchmarking](#benchmarking) below.

```bash
npm test
```

### Test output

```
# tests 79
# suites 25
# pass 79
# fail 0
# cancelled 0
# skipped 0
# duration_ms 401.17
```

### Test results by module

| Suite                             | Tests | Pass | Duration | What's verified                                                                |
| --------------------------------- | ----: | ---: | -------: | ------------------------------------------------------------------------------ |
| `LRUCache.test.js`               |    24 |   24 |  ~486 ms | set/get, overwrite, delete, clear, LRU eviction order, TTL lazy + active, metrics hit/miss/eviction, memory cap eviction |
| `ZSet.test.js`                    |    25 |   25 |   ~10 ms | zadd (add/update), zscore, zincrby (existing + new + negative), zrank, zrevrank, zrange, zrevrange, zrangebyscore, zrem, zcard, zcount, tie-breaking by name, rank after update |
| `StampedeGuard.test.js`          |     7 |    7 |   ~66 ms | single fetch, 10-way concurrent dedup, different keys independent, lifecycle after resolution, inflight count during load, reset |
| `ExpirationManager.test.js`      |     7 |    7 |  ~308 ms | sweepNow removes expired, skips non-expired, increments metrics, credits memory, auto-timer fires, stop() blocks sweeps, totalExpired accumulates |
| `MemoryTracker.test.js`          |    16 |   16 |    ~7 ms | add/remove, no underflow, peak tracking, isOverLimit transitions, MB conversion, usage_pct, reset |

### Detailed test output

<details>
<summary>Click to expand full TAP output</summary>

```
LRUCache – basics
  ok  set and get a value
  ok  returns null for a missing key
  ok  overwrites an existing key
  ok  size() reflects the number of live keys
  ok  keys() returns all stored keys

LRUCache – delete & clear
  ok  delete removes a key and returns true
  ok  delete on a missing key returns false
  ok  clear removes all keys and returns their count

LRUCache – LRU eviction order
  ok  evicts the least-recently-used key when at capacity
  ok  evicts the first-inserted key when none have been accessed
  ok  re-setting an existing key promotes it to head
  ok  eviction counter increments on each eviction

LRUCache – TTL
  ok  get returns the value before TTL expires
  ok  lazy expiry: get returns null after TTL elapses
  ok  active sweep removes expired entries without a get()
  ok  non-expired entry survives a sweep

LRUCache – metrics
  ok  records hits and misses
  ok  hitRate and missRate sum to 100

LRUCache – memory tracking
  ok  usedBytes increases after set
  ok  usedBytes decreases after delete
  ok  memory cap evicts entries to stay within limit

ZSet – zadd
  ok  zadd returns 1 for a new member
  ok  zadd returns 0 when updating an existing member
  ok  updated score is reflected by zscore

ZSet – zscore
  ok  returns the correct score
  ok  returns null for a missing member

ZSet – zincrby
  ok  increments score and returns new value
  ok  creates member with given increment when it does not exist
  ok  zincrby with negative value decreases score

ZSet – zrank / zrevrank
  ok  zrank returns 0-based ascending rank
  ok  zrank returns null for a missing member
  ok  zrevrank returns 0-based descending rank
  ok  zrevrank returns null for a missing member
  ok  rank updates correctly after score change

ZSet – zrange / zrevrange
  ok  zrange returns members in ascending score order
  ok  zrange slices correctly with start/stop
  ok  zrevrange returns members in descending score order
  ok  ties in score are broken by member name (lexicographic)

ZSet – zrangebyscore
  ok  returns members with score in [min, max] inclusive
  ok  returns empty array when no members are in range

ZSet – zrem
  ok  removes a member and returns 1
  ok  returns 0 for a missing member
  ok  removed member does not appear in zrange

ZSet – zcard / zcount
  ok  zcard returns 0 for empty set
  ok  zcard returns correct member count
  ok  zcount counts members in score range
  ok  zcount returns 0 when nothing is in range

StampedeGuard – single fetch
  ok  calls the loader exactly once and returns its value
  ok  after the promise resolves, the key is removed from inflight

StampedeGuard – concurrent fetches (thundering herd)
  ok  N concurrent fetches for the same key trigger the loader only once
  ok  deduplicated counter reflects coalesced calls
  ok  different keys each call their own loader independently

StampedeGuard – lifecycle after resolution
  ok  a subsequent fetch after resolution calls the loader again
  ok  inflight count is 1 while the loader is pending

StampedeGuard – reset
  ok  reset clears deduplicated count and inflight map

ExpirationManager – manual sweepNow()
  ok  sweepNow removes expired entries and returns count
  ok  sweepNow does not touch entries without a TTL
  ok  sweepNow increments metrics.expirations
  ok  totalExpired accumulates across multiple sweeps
  ok  sweepNow credits memory back for each removed entry

ExpirationManager – automatic timer
  ok  auto sweep fires and removes expired entries without a get()
  ok  stop() prevents further sweeps from running

MemoryTracker – add / remove
  ok  starts at zero usage
  ok  add increases usedBytes
  ok  multiple add calls accumulate
  ok  remove decreases usedBytes
  ok  usedBytes never drops below zero
  ok  a sequence of add/remove tracks correctly

MemoryTracker – peakBytes
  ok  peakBytes tracks the maximum usedBytes ever reached
  ok  peakBytes does not decrease when usage falls

MemoryTracker – isOverLimit
  ok  returns false when exactly at limit
  ok  returns false when under limit
  ok  returns true when over limit
  ok  transitions from over to under limit after remove

MemoryTracker – getStats
  ok  returns correct MB conversion for used, max, and peak
  ok  usage_pct is correct
  ok  usage_pct is 0 when maxBytes is 0

MemoryTracker – reset
  ok  reset zeros usedBytes and peakBytes
  ok  isOverLimit is false after reset regardless of prior state
```

</details>

---

## Benchmarking

> Benchmarks measure **throughput and latency** under synthetic load.
> They do **not** verify correctness — that is the job of [Testing](#testing) above.

```bash
npm run benchmark          # full run — 1M ops/scenario
npm run benchmark:quick    # 50k ops/scenario (faster)
npm run benchmark:json     # machine-readable JSON output
```

### Tests vs Benchmarks

| Aspect          | `tests/` (npm test)                          | `benchmark/` (npm run benchmark)                  |
| --------------- | -------------------------------------------- | ------------------------------------------------- |
| **Purpose**     | Correctness — does it work?                  | Performance — how fast is it?                     |
| **Runner**      | `node:test` (TAP output)                     | Custom harness (`benchmark.js`)                   |
| **Assertions**  | `node:assert/strict` — pass/fail             | None — measures ops/s, latency, hit rate          |
| **Scale**       | Small inputs (3-100 entries)                 | Large inputs (50K-1M ops per scenario)            |
| **Timing**      | ~400 ms total                                | ~30s (quick) / ~3 min (full)                      |
| **Dependencies**| Zero                                         | Zero                                              |

### Scenarios

| Scenario            | What it stresses                                                        |
| ------------------- | ----------------------------------------------------------------------- |
| Throughput Baseline | Raw SET then GET with no eviction                                       |
| Zipfian Hot Keys    | Realistic 80/20 access pattern (exponent=7, mathematically correct)     |
| Mixed Workload      | 70% GET / 20% SET / 10% DEL                                             |
| Worst-case Eviction | `maxSize=1` — every SET evicts                                          |
| TTL Storm           | 500k entries with 1ms TTL, active sweep, then lazy miss scan            |
| Memory Pressure     | 2 MiB cap with 1 KB values, continuous memory eviction                  |
| Value Weight Stress | 8B / 128B / 1KB / 10KB / 100KB payloads compared                        |
| Key-Count Scaling   | 1k / 10k / 100k / 1M keyspace compared                                  |
| Cache Stampede      | 500 concurrent requests vs StampedeGuard — shows backend call reduction |
| ZSet Bench          | 500k ops: 25% ZADD / ZINCRBY / ZRANK / ZRANGEBYSCORE                    |

Each scenario reports **ops/s**, **p50/p95/p99 latency (us)**, **hit rate**, and **eviction count**.

### Benchmark results (1M ops/scenario, Node v22, Win x64)

#### Throughput

| Scenario                     | ops/s       | GET p99 | SET p99 | Hit Rate | Evictions |
| ---------------------------- | ----------: | ------: | ------: | -------: | --------: |
| Throughput Baseline (SET+GET)| 1,452,860   | 2 us    | 2 us    | 100%     | 0         |
| Zipfian Hot Keys (80/20)     | 3,214,936   | 1 us    | —       | 100%     | 0         |
| Mixed Workload (70G/20S/10D) | 1,542,456   | 1 us    | 2 us    | 64.03%   | 0         |
| Worst-case Eviction (max=1)  | 2,370,577   | —       | 1 us    | 0%       | 499,999   |

#### Expiration & Memory

| Scenario                          | ops/s     | SET p99 | Evictions | Expirations |
| --------------------------------- | --------: | ------: | --------: | ----------: |
| TTL Storm (mass expiry)           | 1,593,091 | 2 us    | 0         | 500,000     |
| Memory Pressure (2 MiB, 1KB vals) | 346,692  | 5 us    | 97,956    | 0           |

#### Value Weight Stress

| Value Size | ops/s     | SET p50 | SET p99 |
| ---------- | --------: | ------: | ------: |
| 8 B        | 1,619,515 | 1 us    | 2 us    |
| 128 B      | 1,672,716 | 1 us    | 2 us    |
| 1 KB       | 642,477   | 3 us    | 4 us    |
| 10 KB      | 92,503    | 21 us   | 25 us   |
| 100 KB     | 9,570     | 202 us  | 276 us  |

#### Key-Count Scaling

| Keyspace     | ops/s     | Hit Rate |
| ------------ | --------: | -------: |
| 1,000 keys   | 4,411,906 | 100%     |
| 10,000 keys  | 3,185,876 | 100%     |
| 100,000 keys | 1,415,115 | 100%     |
| 1,000,000 keys| 2,118,045| 14.42%   |

#### Cache Stampede (500 concurrent requests)

| Strategy          | Loader Calls | Saved |
| ----------------- | -----------: | ----: |
| Without guard     | 1,000        | 0     |
| With StampedeGuard| 1            | 999   |

> **99.9%** fewer backend calls with StampedeGuard enabled.

#### ZSet Sorted Set (5,000 members, 500K ops)

| Mix                                          | ops/s  |
| -------------------------------------------- | -----: |
| 25% ZADD / 25% ZINCRBY / 25% ZRANK / 25% ZRANGEBYSCORE | 30,141 |

#### Summary

```
Scenario                                        ops/s       hit%     evictions
────────────────────────────────────────────────────────────────────────────────
Throughput Baseline (SET+GET)                 1,452,860      100%             0
Zipfian Hot Keys (80/20)                      3,214,936      100%             0
Mixed Workload (70G/20S/10D)                  1,542,456    64.03%             0
Worst-case Eviction (maxSize=1)               2,370,577        0%       499,999
TTL Storm (mass expiry)                       1,593,091        0%             0
Memory Pressure (2 MiB cap, 1 KB vals)          346,692        0%        97,956
────────────────────────────────────────────────────────────────────────────────
Total operations benchmarked                : 5,600,000
```

---

## Example Usage (curl)

```bash
# store a value (no TTL)
curl -X POST http://localhost:3000/cache \
  -H "Content-Type: application/json" \
  -d '{"key":"name","value":"alice"}'

# store with TTL (5 seconds)
curl -X POST http://localhost:3000/cache \
  -H "Content-Type: application/json" \
  -d '{"key":"session","value":"xyz123","ttl":5000}'

# get a value
curl http://localhost:3000/cache/name

# stampede-safe fetch (simulates 50ms backend, deduplicates concurrent callers)
curl -X POST http://localhost:3000/cache/fetch \
  -H "Content-Type: application/json" \
  -d '{"key":"user:1","value":{"name":"alice"},"ttl":60000,"delay_ms":50}'

# metrics (with latency percentiles)
curl http://localhost:3000/cache/metrics

# sorted set — leaderboard
curl -X POST http://localhost:3000/zset/leaderboard \
  -H "Content-Type: application/json" \
  -d '{"member":"alice","score":1500}'

curl http://localhost:3000/zset/leaderboard/rank/alice

curl "http://localhost:3000/zset/leaderboard/range?start=0&stop=9"

# health check
curl http://localhost:3000/health
```

---

## Implementation Roadmap

### Day 1 — Core Cache

- `types/cacheEntry.js` — entry object factory (key, value, size, createdAt, expiresAt)
- `cache/cache.js` — Map storage, lazy TTL check, FIFO eviction, hit/miss tracking
- `services/cacheService.js` — req/res handling and input validation
- `routes/cacheRoutes.js` — Express route definitions
- `app.js` — server entry point

### Day 2 — LRU Eviction

- `cache/Node.js` — doubly linked list node (`key`, `value`, `prev`, `next`)
- `cache/DoublyLinkedList.js` — `addToHead()`, `removeTail()`, `moveToHead()`, `remove()`
- `cache/LRUCache.js` — Map + DoublyLinkedList, O(1) everything

### Day 3 — TTL + Memory

- `expiration/ExpirationManager.js` — `setInterval` sweep, `timer.unref()`, `totalExpired`
- `memory/MemoryTracker.js` — `usedBytes`, `peakBytes`, `isOverLimit()`, MB stats
- `utils/sizeCalculator.js` — `Buffer.byteLength(JSON.stringify(v))`

### Day 4 — Metrics + Polish

- `metrics/Metrics.js` — counters, reservoir sampling (10k samples), p50/p95/p99 latency
- `GET /cache/metrics` and `POST /cache/metrics/reset`
- Global error handler in `app.js`

### Day 5 — Sorted Sets + Stampede Guard

- `cache/ZSet.js` — Redis-style sorted set (Map + lazy-sorted array, 11 operations)
- `cache/StampedeGuard.js` — promise deduplication, `deduplicated` counter
- `services/zsetService.js` + `routes/zsetRoutes.js` — full REST API for named sets
- `POST /cache/fetch` — StampedeGuard integrated into cache service

### Day 6 — Tests + Benchmark Accuracy

- `tests/` — 79 correctness tests across all 5 modules using `node:test` (zero dependencies)
- Benchmark fixes: Zipf exponent corrected to 7 (true 80/20), TTL Storm excludes sleep from wall time, ZSet range narrowed to ~10% of score space

---

## License

ISC — [Ahmed Abdelgelel](https://github.com/AhmedAbdelgelel)
