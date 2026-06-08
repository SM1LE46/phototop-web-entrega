const express = require("express");
const pool = require("../db");
const auth = require("../middlewares/auth");

const router = express.Router();

/**
 * Utilidad: comprueba si hay bloqueo activo en cualquier dirección entre dos usuarios.
 * Regla: si A bloquea a B o B bloquea a A, NO se permite mensajería.
 */
async function isBlocked(userAId, userBId) {
  const [rows] = await pool.query(
    `SELECT id
     FROM user_blocks
     WHERE active = 1 AND deleted_at IS NULL
       AND ((blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?))
     LIMIT 1`,
    [userAId, userBId, userBId, userAId]
  );
  return rows.length > 0;
}

async function hasActiveBlock(blockerId, blockedId) {
  const [rows] = await pool.query(
    `
    SELECT id
    FROM user_blocks
    WHERE blocker_id = ? AND blocked_id = ?
      AND active = 1 AND deleted_at IS NULL
    LIMIT 1
    `,
    [blockerId, blockedId]
  );
  return rows.length > 0;
}

/**
 * GET /api/messages/conversations
 * Auth: Sí (JWT)
 * Devuelve listado de conversaciones del usuario autenticado con:
 * - other_user (id, name, surname, profile_image)
 * - last_message (id, body, created_at, from_me)
 * - unread_count (mensajes recibidos sin read_at)
 */
