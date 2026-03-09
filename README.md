# Smart Cache Engine

![Node.js](https://img.shields.io/badge/Node.js-18%2B-brightgreen)
![Express](https://img.shields.io/badge/Express-4.x-blue)
![License](https://img.shields.io/badge/license-ISC-lightgrey)
![Status](https://img.shields.io/badge/status-in--development-orange)

> A Redis-like **in-memory caching engine** built from scratch in Node.js and Express.  
> Designed to teach how real cache systems (like Redis) work under the hood — including  
> LRU eviction, TTL expiration, memory cap simulation, metrics tracking, and a full REST API.

---

## Table of Contents

- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [API Reference](#api-reference)
- [Architecture](#architecture)
- [Core Data Structures](#core-data-structures)
- [Core Logic](#core-logic)
- [Cache Entry Object](#cache-entry-object)
- [Metrics](#metrics)
- [Project Structure](#project-structure)
- [Implementation Roadmap](#implementation-roadmap)
- [License](#license)

---

## Features

- **O(1) Key-Value storage** via JavaScript `Map` (hash table)
- **LRU eviction** — least recently used item is removed when cache is full
- **TTL expiration** — entries expire automatically after a configurable time
- **Lazy expiration** — TTL is checked on `get()`, no background overhead on Day 1
- **Active expiration** — background `setInterval` sweep for stale entries (Day 3)
- **Memory cap** — evicts when total byte usage exceeds a configurable limit (Day 3)
- **Metrics** — tracks hits, misses, evictions, hit rate, miss rate
- **REST API** — full HTTP interface to interact with the cache
- **Benchmarking** — measure ops/sec and latency under 100k operation load (Day 5)

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
node app.js
```

Server starts on `http://localhost:3000`

```
🚀 Smart Cache Engine running!
📡 Server: http://localhost:3000
```

---

## Project Structure

```
Smart-caching-engine/
├── app.js                     entry point — creates Express app, mounts routes, starts server
├── package.json
├── cache/
│   ├── cache.js               core cache — Map storage, eviction, TTL, metrics
│   ├── LRUCache.js            LRU cache — Map + DoublyLinkedList (Day 2)
│   ├── DoublyLinkedList.js    linked list for recency tracking (Day 2)
│   └── Node.js                doubly linked list node (Day 2)
├── types/
│   └── cacheEntry.js          factory — builds the entry object stored in the Map
├── services/
│   └── cacheService.js        business logic — handles req/res, calls cache methods
├── routes/
│   └── cacheRoutes.js         HTTP route definitions — maps URLs to service functions
├── expiration/
│   └── ExpirationManager.js   background TTL cleaner — setInterval scans (Day 3)
├── memory/
│   └── MemoryTracker.js       tracks total bytes used, triggers eviction (Day 3)
├── metrics/
│   └── Metrics.js             dedicated metrics tracker (Day 4)
├── benchmark/
│   └── benchmark.js           100k operation load test (Day 5)
└── utils/
    └── sizeCalculator.js      estimates object byte size (Day 3)
```

---

## Architecture

```
        Client (curl / Postman / app)
                    |
            HTTP Server (Express)
                    |
           Routes  (cacheRoutes.js)       ← maps URL paths to handlers
                    |
           Service (cacheService.js)      ← handles req/res, validates input
                    |
           Cache Engine (cache.js)        ← core logic
          /         |          \
     Memory     Expiration    Metrics
    Tracker      Manager      Tracker
          \         |          /
         LRU Eviction (DoublyLinkedList)  ← O(1) recency tracking
                    |
          In-Memory Storage (Map)         ← O(1) key lookups
```

### Layer Responsibilities

| Layer       | File                       | Responsibility                                 |
| ----------- | -------------------------- | ---------------------------------------------- |
| Entry Point | `app.js`                   | create Express app, mount routes, start server |
| Routes      | `routes/cacheRoutes.js`    | define HTTP endpoints, delegate to service     |
| Service     | `services/cacheService.js` | handle req/res, validate input, call cache     |
| Engine      | `cache/cache.js`           | Map storage, eviction, TTL, metrics            |
| Type        | `types/cacheEntry.js`      | build the entry object stored in the Map       |

---

## Core Data Structures

### HashMap (`Map`)

```
Key ──hash()──> Index ──> Value

"user:1"  →  { value: {name:"alice"}, createdAt: ..., expiresAt: ... }
"user:2"  →  { value: {name:"bob"},   createdAt: ..., expiresAt: ... }
```

- O(1) set, get, delete
- JavaScript `Map` preserves insertion order
- Primary storage for all cache entries

### Doubly Linked List

```
[HEAD] <-> nodeC <-> nodeB <-> nodeA <-> [TAIL]
  ↑                                        ↑
most recently used                least recently used
```

- O(1) move-to-head on every `get()` access
- O(1) remove-tail on eviction
- Each node stores `prev` and `next` pointers

### Why Map + Linked List Together

```
Map alone:         O(1) lookup   but no order tracking
Linked List alone: O(1) order    but O(n) lookup
Map + List:        O(1) lookup + O(1) order = O(1) everything
```

---

## Cache Entry Object

```javascript
{
    key:          "user:1",           // lookup key
    value:        { name: "alice" },  // the stored data (any JSON value)
    ttl:          5000,               // time-to-live in milliseconds
    createdAt:    1700000000000,      // timestamp when stored
    expiresAt:    1700000005000,      // auto-calculated: createdAt + ttl
    lastAccessed: 1700000003000,      // updated on every get() — used for LRU
    size:         42                  // approximate byte size of value
}
```

---

## Core Logic

### `set(key, value, ttl)`

```
1. Cache full? (store.size >= maxSize)
   YES → evict  (Day 1: oldest key | Day 2: LRU tail | Day 3: memory limit)
   NO  → continue

2. Build entry object via createCacheEntry(key, value, ttl)

3. store.set(key, entry)

4. (Day 2) Add node to HEAD of linked list
```

### `get(key)`

```
1. store.get(key)
   NOT FOUND → misses++, return null

2. entry.expiresAt < Date.now()?
   YES → delete from store, misses++, return null

3. entry.lastAccessed = Date.now()

4. (Day 2) Move node to HEAD of linked list

5. hits++, return entry.value
```

### `delete(key)`

```
1. store.delete(key)
   existed  → return true
   not found → return false

2. (Day 2) Remove node from linked list
```

### Eviction

```
Day 1 — FIFO:    delete first inserted key (Map insertion order)
Day 2 — LRU:     delete TAIL of linked list (least recently used)
Day 3 — Memory:  also evict when total bytes exceed memory cap
```

### TTL Expiration

```
Lazy  (Day 1): check expiresAt inside get() on every call
Active (Day 3): setInterval() background scan removes stale entries
```

---

## API Reference

### `POST /cache` — Store a value

**Body**

```json
{
  "key": "user:1",
  "value": { "name": "alice", "age": 30 },
  "ttl": 5000
}
```

> `ttl` is optional. Omit it for entries that never expire.

**Response `201`**

```json
{
  "success": true,
  "message": "key \"user:1\" stored",
  "meta": {
    "key": "user:1",
    "size": 27,
    "createdAt": 1700000000000,
    "expiresAt": 1700000005000
  }
}
```

**Response `400`** — missing key or value

```json
{
  "success": false,
  "error": "key and value are required"
}
```

---

### `GET /cache/:key` — Retrieve a value

```bash
GET /cache/user:1
```

**Response `200`**

```json
{
  "success": true,
  "key": "user:1",
  "value": { "name": "alice", "age": 30 }
}
```

**Response `404`** — not found or expired

```json
{
  "success": false,
  "error": "key \"user:1\" not found or expired"
}
```

---

### `DELETE /cache/:key` — Delete a key

```bash
DELETE /cache/user:1
```

**Response `200`**

```json
{
  "success": true,
  "message": "key \"user:1\" deleted"
}
```

---

### `GET /cache` — List all keys and stats

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

### `DELETE /cache` — Clear entire cache

**Response `200`**

```json
{
  "success": true,
  "message": "Cache cleared",
  "itemsRemoved": 3
}
```

---

### `GET /metrics` — Full metrics _(Day 4)_

**Response `200`**

```json
{
  "hits": 120,
  "misses": 20,
  "evictions": 5,
  "hitRate": "85.71%",
  "missRate": "14.29%",
  "totalItems": 3,
  "memoryUsed": "2.4kb"
}
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

# list all keys and stats
curl http://localhost:3000/cache

# delete a key
curl -X DELETE http://localhost:3000/cache/name

# clear everything
curl -X DELETE http://localhost:3000/cache
```

---

## Metrics

| Metric      | Description                                       |
| ----------- | ------------------------------------------------- |
| `hits`      | number of successful `get()` calls                |
| `misses`    | number of `get()` calls that returned null        |
| `evictions` | items removed because the cache was full          |
| `hitRate`   | `hits / (hits + misses) × 100` — cache efficiency |
| `missRate`  | `misses / (hits + misses) × 100`                  |

> A high hit rate (>80%) means the cache is working well.  
> A low hit rate means items expire or get evicted too aggressively.

---

## Project Structure

```
Smart-caching-engine/
├── app.js                        ← entry point
├── package.json
├── .gitignore
├── README.md
│
├── cache/
│   ├── cache.js                  ← core Map-based cache (Day 1) ✅
│   ├── LRUCache.js               ← LRU cache: Map + DoublyLinkedList (Day 2)
│   ├── DoublyLinkedList.js       ← linked list for recency order (Day 2)
│   └── Node.js                   ← doubly linked list node (Day 2)
│
├── types/
│   └── cacheEntry.js             ← entry object factory (Day 1) ✅
│
├── services/
│   └── cacheService.js           ← req/res handling + validation (Day 1) ✅
│
├── routes/
│   └── cacheRoutes.js            ← HTTP route definitions (Day 1) ✅
│
├── expiration/
│   └── ExpirationManager.js      ← background TTL sweep (Day 3)
│
├── memory/
│   └── MemoryTracker.js          ← byte usage tracking (Day 3)
│
├── metrics/
│   └── Metrics.js                ← dedicated metrics class (Day 4)
│
├── benchmark/
│   └── benchmark.js              ← 100k operation load test (Day 5)
│
└── utils/
    └── sizeCalculator.js         ← shared byte size utility (Day 3)
```

---

## Implementation Roadmap

### ✅ Day 1 — Core Cache (Done)

- `types/cacheEntry.js` — entry object factory
- `cache/cache.js` — Map storage, lazy TTL check, FIFO eviction, hit/miss tracking
- `services/cacheService.js` — req/res handling and input validation
- `routes/cacheRoutes.js` — Express route definitions
- `app.js` — server entry point

### Day 2 — LRU Eviction

- `cache/Node.js` — doubly linked list node (`value`, `prev`, `next`)
- `cache/DoublyLinkedList.js` — `addToHead()`, `removeTail()`, `moveToHead()`, `removeNode()`
- `cache/LRUCache.js` — cache using `Map` + `DoublyLinkedList` for true O(1) LRU

### Day 3 — TTL + Memory Tracking

- `expiration/ExpirationManager.js` — `setInterval` background sweep to delete stale entries
- `memory/MemoryTracker.js` — track total byte usage, trigger eviction when limit exceeded
- `utils/sizeCalculator.js` — shared `Buffer.byteLength(JSON.stringify(v))` utility

### Day 4 — Metrics + Polish

- `metrics/Metrics.js` — dedicated class tracking sets, gets, hits, misses, evictions
- `GET /metrics` endpoint returning full stats JSON
- Global error handling middleware in `app.js`

### Day 5 — Benchmarking

- `benchmark/benchmark.js` — 100,000 operation load test
- Measure: ops/sec, average latency (ms), hit ratio
- Use Node's built-in `perf_hooks` for precision timing

---

## License

ISC — [Ahmed Abdelgelel](https://github.com/AhmedAbdelgelel)
