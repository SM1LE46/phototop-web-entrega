const express = require("express");
const pool = require("../db");

const router = express.Router();

/**
 * GET /api/categories
 * Auth: No
 * Query: -
 * Devuelve el catálogo de categorías activas (para selects/filtros).
 * Response: { ok: true, data: Array<{id,name,slug}> }
 */
router.get("/", async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, name, slug
       FROM categories
       WHERE active = 1 AND deleted_at IS NULL
       ORDER BY id ASC`
    );
    return res.json({ ok: true, data: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

module.exports = router;