router.get("/conversations", auth, async (req, res) => {
  try {
    const me = req.user.id;

    const [rows] = await pool.query(
      `
      WITH visible AS (
        SELECT
          m.*,
          CASE WHEN m.sender_id = ? THEN m.receiver_id ELSE m.sender_id END AS other_id
        FROM messages m
        WHERE m.active = 1 AND m.deleted_at IS NULL
          AND (
            (m.sender_id = ? AND m.sender_deleted_at IS NULL)
            OR
            (m.receiver_id = ? AND m.receiver_deleted_at IS NULL)
          )
      ),
      last_msg AS (
        SELECT
          v.*,
          ROW_NUMBER() OVER (PARTITION BY v.other_id ORDER BY v.created_at DESC, v.id DESC) AS rn
        FROM visible v
      ),
      unread AS (
        SELECT
          sender_id AS other_id,
          COUNT(*) AS unread_count
        FROM messages
        WHERE active = 1 AND deleted_at IS NULL
          AND receiver_id = ?               -- YO RECIBO
          AND receiver_deleted_at IS NULL
          AND read_at IS NULL               -- NO LEÍDO POR MÍ
        GROUP BY sender_id
      )
      SELECT
        u.id AS other_user_id,
        u.name AS other_user_name,
        u.surname AS other_user_surname,
        u.profile_image AS other_user_profile_image,

        lm.id AS last_message_id,
        lm.body AS last_message_body,
        lm.created_at AS last_message_created_at,
        CASE WHEN lm.sender_id = ? THEN 1 ELSE 0 END AS last_message_from_me,

        COALESCE(unread.unread_count, 0) AS unread_count
      FROM last_msg lm
      JOIN users u ON u.id = lm.other_id
      LEFT JOIN unread ON unread.other_id = lm.other_id
      WHERE lm.rn = 1
        AND u.active = 1 AND u.deleted_at IS NULL
      ORDER BY lm.created_at DESC, lm.id DESC
      `,
      [me, me, me, me, me]
    );

    const data = rows.map(r => ({
      other_user: {
        id: r.other_user_id,
        name: r.other_user_name,
        surname: r.other_user_surname,
        profile_image: r.other_user_profile_image,
      },
      last_message: {
        id: r.last_message_id,
        body: r.last_message_body,
        created_at: r.last_message_created_at,
        from_me: !!r.last_message_from_me,
      },
      unread_count: Number(r.unread_count || 0),
    }));

    return res.json({ ok: true, data });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * GET /api/messages/with/:userId
 * Auth: Sí (JWT)
 * Query: ?limit=30&before_id=123 (opcional)
 * Devuelve mensajes entre el usuario autenticado y :userId.
 * Además:
 * - Marca como leídos los mensajes recibidos.
 * - Informa si existe bloqueo activo (blocked=true/false).
 */
router.get("/with/:userId", auth, async (req, res) => {
  try {
    const me = req.user.id;
    const otherId = Number(req.params.userId);

    if (!Number.isInteger(otherId) || otherId <= 0) {
      return res.status(400).json({ ok: false, message: "Invalid user id" });
    }
    if (otherId === me) {
      return res.status(400).json({ ok: false, message: "Cannot open conversation with yourself" });
    }

    // Comprobamos bloqueo SOLO para informar
    const blocked = await isBlocked(me, otherId);

    const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
    const beforeId = req.query.before_id !== undefined ? Number(req.query.before_id) : null;
    if (beforeId !== null && (!Number.isInteger(beforeId) || beforeId <= 0)) {
      return res.status(400).json({ ok: false, message: "Invalid before_id" });
    }

    // Marcar como leídos los mensajes recibidos de otherId
    await pool.query(
      `UPDATE messages
       SET read_at = COALESCE(read_at, NOW())
       WHERE receiver_id = ?
         AND sender_id = ?
         AND active = 1 AND deleted_at IS NULL
         AND receiver_deleted_at IS NULL
         AND read_at IS NULL`,
      [me, otherId]
    );

    const params = [me, otherId, otherId, me];
    let beforeSql = "";
    if (beforeId !== null) {
      beforeSql = " AND m.id < ? ";
      params.push(beforeId);
    }

    const [rows] = await pool.query(
      `
      SELECT
        m.id,
        m.sender_id,
        m.receiver_id,
        m.body,
        m.created_at,
        m.read_at
      FROM messages m
      WHERE m.active = 1 AND m.deleted_at IS NULL
        AND (
          (m.sender_id = ? AND m.receiver_id = ? AND m.sender_deleted_at IS NULL)
          OR
          (m.sender_id = ? AND m.receiver_id = ? AND m.receiver_deleted_at IS NULL)
        )
        ${beforeSql}
      ORDER BY m.id DESC
      LIMIT ${limit}
      `,
      params
    );

    rows.reverse(); // orden cronológico ASC

    return res.json({
      ok: true,
      data: {
        blocked,
        messages: rows,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * POST /api/messages/with/:userId
 * Auth: Sí (JWT)
 * Body: { body: string }
 * Regla:
 * - Si YO he bloqueado a otherId => NO puedo enviar (403).
 * - Si otherId me ha bloqueado => puedo enviar, pero el mensaje queda oculto para otherId.
 */
router.post("/with/:userId", auth, async (req, res) => {
  try {
    const me = req.user.id;
    const otherId = Number(req.params.userId);

    if (!Number.isInteger(otherId) || otherId <= 0) {
      return res.status(400).json({ ok: false, message: "Invalid user id" });
    }
    if (otherId === me) {
      return res.status(400).json({ ok: false, message: "Cannot message yourself" });
    }

    const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
    if (!body) {
      return res.status(400).json({ ok: false, message: "Message body is required" });
    }
    if (body.length > 4000) {
      return res.status(400).json({ ok: false, message: "Message too long (max 4000)" });
    }

    // 1) Si YO he bloqueado al otro => NO puedo enviar
    if (await hasActiveBlock(me, otherId)) {
      return res.status(403).json({ ok: false, message: "You cannot message this user (you blocked them)" });
    }

    // 2) Si el otro me ha bloqueado => puedo enviar, pero el mensaje queda oculto para él
    const otherBlockedMe = await hasActiveBlock(otherId, me);

    const [result] = await pool.query(
      `
      INSERT INTO messages (sender_id, receiver_id, body, active, receiver_deleted_at)
      VALUES (?, ?, ?, 1, ?)
      `,
      [me, otherId, body, otherBlockedMe ? new Date() : null]
    );

    const [createdRows] = await pool.query(
      `
      SELECT id, sender_id, receiver_id, body, read_at, created_at
      FROM messages
      WHERE id = ?
      LIMIT 1
      `,
      [result.insertId]
    );

    return res.status(201).json({
      ok: true,
      message: "Message sent",
      data: {
        ...createdRows[0],
        delivered: otherBlockedMe ? 0 : 1
      }
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

/**
 * DELETE /api/messages/:id
 * Auth: Sí (JWT)
 * Borrado por usuario: oculta el mensaje para el que lo elimina.
 */
router.delete("/:id", auth, async (req, res) => {
  try {
    const me = req.user.id;
    const messageId = Number(req.params.id);
    if (!Number.isInteger(messageId) || messageId <= 0) {
      return res.status(400).json({ ok: false, message: "Invalid message id" });
    }

    const [rows] = await pool.query(
      `SELECT id, sender_id, receiver_id
       FROM messages
       WHERE id = ?
         AND active = 1 AND deleted_at IS NULL
       LIMIT 1`,
      [messageId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ ok: false, message: "Message not found" });
    }

    const msg = rows[0];
    if (msg.sender_id !== me && msg.receiver_id !== me) {
      return res.status(403).json({ ok: false, message: "Not allowed" });
    }

    if (msg.sender_id === me) {
      await pool.query(
        `UPDATE messages SET sender_deleted_at = NOW()
         WHERE id = ?`,
        [messageId]
      );
    } else {
      await pool.query(
        `UPDATE messages SET receiver_deleted_at = NOW()
         WHERE id = ?`,
        [messageId]
      );
    }

    return res.json({ ok: true, message: "Message deleted for user" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

module.exports = router;
