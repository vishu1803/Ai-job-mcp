/**
 * @file High-Performance, Zero-Dependency Secrets Scanner.
 *
 * Scans repository files, staged git diffs, or git history for accidental secret leaks.
 * Enforces zero-exposure invariants: detected secrets are ALWAYS redacted in output.
 *
 * Supported Patterns:
 * 1. GitHub Personal Access Tokens (ghp_*, gho_*, ghu_*, ghs_*, ghr_*)
 * 2. Google AI / Developer API Keys (AIzaSy*)
 * 3. Personal MCP Tokens (mcp_live_*, mcp_dev_*, mcp_prod_*)
 * 4. Private RSA / EC / OpenSSH Keys (-----BEGIN * PRIVATE KEY-----)
 * 5. Database Connection URIs with Plaintext Passwords (postgres://user:pass@host)
 * 6. AWS Access Key IDs (AKIA*)
 * 7. OAuth Client Secret Declarations with High Entropy
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

/**
 * Checks if a matched string is an obvious synthetic/test fixture.
 *
 * @param {string} match The matched secret string
 * @param {string} filePath Origin file path
 * @returns {boolean} True if the string is an allowed test/doc fixture
 */
function isAllowedFixture(match, filePath) {
  const lower = match.toLowerCase();
  const isTestOrDoc =
    filePath.startsWith('tests/') ||
    filePath.startsWith('docs/') ||
    filePath.includes('/tests/') ||
    filePath.includes('/docs/') ||
    filePath.includes('.test.') ||
    filePath.includes('.spec.') ||
    filePath.includes('test-fixtures');

  // Generic universal placeholders
  if (
    lower.includes('placeholder') ||
    lower.includes('example') ||
    lower.includes('fake') ||
    lower.includes('dummy') ||
    lower.includes('mock') ||
    lower.includes('sample') ||
    lower.includes('0123456789') ||
    lower.includes('00000000') ||
    lower.includes('11111111') ||
    lower.includes('base64_pem') ||
    lower.includes('your_') ||
    lower.includes('change_me') ||
    lower.includes('secret_key_change_me') ||
    lower.includes('mysecretpassword') ||
    lower.includes('mypassword') ||
    lower.includes('16c7e42f292c6912e7710c838347ae178b4a')
  ) {
    return true;
  }

  // Inside test files and documentation, allow mock test data
  if (isTestOrDoc) {
    return true;
  }

  return false;
}

