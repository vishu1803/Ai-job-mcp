# Gemini Enterprise & Google AI Custom MCP Connector Integration Guide

**Document Version**: `1.0.0`  
**Standard Revision**: 2026-07-28 Streamable HTTP Model Context Protocol (MCP)  
**Parent Specifications**: `docs/gemini-enterprise-mcp-integration-architecture.md` (`ARCH-029`), `docs/mcp-server-architecture.md` (`ARCH-020`), `docs/mcp-streamable-http-architecture.md` (`ARCH-021`), `docs/mcp-api-tokens-architecture.md` (`ARCH-022`), `docs/decisions.md` (`ADR-041` – `ADR-050`)  
**Target Audience**: Cloud Architects, AI Engineers, Google Workspace Administrators, and Integrators.  

---

## 1. Overview & Architectural Capabilities

The **Antigravity Career Hub** provides a sovereign, multi-tenant, zero-hallucination career intelligence platform. It securely inspects candidate evidence from connected repositories (e.g. GitHub), computes deterministic ATS scores, and dynamically tailors career artifacts (resumes, cover letters, portfolio showcases).

Rather than requiring proprietary plugins or static batch indexing, the platform exposes its capabilities via the open **Model Context Protocol (MCP)** over **Streamable HTTP**. This enables seamless integration with Google's entire AI ecosystem:
* **Google Cloud Vertex AI Agent Builder & ADK**: Autonomous multi-agent workflows with native MCP tools.
* **Gemini Enterprise (Google Workspace with Gemini)**: Interactive career coaching in Workspace sidebars via Connected Apps.
* **Google AI Studio**: Rapid prototyping and function calling via exported tool schemas.
* **Developer Tooling (Gemini CLI / Antigravity IDE)**: Native local and remote MCP server orchestration.

```
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                               2026 GOOGLE AI CLIENTS                                     │
├──────────────────────────┬──────────────────────────┬────────────────────────────────────┤
│ Google AI Studio         │ Vertex AI Agent Builder  │ Gemini Enterprise (Workspace)      │
│ (Function Declarations)  │ (Native Streamable MCP)  │ (Connected Apps Custom MCP)        │
└────────────┬─────────────┴────────────┬─────────────┴─────────────────┬──────────────────┘
             │                          │                               │
             │ OpenAPI Schema           │ HTTPS POST /mcp               │ GCP Connected App
             ▼                          ▼                               ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│                      ANTIGRAVITY CAREER HUB REMOTE MCP SERVER                            │
│                     (Streamable HTTP Endpoint: POST /mcp)                                │
├──────────────────────────────────────────────────────────────────────────────────────────┤
│ • Authentication: Bearer mcp_token_<environment>_<hex>                                   │
│ • Sovereign Multi-Tenant Default-Deny (404 Isolation)                                    │
│ • Tool Catalog (7 Tools):                                                                │
│   - Read Tools (career:read): get_candidate_profile, list_verified_skills,               │
│                               inspect_project_evidence, analyze_job_fit                  │
│   - Artifact Tools (career:write): generate_tailored_resume, draft_cover_letter,         │
│                                   recommend_portfolio_projects                           │
│ • Security: Zero DB mutations from read tools, PII/Secret Scrubbing, Pino Audit Logs     │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Integration Channels at a Glance

The Career Hub distinguishes between three integration mechanisms:

| Integration Channel | Target Google Environment | Protocol / Format | Best Used For |
| :--- | :--- | :--- | :--- |
| **Channel 1: Native Streamable HTTP MCP (Primary)** | Vertex AI Agent Builder, Agent Development Kit (ADK), Gemini CLI, Antigravity IDE | JSON-RPC 2.0 over Streamable HTTP (`POST /mcp`) | Autonomous agents, multi-turn reasoning, live tool execution. |
| **Channel 2: OpenAPI / Function Declaration Gateway** | Google AI Studio Prompts & Vertex AI Extensions | OpenAPI 3.0 / Gemini `FunctionDeclarations` | Manual prompt engineering, rapid prototyping, and static schema imports. |
| **Channel 3: Gemini Enterprise Connected App** | Google Workspace (Docs, Gmail, Drive) | GCP Console Custom MCP Data Store | Enabling enterprise employees to query candidate intelligence directly inside Workspace. |

> [!IMPORTANT]
> **Custom Batch Connectors vs. Remote MCP Server**: Google Discovery Engine "Custom Connectors" perform periodic batch crawling of static documents for search indexing. In contrast, the Antigravity Remote MCP Server is an **interactive runtime protocol** that performs live, deterministic ATS scoring and evidence verification on demand.

---

## 3. Prerequisites & API Token Setup

External Google AI clients authenticate to the Career Hub using scoped, cryptographically secure Bearer API tokens.

### 3.1 Token Format
```
mcp_<env>_<64-character-hex>
```
* **Production**: `mcp_live_4a8b7c9d...`
* **Test/Staging**: `mcp_test_1f2e3d4c...`
* **Development**: `mcp_dev_9a8b7c6d...`

### 3.2 Scope Matrix & Role Ceilings
Tokens enforce strict server-side least privilege based on workspace RBAC:

| Scope | Description | Permitted Tools | Role Ceiling |
| :--- | :--- | :--- | :--- |
| `career:read` | Read-only access to candidate profiles and evidence. | `get_candidate_profile`, `list_verified_skills`, `inspect_project_evidence`, `analyze_job_fit`, `recommend_portfolio_projects` | `READONLY`, `MEMBER`, `OWNER` |
| `career:write` | Authority to draft tailored resumes and cover letters. | `generate_tailored_resume`, `draft_cover_letter` | `MEMBER`, `OWNER` |
| `career:export` | Authority to export compiled Markdown/JSON packages. | Artifact export services | `MEMBER`, `OWNER` |
| `career:admin` | Administrative introspection and token management. | Token lifecycle and audit queries | `OWNER` only |

### 3.3 Generating an API Token
Tokens can be generated via the Career Hub API (or Admin UI):

```bash
# Example: Generate a 30-day token with career:read and career:write scopes
curl -X POST "https://<your-career-hub-domain>/api/v1/mcp/tokens" \
  -H "Cookie: session=<YOUR_SESSION_COOKIE>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Vertex AI Agent Connector",
    "scopes": ["career:read", "career:write"],
    "expiresInDays": 30
  }'
