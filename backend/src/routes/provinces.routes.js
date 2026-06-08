const express = require("express");
const pool = require("../db");

const router = express.Router();

/**
 * GET /api/provinces
 * Auth: No
 * Devuelve el catálogo de provincias activas.
 * Response: { ok: true, data: Array<{id,name}> }
 */
router.get("/", async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, name
       FROM provinces
       WHERE active = 1
       ORDER BY name ASC`
    );

    return res.json({ ok: true, data: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

module.exports = router;