# Architecture & Security Specification: GitHub Evidence Extractor (`P4-003A`)

**Document ID**: `ARCH-008`  
**Task Reference**: `P4-003A`  
**Status**: APPROVED  
**Target Implementation**: `P4-003` (`src/services/extractors/`)  
**Parent Models**: Unified Candidate / Resource Model ([`docs/unified-candidate-resource-model.md`](file:///c:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/docs/unified-candidate-resource-model.md)), Domain Schemas ([`src/domain/candidate/candidate.schemas.js`](file:///c:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/src/domain/candidate/candidate.schemas.js)), Database Schema ([`src/db/schema.js`](file:///c:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/src/db/schema.js))  
**Connector Source**: `GitHubAppConnector` ([`src/connectors/github/github-connector.js`](file:///c:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/src/connectors/github/github-connector.js))  

---

## 1. Executive Summary & Objective

In **Phase 3**, we built deep repository inspection tools (`getRepositoryTree`, `getFileContent`, `getLanguages`, `getRecentCommits`, `getReadme`) equipped with LRU caching, rate-limit tracking, and ETag revalidation. In **P4-001** and **P4-002**, we formalized and migrated the canonical 8-table domain model (`candidates`, `candidate_identities`, `resources`, `projects`, `project_resources`, `skills`, `candidate_skills`, `evidence_items`).

Task **P4-003** bridges raw repository data with the candidate evidence graph:
1. **Manifest Extraction**: Parses multi-ecosystem package manifests (`package.json`, `requirements.txt`, `Pipfile`, `pyproject.toml`, `go.mod`, `Cargo.toml`).
2. **Import & Code Pattern Extraction**: Scans entrypoint source code for verified library import declarations without executing untrusted code.
3. **Infrastructure & Tool Pattern Extraction**: Detects Docker, CI/CD pipelines, ORM configs, and framework configuration files.
4. **Contribution & Commit Analysis**: Extracts verified author contributions and commit signals.
5. **Taxonomy Mapping & Normalization**: Maps raw ecosystem dependencies (e.g. `@fastify/cors`, `pg`, `psycopg2`, `gorm.io/gorm`, `tokio`) to canonical global skill slugs (`fastify`, `postgresql`, `gorm`, `tokio`).
6. **Secret & PII Redaction**: Scrubs credentials, API keys, private keys, and sensitive tokens from excerpts ($\le 1024$ chars).
7. **Deterministic Deduplication & Evidence Persistence**: Generates unique evidence fingerprints and rolls up evidence into `CandidateSkill` metrics with confidence scoring ($0.00$ to $1.00$).

This document defines the strict threat model, security boundaries, parser contracts, confidence heuristics, deduplication algorithms, and execution bounds required to turn untrusted third-party repository data into immutable, verified career evidence.

---

## 2. Threat Model & Untrusted Content Security Invariants

Third-party repository content (package manifests, configuration files, commit messages, and source snippets) is inherently untrusted. The extractor must defend against the following threat vectors:

```
+-------------------------------------------------------------------------------+
|                       UNTRUSTED GITHUB REPOSITORY DATA                         |
+-------------------------------------------------------------------------------+
       |                                                               |
       v                                                               v
 [Malicious JSON / Manifests]                            [Planted Secrets / Poisoning]
  * Prototype pollution (__proto__)                       * Accidental/malicious API keys
  * JSON bombs / deeply nested objects                    * Private RSA/EC keys & JWTs
  * ReDoS in dependency version specs                     * Excerpt bloat / database DoS
       |                                                               |
       +-------------------------------+-------------------------------+
                                       |
                                       v
                     +-----------------------------------+
                     |  SECURITY & EXTRACTION SANITIZER  |
                     |  - Safe JSON / TOML parsers       |
                     |  - Secret scrubber & PII stripper |
                     |  - Excerpt ceiling (<= 1024 B)    |
                     |  - Linear non-backtracking RegEx  |
                     |  - Zero code execution (no eval)  |
                     +-----------------------------------+
                                       |
                                       v
                     +-----------------------------------+
                     |   CANONICAL DOMAIN EVIDENCE GRAPH |
                     |   (Single-Tenant, Verified Only)  |
                     +-----------------------------------+
```

### 2.1. Zero Code Execution & AST Safety
* **Hard Rule**: The extractor **MUST NEVER** evaluate, execute, interpret, or dynamically import untrusted repository content.
* **Prohibited APIs**: `eval()`, `new Function()`, `vm.runInContext()`, `child_process.exec()`, `worker_threads`, or spawning external language runtimes (e.g. `node`, `python`, `cargo`, `go`).
* **Approved Method**: Pure text-based, declarative parsing using safe JSON parsers, deterministic line-by-line scanners, and strictly bounded, linear non-backtracking regular expressions.

### 2.2. Prototype Pollution & JSON Bomb Defense
* **Manifest Parsing**: `package.json` parsing must filter out dangerous keys (`__proto__`, `constructor`, `prototype`).
* **Object Creation**: Internal dictionaries and maps must use `Object.create(null)` or `Map` to eliminate prototype inheritance poisoning.
* **Nesting Depth Ceiling**: Manifest objects nested beyond **5 levels** are rejected.

### 2.3. Regular Expression Denial of Service (ReDoS) Defense
* All manifest and import regexes must be provably linear ($O(N)$) with zero nested quantifiers (e.g. no `(a+)+` or `([a-zA-Z0-9_.-]+)+`).
* Input lines evaluated against regexes are truncated to a maximum of **500 characters** per line.
* Total lines scanned per file are capped at **1,000 lines**.

### 2.4. Secret & Credential Redaction (Mandatory Gate)
* Every evidence excerpt ($\le 1024$ characters) must pass through a dedicated `SecretScrubber` before being saved to `evidence_items.excerpt`.
* **Redacted Patterns**:
  * GitHub Personal Access Tokens & App Tokens (`ghp_*`, `gho_*`, `ghu_*`, `ghs_*`, `ghr_*`)
  * RSA, EC, OpenSSH, PGP Private Keys (`-----BEGIN [A-Z ]*PRIVATE KEY-----`)
  * AWS Access Key IDs (`AKIA[0-9A-Z]{16}`) & Secret Keys
  * Bearer JWTs (`Bearer [A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*`)
  * Generic API Keys / Secrets (`api[_-]?key\s*[:=]\s*['"][a-zA-Z0-9_\-]{16,}['"]`)
  * Connection Strings (`postgres://user:pass@host/db`, `mongodb+srv://...`)
* Redacted matches are replaced with `[REDACTED_SECRET]` and logged at `logger.warn` with source location metadata (no raw tokens logged).

### 2.5. Memory and Processing Limits
* **Maximum Manifests per Repo**: 10 manifests.
* **Maximum Source Files Scanned**: 25 files.
* **Maximum File Content Scanned**: 50 KB per file.
* **Maximum Extracted Evidence Items**: 250 items per repository extraction run.
* **Execution Timeout**: 5,000 ms per repository extraction run.

---

## 3. Multi-Ecosystem Manifest Parsing Specifications

The extractor implements modular, isolated parsers for each supported technology ecosystem:

```
src/services/extractors/
├── github-evidence-extractor.service.js   # Orchestrator & graph synthesizer
├── manifest-parsers/
│   ├── base-manifest-parser.js           # Abstract parser contract
│   ├── node-manifest-parser.js           # package.json
│   ├── python-manifest-parser.js         # requirements.txt, pyproject.toml, Pipfile
│   ├── go-manifest-parser.js             # go.mod
│   └── rust-manifest-parser.js           # Cargo.toml
├── code-scanners/
│   └── import-scanner.js                 # AST/Regex code import scanner
├── taxonomy/
│   └── taxonomy-mapper.js                # Package-to-Skill normalizer
└── security/
    └── secret-scrubber.js                # High-entropy credential scrubber
```

### 3.1. Node.js / JavaScript / TypeScript (`package.json`)
* **Target Files**: `package.json`, `**/package.json` (monorepo packages).
* **Extracted Sections**:
  * `dependencies`: Production dependencies $\rightarrow$ Confidence `1.00`, Evidence Type `PACKAGE_MANIFEST_DEPENDENCY`.
  * `devDependencies`: Build/test dependencies $\rightarrow$ Confidence `0.75`, Evidence Type `PACKAGE_MANIFEST_DEPENDENCY`.
  * `peerDependencies`: Library integration dependencies $\rightarrow$ Confidence `0.75`, Evidence Type `PACKAGE_MANIFEST_DEPENDENCY`.
  * `engines`: Runtime requirements (e.g. `node: ">=20.0.0"`) $\rightarrow$ Confidence `0.90`, Evidence Type `PACKAGE_MANIFEST_DEPENDENCY`.
* **Sanitization**: Discards scripts, configurations, author fields, private repository URLs, and credentials.

### 3.2. Python (`requirements.txt`, `Pipfile`, `pyproject.toml`)
* **`requirements.txt` / `*-requirements.txt`**:
  * Line-by-line streaming parser.
  * Strips comments (`# ...`) and whitespace.
  * Strips version specifiers (`==`, `>=`, `<=`, `~=`, `!=`, `<`, `>`).
  * Strips environment markers (`; python_version >= '3.10'`, `; sys_platform == 'linux'`).
  * Strips extras (`fastapi[all]` $\rightarrow$ `fastapi`).
  * **Safety Rejections**: Ignores `-r include.txt`, `-e /local/path`, `-i https://...`, `--extra-index-url`, and `git+https://...` lines to prevent injection or SSRF vectors.
* **`pyproject.toml` & `Pipfile`**:
  * Safe line-based TOML section scanner (extracts `dependencies`, `[project.dependencies]`, `[tool.poetry.dependencies]`, `[packages]`, `[dev-packages]`).

### 3.3. Go (`go.mod`)
* **Target File**: `go.mod`.
* **Extracted Sections**:
  * Direct dependencies in `require (...)` blocks or single `require` lines $\rightarrow$ Confidence `1.00`, Evidence Type `PACKAGE_MANIFEST_DEPENDENCY`.
  * Indirect dependencies marked with `// indirect` $\rightarrow$ Confidence `0.60`, Evidence Type `PACKAGE_MANIFEST_DEPENDENCY`.
  * Go toolchain version (e.g. `go 1.22`) $\rightarrow$ Confidence `1.00`, canonical skill `go`.
* **Safety Rules**: Strips `replace` and `retract` directives; ignores local directory paths.

### 3.4. Rust (`Cargo.toml`)
* **Target File**: `Cargo.toml`.
* **Extracted Sections**:
  * `[dependencies]`: Production crates $\rightarrow$ Confidence `1.00`, Evidence Type `PACKAGE_MANIFEST_DEPENDENCY`.
  * `[dev-dependencies]`: Test/bench crates $\rightarrow$ Confidence `0.75`, Evidence Type `PACKAGE_MANIFEST_DEPENDENCY`.
  * `[build-dependencies]`: Build crates $\rightarrow$ Confidence `0.75`, Evidence Type `PACKAGE_MANIFEST_DEPENDENCY`.
  * `[workspace.dependencies]`: Monorepo shared crates $\rightarrow$ Confidence `0.90`, Evidence Type `PACKAGE_MANIFEST_DEPENDENCY`.

---

## 4. Code Import & Infrastructure Pattern Matching

### 4.1. Safe Code Import Scanning (`CODE_IMPORT_USAGE`)
When entrypoint source files are identified from directory trees (`index.js`, `server.ts`, `app.py`, `main.go`, `main.rs`, `lib.rs`), the extractor performs safe import scanning:
* **JS/TS**: `import\s+.*\s+from\s+['"]([^'"]+)['"]` and `require\(['"]([^'"]+)['"]\)`
* **Python**: `import\s+([a-zA-Z0-9_]+)` and `from\s+([a-zA-Z0-9_]+)\s+import`
* **Go**: `import\s+['"]([^'"]+)['"]` and `import\s*\(\s*([^)]+)\s*\)`
* **Rust**: `use\s+([a-zA-Z0-9_]+)::` and `extern\s+crate\s+([a-zA-Z0-9_]+)`
* **Confidence**: `1.00` (Proves the dependency is not just listed in a manifest, but actively imported in executable code).

### 4.2. Infrastructure & Configuration Pattern Matching (`FILE_PATTERN_MATCH`)
Detects operational and architectural skills from configuration artifacts:

| File Pattern / Artifact | Inferred Canonical Skill | Category | Confidence |
| :--- | :--- | :--- | :--- |
| `Dockerfile`, `Containerfile` | `docker` | `CLOUD_DEVOPS` | `0.90` |
| `docker-compose.yml`, `compose.yaml` | `docker-compose` | `CLOUD_DEVOPS` | `0.90` |
| `.github/workflows/*.yml` | `github-actions` | `CLOUD_DEVOPS` | `0.85` |
| `.gitlab-ci.yml` | `gitlab-ci` | `CLOUD_DEVOPS` | `0.85` |
| `k8s/*.yaml`, `kubernetes/*.yaml`, `helm/*` | `kubernetes` | `CLOUD_DEVOPS` | `0.85` |
| `terraform/*.tf`, `main.tf` | `terraform` | `CLOUD_DEVOPS` | `0.85` |
| `tsconfig.json` | `typescript` | `LANGUAGE` | `0.95` |
| `drizzle.config.js`, `drizzle.config.ts` | `drizzle-orm` | `DATABASE` | `0.90` |
| `prisma/schema.prisma` | `prisma` | `DATABASE` | `0.90` |
| `tailwind.config.js`, `tailwind.config.ts` | `tailwindcss` | `FRAMEWORK` | `0.90` |
| `vitest.config.ts`, `jest.config.js` | `vitest` / `jest` | `TOOL` | `0.85` |

---

## 5. Commit Contribution & Authorship Attribution

When extracting contribution evidence from commit histories:
* **Authorship Verification**: The extractor only creates `COMMIT_CONTRIBUTION` evidence if the commit author matches the candidate:
  * `commit.author.login === candidateIdentity.externalUsername` OR
  * `commit.author.email === candidateIdentity.externalEmail` OR
  * `commit.author.email === candidate.canonicalEmail`
* **Conventional Commit Signal Extraction**:
  * Analyzes commit messages matching `^(feat|fix|refactor|perf|test)\(([^)]+)\): (.+)$`.
  * Extracts scope and component keywords to infer active development areas (e.g. `feat(auth): add OAuth PKCE flow` $\rightarrow$ `oauth`, `security`).
  * **Confidence**: `0.50` (`INFERRED`).

---

## 6. Canonical Skill Taxonomy & Normalization Engine

Raw ecosystem package identifiers must be mapped deterministically to normalized global `Skill` records:

```
+------------------------------------+
| Raw Dependency Identifier          |
| (e.g. "@fastify/cookie", "pg")     |
+------------------------------------+
                  |
                  v
+------------------------------------+
| Taxonomy Normalizer Engine         |
| 1. Ecosystem Scope Stripping       |
| 2. Synonym / Alias Mapping Table   |
| 3. Taxonomy Slug Lookup            |
+------------------------------------+
                  |
                  v
+------------------------------------+
| Canonical Global Skill             |
| slug: "fastify"                    |
| name: "Fastify"                    |
| category: "FRAMEWORK"              |
+------------------------------------+
```

### 6.1. Taxonomy Normalization Rules
1. **Scope Removal**: `@fastify/cors` $\rightarrow$ `fastify`, `@angular/core` $\rightarrow$ `angular`, `@nestjs/common` $\rightarrow$ `nestjs`.
2. **Driver to Engine Mapping**: `pg`, `pg-promise`, `psycopg2`, `asyncpg`, `pq`, `libpq` $\rightarrow$ `postgresql` (`DATABASE`).
3. **ORM / Abstraction Mapping**: `drizzle-orm` $\rightarrow$ `drizzle-orm`, `sqlalchemy` $\rightarrow$ `sqlalchemy`, `gorm.io/gorm` $\rightarrow$ `gorm`, `diesel` $\rightarrow$ `diesel`.
4. **Web Frameworks**: `express` $\rightarrow$ `express`, `fastapi` $\rightarrow$ `fastapi`, `gin-gonic/gin` $\rightarrow$ `gin`, `actix-web` $\rightarrow$ `actix-web`, `tokio` $\rightarrow$ `tokio`.
5. **Fallback Strategy**: For unmapped packages, the normalizer creates or references a clean alphanumeric slug (`package-name`), assigned to category `'TOOL'` with unverified provenance.

---

## 7. Confidence Scoring & Provenance Matrix

Every extracted evidence item receives a structured confidence score and provenance status:

| Evidence Type | Source Scenario | Provenance Status | Confidence Score |
| :--- | :--- | :--- | :--- |
| `PACKAGE_MANIFEST_DEPENDENCY` | Direct production dependency in manifest | `VERIFIED` | `1.00` |
| `CODE_IMPORT_USAGE` | Verified `import` / `require` in source code | `VERIFIED` | `1.00` |
| `PACKAGE_MANIFEST_DEPENDENCY` | Runtime engine specification (`node >= 20`) | `VERIFIED` | `0.90` |
| `FILE_PATTERN_MATCH` | Framework configuration (`tsconfig.json`, `drizzle.config.js`) | `VERIFIED` | `0.90` |
| `FILE_PATTERN_MATCH` | Infrastructure configuration (`Dockerfile`, CI workflows) | `VERIFIED` | `0.85` |
| `PACKAGE_MANIFEST_DEPENDENCY` | `devDependencies` / `dev-dependencies` in manifest | `VERIFIED` | `0.75` |
| `PACKAGE_MANIFEST_DEPENDENCY` | `// indirect` Go module dependency | `INFERRED` | `0.60` |
| `README_SPECIFICATION` | Documented technology stack in `README.md` | `INFERRED` | `0.60` |
| `COMMIT_CONTRIBUTION` | Verified conventional commit message contribution | `INFERRED` | `0.50` |
| `DIRECTORY_STRUCTURE` | Architectural folder layout (`src/connectors/base/`) | `INFERRED` | `0.40` |
| `DOCUMENT_CLAIM` | Unverified resume or manual text claim | `CLAIMED` | `0.20` |

---

## 8. Deduplication & Evidence Persistence Algorithm

To prevent duplicating evidence records across repeated extractions or incremental webhook pushes:

### 8.1. Deterministic Evidence Fingerprint
Each evidence item computes a SHA-256 fingerprint:
$$\text{Fingerprint} = \text{SHA256}(\text{tenantId} + ":" + \text{candidateId} + ":" + \text{resourceId} + ":" + \text{skillSlug} + ":" + \text{evidenceType} + ":" + \text{filePath} + ":" + \text{commitSha})$$

### 8.2. Upsert Semantics
* If an evidence item with the same fingerprint exists in `evidence_items`:
  * Update `detected_at = NOW()`.
  * Update `confidence_score = MAX(existing.confidence_score, new.confidence_score)`.
  * Update `metadata = MERGE(existing.metadata, new.metadata)`.
  * Retain original `created_at` and `id`.
* Otherwise, insert a new `evidence_items` record.

### 8.3. CandidateSkill Rollup Aggregation
After evidence extraction finishes for a repository:
1. Query all `evidence_items` for `(tenantId, candidateId, skillId)`.
2. Compute `evidenceCount = COUNT(evidence_items)`.
3. Compute `firstObservedAt = MIN(detected_at)` and `lastObservedAt = MAX(detected_at)`.
4. Determine `provenanceStatus`:
   * `VERIFIED` if any evidence has status `VERIFIED` and confidence $\ge 0.75$.
   * `INFERRED` if only inferred evidence exists.
   * `CLAIMED` if only manual claims exist.
5. Compute Rollup `confidenceScore`:
   $$\text{RollupScore} = \min\left(1.0, \max(\text{item.confidenceScore}) \times (0.8 + 0.05 \times \min(4, \text{evidenceCount}))\right)$$
6. Upsert into `candidate_skills` table using composite unique constraint `(tenant_id, candidate_id, skill_id)`.

---

## 9. Verification & Testing Strategy for P4-003

1. **Unit Tests (`tests/unit/github-evidence-extractor.test.js`)**:
   * Test parsing valid `package.json`, `requirements.txt`, `go.mod`, `Cargo.toml`.
   * Test adversarial inputs: JSON prototype pollution, ReDoS strings, oversized manifests (>1 MB), malformed TOML/YAML.
   * Test secret scrubber with simulated AWS keys, GitHub tokens, private keys, and connection strings.
   * Test taxonomy normalization mappings across 50+ packages.
   * Test confidence scoring calculations and rollup formulas.
2. **Integration Tests (`tests/integration/github-evidence-extractor.test.js`)**:
   * Mock deep repository inspection payload containing realistic multi-language repository trees.
   * Execute full extraction pipeline against live test tenants and candidates in Aiven PostgreSQL.
   * Verify created `evidence_items`, `candidate_skills`, and `skills` taxonomy rows.
   * Assert zero secrets in excerpts, strict tenant isolation, and idempotent re-extraction.
3. **Quality Gates**:
   * `npm run test:unit` $\rightarrow$ PASS
   * `npm run test:integration` $\rightarrow$ PASS
   * `npm run lint` $\rightarrow$ 0 errors
   * `npm run format:check` $\rightarrow$ PASS
   * `npm run db:check` $\rightarrow$ PASS

---

## 10. Summary Decision & Architectural Approval

Task **P4-003A** is **APPROVED**. The extractor architecture provides complete mathematical confidence scoring, zero-code-execution safety, multi-ecosystem manifest parsing, radical secret redaction, deterministic deduplication, and strict multi-tenant isolation.
