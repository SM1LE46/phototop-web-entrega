require("dotenv").config();

const express = require("express");
const path = require("path");

const authRoutes = require("./routes/auth.routes");
const usersRoutes = require("./routes/users.routes");
const postsRoutes = require("./routes/posts.routes");
const ratingsRoutes = require("./routes/ratings.routes");
const searchRoutes = require("./routes/search.routes");
const categoriesRoutes = require("./routes/categories.routes");
const messagesRoutes = require("./routes/messages.routes");
const reportsRoutes = require("./routes/reports.routes");
const adminRoutes = require("./routes/admin.routes");
const provincesRoutes = require("./routes/provinces.routes");
const rankingsRoutes = require("./routes/rankings.routes");

const app = express();

/**
 * Middlewares globales
 */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/**
 * Static: servir /uploads
 */
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));

/**
 * GET /api/health
 * Auth: No
 * Devuelve estado básico del backend.
 */
app.get("/api/health", (_req, res) => {
  return res.json({ ok: true, message: "OK" });
});

/**
 * Rutas API
 */
app.use("/api/auth", authRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/posts", postsRoutes);
app.use("/api/ratings", ratingsRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/categories", categoriesRoutes);
app.use("/api/messages", messagesRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/provinces", provincesRoutes);
app.use("/api/rankings", rankingsRoutes);

/**
 * 404 API
 */
app.use("/api", (_req, res) => {
  return res.status(404).json({ ok: false, message: "Not found" });
});

/**
 * Frontend Angular compilado
 * Docker copiará el build de Angular dentro de backend/public.
 */
const frontendPath = path.join(__dirname, "..", "public");

app.use(express.static(frontendPath));

app.get(/.*/, (req, res) => {
  if (req.path.startsWith("/uploads")) {
    return res.status(404).end();
  }

  return res.sendFile(path.join(frontendPath, "index.html"));
});

/**
 * Error handler
 */
app.use((err, _req, res, _next) => {
  if (!err) {
    return res.status(500).json({ ok: false, message: "Server error" });
  }

  return res.status(400).json({
    ok: false,
    message: err.message || "Bad request"
  });
});

const port = Number(process.env.PORT) || 3000;

app.listen(port, () => {
  console.log(`API listening on port ${port}`);
});

module.exports = app;