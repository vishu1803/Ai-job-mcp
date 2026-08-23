# MCP Audit Logging Architecture & Security Review (ARCH-025)

**Document ID**: `ARCH-025`  
**Standard**: Model Context Protocol (MCP) Specification `2026-07-28`  
**Phase**: Phase 7 (Task P7-006A)  
**Parent Specification**: `docs/mcp-server-architecture.md` (`ARCH-022`)  
**Decision Record**: `docs/decisions.md` (`ADR-046`)  
**Status**: APPROVED  
**Author**: Antigravity Core Architecture & Security Team  
**Date**: 2026-08-24  

---

## 1. Executive Summary & Problem Context

The **Antigravity Career Hub** connects professionals' verified codebases, cloud storage, and credentials to external AI assistants (Google Gemini, Anthropic Claude, OpenAI ChatGPT, Cursor) via the Model Context Protocol (MCP 2026-07-28 standard). 

Following the completion of:
1. **MCP Server Foundation & Streamable HTTP Transport** (`P7-001`, `P7-002` / `ARCH-022`)
2. **Dedicated Personal MCP API Token Infrastructure** (`P7-003` / `ADR-043`)
3. **Career Read Tools** (`P7-004` / `ARCH-023` — `get_candidate_profile`, `list_verified_skills`, `inspect_project_evidence`, `analyze_job_fit`)
4. **Application Artifact Tools** (`P7-005` / `ARCH-024` — `recommend_portfolio_projects`, `draft_cover_letter`, `generate_tailored_resume`)

**Task P7-006A** conducts the **Architecture and Security Review for MCP Audit Logging**. 

### The Core Architectural Question
> *Is the existing PostgreSQL `audit_logs` table schema sufficient for MCP audit logging, or should new top-level columns or a separate second audit system (e.g., `mcp_audit_logs`) be introduced?*

### The Verdict & Executive Consensus
1. **Single Unified Audit Ledger**: We explicitly **REJECT** creating a separate `mcp_audit_logs` table. A single unified compliance ledger prevents schema fragmentation, unifies retention and purge policies, and simplifies compliance audits (SOC 2, ISO 27001, EU AI Act).
2. **Existing Schema is 100% Sufficient**: The existing `audit_logs` schema (`tenant_id`, `user_id`, `event_type`, `resource_type`, `resource_id`, `request_id`, `ip_address`, `user_agent`, `details` JSONB, `created_at`) fully satisfies all relational indexing and compliance needs. MCP-specific execution metrics (`durationMs`, `statusCode`, `errorCode`, `tokenPrefix`, `authMethod`, `protocolVersion`, `clientType`) map cleanly and performantly into the existing sanitized `details` JSONB envelope. Zero database migrations or breaking table alterations are required.
3. **Non-Blocking Asynchronous Persistence**: Audit logging must be non-blocking and failure-isolated so that transient database audit insert failures never crash MCP client tool invocations.

```
+-----------------------------------------------------------------------------------+
|                           EXTERNAL AI CLIENTS (GEMINI / CLAUDE)                   |
+-----------------------------------------+-----------------------------------------+
                                          |
                         POST /mcp (Streamable HTTP / JSON-RPC 2.0)
                         Header: MCP-Protocol-Version: 2026-07-28
                         Auth: Bearer mcp_live_4a8b...
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                        FASTIFY MCP TRANSPORT & SECURITY LAYER                     |
|   - Rate Limiting (IP / Tenant / Tool)   - Multi-Tenant Isolation (404 Default)  |
|   - Scope Assertions (read vs write)     - RBAC Role Checks (READONLY / MEMBER)   |
+-----------------------------------------+-----------------------------------------+
                                          |
                        McpRequestContext (Immutable Principal)
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                        MCP TOOL / RESOURCE / PROMPT DISPATCH                      |
|   - Career Read Tools (P7-004)           - Application Artifact Tools (P7-005)    |
|   - Pure In-Memory Service Delegation    - Dual-Layer Integrity Gate Audit        |
+-----------------------------------------+-----------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                 UNIFIED MCP AUDIT LOGGING SERVICE (P7-006)                        |
|   - Canonical Event Schemas (McpAuditEventSchema)                                 |
|   - Strict PII / Credential Sanitization (sanitizeAuditDetails <= 16 KB)          |
|   - Failure-Isolated Non-Blocking Async Ingestion                                 |
+-------------------+-------------------------------------+-------------------------+
                    |                                     |
                    v                                     v
+------------------------------------+  +------------------------------------+
|     OPERATIONAL LOGS (PINO)        |  |   COMPLIANCE AUDIT LEDGER (PG)     |
| - High-volume diagnostic logging   |  | - Table: audit_logs (PostgreSQL)   |
| - stdout / APM stream (JSON)       |  | - Immutable compliance records     |
| - Transient infrastructure metrics |  | - Tenant-partitioned & queryable   |
+------------------------------------+  +------------------------------------+
```

