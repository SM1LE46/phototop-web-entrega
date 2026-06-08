const express = require("express");
const pool = require("../db");
const auth = require("../middlewares/auth");
const admin = require("../middlewares/admin");
const { slugify } = require("../utils/helpers");

const router = express.Router();

/**
 * GET /api/admin/users
 * Auth: Sí (JWT) + Admin
 * Query:
 *  - q: texto opcional para buscar por nombre, apellidos o email
 *  - role: admin | photographer | model | user opcional
 *  - status: active | inactive | deleted opcional
 *  - page: número de página
 *  - limit: resultados por página
 * Devuelve usuarios para el panel de administración.
 * Response: { ok, data: { results, page, limit, total } }
 */
router.get("/users", auth, admin, async (req, res) => {
  try {
    const q = req.query.q ? String(req.query.q).trim() : "";
    const role = req.query.role ? String(req.query.role).trim().toLowerCase() : null;

    if (role && !["admin", "photographer", "model", "user"].includes(role)) {
      return res.status(400).json({ ok: false, message: "Invalid role (admin|photographer|model|user)" });
    }

    const provinceId = req.query.province_id !== undefined ? Number(req.query.province_id) : null;
    if (req.query.province_id !== undefined && !Number.isInteger(provinceId)) {
      return res.status(400).json({ ok: false, message: "Invalid province_id" });
    }

    const active = req.query.active !== undefined ? Number(req.query.active) : null;
    if (req.query.active !== undefined && ![0, 1].includes(active)) {
      return res.status(400).json({ ok: false, message: "active must be 0 or 1" });
    }

    const deleted = req.query.deleted !== undefined ? Number(req.query.deleted) : null;
    if (req.query.deleted !== undefined && ![0, 1].includes(deleted)) {
      return res.status(400).json({ ok: false, message: "deleted must be 0 or 1" });
    }

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
    const offset = (page - 1) * limit;

    const where = [];
    const params = [];

    if (deleted === 1) {
      where.push("u.deleted_at IS NOT NULL");
    } else if (deleted === 0) {
      where.push("u.deleted_at IS NULL");
    }

    if (active !== null) {
      where.push("u.active = ?");
      params.push(active);
    }

    if (provinceId !== null) {
      where.push("u.province_id = ?");
      params.push(provinceId);
    }

    if (role) {
      if (role === "admin") where.push("u.admin = 1");
      else if (role === "photographer") where.push("u.photographer = 1");
      else if (role === "model") where.push("u.model = 1");
      else if (role === "user") where.push("u.admin = 0 AND u.photographer = 0 AND u.model = 0");
    }

    if (q) {
      where.push("(u.name LIKE ? OR u.surname LIKE ? OR u.email LIKE ?)");
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM users u ${whereSql}`,
      params
    );
    const total = Number(countRows[0]?.total) || 0;

    const [rows] = await pool.query(
      `
      SELECT
        u.id, u.name, u.surname, u.email,
        u.admin, u.photographer, u.model,
        u.active, u.deleted_at,
        u.province_id, u.profile_image,
        u.created_at, u.updated_at
      FROM users u
      ${whereSql}
      ORDER BY u.created_at DESC, u.id DESC
      LIMIT ? OFFSET ?
      `,
      [...params, limit, offset]
    );

    return res.json({
      ok: true,
      data: { q: q || null, role, province_id: provinceId, active, deleted, page, limit, total, results: rows },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * GET /api/admin/users/:id
 * Auth: Sí (JWT + admin)
 * Devuelve datos del usuario + estadísticas (posts/ratings/reports).
 */
router.get("/users/:id", auth, admin, async (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ ok: false, message: "Invalid user id" });
    }

    // Usuario (incluye borrados para que admin pueda verlos)
    const [urows] = await pool.query(
      `
      SELECT
        id, name, surname, email,
        admin, photographer, model,
        profile_image, description, phone, province_id,
        active, deleted_at,
        created_at, updated_at
      FROM users
      WHERE id = ?
      LIMIT 1
      `,
      [userId]
    );

    const user = urows[0];
    if (!user) {
      return res.status(404).json({ ok: false, message: "User not found" });
    }

    // Posts: total / activos
    const [postStatsRows] = await pool.query(
      `
      SELECT
        COUNT(*) AS posts_total,
        SUM(CASE WHEN active = 1 AND deleted_at IS NULL THEN 1 ELSE 0 END) AS posts_active
      FROM posts
      WHERE user_id = ?
      `,
      [userId]
    );

    const posts_total = Number(postStatsRows[0]?.posts_total) || 0;
    const posts_active = Number(postStatsRows[0]?.posts_active) || 0;

    // Reports: total y por estado (solo reportes activos/no borrados)
    const [repStatsRows] = await pool.query(
      `
      SELECT
        COUNT(*) AS reports_total,
        SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS reports_open,
        SUM(CASE WHEN status = 'reviewing' THEN 1 ELSE 0 END) AS reports_reviewing,
        SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) AS reports_closed
      FROM reports
      WHERE target_type = 'user'
        AND target_id = ?
        AND active = 1 AND deleted_at IS NULL
      `,
      [userId]
    );

    const reports_total = Number(repStatsRows[0]?.reports_total) || 0;
    const reports_open = Number(repStatsRows[0]?.reports_open) || 0;
    const reports_reviewing = Number(repStatsRows[0]?.reports_reviewing) || 0;
    const reports_closed = Number(repStatsRows[0]?.reports_closed) || 0;

    // Rating medio del autor: media de ratings de sus posts (solo posts activos/no borrados, ratings activos/no borrados)
    // Nota: ajusta nombres si tu tabla ratings se llama distinto.
    const [ratingRows] = await pool.query(
      `
      SELECT ROUND(AVG(r.rating), 1) AS avg_rating_as_author
      FROM posts p
      JOIN ratings r ON r.post_id = p.id
      WHERE p.user_id = ?
        AND p.active = 1 AND p.deleted_at IS NULL
        AND r.active = 1 AND r.deleted_at IS NULL
      `,
      [userId]
    );

    const avg_rating_as_author =
      ratingRows[0]?.avg_rating_as_author !== null && ratingRows[0]?.avg_rating_as_author !== undefined
        ? Number(ratingRows[0].avg_rating_as_author)
        : null;

    return res.json({
      ok: true,
      data: {
        user,
        stats: {
          posts_total,
          posts_active,
          reports_total,
          reports_open,
          reports_reviewing,
          reports_closed,
          avg_rating_as_author,
        },
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
}); 

/**
 * GET /api/admin/reports
 * Auth: Sí (JWT + admin)
 * Query:
 *  - status: open|reviewing|closed (optional)
 *  - target_type: user|post|message (optional)
 *  - page: number (default 1)
 *  - limit: number (default 10, max 50)
 * Devuelve reportes para moderación.
 */
router.get("/reports", auth, admin, async (req, res) => {
  try {
    const status = req.query.status ? String(req.query.status).trim().toLowerCase() : null;
    if (status && !["open", "reviewing", "closed"].includes(status)) {
      return res.status(400).json({ ok: false, message: "Invalid status (open|reviewing|closed)" });
    }

    const targetType = req.query.target_type ? String(req.query.target_type).trim().toLowerCase() : null;
    if (targetType && !["user", "post", "message"].includes(targetType)) {
      return res.status(400).json({ ok: false, message: "Invalid target_type (user|post|message)" });
    }

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
    const offset = (page - 1) * limit;

    const where = [];
    const params = [];

    where.push("r.active = 1");
    where.push("r.deleted_at IS NULL");

    if (status) {
      where.push("r.status = ?");
      params.push(status);
    }
    if (targetType) {
      where.push("r.target_type = ?");
      params.push(targetType);
    }

    const whereSql = `WHERE ${where.join(" AND ")}`;

    const [countRows] = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM reports r
      ${whereSql}
      `,
      params
    );
    const total = Number(countRows[0]?.total) || 0;

    const [rows] = await pool.query(
      `
      SELECT
        r.id,
        r.reporter_id,
        ru.name AS reporter_name,
        ru.surname AS reporter_surname,
        ru.email AS reporter_email,

        r.target_type,
        r.target_id,
        r.reason,
        r.details,
        r.status,
        r.admin_reason,
        r.created_at,
        r.updated_at
      FROM reports r
      JOIN users ru ON ru.id = r.reporter_id
      ${whereSql}
        AND ru.active = 1 AND ru.deleted_at IS NULL
      ORDER BY r.created_at DESC, r.id DESC
      LIMIT ? OFFSET ?
      `,
      [...params, limit, offset]
    );

    return res.json({
      ok: true,
      data: { status, target_type: targetType, page, limit, total, results: rows },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * GET /api/admin/users/:id/reports
 * Auth: Sí (JWT + admin)
 * Query:
 *  - status: open|reviewing|closed (optional)
 *  - page: number (default 1)
 *  - limit: number (default 10, max 50)
 * Lista reportes cuyo target es el usuario :id.
 */
router.get("/users/:id/reports", auth, admin, async (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ ok: false, message: "Invalid user id" });
    }

    const status = req.query.status ? String(req.query.status).trim().toLowerCase() : null;
    if (status && !["open", "reviewing", "closed"].includes(status)) {
      return res.status(400).json({ ok: false, message: "Invalid status (open|reviewing|closed)" });
    }

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
    const offset = (page - 1) * limit;

    const where = [];
    const params = [];

    where.push("r.active = 1");
    where.push("r.deleted_at IS NULL");
    where.push("r.target_type = 'user'");
    where.push("r.target_id = ?");
    params.push(userId);

    if (status) {
      where.push("r.status = ?");
      params.push(status);
    }

    const whereSql = `WHERE ${where.join(" AND ")}`;

    const [countRows] = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM reports r
      ${whereSql}
      `,
      params
    );
    const total = Number(countRows[0]?.total) || 0;

    const [rows] = await pool.query(
      `
      SELECT
        r.id,
        r.reporter_id,
        ru.name AS reporter_name,
        ru.surname AS reporter_surname,
        ru.email AS reporter_email,
        r.reason,
        r.details,
        r.status,
        r.admin_reason,
        r.created_at,
        r.updated_at
      FROM reports r
      JOIN users ru ON ru.id = r.reporter_id
      ${whereSql}
        AND ru.active = 1 AND ru.deleted_at IS NULL
      ORDER BY r.created_at DESC, r.id DESC
      LIMIT ? OFFSET ?
      `,
      [...params, limit, offset]
    );

    return res.json({
      ok: true,
      data: {
        user_id: userId,
        status,
        page,
        limit,
        total,
        results: rows,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * PATCH /api/admin/reports/:id
 * Auth: Sí (JWT + admin)
 * Body: { status: open|reviewing|closed, admin_reason?: string }
 * Cambia el estado del reporte y guarda nota de moderación.
 */
router.patch("/reports/:id", auth, admin, async (req, res) => {
  try {
    const reportId = Number(req.params.id);
    if (!Number.isInteger(reportId) || reportId <= 0) {
      return res.status(400).json({ ok: false, message: "Invalid report id" });
    }

    const status = typeof req.body?.status === "string" ? req.body.status.trim().toLowerCase() : "";
    if (!["open", "reviewing", "closed"].includes(status)) {
      return res.status(400).json({ ok: false, message: "Invalid status (open|reviewing|closed)" });
    }

    const adminReason = typeof req.body?.admin_reason === "string" ? req.body.admin_reason.trim() : null;
    if (adminReason !== null && adminReason.length > 500) {
      return res.status(400).json({ ok: false, message: "admin_reason max length is 500" });
    }

    // Si se cierra, admin_reason obligatorio (recomendado)
    if (status === "closed" && (!adminReason || adminReason.length === 0)) {
      return res.status(400).json({ ok: false, message: "admin_reason is required when closing a report" });
    }

    const [rows] = await pool.query(
      `
      SELECT id
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

    await pool.query(
      `
      UPDATE reports
      SET status = ?,
          admin_reason = ?,
          updated_at = NOW()
      WHERE id = ?
      `,
      [status, adminReason, reportId]
    );

    return res.json({
      ok: true,
      message: "Report updated",
      data: { id: reportId, status, admin_reason: adminReason },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * DELETE /api/admin/reports/:id
 * Auth: Sí (JWT + admin)
 * Borrado lógico del reporte (moderación).
 */
router.delete("/reports/:id", auth, admin, async (req, res) => {
  try {
    const reportId = Number(req.params.id);
    if (!Number.isInteger(reportId) || reportId <= 0) {
      return res.status(400).json({ ok: false, message: "Invalid report id" });
    }

    const [rows] = await pool.query(
      `
      SELECT id
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

    await pool.query(
      `UPDATE reports SET active = 0, deleted_at = NOW() WHERE id = ?`,
      [reportId]
    );

    return res.json({ ok: true, message: "Report deleted (admin)" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * GET /api/admin/reports/:id
 * Auth: Sí (JWT + admin)
 * Devuelve un reporte + su target (user/post/message) para inspección.
 */
router.get("/reports/:id", auth, admin, async (req, res) => {
  try {
    const reportId = Number(req.params.id);
    if (!Number.isInteger(reportId) || reportId <= 0) {
      return res.status(400).json({ ok: false, message: "Invalid report id" });
    }

    const [rows] = await pool.query(
      `
      SELECT
        r.id, r.reporter_id,
        ru.name AS reporter_name, ru.surname AS reporter_surname, ru.email AS reporter_email,
        r.target_type, r.target_id,
        r.reason, r.details, r.status, r.admin_reason,
        r.created_at, r.updated_at
      FROM reports r
      JOIN users ru ON ru.id = r.reporter_id
      WHERE r.id = ?
        AND r.active = 1 AND r.deleted_at IS NULL
        AND ru.active = 1 AND ru.deleted_at IS NULL
      LIMIT 1
      `,
      [reportId]
    );

    const report = rows[0];
    if (!report) {
      return res.status(404).json({ ok: false, message: "Report not found" });
    }

    let target = null;

    if (report.target_type === "user") {
      const [u] = await pool.query(
        `
        SELECT id, name, surname, email, profile_image, description, phone, province_id,
               admin, photographer, model, active, deleted_at, created_at, updated_at
        FROM users
        WHERE id = ?
        LIMIT 1
        `,
        [report.target_id]
      );
      target = u[0] || null;
    }

    if (report.target_type === "post") {
      const [p] = await pool.query(
        `
        SELECT
          p.id, p.user_id, p.title, p.description, p.category_id,
          p.active, p.deleted_at, p.created_at, p.updated_at,
          u.name AS user_name, u.surname AS user_surname, u.email AS user_email
        FROM posts p
        JOIN users u ON u.id = p.user_id
        WHERE p.id = ?
        LIMIT 1
        `,
        [report.target_id]
      );
      target = p[0] || null;
    }

    if (report.target_type === "message") {
      const [m] = await pool.query(
        `
        SELECT
          m.id, m.sender_id, m.receiver_id, m.body, m.read_at,
          m.sender_deleted_at, m.receiver_deleted_at,
          m.active, m.deleted_at, m.created_at,
          su.name AS sender_name, su.surname AS sender_surname, su.email AS sender_email,
          ru.name AS receiver_name, ru.surname AS receiver_surname, ru.email AS receiver_email
        FROM messages m
        JOIN users su ON su.id = m.sender_id
        JOIN users ru ON ru.id = m.receiver_id
        WHERE m.id = ?
        LIMIT 1
        `,
        [report.target_id]
      );
      target = m[0] || null;
    }

    return res.json({
      ok: true,
      data: {
        report,
        target,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * POST /api/admin/reports/:id/resolve
 * Auth: Sí (JWT + admin)
 * Body: { action: close_only|hide_target|delete_target|deactivate_user, admin_reason: string }
 * Resuelve un reporte: aplica acción (opcional) y cierra el reporte con admin_reason.
 */
router.post("/reports/:id/resolve", auth, admin, async (req, res) => {
  try {
    const reportId = Number(req.params.id);
    if (!Number.isInteger(reportId) || reportId <= 0) {
      return res.status(400).json({ ok: false, message: "Invalid report id" });
    }

    const action = typeof req.body?.action === "string" ? req.body.action.trim().toLowerCase() : "";
    const allowed = new Set(["close_only", "hide_target", "delete_target", "deactivate_user"]);
    if (!allowed.has(action)) {
      return res.status(400).json({ ok: false, message: "Invalid action" });
    }

    const adminReason = typeof req.body?.admin_reason === "string" ? req.body.admin_reason.trim() : "";
    if (!adminReason) {
      return res.status(400).json({ ok: false, message: "admin_reason is required" });
    }
    if (adminReason.length > 500) {
      return res.status(400).json({ ok: false, message: "admin_reason max length is 500" });
    }

    await pool.query("START TRANSACTION");

    const [rrows] = await pool.query(
      `
      SELECT id, target_type, target_id, status
      FROM reports
      WHERE id = ?
        AND active = 1 AND deleted_at IS NULL
      LIMIT 1
      `,
      [reportId]
    );

    const report = rrows[0];
    if (!report) {
      await pool.query("ROLLBACK");
      return res.status(404).json({ ok: false, message: "Report not found" });
    }

    if (report.status === "closed") {
      await pool.query("ROLLBACK");
      return res.status(409).json({ ok: false, message: "Report already closed" });
    }

    if (action !== "close_only") {
      if (report.target_type === "user") {
        if (action === "deactivate_user") {
          await pool.query(
            `UPDATE users
             SET active = 0, updated_at = NOW()
             WHERE id = ? AND deleted_at IS NULL`,
            [report.target_id]
          );
        } else if (action === "delete_target") {
          await pool.query(
            `UPDATE users
             SET active = 0, deleted_at = NOW(), updated_at = NOW()
             WHERE id = ? AND deleted_at IS NULL`,
            [report.target_id]
          );
        } else if (action === "hide_target") {
          await pool.query(
            `UPDATE users
             SET active = 0, updated_at = NOW()
             WHERE id = ? AND deleted_at IS NULL`,
            [report.target_id]
          );
        } else {
          await pool.query("ROLLBACK");
          return res.status(400).json({ ok: false, message: "Invalid action for user target" });
        }
      }

      if (report.target_type === "post") {
        if (action === "hide_target") {
          await pool.query(
            `UPDATE posts
             SET active = 0, updated_at = NOW()
             WHERE id = ? AND deleted_at IS NULL`,
            [report.target_id]
          );
        } else if (action === "delete_target") {
          await pool.query(
            `UPDATE posts
             SET active = 0, deleted_at = NOW(), updated_at = NOW()
             WHERE id = ? AND deleted_at IS NULL`,
            [report.target_id]
          );
        } else {
          await pool.query("ROLLBACK");
          return res.status(400).json({ ok: false, message: "Invalid action for post target" });
        }
      }

      if (report.target_type === "message") {
        if (action === "hide_target") {
          await pool.query(
            `UPDATE messages
             SET active = 0, updated_at = NOW()
             WHERE id = ? AND deleted_at IS NULL`,
            [report.target_id]
          );
        } else if (action === "delete_target") {
          await pool.query(
            `UPDATE messages
             SET active = 0, deleted_at = NOW(), updated_at = NOW()
             WHERE id = ? AND deleted_at IS NULL`,
            [report.target_id]
          );
        } else {
          await pool.query("ROLLBACK");
          return res.status(400).json({ ok: false, message: "Invalid action for message target" });
        }
      }
    }

    // Cerrar reporte + guardar admin_reason
    await pool.query(
      `
      UPDATE reports
      SET status = 'closed',
          admin_reason = ?,
          updated_at = NOW()
      WHERE id = ?
      `,
      [adminReason, reportId]
    );

    await pool.query("COMMIT");

    return res.json({
      ok: true,
      message: "Report resolved",
      data: {
        id: reportId,
        status: "closed",
        action,
        admin_reason: adminReason,
      },
    });
  } catch (err) {
    try { await pool.query("ROLLBACK"); } catch (_) {}
    console.error(err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * PATCH /api/admin/users/:id/active
 * Auth: Sí (JWT + admin)
 * Body: { active: 0|1 }
 * Activa o desactiva un usuario.
 */
router.patch("/users/:id/active", auth, admin, async (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ ok: false, message: "Invalid user id" });
    }

    const active = Number(req.body?.active);
    if (![0, 1].includes(active)) {
      return res.status(400).json({ ok: false, message: "active must be 0 or 1" });
    }

    // Evita que un admin se desactive a sí mismo
    if (req.user.id === userId && active === 0) {
      return res.status(400).json({ ok: false, message: "You cannot deactivate yourself" });
    }

    const [rows] = await pool.query(
      `SELECT id, active, deleted_at
       FROM users
       WHERE id = ?
       LIMIT 1`,
      [userId]
    );

    const user = rows[0];
    if (!user || user.deleted_at) {
      return res.status(404).json({ ok: false, message: "User not found" });
    }

    await pool.query(
      `UPDATE users
       SET active = ?, updated_at = NOW()
       WHERE id = ?
         AND deleted_at IS NULL`,
      [active, userId]
    );

    return res.json({
      ok: true,
      message: "User updated",
      data: { id: userId, active },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * DELETE /api/admin/users/:id
 * Auth: Sí (JWT + admin)
 * Borrado lógico del usuario (active=0, deleted_at=NOW()).
 */
router.delete("/users/:id", auth, admin, async (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ ok: false, message: "Invalid user id" });
    }

    // Evita que un admin se borre a sí mismo
    if (req.user.id === userId) {
      return res.status(400).json({ ok: false, message: "You cannot delete yourself" });
    }

    const [rows] = await pool.query(
      `SELECT id
       FROM users
       WHERE id = ?
         AND deleted_at IS NULL
       LIMIT 1`,
      [userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ ok: false, message: "User not found" });
    }

    await pool.query(
      `UPDATE users
       SET active = 0, deleted_at = NOW(), updated_at = NOW()
       WHERE id = ?
         AND deleted_at IS NULL`,
      [userId]
    );

    return res.json({
      ok: true,
      message: "User deleted (logical)",
      data: { id: userId },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * PATCH /api/admin/users/:id/restore
 * Auth: Sí (JWT + admin)
 * Restaura un usuario borrado lógicamente (deleted_at=NULL, active=1).
 */
router.patch("/users/:id/restore", auth, admin, async (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ ok: false, message: "Invalid user id" });
    }

    const [rows] = await pool.query(
      `SELECT id, active, deleted_at FROM users WHERE id = ? LIMIT 1`,
      [userId]
    );

    const user = rows[0];
    if (!user) {
      return res.status(404).json({ ok: false, message: "User not found" });
    }

    if (user.active ===1 && user.deleted_at === null) {
      return res.status(409).json({ ok: false, message: "User is already active" });
    }

    await pool.query(
      `UPDATE users
       SET active = 1, deleted_at = NULL, updated_at = NOW()
       WHERE id = ?`,
      [userId]
    );

    return res.json({
      ok: true,
      message: "User restored",
      data: { id: userId, active: 1 },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * GET /api/admin/users/:id/posts
 * Auth: Sí (JWT + admin)
 * Query:
 *  - active: 0|1 (optional)
 *  - deleted: 0|1 (default 0)
 *  - page: number (default 1)
 *  - limit: number (default 10, max 50)
 * Lista posts del usuario (incluye ocultos/borrados según filtros).
 */
router.get("/users/:id/posts", auth, admin, async (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ ok: false, message: "Invalid user id" });
    }

    const active = req.query.active !== undefined ? Number(req.query.active) : null;
    if (req.query.active !== undefined && ![0, 1].includes(active)) {
      return res.status(400).json({ ok: false, message: "active must be 0 or 1" });
    }

    const deleted = req.query.deleted !== undefined ? Number(req.query.deleted) : 0;
    if (![0, 1].includes(deleted)) {
      return res.status(400).json({ ok: false, message: "deleted must be 0 or 1" });
    }

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
    const offset = (page - 1) * limit;

    const where = [];
    const params = [];

    where.push("p.user_id = ?");
    params.push(userId);

    if (deleted === 1) where.push("p.deleted_at IS NOT NULL");
    else where.push("p.deleted_at IS NULL");

    if (active !== null) {
      where.push("p.active = ?");
      params.push(active);
    }

    const whereSql = `WHERE ${where.join(" AND ")}`;

    const [countRows] = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM posts p
      ${whereSql}
      `,
      params
    );
    const total = Number(countRows[0]?.total) || 0;

    const [rows] = await pool.query(
      `
      SELECT
        p.id,
        p.user_id,
        p.title,
        p.description,
        p.category_id,
        p.active,
        p.deleted_at,
        p.created_at,
        p.updated_at,
        u.name AS user_name,
        u.surname AS user_surname,
        (
          SELECT COUNT(*)
          FROM photos ph
          WHERE ph.post_id = p.id
            AND ph.active = 1
        ) AS photos_count
      FROM posts p
      JOIN users u ON u.id = p.user_id
      ${whereSql}
      ORDER BY p.created_at DESC, p.id DESC
      LIMIT ? OFFSET ?
      `,
      [...params, limit, offset]
    );

    return res.json({
      ok: true,
      data: {
        user_id: userId,
        active,
        deleted,
        page,
        limit,
        total,
        results: rows,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * GET /api/admin/posts
 * Auth: Sí (JWT + admin)
 * Query:
 *  - q: string (title/description)
 *  - user_id: number
 *  - category_id: number
 *  - active: 0|1
 *  - deleted: 0|1 (default 0)
 *  - page: number (default 1)
 *  - limit: number (default 10, max 50)
 * Lista posts para moderación (incluye ocultos/borrados según filtros).
 */
router.get("/posts", auth, admin, async (req, res) => {
  try {
    const q = req.query.q ? String(req.query.q).trim() : "";

    const userId = req.query.user_id !== undefined ? Number(req.query.user_id) : null;
    if (req.query.user_id !== undefined && (!Number.isInteger(userId) || userId <= 0)) {
      return res.status(400).json({ ok: false, message: "Invalid user_id" });
    }

    const categoryId = req.query.category_id !== undefined ? Number(req.query.category_id) : null;
    if (req.query.category_id !== undefined && !Number.isInteger(categoryId)) {
      return res.status(400).json({ ok: false, message: "Invalid category_id" });
    }

    const active = req.query.active !== undefined ? Number(req.query.active) : null;
    if (req.query.active !== undefined && ![0, 1].includes(active)) {
      return res.status(400).json({ ok: false, message: "active must be 0 or 1" });
    }

    const deleted = req.query.deleted !== undefined ? Number(req.query.deleted) : 0;
    if (![0, 1].includes(deleted)) {
      return res.status(400).json({ ok: false, message: "deleted must be 0 or 1" });
    }

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
    const offset = (page - 1) * limit;

    const where = [];
    const params = [];

    if (deleted === 1) where.push("p.deleted_at IS NOT NULL");
    else where.push("p.deleted_at IS NULL");

    if (active !== null) {
      where.push("p.active = ?");
      params.push(active);
    }

    if (userId !== null) {
      where.push("p.user_id = ?");
      params.push(userId);
    }

    if (categoryId !== null) {
      where.push("p.category_id = ?");
      params.push(categoryId);
    }

    if (q) {
      where.push("(p.title LIKE ? OR p.description LIKE ?)");
      params.push(`%${q}%`, `%${q}%`);
    }

    const whereSql = `WHERE ${where.length ? where.join(" AND ") : "1=1"}`;

    const [countRows] = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM posts p
      ${whereSql}
      `,
      params
    );
    const total = Number(countRows[0]?.total) || 0;

    const [rows] = await pool.query(
      `
      SELECT
        p.id, p.user_id, p.title, p.description, p.category_id,
        p.active, p.deleted_at, p.created_at, p.updated_at,
        u.name AS user_name, u.surname AS user_surname, u.email AS user_email,

        (SELECT COUNT(*) FROM photos ph WHERE ph.post_id = p.id AND ph.active = 1) AS photos_count,

        (SELECT ROUND(AVG(r.rating), 1)
         FROM ratings r
         WHERE r.post_id = p.id AND r.active = 1 AND r.deleted_at IS NULL) AS rating_avg,

        (SELECT COUNT(*)
         FROM ratings r
         WHERE r.post_id = p.id AND r.active = 1 AND r.deleted_at IS NULL) AS rating_count

      FROM posts p
      JOIN users u ON u.id = p.user_id
      ${whereSql}
      ORDER BY p.created_at DESC, p.id DESC
      LIMIT ? OFFSET ?
      `,
      [...params, limit, offset]
    );

    return res.json({
      ok: true,
      data: {
        q: q || null,
        user_id: userId,
        category_id: categoryId,
        active,
        deleted,
        page,
        limit,
        total,
        results: rows,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * GET /api/admin/posts/:id
 * Auth: Sí (JWT + admin)
 * Devuelve detalle de post para moderación: post + author + photos + stats ratings.
 */
router.get("/posts/:id", auth, admin, async (req, res) => {
  try {
    const postId = Number(req.params.id);
    if (!Number.isInteger(postId) || postId <= 0) {
      return res.status(400).json({ ok: false, message: "Invalid post id" });
    }

    const [prows] = await pool.query(
      `
      SELECT
        p.id, p.user_id, p.title, p.description, p.category_id,
        p.active, p.deleted_at, p.created_at, p.updated_at,
        u.name AS user_name, u.surname AS user_surname, u.email AS user_email,
        u.active AS user_active, u.deleted_at AS user_deleted_at
      FROM posts p
      JOIN users u ON u.id = p.user_id
      WHERE p.id = ?
      LIMIT 1
      `,
      [postId]
    );

    const row = prows[0];
    if (!row) {
      return res.status(404).json({ ok: false, message: "Post not found" });
    }

    const post = {
      id: row.id,
      user_id: row.user_id,
      title: row.title,
      description: row.description,
      category_id: row.category_id,
      active: row.active,
      deleted_at: row.deleted_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };

    const author = {
      id: row.user_id,
      name: row.user_name,
      surname: row.user_surname,
      email: row.user_email,
      active: row.user_active,
      deleted_at: row.user_deleted_at,
    };

    const [photos] = await pool.query(
      `
      SELECT id, post_id, file_path, active, created_at
      FROM photos
      WHERE post_id = ?
        AND active = 1
      ORDER BY id ASC
      `,
      [postId]
    );

    const [ratingRows] = await pool.query(
      `
      SELECT
        COUNT(*) AS ratings_total,
        ROUND(AVG(rating), 1) AS ratings_avg
      FROM ratings
      WHERE post_id = ?
        AND active = 1 AND deleted_at IS NULL
      `,
      [postId]
    );

    const ratings_total = Number(ratingRows[0]?.ratings_total) || 0;
    const ratings_avg =
      ratingRows[0]?.ratings_avg !== null && ratingRows[0]?.ratings_avg !== undefined
        ? Number(ratingRows[0].ratings_avg)
        : null;

    return res.json({
      ok: true,
      data: {
        post,
        author,
        photos,
        ratings: { total: ratings_total, avg: ratings_avg },
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * PATCH /api/admin/posts/:id/active
 * Auth: Sí (JWT + admin)
 * Body: { active: 0|1 }
 * Oculta o muestra un post.
 */
router.patch("/posts/:id/active", auth, admin, async (req, res) => {
  try {
    const postId = Number(req.params.id);
    if (!Number.isInteger(postId) || postId <= 0) {
      return res.status(400).json({ ok: false, message: "Invalid post id" });
    }

    const active = Number(req.body?.active);
    if (![0, 1].includes(active)) {
      return res.status(400).json({ ok: false, message: "active must be 0 or 1" });
    }

    const [rows] = await pool.query(
      `SELECT id, deleted_at
       FROM posts
       WHERE id = ?
       LIMIT 1`,
      [postId]
    );

    const post = rows[0];
    if (!post || post.deleted_at) {
      return res.status(404).json({ ok: false, message: "Post not found" });
    }

    await pool.query(
      `UPDATE posts
       SET active = ?, updated_at = NOW()
       WHERE id = ?
         AND deleted_at IS NULL`,
      [active, postId]
    );

    return res.json({
      ok: true,
      message: "Post updated",
      data: { id: postId, active },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * DELETE /api/admin/posts/:id
 * Auth: Sí (JWT + admin)
 * Borrado lógico del post (active=0, deleted_at=NOW()).
 */
router.delete("/posts/:id", auth, admin, async (req, res) => {
  try {
    const postId = Number(req.params.id);
    if (!Number.isInteger(postId) || postId <= 0) {
      return res.status(400).json({ ok: false, message: "Invalid post id" });
    }

    const [rows] = await pool.query(
      `SELECT id
       FROM posts
       WHERE id = ?
         AND deleted_at IS NULL
       LIMIT 1`,
      [postId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ ok: false, message: "Post not found" });
    }

    await pool.query(
      `UPDATE posts
       SET active = 0, deleted_at = NOW(), updated_at = NOW()
       WHERE id = ?
         AND deleted_at IS NULL`,
      [postId]
    );

    return res.json({
      ok: true,
      message: "Post deleted (logical)",
      data: { id: postId },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * PATCH /api/admin/posts/:id/restore
 * Auth: Sí (JWT + admin)
 * Restaura un post borrado lógicamente (deleted_at=NULL, active=1).
 */
router.patch("/posts/:id/restore", auth, admin, async (req, res) => {
  try {
    const postId = Number(req.params.id);
    if (!Number.isInteger(postId) || postId <= 0) {
      return res.status(400).json({ ok: false, message: "Invalid post id" });
    }

    const [rows] = await pool.query(
      `SELECT id, deleted_at FROM posts WHERE id = ? LIMIT 1`,
      [postId]
    );

    const post = rows[0];
    if (!post) {
      return res.status(404).json({ ok: false, message: "Post not found" });
    }

    if (!post.deleted_at) {
      return res.status(409).json({ ok: false, message: "Post is not deleted" });
    }

    await pool.query(
      `UPDATE posts
       SET active = 1, deleted_at = NULL, updated_at = NOW()
       WHERE id = ?`,
      [postId]
    );

    return res.json({
      ok: true,
      message: "Post restored",
      data: { id: postId, active: 1 },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * GET /api/admin/messages
 * Auth: Sí (JWT + admin)
 * Query:
 *  - q: string (busca en body)
 *  - user_id: number (participa como sender o receiver)
 *  - active: 0|1
 *  - deleted: 0|1 (default 0)
 *  - page: number (default 1)
 *  - limit: number (default 10, max 50)
 * Lista mensajes para moderación.
 */
router.get("/messages", auth, admin, async (req, res) => {
  try {
    const q = req.query.q ? String(req.query.q).trim() : "";

    const userId = req.query.user_id !== undefined ? Number(req.query.user_id) : null;
    if (req.query.user_id !== undefined && (!Number.isInteger(userId) || userId <= 0)) {
      return res.status(400).json({ ok: false, message: "Invalid user_id" });
    }

    const active = req.query.active !== undefined ? Number(req.query.active) : null;
    if (req.query.active !== undefined && ![0, 1].includes(active)) {
      return res.status(400).json({ ok: false, message: "active must be 0 or 1" });
    }

    const deleted = req.query.deleted !== undefined ? Number(req.query.deleted) : 0;
    if (![0, 1].includes(deleted)) {
      return res.status(400).json({ ok: false, message: "deleted must be 0 or 1" });
    }

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
    const offset = (page - 1) * limit;

    const where = [];
    const params = [];

    if (deleted === 1) where.push("m.deleted_at IS NOT NULL");
    else where.push("m.deleted_at IS NULL");

    if (active !== null) {
      where.push("m.active = ?");
      params.push(active);
    }

    if (userId !== null) {
      where.push("(m.sender_id = ? OR m.receiver_id = ?)");
      params.push(userId, userId);
    }

    if (q) {
      where.push("m.body LIKE ?");
      params.push(`%${q}%`);
    }

    const whereSql = `WHERE ${where.length ? where.join(" AND ") : "1=1"}`;

    const [countRows] = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM messages m
      ${whereSql}
      `,
      params
    );
    const total = Number(countRows[0]?.total) || 0;

    const [rows] = await pool.query(
      `
      SELECT
        m.id,
        m.sender_id,
        su.name AS sender_name,
        su.surname AS sender_surname,
        su.email AS sender_email,

        m.receiver_id,
        ru.name AS receiver_name,
        ru.surname AS receiver_surname,
        ru.email AS receiver_email,

        m.body,
        m.read_at,
        m.active,
        m.deleted_at,
        m.created_at,
        m.updated_at
      FROM messages m
      JOIN users su ON su.id = m.sender_id
      JOIN users ru ON ru.id = m.receiver_id
      ${whereSql}
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT ? OFFSET ?
      `,
      [...params, limit, offset]
    );

    return res.json({
      ok: true,
      data: {
        q: q || null,
        user_id: userId,
        active,
        deleted,
        page,
        limit,
        total,
        results: rows,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * GET /api/admin/messages/:id/context
 * Auth: Sí (JWT + admin)
 * Query: ?limit=20 (max 100)
 * Devuelve el mensaje y contexto de la conversación entre sender/receiver.
 */
router.get("/messages/:id/context", auth, admin, async (req, res) => {
  try {
    const messageId = Number(req.params.id);
    if (!Number.isInteger(messageId) || messageId <= 0) {
      return res.status(400).json({ ok: false, message: "Invalid message id" });
    }

    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));

    const [mrows] = await pool.query(
      `
      SELECT id, sender_id, receiver_id, body, created_at, active, deleted_at
      FROM messages
      WHERE id = ?
      LIMIT 1
      `,
      [messageId]
    );

    const msg = mrows[0];
    if (!msg) {
      return res.status(404).json({ ok: false, message: "Message not found" });
    }

    const [ctx] = await pool.query(
      `
      SELECT id, sender_id, receiver_id, body, created_at, read_at, active, deleted_at
      FROM messages
      WHERE (
          (sender_id = ? AND receiver_id = ?)
          OR
          (sender_id = ? AND receiver_id = ?)
        )
        AND active = 1 AND deleted_at IS NULL
      ORDER BY id DESC
      LIMIT ?
      `,
      [msg.sender_id, msg.receiver_id, msg.receiver_id, msg.sender_id, limit]
    );

    ctx.reverse();

    return res.json({
      ok: true,
      data: {
        message: msg,
        context: ctx,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * PATCH /api/admin/messages/:id/active
 * Auth: Sí (JWT + admin)
 * Body: { active: 0|1 }
 * Oculta o muestra un mensaje.
 */
router.patch("/messages/:id/active", auth, admin, async (req, res) => {
  try {
    const messageId = Number(req.params.id);
    if (!Number.isInteger(messageId) || messageId <= 0) {
      return res.status(400).json({ ok: false, message: "Invalid message id" });
    }

    const active = Number(req.body?.active);
    if (![0, 1].includes(active)) {
      return res.status(400).json({ ok: false, message: "active must be 0 or 1" });
    }

    const [rows] = await pool.query(
      `SELECT id, deleted_at FROM messages WHERE id = ? LIMIT 1`,
      [messageId]
    );

    const msg = rows[0];
    if (!msg || msg.deleted_at) {
      return res.status(404).json({ ok: false, message: "Message not found" });
    }

    await pool.query(
      `UPDATE messages SET active = ?, updated_at = NOW() WHERE id = ? AND deleted_at IS NULL`,
      [active, messageId]
    );

    return res.json({ ok: true, message: "Message updated", data: { id: messageId, active } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * DELETE /api/admin/messages/:id
 * Auth: Sí (JWT + admin)
 * Borrado lógico del mensaje (active=0, deleted_at=NOW()).
 */
router.delete("/messages/:id", auth, admin, async (req, res) => {
  try {
    const messageId = Number(req.params.id);
    if (!Number.isInteger(messageId) || messageId <= 0) {
      return res.status(400).json({ ok: false, message: "Invalid message id" });
    }

    const [rows] = await pool.query(
      `SELECT id FROM messages WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
      [messageId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ ok: false, message: "Message not found" });
    }

    await pool.query(
      `UPDATE messages SET active = 0, deleted_at = NOW(), updated_at = NOW() WHERE id = ? AND deleted_at IS NULL`,
      [messageId]
    );

    return res.json({ ok: true, message: "Message deleted (logical)", data: { id: messageId } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * PATCH /api/admin/messages/:id/restore
 * Auth: Sí (JWT + admin)
 * Restaura message borrado lógicamente (deleted_at=NULL, active=1).
 */
router.patch("/messages/:id/restore", auth, admin, async (req, res) => {
  try {
    const messageId = Number(req.params.id);
    if (!Number.isInteger(messageId) || messageId <= 0) {
      return res.status(400).json({ ok: false, message: "Invalid message id" });
    }

    const [rows] = await pool.query(
      `SELECT id, deleted_at FROM messages WHERE id = ? LIMIT 1`,
      [messageId]
    );

    const msg = rows[0];
    if (!msg) {
      return res.status(404).json({ ok: false, message: "Message not found" });
    }

    if (!msg.deleted_at) {
      return res.status(409).json({ ok: false, message: "Message is not deleted" });
    }

    await pool.query(
      `
      UPDATE messages
      SET deleted_at = NULL,
          active = 1,
          updated_at = NOW()
      WHERE id = ?
      `,
      [messageId]
    );

    return res.json({ ok: true, message: "Message restored", data: { id: messageId, active: 1 } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * POST /api/admin/categories
 * Auth: Sí (JWT + admin)
 * Body: { name: string, slug?: string }
 * Crea categoría (slug único).
 */
router.post("/categories", auth, admin, async (req, res) => {
  try {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    let slug = typeof req.body?.slug === "string" ? req.body.slug.trim() : "";

    if (!name) {
      return res.status(400).json({ ok: false, message: "name is required" });
    }
    if (name.length > 60) {
      return res.status(400).json({ ok: false, message: "name max length is 60" });
    }

    if (!slug){
      slug = slugify(name);
    }else{
      slug = slugify(slug);
    } 

    if (!slug) {
      return res.status(400).json({ ok: false, message: "slug is invalid" });
    }

    // Si existe una categoría con ese slug, no dejamos duplicar.
    // Si está borrada, obligamos a usar restore (más limpio).
    const [exists] = await pool.query(
      `SELECT id, deleted_at FROM categories WHERE slug = ? LIMIT 1`,
      [slug]
    );
    if (exists.length > 0) {
      if (exists[0].deleted_at) {
        return res.status(409).json({
          ok: false,
          message: "Category slug exists but is deleted. Restore it instead.",
        });
      }
      return res.status(409).json({ ok: false, message: "Category slug already exists" });
    }

    const [result] = await pool.query(
      `
      INSERT INTO categories (name, slug, active)
      VALUES (?, ?, 1)
      `,
      [name, slug]
    );

    return res.status(201).json({
      ok: true,
      message: "Category created",
      data: { id: result.insertId, name, slug, active: 1 },
    });
  } catch (err) {
    if (err && err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ ok: false, message: "Category slug already exists" });
    }
    console.error(err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * DELETE /api/admin/categories/:id
 * Auth: Sí (JWT + admin)
 * Borrado lógico.
 */
router.delete("/categories/:id", auth, admin, async (req, res) => {
  try {
    const categoryId = Number(req.params.id);
    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      return res.status(400).json({ ok: false, message: "Invalid category id" });
    }

    const [rows] = await pool.query(
      `SELECT id, deleted_at FROM categories WHERE id = ? LIMIT 1`,
      [categoryId]
    );
    const cat = rows[0];
    if (!cat) return res.status(404).json({ ok: false, message: "Category not found" });
    if (cat.deleted_at) return res.status(409).json({ ok: false, message: "Category already deleted" });

    await pool.query(
      `UPDATE categories SET active = 0, deleted_at = NOW(), updated_at = NOW() WHERE id = ?`,
      [categoryId]
    );

    return res.json({ ok: true, message: "Category deleted (admin)" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * GET /api/admin/categories
 * Auth: Sí (JWT + admin)
 * Query:
 *  - deleted: 0|1 (default 0)
 *  - active: 0|1 (optional)
 */
router.get("/categories", auth, admin, async (req, res) => {
  try {
    const deleted = req.query.deleted !== undefined ? Number(req.query.deleted) : 0;
    if (![0, 1].includes(deleted)) {
      return res.status(400).json({ ok: false, message: "deleted must be 0 or 1" });
    }

    const active = req.query.active !== undefined ? Number(req.query.active) : null;
    if (req.query.active !== undefined && ![0, 1].includes(active)) {
      return res.status(400).json({ ok: false, message: "active must be 0 or 1" });
    }

    const where = [];
    const params = [];

    if (deleted === 1) where.push("deleted_at IS NOT NULL");
    else where.push("deleted_at IS NULL");

    if (active !== null) { where.push("active = ?"); params.push(active); }

    const whereSql = `WHERE ${where.join(" AND ")}`;

    const [rows] = await pool.query(
      `
      SELECT id, name, slug, active, deleted_at, created_at, updated_at
      FROM categories
      ${whereSql}
      ORDER BY id ASC
      `,
      params
    );

    return res.json({ ok: true, data: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * PATCH /api/admin/categories/:id
 * Auth: Sí (JWT + admin)
 * Body: { name?: string, slug?: string, active?: 0|1 }
 * Edita categoría. Si se pasa name y NO slug, recalcula slug desde name.
 */
router.patch("/categories/:id", auth, admin, async (req, res) => {
  try {
    const categoryId = Number(req.params.id);
    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      return res.status(400).json({ ok: false, message: "Invalid category id" });
    }

    // Leer categoría actual
    const [rows] = await pool.query(
      `SELECT id, name, slug, active, deleted_at FROM categories WHERE id = ? LIMIT 1`,
      [categoryId]
    );
    const current = rows[0];
    if (!current) return res.status(404).json({ ok: false, message: "Category not found" });
    if (current.deleted_at) {
      return res.status(409).json({ ok: false, message: "Category is deleted. Restore it first." });
    }

    // Inputs
    const nameIn = typeof req.body?.name === "string" ? req.body.name.trim() : null;
    const slugIn = typeof req.body?.slug === "string" ? req.body.slug.trim() : null;

    const activeInRaw = req.body?.active;
    const activeIn = activeInRaw === undefined ? null : Number(activeInRaw);

    // Validaciones
    if (nameIn !== null) {
      if (!nameIn) return res.status(400).json({ ok: false, message: "name cannot be empty" });
      if (nameIn.length > 60) return res.status(400).json({ ok: false, message: "name max length is 60" });
    }

    if (activeIn !== null && ![0, 1].includes(activeIn)) {
      return res.status(400).json({ ok: false, message: "active must be 0 or 1" });
    }

    let finalName = nameIn !== null ? nameIn : current.name;

    let finalSlug = current.slug;
    if (slugIn !== null) {
      finalSlug = slugify(slugIn);
      if (!finalSlug) return res.status(400).json({ ok: false, message: "slug is invalid" });
    } else if (nameIn !== null) {
      finalSlug = slugify(finalName);
      if (!finalSlug) return res.status(400).json({ ok: false, message: "slug is invalid" });
    }

    const finalActive = activeIn !== null ? activeIn : current.active;

    const changed =
      finalName !== current.name ||
      finalSlug !== current.slug ||
      finalActive !== current.active;

    if (!changed) {
      return res.json({
        ok: true,
        message: "No changes",
        data: { id: current.id, name: current.name, slug: current.slug, active: current.active },
      });
    }

    if (finalSlug !== current.slug) {
      const [exists] = await pool.query(
        `SELECT id, deleted_at FROM categories WHERE slug = ? AND id <> ? LIMIT 1`,
        [finalSlug, categoryId]
      );
      if (exists.length > 0) {
        if (exists[0].deleted_at) {
          return res.status(409).json({
            ok: false,
            message: "Category slug exists but is deleted. Restore it instead.",
          });
        }
        return res.status(409).json({ ok: false, message: "Category slug already exists" });
      }
    }

    await pool.query(
      `
      UPDATE categories
      SET name = ?, slug = ?, active = ?, updated_at = NOW()
      WHERE id = ? AND deleted_at IS NULL
      `,
      [finalName, finalSlug, finalActive, categoryId]
    );

    return res.json({
      ok: true,
      message: "Category updated",
      data: { id: categoryId, name: finalName, slug: finalSlug, active: finalActive },
    });
  } catch (err) {
    if (err && err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ ok: false, message: "Category slug already exists" });
    }
    console.error(err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * PATCH /api/admin/categories/:id/restore
 * Auth: Sí (JWT + admin)
 * Restaura una categoría borrada lógicamente (deleted_at=NULL, active=1).
 */
router.patch("/categories/:id/restore", auth, admin, async (req, res) => {
  try {
    const categoryId = Number(req.params.id);
    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      return res.status(400).json({ ok: false, message: "Invalid category id" });
    }

    const [rows] = await pool.query(
      `SELECT id, name, slug, active, deleted_at
       FROM categories
       WHERE id = ?
       LIMIT 1`,
      [categoryId]
    );

    const cat = rows[0];
    if (!cat) {
      return res.status(404).json({ ok: false, message: "Category not found" });
    }

    if (!cat.deleted_at) {
      return res.status(409).json({ ok: false, message: "Category is not deleted" });
    }

    await pool.query(
      `
      UPDATE categories
      SET deleted_at = NULL,
          active = 1,
          updated_at = NOW()
      WHERE id = ?
      `,
      [categoryId]
    );

    return res.json({
      ok: true,
      message: "Category restored",
      data: { id: categoryId, active: 1 },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

module.exports = router;
