const express = require("express");
const router = express.Router();
const {
  setItem,
  getItem,
  deleteItem,
  getAllKeys,
  clearCache,
} = require("../services/cacheService");

router.post("/", setItem);
router.get("/", getAllKeys);
router.get("/:key", getItem);
router.delete("/", clearCache);
router.delete("/:key", deleteItem);

module.exports = router;
