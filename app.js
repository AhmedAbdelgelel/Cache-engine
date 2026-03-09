const express = require("express");
const cacheRoutes = require("./routes/cacheRoutes");

const app = express();
app.use(express.json());

app.use("/cache", cacheRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("");
  console.log("🚀 Smart Cache Engine running!");
  console.log(`📡 Server: http://localhost:${PORT}`);
});
