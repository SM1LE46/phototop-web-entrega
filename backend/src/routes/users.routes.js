const express = require("express");
const pool = require("../db");
const auth = require("../middlewares/auth");
const uploadAvatar = require("../middlewares/uploadAvatar");
const fs = require("fs/promises");
const path = require("path");

const router = express.Router();

/**
 * GET /api/users/me
 * Auth: Sí (JWT)
 * Devuelve el perfil del usuario autenticado.
 * Response: { ok, data: user }
 */
router.get("/me", auth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `
      SELECT
        u.id,
        u.name,
        u.surname,
        u.email,
        u.province_id,
        p.name AS province_name,
        u.description,
        u.phone,
        u.profile_image,
        u.admin,
        u.photographer,
        u.model,
        u.active,
        u.created_at,
        u.updated_at,

        ROUND(COALESCE(ur.avg_rating, 0), 1) AS avg_rating,
        COALESCE(ur.ratings_count, 0) AS ratings_count,

        (
          SELECT COUNT(*)
          FROM follows f
          WHERE f.followed_id = u.id
            AND f.active = 1
            AND f.deleted_at IS NULL
        ) AS followers_count,

        (
          SELECT COUNT(*)
          FROM follows f
          WHERE f.follower_id = u.id
            AND f.active = 1
            AND f.deleted_at IS NULL
        ) AS following_count

      FROM users u

      LEFT JOIN provinces p
        ON p.id = u.province_id
       AND p.active = 1

      LEFT JOIN (
        SELECT
          po.user_id,
          AVG(r.rating) AS avg_rating,
          COUNT(*) AS ratings_count
        FROM posts po
        JOIN ratings r
          ON r.post_id = po.id
        WHERE po.active = 1
          AND po.deleted_at IS NULL
          AND r.active = 1
          AND r.deleted_at IS NULL
        GROUP BY po.user_id
      ) ur
        ON ur.user_id = u.id

      WHERE u.id = ?
        AND u.active = 1
        AND u.deleted_at IS NULL

      LIMIT 1
      `,
      [req.user.id]
    );

    const user = rows[0];

    if (!user) {
      return res.status(404).json({ ok: false, message: "User not found" });
    }

    const [categoryRows] = await pool.query(
      `
      SELECT
        c.id,
        c.name,
        c.slug
      FROM user_categories uc
      JOIN categories c
        ON c.id = uc.category_id
      WHERE uc.user_id = ?
        AND uc.active = 1
        AND uc.deleted_at IS NULL
        AND c.active = 1
        AND c.deleted_at IS NULL
      ORDER BY c.id ASC
      `,
      [req.user.id]
    );

    return res.json({
      ok: true,
      data: {
        ...user,
        avg_rating: user.avg_rating !== null ? Number(user.avg_rating) : 0,
        ratings_count: Number(user.ratings_count || 0),
        followers_count: Number(user.followers_count || 0),
        following_count: Number(user.following_count || 0),
        categories: categoryRows
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * PATCH /api/users/me
 * Auth: Sí (JWT)
 * Body (JSON): { name?, surname?, description?, phone?, province_id? }
 * Actualiza campos editables del perfil del usuario autenticado.
 * Response: { ok, message, data: user }
 */
router.patch("/me", auth, async (req, res) => {
  try {
    const { name, surname, description, phone, province_id, photographer, model } = req.body || {};

    const updates = [];
    const params = [];

    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ ok: false, message: "Invalid name" });
      }
      updates.push("name = ?");
      params.push(name.trim());
    }

    if (surname !== undefined) {
      if (typeof surname !== "string" || !surname.trim()) {
        return res.status(400).json({ ok: false, message: "Invalid surname" });
      }
      updates.push("surname = ?");
      params.push(surname.trim());
    }

    if (description !== undefined) {
      if (description !== null && typeof description !== "string") {
        return res.status(400).json({ ok: false, message: "Invalid description" });
      }
      updates.push("description = ?");
      params.push(description === null ? null : description);
    }

    if (phone !== undefined) {
      if (phone !== null && typeof phone !== "string") {
        return res.status(400).json({ ok: false, message: "Invalid phone" });
      }
      updates.push("phone = ?");
      params.push(phone === null ? null : phone.trim());
    }

    if (province_id !== undefined) {
      const pid = province_id === null ? null : Number(province_id);
      if (province_id !== null && !Number.isInteger(pid)) {
        return res.status(400).json({ ok: false, message: "Invalid province_id" });
      }

      if (pid !== null) {
        const [provRows] = await pool.query(
          `SELECT id
           FROM provinces
           WHERE id = ?
             AND active = 1
           LIMIT 1`,
          [pid]
        );
        if (provRows.length === 0) {
          return res.status(400).json({ ok: false, message: "Province not found" });
        }
      }

      updates.push("province_id = ?");
      params.push(pid);
    }

    if (photographer !== undefined) {
      updates.push("photographer = ?");
      params.push(photographer ? 1 : 0);
    }

    if (model !== undefined) {
      updates.push("model = ?");
      params.push(model ? 1 : 0);
    }

    if (updates.length === 0) {
      return res.status(400).json({ ok: false, message: "No fields to update" });
    }

    params.push(req.user.id);

    await pool.query(
      `UPDATE users
       SET ${updates.join(", ")}
       WHERE id = ?
         AND active = 1
         AND deleted_at IS NULL`,
      params
    );

    const [rows] = await pool.query(
      `SELECT u.id, u.name, u.surname, u.email,
              u.province_id, p.name AS province_name,
              u.description, u.phone, u.profile_image,
              u.admin, u.photographer, u.model,
              u.active, u.created_at, u.updated_at
      FROM users u
      LEFT JOIN provinces p
        ON p.id = u.province_id
        AND p.active = 1
      WHERE u.id = ?
        AND u.active = 1
        AND u.deleted_at IS NULL
      LIMIT 1`,
      [req.user.id]
    );

    const user = rows[0];
    if (!user) {
      return res.status(404).json({ ok: false, message: "User not found" });
    }

    const [categoryRows] = await pool.query(
      `SELECT c.id, c.name, c.slug
      FROM user_categories uc
      JOIN categories c
        ON c.id = uc.category_id
      WHERE uc.user_id = ?
        AND uc.active = 1
        AND uc.deleted_at IS NULL
        AND c.active = 1
        AND c.deleted_at IS NULL
      ORDER BY c.id ASC`,
      [req.user.id]
    );

    user.categories = categoryRows;

    return res.json({ ok: true, message: "Profile updated", data: user });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * POST /api/users/me/avatar
 * Auth: Sí (JWT)
 * Content-Type: multipart/form-data
 * Body (form-data):
 *  - avatar: file (required)
 * Sube/actualiza la imagen de perfil del usuario autenticado.
 * Response: { ok, message, data: user }
 */
router.post("/me/avatar", auth, uploadAvatar.single("avatar"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, message: "Avatar file is required" });
    }

    const newPath = `/uploads/avatars/${req.file.filename}`;

    const [rows] = await pool.query(
      `SELECT profile_image
       FROM users
       WHERE id = ?
         AND active = 1
         AND deleted_at IS NULL
       LIMIT 1`,
      [req.user.id]
    );

    if (rows.length === 0) {
      if (req.file?.path) {
        await fs.unlink(req.file.path).catch(() => null);
      }
      return res.status(404).json({ ok: false, message: "User not found" });
    }

    const oldPath = rows[0].profile_image || null;

    const [result] = await pool.query(
      `UPDATE users
       SET profile_image = ?
       WHERE id = ?
         AND active = 1
         AND deleted_at IS NULL`,
      [newPath, req.user.id]
    );

    if (result.affectedRows === 0) {
      if (req.file?.path) {
        await fs.unlink(req.file.path).catch(() => null);
      }
      return res.status(404).json({ ok: false, message: "User not found" });
    }

    if (oldPath && oldPath.startsWith("/uploads/avatars/")) {
      const diskPath = path.join(process.cwd(), oldPath.replace(/^\/+/, ""));
      await fs.unlink(diskPath).catch(() => null);
    }

    const [updatedRows] = await pool.query(
      `SELECT
          u.id,
          u.name,
          u.surname,
          u.email,
          u.province_id,
          p.name AS province_name,
          u.description,
          u.phone,
          u.profile_image,
          u.admin,
          u.photographer,
          u.model,
          u.active,
          u.created_at,
          u.updated_at
       FROM users u
       LEFT JOIN provinces p
         ON p.id = u.province_id
        AND p.active = 1
       WHERE u.id = ?
         AND u.active = 1
         AND u.deleted_at IS NULL
       LIMIT 1`,
      [req.user.id]
    );

    const user = updatedRows[0];
    if (!user) {
      return res.status(404).json({ ok: false, message: "User not found" });
    }

    return res.json({
      ok: true,
      message: "Avatar updated",
      data: user,
    });
  } catch (err) {
    if (req.file?.path) {
      await fs.unlink(req.file.path).catch(() => null);
    }

    console.error(err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * DELETE /api/users/me/avatar
 * Auth: Sí (JWT)
 * Elimina la imagen de perfil del usuario autenticado.
 * Response: { ok, message, data: user }
 */
router.delete("/me/avatar", auth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT profile_image
       FROM users
       WHERE id = ?
         AND active = 1
         AND deleted_at IS NULL
       LIMIT 1`,
      [req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ ok: false, message: "User not found" });
    }

    const oldPath = rows[0].profile_image || null;

    await pool.query(
      `UPDATE users
       SET profile_image = NULL
       WHERE id = ?
         AND active = 1
         AND deleted_at IS NULL`,
      [req.user.id]
    );

    if (oldPath && oldPath.startsWith("/uploads/avatars/")) {
      const diskPath = path.join(process.cwd(), oldPath.replace(/^\/+/, ""));
      await fs.unlink(diskPath).catch(() => null);
    }

    const [updatedRows] = await pool.query(
      `SELECT
          u.id,
          u.name,
          u.surname,
          u.email,
          u.province_id,
          p.name AS province_name,
          u.description,
          u.phone,
          u.profile_image,
          u.admin,
          u.photographer,
          u.model,
          u.active,
          u.created_at,
          u.updated_at
       FROM users u
       LEFT JOIN provinces p
         ON p.id = u.province_id
        AND p.active = 1
       WHERE u.id = ?
         AND u.active = 1
         AND u.deleted_at IS NULL
       LIMIT 1`,
      [req.user.id]
    );

    const user = updatedRows[0];
    if (!user) {
      return res.status(404).json({ ok: false, message: "User not found" });
    }

    return res.json({
      ok: true,
      message: "Avatar removed",
      data: user,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * GET /api/users/me/posts
 * Auth: Sí
 * Devuelve los posts del usuario autenticado con miniatura, número de fotos y valoraciones.
 * Si recibe page/limit devuelve respuesta paginada.
 * Response sin paginación: { ok, data: Array<post_summary> }
 * Response con paginación: { ok, data: { posts, page, limit, total, totalPages } }
 */
router.get("/me/posts", auth, async (req, res) => {
  try {
    const hasPagination =
      req.query.page !== undefined || req.query.limit !== undefined;

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(12, Math.max(1, Number(req.query.limit) || 6));
    const offset = (page - 1) * limit;

    let total = 0;
    let totalPages = 1;

    if (hasPagination) {
      const [countRows] = await pool.query(
        `
        SELECT COUNT(*) AS total
        FROM posts p
        WHERE p.user_id = ?
          AND p.active = 1
          AND p.deleted_at IS NULL
        `,
        [req.user.id]
      );

      total = Number(countRows[0]?.total || 0);
      totalPages = Math.max(1, Math.ceil(total / limit));
    }

    const limitSql = hasPagination ? `LIMIT ? OFFSET ?` : ``;
    const params = hasPagination
      ? [req.user.id, limit, offset]
      : [req.user.id];

    const [rows] = await pool.query(
      `
      SELECT
        p.id,
        p.title,
        p.description,
        p.created_at,
        p.category_id,

        c.name AS category_name,
        c.slug AS category_slug,

        (
          SELECT ph.file_path
          FROM photos ph
          WHERE ph.post_id = p.id
            AND ph.active = 1
          ORDER BY ph.id ASC
          LIMIT 1
        ) AS cover_photo,

        (
          SELECT COUNT(*)
          FROM photos ph2
          WHERE ph2.post_id = p.id
            AND ph2.active = 1
        ) AS photos_count,

        ROUND(COALESCE(rating_summary.avg_rating, 0), 1) AS avg_rating,
        COALESCE(rating_summary.ratings_count, 0) AS ratings_count

      FROM posts p

      LEFT JOIN categories c
        ON c.id = p.category_id
       AND c.active = 1
       AND c.deleted_at IS NULL

      LEFT JOIN (
        SELECT
          r.post_id,
          AVG(r.rating) AS avg_rating,
          COUNT(*) AS ratings_count
        FROM ratings r
        WHERE r.active = 1
          AND r.deleted_at IS NULL
        GROUP BY r.post_id
      ) rating_summary
        ON rating_summary.post_id = p.id

      WHERE p.user_id = ?
        AND p.active = 1
        AND p.deleted_at IS NULL

      ORDER BY p.created_at DESC, p.id DESC
      ${limitSql}
      `,
      params
    );

    const posts = rows.map(row => ({
      ...row,
      photos_count: Number(row.photos_count || 0),
      avg_rating: Number(row.avg_rating || 0),
      ratings_count: Number(row.ratings_count || 0),
    }));

    if (!hasPagination) {
      return res.json({
        ok: true,
        data: posts,
      });
    }

    return res.json({
      ok: true,
      data: {
        posts,
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (err) {
    console.error("GET /api/users/me/posts error:", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * GET /api/users/:id/follow-status
 * Auth: Sí
 * Devuelve si el usuario autenticado sigue al usuario indicado.
 */
router.get("/:id/follow-status", auth, async (req, res) => {
  try {
    const followedId = Number(req.params.id);
    const followerId = req.user.id;

    if (!Number.isInteger(followedId) || followedId <= 0) {
      return res.status(400).json({ ok: false, message: "Invalid user id" });
    }

    if (followedId === followerId) {
      return res.json({
        ok: true,
        data: { is_following: false }
      });
    }

    const [rows] = await pool.query(
      `
      SELECT id
      FROM follows
      WHERE follower_id = ?
        AND followed_id = ?
        AND active = 1
        AND deleted_at IS NULL
      LIMIT 1
      `,
      [followerId, followedId]
    );

    return res.json({
      ok: true,
      data: { is_following: rows.length > 0 }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});


/**
 * POST /api/users/:id/follow
 * Auth: Sí
 * Sigue a un usuario.
 */
router.post("/:id/follow", auth, async (req, res) => {
  try {
    const followedId = Number(req.params.id);
    const followerId = req.user.id;

    if (!Number.isInteger(followedId) || followedId <= 0) {
      return res.status(400).json({ ok: false, message: "Invalid user id" });
    }

    if (followedId === followerId) {
      return res.status(400).json({ ok: false, message: "You cannot follow yourself" });
    }

    const [userRows] = await pool.query(
      `
      SELECT id
      FROM users
      WHERE id = ?
        AND active = 1
        AND deleted_at IS NULL
      LIMIT 1
      `,
      [followedId]
    );

    if (userRows.length === 0) {
      return res.status(404).json({ ok: false, message: "User not found" });
    }

    await pool.query(
      `
      INSERT INTO follows (follower_id, followed_id, active, deleted_at)
      VALUES (?, ?, 1, NULL)
      ON DUPLICATE KEY UPDATE
        active = 1,
        deleted_at = NULL,
        updated_at = CURRENT_TIMESTAMP
      `,
      [followerId, followedId]
    );

    return res.json({
      ok: true,
      message: "User followed",
      data: { is_following: true }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});


/**
 * DELETE /api/users/:id/follow
 * Auth: Sí
 * Deja de seguir a un usuario.
 */
router.delete("/:id/follow", auth, async (req, res) => {
  try {
    const followedId = Number(req.params.id);
    const followerId = req.user.id;

    if (!Number.isInteger(followedId) || followedId <= 0) {
      return res.status(400).json({ ok: false, message: "Invalid user id" });
    }

    await pool.query(
      `
      UPDATE follows
      SET active = 0,
          deleted_at = CURRENT_TIMESTAMP
      WHERE follower_id = ?
        AND followed_id = ?
        AND active = 1
        AND deleted_at IS NULL
      `,
      [followerId, followedId]
    );

    return res.json({
      ok: true,
      message: "User unfollowed",
      data: { is_following: false }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});


/**
 * GET /api/users/:id/followers
 * Auth: No
 * Devuelve los usuarios que siguen al usuario indicado.
 * Response: { ok, data: Array<user_summary> }
 */
router.get("/:id/followers", async (req, res) => {
  try {
    const userId = Number(req.params.id);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ ok: false, message: "Invalid user id" });
    }

    const [rows] = await pool.query(
      `
      SELECT
        u.id,
        u.name,
        u.surname,
        u.profile_image,
        u.province_id,
        p.name AS province_name,
        u.photographer,
        u.model,

        ROUND(COALESCE(ur.avg_rating, 0), 1) AS avg_rating,
        COALESCE(ur.ratings_count, 0) AS ratings_count,

        f.created_at AS followed_at

      FROM follows f

      JOIN users u
        ON u.id = f.follower_id

      LEFT JOIN provinces p
        ON p.id = u.province_id

      LEFT JOIN (
        SELECT
          po.user_id,
          AVG(r.rating) AS avg_rating,
          COUNT(*) AS ratings_count
        FROM posts po
        JOIN ratings r
          ON r.post_id = po.id
        WHERE po.active = 1
          AND po.deleted_at IS NULL
          AND r.active = 1
          AND r.deleted_at IS NULL
        GROUP BY po.user_id
      ) ur
        ON ur.user_id = u.id

      WHERE f.followed_id = ?
        AND f.active = 1
        AND f.deleted_at IS NULL
        AND u.active = 1
        AND u.deleted_at IS NULL

      ORDER BY f.created_at DESC, f.id DESC
      `,
      [userId]
    );

    return res.json({
      ok: true,
      data: rows.map(row => ({
        ...row,
        avg_rating: Number(row.avg_rating || 0),
        ratings_count: Number(row.ratings_count || 0),
      })),
    });
  } catch (err) {
    console.error("GET /api/users/:id/followers error:", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * GET /api/users/:id/following
 * Auth: No
 * Devuelve los usuarios a los que sigue el usuario indicado.
 * Response: { ok, data: Array<user_summary> }
 */
router.get("/:id/following", async (req, res) => {
  try {
    const userId = Number(req.params.id);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ ok: false, message: "Invalid user id" });
    }

    const [rows] = await pool.query(
      `
      SELECT
        u.id,
        u.name,
        u.surname,
        u.profile_image,
        u.province_id,
        p.name AS province_name,
        u.photographer,
        u.model,

        ROUND(COALESCE(ur.avg_rating, 0), 1) AS avg_rating,
        COALESCE(ur.ratings_count, 0) AS ratings_count,

        f.created_at AS followed_at

      FROM follows f

      JOIN users u
        ON u.id = f.followed_id

      LEFT JOIN provinces p
        ON p.id = u.province_id

      LEFT JOIN (
        SELECT
          po.user_id,
          AVG(r.rating) AS avg_rating,
          COUNT(*) AS ratings_count
        FROM posts po
        JOIN ratings r
          ON r.post_id = po.id
        WHERE po.active = 1
          AND po.deleted_at IS NULL
          AND r.active = 1
          AND r.deleted_at IS NULL
        GROUP BY po.user_id
      ) ur
        ON ur.user_id = u.id

      WHERE f.follower_id = ?
        AND f.active = 1
        AND f.deleted_at IS NULL
        AND u.active = 1
        AND u.deleted_at IS NULL

      ORDER BY f.created_at DESC, f.id DESC
      `,
      [userId]
    );

    return res.json({
      ok: true,
      data: rows.map(row => ({
        ...row,
        avg_rating: Number(row.avg_rating || 0),
        ratings_count: Number(row.ratings_count || 0),
      })),
    });
  } catch (err) {
    console.error("GET /api/users/:id/following error:", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * GET /api/users/:id
 * Auth: No
 * Params: id (user_id)
 * Devuelve perfil público ampliado del usuario.
 * Response: { ok, data: user_public }
 */
router.get("/:id", async (req, res) => {
  try {
    const userId = Number(req.params.id);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ ok: false, message: "Invalid user id" });
    }

    // 1. Usuario base + provincia + rating medio + seguidores/seguidos
    const [rows] = await pool.query(
      `
      SELECT
        u.id,
        u.name,
        u.surname,
        u.province_id,
        p.name AS province_name,
        u.description,
        u.profile_image,
        u.photographer,
        u.model,

        ROUND(COALESCE(ur.avg_rating, 0), 1) AS avg_rating,
        COALESCE(ur.ratings_count, 0) AS ratings_count,

        (
          SELECT COUNT(*)
          FROM follows f
          WHERE f.followed_id = u.id
            AND f.active = 1
            AND f.deleted_at IS NULL
        ) AS followers_count,

        (
          SELECT COUNT(*)
          FROM follows f
          WHERE f.follower_id = u.id
            AND f.active = 1
            AND f.deleted_at IS NULL
        ) AS following_count

      FROM users u

      LEFT JOIN provinces p
        ON p.id = u.province_id

      LEFT JOIN (
        SELECT
          po.user_id,
          AVG(r.rating) AS avg_rating,
          COUNT(*) AS ratings_count
        FROM posts po
        JOIN ratings r
          ON r.post_id = po.id
        WHERE po.active = 1
          AND po.deleted_at IS NULL
          AND r.active = 1
          AND r.deleted_at IS NULL
        GROUP BY po.user_id
      ) ur
        ON ur.user_id = u.id

      WHERE u.id = ?
        AND u.active = 1
        AND u.deleted_at IS NULL

      LIMIT 1
      `,
      [userId]
    );

    const user = rows[0];

    if (!user) {
      return res.status(404).json({ ok: false, message: "User not found" });
    }

    // 2. Categorías del fotógrafo
    const [categoryRows] = await pool.query(
      `
      SELECT
        c.id,
        c.name
      FROM user_categories uc
      JOIN categories c
        ON c.id = uc.category_id
      WHERE uc.user_id = ?
        AND uc.active = 1
        AND uc.deleted_at IS NULL
        AND c.active = 1
        AND c.deleted_at IS NULL
      ORDER BY c.name ASC
      `,
      [userId]
    );

    return res.json({
      ok: true,
      data: {
        ...user,
        avg_rating: user.avg_rating !== null ? Number(user.avg_rating) : 0,
        ratings_count: Number(user.ratings_count || 0),
        followers_count: Number(user.followers_count || 0),
        following_count: Number(user.following_count || 0),
        categories: categoryRows
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * GET /api/users/:id/posts
 * Auth: No
 * Devuelve los posts públicos de un usuario con miniatura, número de fotos y valoraciones.
 * Si recibe page/limit devuelve respuesta paginada.
 * Response sin paginación: { ok, data: Array<post_summary> }
 * Response con paginación: { ok, data: { posts, page, limit, total, totalPages } }
 */
router.get("/:id/posts", async (req, res) => {
  try {
    const userId = Number(req.params.id);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({ ok: false, message: "Invalid user id" });
    }

    const hasPagination =
      req.query.page !== undefined || req.query.limit !== undefined;

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(12, Math.max(1, Number(req.query.limit) || 6));
    const offset = (page - 1) * limit;

    let total = 0;
    let totalPages = 1;

    if (hasPagination) {
      const [countRows] = await pool.query(
        `
        SELECT COUNT(*) AS total
        FROM posts p
        JOIN users u
          ON u.id = p.user_id
        WHERE p.user_id = ?
          AND p.active = 1
          AND p.deleted_at IS NULL
          AND u.active = 1
          AND u.deleted_at IS NULL
        `,
        [userId]
      );

      total = Number(countRows[0]?.total || 0);
      totalPages = Math.max(1, Math.ceil(total / limit));
    }

    const limitSql = hasPagination ? `LIMIT ? OFFSET ?` : ``;
    const params = hasPagination
      ? [userId, limit, offset]
      : [userId];

    const [rows] = await pool.query(
      `
      SELECT
        p.id,
        p.title,
        p.description,
        p.created_at,
        p.category_id,

        c.name AS category_name,
        c.slug AS category_slug,

        (
          SELECT ph.file_path
          FROM photos ph
          WHERE ph.post_id = p.id
            AND ph.active = 1
          ORDER BY ph.id ASC
          LIMIT 1
        ) AS cover_photo,

        (
          SELECT COUNT(*)
          FROM photos ph2
          WHERE ph2.post_id = p.id
            AND ph2.active = 1
        ) AS photos_count,

        ROUND(COALESCE(rating_summary.avg_rating, 0), 1) AS avg_rating,
        COALESCE(rating_summary.ratings_count, 0) AS ratings_count

      FROM posts p

      JOIN users u
        ON u.id = p.user_id

      LEFT JOIN categories c
        ON c.id = p.category_id
       AND c.active = 1
       AND c.deleted_at IS NULL

      LEFT JOIN (
        SELECT
          r.post_id,
          AVG(r.rating) AS avg_rating,
          COUNT(*) AS ratings_count
        FROM ratings r
        WHERE r.active = 1
          AND r.deleted_at IS NULL
        GROUP BY r.post_id
      ) rating_summary
        ON rating_summary.post_id = p.id

      WHERE p.user_id = ?
        AND p.active = 1
        AND p.deleted_at IS NULL
        AND u.active = 1
        AND u.deleted_at IS NULL

      ORDER BY p.created_at DESC, p.id DESC
      ${limitSql}
      `,
      params
    );

    const posts = rows.map(row => ({
      ...row,
      photos_count: Number(row.photos_count || 0),
      avg_rating: Number(row.avg_rating || 0),
      ratings_count: Number(row.ratings_count || 0),
    }));

    if (!hasPagination) {
      return res.json({
        ok: true,
        data: posts,
      });
    }

    return res.json({
      ok: true,
      data: {
        posts,
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (err) {
    console.error("GET /api/users/:id/posts error:", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * GET /api/users/:id/categories
 * Auth: No
 * Params: id (user_id)
 * Devuelve categorías activas asignadas al usuario (típicamente fotógrafo).
 * Response: { ok, data: Array<{id,name,slug}> }
 */
router.get("/:id/categories", async (req, res) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId)) {
      return res.status(400).json({ ok: false, message: "Invalid user id" });
    }

    const [rows] = await pool.query(
      `SELECT c.id, c.name, c.slug
       FROM user_categories uc
       JOIN categories c ON c.id = uc.category_id
       JOIN users u ON u.id = uc.user_id
       WHERE uc.user_id = ?
         AND uc.active = 1 AND uc.deleted_at IS NULL
         AND c.active = 1 AND c.deleted_at IS NULL
         AND u.active = 1 AND u.deleted_at IS NULL
       ORDER BY c.id ASC`,
      [userId]
    );

    return res.json({ ok: true, data: rows });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * PUT /api/users/me/categories
 * Auth: Sí (JWT)
 * Body (JSON): { category_ids: number[] }
 * Reemplaza el set de categorías del usuario autenticado.
 * Regla: solo usuarios con photographer=1 pueden asignar categorías.
 * Response: { ok, message, data: { category_ids } }
 */
router.put("/me/categories", auth, async (req, res) => {
  try {
    const [userRows] = await pool.query(
      `SELECT photographer
      FROM users
      WHERE id = ?
        AND active = 1
        AND deleted_at IS NULL
      LIMIT 1`,
      [req.user.id]
    );

    if (userRows.length === 0) {
      return res.status(404).json({ ok: false, message: "User not found" });
    }

    if (!userRows[0].photographer) {
      return res.status(403).json({ ok: false, message: "Only photographers can set categories" });
    }

    const categoryIds = Array.isArray(req.body?.category_ids) ? req.body.category_ids : null;
    if (!categoryIds) {
      return res.status(400).json({ ok: false, message: "category_ids must be an array" });
    }

    const cleanIds = [...new Set(categoryIds.map(Number))].filter(Number.isInteger);
    if (cleanIds.length !== categoryIds.length) {
      return res.status(400).json({ ok: false, message: "category_ids must contain only integers" });
    }

    if (cleanIds.length > 0) {
      const [validRows] = await pool.query(
        `SELECT id
         FROM categories
         WHERE active = 1 AND deleted_at IS NULL
           AND id IN (${cleanIds.map(() => "?").join(",")})`,
        cleanIds
      );

      if (validRows.length !== cleanIds.length) {
        return res.status(400).json({ ok: false, message: "Some categories do not exist or are inactive" });
      }
    }

    const userId = req.user.id;

    await pool.query("START TRANSACTION");

    await pool.query(
      `UPDATE user_categories
       SET active = 0, deleted_at = NOW()
       WHERE user_id = ?
         AND deleted_at IS NULL`,
      [userId]
    );

    for (const cid of cleanIds) {
      await pool.query(
        `INSERT INTO user_categories (user_id, category_id, active, deleted_at)
         VALUES (?, ?, 1, NULL)
         ON DUPLICATE KEY UPDATE
           active = 1,
           deleted_at = NULL,
           updated_at = CURRENT_TIMESTAMP`,
        [userId, cid]
      );
    }

    await pool.query("COMMIT");

    return res.json({
      ok: true,
      message: "Categories updated",
      data: { category_ids: cleanIds },
    });
  } catch (err) {
    try {
      await pool.query("ROLLBACK");
    } catch (_) { }
    console.error(err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * PATCH /api/users/me/roles
 * Auth: Sí (JWT)
 * Body (JSON): { photographer?: 0|1, model?: 0|1 }
 * Permite activar/desactivar roles del propio usuario (no permite admin).
 * Response: { ok, message, data: { id, photographer, model } }
 */
router.patch("/me/roles", auth, async (req, res) => {
  try {
    const photographer = req.body?.photographer;
    const model = req.body?.model;

    if (photographer === undefined && model === undefined) {
      return res.status(400).json({ ok: false, message: "No fields to update" });
    }

    const updates = [];
    const params = [];

    if (photographer !== undefined) {
      const p = Number(photographer);
      if (![0, 1].includes(p)) {
        return res.status(400).json({ ok: false, message: "Invalid photographer (0 or 1)" });
      }
      updates.push("photographer = ?");
      params.push(p);
    }

    if (model !== undefined) {
      const m = Number(model);
      if (![0, 1].includes(m)) {
        return res.status(400).json({ ok: false, message: "Invalid model (0 or 1)" });
      }
      updates.push("model = ?");
      params.push(m);
    }

    params.push(req.user.id);

    await pool.query(
      `UPDATE users
       SET ${updates.join(", ")}
       WHERE id = ?
         AND deleted_at IS NULL`,
      params
    );

    const [rows] = await pool.query(
      `SELECT id, photographer, model
       FROM users
       WHERE id = ?
       LIMIT 1`,
      [req.user.id]
    );

    return res.json({ ok: true, message: "Roles updated", data: rows[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * POST /api/users/:id/block
 * Auth: Sí (JWT)
 * Bloquea al usuario :id.
 */
router.post("/:id/block", auth, async (req, res) => {
  try {
    const me = req.user.id;
    const otherId = Number(req.params.id);

    if (!Number.isInteger(otherId) || otherId <= 0) {
      return res.status(400).json({ ok: false, message: "Invalid user id" });
    }
    if (otherId === me) {
      return res.status(400).json({ ok: false, message: "You cannot block yourself" });
    }

    const [urows] = await pool.query(
      `SELECT id FROM users WHERE id = ? AND active = 1 AND deleted_at IS NULL LIMIT 1`,
      [otherId]
    );
    if (urows.length === 0) {
      return res.status(404).json({ ok: false, message: "User not found" });
    }

    await pool.query(
      `
      INSERT INTO user_blocks (blocker_id, blocked_id, active, deleted_at)
      VALUES (?, ?, 1, NULL)
      ON DUPLICATE KEY UPDATE
        active = 1,
        deleted_at = NULL,
        updated_at = CURRENT_TIMESTAMP
      `,
      [me, otherId]
    );

    return res.json({ ok: true, message: "User blocked" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * DELETE /api/users/:id/block
 * Auth: Sí (JWT)
 * Desbloquea al usuario :id.
 */
router.delete("/:id/block", auth, async (req, res) => {
  try {
    const me = req.user.id;
    const otherId = Number(req.params.id);

    if (!Number.isInteger(otherId) || otherId <= 0) {
      return res.status(400).json({ ok: false, message: "Invalid user id" });
    }
    if (otherId === me) {
      return res.status(400).json({ ok: false, message: "Invalid user id" });
    }

    const [rows] = await pool.query(
      `
      SELECT id
      FROM user_blocks
      WHERE blocker_id = ? AND blocked_id = ?
        AND active = 1 AND deleted_at IS NULL
      LIMIT 1
      `,
      [me, otherId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ ok: false, message: "Block not found" });
    }

    await pool.query(
      `
      UPDATE user_blocks
      SET active = 0, deleted_at = NOW(), updated_at = CURRENT_TIMESTAMP
      WHERE blocker_id = ? AND blocked_id = ?
        AND deleted_at IS NULL
      `,
      [me, otherId]
    );

    return res.json({ ok: true, message: "User unblocked" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

module.exports = router;