---

## 2. Regulatory Standards & Ecosystem Alignment

### 2.1 Compliance & Legal Requirements

| Standard / Framework | Requirement | Antigravity MCP Audit Implementation |
| :--- | :--- | :--- |
| **SOC 2 Type II (Trust Services Criteria)** | CC6.1, CC6.2, CC6.3: Audit trails capturing all user access, identity verification, authorization failures, and administrative actions. | Every MCP tool invocation, token lifecycle event, and denial is immutably logged with `tenant_id`, `user_id`, `request_id`, `ip_address`, and timestamp. |
| **ISO/IEC 27001:2022** | A.8.15 Logging, A.8.16 Monitoring: Logging of administrator and operator activities, access control decisions, and security events. | Immutable database audit records for all tool executions, role denials (403), rate limits (429), and token revocations. |
| **EU AI Act (2026/2027 Article 12)** | Automatic recording of events ("logs") over the AI system's lifecycle to ensure traceability of outputs and AI decisions. | Logs exact tool inputs (sanitized), matching scores, integrity gate statuses, and evidence IDs used in AI document generation without logging raw PII. |
| **GDPR (Article 32 / Article 17)** | Security of processing, data minimization, and right to erasure. | Audit details are sanitized via `sanitizeAuditDetails`, stripping raw resumes, passwords, private keys, and tokens. Tenant cascades support lawful erasure. |
| **Model Context Protocol (2026-07-28)** | Stateless JSON-RPC 2.0 Streamable HTTP logging and request tracing. | Correlates incoming `X-Request-Id` / `Mcp-Method` / `MCP-Protocol-Version` headers through to audit ledger entries. |

---

## 3. Architectural Analysis: Single Ledger vs. Second Audit System

We evaluated three potential architectural approaches for recording MCP audit trails:

### Approach A: Dedicated `mcp_audit_logs` Table (Rejected)
* **Description**: Create a new table specifically for MCP events (`id`, `tenant_id`, `user_id`, `tool_name`, `execution_time_ms`, `error_code`, `client_user_agent`, `protocol_version`, `arguments_json`, `result_json`).
* **Why Rejected**:
  1. **Schema Fragmentation**: Splits user activity into two separate tables (`audit_logs` for web/auth/github, `mcp_audit_logs` for MCP).
  2. **Complex Compliance Queries**: SOC 2 reports, tenant security audits, and user activity timelines would require expensive `UNION ALL` queries across disparate schemas.
  3. **Duplicate Maintenance**: Demands dual retention policies, dual partition managers, dual archival pipelines, and dual test suites.
  4. **Violation of Single Source of Truth**: Breaches the platform's core architectural principle of unified, provider-neutral domain models.

### Approach B: Modifying `audit_logs` with New Top-Level Columns (Rejected)
* **Description**: Alter `audit_logs` to add columns like `tool_name text`, `duration_ms integer`, `status_code integer`, `protocol_version text`.
* **Why Rejected**:
  1. **Schema Bloat**: Adds columns that are `NULL` for 80% of non-MCP events (e.g. OAuth logins, GitHub webhooks, connection deletions).
  2. **Unnecessary Migration Overhead**: Requires schema migrations on production databases without tangible performance benefits.
  3. **Loss of Extensibility**: Future tools (e.g. GitLab connectors, CLI agents) would require further column additions.

### Approach C: Unified `audit_logs` Table with Standardized JSONB Details (ACCEPTED)
* **Description**: Reuse the existing `audit_logs` table as the single source of truth for all platform security and compliance events. Map core relational axes (`tenant_id`, `user_id`, `event_type`, `resource_type`, `resource_id`, `request_id`, `ip_address`, `user_agent`, `created_at`) to existing indexed columns, and store structured, sanitized execution telemetry in the existing `details` JSONB envelope.
* **Why Accepted**:
  1. **Zero Database Migrations**: 100% backward-compatible with the existing production schema.
  2. **Unified Compliance Ledger**: Single table for all security queries, SIEM exports, and SOC 2 audits.
  3. **High Performance**: Existing indexes on `(tenant_id, created_at desc)`, `(tenant_id, event_type)`, and `(request_id)` cover all search and retrieval access patterns.
  4. **Flexible & Future-Proof**: JSONB accommodates evolving MCP protocol extensions without altering table definitions.

