const express = require("express");
const bcrypt = require("bcrypt");
const pool = require("../db");
const { signToken } = require("../utils/jwt");
const auth = require("../middlewares/auth");
const { isValidEmail } = require("../utils/validators");

const router = express.Router();

/**
 * POST /api/auth/register
 * Auth: No
 * Body:
 *  - name: string
 *  - surname: string
 *  - email: string
 *  - password: string
 *  - province_id: number
 *  - description: string opcional
 *  - photographer: boolean opcional
 *  - model: boolean opcional
 *  - category_ids: number[] opcional
 * Registra un nuevo usuario en la aplicación.
 * Response: { ok, message, data: { token, user } }
 */
router.post("/register", async (req, res) => {
  try {
    const {
      name,
      surname,
      email,
      password,
      province_id,
      description,
      photographer,
      model,
      category_ids
    } = req.body || {};

    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({
        ok: false,
        message: "Name is required",
      });
    }

    if (typeof surname !== "string" || !surname.trim()) {
      return res.status(400).json({
        ok: false,
        message: "Surname is required",
      });
    }

    if (typeof email !== "string" || !email.trim()) {
      return res.status(400).json({
        ok: false,
        message: "Email is required",
      });
    }

    if (province_id === undefined || province_id === null || province_id === "") {
      return res.status(400).json({
        ok: false,
        message: "Province is required",
      });
    }

    if (typeof password !== "string" || !password) {
      return res.status(400).json({
        ok: false,
        message: "Password is required",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({
        ok: false,
        message: "Invalid email",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        ok: false,
        message: "Password must be at least 6 characters",
      });
    }

    const [exists] = await pool.query(
      "SELECT id FROM users WHERE email = ? LIMIT 1",
      [normalizedEmail]
    );

    if (exists.length > 0) {
      return res.status(409).json({ ok: false, message: "Email already in use" });
    }

    const pid = Number(province_id);

    if (!Number.isInteger(pid)) {
      return res.status(400).json({
        ok: false,
        message: "Invalid province_id",
      });
    }

    const [provRows] = await pool.query(
      `SELECT id
        FROM provinces
        WHERE id = ?
          AND active = 1
        LIMIT 1`,
      [pid]
    );

    if (provRows.length === 0) {
      return res.status(400).json({
        ok: false,
        message: "Province not found",
      });
    }

    if (description !== undefined && description !== null && typeof description !== "string") {
      return res.status(400).json({ ok: false, message: "Invalid description" });
    }

    const cleanDescription =
      description === undefined || description === null
        ? null
        : description.trim() || null;

    const photographerValue = photographer ? 1 : 0;
    const modelValue = model ? 1 : 0;

    let cleanCategoryIds = [];

    if (category_ids !== undefined) {
      if (!Array.isArray(category_ids)) {
        return res.status(400).json({ ok: false, message: "category_ids must be an array" });
      }

      cleanCategoryIds = [...new Set(category_ids.map(Number))].filter(Number.isInteger);

      if (cleanCategoryIds.length !== category_ids.length) {
        return res.status(400).json({ ok: false, message: "category_ids must contain only integers" });
      }

      if (!photographerValue && cleanCategoryIds.length > 0) {
        return res.status(400).json({
          ok: false,
          message: "Only photographers can select categories"
        });
      }

      if (cleanCategoryIds.length > 0) {
        const [validRows] = await pool.query(
          `SELECT id
          FROM categories
          WHERE active = 1
            AND deleted_at IS NULL
            AND id IN (${cleanCategoryIds.map(() => "?").join(",")})`,
          cleanCategoryIds
        );

        if (validRows.length !== cleanCategoryIds.length) {
          return res.status(400).json({
            ok: false,
            message: "Some categories do not exist or are inactive"
          });
        }
      }
    }

    const hash = await bcrypt.hash(password, 10);

    const [result] = await pool.query(
      `INSERT INTO users
       (name, surname, email, password, province_id, description, admin, photographer, model, active)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, 1)`,
      [
        name.trim(),
        surname.trim(),
        normalizedEmail,
        hash,
        pid,
        cleanDescription,
        photographerValue,
        modelValue
      ]
    );

    const userId = result.insertId;

    if (photographerValue && cleanCategoryIds.length > 0) {
      const values = cleanCategoryIds.map((categoryId) => [userId, categoryId, 1, null]);

      await pool.query(
        `INSERT INTO user_categories (user_id, category_id, active, deleted_at)
        VALUES ?`,
        [values]
      );
    }

    const token = signToken({
      id: userId,
      admin: 0,
      photographer: photographerValue,
      model: modelValue,
    });

    return res.status(201).json({
      ok: true,
      message: "User registered",
      data: {
        token,
        user: {
          id: userId,
          name: name.trim(),
          surname: surname.trim(),
          email: normalizedEmail,
          province_id: pid,
          description: cleanDescription,
          admin: 0,
          photographer: photographerValue,
          model: modelValue,
          category_ids: cleanCategoryIds,
        },
      },
    });
  } catch (err) {
    if (err?.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ ok: false, message: "Email already in use" });
    }
    console.error(err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * POST /api/auth/login
 * Auth: No
 * Body: { email, password }
 * Autentica al usuario y devuelve JWT.
 * Response: { ok, data: { token, user } }
 */
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({
        ok: false,
        message: "Missing fields: email, password",
      });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ ok: false, message: "Invalid email" });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const [rows] = await pool.query(
      `SELECT id, name, surname, email, password,
              admin, photographer, model, active, deleted_at
       FROM users
       WHERE email = ?
       LIMIT 1`,
      [normalizedEmail]
    );

    const user = rows[0];
    if (!user) {
      return res.status(401).json({ ok: false, message: "Invalid credentials" });
    }

    if (user.active !== 1 || user.deleted_at) {
      return res.status(403).json({ ok: false, message: "Account disabled" });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ ok: false, message: "Invalid credentials" });
    }

    const token = signToken({
      id: user.id,
      admin: user.admin ? 1 : 0,
      photographer: user.photographer ? 1 : 0,
      model: user.model ? 1 : 0,
    });

    return res.json({
      ok: true,
      data: {
        token,
        user: {
          id: user.id,
          name: user.name,
          surname: user.surname,
          email: user.email,
          admin: user.admin,
          photographer: user.photographer,
          model: user.model,
        },
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * GET /api/auth/me
 * Auth: Sí (JWT)
 * Devuelve los datos del usuario autenticado.
 * Response: { ok, data: user }
 */
router.get("/me", auth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, name, surname, email,
              admin, photographer, model,
              profile_image, description, phone, province_id
       FROM users
       WHERE id = ?
         AND active = 1
         AND deleted_at IS NULL
       LIMIT 1`,
      [req.user.id]
    );

    const user = rows[0];
    if (!user) {
      return res.status(404).json({ ok: false, message: "User not found" });
    }

    return res.json({ ok: true, data: user });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

module.exports = router;
