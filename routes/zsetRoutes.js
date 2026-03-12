const express = require("express");
const router = express.Router();
const { zadd, zscore, zrank, zrange, zrangebyscore, zincrby, zrem, zcard } = require("../services/zsetService");

router.post("/:name", zadd);
router.post("/:name/incrby", zincrby);
router.get("/:name/score/:member", zscore);
router.get("/:name/rank/:member", zrank);
router.get("/:name/range", zrange);
router.get("/:name/rangebyscore", zrangebyscore);
router.get("/:name/card", zcard);
router.delete("/:name/:member", zrem);

module.exports = router;
