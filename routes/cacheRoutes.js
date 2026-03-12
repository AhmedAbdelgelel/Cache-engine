const express = require("express");
const router = express.Router();
const {
  setItem,
  getItem,
  deleteItem,
  getAllKeys,
  clearCache,
  getMetrics,
  resetMetrics,
  fetchItem,
} = require("../services/cacheService");

// Key-value operations
router.post("/", setItem);
router.get("/", getAllKeys);
router.delete("/", clearCache);

// Metrics endpoints (must come before /:key to avoid route shadowing)
router.get("/metrics",        getMetrics);
router.post("/metrics/reset", resetMetrics);

// StampedeGuard-protected fetch (must come before /:key to avoid shadowing)
router.post("/fetch", fetchItem);

// Single-key operations
router.get("/:key",    getItem);
router.delete("/:key", deleteItem);

module.exports = router;