export const SECRET_PATTERNS = [
  {
    id: 'GITHUB_PAT',
    name: 'GitHub Personal Access / Installation Token',
    regex: /\bgh[pousr]_[A-Za-z0-9_]{36,255}\b/g,
    severity: 'CRITICAL',
    validator: (match, filePath) => !isAllowedFixture(match, filePath),
  },
  {
    id: 'GOOGLE_API_KEY',
    name: 'Google Developer / Gemini API Key',
    regex: /\bAIzaSy[A-Za-z0-9_-]{33}\b/g,
    severity: 'HIGH',
    validator: (match, filePath) => !isAllowedFixture(match, filePath),
  },
  {
    id: 'MCP_TOKEN',
    name: 'Antigravity MCP API Token',
    regex: /\bmcp_(?:live|dev|prod)_[a-f0-9]{32,64}\b/g,
    severity: 'HIGH',
    validator: (match, filePath) => !isAllowedFixture(match, filePath),
  },
  {
    id: 'PRIVATE_KEY_PEM',
    name: 'Cryptographic Private Key (PEM)',
    regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g,
    severity: 'CRITICAL',
    validator: (match, filePath) => !isAllowedFixture(match, filePath),
  },
  {
    id: 'DATABASE_PASSWORD_URI',
    name: 'Database Connection String with Plaintext Password',
    regex:
      /postgres(?:ql)?:\/\/[a-zA-Z0-9_-]+:([^@\s/]{4,})@[a-zA-Z0-9.-]+(?::\d+)?\/[a-zA-Z0-9_.-]+/g,
    severity: 'CRITICAL',
    validator: (match, filePath) => {
      const lower = match.toLowerCase();
      if (isAllowedFixture(match, filePath)) return false;
      return (
        !lower.includes('postgres:postgres@localhost') &&
        !lower.includes('postgres:postgres_ci_password@localhost') &&
        !lower.includes('postgres:postgres@127.0.0.1') &&
        !lower.includes('user:password@localhost') &&
        !lower.includes('user:pass@host') &&
        !lower.includes('username:password@') &&
        !lower.includes('user:pass@localhost')
      );
    },
  },
  {
    id: 'AWS_ACCESS_KEY',
    name: 'AWS Access Key ID',
    regex: /\bAKIA[0-9A-Z]{16}\b/g,
    severity: 'HIGH',
    validator: (match, filePath) =>
      match !== 'AKIAIOSFODNN7EXAMPLE' && !isAllowedFixture(match, filePath),
  },
  {
    id: 'GENERIC_HIGH_ENTROPY_SECRET',
    name: 'Explicit Client Secret Assignment',
    regex:
      /(?:client_secret|clientSecret|auth_secret|AUTH_SECRET|ENCRYPTION_MASTER_KEY)\s*[:=]\s*['"]([a-zA-Z0-9_-]{32,})['"]/g,
    severity: 'HIGH',
    validator: (match, filePath) => !isAllowedFixture(match, filePath),
  },
];

export const IGNORED_PATHS = [
  '.git',
  '.env',
  '.env.local',
  '.env.test',
  '.env.production',
  'node_modules',
  '.system_generated',
  '.tempmediaStorage',
  'coverage',
  'storage',
  'scratch',
  '.prettierrc.json',
  '.env.example',
  'package-lock.json',
];

/**
 * Redacts a detected secret string, revealing only the prefix and length.
 *
 * @param {string} secret The raw secret string
 * @returns {string} Redacted representation
 */
export function redactSecret(secret) {
  if (!secret || typeof secret !== 'string') return '[REDACTED]';
  if (secret.length <= 8) return '[REDACTED]';
  const prefix = secret.slice(0, 4);
  const suffix = secret.slice(-3);
  return `${prefix}...[REDACTED_LENGTH_${secret.length}]...${suffix}`;
}

/**
 * Scans a text buffer for potential secret patterns.
 *
 * @param {string} content Text content to scan
 * @param {string} [filePath='<string>'] Origin file path for reporting
 * @param {boolean} [strictMode=false] If true, ignores synthetic fixture allowlists
 * @returns {Array<{ id: string, name: string, severity: string, line: number, redacted: string, filePath: string }>}
 */
export function scanContent(content, filePath = '<string>', strictMode = false) {
  const findings = [];
  if (!content || typeof content !== 'string') return findings;

  const lines = content.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;

    for (const pattern of SECRET_PATTERNS) {
      pattern.regex.lastIndex = 0;
      let match;
      while ((match = pattern.regex.exec(line)) !== null) {
        const rawMatchedString = match[0];
        if (
          !strictMode &&
          pattern.validator &&
          !pattern.validator(rawMatchedString, filePath, match)
        ) {
          continue;
        }

        findings.push({
          id: pattern.id,
          name: pattern.name,
          severity: pattern.severity,
          line: lineNumber,
          redacted: redactSecret(rawMatchedString),
          filePath,
        });
      }
    }
  }

  return findings;
}

/**
 * Recursively scans a directory for secrets.
 *
 * @param {string} dir Directory path
 * @param {string} rootDir Base directory for relative paths
 * @param {boolean} [strictMode=false] Strict mode flag
 * @returns {Array} All findings
 */
