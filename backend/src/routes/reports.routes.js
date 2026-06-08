const express = require("express");
const pool = require("../db");
const auth = require("../middlewares/auth");

const router = express.Router();

const TARGET_TYPES = new Set(["user", "post", "comment", "message"]);
const STATUSES = new Set(["open", "reviewing", "closed"]);

/**
 * POST /api/reports
 * Auth: Sí (JWT)
 * Body:
 *  - target_type: "user" | "post" | "message"
 *  - target_id: number
 *  - reason: string (1..255)
 *  - details: string (max 4000)
 *
 * Crea un reporte. No requiere ser admin.
 */
router.post("/", auth, async (req, res) => {
  try {
    const reporterId = req.user.id;

    const targetType = typeof req.body?.target_type === "string" ? req.body.target_type.trim().toLowerCase() : "";
    const targetId = Number(req.body?.target_id);
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    const details = typeof req.body?.details === "string" ? req.body.details.trim() : "";

    if (!TARGET_TYPES.has(targetType)) {
      return res.status(400).json({ ok: false, message: "Invalid target_type (user|post|comment|message)" });
    }
    if (!Number.isInteger(targetId) || targetId <= 0) {
      return res.status(400).json({ ok: false, message: "Invalid target_id" });
    }
    if (!reason || reason.length > 255) {
      return res.status(400).json({ ok: false, message: "reason is required (max 255)" });
    }
    if (!details || details.length > 4000) {
      return res.status(400).json({ ok: false, message: "details is required (max 4000)" });
    }

    if (targetType === "user" && targetId === reporterId) {
      return res.status(400).json({ ok: false, message: "You cannot report yourself" });
    }

    if (targetType === "user") {
      const [u] = await pool.query(
        `SELECT id FROM users WHERE id = ? AND active = 1 AND deleted_at IS NULL LIMIT 1`,
        [targetId]
      );
      if (u.length === 0) return res.status(404).json({ ok: false, message: "Target user not found" });
    }

    if (targetType === "post") {
      const [p] = await pool.query(
        `SELECT id FROM posts WHERE id = ? AND active = 1 AND deleted_at IS NULL LIMIT 1`,
        [targetId]
      );
      if (p.length === 0) return res.status(404).json({ ok: false, message: "Target post not found" });
    }

    if (targetType === "comment") {
      const [c] = await pool.query(
        `SELECT id FROM post_comments WHERE id = ? AND active = 1 AND deleted_at IS NULL LIMIT 1`,
        [targetId]
      );
      if (c.length === 0) return res.status(404).json({ ok: false, message: "Target comment not found" });
    }

    if (targetType === "message") {
      const [m] = await pool.query(
        `SELECT id FROM messages WHERE id = ? AND active = 1 AND deleted_at IS NULL LIMIT 1`,
        [targetId]
      );
      if (m.length === 0) return res.status(404).json({ ok: false, message: "Target message not found" });
    }

    const [result] = await pool.query(
      `INSERT INTO reports (reporter_id, target_type, target_id, reason, details, status, active)
       VALUES (?, ?, ?, ?, ?, 'open', 1)`,
      [reporterId, targetType, targetId, reason, details]
    );

    return res.status(201).json({
      ok: true,
      message: "Report created",
      data: { id: result.insertId },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * GET /api/reports/me
 * Auth: Sí (JWT)
 * Query: ?page=1&limit=10
 * Devuelve mis reportes (para que el usuario vea el historial).
 */
router.get("/me", auth, async (req, res) => {
  try {
    const reporterId = req.user.id;

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
    const offset = (page - 1) * limit;

    const [countRows] = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM reports
      WHERE reporter_id = ?
        AND active = 1 AND deleted_at IS NULL
      `,
      [reporterId]
    );
    const total = Number(countRows[0]?.total) || 0;

    const [rows] = await pool.query(
      `
      SELECT id, target_type, target_id, reason, details, status, created_at, updated_at
      FROM reports
      WHERE reporter_id = ?
        AND active = 1 AND deleted_at IS NULL
      ORDER BY created_at DESC, id DESC
      LIMIT ? OFFSET ?
      `,
      [reporterId, limit, offset]
    );

    return res.json({
      ok: true,
      data: { page, limit, total, results: rows },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * DELETE /api/reports/:id
 * Auth: Sí (JWT)
 * Borrado lógico del reporte (solo el creador).
 */
router.delete("/:id", auth, async (req, res) => {
  try {
    const reporterId = req.user.id;
    const reportId = Number(req.params.id);

    if (!Number.isInteger(reportId) || reportId <= 0) {
      return res.status(400).json({ ok: false, message: "Invalid report id" });
    }

    const [rows] = await pool.query(
      `
      SELECT id, reporter_id
      FROM reports
      WHERE id = ?
        AND active = 1 AND deleted_at IS NULL
      LIMIT 1
      `,
      [reportId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ ok: false, message: "Report not found" });
    }

    if (rows[0].reporter_id !== reporterId) {
      return res.status(403).json({ ok: false, message: "Not allowed" });
    }

    await pool.query(
      `UPDATE reports SET active = 0, deleted_at = NOW() WHERE id = ?`,
      [reportId]
    );

    return res.json({ ok: true, message: "Report deleted" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

module.exports = router;
