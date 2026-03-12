const { ZSet } = require("../cache/ZSet");

const zsets = new Map();

function getOrCreate(name) {
  if (!zsets.has(name)) zsets.set(name, new ZSet());
  return zsets.get(name);
}

const zadd = (req, res) => {
  const { name } = req.params;
  const { member, score } = req.body;
  if (!member || score === undefined) {
    return res.status(400).json({ success: false, error: "member and score are required" });
  }
  const added = getOrCreate(name).zadd(member, score);
  return res.status(201).json({ success: true, added, member, score });
};

const zscore = (req, res) => {
  const { name, member } = req.params;
  const zs = zsets.get(name);
  if (!zs) return res.status(404).json({ success: false, error: `zset "${name}" not found` });
  const score = zs.zscore(member);
  if (score === null) return res.status(404).json({ success: false, error: `member "${member}" not found` });
  return res.json({ success: true, member, score });
};

const zrank = (req, res) => {
  const { name, member } = req.params;
  const zs = zsets.get(name);
  if (!zs) return res.status(404).json({ success: false, error: `zset "${name}" not found` });
  const rank = zs.zrank(member);
  if (rank === null) return res.status(404).json({ success: false, error: `member "${member}" not found` });
  return res.json({ success: true, member, rank });
};

const zrange = (req, res) => {
  const { name } = req.params;
  const start = parseInt(req.query.start) || 0;
  const stop = parseInt(req.query.stop) || -1;
  const zs = zsets.get(name);
  if (!zs) return res.status(404).json({ success: false, error: `zset "${name}" not found` });
  return res.json({ success: true, members: zs.zrange(start, stop) });
};

const zrangebyscore = (req, res) => {
  const { name } = req.params;
  const min = parseFloat(req.query.min) || 0;
  const max = parseFloat(req.query.max) || Infinity;
  const zs = zsets.get(name);
  if (!zs) return res.status(404).json({ success: false, error: `zset "${name}" not found` });
  return res.json({ success: true, members: zs.zrangebyscore(min, max) });
};

const zincrby = (req, res) => {
  const { name } = req.params;
  const { member, increment } = req.body;
  if (!member || increment === undefined) {
    return res.status(400).json({ success: false, error: "member and increment are required" });
  }
  const newScore = getOrCreate(name).zincrby(member, increment);
  return res.json({ success: true, member, score: newScore });
};

const zrem = (req, res) => {
  const { name, member } = req.params;
  const zs = zsets.get(name);
  if (!zs) return res.status(404).json({ success: false, error: `zset "${name}" not found` });
  const removed = zs.zrem(member);
  if (!removed) return res.status(404).json({ success: false, error: `member "${member}" not found` });
  return res.json({ success: true, removed: 1 });
};

const zcard = (req, res) => {
  const { name } = req.params;
  const zs = zsets.get(name);
  if (!zs) return res.json({ success: true, cardinality: 0 });
  return res.json({ success: true, cardinality: zs.zcard() });
};

module.exports = { zadd, zscore, zrank, zrange, zrangebyscore, zincrby, zrem, zcard };