```

**Response**:
```json
{
  "token": "mcp_token_<YOUR_TOKEN>",
  "id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "name": "Vertex AI Agent Connector",
  "scopes": ["career:read", "career:write"],
  "expiresAt": "2026-09-23T12:00:00.000Z"
}
```

> [!CAUTION]
> **Token Security**: The raw token is displayed **only once** upon creation. The database stores only a salted SHA-256 hash. Store tokens securely in Google Secret Manager or your environment configuration. Never commit tokens to source repositories.

---

## 4. Channel 1: Native Streamable HTTP MCP Integration

This is the primary integration path for all modern MCP-compliant runtimes.

### 4.1 Canonical Endpoint
* **URL**: `POST https://<your-career-hub-domain>/mcp`
* **Transport**: Streamable HTTP (JSON-RPC 2.0)
* **Headers**:
  * `Authorization: Bearer mcp_token_<YOUR_TOKEN>`
  * `Content-Type: application/json`
  * `Mcp-Protocol-Version: 2026-07-28` *(recommended)*

### 4.2 Standard Configuration Block (`mcpServers`)
For runtimes supporting JSON MCP configuration (Gemini CLI, Antigravity IDE, Claude Desktop, Cursor):

```json
{
  "mcpServers": {
    "antigravity-career-hub": {
      "url": "https://<your-career-hub-domain>/mcp",
      "transport": "http",
      "headers": {
        "Authorization": "Bearer mcp_token_<YOUR_TOKEN>",
        "Content-Type": "application/json"
      }
    }
  }
}
```

---

## 5. Google Cloud Vertex AI Agent Builder & ADK Setup

Google Cloud Vertex AI Agent Builder and the open-source Agent Development Kit (ADK) support native MCP tool attachments.

### 5.1 Step-by-Step Configuration in Vertex AI Agent Builder
1. Log in to the **Google Cloud Console** (`console.cloud.google.com`).
2. Navigate to **Vertex AI $\rightarrow$ Agent Builder $\rightarrow$ Agents**.
3. Select your Target Agent or click **Create Agent**.
4. Under **Tools**, click **Add Tool** and choose **Model Context Protocol (MCP)**.
5. Enter the connection parameters:
   * **Tool Name**: `antigravity_career_hub`
   * **Endpoint Type**: `Streamable HTTP / Remote URL`
   * **Server URL**: `https://<your-career-hub-domain>/mcp`
   * **Authentication**: `Bearer Token`
   * **Token Value**: Reference from **Google Secret Manager** (`projects/<PROJECT_ID>/secrets/CAREER_HUB_MCP_TOKEN/versions/latest`).
