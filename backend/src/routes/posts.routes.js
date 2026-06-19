const express = require("express");
const pool = require("../db");
const auth = require("../middlewares/auth");
const uploadPhotos = require("../middlewares/uploadPostPhotos");
const fs = require("fs/promises");
const multer = require("multer");

const router = express.Router();

function handlePostPhotoUpload(req, res, next) {
  uploadPhotos.array("photos", 10)(req, res, (err) => {
    if (!err) {
      return next();
    }

    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          ok: false,
          message: "One of the images is too large. Each photo must be at most 8 MB.",
        });
      }

      if (err.code === "LIMIT_UNEXPECTED_FILE") {
        return res.status(400).json({
          ok: false,
          message: "Too many photos selected. You can upload at most 10 images.",
        });
      }
    }

    return res.status(400).json({
      ok: false,
      message: err.message || "The selected images could not be processed.",
    });
  });
}

/**
 * POST /api/posts
 * Auth: Sí (JWT)
 * Content-Type: multipart/form-data
 * Body (form-data):
 *   - title: string (required)
 *   - description: string (optional)
 *   - category_id: number (required)
 *   - photos: file[] (required, 1..10)
 * Crea un post y sube entre 1 y 10 fotos asociadas.
 * Response: { ok, message, data: { post_id, photos: string[] } }
 */
