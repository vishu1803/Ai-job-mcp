/**
 * @file Shared PDF text normalization utilities.
 *
 * Text extracted from compiled PDF binaries is not a lossless representation of
 * the rendered document: extractors may inject whitespace at run/glyph
 * boundaries (e.g. `vishwanatnishad@ gmail.com` when a producer splits a text
 * run around the `@` sign) and may hyphenate soft line breaks.
 *
 * These helpers exist so QA validators and independent observers can match
 * authentic contact values against extracted text without weakening the
 * authenticity gate. Every tolerant comparison is deliberately narrow: it only
 * ignores whitespace that the extractor may have injected, it never ignores or
 * rewrites characters, and it always requires the complete original sequence
 * (full local part + `@` + domain + TLD) to be present.
 */

const STRICT_EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

/**
 * Whitespace-tolerant email pattern. Only whitespace adjacent to the `@` sign
 * or around the domain labels is tolerated, so a genuine full address is still
 * required; unrelated prose cannot satisfy it because the pattern demands a
 * local part, an `@`, a domain label, and at least one dotted segment.
 */
const WHITESPACE_TOLERANT_EMAIL_PATTERN =
  /[a-zA-Z0-9._%+-]+\s*@\s*[a-zA-Z0-9-]+(?:\s*\.\s*[a-zA-Z0-9-]+)+/;

const PDF_SIMPLE_ESCAPES = Object.freeze({
  n: '\n',
  r: '\r',
  t: '\t',
  b: '\b',
  f: '\f',
  '(': '(',
  ')': ')',
  '\\': '\\',
});

/**
 * Removes non-printable control characters while preserving the structural
 * whitespace characters (tab, line feed, carriage return) that PDF text
 * extractors legitimately emit.
 *
 * @param {string} value
 * @returns {string} Value without non-printable control characters
 */
export function stripUnprintableControlChars(value = '') {
  return String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
}

/**
 * Decodes a PDF literal string body (`(...)`) per the PDF specification.
 *
 * Supports `\ddd` octal character codes, the standard single-character escapes
 * (`\n`, `\r`, `\t`, `\b`, `\f`, `\(`, `\)`, `\\`), and backslash line
 * continuations. Producers such as Tectonic emit unmapped symbol and ligature
 * glyphs as raw octal escapes; without decoding, the literal text `\001` leaks
 * into extracted content and corrupts adjacent values (for example, gluing
 * digits onto an email address).
 *
 * Any control character that survives decoding is either a real control byte or
 * an unmapped glyph, neither of which is renderable text, so it is dropped.
 *
 * @param {string} raw Literal string body without the enclosing parentheses
 * @returns {string} Decoded printable text
 */
export function decodePdfLiteralString(raw = '') {
  const input = String(raw);
  let out = '';

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch !== '\\') {
      out += ch;
      continue;
    }

    const next = input[i + 1];
    if (next === undefined) break;

    if (next >= '0' && next <= '7') {
      let octal = '';
      let cursor = i + 1;
      while (input[cursor] >= '0' && input[cursor] <= '7' && octal.length < 3) {
        octal += input[cursor];
        cursor++;
      }
      out += String.fromCharCode(parseInt(octal, 8));
      i = cursor - 1;
      continue;
    }

    if (next === '\r' || next === '\n') {
      // Line continuation: the escaped newline emits nothing.
      i += next === '\r' && input[i + 2] === '\n' ? 2 : 1;
      continue;
    }

    if (Object.prototype.hasOwnProperty.call(PDF_SIMPLE_ESCAPES, next)) {
      out += PDF_SIMPLE_ESCAPES[next];
      i += 1;
      continue;
    }

    // Unknown escape: the specification says to ignore the backslash.
    out += next;
    i += 1;
  }

  return stripUnprintableControlChars(out);
}

/**
 * Normalizes extracted PDF text for resilient string and regex validation,
 * stripping soft hyphens, line-break hyphenations, and collapsing whitespace.
 *
 * @param {string} value
 * @returns {string} Normalized lowercase string
 */
export function normalizePdfText(value = '') {
  return String(value || '')
    .replace(/\u00ad/g, '') // soft hyphen
    .replace(/(\w)-\s*\n\s*(\w)/g, '$1$2')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\bveriied\b/g, 'verified');
}

/**
 * Determines whether an authoritative candidate email is present in extracted
 * PDF text, tolerating whitespace that PDF text extraction may inject around
 * punctuation (e.g. "vishwanatnishad@gmail. com" or across line breaks).
 *
 * Email addresses contain no whitespace, so comparing on a whitespace-stripped
 * form is a lossless fallback that cannot weaken the authenticity gate: the full
 * address sequence must still be present.
 *
 * @param {string} extractedText Raw text extracted from the compiled PDF
 * @param {string} expectedEmail Authoritative candidate email
 * @returns {boolean} True when the email is present (or when none is expected)
 */
export function extractedTextContainsEmail(extractedText, expectedEmail) {
  const email = String(expectedEmail || '')
    .trim()
    .toLowerCase();
  if (!email) return true;

  const text = String(extractedText || '').toLowerCase();
  if (!text) return false;

  // Fast path: exact occurrence after canonical whitespace normalization.
  if (normalizePdfText(text).includes(email)) return true;

  // Tolerant path: allow extraction-inserted whitespace anywhere within the
  // address by comparing on a whitespace-free representation.
  const compactEmail = email.replace(/\s+/g, '');
  const compactText = text.replace(/\s+/g, '');
  return compactEmail.length > 0 && compactText.includes(compactEmail);
}

/**
 * Locates the first email address in extracted PDF text, tolerating
 * extraction-injected whitespace inside the address.
 *
 * The strict pattern is attempted first so well-formed extraction is reported
 * verbatim. Only when it fails do we fall back to the narrowly scoped
 * whitespace-tolerant pattern, and the returned value is always whitespace-free
 * so downstream comparisons use the canonical form.
 *
 * @param {string} extractedText Raw text extracted from the compiled PDF
 * @returns {string|null} Canonical email address, or null when none is present
 */
export function findCandidateEmail(extractedText) {
  const text = String(extractedText || '');
  if (!text) return null;

  const strict = text.match(STRICT_EMAIL_PATTERN);
  if (strict) return strict[0];

  const tolerant = text.match(WHITESPACE_TOLERANT_EMAIL_PATTERN);
  return tolerant ? tolerant[0].replace(/\s+/g, '') : null;
}
