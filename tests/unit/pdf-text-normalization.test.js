/**
 * @file Unit Tests: Shared PDF text normalization (contact matching).
 *
 * Covers the narrowly scoped tolerance for whitespace that PDF text extractors
 * inject inside contact values. The tolerance must never degrade into accepting
 * unrelated, truncated, or corrupt text.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePdfText,
  extractedTextContainsEmail,
  findCandidateEmail,
  decodePdfLiteralString,
  stripUnprintableControlChars,
} from '../../src/utils/pdf-text-normalization.js';

describe('PDF text normalization', () => {
  const canonicalEmail = 'vishwanatnishad@gmail.com';

  describe('decodePdfLiteralString', () => {
    it('decodes PDF octal escapes instead of leaking them as literal text', () => {
      // Tectonic emits unmapped symbol/ligature glyphs as raw octal escapes.
      // "\\001vishwanatnishad@gmail.com" must not glue a stray "001" onto the
      // local part of the address.
      assert.equal(
        decodePdfLiteralString('\\001vishwanatnishad@gmail.com'),
        'vishwanatnishad@gmail.com'
      );
      assert.equal(decodePdfLiteralString('+1-555-0199 \\001 foo'), '+1-555-0199  foo');
    });

    it('decodes standard single-character escapes and line continuations', () => {
      assert.equal(decodePdfLiteralString('a\\(b\\)c'), 'a(b)c');
      assert.equal(decodePdfLiteralString('back\\\\slash'), 'back\\slash');
      assert.equal(decodePdfLiteralString('line\nbreak'), 'line\nbreak');
      assert.equal(decodePdfLiteralString('continued\\\nnext'), 'continuednext');
    });

    it('drops unmapped non-printable control characters while keeping structural whitespace', () => {
      assert.equal(stripUnprintableControlChars('a\u0001b\u001fc'), 'abc');
      assert.equal(stripUnprintableControlChars('a\tb\nc\rd'), 'a\tb\nc\rd');
    });
  });

  describe('normalizePdfText', () => {
    it('strips soft hyphens, rejoins hyphenated line breaks, and collapses whitespace', () => {
      assert.equal(normalizePdfText('Cloud\u00adflare\n  Workers'), 'cloudflare workers');
      assert.equal(normalizePdfText('high-perform\u00adance'), 'high-performance');
      assert.equal(normalizePdfText('foo-\nbar'), 'foobar');
    });
  });

  describe('extractedTextContainsEmail', () => {
    it('accepts contiguous and extractor-whitespaced addresses', () => {
      assert.equal(extractedTextContainsEmail(`Contact ${canonicalEmail}`, canonicalEmail), true);
      assert.equal(
        extractedTextContainsEmail('Contact vishwanatnishad@ gmail.com', canonicalEmail),
        true
      );
      assert.equal(
        extractedTextContainsEmail('Contact vishwanatnishad@gmail. com', canonicalEmail),
        true
      );
      assert.equal(
        extractedTextContainsEmail('Contact vishwanatnis\nhad@gmail.com', canonicalEmail),
        true
      );
    });

    it('rejects missing, truncated, or altered addresses', () => {
      assert.equal(extractedTextContainsEmail('No contact details present', canonicalEmail), false);
      assert.equal(extractedTextContainsEmail('vishwanatnishad@gmail.co', canonicalEmail), false);
      assert.equal(extractedTextContainsEmail('vishwanatnishad@gmail.org', canonicalEmail), false);
      assert.equal(
        extractedTextContainsEmail('totally-different@example.com', canonicalEmail),
        false
      );
      assert.equal(extractedTextContainsEmail('', canonicalEmail), false);
    });

    it('treats an empty expectation as satisfied (no authoritative email configured)', () => {
      assert.equal(extractedTextContainsEmail('anything', ''), true);
      assert.equal(extractedTextContainsEmail('anything', null), true);
    });
  });

  describe('findCandidateEmail', () => {
    it('returns the strict match verbatim when extraction is clean', () => {
      assert.equal(
        findCandidateEmail(`Vishwanath Nishad · ${canonicalEmail} · +1-555-0199`),
        canonicalEmail
      );
    });

    it('recovers an address split by extractor-injected whitespace', () => {
      assert.equal(
        findCandidateEmail('Vishwanath Nishad vishwanatnishad@ gmail.com'),
        canonicalEmail
      );
      assert.equal(
        findCandidateEmail('Vishwanath Nishad vishwanatnishad@gmail. com'),
        canonicalEmail
      );
    });

    it('returns null when no email-shaped token is present', () => {
      assert.equal(findCandidateEmail('Vishwanath Nishad · Backend Engineer'), null);
      assert.equal(findCandidateEmail(''), null);
      assert.equal(findCandidateEmail(null), null);
      // A lone "@" or a domain without an @ is not an address.
      assert.equal(findCandidateEmail('mention @ here'), null);
      assert.equal(findCandidateEmail('gmail.com'), null);
    });

    it('does not merge unrelated prose into a synthetic address', () => {
      // The tolerant pattern requires local-part + @ + dotted domain; prose that
      // merely contains an "@" mention must not be reported as an address.
      assert.equal(findCandidateEmail('Follow @ company for updates. gmail.com'), null);
    });
  });
});