router.post("/", auth, handlePostPhotoUpload, async (req, res) => {
  try {
    const { title, description } = req.body || {};
    const rawCategoryId = req.body?.category_id;

    if (!title || typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ ok: false, message: "Title is required" });
    }

    if (rawCategoryId === undefined || rawCategoryId === null || String(rawCategoryId).trim() === "") {
      return res.status(400).json({ ok: false, message: "Category is required" });
    }

    const categoryId = Number(rawCategoryId);

    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      return res.status(400).json({ ok: false, message: "Invalid category_id" });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ ok: false, message: "At least one photo required" });
    }

    const [catRows] = await pool.query(
      `SELECT id
      FROM categories
      WHERE id = ?
        AND active = 1
        AND deleted_at IS NULL
      LIMIT 1`,
      [categoryId]
    );

    if (catRows.length === 0) {
      return res.status(400).json({ ok: false, message: "Category not found" });
    }

    const userId = req.user.id;

    const [postResult] = await pool.query(
      `INSERT INTO posts (user_id, category_id, title, description)
       VALUES (?, ?, ?, ?)`,
      [userId, categoryId, title.trim(), description?.trim() || null]
    );

    const postId = postResult.insertId;

    const values = req.files.map((f) => [
      postId,
      `/uploads/posts/${f.filename}`,
    ]);

    await pool.query(
      `INSERT INTO photos (post_id, file_path) VALUES ?`,
      [values]
    );

    return res.status(201).json({
      ok: true,
      message: "Post created",
      data: { post_id: postId, photos: values.map((v) => v[1]) },
    });
  } catch (err) {
    if (req.files && req.files.length > 0) {
      await Promise.allSettled(req.files.map((f) => fs.unlink(f.path)));
    }

    console.error(err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * GET /api/posts
 * Auth: No
 * Query:
 *  - page: number optional
 *  - limit: number optional
 *  - category_id: number optional
 *
 * Devuelve posts activos con portada, número de fotos,
 * categoría, autor y puntuación media.
 * 
 * Sin page: mantiene respuesta antigua { ok, data: Array<post_summary> }
 * Con page: devuelve { ok, data: { posts, page, limit, total, totalPages } }
 */
router.get("/", async (req, res) => {
  try {
    const hasPagination = req.query.page !== undefined;

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(24, Math.max(1, Number(req.query.limit) || 6));
    const offset = (page - 1) * limit;

    const categoryId =
      req.query.category_id !== undefined &&
        req.query.category_id !== null &&
        String(req.query.category_id).trim() !== ""
        ? Number(req.query.category_id)
        : null;

    if (categoryId !== null && (!Number.isInteger(categoryId) || categoryId <= 0)) {
      return res.status(400).json({ ok: false, message: "Invalid category_id" });
    }

    const where = [
      "p.active = 1",
      "p.deleted_at IS NULL",
      "u.active = 1",
      "u.deleted_at IS NULL",
      "(c.id IS NULL OR (c.active = 1 AND c.deleted_at IS NULL))"
    ];

    const params = [];

    if (categoryId !== null) {
      where.push("p.category_id = ?");
      params.push(categoryId);
    }

    let total = 0;
    let totalPages = 1;

    if (hasPagination) {
      const [countRows] = await pool.query(
        `
        SELECT COUNT(*) AS total
        FROM posts p
        JOIN users u
          ON u.id = p.user_id
        LEFT JOIN categories c
          ON c.id = p.category_id
        WHERE ${where.join(" AND ")}
        `,
        params
      );

      total = Number(countRows[0]?.total || 0);
      totalPages = Math.max(1, Math.ceil(total / limit));
    }

    const limitSql = hasPagination ? "LIMIT ? OFFSET ?" : "LIMIT ?";
    const queryParams = hasPagination
      ? [...params, limit, offset]
      : [...params, limit];

    const [rows] = await pool.query(
      `
      SELECT
        p.id,
        p.title,
        p.description,
        p.created_at,
        p.category_id,

        u.id AS user_id,
        u.name,
        u.surname,
        u.profile_image,

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

      WHERE ${where.join(" AND ")}

      ORDER BY p.created_at DESC, p.id DESC
      ${limitSql}
      `,
      queryParams
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
    console.error("Error cargando posts", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * GET /api/posts/:id
 * Auth: No
 * Devuelve detalle de un post con autor, fotos, rating medio y comentarios.
 * Response: { ok, data: post_detail }
 */
router.get("/:id", async (req, res) => {
  try {
    const postId = Number(req.params.id);

    if (!Number.isInteger(postId) || postId <= 0) {
      return res.status(400).json({ ok: false, message: "Invalid post id" });
    }

    // 1) Datos base del post + autor + categoría
    const [postRows] = await pool.query(
      `
      SELECT
        p.id,
        p.user_id,
        p.category_id,
        p.title,
        p.description,
        p.created_at,

        u.name AS user_name,
        u.surname AS user_surname,
        u.profile_image AS user_profile_image,

        c.name AS category_name
      FROM posts p
      JOIN users u
        ON u.id = p.user_id
      LEFT JOIN categories c
        ON c.id = p.category_id
       AND c.active = 1
       AND c.deleted_at IS NULL
      WHERE p.id = ?
        AND p.active = 1
        AND p.deleted_at IS NULL
        AND u.active = 1
        AND u.deleted_at IS NULL
      LIMIT 1
      `,
      [postId]
    );

    const post = postRows[0];

    if (!post) {
      return res.status(404).json({ ok: false, message: "Post not found" });
    }

    // 2) Fotos del post
    const [photoRows] = await pool.query(
      `
      SELECT
        id,
        file_path
      FROM photos
      WHERE post_id = ?
        AND active = 1
      ORDER BY id ASC
      `,
      [postId]
    );

    // 3) Rating medio y total
    const [ratingRows] = await pool.query(
      `
      SELECT
        ROUND(AVG(rating), 1) AS avg_rating,
        COUNT(*) AS ratings_count
      FROM ratings
      WHERE post_id = ?
        AND active = 1
        AND deleted_at IS NULL
      `,
      [postId]
    );

    const avg_rating =
      ratingRows[0]?.avg_rating !== null && ratingRows[0]?.avg_rating !== undefined
        ? Number(ratingRows[0].avg_rating)
        : 0;

    const ratings_count = Number(ratingRows[0]?.ratings_count || 0);

    // 4) Comentarios
    const [commentRows] = await pool.query(
      `
      SELECT
        c.id,
        c.comment,
        c.created_at,
        u.id AS user_id,
        u.name,
        u.surname,
        u.profile_image
      FROM post_comments c
      JOIN users u
        ON u.id = c.user_id
      WHERE c.post_id = ?
        AND c.active = 1
        AND c.deleted_at IS NULL
        AND u.active = 1
        AND u.deleted_at IS NULL
      ORDER BY c.created_at DESC, c.id DESC
      `,
      [postId]
    );

    return res.json({
      ok: true,
      data: {
        ...post,
        avg_rating,
        ratings_count,
        photos: photoRows,
        comments: commentRows
      }
    });
  } catch (err) {
    console.error("GET /api/posts/:id error:", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * DELETE /api/posts/:id
 * Auth: Sí (JWT)
 * Params: id (post_id)
 * Borrado lógico del post: solo autor o admin.
 * Response: { ok, message }
 */
router.delete("/:id", auth, async (req, res) => {
  try {
    const postId = Number(req.params.id);
    if (!Number.isInteger(postId)) {
      return res.status(400).json({ ok: false, message: "Invalid post id" });
    }

    const [rows] = await pool.query(
      `SELECT id, user_id
       FROM posts
       WHERE id = ? AND deleted_at IS NULL
       LIMIT 1`,
      [postId]
    );

    const post = rows[0];
    if (!post) return res.status(404).json({ ok: false, message: "Post not found" });

    const isOwner = post.user_id === req.user.id;
    const isAdmin = req.user.admin === 1 || req.user.admin === true;

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ ok: false, message: "Forbidden" });
    }

    await pool.query(
      `UPDATE posts
       SET deleted_at = NOW(), active = 0
       WHERE id = ?`,
      [postId]
    );

    return res.json({ ok: true, message: "Post deleted" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * POST /api/posts/:id/comments
 * Auth: Sí
 * Params: id (post_id)
 * Body: { comment }
 * Crea un comentario en un post.
 * Response: { ok, message, data: comment }
 */
router.post("/:id/comments", auth, async (req, res) => {
  try {
    const postId = Number(req.params.id);
    if (!Number.isInteger(postId) || postId <= 0) {
      return res.status(400).json({ ok: false, message: "Invalid post id" });
    }

    const { comment } = req.body || {};

    if (typeof comment !== "string" || !comment.trim()) {
      return res.status(400).json({ ok: false, message: "Comment is required" });
    }

    const cleanComment = comment.trim();

    if (cleanComment.length > 1000) {
      return res.status(400).json({ ok: false, message: "Comment is too long" });
    }

    const [postRows] = await pool.query(
      `
      SELECT p.id
      FROM posts p
      JOIN users u ON u.id = p.user_id
      WHERE p.id = ?
        AND p.active = 1
        AND p.deleted_at IS NULL
        AND u.active = 1
        AND u.deleted_at IS NULL
      LIMIT 1
      `,
      [postId]
    );

    if (postRows.length === 0) {
      return res.status(404).json({ ok: false, message: "Post not found" });
    }

    const [result] = await pool.query(
      `
      INSERT INTO post_comments (
        post_id,
        user_id,
        comment,
        active,
        created_at,
        updated_at,
        deleted_at
      )
      VALUES (?, ?, ?, 1, NOW(), NOW(), NULL)
      `,
      [postId, req.user.id, cleanComment]
    );

    const commentId = result.insertId;

    const [rows] = await pool.query(
      `
      SELECT
        c.id,
        c.comment,
        c.created_at,
        u.id AS user_id,
        u.name,
        u.surname,
        u.profile_image
      FROM post_comments c
      JOIN users u
        ON u.id = c.user_id
      WHERE c.id = ?
      LIMIT 1
      `,
      [commentId]
    );

    return res.status(201).json({
      ok: true,
      message: "Comment created",
      data: rows[0]
    });
  } catch (err) {
    console.error("POST /api/posts/:id/comments error:", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * PATCH /api/posts/comments/:commentId
 * Auth: Sí
 * Body: { comment }
 */
router.patch("/comments/:commentId", auth, async (req, res) => {
  try {
    const commentId = Number(req.params.commentId);
    if (!Number.isInteger(commentId) || commentId <= 0) {
      return res.status(400).json({ ok: false, message: "Invalid comment id" });
    }

    const { comment } = req.body || {};
    if (typeof comment !== "string" || !comment.trim()) {
      return res.status(400).json({ ok: false, message: "Comment is required" });
    }

    const cleanComment = comment.trim();

    if (cleanComment.length > 1000) {
      return res.status(400).json({ ok: false, message: "Comment is too long" });
    }

    const [rows] = await pool.query(
      `
      SELECT id, user_id
      FROM post_comments
      WHERE id = ?
        AND active = 1
        AND deleted_at IS NULL
      LIMIT 1
      `,
      [commentId]
    );

    const existing = rows[0];
    if (!existing) {
      return res.status(404).json({ ok: false, message: "Comment not found" });
    }

    if (existing.user_id !== req.user.id && !req.user.admin) {
      return res.status(403).json({ ok: false, message: "Forbidden" });
    }

    await pool.query(
      `
      UPDATE post_comments
      SET comment = ?,
          updated_at = NOW()
      WHERE id = ?
      `,
      [cleanComment, commentId]
    );

    const [updatedRows] = await pool.query(
      `
      SELECT
        c.id,
        c.comment,
        c.created_at,
        c.updated_at,
        u.id AS user_id,
        u.name,
        u.surname,
        u.profile_image
      FROM post_comments c
      JOIN users u
        ON u.id = c.user_id
      WHERE c.id = ?
      LIMIT 1
      `,
      [commentId]
    );

    return res.json({
      ok: true,
      message: "Comment updated",
      data: updatedRows[0]
    });
  } catch (err) {
    console.error("PATCH /api/posts/comments/:commentId error:", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * DELETE /api/posts/comments/:commentId
 * Auth: Sí
 */
router.delete("/comments/:commentId", auth, async (req, res) => {
  try {
    const commentId = Number(req.params.commentId);
    if (!Number.isInteger(commentId) || commentId <= 0) {
      return res.status(400).json({ ok: false, message: "Invalid comment id" });
    }

    const [rows] = await pool.query(
      `
      SELECT id, user_id
      FROM post_comments
      WHERE id = ?
        AND active = 1
        AND deleted_at IS NULL
      LIMIT 1
      `,
      [commentId]
    );

    const existing = rows[0];
    if (!existing) {
      return res.status(404).json({ ok: false, message: "Comment not found" });
    }

    if (existing.user_id !== req.user.id && !req.user.admin) {
      return res.status(403).json({ ok: false, message: "Forbidden" });
    }

    await pool.query(
      `
      UPDATE post_comments
      SET active = 0,
          deleted_at = NOW(),
          updated_at = NOW()
      WHERE id = ?
      `,
      [commentId]
    );

    return res.json({
      ok: true,
      message: "Comment deleted"
    });
  } catch (err) {
    console.error("DELETE /api/posts/comments/:commentId error:", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * POST /api/posts/:id/rating
 * Auth: Sí
 * Body: { rating }
 * Crea o actualiza la puntuación del usuario sobre un post.
 */
router.post("/:id/rating", auth, async (req, res) => {
  try {
    const postId = Number(req.params.id);
    if (!Number.isInteger(postId) || postId <= 0) {
      return res.status(400).json({ ok: false, message: "Invalid post id" });
    }

    const rating = Number(req.body?.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ ok: false, message: "Rating must be an integer between 1 and 5" });
    }

    const [postRows] = await pool.query(
      `
      SELECT p.id, p.user_id
      FROM posts p
      JOIN users u ON u.id = p.user_id
      WHERE p.id = ?
        AND p.active = 1
        AND p.deleted_at IS NULL
        AND u.active = 1
        AND u.deleted_at IS NULL
      LIMIT 1
      `,
      [postId]
    );

    const post = postRows[0];
    if (!post) {
      return res.status(404).json({ ok: false, message: "Post not found" });
    }

    if (post.user_id === req.user.id) {
      return res.status(403).json({ ok: false, message: "You cannot rate your own post" });
    }

    const [existingRows] = await pool.query(
      `
      SELECT id
      FROM ratings
      WHERE post_id = ?
        AND user_id = ?
      LIMIT 1
      `,
      [postId, req.user.id]
    );

    if (existingRows.length > 0) {
      await pool.query(
        `
        UPDATE ratings
        SET rating = ?,
            active = 1,
            deleted_at = NULL,
            updated_at = NOW()
        WHERE id = ?
        `,
        [rating, existingRows[0].id]
      );
    } else {
      await pool.query(
        `
        INSERT INTO ratings (
          post_id,
          user_id,
          rating,
          active,
          created_at,
          updated_at,
          deleted_at
        )
        VALUES (?, ?, ?, 1, NOW(), NOW(), NULL)
        `,
        [postId, req.user.id, rating]
      );
    }

    const [summaryRows] = await pool.query(
      `
      SELECT
        ROUND(AVG(rating), 1) AS avg_rating,
        COUNT(*) AS ratings_count
      FROM ratings
      WHERE post_id = ?
        AND active = 1
        AND deleted_at IS NULL
      `,
      [postId]
    );

    return res.json({
      ok: true,
      message: "Rating saved",
      data: {
        my_rating: rating,
        avg_rating:
          summaryRows[0]?.avg_rating !== null && summaryRows[0]?.avg_rating !== undefined
            ? Number(summaryRows[0].avg_rating)
            : 0,
        ratings_count: Number(summaryRows[0]?.ratings_count || 0)
      }
    });
  } catch (err) {
    console.error("POST /api/posts/:id/rating error:", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * GET /api/posts/:id/my-rating
 * Auth: Sí
 * Devuelve la puntuación del usuario autenticado para ese post.
 * Response: { ok, data: { my_rating } }
 */
router.get("/:id/my-rating", auth, async (req, res) => {
  try {
    const postId = Number(req.params.id);

    if (!Number.isInteger(postId) || postId <= 0) {
      return res.status(400).json({ ok: false, message: "Invalid post id" });
    }

    const [rows] = await pool.query(
      `
      SELECT rating
      FROM ratings
      WHERE post_id = ?
        AND user_id = ?
        AND active = 1
        AND deleted_at IS NULL
      LIMIT 1
      `,
      [postId, req.user.id]
    );

    const my_rating = rows.length > 0 ? Number(rows[0].rating) : 0;

    return res.json({
      ok: true,
      data: { my_rating }
    });
  } catch (err) {
    console.error("GET /api/posts/:id/my-rating error:", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

module.exports = router;
