/**
 * Valida formato de email.
 * @param {string} email
 * @returns {boolean}
 */
function isValidEmail(email) {
  if (typeof email !== "string") return false;

  // Regex simple y suficiente para proyectos web
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email.trim().toLowerCase());
}

/**
 * Valida que un valor sea un string no vacío (tras trim).
 * @param {any} value
 * @returns {boolean}
 */
function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Valida que un valor sea un entero positivo.
 * @param {any} value
 * @returns {boolean}
 */
function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

/**
 * Valida que un array contenga solo enteros.
 * @param {any} arr
 * @returns {boolean}
 */
function isIntegerArray(arr) {
  return Array.isArray(arr) && arr.every(Number.isInteger);
}

module.exports = {
  isValidEmail,
  isNonEmptyString,
  isPositiveInteger,
  isIntegerArray,
};
