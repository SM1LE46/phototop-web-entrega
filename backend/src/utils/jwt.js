const jwt = require("jsonwebtoken");

/**
 * Obtiene el secreto JWT desde entorno y valida que exista.
 * @returns {string}
 */
function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || typeof secret !== "string" || secret.trim().length < 16) {
    // 16 es una barrera mínima razonable para evitar secretos triviales
    throw new Error("JWT_SECRET is missing or too short (min 16 chars)");
  }
  return secret;
}

/**
 * Firma un token JWT.
 * @param {{id:number, admin:number|boolean, photographer:number|boolean, model:number|boolean}} payload
 * @returns {string}
 */
function signToken(payload) {
  const secret = getJwtSecret();
  const expiresIn = process.env.JWT_EXPIRES_IN || "7d"; // coherente con tu uso
  return jwt.sign(payload, secret, { expiresIn });
}

/**
 * Verifica un token JWT y devuelve el payload.
 * @param {string} token
 * @returns {any}
 */
function verifyToken(token) {
  const secret = getJwtSecret();
  return jwt.verify(token, secret);
}

module.exports = {
  signToken,
  verifyToken,
};