6. Click **Test Connection / Discover Tools**. Vertex AI will send a `tools/list` request and automatically discover all 7 career tools.
7. Click **Save & Attach to Agent**.

### 5.2 Python Agent Development Kit (ADK) Setup
```python
from google.genai import types
from vertexai.preview import reasoning_engines

# Configure remote MCP server tool in ADK
mcp_tool = reasoning_engines.McpTool(
    name="antigravity_career_hub",
    url="https://<your-career-hub-domain>/mcp",
    transport="http",
    headers={
        "Authorization": "Bearer mcp_token_<YOUR_TOKEN>",
        "Content-Type": "application/json"
    }
)

agent = reasoning_engines.LangchainAgent(
    model="gemini-3.7-flash",
    tools=[mcp_tool],
    system_instruction="You are an executive career advisor. Cite verified repository evidence for all claims."
)
```

---

## 6. Google AI Studio Prototyping & Function Calling

For developers prototyping in **Google AI Studio** (`aistudio.google.com`), function declarations can be imported directly into system prompts.

### 6.1 Function Declaration Schema (`analyze_job_fit`)
Copy the following OpenAPI/Gemini declaration into the **Tools $\rightarrow$ Function Calling** section of Google AI Studio:

```json
{
  "name": "analyze_job_fit",
  "description": "Calculates deterministic ATS fit score, requirement match matrix, and verified skill density for a candidate against a target job description.",
  "parameters": {
    "type": "OBJECT",
    "properties": {
      "candidateId": {
        "type": "STRING",
        "description": "Optional Candidate Profile UUID. If omitted, defaults to the authenticated user."
      },
      "jobDescription": {
        "type": "STRING",
        "description": "Full job description text including title, requirements, and responsibilities."
      }
    },
    "required": ["jobDescription"]
  }
}
```

### 6.2 Recommended System Instruction
```xml
<system_instruction>
You are an authoritative Career Copilot powered by verified candidate repository evidence.
RULES:
1. When evaluating candidate qualifications against a job description, ALWAYS call `analyze_job_fit` or `get_candidate_profile`.
2. NEVER invent work history, metrics, or technologies not present in the tool output.
3. Clearly label skills not backed by repository evidence as "[Unverified User Claim]".
4. Do not alter the deterministic ATS fit score returned by the server.
</system_instruction>
```

---

## 7. Gemini Enterprise (Google Workspace) Setup

Gemini Enterprise enables Google Workspace users to invoke custom internal tools directly within Gmail, Docs, and Drive side panels.

### 7.1 Administrator Setup in Google Cloud Console
1. Ensure your Google Workspace account has active **Gemini Business** or **Gemini Enterprise** licensing.
2. Open the **Google Cloud Console** in the project linked to your Workspace domain.
3. Navigate to **Gemini Enterprise $\rightarrow$ Connected Apps $\rightarrow$ Custom Tools**.
4. Click **Connect New Tool Server**.
5. Select **Model Context Protocol (MCP) Server**.
6. Provide the configuration:
   * **Display Name**: `Career Intelligence Hub`
   * **Endpoint URL**: `https://<your-career-hub-domain>/mcp`
   * **Auth Method**: `Bearer Token`
   * **Authorization Header**: `Bearer mcp_token_<YOUR_TOKEN>`
7. Set **Organizational Access**: Select the Organizational Units (e.g. `Recruiting`, `Engineering Management`, `All Employees`) permitted to use the tool.
8. Click **Verify & Enable**.

---

## 8. Complete 7-Tool Catalog Reference

### 8.1 Read Tools (`career:read`)

#### 1. `get_candidate_profile`
* **Purpose**: Retrieves normalized candidate profile including bio, verified skills, and project summaries.
* **Scope**: `career:read` | **Allowed Roles**: `READONLY`, `MEMBER`, `OWNER`
* **Input Parameters**:
  * `candidateId` *(string, optional)*: UUID of target candidate. Defaults to authenticated user.
* **Output**:
  * Candidate identity, verified skill matrix, aggregated project list, and evidence count.

#### 2. `list_verified_skills`
* **Purpose**: Returns paginated list of candidate skills verified against code repositories with confidence ratings.
* **Scope**: `career:read` | **Allowed Roles**: `READONLY`, `MEMBER`, `OWNER`
* **Input Parameters**:
  * `candidateId` *(string, optional)*: Candidate UUID.
  * `category` *(string, optional)*: Filter by category (`LANGUAGE`, `FRAMEWORK`, `DATABASE`, `TOOL`, `CLOUD`).
  * `limit` *(integer, optional, default: 50)*: Page size.
