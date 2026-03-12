"use strict";

const { LRUCache } = require("../cache/LRUCache");
const { ZSet } = require("../cache/ZSet");
const { StampedeGuard } = require("../cache/StampedeGuard");

const QUICK = process.argv.includes("--quick");
const JSON_OUT = process.argv.includes("--json");
const OPS = QUICK ? 50_000 : 1_000_000;

const ESC = (c, s) => (JSON_OUT ? s : `\x1b[${c}m${s}\x1b[0m`);
const bold = (s) => ESC(1, s);
const dim = (s) => ESC(2, s);
const cyan = (s) => ESC(36, s);
const green = (s) => ESC(32, s);
const yellow = (s) => ESC(33, s);
const red = (s) => ESC(31, s);

function elapsed(hr) {
  const [s, ns] = process.hrtime(hr);
  return s + ns / 1e9;
}

function fmt(n) {
  return Number(n).toLocaleString("en-US");
}
function lpad(s, w) {
  return String(s).padEnd(w);
}
function rpad(s, w) {
  return String(s).padStart(w);
}
function payload(len) {
  return "x".repeat(len);
}

// Exponent=7 approximates 80/20: ~80% of requests land on the bottom 20% of keys.
// Derivation: P(pow(U,7) < 0.2) = P(U < 0.2^(1/7)) = P(U < 0.80) = 80%.
function zipf(n) {
  return Math.floor(n * Math.pow(Math.random(), 7));
}

function opsColor(n) {
  return n > 2_000_000 ? green : n > 1_000_000 ? yellow : red;
}

function hitColor(pct) {
  return pct >= 80 ? green : pct >= 50 ? yellow : red;
}

function makeCache(opts = {}) {
  return new LRUCache({
    maxSize: opts.maxSize || 10_000,
    maxMemoryBytes: opts.maxMemoryBytes || 512 * 1024 * 1024,
    sweepInterval: opts.sweepInterval || 300_000,
  });
}

function header(title) {
  console.log();
  console.log(
    cyan(bold(`  -- ${title} ${"─".repeat(Math.max(0, 60 - title.length))}`)),
  );
  console.log();
}

const results = [];

function record(name, ops, sec, cache, extra) {
  const m = cache.getMetrics();
  const r = {
    name,
    ops,
    sec: +sec.toFixed(4),
    ops_per_sec: Math.round(ops / sec),
    hit_pct: m.rates.hit_rate_pct,
    evictions: m.operations.evictions,
    expirations: m.operations.expirations,
    lat: m.latency_us,
    mem: m.memory,
    ...extra,
  };
  results.push(r);
  cache.destroy();
  return r;
}

function printRow(r) {
  const c = opsColor(r.ops_per_sec);
  console.log(
    `  ${bold(lpad(r.name, 42))} ${c(rpad(fmt(r.ops_per_sec), 14))} ops/s`,
  );
  if (r.lat.get && r.lat.get.count > 0)
    console.log(
      dim(
        `    GET  p50=${r.lat.get.p50}us  p95=${r.lat.get.p95}us  p99=${r.lat.get.p99}us`,
      ),
    );
  if (r.lat.set && r.lat.set.count > 0)
    console.log(
      dim(
        `    SET  p50=${r.lat.set.p50}us  p95=${r.lat.set.p95}us  p99=${r.lat.set.p99}us`,
      ),
    );
  console.log(
    dim(
      `    hit-rate=${hitColor(r.hit_pct)(r.hit_pct + "%")}  evictions=${fmt(r.evictions)}  expirations=${fmt(r.expirations)}`,
    ),
  );
  if (r.lines) r.lines.forEach((l) => console.log(dim(`    ${l}`)));
  console.log();
}

// ─── scenarios ──────────────────────────────────────────────────────────────

function throughputBaseline() {
  const N = OPS;
  const cache = makeCache({ maxSize: N + 1 });

  for (let i = 0; i < 500; i++) cache.set(`warmup:${i}`, i);
  cache.clear();
  cache.metrics.reset();

  const hr = process.hrtime();
  for (let i = 0; i < N; i++) cache.set(`k:${i}`, i);
  for (let i = 0; i < N; i++) cache.get(`k:${i}`);
  const sec = elapsed(hr);

  return record("Throughput Baseline (SET+GET)", N * 2, sec, cache);
}

