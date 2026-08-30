/**
 * @file Multi-Value URL-Encoded Form Body Parser
 *
 * Implements deterministic parsing for `application/x-www-form-urlencoded` payloads,
 * correctly preserving multiple form inputs sharing the same field name (e.g. checkbox arrays).
 */

/**
 * Parses an `application/x-www-form-urlencoded` string into an object,
 * preserving arrays for repeated keys and scalar strings for single keys.
 *
 * @param {string|unknown} bodyStr Raw form URL-encoded body
 * @returns {Record<string, string|string[]>} Parsed key-value mapping
 */
export function parseFormBody(bodyStr) {
  if (typeof bodyStr !== 'string' || !bodyStr.trim()) {
    return {};
  }

  const params = new URLSearchParams(bodyStr);
  const result = {};

  for (const [key, value] of params.entries()) {
    if (Object.prototype.hasOwnProperty.call(result, key)) {
      if (Array.isArray(result[key])) {
        result[key].push(value);
      } else {
        result[key] = [result[key], value];
      }
    } else {
      result[key] = value;
    }
  }

  return result;
}
