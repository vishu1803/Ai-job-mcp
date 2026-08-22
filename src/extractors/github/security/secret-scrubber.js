/**
 * @file High-Entropy Secret Scrubber for Evidence Excerpts (P4-003)
 *
 * Scans, sanitizes, and scrubs high-entropy credentials, private keys, API tokens,
 * and connection strings from untrusted repository excerpts before persistence.
 *
 * Enforces a strict hard excerpt ceiling of <= 1024 characters.
 */

export class SecretScrubber {
  /**
   * Disallowed secret regex patterns.
   * Each pattern matches specific credential structures.
   */
  static SECRET_PATTERNS = [
    // 1. GitHub Personal Access Tokens and App Tokens
    {
      name: 'GITHUB_TOKEN',
      regex: /\b(gh[pousr]_[A-Za-z0-9_]{36,255})\b/g,
    },
    // 2. Private Keys (RSA, EC, OpenSSH, PGP, Generic)
    {
      name: 'PRIVATE_KEY',
      regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
    },
    // 3. AWS Access Key IDs
    {
      name: 'AWS_ACCESS_KEY',
      regex: /\b((?:AKIA|ABIA|ACCA|ASIA)[0-9A-Z]{16})\b/g,
    },
    // 4. Bearer Tokens & JSON Web Tokens (JWT)
    {
      name: 'BEARER_JWT',
      regex: /\bBearer\s+([A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*)\b/gi,
      replace: 'Bearer [REDACTED_SECRET]',
    },
    {
      name: 'RAW_JWT',
      regex: /\b(eyJ[A-Za-z0-9-_=]{10,}\.[A-Za-z0-9-_=]{10,}\.?[A-Za-z0-9-_.+/=]*)\b/g,
    },
    // 5. Database Connection Strings with embedded credentials
    {
      name: 'CONNECTION_STRING',
      regex: /([a-zA-Z0-9+]+:\/\/[^:\s'"/]+):([^@\s'"/]+)@/g,
      replace: '$1:[REDACTED_SECRET]@',
    },
    // 6. Generic Assignment Secret Patterns (password, token, secret, api_key)
    {
      name: 'ASSIGNMENT_SECRET',
      regex:
        /(?<=\b(?:password|passwd|secret|api[_-]?key|auth[_-]?token|access[_-]?token|private[_-]?key)\s*[:=]\s*['"])([^'"]{8,})(?=['"])/gi,
      replace: '[REDACTED_SECRET]',
    },
    // 7. Generic Unquoted Assignment Secrets
    {
      name: 'UNQUOTED_ASSIGNMENT_SECRET',
      regex:
        /(?<=\b(?:password|passwd|secret|api[_-]?key|auth[_-]?token)\s*[:=]\s*)([^\s,;'"]{8,})(?=[\s,;\n]|$)/gi,
      replace: '[REDACTED_SECRET]',
    },
  ];

  /**
   * Scrubs sensitive tokens and credentials from text.
   *
   * @param {string} text - Raw input text from repository files.
   * @returns {string} Sanitized text with secrets replaced by [REDACTED_SECRET].
   */
  static scrub(text) {
    if (!text || typeof text !== 'string') {
      return '';
    }

    let sanitized = text;

    for (const pattern of SecretScrubber.SECRET_PATTERNS) {
      if (pattern.replace) {
        sanitized = sanitized.replace(pattern.regex, pattern.replace);
      } else {
        sanitized = sanitized.replace(pattern.regex, '[REDACTED_SECRET]');
      }
    }

    return sanitized;
  }

  /**
   * Sanitizes, scrubs, and bounds an excerpt to a maximum length (default: 1024 characters).
   * Execution lifecycle: extract -> sanitize -> truncate.
   *
   * @param {string} rawExcerpt - Raw excerpt extracted from source file or manifest.
   * @param {number} [maxLength=1024] - Maximum allowed character length.
   * @returns {string} Sanitized and bounded excerpt string.
   */
  static sanitizeExcerpt(rawExcerpt, maxLength = 1024) {
    if (!rawExcerpt || typeof rawExcerpt !== 'string') {
      return '';
    }

    // 1. Initial slice to prevent excessive regex processing on massive strings
    const boundedRaw = rawExcerpt.slice(0, maxLength * 2);

    // 2. Scrub secrets
    const scrubbed = SecretScrubber.scrub(boundedRaw);

    // 3. Final truncate to guaranteed <= maxLength characters
    if (scrubbed.length > maxLength) {
      return scrubbed.slice(0, maxLength);
    }

    return scrubbed;
  }

  /**
   * Checks if a string contains any detectable secret pattern.
   *
   * @param {string} text - Text to inspect.
   * @returns {boolean} True if any secret pattern matched.
   */
  static containsSecret(text) {
    if (!text || typeof text !== 'string') {
      return false;
    }

    return SecretScrubber.SECRET_PATTERNS.some((p) => {
      p.regex.lastIndex = 0;
      return p.regex.test(text);
    });
  }
}
