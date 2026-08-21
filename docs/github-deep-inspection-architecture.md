# Architecture & Security Specification: GitHub Deep Repository Inspection (`P3-005A`)

**Document ID**: `ARCH-P3-005A`  
**Task Reference**: `P3-005A`  
**Status**: APPROVED  
**Target Implementation**: `P3-005` (`src/connectors/github/github-connector.js` & deep inspection tools)  
**Parent Framework**: `BaseResourceConnector` ([`src/connectors/base/resource-connector.js`](file:///c:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/src/connectors/base/resource-connector.js))  
**Authentication Infrastructure**: `GitHubAppAuthManager` ([`src/connectors/github/auth.js`](file:///c:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/src/connectors/github/auth.js))  

---

## 1. Executive Summary & Objective

In Task **P3-004**, we established the core repository discovery and account metadata operations (`getAccount`, `listResources`, `getResource`). In Task **P3-005**, the platform must inspect repository internals to support Phase 4 skill and project evidence extraction:
1. **`getReadme(context, credentials, externalResourceId)`**: Extracts and decodes the repository's root documentation (`README.md`).
2. **`getRepositoryTree(context, credentials, externalResourceId, options)`**: Crawls the repository directory hierarchy to discover project structures, manifests (`package.json`, `Cargo.toml`, `go.mod`, `requirements.txt`), and architecture boundaries.
3. **`getLanguages(context, credentials, externalResourceId)`**: Retrieves the byte-level breakdown of programming languages used across the repository.
4. **`getRecentCommits(context, credentials, externalResourceId, options)`**: Inspects recent commit messages, authors, and timestamps to establish activity timelines and skill recency.
5. **`getFileContent(context, credentials, externalResourceId, path, options)`**: Fetches targeted file contents for manifest analysis and structural inspection.

This document defines the strict security invariants, memory bounds, size caps, rate-limiting guards, and data retention policies required to prevent denial-of-service (DoS), memory exhaustion (OOM), secret leakage, path traversal, and unauthorized data ingestion when inspecting third-party repositories.

---

## 2. Core Security & Architectural Invariants

### 2.1. File Size Limits & Text Bounds
* **Single File Maximum Size**: Single file inspection (`getFileContent`, `getReadme`) enforces a strict hard ceiling of **1 MB (1,048,576 bytes)**.
* **Manifest Inspection Target**: Package manifests and config files (`package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`) are typically < 50 KB. Any file exceeding 1 MB is rejected with `ValidationError('File size exceeds maximum allowable limit of 1MB', 'FILE_TOO_LARGE')` to prevent memory buffer bloat.
* **README Cap**: README markdown content is capped at **256 KB (262,144 bytes)**. If an upstream README exceeds this size, only the first 256 KB is returned, accompanied by a `truncated: true` metadata flag.

### 2.2. Directory Tree Depth & File Count Limits
* **Maximum Tree Depth**: Recursive tree crawls are capped at a maximum depth of **10 nested directory levels**.
* **Maximum Tree Entries**: A single tree inspection returns a maximum of **1,000 entries (files + directories)**.
* **GitHub Git Trees API**: Uses `GET /repos/:owner/:repo/git/trees/:tree_sha?recursive=1` (or default branch HEAD).
* **Truncation Defense**: If GitHub returns `truncated: true` (indicating a repository with > 100,000 files or multi-MB tree objects), the connector logs an operational warning, returns only the safe first 1,000 items, and marks `isTruncated: true` in `NormalizedDirectoryTree` without crashing.

### 2.3. Binary & Compiled Asset Filtering
* **Extension Blocklist**: Non-code binaries, media, archives, and compiled artifacts are automatically filtered out during tree traversals and blocked from file content reading:
  * *Images/Audio/Video*: `.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.ico`, `.webp`, `.mp4`, `.mp3`, `.wav`
  * *Archives/Executables*: `.zip`, `.tar`, `.gz`, `.7z`, `.rar`, `.exe`, `.dll`, `.so`, `.dylib`, `.bin`
  * *Documents/Fonts*: `.pdf`, `.doc`, `.docx`, `.woff`, `.woff2`, `.ttf`, `.eot`
  * *Build Artifacts*: `.class`, `.pyc`, `.o`, `.a`, `.wasm`
* **Null-Byte Binary Sniffing**: If a file lacks a recognized extension, the connector inspects the first 512 bytes. If a null byte (`0x00`) is encountered, the file is identified as binary and reading is aborted with `ValidationError('Binary files cannot be read as text', 'BINARY_FILE_REJECTED')`.

### 2.4. Symlinks & Path Escape Defense
* **Git Mode Verification**: In GitHub's Git Trees API, symbolic links are denoted by mode `120000`.
* **Symlink Exclusion**: All symlink entries (`mode === '120000'`) are explicitly excluded from tree traversal results and blocked from `getFileContent()` to eliminate circular reference loops, path traversal escapes, and confused deputy file reading.
* **Strict POSIX Path Normalization**:
  * All input file paths (`options.path`) are sanitized via `path.posix.normalize(path)`.
  * Absolute paths (starting with `/`), paths containing `..` (directory traversal), null bytes (`%00` / `\0`), and Windows backslashes (`\`) are rejected with `400 ValidationError('Invalid file path', 'INVALID_FILE_PATH')`.

### 2.5. Commit History Extraction & Pagination
* **Maximum History Window**: Commit inspections (`getRecentCommits`) return a maximum of **100 commits** per repository.
* **Default Window**: Default pagination limit is **30 commits**.
* **Commit Message Normalization**: Commit messages are pruned to the first 500 characters to prevent multi-megabyte merge dump injections.
* **Author PII Protection**: Author details extract only GitHub login, display name, and commit timestamp. Private user emails (e.g. `user@users.noreply.github.com` or personal emails) are omitted from public domain payloads and redacted in logs.

### 2.6. Rate Limit Protection & Conditional Caching Prep (P3-006 Alignment)
* **Quota Budgeting**: Deep inspection operations consume GitHub REST rate-limit quota (5,000 req/hr per installation).
* **Header Forwarding & Parsing**: Every request inspects `x-ratelimit-remaining`, `x-ratelimit-reset`, and `ETag`.
* **Conditional Ingress**: Stores upstream `ETag` values in responses so Phase 3 Task P3-006 can pass `If-None-Match: <etag>` and receive `304 Not Modified` with zero quota cost.

### 2.7. Source Code Retention Policy
* **Ephemeral In-Memory Processing**: The platform does **NOT** clone full repositories or persist entire source code repositories in PostgreSQL.
* **Extraction Boundary**: In Phase 4/5, candidate skill extractors parse manifests and AST nodes in-memory and store only extracted skill tokens with verified file path and commit SHA evidence references ([`EvidenceId`](file:///c:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/project.md#L144)). Raw repository file trees and code blobs are discarded after analysis.

### 2.8. PII & Secret Redaction
* **Log Redaction**: Pino structured logger redacts all file contents, commit messages, authorization tokens (`ghs_*`), and private keys.
* **Secret Scanning Safety**: If a file being inspected happens to contain API keys (e.g. accidentally committed `.env`), connector errors and logs strictly redact all message payloads and never echo raw contents to error envelopes.

---

## 3. Deep Inspection Endpoints & Operation Specifications

### 3.1. `getReadme(context, credentials, externalResourceId)`

* **Upstream GitHub Endpoint**: `GET /repos/:owner/:repo/readme`
* **Headers**: `Accept: application/vnd.github+json`, `Authorization: Bearer <installation_token>`
* **Response Mapping to `NormalizedReadme`**:
  ```typescript
  interface NormalizedReadme {
    name: string;             // e.g. "README.md"
    path: string;             // e.g. "README.md"
    sha: string;              // Git blob SHA
    size: number;             // File size in bytes
    content: string;          // Decoded UTF-8 markdown text (capped at 256KB)
    encoding: 'utf-8';
    downloadUrl: string;      // Raw GitHub URL
    truncated: boolean;       // True if original exceeded 256KB
  }
  ```
* **Base64 Decoding**: Upstream GitHub README payloads return Base64 content with newlines. The connector strips whitespace, decodes safely using `Buffer.from(data.content, 'base64').toString('utf8')`, and enforces the 256KB cap.
* **404 Handling**: If a repository has no README, returns `null` (or `{ exists: false }`) rather than failing as a catastrophic connector error.

---

### 3.2. `getRepositoryTree(context, credentials, externalResourceId, options)`

* **Upstream GitHub Endpoint**: `GET /repos/:owner/:repo/git/trees/:tree_sha?recursive=1`
* **Default `tree_sha`**: Resolved dynamically from the repository's `default_branch` HEAD commit (or passes `HEAD`).
* **Filtering & Normalization**:
  - Filters out Git symlinks (`mode === '120000'`).
  - Filters out binary/media extensions.
  - Limits output to maximum 1,000 entries.
  - Limits tree depth to 10 directory levels.
* **Response Mapping to `NormalizedDirectoryTree`**:
  ```typescript
  interface NormalizedTreeEntry {
    path: string;             // Normalized relative POSIX path (e.g. "src/index.js")
    mode: string;             // "100644" (blob) or "040000" (tree)
    type: 'blob' | 'tree';
    sha: string;              // Git SHA
    size?: number;            // Size in bytes (for blobs)
    depth: number;            // 1-indexed directory nesting depth
  }

  interface NormalizedDirectoryTree {
    sha: string;              // Root tree SHA
    entries: NormalizedTreeEntry[];
    totalEntries: number;
    truncated: boolean;       // True if upstream exceeded GitHub or connector entry limits
  }
  ```

---

### 3.3. `getLanguages(context, credentials, externalResourceId)`

* **Upstream GitHub Endpoint**: `GET /repos/:owner/:repo/languages`
* **Behavior**: GitHub returns a JSON map of language names to total bytes of source code (e.g. `{"JavaScript": 124500, "TypeScript": 45000}`).
* **Response Mapping to `NormalizedLanguageBreakdown`**:
  ```typescript
  interface NormalizedLanguageBreakdown {
    languages: Array<{
      name: string;           // Language name (e.g. "JavaScript")
      bytes: number;          // Bytes of source code
      percentage: number;     // Percentage of codebase (0.0 to 100.0)
    }>;
    totalBytes: number;
    primaryLanguage: string | null;
  }
  ```

---

### 3.4. `getRecentCommits(context, credentials, externalResourceId, options)`

* **Upstream GitHub Endpoint**: `GET /repos/:owner/:repo/commits`
* **Query Parameters**:
  - `per_page`: Derived from `options.limit` (default: 30, max: 100).
  - `page`: 1-indexed page or SHA cursor pointer.
* **Response Mapping to `PaginatedResult<NormalizedCommit>`**:
  ```typescript
  interface NormalizedCommit {
    sha: string;              // Full 40-character Git commit SHA
    shortSha: string;         // First 7 characters
    message: string;          // Pruned commit summary (<500 chars)
    author: {
      login: string | null;   // GitHub username
      name: string;           // Display name
      date: Date;             // Commit timestamp
      avatarUrl: string | null;
    };
    htmlUrl: string;          // GitHub web commit URL
  }
  ```

---

### 3.5. `getFileContent(context, credentials, externalResourceId, path, options)`

* **Upstream GitHub Endpoint**: `GET /repos/:owner/:repo/contents/:path`
* **Path Validation**: `path` must pass POSIX normalization and cannot be empty or traverse outside the root.
* **Size Validation**: If `data.size > 1048576` (1 MB), throws `ValidationError('File size exceeds maximum allowable limit of 1MB', 'FILE_TOO_LARGE')`.
* **Binary Sniffing**: Rejects binary file extensions or null-byte contents.
* **Response Mapping to `NormalizedFileContent`**:
  ```typescript
  interface NormalizedFileContent {
    name: string;             // File name (e.g. "package.json")
    path: string;             // Relative path
    sha: string;              // Git blob SHA
    size: number;             // File size in bytes
    content: string;          // Decoded UTF-8 text
    encoding: 'utf-8';
    type: 'file';
  }
  ```

---

## 4. Capability Declarations for Deep Inspection

`GitHubAppConnector.getCapabilities()` will expand in Task P3-005 to include `CONNECTOR_CAPABILITIES.READ_CONTENT`:

```javascript
getCapabilities() {
  return new Set([
    CONNECTOR_CAPABILITIES.READ_ACCOUNT,
    CONNECTOR_CAPABILITIES.LIST_RESOURCES,
    CONNECTOR_CAPABILITIES.READ_RESOURCE,
    CONNECTOR_CAPABILITIES.READ_CONTENT,
    CONNECTOR_CAPABILITIES.REVOKE_ACCESS,
  ]);
}
```

---

## 5. Comprehensive Error Normalization Matrix

| Upstream Cause / Status | GitHub Response Pattern | Normalized Connector Error | HTTP Status | Retryable |
| :--- | :--- | :--- | :--- | :--- |
| **README Not Found** | 404 on `/readme` | Returns `null` (Non-exceptional) | 200 | N/A |
| **File Not Found** | 404 on `/contents/:path` | `ResourceNotFoundError('GITHUB_APP', path)` | 404 | `false` |
| **Empty Repository** | 409 Conflict / 404 on `/git/trees` | `ValidationError('Repository is empty or lacks commits', 'EMPTY_REPOSITORY')` | 400 | `false` |
| **File Too Large** | Upstream `size > 1MB` | `ValidationError('File exceeds 1MB limit', 'FILE_TOO_LARGE')` | 400 | `false` |
| **Binary File Detected** | Null-byte or blocked extension | `ValidationError('Binary files cannot be read as text', 'BINARY_FILE_REJECTED')` | 400 | `false` |
| **Invalid Path** | Path with `..` or leading `/` | `ValidationError('Invalid file path', 'INVALID_FILE_PATH')` | 400 | `false` |
| **Tree Too Large** | GitHub `truncated: true` | Returns safe first 1,000 entries + `truncated: true` | 200 | N/A |
| **Rate Limited** | 403 / 429 Rate Limit | `ProviderRateLimitError('GITHUB_APP', retryAfter, resetAt)` | 429 | `true` |

---

## 6. Testing & Live Verification Strategy

### 6.1. Unit Tests (`tests/unit/github-deep-inspection.test.js`):
* `getReadme()` Base64 decoding, size cap truncation, and 404 null handling.
* `getRepositoryTree()` directory depth capping, entry limit capping (1,000 max), and symlink removal.
* `getLanguages()` byte-to-percentage conversion and primary language detection.
* `getRecentCommits()` commit message pruning, author PII scrubbing, and pagination.
* `getFileContent()` path traversal rejection (`../`, leading `/`, `%00`), 1MB size limit rejection, and binary file rejection.

### 6.2. Mocked HTTP Tests:
* Mocked Git trees, README blobs, and language responses with zero external network egress.

### 6.3. Integration & Live Verification (`installation_id = 155430459`):
* Live verification against real repository `Ai-job-mcp` (`id: 1338724502` / `vishu1803/Ai-job-mcp`):
  1. `getReadme()` -> Verifies valid markdown string containing project overview.
  2. `getRepositoryTree()` -> Verifies tree structure containing `src/`, `package.json`, `README.md`.
  3. `getLanguages()` -> Verifies JavaScript/TypeScript byte breakdown.
  4. `getRecentCommits({ limit: 5 })` -> Verifies recent commit history.
  5. `getFileContent(..., 'package.json')` -> Verifies valid JSON manifest parsing.
  6. Path traversal safety probe (`getFileContent(..., '../../etc/passwd')`) -> Verifies immediate 400 rejection.

---

## 7. Approval & Sign-Off

* **Security Invariants Confirmed**: 1MB file cap, 256KB README cap, 1,000 tree entry limit, 10-level tree depth, symlink exclusion, binary filtering, POSIX path normalization, author PII redaction, ephemeral in-memory processing.
* **ADR Recorded**: `ADR-025` in [`docs/decisions.md`](file:///c:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/docs/decisions.md).
* **Final Verdict**: **`P3-005A APPROVED`**.