function zipfianHotKeys() {
  const N = OPS;
  const KS = 10_000;
  const cache = makeCache({ maxSize: KS });

  for (let i = 0; i < KS; i++) cache.set(`z:${i}`, { id: i });
  cache.metrics.reset();

  const hr = process.hrtime();
  for (let i = 0; i < N; i++) cache.get(`z:${zipf(KS)}`);
  const sec = elapsed(hr);

  return record("Zipfian Hot Keys (80/20)", N, sec, cache);
}

async function ttlStorm() {
  const N = Math.min(OPS, 500_000);
  const cache = makeCache({ maxSize: N + 1 });

  // Time SET phase only
  const hrSet = process.hrtime();
  for (let i = 0; i < N; i++) cache.set(`ttl:${i}`, i, 1);
  const setSec = elapsed(hrSet);

  // Sleep is NOT counted — we're just letting TTLs expire
  await new Promise((r) => setTimeout(r, 30));

  // Time sweep + lazy-miss phase
  const hrWork = process.hrtime();
  const swept = cache.expirer.sweepNow();

  let misses = 0;
  for (let i = 0; i < N; i++) {
    if (cache.get(`ttl:${i}`) === null) misses++;
  }
  const sec = setSec + elapsed(hrWork); // excludes sleep

  return record("TTL Storm (mass expiry)", N * 2, sec, cache, {
    lines: [
      `active sweep expired  : ${fmt(swept)}`,
      `lazy misses after     : ${fmt(misses)}`,
    ],
  });
}

function memoryPressure() {
  const cache = makeCache({
    maxSize: 500_000,
    maxMemoryBytes: 2 * 1024 * 1024,
  });
  const N = Math.min(OPS, 100_000);
  const val = payload(1024);

  const hr = process.hrtime();
  for (let i = 0; i < N; i++) cache.set(`mem:${i}`, val);
  const sec = elapsed(hr);

  const ms = cache.memory.getStats();
  return record("Memory Pressure (2 MiB cap, 1 KB vals)", N, sec, cache, {
    lines: [
      `memory cap  : ${ms.max_mb} MiB  used: ${ms.used_mb} MiB (${ms.usage_pct}%)  peak: ${ms.peak_mb} MiB`,
      `live keys   : ${fmt(cache.size())}`,
    ],
  });
}

function mixedWorkload() {
  const N = OPS;
  const KS = 50_000;
  const cache = makeCache({ maxSize: KS });

  for (let i = 0; i < KS / 2; i++) cache.set(`mx:${i}`, { v: i });
  cache.metrics.reset();

  let gets = 0,
    sets = 0,
    dels = 0;
  const hr = process.hrtime();
  for (let i = 0; i < N; i++) {
    const r = Math.random();
    const k = `mx:${Math.floor(Math.random() * KS)}`;
    if (r < 0.7) {
      cache.get(k);
      gets++;
    } else if (r < 0.9) {
      cache.set(k, { v: i });
      sets++;
    } else {
      cache.delete(k);
      dels++;
    }
  }
  const sec = elapsed(hr);

  return record("Mixed Workload (70G/20S/10D)", N, sec, cache, {
    lines: [`GET=${fmt(gets)}  SET=${fmt(sets)}  DEL=${fmt(dels)}`],
  });
}

function worstCaseEviction() {
  const cache = makeCache({ maxSize: 1 });
  const N = Math.min(OPS, 500_000);

  const hr = process.hrtime();
  for (let i = 0; i < N; i++) cache.set(`e:${i}`, i);
  const sec = elapsed(hr);

  return record("Worst-case Eviction (maxSize=1)", N, sec, cache, {
    lines: [
      `every SET triggers eviction -> ${fmt(cache.metrics.evictions)} evictions`,
    ],
  });
}

