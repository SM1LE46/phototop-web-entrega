const express = require("express");
const pool = require("../db");

const router = express.Router();

/**
 * GET /api/search/posts
 * Auth: No
 * Query:
 *  - q: string (optional)            -> busca en title y description
 *  - user_id: number (optional)      -> filtra posts de un usuario
 *  - category_id: number (optional)  -> filtra por categoría del post
 *  - page: number (default 1)
 *  - limit: number (default 10, max 50)
 * Reglas:
 *  - Si no viene q ni filtros, devuelve 400 para evitar listar todo sin querer.
 * Response: { ok, data: { q, user_id, category_id, page, limit, total, results } }
 */
router.get("/posts", async (req, res) => {
  try {
    const q = (req.query.q || "").toString().trim();
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
    const offset = (page - 1) * limit;

    const userId = req.query.user_id !== undefined ? Number(req.query.user_id) : null;
    if (req.query.user_id !== undefined && !Number.isInteger(userId)) {
      return res.status(400).json({ ok: false, message: "Invalid user_id" });
    }

    const categoryId = req.query.category_id !== undefined ? Number(req.query.category_id) : null;
    if (req.query.category_id !== undefined && !Number.isInteger(categoryId)) {
      return res.status(400).json({ ok: false, message: "Invalid category_id" });
    }

    if (!q && userId === null && categoryId === null) {
      return res.status(400).json({ ok: false, message: "Provide q or a filter (user_id/category_id)" });
    }

    const where = [];
    const params = [];

    where.push("p.active = 1");
    where.push("p.deleted_at IS NULL");
    where.push("u.active = 1");
    where.push("u.deleted_at IS NULL");

    if (categoryId !== null) {
      where.push("p.category_id = ?");
      params.push(categoryId);
    }

    if (q) {
      where.push("(p.title LIKE ? OR p.description LIKE ?)");
      params.push(`%${q}%`, `%${q}%`);
    }

    if (userId !== null) {
      where.push("p.user_id = ?");
      params.push(userId);
    }

    const whereSql = `WHERE ${where.join(" AND ")}`;

    const [countRows] = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM posts p
      JOIN users u ON u.id = p.user_id
      ${whereSql}
      `,
      params
    );

    const total = Number(countRows[0].total) || 0;

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
        u.surname
      FROM posts p
      JOIN users u ON u.id = p.user_id
      ${whereSql}
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
      `,
      [...params, limit, offset]
    );

    return res.json({
      ok: true,
      data: { q: q || null, user_id: userId, category_id: categoryId, page, limit, total, results: rows },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * GET /api/search/users
 * Auth: No
 * Query:
 *  - q: string (optional) -> busca en name, surname, email
 *  - province_id: number (optional)
 *  - type: photographer|model|all (default all)
 *  - category_ids: "1,2,3" (optional)
 *  - category_mode: any|all (default any)
 *  - min_rating: number (optional, 0..5)
 *  - exclude_user_id: number (optional)
 *  - page: number (default 1)
 *  - limit: number (default 10, max 50)
 *
 * Reglas:
 *  - Si no viene ningún filtro, devuelve 400 para evitar listar todo.
 *  - category_ids solo aplica a fotógrafos (forzamos u.photographer=1).
 *  - Si category_mode=all, el usuario debe tener todas las categorías indicadas.
 *
 * Response: { ok, data: { q, province_id, type, category_ids, category_mode, min_rating, page, limit, total, results } }
 */
router.get("/users", async (req, res) => {
  try {
    const q = (req.query.q || "").toString().trim();

    const provinceId = req.query.province_id !== undefined ? Number(req.query.province_id) : null;
    if (req.query.province_id !== undefined && !Number.isInteger(provinceId)) {
      return res.status(400).json({ ok: false, message: "Invalid province_id" });
    }

    const type = (req.query.type || "all").toString().trim().toLowerCase();
    if (!["all", "photographer", "model"].includes(type)) {
      return res.status(400).json({ ok: false, message: "Invalid type (all|photographer|model)" });
    }

    const categoryMode = (req.query.category_mode || "any").toString().trim().toLowerCase();
    if (!["any", "all"].includes(categoryMode)) {
      return res.status(400).json({ ok: false, message: "Invalid category_mode (any|all)" });
    }

    const minRating = req.query.min_rating !== undefined ? Number(req.query.min_rating) : null;
    if (req.query.min_rating !== undefined && (Number.isNaN(minRating) || minRating < 0 || minRating > 5)) {
      return res.status(400).json({ ok: false, message: "Invalid min_rating (0..5)" });
    }

    let categoryIds = null;
    if (req.query.category_ids !== undefined && req.query.category_ids !== null && String(req.query.category_ids).trim() !== "") {
      const raw = String(req.query.category_ids).split(",").map(s => s.trim()).filter(Boolean);
      const nums = raw.map(Number);
      if (nums.length === 0 || nums.some(n => !Number.isInteger(n) || n <= 0)) {
        return res.status(400).json({ ok: false, message: "Invalid category_ids (comma-separated integers)" });
      }
      categoryIds = [...new Set(nums)];
    }

    const excludeUserId = req.query.exclude_user_id !== undefined ? Number(req.query.exclude_user_id) : null;
    if (req.query.exclude_user_id !== undefined && !Number.isInteger(excludeUserId)) {
      return res.status(400).json({ ok: false, message: "Invalid exclude_user_id" });
    }

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
    const offset = (page - 1) * limit;

    const hasAnyFilter =
      !!q ||
      provinceId !== null ||
      type !== "all" ||
      (categoryIds && categoryIds.length > 0) ||
      minRating !== null;

    if (!hasAnyFilter) {
      return res.status(400).json({
        ok: false,
        message: "Provide at least one filter (q/province_id/type/category_ids/min_rating)"
      });
    }

    const where = [];
    const params = [];
    const having = [];

    where.push("u.active = 1");
    where.push("u.deleted_at IS NULL");

    if (q) {
      where.push("(u.name LIKE ? OR u.surname LIKE ? OR u.email LIKE ?)");
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }

    if (provinceId !== null) {
      where.push("u.province_id = ?");
      params.push(provinceId);
    }

    if (excludeUserId !== null) {
      where.push("u.id <> ?");
      params.push(excludeUserId);
    }

    if (type === "photographer") where.push("u.photographer = 1");
    if (type === "model") where.push("u.model = 1");

    let categoryJoinSql = "";

    if (categoryIds && categoryIds.length > 0) {
      where.push("u.photographer = 1");

      categoryJoinSql = `
        JOIN user_categories uc ON uc.user_id = u.id
        JOIN categories c ON c.id = uc.category_id
      `;

      where.push("uc.active = 1 AND uc.deleted_at IS NULL");
      where.push("c.active = 1 AND c.deleted_at IS NULL");
      where.push(`uc.category_id IN (${categoryIds.map(() => "?").join(",")})`);
      params.push(...categoryIds);

      if (categoryMode === "all") {
        having.push(`COUNT(DISTINCT uc.category_id) = ${categoryIds.length}`);
      }
    }

    if (minRating !== null) {
      where.push("COALESCE(ur.avg_rating, 0) >= ?");
      params.push(minRating);
    }

    const havingSql = having.length ? `HAVING ${having.join(" AND ")}` : "";

    const provinceJoinSql = `
      LEFT JOIN provinces p ON p.id = u.province_id
    `;

    const publicCategoriesJoinSql = `
      LEFT JOIN user_categories uc_all
        ON uc_all.user_id = u.id
       AND uc_all.active = 1
       AND uc_all.deleted_at IS NULL
      LEFT JOIN categories c_all
        ON c_all.id = uc_all.category_id
       AND c_all.active = 1
       AND c_all.deleted_at IS NULL
    `;

    const ratingSubquery = `
      LEFT JOIN (
        SELECT p.user_id, AVG(r.rating) AS avg_rating, COUNT(*) AS ratings_count
        FROM posts p
        JOIN ratings r ON r.post_id = p.id
        WHERE p.active = 1 AND p.deleted_at IS NULL
          AND r.active = 1 AND r.deleted_at IS NULL
        GROUP BY p.user_id
      ) ur ON ur.user_id = u.id
    `;

    const whereSql = `WHERE ${where.join(" AND ")}`;

    const [countRows] = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM (
        SELECT u.id, ur.avg_rating
        FROM users u
        ${provinceJoinSql}
        ${categoryJoinSql}
        ${ratingSubquery}
        ${whereSql}
        GROUP BY u.id, ur.avg_rating
        ${havingSql}
      ) t
      `,
      params
    );

    const total = Number(countRows[0]?.total) || 0;

    const [rows] = await pool.query(
      `
      SELECT
        u.id,
        u.name,
        u.surname,
        u.email,
        u.profile_image,
        u.description,
        u.province_id,
        p.name AS province_name,
        u.photographer,
        u.model,
        ROUND(COALESCE(ur.avg_rating, 0), 1) AS avg_rating,
        COALESCE(ur.ratings_count, 0) AS ratings_count,
        GROUP_CONCAT(DISTINCT c_all.name ORDER BY c_all.name SEPARATOR ', ') AS categories
      FROM users u
      ${provinceJoinSql}
      ${categoryJoinSql}
      ${publicCategoriesJoinSql}
      ${ratingSubquery}
      ${whereSql}
      GROUP BY u.id, ur.avg_rating, ur.ratings_count
      ${havingSql}
      ORDER BY avg_rating DESC, u.id DESC
      LIMIT ? OFFSET ?
      `,
      [...params, limit, offset]
    );

    return res.json({
      ok: true,
      data: {
        q: q || null,
        province_id: provinceId,
        type,
        category_ids: categoryIds,
        category_mode: categoryMode,
        min_rating: minRating,
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

module.exports = router;
