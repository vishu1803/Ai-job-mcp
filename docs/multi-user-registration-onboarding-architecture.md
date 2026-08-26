# Multi-User Registration & Onboarding Architecture (ARCH-047 / ADR-067)

**Status**: **`IMPLEMENTED & VERIFIED`**  
**Date**: 2026-08-26  
**Scope**: Phase 13 / P13-001 — Public Multi-Tenant Registration, Personal Tenant Provisioning, and Onboarding State Machine  

---

## 1. Executive Summary & Objective

The **Multi-User Registration & Onboarding Architecture** establishes the public entry point for converting unauthenticated visitors into authenticated workspace owners with initial candidate profiles via **GitHub OAuth 2.1 with PKCE**, zero password storage, personal tenant isolation, and an explicit onboarding state machine.

### Key Architectural Invariants:
1. **Zero Database Schema Overhead**: Uses existing tables (`tenants`, `users`, `candidates`, `candidate_identities`, `sessions`, `audit_logs`).
2. **Atomic Provisioning Transaction**: Registration executes within a single PostgreSQL transaction creating `Tenant (OWNER)` $\to$ `User` $\to$ `Candidate Persona` $\to$ `CandidateIdentity` $\to$ `Session` $\to$ `AuditLog`. Any partial failure rolls back cleanly with zero orphaned records.
3. **GitHub-First Identity Foundation**: Candidate capability modeling requires authorized repository access (`goal.md` §13). GitHub OAuth provides verified email, avatar, and repository linkage without storing passwords or managing email verification queues.
4. **Account Enumeration Resistance**: Public entry points utilize PKCE redirects; error messages for registered vs. new users are identical, revealing zero user existence to third parties.
5. **Strict Session & CSRF Boundaries**: Browser sessions utilize `SameSite=Lax`, `HttpOnly`, `Secure` cookies with SHA-256 hashed server-side session records. All state-changing routes enforce `Origin` and `Referer` validation via `verifyCsrf`.

---

## 2. Identity Hierarchy & Entity Mapping

In default beta mode, **1 Registered User = 1 Personal Tenant Workspace = 1 Candidate Profile**:

```
[Tenant Workspace] (Root sovereign boundary: id, name, slug, tier='FREE'|'PRO'|'ENTERPRISE')
       │
       ├── [User Account] (id, tenantId, email, displayName, role='OWNER'|'MEMBER'|'READONLY', status='ACTIVE')
       │         │
       │         └── [Session] (id, tenantId, userId, tokenHash, expiresAt, ipAddress, userAgent)
       │
       └── [Candidate Persona] (id, tenantId, userId, displayName, canonicalEmail, profileMetadata)
                 │
                 ├── [Candidate Identities] (provider='GITHUB_APP', externalAccountId, verified=true)
                 ├── [Connected Resources] (GitHub App installations, repositories)
                 ├── [Evidence & Skills] (Immutable commit-pinned evidence, verified skill rollup)
                 └── [Job Applications & Artifacts] (Tracking records, tailored resumes/cover letters)
```

---

## 3. Registration & Onboarding State Machine

Candidate onboarding tracks progression through `candidates.profileMetadata.systemInferred.onboardingState`:

| State | Entry Condition | Required Actions | Exit Transition |
| :--- | :--- | :--- | :--- |
| **`REGISTERED`** | User & Tenant created via OAuth | View welcome screen; select career goals | Connect GitHub App / Repositories |
| **`RESOURCES_CONNECTED`** | GitHub App installed on user repos | Ingestion pipeline executes deep extraction | Skill rollup and project genesis complete |
| **`PROFILE_REVIEW`** | Evidence and skills populated | Review extracted skills, edit headline/summary | User confirms profile narrative |
| **`COMPLETED`** | Profile confirmed | Full dashboard unlocked; MCP credentials ready | Terminal state $\to$ Redirect to `/dashboard` |

- **Safe Abandonment & Resumption**: Subsequent logins inspect `onboardingState` and resume at the exact pending step.

---

## 4. Verification & Quality Gates

- **Integration Test Suite**: [`tests/integration/registration-onboarding.test.js`](file:///c:/Users/VISHW/OneDrive/Desktop/Ai-career-agent/tests/integration/registration-onboarding.test.js) (11/11 PASS).
- **Master Test Suite**: 1,536 / 1,536 tests passing across 411 suites with 0 database leaks.
- **Code Standards**: ESLint, Prettier, and Drizzle schema sync 100% clean.