* **Output**:
  * Array of verified skills with `verificationStatus` (`VERIFIED`, `INFERRED`, `CLAIMED`) and primary repository citations.

#### 3. `inspect_project_evidence`
* **Purpose**: Deep inspection of repository evidence items (commits, AST imports, manifest dependencies, line ranges).
* **Scope**: `career:read` | **Allowed Roles**: `READONLY`, `MEMBER`, `OWNER`
* **Input Parameters**:
  * `projectId` *(string, required)*: UUID of project repository.
  * `requirementKeys` *(array of strings, optional)*: Filter evidence by target skill tags.
* **Output**:
  * Repository metadata, verified file paths, commit SHAs, line numbers, and scrubbed code excerpts.

#### 4. `analyze_job_fit`
* **Purpose**: Deterministically computes mathematical ATS score, requirement match breakdown, and missing skill gaps against a job description.
* **Scope**: `career:read` | **Allowed Roles**: `READONLY`, `MEMBER`, `OWNER`
* **Input Parameters**:
  * `candidateId` *(string, optional)*: Candidate UUID.
  * `jobDescription` *(string, required)*: Full job description text.
* **Output**:
  * `fitScore` (0–100), `requirementMatches` (VERIFIED / INFERRED / CLAIMED / MISSING), `evidenceItemCount`, and `strengths`.

---

### 8.2 Artifact Tools (`career:write` / `career:read`)

#### 5. `recommend_portfolio_projects`
* **Purpose**: Selects and ranks top candidate projects that provide the strongest proof for target job requirements.
* **Scope**: `career:read` | **Allowed Roles**: `READONLY`, `MEMBER`, `OWNER`
* **Input Parameters**:
  * `candidateId` *(string, optional)*: Candidate UUID.
  * `jobDescription` *(string, required)*: Target job description text.
  * `maxProjects` *(integer, optional, default: 3)*: Maximum projects to return.
* **Output**:
  * Ranked project recommendations with relevance scores, key matched skills, and evidence citations.

#### 6. `draft_cover_letter`
* **Purpose**: Drafts a highly tailored, evidence-grounded cover letter citing verified repository projects.
* **Scope**: `career:write` | **Allowed Roles**: `MEMBER`, `OWNER`
* **Input Parameters**:
  * `candidateId` *(string, optional)*: Candidate UUID.
  * `jobDescription` *(string, required)*: Target job description text.
  * `companyName` *(string, optional)*: Name of hiring company.
  * `tone` *(string, optional, default: 'PROFESSIONAL')*: `PROFESSIONAL`, `TECHNICAL`, `EXECUTIVE`.
* **Output**:
  * Formatted cover letter prose with citation references and zero ungrounded achievement claims.

#### 7. `generate_tailored_resume`
* **Purpose**: Generates an evidence-tailored resume with bullet points mapped strictly to verified project achievements.
* **Scope**: `career:write` | **Allowed Roles**: `MEMBER`, `OWNER`
* **Input Parameters**:
  * `candidateId` *(string, optional)*: Candidate UUID.
  * `jobDescription` *(string, required)*: Target job description text.
  * `targetRoleTitle` *(string, optional)*: Target position title.
* **Output**:
  * Tailored professional summary, prioritized work & project bullets, and verified skill matrix.

---

## 9. Validated Curl Examples

All curl commands below use standard JSON-RPC 2.0 envelopes and synthetic placeholders.

### 9.1 Handshake & Tool Discovery (`tools/list`)
```bash
curl -X POST "https://<your-career-hub-domain>/mcp" \
  -H "Authorization: Bearer mcp_token_<YOUR_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": "req-001",
    "method": "tools/list",
    "params": {}
  }'
```

---

### 9.2 Inspect Candidate Profile (`get_candidate_profile`)
```bash
curl -X POST "https://<your-career-hub-domain>/mcp" \
  -H "Authorization: Bearer mcp_token_<YOUR_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": "req-002",
    "method": "tools/call",
    "params": {
      "name": "get_candidate_profile",
      "arguments": {}
    }
  }'
```

---

### 9.3 Analyze Job Fit (`analyze_job_fit`)
```bash
curl -X POST "https://<your-career-hub-domain>/mcp" \
  -H "Authorization: Bearer mcp_token_<YOUR_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": "req-003",
    "method": "tools/call",
    "params": {
      "name": "analyze_job_fit",
      "arguments": {
        "jobDescription": "Senior Backend Engineer specializing in Go, distributed microservices, and PostgreSQL database optimization."
      }
    }
  }'
```

