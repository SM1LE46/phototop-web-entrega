const { verifyToken } = require("../utils/jwt");

/**
 * Middleware JWT Auth
 * - Lee header Authorization: Bearer <token>
 * - Verifica JWT
 * - Inyecta req.user = { id, admin, photographer, model }
 * - Si falla, responde 401
 */
module.exports = function auth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    if (!header.startsWith("Bearer ")) {
      return res.status(401).json({ ok: false, message: "Missing or invalid Authorization header" });
    }

    const token = header.slice("Bearer ".length).trim();
    if (!token) {
      return res.status(401).json({ ok: false, message: "Missing token" });
    }

    const payload = verifyToken(token);

    req.user = {
      id: Number(payload.id),
      admin: payload.admin ? 1 : 0,
      photographer: payload.photographer ? 1 : 0,
      model: payload.model ? 1 : 0,
    };

    if (!Number.isInteger(req.user.id)) {
      return res.status(401).json({ ok: false, message: "Invalid token payload" });
    }

    return next();
  } catch (err) {
    return res.status(401).json({ ok: false, message: "Invalid or expired token" });
  }
};
