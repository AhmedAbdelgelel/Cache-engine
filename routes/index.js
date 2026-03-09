const cacheRoutes = require("./cache");
const mountRoutes = (app) => {
  app.use("/cache", cacheRoutes);
};
module.exports = mountRoutes;