---

## 4. Database Schema Suitability Assessment

### 4.1 Existing `audit_logs` Table Definition (PostgreSQL 17+ / Drizzle ORM)

```typescript
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    eventType: text('event_type').notNull(),
    resourceType: text('resource_type').notNull(),
    resourceId: text('resource_id'),
    requestId: text('request_id'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    details: jsonb('details').default('{}').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_audit_logs_tenant_created').on(table.tenantId, table.createdAt.desc()),
    index('idx_audit_logs_tenant_event').on(table.tenantId, table.eventType),
    index('idx_audit_logs_request_id').on(table.requestId),
  ]
);
```

### 4.2 Comprehensive Column Mapping for MCP Events

| Database Column | Data Type | MCP Field Mapping | Example Value | Index Support |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | Auto-generated primary key | `f47ac10b-58cc-4372-a567-0e02b2c3d479` | Primary Key |
| `tenant_id` | `UUID` | `context.tenantId` (from authenticated token) | `a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d` | `idx_audit_logs_tenant_created`<br>`idx_audit_logs_tenant_event` |
| `user_id` | `UUID` | `context.userId` (from authenticated token) | `e5f6a1b2-c3d4-7a8b-9c0d-3a4b5c6d1e2f` | Foreign Key (Set Null) |
| `event_type` | `TEXT` | Canonical MCP audit event name | `'mcp.tool.completed'` | `idx_audit_logs_tenant_event` |
| `resource_type` | `TEXT` | Target MCP primitive category | `'mcp_tool'`, `'mcp_resource'`, `'mcp_prompt'`, `'mcp_api_token'` | Bounded cardinality |
| `resource_id` | `TEXT` | Specific tool, resource, or prompt name | `'generate_tailored_resume'`, `'list_verified_skills'` | Query filter |
| `request_id` | `TEXT` | `X-Request-Id` correlation UUID | `'755458e2-6434-40f0-b573-1d8324c291f7'` | `idx_audit_logs_request_id` |
| `ip_address` | `TEXT` | Client IP address (`req.ip` or forwarded header) | `'198.51.100.42'` | Audit investigation |
| `user_agent` | `TEXT` | AI Client identifier / SDK header | `'Claude-Desktop/1.0.0 (darwin-arm64)'` | Client breakdown |
| `details` | `JSONB` | Structured, sanitized execution telemetry | *(See JSONB envelope below)* | JSONB operators |
| `created_at` | `TIMESTAMPTZ` | Timestamp of event insertion | `2026-08-24T01:45:00.000Z` | `idx_audit_logs_tenant_created` |

---

## 5. Canonical MCP Audit Event Lifecycle & Taxonomy

### 5.1 Event Taxonomy

All MCP audit events follow the strict hierarchical dot-notation naming convention: `mcp.<category>.<action_or_verdict>`.

```
mcp
├── tool
│   ├── invoked         # Tool call received & validation started (optional/debug)
│   ├── completed       # Tool executed successfully (HTTP 200 / JSON-RPC result)
│   ├── denied          # Tool blocked by RBAC, scope, or rate limit (HTTP 403 / 429)
│   └── failed          # Tool failed due to invalid arguments or internal error (400 / 500)
├── resource
│   ├── listed          # Resource discovery requested (resources/list)
│   └── read            # Specific resource read (resources/read)
├── prompt
│   ├── listed          # Prompt discovery requested (prompts/list)
│   └── rendered        # Prompt template rendered (prompts/get)
├── token
│   ├── created         # Dedicated MCP API token generated
│   ├── revoked         # MCP API token revoked by user
│   ├── rotated         # MCP API token atomically rotated
│   ├── expired         # Request attempted with expired token
│   └── authentication_failed # Request attempted with invalid token or header
└── handshake
    ├── completed       # Protocol version negotiation successful
    └── denied          # Unsupported protocol version rejected (HTTP 400)
```

### 5.2 Standardized Structure of `details` (JSONB)