function valueWeightStress() {
  const sizes = [
    { label: "8 B", bytes: 8 },
    { label: "128 B", bytes: 128 },
    { label: "1 KB", bytes: 1_024 },
    { label: "10 KB", bytes: 10_240 },
    { label: "100 KB", bytes: 102_400 },
  ];
  const N = Math.min(OPS / 5, 100_000);

  console.log(
    `  ${bold(lpad("Value size", 14))} ${rpad("ops/s", 14)} ${rpad("SET p50 us", 12)} ${rpad("SET p99 us", 12)}`,
  );
  console.log("  " + "─".repeat(56));

  for (const { label, bytes } of sizes) {
    const cache = makeCache({ maxSize: N + 1 });
    const val = payload(bytes);

    const hr = process.hrtime();
    for (let i = 0; i < N; i++) cache.set(`vw:${i}`, val);
    for (let i = 0; i < N; i++) cache.get(`vw:${i}`);
    const sec = elapsed(hr);

    const ops = Math.round((N * 2) / sec);
    const lat = cache.metrics.getLatencyStats("set");
    const c = opsColor(ops);
    console.log(
      `  ${lpad(label, 14)} ${c(rpad(fmt(ops), 14))} ${rpad(lat.p50, 12)} ${rpad(lat.p99, 12)}`,
    );
    cache.destroy();
  }
  console.log();
}

function keyCountScaling() {
  const spaces = [1_000, 10_000, 100_000, QUICK ? 200_000 : 1_000_000];
  const N = Math.min(OPS, 500_000);

  console.log(
    `  ${bold(lpad("Keyspace", 16))} ${rpad("ops/s", 14)} ${rpad("hit-rate", 10)} ${rpad("evictions", 12)}`,
  );
  console.log("  " + "─".repeat(56));

  for (const ks of spaces) {
    const cache = makeCache({ maxSize: ks });
    for (let i = 0; i < Math.min(ks, 100_000); i++) cache.set(`sc:${i}`, i);
    cache.metrics.reset();

    const hr = process.hrtime();
    for (let i = 0; i < N; i++) {
      const k = `sc:${Math.floor(Math.random() * ks)}`;
      if (i % 5 === 0) cache.set(k, i);
      else cache.get(k);
    }
    const sec = elapsed(hr);
    const m = cache.getMetrics();
    const ops = Math.round(N / sec);
    const c = opsColor(ops);

    console.log(
      `  ${lpad(fmt(ks) + " keys", 16)} ` +
        `${c(rpad(fmt(ops), 14))} ` +
        `${rpad(m.rates.hit_rate_pct + "%", 10)} ` +
        `${rpad(fmt(m.operations.evictions), 12)}`,
    );
    cache.destroy();
  }
  console.log();
}

async function stampedeTest() {
  const CONCURRENCY = 500;
  let calls = 0;
  const loader = () =>
    new Promise((resolve) => {
      setTimeout(() => {
        calls++;
        resolve({ ts: Date.now() });
      }, 20);
    });

  calls = 0;
  const hr1 = process.hrtime();
  await Promise.all(
    Array.from({ length: CONCURRENCY }, () => {
      calls++;
      return loader();
    }),
  );
  const sec1 = elapsed(hr1);
  const unguardedCalls = calls;

  const guard = new StampedeGuard();
  calls = 0;
  const hr2 = process.hrtime();
  await Promise.all(
    Array.from({ length: CONCURRENCY }, () => guard.fetch("hot-key", loader)),
  );
  const sec2 = elapsed(hr2);
  const guardedCalls = calls;
  const stats = guard.getStats();

  console.log(
    `  Concurrency : ${bold(CONCURRENCY)} simultaneous cache-miss requests`,
  );
  console.log(`  Loader      : 20ms simulated backend`);
  console.log();
  console.log(
    `  ${lpad("Strategy", 24)} ${rpad("Loader calls", 14)} ${rpad("Wall time", 12)} ${rpad("Saved", 10)}`,
  );
  console.log("  " + "─".repeat(62));
  console.log(
    `  ${lpad("Without guard", 24)} ${red(rpad(fmt(unguardedCalls), 14))} ${rpad(sec1.toFixed(3) + "s", 12)} ${rpad("0", 10)}`,
  );
  console.log(
    `  ${lpad("With StampedeGuard", 24)} ${green(rpad(fmt(guardedCalls), 14))} ${rpad(sec2.toFixed(3) + "s", 12)} ${green(rpad(fmt(unguardedCalls - guardedCalls), 10))}`,
  );
  console.log();
  console.log(`  Deduplication : ${green(fmt(stats.deduplicated))} collapsed`);
  console.log(
    `  Savings       : ${green(((1 - guardedCalls / unguardedCalls) * 100).toFixed(1) + "%")} fewer backend calls`,
  );
  console.log();
}