---

### 9.4 Generate Tailored Resume (`generate_tailored_resume`)
```bash
curl -X POST "https://<your-career-hub-domain>/mcp" \
  -H "Authorization: Bearer mcp_token_<YOUR_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": "req-004",
    "method": "tools/call",
    "params": {
      "name": "generate_tailored_resume",
      "arguments": {
        "jobDescription": "Staff Cloud Architect with deep Kubernetes and Go experience.",
        "targetRoleTitle": "Staff Cloud Architect"
      }
    }
  }'
```

---

## 10. Error Reference & Status Codes

The MCP server returns standard JSON-RPC 2.0 error envelopes with HTTP status codes:

```json
{
  "jsonrpc": "2.0",
  "id": "req-001",
  "error": {
    "code": -32001,
    "message": "Authentication failed. Invalid or expired Bearer token.",
    "data": {
      "requestId": "61a7d6e4-411a-4d29-a1b9-8c6f2a3b4c5d"
    }
  }
}
```

| HTTP Status | JSON-RPC Code | Error Symbol | Cause & Resolution |
| :--- | :--- | :--- | :--- |
| **401 Unauthorized** | `-32001` | `UNAUTHENTICATED` | Bearer token is missing, expired, or invalid. Verify token format. |
| **403 Forbidden** | `-32003` | `FORBIDDEN` | Token lacks required scope (e.g. `career:read` token attempting `draft_cover_letter`). |
| **404 Not Found** | `-32004` | `NOT_FOUND` | Resource or candidate does not exist, or cross-tenant access was attempted. |
| **400 Bad Request** | `-32602` | `INVALID_PARAMS` | Input arguments failed Zod schema validation. Inspect `details` field. |
| **404 Not Found** | `-32601` | `METHOD_NOT_FOUND` | Requested tool or JSON-RPC method is not registered on the server. |
| **429 Too Many Req** | `-32029` | `RATE_LIMITED` | Token or IP exceeded rate limits (60 RPM burst, 300 RPM standard). |
| **500 Server Error** | `-32603` | `INTERNAL_ERROR` | Internal server execution failure. Stack traces and database internals are redacted. |

---

## 11. Security, Isolation & Audit Logging

1. **Sovereign Multi-Tenant Isolation**: Request context (`tenantId`, `userId`, `role`) is derived cryptographically from the Bearer token. Cross-tenant queries return default-deny `404 NOT_FOUND`.
2. **Secret & PII Scrubbing**: All repository excerpts, logs, and outputs pass through `SecretScrubber`, removing API keys, SSH private keys, passwords, and authorization tokens.
3. **Inverse Authority Principle**: AI models never have write access to ATS scores, skill verification statuses, or database rows during tool execution.
4. **Failure-Isolated Audit Trail**: Every tool invocation writes a sanitized compliance event to `audit_logs` asynchronously without degrading latency:
   * Recorded fields: `timestamp`, `tenantId`, `userId`, `role`, `toolName`, `durationMs`, `statusCode`, `requestId`.
   * Redacted fields: Raw resumes, source code files, API tokens, passwords.

---

## 12. Verification & Testing Checklist

Follow this checklist to verify a new Gemini MCP integration:

- [ ] **Step 1: Mint Scoped Token**: Generate an `mcp_token_*` with `career:read` and `career:write` scopes.
- [ ] **Step 2: Initialize & Discover**: Send `tools/list` curl request and verify all 7 tools are returned.
- [ ] **Step 3: Test Read Tool**: Call `get_candidate_profile` and verify JSON payload contains verified skills.
- [ ] **Step 4: Test Analytical Tool**: Call `analyze_job_fit` with a sample job description and verify `fitScore`.
- [ ] **Step 5: Test Artifact Tool**: Call `draft_cover_letter` and verify structured cover letter generation.
- [ ] **Step 6: Verify Audit Trail**: Inspect `audit_logs` table and confirm `mcp.tool.completed` event is recorded.
- [ ] **Step 7: Verify Tenant Isolation**: Query an arbitrary UUID not in the tenant and confirm `404 NOT_FOUND`.
- [ ] **Step 8: Verify Scope Boundary**: Create a `career:read`-only token, attempt `generate_tailored_resume`, and verify `-32003 FORBIDDEN`.
- [ ] **Step 9: Test Revocation**: Revoke token in Career Hub and verify immediate `-32001 UNAUTHENTICATED`.
