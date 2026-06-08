const express = require("express");
const pool = require("../db");

const router = express.Router();

/**
 * GET /api/rankings/photographers
 * Auth: No
 *
 * Query:
 *  - period: monthly | yearly | global
 *  - year: number
 *  - month: number 1..12
 *  - province_id: number optional
 *  - category_id: number optional
 *  - page: number default 1
 *  - limit: number default 10 max 50
 *  - min_ratings: number default 1
 *
 * Ranking de fotógrafos según la media de valoraciones recibidas
 * en sus publicaciones.
 */
router.get("/photographers", async (req, res) => {
  try {
    const period = String(req.query.period || "monthly").toLowerCase();

    if (!["monthly", "yearly", "global"].includes(period)) {
      return res.status(400).json({
        ok: false,
        message: "Invalid period (monthly|yearly|global)"
      });
    }

    const now = new Date();

    const year = req.query.year !== undefined
      ? Number(req.query.year)
      : now.getFullYear();

    const month = req.query.month !== undefined
      ? Number(req.query.month)
      : now.getMonth() + 1;

    if (period !== "global") {
      if (!Number.isInteger(year) || year < 2000 || year > 2100) {
        return res.status(400).json({
          ok: false,
          message: "Invalid year"
        });
      }
    }

    if (period === "monthly") {
      if (!Number.isInteger(month) || month < 1 || month > 12) {
        return res.status(400).json({
          ok: false,
          message: "Invalid month"
        });
      }
    }

    const provinceId =
      req.query.province_id !== undefined &&
      req.query.province_id !== null &&
      String(req.query.province_id).trim() !== ""
        ? Number(req.query.province_id)
        : null;

    if (provinceId !== null && (!Number.isInteger(provinceId) || provinceId <= 0)) {
      return res.status(400).json({
        ok: false,
        message: "Invalid province_id"
      });
    }

    const categoryId =
      req.query.category_id !== undefined &&
      req.query.category_id !== null &&
      String(req.query.category_id).trim() !== ""
        ? Number(req.query.category_id)
        : null;

    if (categoryId !== null && (!Number.isInteger(categoryId) || categoryId <= 0)) {
      return res.status(400).json({
        ok: false,
        message: "Invalid category_id"
      });
    }

    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
    const offset = (page - 1) * limit;

    const minRatings = Math.min(50, Math.max(1, Number(req.query.min_ratings) || 1));

    const where = [
      "u.active = 1",
      "u.deleted_at IS NULL",
      "u.photographer = 1",
      "p.active = 1",
      "p.deleted_at IS NULL",
      "r.active = 1",
      "r.deleted_at IS NULL"
    ];

    const params = [];

    if (provinceId !== null) {
      where.push("u.province_id = ?");
      params.push(provinceId);
    }

    if (categoryId !== null) {
      where.push("p.category_id = ?");
      params.push(categoryId);
    }

    if (period === "monthly") {
      const start = `${year}-${String(month).padStart(2, "0")}-01`;

      let nextYear = year;
      let nextMonth = month + 1;

      if (nextMonth === 13) {
        nextMonth = 1;
        nextYear += 1;
      }

      const end = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;

      where.push("r.created_at >= ?");
      where.push("r.created_at < ?");
      params.push(start, end);
    }

    if (period === "yearly") {
      const start = `${year}-01-01`;
      const end = `${year + 1}-01-01`;

      where.push("r.created_at >= ?");
      where.push("r.created_at < ?");
      params.push(start, end);
    }

    const baseGroupedSql = `
      FROM users u

      JOIN posts p
        ON p.user_id = u.id

      JOIN ratings r
        ON r.post_id = p.id

      LEFT JOIN provinces pr
        ON pr.id = u.province_id

      WHERE ${where.join(" AND ")}

      GROUP BY
        u.id,
        u.name,
        u.surname,
        u.profile_image,
        u.description,
        u.province_id,
        pr.name

      HAVING COUNT(r.id) >= ?
    `;

    const [countRows] = await pool.query(
      `
      SELECT COUNT(*) AS total
      FROM (
        SELECT u.id
        ${baseGroupedSql}
      ) ranked_users
      `,
      [...params, minRatings]
    );

    const total = Number(countRows[0]?.total || 0);
    const totalPages = Math.max(1, Math.ceil(total / limit));

    const [rows] = await pool.query(
      `
      SELECT
        u.id,
        u.name,
        u.surname,
        u.profile_image,
        u.description,
        u.province_id,
        pr.name AS province_name,

        ROUND(AVG(r.rating), 2) AS avg_rating,
        COUNT(r.id) AS ratings_count,
        COUNT(DISTINCT p.id) AS rated_posts_count,

        MAX(r.created_at) AS last_rating_at

      ${baseGroupedSql}

      ORDER BY
        avg_rating DESC,
        ratings_count DESC,
        rated_posts_count DESC,
        last_rating_at DESC,
        u.id DESC

      LIMIT ? OFFSET ?
      `,
      [...params, minRatings, limit, offset]
    );

    return res.json({
      ok: true,
      data: {
        period,
        year: period === "global" ? null : year,
        month: period === "monthly" ? month : null,
        province_id: provinceId,
        category_id: categoryId,
        min_ratings: minRatings,
        page,
        limit,
        total,
        totalPages,
        results: rows.map((row, index) => ({
          position: offset + index + 1,
          id: row.id,
          name: row.name,
          surname: row.surname,
          profile_image: row.profile_image,
          description: row.description,
          province_id: row.province_id,
          province_name: row.province_name,
          avg_rating: Number(row.avg_rating || 0),
          ratings_count: Number(row.ratings_count || 0),
          rated_posts_count: Number(row.rated_posts_count || 0),
          last_rating_at: row.last_rating_at,
        }))
      }
    });
  } catch (err) {
    console.error("GET /api/rankings/photographers error:", err);
    return res.status(500).json({
      ok: false,
      message: "Server error"
    });
  }
});

module.exports = router;