function zsetBench() {
  const zs = new ZSet();
  const N = Math.min(OPS, 500_000);

  for (let i = 0; i < 5_000; i++)
    zs.zadd(`player:${i}`, Math.random() * 100_000);

  const hr = process.hrtime();
  for (let i = 0; i < N; i++) {
    const m = `player:${i % 5_000}`;
    switch (i % 4) {
      case 0:
        zs.zadd(m, Math.random() * 100_000);
        break;
      case 1:
        zs.zincrby(m, 1);
        break;
      case 2:
        zs.zrank(m);
        break;
      case 3:
        zs.zrangebyscore(45_000, 55_000);
        break; // ~10% of score space (~500 results)
    }
  }
  const sec = elapsed(hr);
  const ops = Math.round(N / sec);

  console.log(`  ZSet cardinality : 5,000 members`);
  console.log(
    `  Ops mix          : 25% ZADD / 25% ZINCRBY / 25% ZRANK / 25% ZRANGEBYSCORE`,
  );
  console.log(`  Total ops        : ${fmt(N)}`);
  console.log(`  Throughput       : ${opsColor(ops)(bold(fmt(ops)))} ops/s`);
  console.log();
}

// ─── main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log();
  console.log(
    bold(
      cyan("  ╔═══════════════════════════════════════════════════════════╗"),
    ),
  );
  console.log(
    bold(
      cyan("  ║          Smart Cache Engine — Benchmark Suite             ║"),
    ),
  );
  console.log(
    bold(
      cyan("  ╚═══════════════════════════════════════════════════════════╝"),
    ),
  );
  console.log();
  console.log(
    dim(`  Mode     : ${QUICK ? "quick" : "full (1M ops/scenario)"}`),
  );
  console.log(dim(`  Ops/run  : ${fmt(OPS)}`));
  console.log(dim(`  Node.js  : ${process.version}`));
  console.log(dim(`  Platform : ${process.platform} ${process.arch}`));

  header("THROUGHPUT");
  printRow(throughputBaseline());
  printRow(zipfianHotKeys());
  printRow(mixedWorkload());
  printRow(worstCaseEviction());

  header("EXPIRATION & MEMORY");
  printRow(await ttlStorm());
  printRow(memoryPressure());

  header("VALUE WEIGHT STRESS");
  valueWeightStress();

  header("KEY-COUNT SCALING");
  keyCountScaling();

  header("CACHE STAMPEDE / THUNDERING HERD");
  await stampedeTest();

  header("ZSET SORTED SET");
  zsetBench();

  header("SUMMARY");
  console.log(
    `  ${bold(lpad("Scenario", 44))} ` +
      `${rpad("ops/s", 14)} ` +
      `${rpad("hit%", 8)} ` +
      `${rpad("evictions", 11)}`,
  );
  console.log("  " + "─".repeat(80));

  let total = 0;
  for (const r of results) {
    const c = opsColor(r.ops_per_sec);
    console.log(
      `  ${lpad(r.name, 44)} ` +
        `${c(rpad(fmt(r.ops_per_sec), 14))} ` +
        `${rpad(r.hit_pct + "%", 8)} ` +
        `${rpad(fmt(r.evictions), 11)}`,
    );
    total += r.ops;
  }

  console.log("  " + "─".repeat(80));
  console.log(`  ${dim("Total operations benchmarked")} : ${bold(fmt(total))}`);
  console.log();

  if (JSON_OUT) {
    process.stdout.write(
      JSON.stringify({ results, total_ops: total }, null, 2),
    );
  }
}

main().catch((err) => {
  console.error(red("[BENCHMARK FATAL]"), err);
  process.exit(1);
});
