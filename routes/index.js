const cacheRoutes = require("./cacheRoutes");
const zsetRoutes = require("./zsetRoutes");

const mountRoutes = (app) => {
  app.use("/cache", cacheRoutes);
  app.use("/zset", zsetRoutes);
};

module.exports = mountRoutes;
