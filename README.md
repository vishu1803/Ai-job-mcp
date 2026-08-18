# Antigravity Career Hub (Universal AI Career MCP Platform)

> **Empowering professionals with a provider-neutral, evidence-backed AI career copilot that connects directly to real-world code repositories via the Model Context Protocol (MCP).**

---

## 1. Project Mission
Traditional AI resume builders and career assistants frequently hallucinate capabilities, generate generic buzzwords, or invent unverifiable work experience. 

**Antigravity Career Hub** solves this by rooting all career claims in verifiable ground truth extracted from a candidate's actual repositories, commit histories, package manifests, and architectural documents. By exposing these verified capabilities through the open **Model Context Protocol (MCP)**, users retain complete sovereignty over their data and can connect any major AI assistant—including **Google Gemini**, **Anthropic Claude**, and **OpenAI ChatGPT**—as their trusted career copilot.

---

## 2. Current Project Status

| Indicator | Status | Details |
| :--- | :--- | :--- |
| **Current Phase** | **Pre-Coding Preparation / Ready for Phase 1** | Architectural specifications, ADRs, security threat model, and data models complete. |
| **Active Milestone** | **M0: Foundation & Specification** | 100% Verified in `project.md` |
| **Next Milestone** | **M1: Multi-User Platform Foundation** | Phase 1 (Node.js ESM, Fastify, PostgreSQL schemas) |
| **Overall Progress** | **5.0% (4 / 80 Tasks)** | Strict task completion accounting (zero inflation) |

---

## 3. Key Architectural Pillars

* **Provider Neutrality**: Core career intelligence and candidate models never depend on any single AI vendor. The AI client is an interchangeable interface over standard MCP.
* **Radical Evidence Provenance**: Every skill and claim contains an immutable `EvidenceId` citing repository name, file path, and commit SHA.
* **Zero-Hallucination Integrity Gates**: AI prompts and server-side validators reject unverified claims.
* **Human-in-the-Loop Consequential Safety**: External modifications (creating Git branches, opening draft pull requests) require explicit, two-phase user authorization.
* **Multi-Tenant Cryptographic Isolation**: All stored credentials and tokens are encrypted at rest with AES-256-GCM. Multi-tenant row-level isolation is enforced on every query.

---

## 4. MVP Golden Path

The MVP validates the complete end-to-end path:
1. **User Authentication**: Secure user registration and session management.
2. **GitHub App Connection**: Candidate grants scoped read-only access to selected repositories.
3. **Evidence Ingestion**: Extraction of package dependencies, AST usage, and commit history into atomic `EvidenceItem` records.
4. **Unified Candidate Model**: Automated creation of an evidence-backed candidate skill graph.
5. **Job Description Analysis**: Parsing target job descriptions into normalized requirement taxonomies.
6. **Gap Analysis & Fit Scoring**: Deterministic matching of candidate evidence against job requirements.
7. **Remote MCP Server**: Stateless JSON-RPC 2.0 gateway running over Streamable HTTP.
8. **Gemini MCP Client**: Google Gemini connects to the remote MCP server and explains job fit with ground-truth citations.

---

## 5. Repository Structure

```
Ai-career-agent/
├── AGENTS.md                  # Mandatory operating rules and invariants for AI agents
├── goal.md                    # Strategic source of truth, constitution, and long-term vision
├── project.md                 # Living execution ledger, master task table, and progress tracker
├── README.md                  # Project overview, architecture summary, and onboarding
├── .env.example               # Safe environment variable configuration template
├── .gitignore                 # Git ignore rules protecting secrets and artifacts
├── docs/                      # Architectural and technical specifications
│   ├── architecture.md        # System architecture, component boundaries, and request flows
│   ├── decisions.md           # Architecture Decision Records (ADR-001 through ADR-014)
│   ├── security.md            # Security specification, threat model, and cryptographic rules
│   ├── data-model.md          # Unified Candidate Data Model and evidence provenance schema
│   ├── integrations.md        # Third-party integration specs (GitHub, Gemini, Claude, ChatGPT)
│   └── golden-path.md         # MVP end-to-end user journey and verification protocol
└── .github/
    └── instructions/          # Path-specific development guidelines for AI agents
        ├── javascript.instructions.md
        ├── backend.instructions.md
        ├── database.instructions.md
        ├── security.instructions.md
        └── testing.instructions.md
```

---

## 6. Project Control Documents

This repository is governed by three authoritative control documents:
1. [AGENTS.md](file:///c:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/AGENTS.md) — Mandatory operating protocols, security invariants, and task lifecycle rules.
2. [goal.md](file:///c:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/goal.md) — Strategic constitution, problem definition, and architectural principles.
3. [project.md](file:///c:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/project.md) — Living execution ledger tracking all 80 tasks across Phases 0–15.

Detailed technical specifications:
* [docs/architecture.md](file:///c:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/docs/architecture.md)
* [docs/decisions.md](file:///c:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/docs/decisions.md)
* [docs/security.md](file:///c:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/docs/security.md)
* [docs/data-model.md](file:///c:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/docs/data-model.md)
* [docs/integrations.md](file:///c:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/docs/integrations.md)
* [docs/golden-path.md](file:///c:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/docs/golden-path.md)

---

## 7. Security & Compliance Warning

> [!WARNING]
> **CRITICAL SECURITY RULES**:
> 1. NEVER commit `.env` files or hardcode credentials in code.
> 2. All third-party secrets must be encrypted using AES-256-GCM.
> 3. Consequential external operations MUST go through the two-phase approval gate.
> 4. All database queries must enforce tenant isolation (`tenant_id`).

---

## 8. Development & Setup (Implementation Pending)

### Prerequisites
* **Node.js**: v20.0.0+ LTS (Tested on v24.13.0)
* **npm**: v10.0.0+ (Tested on v11.6.2)
* **Docker**: Docker Engine (v24+) for local PostgreSQL
* **Git**: v2.40+

*Note: Source code implementation begins in Phase 1 (`P1-001`).*
