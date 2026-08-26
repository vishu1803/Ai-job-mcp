/**
 * @file HTML escaping utility for safe server-side rendering.
 */

/**
 * Escapes unsafe characters in strings to prevent Cross-Site Scripting (XSS).
 *
 * @param {any} str Input value to escape
 * @returns {string} HTML-escaped string
 */
export function escapeHtml(str) {
  if (str === null || str === undefined) {
    return '';
  }
  const s = String(str);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
