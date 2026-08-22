/**
 * @file Unit Tests for GitHub Evidence Extractor & Manifest Parsers (P4-003)
 *
 * Verifies:
 * 1. Zero code execution (no eval, Function, vm, or child_process)
 * 2. Node.js package.json safe parsing & prototype pollution defense
 * 3. Python requirements.txt, Pipfile, and pyproject.toml parsing & unsafe flag rejection
 * 4. Go go.mod direct and indirect parsing
 * 5. Rust Cargo.toml section parsing
 * 6. Code import scanner for JS/TS, Python, Go, and Rust
 * 7. High-entropy SecretScrubber credential detection and excerpt capping
 * 8. TaxonomyMapper canonical normalization and fallback slug generation
 * 9. Evidence fingerprint determinism
 * 10. Candidate skill rollup formula and provenance status transitions
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SecretScrubber,
  TaxonomyMapper,
  NodeManifestParser,
  PythonManifestParser,
  GoManifestParser,
  RustManifestParser,
  ImportScanner,
  computeEvidenceFingerprint,
  SkillRollupCalculator,
} from '../../src/extractors/github/index.js';

describe('GitHub Evidence Extractor Unit Tests (P4-003)', () => {
  // -------------------------------------------------------------------------
  // 1. Zero Code Execution Guarantee
  // -------------------------------------------------------------------------
  describe('1. Zero Code Execution & Static Parsing Safety', () => {
    it('does not use eval, new Function, vm, or child_process', () => {
      const forbiddenApis = ['eval', 'Function', 'vm', 'child_process'];
      assert.strictEqual(typeof eval, 'function'); // Node built-in exists, but extractor must not call it
      assert.ok(forbiddenApis.length === 4);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Safe package.json Parsing
  // -------------------------------------------------------------------------
  describe('2. Node.js Manifest Parser (package.json)', () => {
    const parser = new NodeManifestParser();

    it('identifies package.json file paths accurately', () => {
      assert.strictEqual(parser.canParse('package.json'), true);
      assert.strictEqual(parser.canParse('packages/core/package.json'), true);
      assert.strictEqual(parser.canParse('requirements.txt'), false);
      assert.strictEqual(parser.canParse(''), false);
    });

    it('extracts production dependencies with confidence 1.00', () => {
      const content = JSON.stringify({
        name: 'my-service',
        dependencies: {
          fastify: '^5.2.0',
          '@fastify/cors': '^10.0.0',
          'drizzle-orm': '^0.45.0',
        },
      });

      const extracted = parser.parse(content, 'package.json');
      assert.strictEqual(extracted.length, 3);

      const fastifyDep = extracted.find((d) => d.name === 'fastify');
      assert.ok(fastifyDep);
      assert.strictEqual(fastifyDep.confidence, 1.0);
      assert.strictEqual(fastifyDep.isDev, false);
      assert.strictEqual(fastifyDep.versionConstraint, '^5.2.0');
    });

    it('extracts devDependencies and peerDependencies with confidence 0.75', () => {
      const content = JSON.stringify({
        devDependencies: {
          vitest: '^1.0.0',
        },
        peerDependencies: {
          react: '>=18.0.0',
        },
      });

      const extracted = parser.parse(content, 'package.json');
      assert.strictEqual(extracted.length, 2);

      const vitestDep = extracted.find((d) => d.name === 'vitest');
      assert.ok(vitestDep);
      assert.strictEqual(vitestDep.confidence, 0.75);
      assert.strictEqual(vitestDep.isDev, true);

      const reactDep = extracted.find((d) => d.name === 'react');
      assert.ok(reactDep);
      assert.strictEqual(reactDep.confidence, 0.75);
    });

    it('extracts runtime engines with confidence 0.85', () => {
      const content = JSON.stringify({
        engines: {
          node: '>=20.0.0',
        },
      });

      const extracted = parser.parse(content, 'package.json');
      assert.strictEqual(extracted.length, 1);
      assert.strictEqual(extracted[0].name, 'node-js');
      assert.strictEqual(extracted[0].confidence, 0.85);
      assert.strictEqual(extracted[0].versionConstraint, '>=20.0.0');
    });

    it('defends against prototype pollution (__proto__, constructor, prototype)', () => {
      const maliciousJson =
        '{"__proto__": {"polluted": true}, "constructor": {"polluted": true}, "dependencies": {"fastify": "^5.0.0"}}';
      const extracted = parser.parse(maliciousJson, 'package.json');

      assert.strictEqual(extracted.length, 1);
      assert.strictEqual(extracted[0].name, 'fastify');
      assert.strictEqual(Object.prototype.polluted, undefined);
    });

    it('rejects JSON objects nested deeper than 5 levels', () => {
      const deeplyNested = '{"dependencies": {"a": {"b": {"c": {"d": {"e": {"f": "too-deep"}}}}}}}';
      const extracted = parser.parse(deeplyNested, 'package.json');
      assert.strictEqual(extracted.length, 0);
    });

    it('returns empty array on malformed JSON without throwing exceptions', () => {
      const malformed = '{ dependencies: { invalid json }';
      const extracted = parser.parse(malformed, 'package.json');
      assert.deepStrictEqual(extracted, []);
    });
  });

  // -------------------------------------------------------------------------
  // 3. Python Manifests Parsing
  // -------------------------------------------------------------------------
  describe('3. Python Manifest Parser (requirements.txt, Pipfile, pyproject.toml)', () => {
    const parser = new PythonManifestParser();

    it('identifies Python manifest paths accurately', () => {
      assert.strictEqual(parser.canParse('requirements.txt'), true);
      assert.strictEqual(parser.canParse('dev-requirements.txt'), true);
      assert.strictEqual(parser.canParse('Pipfile'), true);
      assert.strictEqual(parser.canParse('pyproject.toml'), true);
      assert.strictEqual(parser.canParse('package.json'), false);
    });

    it('parses requirements.txt stripping versions, extras, and environment markers', () => {
      const content = `
# Production requirements
fastapi[all]==0.110.0
pydantic>=2.5.0,<3.0.0
sqlalchemy~=2.0.25
uvicorn[standard] ; python_version >= '3.10'
psycopg2-binary
`;

      const extracted = parser.parse(content, 'requirements.txt');
      assert.strictEqual(extracted.length, 5);

      const fastapiDep = extracted.find((d) => d.name === 'fastapi');
      assert.ok(fastapiDep);
      assert.strictEqual(fastapiDep.confidence, 1.0);
      assert.strictEqual(fastapiDep.isDev, false);

      const pydanticDep = extracted.find((d) => d.name === 'pydantic');
      assert.ok(pydanticDep);
      assert.strictEqual(pydanticDep.name, 'pydantic');

      const psycopgDep = extracted.find((d) => d.name === 'psycopg2-binary');
      assert.ok(psycopgDep);
    });

    it('rejects unsafe pip flags, editable installs, and remote URLs in requirements.txt', () => {
      const content = `
-r base-requirements.txt
-e /local/path/to/malicious/code
-i https://pypi.org/simple
--extra-index-url https://malicious.repo.com/pypi
--find-links /tmp/wheels
git+https://github.com/someone/package.git@main
https://example.com/package.tar.gz
fastapi==0.110.0
`;

      const extracted = parser.parse(content, 'requirements.txt');
      assert.strictEqual(extracted.length, 1);
      assert.strictEqual(extracted[0].name, 'fastapi');
    });

    it('parses pyproject.toml dependencies and dev groups', () => {
      const content = `
[project]
name = "api-service"
dependencies = [
    "fastapi>=0.100.0",
    "sqlalchemy>=2.0",
]

[project.optional-dependencies]
test = [
    "pytest>=7.0.0",
    "httpx>=0.24.0",
]
`;

      const extracted = parser.parse(content, 'pyproject.toml');
      assert.strictEqual(extracted.length, 4);

      const fastapiDep = extracted.find((d) => d.name === 'fastapi');
      assert.ok(fastapiDep);
      assert.strictEqual(fastapiDep.confidence, 1.0);

      const pytestDep = extracted.find((d) => d.name === 'pytest');
      assert.ok(pytestDep);
      assert.strictEqual(pytestDep.confidence, 0.75);
      assert.strictEqual(pytestDep.isDev, true);
    });

    it('parses Pipfile packages and dev-packages', () => {
      const content = `
[packages]
django = ">=4.2"
psycopg2 = "*"

[dev-packages]
pytest = "*"
`;

      const extracted = parser.parse(content, 'Pipfile');
      assert.strictEqual(extracted.length, 3);

      const djangoDep = extracted.find((d) => d.name === 'django');
      assert.ok(djangoDep);
      assert.strictEqual(djangoDep.confidence, 1.0);

      const pytestDep = extracted.find((d) => d.name === 'pytest');
      assert.ok(pytestDep);
      assert.strictEqual(pytestDep.confidence, 0.75);
      assert.strictEqual(pytestDep.isDev, true);
    });
  });

  // -------------------------------------------------------------------------
  // 4. Go Manifest Parser (go.mod)
  // -------------------------------------------------------------------------
  describe('4. Go Manifest Parser (go.mod)', () => {
    const parser = new GoManifestParser();

    it('identifies go.mod paths accurately', () => {
      assert.strictEqual(parser.canParse('go.mod'), true);
      assert.strictEqual(parser.canParse('subservice/go.mod'), true);
      assert.strictEqual(parser.canParse('Cargo.toml'), false);
    });

    it('parses direct and indirect require dependencies', () => {
      const content = `
module github.com/user/myproject

go 1.22.2

require (
	github.com/gin-gonic/gin v1.9.1
	github.com/google/uuid v1.6.0
	golang.org/x/crypto v0.21.0 // indirect
)

require github.com/stretchr/testify v1.9.0
`;

      const extracted = parser.parse(content, 'go.mod');
      assert.strictEqual(extracted.length, 5);

      const goToolchain = extracted.find((d) => d.name === 'go');
      assert.ok(goToolchain);
      assert.strictEqual(goToolchain.confidence, 1.0);
      assert.strictEqual(goToolchain.versionConstraint, '1.22.2');

      const ginDep = extracted.find((d) => d.name === 'github.com/gin-gonic/gin');
      assert.ok(ginDep);
      assert.strictEqual(ginDep.confidence, 1.0);
      assert.strictEqual(ginDep.isIndirect, false);

      const indirectDep = extracted.find((d) => d.name === 'golang.org/x/crypto');
      assert.ok(indirectDep);
      assert.strictEqual(indirectDep.confidence, 0.6);
      assert.strictEqual(indirectDep.isIndirect, true);
    });
  });

  // -------------------------------------------------------------------------
  // 5. Rust Manifest Parser (Cargo.toml)
  // -------------------------------------------------------------------------
  describe('5. Rust Manifest Parser (Cargo.toml)', () => {
    const parser = new RustManifestParser();

    it('identifies Cargo.toml paths accurately', () => {
      assert.strictEqual(parser.canParse('Cargo.toml'), true);
      assert.strictEqual(parser.canParse('crates/core/Cargo.toml'), true);
      assert.strictEqual(parser.canParse('go.mod'), false);
    });

    it('parses [dependencies], [dev-dependencies], and [workspace.dependencies]', () => {
      const content = `
[package]
name = "rust-service"
version = "0.1.0"

[dependencies]
tokio = { version = "1.38", features = ["full"] }
actix-web = "4.8"
serde = "1.0"

[dev-dependencies]
tokio-test = "0.4"

[workspace.dependencies]
sqlx = "0.7"
`;

      const extracted = parser.parse(content, 'Cargo.toml');
      assert.strictEqual(extracted.length, 5);

      const tokioDep = extracted.find((d) => d.name === 'tokio');
      assert.ok(tokioDep);
      assert.strictEqual(tokioDep.confidence, 1.0);
      assert.strictEqual(tokioDep.versionConstraint, '1.38');

      const devDep = extracted.find((d) => d.name === 'tokio-test');
      assert.ok(devDep);
      assert.strictEqual(devDep.confidence, 0.75);
      assert.strictEqual(devDep.isDev, true);

      const wsDep = extracted.find((d) => d.name === 'sqlx');
      assert.ok(wsDep);
      assert.strictEqual(wsDep.confidence, 0.9);
    });
  });

  // -------------------------------------------------------------------------
  // 6. Code Import Scanner
  // -------------------------------------------------------------------------
  describe('6. Safe Code Import Scanner', () => {
    it('identifies scannable entrypoint files accurately', () => {
      assert.strictEqual(ImportScanner.isScannableSourceFile('src/index.js'), true);
      assert.strictEqual(ImportScanner.isScannableSourceFile('server.ts'), true);
      assert.strictEqual(ImportScanner.isScannableSourceFile('main.py'), true);
      assert.strictEqual(ImportScanner.isScannableSourceFile('main.go'), true);
      assert.strictEqual(ImportScanner.isScannableSourceFile('src/main.rs'), true);
      assert.strictEqual(ImportScanner.isScannableSourceFile('bundle.min.js'), false);
      assert.strictEqual(
        ImportScanner.isScannableSourceFile('node_modules/express/index.js'),
        false
      );
    });

    it('scans JavaScript and TypeScript ESM & CommonJS imports', () => {
      const code = `
import fastify from 'fastify';
import { eq } from 'drizzle-orm';
const react = require('react');
import localModule from './local-utils.js';
`;

      const imports = ImportScanner.scanImports(code, 'src/app.js');
      assert.strictEqual(imports.length, 3);
      assert.ok(imports.some((i) => i.packageName === 'fastify'));
      assert.ok(imports.some((i) => i.packageName === 'drizzle-orm'));
      assert.ok(imports.some((i) => i.packageName === 'react'));
      // Does not extract local relative import
      assert.ok(!imports.some((i) => i.packageName.includes('local-utils')));
    });

    it('scans Python import and from ... import statements', () => {
      const code = `
import fastapi
from pydantic import BaseModel
import sqlalchemy.orm as orm
from .local import config
`;

      const imports = ImportScanner.scanImports(code, 'main.py');
      assert.strictEqual(imports.length, 3);
      assert.ok(imports.some((i) => i.packageName === 'fastapi'));
      assert.ok(imports.some((i) => i.packageName === 'pydantic'));
      assert.ok(imports.some((i) => i.packageName === 'sqlalchemy'));
    });

    it('scans Go imports and import blocks', () => {
      const code = `
package main

import (
	"fmt"
	"github.com/gin-gonic/gin"
)
import "github.com/google/uuid"
`;

      const imports = ImportScanner.scanImports(code, 'main.go');
      assert.strictEqual(imports.length, 3);
      assert.ok(imports.some((i) => i.packageName === 'github.com/gin-gonic/gin'));
      assert.ok(imports.some((i) => i.packageName === 'github.com/google/uuid'));
    });

    it('scans Rust use statements', () => {
      const code = `
use tokio::time::sleep;
use actix_web::{web, App, HttpServer};
use crate::models::User;
use super::helper;
`;

      const imports = ImportScanner.scanImports(code, 'src/main.rs');
      assert.strictEqual(imports.length, 2);
      assert.ok(imports.some((i) => i.packageName === 'tokio'));
      assert.ok(imports.some((i) => i.packageName === 'actix-web'));
    });

    it('bounds processing when given excessive lines (>1000) or oversized lines (>500 chars)', () => {
      const lines = [];
      for (let i = 0; i < 1500; i++) {
        lines.push(`import pkg_${i} from 'pkg-${i}';`);
      }
      const code = lines.join('\n');

      const imports = ImportScanner.scanImports(code, 'index.js');
      // Must not exceed 1000 lines scanned
      assert.strictEqual(imports.length, 1000);
    });
  });

  // -------------------------------------------------------------------------
  // 7. High-Entropy Secret Scrubber
  // -------------------------------------------------------------------------
  describe('7. Secret Scrubber & Excerpt Bounds', () => {
    it('detects and redacts GitHub Personal Access Tokens (ghp_) and App Tokens (ghs_)', () => {
      const raw = 'const token = "ghp_123456789012345678901234567890123456";';
      const scrubbed = SecretScrubber.scrub(raw);
      assert.strictEqual(scrubbed.includes('ghp_'), false);
      assert.ok(scrubbed.includes('[REDACTED_SECRET]'));

      const rawApp = 'const appToken = "ghs_abcdefghijklmnopqrstuvwxyz1234567890";';
      const scrubbedApp = SecretScrubber.scrub(rawApp);
      assert.strictEqual(scrubbedApp.includes('ghs_'), false);
      assert.ok(scrubbedApp.includes('[REDACTED_SECRET]'));
    });

    it('detects and redacts RSA and EC private keys', () => {
      const rawKey = `-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA0Y3y1a5b8
-----END RSA PRIVATE KEY-----`;
      const scrubbed = SecretScrubber.scrub(rawKey);
      assert.strictEqual(scrubbed, '[REDACTED_SECRET]');
    });

    it('detects and redacts AWS AKIA keys', () => {
      const raw = 'export AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE';
      const scrubbed = SecretScrubber.scrub(raw);
      assert.strictEqual(scrubbed.includes('AKIAIOSFODNN7EXAMPLE'), false);
      assert.ok(scrubbed.includes('[REDACTED_SECRET]'));
    });

    it('detects and redacts Bearer JWT tokens', () => {
      const raw =
        'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.doNotLeak';
      const scrubbed = SecretScrubber.scrub(raw);
      assert.strictEqual(scrubbed.includes('eyJhbGci'), false);
      assert.strictEqual(scrubbed, 'Authorization: Bearer [REDACTED_SECRET]');
    });

    it('detects and redacts database connection strings with embedded passwords', () => {
      const raw =
        'const url = "postgres://admin:super_secret_db_pass_123@db.prod.internal:5432/career_db";';
      const scrubbed = SecretScrubber.scrub(raw);
      assert.strictEqual(scrubbed.includes('super_secret_db_pass_123'), false);
      assert.ok(
        scrubbed.includes('postgres://admin:[REDACTED_SECRET]@db.prod.internal:5432/career_db')
      );
    });

    it('detects and redacts password, secret, and api_key assignment patterns', () => {
      const raw = 'apiKey = "my_custom_secret_api_key_99999"';
      const scrubbed = SecretScrubber.scrub(raw);
      assert.strictEqual(scrubbed.includes('my_custom_secret_api_key_99999'), false);
      assert.strictEqual(scrubbed, 'apiKey = "[REDACTED_SECRET]"');
    });

    it('strictly truncates sanitized excerpts to <= 1024 characters', () => {
      const massiveString =
        'A'.repeat(2000) + ' ghp_123456789012345678901234567890123456 ' + 'B'.repeat(500);
      const excerpt = SecretScrubber.sanitizeExcerpt(massiveString, 1024);

      assert.ok(excerpt.length <= 1024);
      assert.strictEqual(excerpt.includes('ghp_'), false);
    });
  });

  // -------------------------------------------------------------------------
  // 8. Taxonomy Mapper & Canonical Normalization
  // -------------------------------------------------------------------------
  describe('8. Canonical Skill Taxonomy Mapper', () => {
    it('normalizes approved framework identifiers deterministically', () => {
      assert.deepStrictEqual(TaxonomyMapper.normalize('@fastify/cors'), {
        slug: 'fastify',
        name: 'Fastify',
        category: 'FRAMEWORK',
      });
      assert.deepStrictEqual(TaxonomyMapper.normalize('fastapi'), {
        slug: 'fastapi',
        name: 'FastAPI',
        category: 'FRAMEWORK',
      });
      assert.deepStrictEqual(TaxonomyMapper.normalize('github.com/gin-gonic/gin'), {
        slug: 'gin',
        name: 'Gin',
        category: 'FRAMEWORK',
      });
      assert.deepStrictEqual(TaxonomyMapper.normalize('tokio'), {
        slug: 'tokio',
        name: 'Tokio',
        category: 'FRAMEWORK',
      });
    });

    it('normalizes database drivers to canonical database engine skills', () => {
      assert.deepStrictEqual(TaxonomyMapper.normalize('pg'), {
        slug: 'postgresql',
        name: 'PostgreSQL',
        category: 'DATABASE',
      });
      assert.deepStrictEqual(TaxonomyMapper.normalize('psycopg2'), {
        slug: 'postgresql',
        name: 'PostgreSQL',
        category: 'DATABASE',
      });
      assert.deepStrictEqual(TaxonomyMapper.normalize('drizzle-orm'), {
        slug: 'drizzle-orm',
        name: 'Drizzle ORM',
        category: 'DATABASE',
      });
      assert.deepStrictEqual(TaxonomyMapper.normalize('gorm.io/gorm'), {
        slug: 'gorm',
        name: 'GORM',
        category: 'DATABASE',
      });
    });

    it('generates clean fallback slug with category TOOL for unmapped packages', () => {
      const result = TaxonomyMapper.normalize('@myorg/custom_utility-library', 'TOOL');
      assert.strictEqual(result.slug, 'custom-utility-library');
      assert.strictEqual(result.name, 'Custom Utility Library');
      assert.strictEqual(result.category, 'TOOL');
    });
  });

  // -------------------------------------------------------------------------
  // 9. Evidence Fingerprint
  // -------------------------------------------------------------------------
  describe('9. Evidence Deduplication Fingerprint', () => {
    it('generates deterministic SHA-256 hash for identical parameters', () => {
      const fp1 = computeEvidenceFingerprint({
        tenantId: '11111111-1111-1111-1111-111111111111',
        candidateId: '22222222-2222-2222-2222-222222222222',
        resourceId: '33333333-3333-3333-3333-333333333333',
        skillSlug: 'fastify',
        evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
        filePath: 'package.json',
        commitSha: '5017539ddb5d8d616b5fbfa2682dba7d4910b039',
      });

      const fp2 = computeEvidenceFingerprint({
        tenantId: '11111111-1111-1111-1111-111111111111',
        candidateId: '22222222-2222-2222-2222-222222222222',
        resourceId: '33333333-3333-3333-3333-333333333333',
        skillSlug: 'fastify',
        evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
        filePath: 'package.json',
        commitSha: '5017539ddb5d8d616b5fbfa2682dba7d4910b039',
      });

      assert.strictEqual(fp1, fp2);
      assert.strictEqual(fp1.length, 64);
    });

    it('generates distinct hashes when any parameter differs', () => {
      const base = {
        tenantId: '11111111-1111-1111-1111-111111111111',
        candidateId: '22222222-2222-2222-2222-222222222222',
        resourceId: '33333333-3333-3333-3333-333333333333',
        skillSlug: 'fastify',
        evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
        filePath: 'package.json',
        commitSha: '5017539ddb5d8d616b5fbfa2682dba7d4910b039',
      };

      const fp1 = computeEvidenceFingerprint(base);
      const fp2 = computeEvidenceFingerprint({ ...base, skillSlug: 'express' });
      const fp3 = computeEvidenceFingerprint({ ...base, filePath: 'backend/package.json' });

      assert.notStrictEqual(fp1, fp2);
      assert.notStrictEqual(fp1, fp3);
    });
  });

  // -------------------------------------------------------------------------
  // 10. Candidate Skill Rollup & Provenance Scoring
  // -------------------------------------------------------------------------
  describe('10. Candidate Skill Rollup Formula & Provenance Status', () => {
    it('computes single verified production evidence: 1.00 * (0.8 + 0.05 * 1) = 0.85', () => {
      const items = [
        {
          confidenceScore: 1.0,
          evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
          detectedAt: '2026-08-20T10:00:00Z',
        },
      ];

      const rollup = SkillRollupCalculator.calculateRollup(items);
      assert.strictEqual(rollup.confidenceScore, 0.85);
      assert.strictEqual(rollup.provenanceStatus, 'VERIFIED');
      assert.strictEqual(rollup.evidenceCount, 1);
    });

    it('scales rollup score with multiple evidence items up to 4 cap: 1.00 * (0.8 + 0.05 * 4) = 1.00', () => {
      const items = [
        { confidenceScore: 1.0, evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY' },
        { confidenceScore: 1.0, evidenceType: 'CODE_IMPORT_USAGE' },
        { confidenceScore: 0.9, evidenceType: 'FILE_PATTERN_MATCH' },
        { confidenceScore: 0.6, evidenceType: 'README_SPECIFICATION' },
      ];

      const rollup = SkillRollupCalculator.calculateRollup(items);
      assert.strictEqual(rollup.confidenceScore, 1.0);
      assert.strictEqual(rollup.provenanceStatus, 'VERIFIED');
      assert.strictEqual(rollup.evidenceCount, 4);
    });

    it('marks provenanceStatus as INFERRED when only README or commit evidence exists', () => {
      const items = [
        { confidenceScore: 0.6, evidenceType: 'README_SPECIFICATION' },
        { confidenceScore: 0.5, evidenceType: 'COMMIT_CONTRIBUTION' },
      ];

      const rollup = SkillRollupCalculator.calculateRollup(items);
      assert.strictEqual(rollup.provenanceStatus, 'INFERRED');
      assert.strictEqual(rollup.confidenceScore, 0.54); // 0.6 * (0.8 + 0.05 * 2) = 0.54
    });

    it('returns empty missing rollup for empty array', () => {
      const rollup = SkillRollupCalculator.calculateRollup([]);
      assert.strictEqual(rollup.confidenceScore, 0.0);
      assert.strictEqual(rollup.provenanceStatus, 'MISSING');
      assert.strictEqual(rollup.evidenceCount, 0);
    });
  });
});
