const express = require("express");
const pool = require("../db");
const auth = require("../middlewares/auth");

const router = express.Router();

/**
 * Valida rating entre 1.0 y 5.0 con máximo 1 decimal.
 * @param {any} value
 * @returns {boolean}
 */
function isValidRatingOneDecimal(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return false;
  if (n < 1 || n > 5) return false;
  return Math.round(n * 10) === n * 10;
}

/**
 * POST /api/ratings
 * Auth: Sí (JWT)
 * Body: { post_id: number, rating: number (1.0..5.0, 1 decimal) }
 * Crea o actualiza la valoración del usuario logueado para un post.
 * Reglas:
 *  - El post debe existir y estar activo/no borrado.
 *  - No se permite valorar el propio post.
 * Response: { ok, message, data: { post_id, user_id, rating } }
 */
router.post("/", auth, async (req, res) => {
  try {
    const postId = Number(req.body?.post_id);
    const rating = Number(req.body?.rating);

    if (!Number.isInteger(postId)) {
      return res.status(400).json({ ok: false, message: "Invalid post_id" });
    }

    if (!isValidRatingOneDecimal(rating)) {
      return res.status(400).json({
        ok: false,
        message: "Rating must be between 1.0 and 5.0 with at most 1 decimal",
      });
    }

    // Comprobar post existente y activo
    const [postRows] = await pool.query(
      `SELECT id, user_id
       FROM posts
       WHERE id = ?
         AND active = 1
         AND deleted_at IS NULL
       LIMIT 1`,
      [postId]
    );

    const post = postRows[0];
    if (!post) {
      return res.status(404).json({ ok: false, message: "Post not found" });
    }

    // Regla de negocio: evitar auto-valoración
    if (post.user_id === req.user.id) {
      return res.status(400).json({ ok: false, message: "You cannot rate your own post" });
    }

    // Upsert + reactivar si estaba borrado/inactivo
    await pool.query(
      `INSERT INTO ratings (user_id, post_id, rating, active, deleted_at)
       VALUES (?, ?, ?, 1, NULL)
       ON DUPLICATE KEY UPDATE
         rating = VALUES(rating),
         active = 1,
         deleted_at = NULL,
         updated_at = CURRENT_TIMESTAMP`,
      [req.user.id, postId, rating]
    );

    return res.json({
      ok: true,
      message: "Rating saved",
      data: { post_id: postId, user_id: req.user.id, rating },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * GET /api/ratings/post/:postId
 * Auth: No
 * Params: postId
 * Devuelve el resumen público de valoraciones del post: media y número de votos.
 * Response: { ok, data: { post_id, count, avg } }
 */
router.get("/post/:postId", async (req, res) => {
  try {
    const postId = Number(req.params.postId);
    if (!Number.isInteger(postId)) {
      return res.status(400).json({ ok: false, message: "Invalid post id" });
    }

    const [sumRows] = await pool.query(
      `SELECT COUNT(*) AS count, AVG(rating) AS avg
       FROM ratings
       WHERE post_id = ?
         AND active = 1
         AND deleted_at IS NULL`,
      [postId]
    );

    const count = Number(sumRows[0].count) || 0;
    const avg = sumRows[0].avg !== null ? Number(sumRows[0].avg) : null;

    return res.json({
      ok: true,
      data: { post_id: postId, count, avg },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * GET /api/ratings/post/:postId/me
 * Auth: Sí (JWT)
 * Params: postId
 * Devuelve resumen público + la valoración del usuario logueado (si existe).
 * Response: { ok, data: { post_id, count, avg, my_rating } }
 */
router.get("/post/:postId/me", auth, async (req, res) => {
  try {
    const postId = Number(req.params.postId);
    if (!Number.isInteger(postId)) {
      return res.status(400).json({ ok: false, message: "Invalid post id" });
    }

    const [sumRows] = await pool.query(
      `SELECT COUNT(*) AS count, AVG(rating) AS avg
       FROM ratings
       WHERE post_id = ?
         AND active = 1
         AND deleted_at IS NULL`,
      [postId]
    );

    const [myRows] = await pool.query(
      `SELECT rating
       FROM ratings
       WHERE post_id = ?
         AND user_id = ?
         AND active = 1
         AND deleted_at IS NULL
       LIMIT 1`,
      [postId, req.user.id]
    );

    const count = Number(sumRows[0].count) || 0;
    const avg = sumRows[0].avg !== null ? Number(sumRows[0].avg) : null;
    const my_rating = myRows[0]?.rating ?? null;

    return res.json({
      ok: true,
      data: { post_id: postId, count, avg, my_rating },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * DELETE /api/ratings/post/:postId
 * Auth: Sí (JWT)
 * Params: postId
 * Borra (lógico) la valoración del usuario logueado para un post.
 * Response: { ok, message, data: { post_id } }
 */
router.delete("/post/:postId", auth, async (req, res) => {
  try {
    const postId = Number(req.params.postId);
    if (!Number.isInteger(postId)) {
      return res.status(400).json({ ok: false, message: "Invalid post id" });
    }

    const [result] = await pool.query(
      `UPDATE ratings
       SET deleted_at = NOW(), active = 0
       WHERE user_id = ?
         AND post_id = ?
         AND deleted_at IS NULL`,
      [req.user.id, postId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ ok: false, message: "Rating not found" });
    }

    return res.json({
      ok: true,
      message: "Rating deleted",
      data: { post_id: postId },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

module.exports = router;