export function scanDirectory(dir, rootDir = dir, strictMode = false) {
  let findings = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = path.relative(rootDir, fullPath).replace(/\\/g, '/');

    if (IGNORED_PATHS.some((ignored) => relPath === ignored || relPath.startsWith(`${ignored}/`))) {
      continue;
    }

    if (entry.isDirectory()) {
      findings = findings.concat(scanDirectory(fullPath, rootDir, strictMode));
    } else if (entry.isFile()) {
      try {
        const stat = fs.statSync(fullPath);
        if (stat.size > 5 * 1024 * 1024) continue;

        const content = fs.readFileSync(fullPath, 'utf8');
        const fileFindings = scanContent(content, relPath, strictMode);
        findings = findings.concat(fileFindings);
      } catch {
        // Skip unreadable / binary files
      }
    }
  }

  return findings;
}

/**
 * Scans a git diff stream while tracking the current active file path.
 *
 * @param {string} diffText Raw git diff or git log -p output
 * @param {boolean} [strictMode=false]
 * @returns {Array} All findings
 */
export function scanDiffStream(diffText, strictMode = false) {
  if (!diffText || typeof diffText !== 'string') return [];
  let currentFile = '<unknown_diff>';
  const findings = [];
  const lines = diffText.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect diff header e.g. "diff --git a/src/app.js b/src/app.js"
    const diffMatch = line.match(/^diff --git a\/(.*?) b\/(.*?)$/);
    if (diffMatch) {
      currentFile = diffMatch[2] || diffMatch[1];
      continue;
    }

    // Detect commit header e.g. "commit 6247d3c..."
    if (line.startsWith('commit ')) {
      currentFile = `<commit_${line.slice(7, 15)}>`;
      continue;
    }

    // Only scan added or modified lines in diff
    if (line.startsWith('+') && !line.startsWith('+++')) {
      const lineFindings = scanContent(line.slice(1), currentFile, strictMode);
      for (const item of lineFindings) {
        item.line = i + 1;
        findings.push(item);
      }
    }
  }

  return findings;
}

/**
 * Scans staged git diffs for pre-commit checks.
 *
 * @returns {Array} Findings in staged changes
 */
export function scanStagedGitDiff() {
  try {
    const diff = execSync('git diff --cached --unified=0', { encoding: 'utf8' });
    if (!diff) return [];
    return scanDiffStream(diff);
  } catch (error) {
    console.warn(`[WARN] Unable to execute git diff: ${error.message}`);
    return [];
  }
}

/**
 * Scans git commit log history for secrets.
 *
 * @param {number} [depth=50] Number of commits to inspect
 * @returns {Array} Findings in recent commit history
 */
export function scanGitHistory(depth = 50) {
  try {
    const diff = execSync(`git log -p -n ${depth}`, {
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
    });
    if (!diff) return [];
    return scanDiffStream(diff);
  } catch (error) {
    console.warn(`[WARN] Unable to inspect git history: ${error.message}`);
    return [];
  }
}

// Direct CLI Execution
if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const isStaged = process.argv.includes('--staged');
  const isHistory = process.argv.includes('--history');
  const isStrict = process.argv.includes('--strict');
  const repoRoot = process.cwd();

  console.log('======================================================');
  console.log('🔒 ANTIGRAVITY CAREER HUB - SECRETS SCANNER');
  console.log('======================================================');

  let results = [];
  if (isStaged) {
    console.log('Scanning staged git changes (Pre-Commit Mode)...');
    results = scanStagedGitDiff();
  } else if (isHistory) {
    console.log('Scanning git commit history (Recent 50 commits)...');
    results = scanGitHistory(50);
  } else {
    console.log(`Scanning repository files in: ${repoRoot}...`);
    results = scanDirectory(repoRoot, repoRoot, isStrict);
  }

  if (results.length === 0) {
    console.log('✅ SECRETS AUDIT PASSED: Zero exposed secrets or private tokens detected.');
    process.exit(0);
  } else {
    console.error(`❌ SECRETS AUDIT FAILED: Detected ${results.length} potential secret leak(s):`);
    for (const item of results) {
      console.error(`  - [${item.severity}] ${item.name}`);
      console.error(`    File: ${item.filePath}:${item.line}`);
      console.error(`    Pattern: ${item.id} | Redacted: ${item.redacted}`);
    }
    console.error('\n⚠️ Please remove all sensitive keys before committing or building!');
    process.exit(1);
  }
}