```json
{
  "protocolVersion": "2026-07-28",
  "mcpMethod": "tools/call",
  "toolName": "generate_tailored_resume",
  "role": "OWNER",
  "authMethod": "MCP_API_TOKEN",
  "tokenPrefix": "mcp_live_4a8b9c1d",
  "durationMs": 482,
  "statusCode": 200,
  "errorCode": null,
  "isError": false,
  "parameters": {
    "targetCandidateId": "123e4567-e89b-12d3-a456-426614174000",
    "jobTitle": "Senior Distributed Systems Engineer",
    "presentationMode": "PRESERVE_EXISTING"
  },
  "summary": {
    "totalBullets": 8,
    "verifiedBullets": 6,
    "inferredBullets": 2,
    "claimedBullets": 0,
    "integrityStatus": "PASS"
  }
}
```

---

## 6. Security & Threat Modeling for MCP Audit Logging

### 6.1 Threat Matrix & Mitigations

| Threat ID | Threat Vector | Potential Impact | Architectural Mitigation |
| :--- | :--- | :--- | :--- |
| **T-01** | **Credential & Token Leakage in Audit Trails** | Compromised API tokens or GitHub access keys visible to auditors or database admins. | Mandatory execution of `sanitizeAuditDetails()`. Strips all keys matching `PROHIBITED_KEYS` and `SENSITIVE_KEY_PATTERN`. Only 16-character `tokenPrefix` (e.g. `mcp_live_4a8b...`) is logged; raw tokens and SHA-256 hashes are never recorded in `audit_logs`. |
| **T-02** | **Candidate PII / Source Code Flooding** | Massive resume text or full repository code dumps exhausting database storage and leaking private IP. | Raw resumes (`resume`, `rawResume`), full source code (`sourceCode`, `fileContent`), and SSNs are explicitly stripped by `sanitizeAuditDetails()`. Only high-level counters, IDs, and match summaries are recorded. |
| **T-03** | **Audit Log Injection & Storage Exhaustion (DoS)** | Malicious client sending huge payloads or flood of requests to exhaust PostgreSQL disk space. | 1. Fastify request limit at 1 MB.<br>2. Multi-tier rate limiting (`McpRateLimiter`) blocks flooding before compute.<br>3. Hard cap of **16 KB** (`MAX_AUDIT_PAYLOAD_BYTES`) on any single audit `details` JSONB object. |
| **T-04** | **Cross-Tenant Audit Log Leakage** | Tenant A querying or inspecting audit trails belonging to Tenant B. | Mandatory `tenantId` parameterization on all audit repository lookups with strict 404 default-deny semantics. No cross-tenant lookups permitted. |
| **T-05** | **Audit Trail Tampering (Non-Repudiation)** | Malicious actor attempting to edit or delete incriminating tool invocation logs. | Append-only database constraints. The application layer provides zero `UPDATE` or unilateral `DELETE` routes on `audit_logs`. Deletion is strictly tied to tenant lifecycle cascade deletion. |
| **T-06** | **Audit Logging Cascading Failure** | Transient database failure during audit write causing user tool execution to fail or throw 500. | Audit logging runs in a failure-isolated `try/catch` block. If the database audit write fails, the error is logged to operational stderr/Pino, but the successful tool execution payload is safely delivered to the client. |

---

## 7. Operational Logging (Pino) vs. Compliance Audit Ledger (PostgreSQL)

The platform enforces a strict separation between **Operational Logs** and the **Compliance Audit Ledger**:

```
+------------------------+------------------------------------+------------------------------------+
| Dimension              | Operational Logs (Pino / stdout)   | Compliance Audit Ledger (Postgres) |
+------------------------+------------------------------------+------------------------------------+
| Primary Purpose        | Real-time monitoring, debugging,   | SOC 2 compliance, user visibility, |
|                        | telemetry, APM alerts              | security forensics, legal audit    |
+------------------------+------------------------------------+------------------------------------+
| Storage Mechanism      | stdout -> Cloud Logging / Datadog  | PostgreSQL (audit_logs table)      |
+------------------------+------------------------------------+------------------------------------+
| Retention Period       | Short-term (7 to 30 days)          | Long-term (1 to 7 years)           |
+------------------------+------------------------------------+------------------------------------+
| Multi-Tenant Querying  | Not directly accessible by users   | Scoped by tenant_id for user UI    |
+------------------------+------------------------------------+------------------------------------+
| Data Mutability        | Ephemeral stream                   | Immutable relational records       |
+------------------------+------------------------------------+------------------------------------+
| PII / Secret Policy    | Scrubbed via Pino redaction paths  | Scrubbed via sanitizeAuditDetails  |
+------------------------+------------------------------------+------------------------------------+
```

