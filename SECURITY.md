# Security Policy & Vulnerability Management

**Project**: Antigravity Career Hub (Universal AI Career MCP Platform)  
**Status**: Active Security Policy  
**Last Updated**: 2026-08-27  

---

## 1. Supported Versions

We release security updates and patches for the following versions:

| Version | Supported | Notes |
| :--- | :---: | :--- |
| `0.1.x` (main branch) | ✅ | Current active development & beta releases |
| `< 0.1.0` | ❌ | Pre-release milestones |

---

## 2. Reporting a Vulnerability

We take the security of **Antigravity Career Hub** and user data sovereignty extremely seriously. If you discover a security vulnerability, please report it responsibly rather than opening a public issue.

### Reporting Procedure:
1. **Email**: Send vulnerability details to `security@careerhub.ai` (or via GitHub Private Vulnerability Reporting on the repository).
2. **Details to Include**:
   - Type of issue (e.g., IDOR, XSS, SSRF, Token Leakage, Auth Bypass).
   - Step-by-step reproduction steps or proof-of-concept (PoC).
   - Affected endpoints or MCP tools.
   - Any potential impact or data exposure assessment.
3. **Acknowledgment**: You will receive an initial acknowledgment within **12 hours**.
4. **Resolution**: We will provide regular updates as we investigate and remediate the issue.

---

## 3. Vulnerability Severity & Response SLA Matrix

| Severity Level | Definition & Criteria | Triage SLA | Remediation SLA | CI / Deployment Action |
| :--- | :--- | :---: | :---: | :--- |
| **CRITICAL** | Cross-tenant data breach (IDOR), remote code execution, unauthenticated database access, live credential leak, or write-safety bypass. | **< 2 hours** | **< 24 hours** | **IMMEDIATE BLOCK**: Hotfix release and emergency token/secret revocation. |
| **HIGH** | Authentication bypass, OAuth code/token replay, high-entropy secret in staging logs, or CVSS $\ge 7.0$ dependency vulnerability. | **< 8 hours** | **< 72 hours** | **CI GATING BLOCK**: Blocks merges to `main` until remediated. |
| **MODERATE** | CSRF on low-risk endpoints, non-sensitive information leakage, isolated `devDependency` advisory with zero runtime impact (e.g., build tools). | **< 24 hours** | **Next Sprint Milestone** | **TRACKED**: Logged and monitored in dependency audit reports. |
| **LOW / INFO** | Best-practice hardening, minor header adjustments, or non-exploitable edge-case behavior. | **< 48 hours** | **Routine Maintenance** | **INFORMATIONAL**: Scheduled in regular release cycles. |

---

## 4. Core Security Invariants

All contributions and architecture must adhere to these non-negotiable principles:

1. **Zero Credential Exposure**: Real credentials, GitHub App private keys, OAuth secrets, and database passwords must **never** be committed to source control or echoed in application logs.
2. **Strict Multi-Tenant Isolation**: Every database query must scope by `tenant_id` derived from the validated session/token context. Cross-tenant lookups must return `404 NOT_FOUND` to prevent identifier enumeration.
3. **Two-Phase Human Confirmation**: Consequential external write operations (creating Git branches, pushing code, opening pull requests) require explicit, cryptographic two-phase human confirmation tickets.
4. **Deterministic Supply-Chain Gating**: CI runs automated dependency auditing (`npm run audit:deps`) and zero-dependency secrets scanning (`npm run scan:secrets`) on every pull request.
