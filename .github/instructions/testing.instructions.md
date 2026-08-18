# Testing & Quality Assurance Guidelines

**Scope**: Unit tests, integration tests, security test suites, and end-to-end verification.  
**Governing Standard**: Vitest / Node Native Test Runner + Automated Coverage.

---

## 1. Testing Invariants

1. **No Code Without Tests**: Every new domain service, helper, parser, or MCP tool MUST be accompanied by unit and/or integration tests.
2. **Never Weaken Assertions**: If a test fails, fix the underlying code defect or update the test only if requirements have intentionally evolved. Never disable assertions, delete tests, or reduce coverage thresholds to make a build pass.
3. **Mandatory Multi-Tenant Security Tests**: Every resource or candidate endpoint must have a test asserting that User A cannot read, modify, or delete User B's resources (expecting `404 Not Found` or `403 Forbidden`).
4. **Coverage Standard**: Maintain >= 80% line and branch coverage across all business logic, parsers, and career intelligence modules.

---

## 2. Test Organization & Naming

* Place tests in `tests/` matching source structure:
  * `tests/unit/services/candidate.test.js`
  * `tests/unit/utils/crypto.test.js`
  * `tests/integration/connectors/github.test.js`
  * `tests/integration/mcp/career-tools.test.js`
  * `tests/security/tenant-isolation.test.js`
  * `tests/e2e/golden-path.test.js`
* Use descriptive test blocks (`describe`, `it` / `test`):
  ```javascript
  describe('CareerIntelligenceEngine - Gap Analysis', () => {
    it('should classify a requirement as VERIFIED when backed by an EvidenceItem', () => {
      // test implementation
    });

    it('should classify a requirement as MISSING when candidate evidence is absent', () => {
      // test implementation
    });
  });
  ```

---

## 3. Mocking & Integration Strategy

* **External APIs**: Mock third-party APIs (GitHub Octokit, Gemini API) using fixture data in unit tests to ensure fast, deterministic CI runs.
* **Database Tests**: Integration tests run against an ephemeral PostgreSQL container or test schema.
* **MCP Tool Tests**: Test MCP tools using the standard MCP client test harness, verifying both JSON-RPC 2.0 protocol adherence and Zod schema validation.
* **Golden Path E2E**: Test the complete flow from user registration to GitHub ingestion, job parsing, match calculation, and MCP tool output.