---

## 8. Implementation Strategy for Task P7-006

### 8.1 Core Modules & Responsibilities

1. **`src/domain/mcp/mcp.schemas.js`**:
   - Ensure `McpAuditEventSchema` validates all canonical event types (`mcp.tool.completed`, `mcp.tool.denied`, `mcp.tool.failed`, `mcp.handshake.completed`, `mcp.token.*`).
2. **`src/services/mcp-audit.service.js`** (or integrated in Fastify `/mcp` route):
   - Dedicated service providing `recordToolInvocation()`, `recordHandshake()`, `recordDenial()`.
   - Ingests `McpRequestContext`, sanitized parameters, execution duration, and status codes.
   - Executes `sanitizeAuditDetails()` and writes to `db.insert(auditLogs)`.
   - Enforces failure isolation (catches DB errors without crashing tool responses).
3. **`src/routes/mcp.routes.js`**:
   - Call the audit logger on successful execution (`mcp.tool.completed`), permission denial (`mcp.tool.denied`), rate limit breach (`mcp.tool.denied`), and handler failure (`mcp.tool.failed`).

### 8.2 Database Query Interface for Audit Logs

To support future User Dashboard Audit UI and security inspection, the audit service will expose tenant-scoped query capabilities:
* `listTenantAuditLogs(context, { page, limit, eventType, toolName, startDate, endDate })`
* Strict `tenantId = context.tenantId` filtering.
* Default-deny on cross-tenant requests.

---

## 9. Verification & Test Plan for Task P7-006

To verify Task P7-006 and mark it `COMPLETE`, the following test matrix will be executed:

### 9.1 Unit Test Coverage (`tests/unit/mcp-audit.service.test.js`)
1. **Schema Validation**: Validates `McpAuditEventSchema` against all approved event types.
2. **Credential Scrubbing**: Verifies that raw API tokens, passwords, session secrets, and source code are stripped before DB insert.
3. **Payload Clamping**: Verifies that payloads exceeding 16 KB are safely clamped or rejected with clean errors.
4. **Token Prefix Preservation**: Confirms that only safe token prefixes (`mcp_live_4a8b...`) are recorded.
5. **Execution Metric Preservation**: Verifies `durationMs`, `statusCode`, `errorCode`, and `role` are correctly structured in `details`.
6. **Failure Resilience**: Asserts that if the database insert throws an exception, the audit method does not propagate the error to the caller.

### 9.2 Live Integration Test Coverage (`tests/integration/mcp-audit-logging.test.js`)
1. **Live Read Tool Invocation**: Verifies that calling `POST /mcp` with `get_candidate_profile` creates a row in `audit_logs` with `event_type = 'mcp.tool.completed'`, `resource_type = 'mcp_tool'`, `resource_id = 'get_candidate_profile'`.
2. **Live Artifact Tool Invocation**: Verifies that calling `generate_tailored_resume` records an audit row with execution duration and summary stats.
3. **Live Rate Limit Denial**: Verifies that triggering a 429 rate limit creates an audit row with `event_type = 'mcp.tool.denied'` and `errorCode = -32029`.
4. **Live RBAC Role Denial**: Verifies that a `READONLY` user invoking `draft_cover_letter` creates an audit row with `event_type = 'mcp.tool.denied'` and `statusCode = 403`.
5. **Correlation ID Match**: Confirms `audit_logs.request_id` matches the HTTP `x-request-id` header returned to the client.
6. **Tenant Boundary Isolation**: Asserts that querying audit logs for Tenant A returns zero records belonging to Tenant B.
7. **Zero Plaintext Tokens**: Inspects all created database rows to ensure zero plaintext API keys or password strings exist anywhere in `details` or columns.

---

## 10. Architectural Consensus & ADR-046 Reference

* **Decision 1: Unified Single-Table Audit Ledger**: We reject creating a second audit table (`mcp_audit_logs`). All MCP events reside in the existing `audit_logs` table.
* **Decision 2: Existing Schema Completeness**: The existing `audit_logs` table schema is 100% complete and sufficient. No schema migrations are required.
* **Decision 3: Non-Blocking Failure Resilience**: Database audit log writes run asynchronously and cannot block or crash client responses.
* **Decision 4: Strict Sanitization**: All details pass through `sanitizeAuditDetails` enforcing the 16 KB ceiling and credential stripping.

**Formally Recorded in**: `docs/decisions.md` under **ADR-046**.
