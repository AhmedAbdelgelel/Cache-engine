const express = require("express");
const mountRoutes = require("./routes");

const app = express();
app.use(express.json());

// Routes
mountRoutes(app);

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", ts: Date.now() });
});

// Global error handler (Day 4) — 4-param signature required by Express
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  console.error("[ERROR]", err.message ?? err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || "Internal server error",
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("");
  console.log("  Smart Cache Engine");
  console.log("  ==================");
  console.log(`  Server  : http://localhost:${PORT}`);
  console.log(`  Cache   : http://localhost:${PORT}/cache`);
  console.log(`  Metrics : http://localhost:${PORT}/cache/metrics`);
  console.log(`  ZSets   : http://localhost:${PORT}/zset`);
  console.log(`  Health  : http://localhost:${PORT}/health`);
  console.log("");
});

module.exports = app;
