# ISSUE-06 completion failure inventory

Date: 2026-10-08. All 54 leaf failures were reproduced before completion-pass edits: 425 tests, 371 PASS, 54 FAIL, zero skipped/cancelled (`%TEMP%/issue06-completion-before.log`). Locations below are original locations, before formatting.

Classification: 11 fixture/causal failures, 37 obsolete security-policy expectations, 4 legitimate compatibility regressions, 2 independently reproduced pre-ISSUE-06 defects. **All54 are now resolved.** The manual-claim contract is corrected and the personal-candidate test now uses an isolated synthetic fixture. [Final closure results](issue06-final-closure-report.md) supersede earlier retained-failure notes below.

No snapshots were blindly regenerated. Count, score, synonym/taxonomy direction, scope, archive, rollback, content and output-schema assertions remain. Unsupported parsers are not restored with regex verification.

## F01 — elevates manual claim to VERIFIED when evidence is subsequently linked

- Original location: `tests/integration/candidate-profile.service.test.js:316:5`.
- Exact recorded exception/assertion: `error: 'Candidate not found in current user scope' code: 'NOT_FOUND' name: 'NotFoundError'`.
- Responsible implementation: src/services/candidate-profile.service.js; evidence-linking.service.js.
- Classification: Fixture mismatch / causal setup.
- Is the old expected behavior valid? Yes, the lifecycle/utility behavior remains valid; verification must still be conservative.
- Corrective action: Bind the active connection and repository to the fixture owner; linking preserves CLAIMED.
- Resolution: PASS in the final broader regression selection (see final test record).

## F02 — preserves verified status and score when addSkillClaim is called on already-verified skill

- Original location: `tests/integration/candidate-profile.service.test.js:364:5`.
- Exact recorded exception/assertion: `error: |- Expected values to be strictly equal: + actual - expected + 'CLAIMED' - 'VERIFIED' code: 'ERR_ASSERTION' name: 'AssertionError' expected: 'VERIFIED' actual: 'CLAIMED' operator: 'strictEqual'`.
- Responsible implementation: src/services/candidate-profile.service.js; evidence-linking.service.js.
- Classification: Intentional security-policy change.
- Is the old expected behavior valid? No where it expects counts, declarations, unparsed text or name matches to establish independently verified competence. Useful observations and claims must remain available with accurate labels.
- Corrective action: Retain extraction/matching utility and meaningful original assertions; replace unsupported VERIFIED/MATCHED/CORROBORATED expectations with OBSERVED/INFERRED/CLAIMED/PARTIAL as appropriate. Unsupported language parsing must yield no verified reference; source details remain available through manifest observations.
- Resolution: PASS in the final broader regression selection (see final test record).

## F03 — removeSkillClaim preserves verified skill while clearing user claim note

- Original location: `tests/integration/candidate-profile.service.test.js:377:5`.
- Exact recorded exception/assertion: `error: 'Verified skill must not be deleted' code: 'ERR_ASSERTION' name: 'AssertionError' expected: true operator: '=='`.
- Responsible implementation: src/services/candidate-profile.service.js; evidence-linking.service.js.
- Classification: Fixture mismatch / causal setup.
- Is the old expected behavior valid? Yes, the lifecycle/utility behavior remains valid; verification must still be conservative.
- Corrective action: Restore the preceding owned ingestion fixture; remove claim note without deleting the observed skill.
- Resolution: PASS in the final broader regression selection (see final test record).

## F04 — archives and restores candidate preserving all evidence and skills

- Original location: `tests/integration/candidate-profile.service.test.js:440:5`.
- Exact recorded exception/assertion: `error: |- Expected values to be strictly equal: 0 !== 1 code: 'ERR_ASSERTION' name: 'AssertionError' expected: 1 actual: 0 operator: 'strictEqual'`.
- Responsible implementation: src/services/candidate-profile.service.js; evidence-linking.service.js.
- Classification: Fixture mismatch / causal setup.
- Is the old expected behavior valid? Yes, the lifecycle/utility behavior remains valid; verification must still be conservative.
- Corrective action: Restore the preceding owned ingestion fixture; retain archive/restore row-count assertions.
- Resolution: PASS in the final broader regression selection (see final test record).

## F05 — should extract evidence, create project, link evidence, and produce verified skills

- Original location: `tests/integration/candidate-repository-ingestion.test.js:246:5`.
- Exact recorded exception/assertion: `error: |- Should process 1 repository 0 !== 1 code: 'ERR_ASSERTION' name: 'AssertionError' expected: 1 actual: 0 operator: 'strictEqual'`.
- Responsible implementation: src/services/candidate-repository-ingestion.service.js; extractors/github/github-evidence-extractor.js.
- Classification: Fixture mismatch / causal setup.
- Is the old expected behavior valid? Yes, the lifecycle/utility behavior remains valid; verification must still be conservative.
- Corrective action: Supply active owned connection and pinned commit/tree/blob fixture; retain persisted project assertions.
- Resolution: PASS in the final broader regression selection (see final test record).

## F06 — running sync twice should not create duplicate projects, project_resources, or evidence

- Original location: `tests/integration/candidate-repository-ingestion.test.js:331:5`.
- Exact recorded exception/assertion: `error: |- Still processed 1 repository 0 !== 1 code: 'ERR_ASSERTION' name: 'AssertionError' expected: 1 actual: 0 operator: 'strictEqual'`.
- Responsible implementation: src/services/candidate-repository-ingestion.service.js; extractors/github/github-evidence-extractor.js.
- Classification: Fixture mismatch / causal setup.
- Is the old expected behavior valid? Yes, the lifecycle/utility behavior remains valid; verification must still be conservative.
- Corrective action: Supply pinned source fixture; preserve incremental reingestion behavior.
- Resolution: PASS in the final broader regression selection (see final test record).

## F07 — should sync only the specified resource when resourceId is provided

- Original location: `tests/integration/candidate-repository-ingestion.test.js:489:5`.
- Exact recorded exception/assertion: `error: |- Expected values to be strictly equal: 0 !== 1 code: 'ERR_ASSERTION' name: 'AssertionError' expected: 1 actual: 0 operator: 'strictEqual'`.
- Responsible implementation: src/services/candidate-repository-ingestion.service.js; extractors/github/github-evidence-extractor.js.
- Classification: Fixture mismatch / causal setup.
- Is the old expected behavior valid? Yes, the lifecycle/utility behavior remains valid; verification must still be conservative.
- Corrective action: Supply pinned source fixture; retain archive/update lifecycle assertions.
- Resolution: PASS in the final broader regression selection (see final test record).

## F08 — links manifest evidence to skill, sets primary evidence, and computes rollup

- Original location: `tests/integration/evidence-linking.test.js:286:5`.
- Exact recorded exception/assertion: `error: |- Expected values to be strictly equal: + actual - expected + 'INFERRED' - 'VERIFIED' code: 'ERR_ASSERTION' name: 'AssertionError' expected: 'VERIFIED' actual: 'INFERRED' operator: 'strictEqual'`.
- Responsible implementation: src/services/evidence-linking.service.js; evidence/evidence-ref-mapper.js.
- Classification: Intentional security-policy change.
- Is the old expected behavior valid? No where it expects counts, declarations, unparsed text or name matches to establish independently verified competence. Useful observations and claims must remain available with accurate labels.
- Corrective action: Retain extraction/matching utility and meaningful original assertions; replace unsupported VERIFIED/MATCHED/CORROBORATED expectations with OBSERVED/INFERRED/CLAIMED/PARTIAL as appropriate. Unsupported language parsing must yield no verified reference; source details remain available through manifest observations.
- Resolution: PASS in the final broader regression selection (see final test record).

## F09 — links second evidence item, preserves higher-quality primary evidence, and increments rollup score

- Original location: `tests/integration/evidence-linking.test.js:320:5`.
- Exact recorded exception/assertion: `error: |- Expected values to be strictly equal: + actual - expected + 'INFERRED' - 'VERIFIED' code: 'ERR_ASSERTION' name: 'AssertionError' expected: 'VERIFIED' actual: 'INFERRED' operator: 'strictEqual'`.
- Responsible implementation: src/services/evidence-linking.service.js; evidence/evidence-ref-mapper.js.
- Classification: Intentional security-policy change.
- Is the old expected behavior valid? No where it expects counts, declarations, unparsed text or name matches to establish independently verified competence. Useful observations and claims must remain available with accurate labels.
- Corrective action: Retain extraction/matching utility and meaningful original assertions; replace unsupported VERIFIED/MATCHED/CORROBORATED expectations with OBSERVED/INFERRED/CLAIMED/PARTIAL as appropriate. Unsupported language parsing must yield no verified reference; source details remain available through manifest observations.
- Resolution: PASS in the final broader regression selection (see final test record).

## F10 — rolls back entire transaction if any link in batch fails

- Original location: `tests/integration/evidence-linking.test.js:529:5`.
- Exact recorded exception/assertion: `error: |- The validation function is expected to return "true". Received false Caught error: ValidationError: Evidence cannot be substituted for a different skill code: 'ERR_ASSERTION' name: 'AssertionError'`.
- Responsible implementation: src/services/evidence-linking.service.js; evidence/evidence-ref-mapper.js.
- Classification: Fixture mismatch / causal setup.
- Is the old expected behavior valid? Yes, the lifecycle/utility behavior remains valid; verification must still be conservative.
- Corrective action: Use a fresh unbound row for the first batch item so the foreign second item actually exercises transactional rollback; retain no-partial-link assertion.
- Resolution: PASS in the final broader regression selection (see final test record).

## F11 — extracts manifests, imports, infrastructure, and commits into evidence items and candidate skill rollups

- Original location: `tests/integration/github-evidence-extractor.test.js:243:5`.
- Exact recorded exception/assertion: `error: 'Active candidate-owned repository connection required' code: 'VALIDATION_ERROR' name: 'ValidationError'`.
- Responsible implementation: src/extractors/github/github-evidence-extractor.js; code-scanners/import-scanner.js; skill-rollup.js.
- Classification: Fixture mismatch / causal setup.
- Is the old expected behavior valid? Yes, the lifecycle/utility behavior remains valid; verification must still be conservative.
- Corrective action: Mock the supported provider boundary with numeric repository identity, immutable tree and verified blob bytes.
- Resolution: PASS in the final broader regression selection (see final test record).

## F12 — executes repeated extraction without creating duplicate evidence items or candidate skills

- Original location: `tests/integration/github-evidence-extractor.test.js:321:5`.
- Exact recorded exception/assertion: `error: 'Active candidate-owned repository connection required' code: 'VALIDATION_ERROR' name: 'ValidationError'`.
- Responsible implementation: src/extractors/github/github-evidence-extractor.js; code-scanners/import-scanner.js; skill-rollup.js.
- Classification: Fixture mismatch / causal setup.
- Is the old expected behavior valid? Yes, the lifecycle/utility behavior remains valid; verification must still be conservative.
- Corrective action: Same pinned connector contract; preserve duplicate fingerprint/idempotency assertions.
- Resolution: PASS in the final broader regression selection (see final test record).

## F13 — scrubs planted secrets from manifest excerpt before persisting to PostgreSQL

- Original location: `tests/integration/github-evidence-extractor.test.js:388:5`.
- Exact recorded exception/assertion: `error: 'Active candidate-owned repository connection required' code: 'VALIDATION_ERROR' name: 'ValidationError'`.
- Responsible implementation: src/extractors/github/github-evidence-extractor.js; code-scanners/import-scanner.js; skill-rollup.js.
- Classification: Fixture mismatch / causal setup.
- Is the old expected behavior valid? Yes, the lifecycle/utility behavior remains valid; verification must still be conservative.
- Corrective action: Same pinned connector contract; preserve bounded chunk/persistence assertions.
- Resolution: PASS in the final broader regression selection (see final test record).

## F14 — cascades evidence items and candidate skills when candidate is deleted

- Original location: `tests/integration/github-evidence-extractor.test.js:480:5`.
- Exact recorded exception/assertion: `error: 'Candidate not found in current user scope' code: 'NOT_FOUND' name: 'NotFoundError'`.
- Responsible implementation: src/extractors/github/github-evidence-extractor.js; code-scanners/import-scanner.js; skill-rollup.js.
- Classification: Fixture mismatch / causal setup.
- Is the old expected behavior valid? Yes, the lifecycle/utility behavior remains valid; verification must still be conservative.
- Corrective action: Create candidate-owned active connection/resource before extraction; preserve cascade deletion assertions.
- Resolution: PASS in the final broader regression selection (see final test record).

## F15 — 5. POST /resumes/:id/approve approves claims, promotes to Base Resume, and adds CLAIMED skills without downgrading VERIFIED skills

- Original location: `tests/integration/source-resume-ingestion.test.js:356:3`.
- Exact recorded exception/assertion: `error: |- Expected values to be strictly equal: + actual - expected + 'INFERRED' - 'VERIFIED' code: 'ERR_ASSERTION' name: 'AssertionError' expected: 'VERIFIED' actual: 'INFERRED' operator: 'strictEqual'`.
- Responsible implementation: src/services/candidate-profile.service.js; resume claim ingestion.
- Classification: Intentional security-policy change.
- Is the old expected behavior valid? No where it expects counts, declarations, unparsed text or name matches to establish independently verified competence. Useful observations and claims must remain available with accurate labels.
- Corrective action: Retain extraction/matching utility and meaningful original assertions; replace unsupported VERIFIED/MATCHED/CORROBORATED expectations with OBSERVED/INFERRED/CLAIMED/PARTIAL as appropriate. Unsupported language parsing must yield no verified reference; source details remain available through manifest observations.
- Resolution: PASS in the final broader regression selection (see final test record).

## F16 — should produce MATCHED when evidence is from candidate-authored code

- Original location: `tests/unit/analyze-job-fit-evidence-trust.test.js:169:3`.
- Exact recorded exception/assertion: `error: |- Expected values to be strictly equal: + actual - expected + 'PARTIAL' - 'MATCHED' code: 'ERR_ASSERTION' name: 'AssertionError' expected: 'MATCHED' actual: 'PARTIAL' operator: 'strictEqual'`.
- Responsible implementation: src/services/evidence-matching.service.js.
- Classification: Intentional security-policy change.
- Is the old expected behavior valid? No where it expects counts, declarations, unparsed text or name matches to establish independently verified competence. Useful observations and claims must remain available with accurate labels.
- Corrective action: Retain extraction/matching utility and meaningful original assertions; replace unsupported VERIFIED/MATCHED/CORROBORATED expectations with OBSERVED/INFERRED/CLAIMED/PARTIAL as appropriate. Unsupported language parsing must yield no verified reference; source details remain available through manifest observations.
- Resolution: PASS in the final broader regression selection (see final test record).

## F17 — should preserve CORROBORATED provenance through matching

- Original location: `tests/unit/analyze-job-fit-evidence-trust.test.js:201:3`.
- Exact recorded exception/assertion: `error: |- Expected values to be strictly equal: + actual - expected + 'PARTIAL' - 'MATCHED' code: 'ERR_ASSERTION' name: 'AssertionError' expected: 'MATCHED' actual: 'PARTIAL' operator: 'strictEqual'`.
- Responsible implementation: src/services/evidence-matching.service.js.
- Classification: Intentional security-policy change.
- Is the old expected behavior valid? No where it expects counts, declarations, unparsed text or name matches to establish independently verified competence. Useful observations and claims must remain available with accurate labels.
- Corrective action: Retain extraction/matching utility and meaningful original assertions; replace unsupported VERIFIED/MATCHED/CORROBORATED expectations with OBSERVED/INFERRED/CLAIMED/PARTIAL as appropriate. Unsupported language parsing must yield no verified reference; source details remain available through manifest observations.
- Resolution: PASS in the final broader regression selection (see final test record).

## F18 — 4. renders REAL skills strictly separated by provenance truth

- Original location: `tests/unit/candidate-artifact-content.test.js:174:3`.
- Exact recorded exception/assertion: `error: |- Expected values to be strictly equal: + actual - expected + 'INFERRED' - 'VERIFIED' code: 'ERR_ASSERTION' name: 'AssertionError' expected: 'VERIFIED' actual: 'INFERRED' operator: 'strictEqual'`.
- Responsible implementation: src/services/candidate-artifact-content.service.js.
- Classification: Intentional security-policy change.
- Is the old expected behavior valid? No where it expects counts, declarations, unparsed text or name matches to establish independently verified competence. Useful observations and claims must remain available with accurate labels.
- Corrective action: Retain extraction/matching utility and meaningful original assertions; replace unsupported VERIFIED/MATCHED/CORROBORATED expectations with OBSERVED/INFERRED/CLAIMED/PARTIAL as appropriate. Unsupported language parsing must yield no verified reference; source details remain available through manifest observations.
- Resolution: PASS in the final broader regression selection (see final test record).

## F19 — 7. cover letter contains REAL candidate evidence (employer, projects, verified skills)

- Original location: `tests/unit/candidate-artifact-content.test.js:226:3`.
- Exact recorded exception/assertion: `error: |- The expression evaluated to a falsy value: assert.ok(docs.coverLetter.matchedVerifiedSkills.length > 0) code: 'ERR_ASSERTION' name: 'AssertionError' expected: true actual: false operator: '=='`.
- Responsible implementation: src/services/candidate-artifact-content.service.js.
- Classification: Intentional security-policy change.
- Is the old expected behavior valid? No where it expects counts, declarations, unparsed text or name matches to establish independently verified competence. Useful observations and claims must remain available with accurate labels.
- Corrective action: Retain extraction/matching utility and meaningful original assertions; replace unsupported VERIFIED/MATCHED/CORROBORATED expectations with OBSERVED/INFERRED/CLAIMED/PARTIAL as appropriate. Unsupported language parsing must yield no verified reference; source details remain available through manifest observations.
- Resolution: PASS in the final broader regression selection (see final test record).

## F20 — 10. tailoring prioritizes job-relevant verified skills (Vercel backend)

- Original location: `tests/unit/candidate-artifact-content.test.js:292:3`.
- Exact recorded exception/assertion: `error: |- The expression evaluated to a falsy value: assert.ok(docs.evidence.verifiedSkillsMatched.length > 0) code: 'ERR_ASSERTION' name: 'AssertionError' expected: true actual: false operator: '=='`.
- Responsible implementation: src/services/candidate-artifact-content.service.js.
- Classification: Intentional security-policy change.
- Is the old expected behavior valid? No where it expects counts, declarations, unparsed text or name matches to establish independently verified competence. Useful observations and claims must remain available with accurate labels.
- Corrective action: Retain extraction/matching utility and meaningful original assertions; replace unsupported VERIFIED/MATCHED/CORROBORATED expectations with OBSERVED/INFERRED/CLAIMED/PARTIAL as appropriate. Unsupported language parsing must yield no verified reference; source details remain available through manifest observations.
- Resolution: PASS in the final broader regression selection (see final test record).

## F21 — 1. synthesizes OPENING paragraph grounded in verified skills, candidate name, and company

- Original location: `tests/unit/cover-letter-drafting.service.test.js:313:3`.
- Exact recorded exception/assertion: `error: |- Expected values to be strictly equal: + actual - expected + 'INFERRED' - 'VERIFIED' code: 'ERR_ASSERTION' name: 'AssertionError' expected: 'VERIFIED' actual: 'INFERRED' operator: 'strictEqual'`.
- Responsible implementation: src/services/cover-letter-drafting.service.js.
- Classification: Intentional security-policy change.
- Is the old expected behavior valid? No where it expects counts, declarations, unparsed text or name matches to establish independently verified competence. Useful observations and claims must remain available with accurate labels.
- Corrective action: Retain extraction/matching utility and meaningful original assertions; replace unsupported VERIFIED/MATCHED/CORROBORATED expectations with OBSERVED/INFERRED/CLAIMED/PARTIAL as appropriate. Unsupported language parsing must yield no verified reference; source details remain available through manifest observations.
- Resolution: PASS in the final broader regression selection (see final test record).

## F22 — formats lightweight EvidenceRef omitting large payloads

- Original location: `tests/unit/evidence-linking.test.js:192:5`.
- Exact recorded exception/assertion: `error: |- Expected values to be strictly equal: + actual - expected + 'INFERRED' - 'VERIFIED' code: 'ERR_ASSERTION' name: 'AssertionError' expected: 'VERIFIED' actual: 'INFERRED' operator: 'strictEqual'`.
- Responsible implementation: src/services/evidence-linking.service.js; evidence/evidence-ref-mapper.js.
- Classification: Intentional security-policy change.
- Is the old expected behavior valid? No where it expects counts, declarations, unparsed text or name matches to establish independently verified competence. Useful observations and claims must remain available with accurate labels.
- Corrective action: Retain extraction/matching utility and meaningful original assertions; replace unsupported VERIFIED/MATCHED/CORROBORATED expectations with OBSERVED/INFERRED/CLAIMED/PARTIAL as appropriate. Unsupported language parsing must yield no verified reference; source details remain available through manifest observations.
- Resolution: PASS in the final broader regression selection (see final test record).

## F23 — evaluates verified skill with package manifest evidence as MATCHED

- Original location: `tests/unit/evidence-matching.service.test.js:80:5`.
- Exact recorded exception/assertion: `error: |- Expected values to be strictly equal: 0 !== 1 code: 'ERR_ASSERTION' name: 'AssertionError' expected: 1 actual: 0 operator: 'strictEqual'`.
- Responsible implementation: src/services/evidence-matching.service.js; domain/career/skill-taxonomy.js.
- Classification: Intentional security-policy change.
- Is the old expected behavior valid? No where it expects counts, declarations, unparsed text or name matches to establish independently verified competence. Useful observations and claims must remain available with accurate labels.
- Corrective action: Retain extraction/matching utility and meaningful original assertions; replace unsupported VERIFIED/MATCHED/CORROBORATED expectations with OBSERVED/INFERRED/CLAIMED/PARTIAL as appropriate. Unsupported language parsing must yield no verified reference; source details remain available through manifest observations.
- Resolution: PASS in the final broader regression selection (see final test record).

## F24 — normalizes synonym variations ("Postgres" -> postgresql) seamlessly

- Original location: `tests/unit/evidence-matching.service.test.js:149:5`.
- Exact recorded exception/assertion: `error: |- Expected values to be strictly equal: + actual - expected + 'PARTIAL' - 'MATCHED' code: 'ERR_ASSERTION' name: 'AssertionError' expected: 'MATCHED' actual: 'PARTIAL' operator: 'strictEqual'`.
- Responsible implementation: src/services/evidence-matching.service.js; domain/career/skill-taxonomy.js.
- Classification: Intentional security-policy change.
- Is the old expected behavior valid? No where it expects counts, declarations, unparsed text or name matches to establish independently verified competence. Useful observations and claims must remain available with accurate labels.
- Corrective action: Retain extraction/matching utility and meaningful original assertions; replace unsupported VERIFIED/MATCHED/CORROBORATED expectations with OBSERVED/INFERRED/CLAIMED/PARTIAL as appropriate. Unsupported language parsing must yield no verified reference; source details remain available through manifest observations.
- Resolution: PASS in the final broader regression selection (see final test record).

## F25 — evaluates manual claim without code evidence as PARTIAL, never MATCHED

- Original location: `tests/unit/evidence-matching.service.test.js:198:5`.
- Exact recorded exception/assertion: `error: |- Expected values to be strictly equal: 0 !== 1 code: 'ERR_ASSERTION' name: 'AssertionError' expected: 1 actual: 0 operator: 'strictEqual'`.
- Responsible implementation: src/services/evidence-matching.service.js; domain/career/skill-taxonomy.js.
- Classification: Independently reproduced pre-ISSUE-06 defect.
- Is the old expected behavior valid? No: the pre-existing implementation classifies an unsupported manual claim as UNVERIFIED_CLAIM, not PARTIAL.
- Corrective action: Pre-ISSUE-06 HEAD reproduces partialCount=0. Assert existing UNVERIFIED_CLAIM semantics while retaining never-MATCHED protection.
- Resolution: PASS in the final broader regression selection (see final test record).

## F26 — evaluates BUILT_ON specialization as MATCHED (Next.js candidate for React requirement)

- Original location: `tests/unit/evidence-matching.service.test.js:375:5`.
- Exact recorded exception/assertion: `error: |- Expected values to be strictly equal: 0 !== 1 code: 'ERR_ASSERTION' name: 'AssertionError' expected: 1 actual: 0 operator: 'strictEqual'`.
- Responsible implementation: src/services/evidence-matching.service.js; domain/career/skill-taxonomy.js.
- Classification: Intentional security-policy change.
- Is the old expected behavior valid? No where it expects counts, declarations, unparsed text or name matches to establish independently verified competence. Useful observations and claims must remain available with accurate labels.
- Corrective action: Retain extraction/matching utility and meaningful original assertions; replace unsupported VERIFIED/MATCHED/CORROBORATED expectations with OBSERVED/INFERRED/CLAIMED/PARTIAL as appropriate. Unsupported language parsing must yield no verified reference; source details remain available through manifest observations.
- Resolution: PASS in the final broader regression selection (see final test record).

## F27 — evaluates DIRECT IMPLEMENTS as MATCHED (Fastify candidate for REST API requirement)

- Original location: `tests/unit/evidence-matching.service.test.js:519:5`.
- Exact recorded exception/assertion: `error: |- Expected values to be strictly equal: 0 !== 1 code: 'ERR_ASSERTION' name: 'AssertionError' expected: 1 actual: 0 operator: 'strictEqual'`.
- Responsible implementation: src/services/evidence-matching.service.js; domain/career/skill-taxonomy.js.
- Classification: Intentional security-policy change.
- Is the old expected behavior valid? No where it expects counts, declarations, unparsed text or name matches to establish independently verified competence. Useful observations and claims must remain available with accurate labels.
- Corrective action: Retain extraction/matching utility and meaningful original assertions; replace unsupported VERIFIED/MATCHED/CORROBORATED expectations with OBSERVED/INFERRED/CLAIMED/PARTIAL as appropriate. Unsupported language parsing must yield no verified reference; source details remain available through manifest observations.
- Resolution: PASS in the final broader regression selection (see final test record).

## F28 — evaluates DIRECT IMPLEMENTS as MATCHED (MCP candidate for json-rpc requirement)

- Original location: `tests/unit/evidence-matching.service.test.js:570:5`.
- Exact recorded exception/assertion: `error: |- Expected values to be strictly equal: 0 !== 1 code: 'ERR_ASSERTION' name: 'AssertionError' expected: 1 actual: 0 operator: 'strictEqual'`.
- Responsible implementation: src/services/evidence-matching.service.js; domain/career/skill-taxonomy.js.
- Classification: Intentional security-policy change.
- Is the old expected behavior valid? No where it expects counts, declarations, unparsed text or name matches to establish independently verified competence. Useful observations and claims must remain available with accurate labels.
- Corrective action: Retain extraction/matching utility and meaningful original assertions; replace unsupported VERIFIED/MATCHED/CORROBORATED expectations with OBSERVED/INFERRED/CLAIMED/PARTIAL as appropriate. Unsupported language parsing must yield no verified reference; source details remain available through manifest observations.
- Resolution: PASS in the final broader regression selection (see final test record).

## F29 — evaluates taxonomy specialization as MATCHED (PostgreSQL candidate for relational-database requirement)

- Original location: `tests/unit/evidence-matching.service.test.js:619:5`.
- Exact recorded exception/assertion: `error: |- Expected values to be strictly equal: 0 !== 1 code: 'ERR_ASSERTION' name: 'AssertionError' expected: 1 actual: 0 operator: 'strictEqual'`.
- Responsible implementation: src/services/evidence-matching.service.js; domain/career/skill-taxonomy.js.
- Classification: Intentional security-policy change.
- Is the old expected behavior valid? No where it expects counts, declarations, unparsed text or name matches to establish independently verified competence. Useful observations and claims must remain available with accurate labels.
- Corrective action: Retain extraction/matching utility and meaningful original assertions; replace unsupported VERIFIED/MATCHED/CORROBORATED expectations with OBSERVED/INFERRED/CLAIMED/PARTIAL as appropriate. Unsupported language parsing must yield no verified reference; source details remain available through manifest observations.
- Resolution: PASS in the final broader regression selection (see final test record).

## F30 — identifies scannable entrypoint files accurately

- Original location: `tests/unit/github-evidence-extractor.test.js:346:5`.
- Exact recorded exception/assertion: `error: |- Expected values to be strictly equal: false !== true code: 'ERR_ASSERTION' name: 'AssertionError' expected: true actual: false operator: 'strictEqual'`.
- Responsible implementation: src/extractors/github/github-evidence-extractor.js; code-scanners/import-scanner.js; skill-rollup.js.
- Classification: Intentional security-policy change.
- Is the old expected behavior valid? No where it expects counts, declarations, unparsed text or name matches to establish independently verified competence. Useful observations and claims must remain available with accurate labels.
- Corrective action: Retain extraction/matching utility and meaningful original assertions; replace unsupported VERIFIED/MATCHED/CORROBORATED expectations with OBSERVED/INFERRED/CLAIMED/PARTIAL as appropriate. Unsupported language parsing must yield no verified reference; source details remain available through manifest observations.
- Resolution: PASS in the final broader regression selection (see final test record).

## F31 — scans JavaScript and TypeScript ESM & CommonJS imports

- Original location: `tests/unit/github-evidence-extractor.test.js:359:5`.
- Exact recorded exception/assertion: `error: |- Expected values to be strictly equal: 2 !== 3 code: 'ERR_ASSERTION' name: 'AssertionError' expected: 3 actual: 2 operator: 'strictEqual'`.
- Responsible implementation: src/extractors/github/github-evidence-extractor.js; code-scanners/import-scanner.js; skill-rollup.js.
- Classification: Intentional security-policy change.
- Is the old expected behavior valid? No where it expects counts, declarations, unparsed text or name matches to establish independently verified competence. Useful observations and claims must remain available with accurate labels.
- Corrective action: Retain extraction/matching utility and meaningful original assertions; replace unsupported VERIFIED/MATCHED/CORROBORATED expectations with OBSERVED/INFERRED/CLAIMED/PARTIAL as appropriate. Unsupported language parsing must yield no verified reference; source details remain available through manifest observations.
- Resolution: PASS in the final broader regression selection (see final test record).

## F32 — scans Python import and from ... import statements

- Original location: `tests/unit/github-evidence-extractor.test.js:376:5`.
- Exact recorded exception/assertion: `error: |- Expected values to be strictly equal: 0 !== 3 code: 'ERR_ASSERTION' name: 'AssertionError' expected: 3 actual: 0 operator: 'strictEqual'`.
- Responsible implementation: src/extractors/github/github-evidence-extractor.js; code-scanners/import-scanner.js; skill-rollup.js.
- Classification: Intentional security-policy change.
- Is the old expected behavior valid? No where it expects counts, declarations, unparsed text or name matches to establish independently verified competence. Useful observations and claims must remain available with accurate labels.
- Corrective action: Retain extraction/matching utility and meaningful original assertions; replace unsupported VERIFIED/MATCHED/CORROBORATED expectations with OBSERVED/INFERRED/CLAIMED/PARTIAL as appropriate. Unsupported language parsing must yield no verified reference; source details remain available through manifest observations.
- Resolution: PASS in the final broader regression selection (see final test record).

## F33 — scans Go imports and import blocks

- Original location: `tests/unit/github-evidence-extractor.test.js:391:5`.
- Exact recorded exception/assertion: `error: |- Expected values to be strictly equal: 0 !== 3 code: 'ERR_ASSERTION' name: 'AssertionError' expected: 3 actual: 0 operator: 'strictEqual'`.
- Responsible implementation: src/extractors/github/github-evidence-extractor.js; code-scanners/import-scanner.js; skill-rollup.js.
- Classification: Intentional security-policy change.
- Is the old expected behavior valid? No where it expects counts, declarations, unparsed text or name matches to establish independently verified competence. Useful observations and claims must remain available with accurate labels.
- Corrective action: Retain extraction/matching utility and meaningful original assertions; replace unsupported VERIFIED/MATCHED/CORROBORATED expectations with OBSERVED/INFERRED/CLAIMED/PARTIAL as appropriate. Unsupported language parsing must yield no verified reference; source details remain available through manifest observations.
- Resolution: PASS in the final broader regression selection (see final test record).

## F34 — scans Rust use statements

- Original location: `tests/unit/github-evidence-extractor.test.js:408:5`.
- Exact recorded exception/assertion: `error: |- Expected values to be strictly equal: 0 !== 2 code: 'ERR_ASSERTION' name: 'AssertionError' expected: 2 actual: 0 operator: 'strictEqual'`.
- Responsible implementation: src/extractors/github/github-evidence-extractor.js; code-scanners/import-scanner.js; skill-rollup.js.
- Classification: Intentional security-policy change.
- Is the old expected behavior valid? No where it expects counts, declarations, unparsed text or name matches to establish independently verified competence. Useful observations and claims must remain available with accurate labels.
- Corrective action: Retain extraction/matching utility and meaningful original assertions; replace unsupported VERIFIED/MATCHED/CORROBORATED expectations with OBSERVED/INFERRED/CLAIMED/PARTIAL as appropriate. Unsupported language parsing must yield no verified reference; source details remain available through manifest observations.
- Resolution: PASS in the final broader regression selection (see final test record).

## F35 — bounds processing when given excessive lines (>1000) or oversized lines (>500 chars)

- Original location: `tests/unit/github-evidence-extractor.test.js:422:5`.
- Exact recorded exception/assertion: `error: |- Expected values to be strictly equal: 0 !== 1000 code: 'ERR_ASSERTION' name: 'AssertionError' expected: 1000 actual: 0 operator: 'strictEqual'`.
- Responsible implementation: src/extractors/github/github-evidence-extractor.js; code-scanners/import-scanner.js; skill-rollup.js.
- Classification: Intentional security-policy change.
- Is the old expected behavior valid? No where it expects counts, declarations, unparsed text or name matches to establish independently verified competence. Useful observations and claims must remain available with accurate labels.
- Corrective action: Retain extraction/matching utility and meaningful original assertions; replace unsupported VERIFIED/MATCHED/CORROBORATED expectations with OBSERVED/INFERRED/CLAIMED/PARTIAL as appropriate. Unsupported language parsing must yield no verified reference; source details remain available through manifest observations.
- Resolution: PASS in the final broader regression selection (see final test record).

## F36 — computes single verified production evidence: 1.00 * (0.8 + 0.05 * 1) = 0.85

- Original location: `tests/unit/github-evidence-extractor.test.js:612:5`.
- Exact recorded exception/assertion: `error: |- Expected values to be strictly equal: + actual - expected + 'INFERRED' - 'VERIFIED' code: 'ERR_ASSERTION' name: 'AssertionError' expected: 'VERIFIED' actual: 'INFERRED' operator: 'strictEqual'`.
- Responsible implementation: src/extractors/github/github-evidence-extractor.js; code-scanners/import-scanner.js; skill-rollup.js.
- Classification: Intentional security-policy change.
- Is the old expected behavior valid? No where it expects counts, declarations, unparsed text or name matches to establish independently verified competence. Useful observations and claims must remain available with accurate labels.
- Corrective action: Retain extraction/matching utility and meaningful original assertions; replace unsupported VERIFIED/MATCHED/CORROBORATED expectations with OBSERVED/INFERRED/CLAIMED/PARTIAL as appropriate. Unsupported language parsing must yield no verified reference; source details remain available through manifest observations.
- Resolution: PASS in the final broader regression selection (see final test record).

## F37 — scales rollup score with multiple evidence items up to 4 cap: 1.00 * (0.8 + 0.05 * 4) = 1.00

- Original location: `tests/unit/github-evidence-extractor.test.js:627:5`.
- Exact recorded exception/assertion: `error: |- Expected values to be strictly equal: + actual - expected + 'INFERRED' - 'VERIFIED' code: 'ERR_ASSERTION' name: 'AssertionError' expected: 'VERIFIED' actual: 'INFERRED' operator: 'strictEqual'`.
- Responsible implementation: src/extractors/github/github-evidence-extractor.js; code-scanners/import-scanner.js; skill-rollup.js.
- Classification: Intentional security-policy change.
- Is the old expected behavior valid? No where it expects counts, declarations, unparsed text or name matches to establish independently verified competence. Useful observations and claims must remain available with accurate labels.
- Corrective action: Retain extraction/matching utility and meaningful original assertions; replace unsupported VERIFIED/MATCHED/CORROBORATED expectations with OBSERVED/INFERRED/CLAIMED/PARTIAL as appropriate. Unsupported language parsing must yield no verified reference; source details remain available through manifest observations.
- Resolution: PASS in the final broader regression selection (see final test record).

## F38 — successfully produces truthful compact profile answering all 17 ChatGPT questions

- Original location: `tests/unit/mcp-candidate-profile-contract.test.js:571:5`.
- Exact recorded exception/assertion: `error: 'Candidate not found: 10a2b51b-09bf-4090-8040-1f60ebeb89c9' code: 'NOT_FOUND' name: 'NotFoundError'`.
- Responsible implementation: src/services/candidate-profile.service.js; non-hermetic personal fixture.
- Classification: Independently reproduced pre-ISSUE-06 defect.
- Is the old expected behavior valid? A contract check is useful, but dependence on an absent personal database row is not a hermetic unit-test fixture.
- Corrective action: Preserve all17 question/completeness, bounded payload and trust assertions using an isolated synthetic candidate; remove the required personal database row.
- Resolution: PASS in final broad selection. Earlier failure independently reproduced against archived HEAD `86a56c0` in `%TEMP%/issue06-prechange-baseline.log`; not silently classified or skipped.

## F39 — 3. Unsupported Cloud Experience: AI refuses to guess or claim cloud platforms without code evidence

- Original location: `tests/unit/p87-ai-career-assistant.test.js:152:3`.
- Exact recorded exception/assertion: `error: |- Expected values to be strictly equal: 0 !== 1 code: 'ERR_ASSERTION' name: 'AssertionError' expected: 1 actual: 0 operator: 'strictEqual'`.
- Responsible implementation: src/services/ai-career-assistant.service.js.
- Classification: Intentional security-policy change.
- Is the old expected behavior valid? No where it expects counts, declarations, unparsed text or name matches to establish independently verified competence. Useful observations and claims must remain available with accurate labels.
- Corrective action: Retain extraction/matching utility and meaningful original assertions; replace unsupported VERIFIED/MATCHED/CORROBORATED expectations with OBSERVED/INFERRED/CLAIMED/PARTIAL as appropriate. Unsupported language parsing must yield no verified reference; source details remain available through manifest observations.
- Resolution: PASS in the final broader regression selection (see final test record).

## F40 — 2. evaluates Level 1 (PACKAGE_MANIFEST) for package-only JavaScript as CLAIMED on primary tier

- Original location: `tests/unit/skill-taxonomy.test.js:727:5`.
- Exact recorded exception/assertion: `error: |- The expression evaluated to a falsy value: assert.ok(res.evidenceExplanation.includes('insufficient')) code: 'ERR_ASSERTION' name: 'AssertionError' expected: true actual: false operator: '=='`.
- Responsible implementation: src/domain/career/skill-taxonomy.js.
- Classification: Legitimate compatibility regression.
- Is the old expected behavior valid? Yes, the lifecycle/utility behavior remains valid; verification must still be conservative.
- Corrective action: Restore the insufficient-support explanation without restoring VERIFIED competence.
- Resolution: PASS in the final broader regression selection (see final test record).

## F41 — 3. evaluates Level 1 (PACKAGE_MANIFEST) for GitHub-only technology as SIGNAL + VERIFIED

- Original location: `tests/unit/skill-taxonomy.test.js:745:5`.
- Exact recorded exception/assertion: `error: |- Expected values to be strictly equal: + actual - expected + 'INFERRED' - 'VERIFIED' code: 'ERR_ASSERTION' name: 'AssertionError' expected: 'VERIFIED' actual: 'INFERRED' operator: 'strictEqual'`.
- Responsible implementation: src/domain/career/skill-taxonomy.js.
- Classification: Intentional security-policy change.
- Is the old expected behavior valid? No where it expects counts, declarations, unparsed text or name matches to establish independently verified competence. Useful observations and claims must remain available with accurate labels.
- Corrective action: Retain extraction/matching utility and meaningful original assertions; replace unsupported VERIFIED/MATCHED/CORROBORATED expectations with OBSERVED/INFERRED/CLAIMED/PARTIAL as appropriate. Unsupported language parsing must yield no verified reference; source details remain available through manifest observations.
- Resolution: PASS in the final broader regression selection (see final test record).

## F42 — 4. evaluates Level 1 for component packages like React Tabs as SIGNAL + VERIFIED

- Original location: `tests/unit/skill-taxonomy.test.js:762:5`.
- Exact recorded exception/assertion: `error: |- Expected values to be strictly equal: + actual - expected + 'INFERRED' - 'VERIFIED' code: 'ERR_ASSERTION' name: 'AssertionError' expected: 'VERIFIED' actual: 'INFERRED' operator: 'strictEqual'`.
- Responsible implementation: src/domain/career/skill-taxonomy.js.
- Classification: Intentional security-policy change.
- Is the old expected behavior valid? No where it expects counts, declarations, unparsed text or name matches to establish independently verified competence. Useful observations and claims must remain available with accurate labels.
- Corrective action: Retain extraction/matching utility and meaningful original assertions; replace unsupported VERIFIED/MATCHED/CORROBORATED expectations with OBSERVED/INFERRED/CLAIMED/PARTIAL as appropriate. Unsupported language parsing must yield no verified reference; source details remain available through manifest observations.
- Resolution: PASS in the final broader regression selection (see final test record).

## F43 — 5. evaluates Level 1 for utility packages like Python Dotenv as SIGNAL + VERIFIED

- Original location: `tests/unit/skill-taxonomy.test.js:778:5`.
- Exact recorded exception/assertion: `error: |- Expected values to be strictly equal: + actual - expected + 'INFERRED' - 'VERIFIED' code: 'ERR_ASSERTION' name: 'AssertionError' expected: 'VERIFIED' actual: 'INFERRED' operator: 'strictEqual'`.
- Responsible implementation: src/domain/career/skill-taxonomy.js.
- Classification: Intentional security-policy change.
- Is the old expected behavior valid? No where it expects counts, declarations, unparsed text or name matches to establish independently verified competence. Useful observations and claims must remain available with accurate labels.
- Corrective action: Retain extraction/matching utility and meaningful original assertions; replace unsupported VERIFIED/MATCHED/CORROBORATED expectations with OBSERVED/INFERRED/CLAIMED/PARTIAL as appropriate. Unsupported language parsing must yield no verified reference; source details remain available through manifest observations.
- Resolution: PASS in the final broader regression selection (see final test record).

## F44 — 6. evaluates Level 3 (SUBSTANTIAL_IMPLEMENTATION) as PRIMARY + VERIFIED for GitHub-only skills with >=3 citations

- Original location: `tests/unit/skill-taxonomy.test.js:794:5`.
- Exact recorded exception/assertion: `error: |- Expected values to be strictly equal: 1 !== 3 code: 'ERR_ASSERTION' name: 'AssertionError' expected: 3 actual: 1 operator: 'strictEqual'`.
- Responsible implementation: src/domain/career/skill-taxonomy.js.
- Classification: Intentional security-policy change.
- Is the old expected behavior valid? No where it expects counts, declarations, unparsed text or name matches to establish independently verified competence. Useful observations and claims must remain available with accurate labels.
- Corrective action: Retain extraction/matching utility and meaningful original assertions; replace unsupported VERIFIED/MATCHED/CORROBORATED expectations with OBSERVED/INFERRED/CLAIMED/PARTIAL as appropriate. Unsupported language parsing must yield no verified reference; source details remain available through manifest observations.
- Resolution: PASS in the final broader regression selection (see final test record).

## F45 — 7. evaluates Level 4 (CORROBORATED) as PRIMARY + CORROBORATED for skills with >=3 citations and resume claim

- Original location: `tests/unit/skill-taxonomy.test.js:812:5`.
- Exact recorded exception/assertion: `error: |- Expected values to be strictly equal: 1 !== 4 code: 'ERR_ASSERTION' name: 'AssertionError' expected: 4 actual: 1 operator: 'strictEqual'`.
- Responsible implementation: src/domain/career/skill-taxonomy.js.
- Classification: Intentional security-policy change.
- Is the old expected behavior valid? No where it expects counts, declarations, unparsed text or name matches to establish independently verified competence. Useful observations and claims must remain available with accurate labels.
- Corrective action: Retain extraction/matching utility and meaningful original assertions; replace unsupported VERIFIED/MATCHED/CORROBORATED expectations with OBSERVED/INFERRED/CLAIMED/PARTIAL as appropriate. Unsupported language parsing must yield no verified reference; source details remain available through manifest observations.
- Resolution: PASS in the final broader regression selection (see final test record).

## F46 — A. Python resume claim only evaluates as LEVEL 0 CLAIMED

- Original location: `tests/unit/skill-taxonomy.test.js:834:5`.
- Exact recorded exception/assertion: `error: |- The expression evaluated to a falsy value: assert.ok(res.evidenceExplanation.includes('[Unverified User Claim]')) code: 'ERR_ASSERTION' name: 'AssertionError' expected: true actual: false operator: '=='`.
- Responsible implementation: src/domain/career/skill-taxonomy.js.
- Classification: Legitimate compatibility regression.
- Is the old expected behavior valid? Yes, the lifecycle/utility behavior remains valid; verification must still be conservative.
- Corrective action: Restore [Unverified User Claim] explanation; keep CLAIMED.
- Resolution: PASS in the final broader regression selection (see final test record).

## F47 — B. FastAPI package alone is NOT enough for Python VERIFIED (remains CLAIMED with supporting signal)

- Original location: `tests/unit/skill-taxonomy.test.js:851:5`.
- Exact recorded exception/assertion: `error: |- Expected values to be strictly equal: 0 !== 1 code: 'ERR_ASSERTION' name: 'AssertionError' expected: 1 actual: 0 operator: 'strictEqual'`.
- Responsible implementation: src/domain/career/skill-taxonomy.js.
- Classification: Legitimate compatibility regression.
- Is the old expected behavior valid? Yes, the lifecycle/utility behavior remains valid; verification must still be conservative.
- Corrective action: Retain framework support signals at SIGNAL level; never infer verified proficiency.
- Resolution: PASS in the final broader regression selection (see final test record).

## F48 — C. FastAPI + substantial Python source implementation evaluates as eligible for PRIMARY + CORROBORATED

- Original location: `tests/unit/skill-taxonomy.test.js:877:5`.
- Exact recorded exception/assertion: `error: |- Expected values to be strictly equal: 1 !== 4 code: 'ERR_ASSERTION' name: 'AssertionError' expected: 4 actual: 1 operator: 'strictEqual'`.
- Responsible implementation: src/domain/career/skill-taxonomy.js.
- Classification: Intentional security-policy change.
- Is the old expected behavior valid? No where it expects counts, declarations, unparsed text or name matches to establish independently verified competence. Useful observations and claims must remain available with accurate labels.
- Corrective action: Retain extraction/matching utility and meaningful original assertions; replace unsupported VERIFIED/MATCHED/CORROBORATED expectations with OBSERVED/INFERRED/CLAIMED/PARTIAL as appropriate. Unsupported language parsing must yield no verified reference; source details remain available through manifest observations.
- Resolution: PASS in the final broader regression selection (see final test record).

## F49 — E. @eslint/js manifest alone is NOT enough for JavaScript VERIFIED (remains CLAIMED)

- Original location: `tests/unit/skill-taxonomy.test.js:927:5`.
- Exact recorded exception/assertion: `error: |- The expression evaluated to a falsy value: assert.ok(res.evidenceExplanation.includes('insufficient for primary verification')) code: 'ERR_ASSERTION' name: 'AssertionError' expected: true actual: false operator: '=='`.
- Responsible implementation: src/domain/career/skill-taxonomy.js.
- Classification: Legitimate compatibility regression.
- Is the old expected behavior valid? Yes, the lifecycle/utility behavior remains valid; verification must still be conservative.
- Corrective action: Restore insufficient-support explanation; keep conservative status.
- Resolution: PASS in the final broader regression selection (see final test record).

## F50 — F. Substantial .js source implementation evaluates as eligible for PRIMARY + CORROBORATED

- Original location: `tests/unit/skill-taxonomy.test.js:944:5`.
- Exact recorded exception/assertion: `error: |- Expected values to be strictly equal: 1 !== 4 code: 'ERR_ASSERTION' name: 'AssertionError' expected: 4 actual: 1 operator: 'strictEqual'`.
- Responsible implementation: src/domain/career/skill-taxonomy.js.
- Classification: Intentional security-policy change.
- Is the old expected behavior valid? No where it expects counts, declarations, unparsed text or name matches to establish independently verified competence. Useful observations and claims must remain available with accurate labels.
- Corrective action: Retain extraction/matching utility and meaningful original assertions; replace unsupported VERIFIED/MATCHED/CORROBORATED expectations with OBSERVED/INFERRED/CLAIMED/PARTIAL as appropriate. Unsupported language parsing must yield no verified reference; source details remain available through manifest observations.
- Resolution: PASS in the final broader regression selection (see final test record).

## F51 — G. TypeScript source implementation evaluates as PRIMARY + CORROBORATED

- Original location: `tests/unit/skill-taxonomy.test.js:961:5`.
- Exact recorded exception/assertion: `error: |- Expected values to be strictly equal: 1 !== 4 code: 'ERR_ASSERTION' name: 'AssertionError' expected: 4 actual: 1 operator: 'strictEqual'`.
- Responsible implementation: src/domain/career/skill-taxonomy.js.
- Classification: Intentional security-policy change.
- Is the old expected behavior valid? No where it expects counts, declarations, unparsed text or name matches to establish independently verified competence. Useful observations and claims must remain available with accurate labels.
- Corrective action: Retain extraction/matching utility and meaningful original assertions; replace unsupported VERIFIED/MATCHED/CORROBORATED expectations with OBSERVED/INFERRED/CLAIMED/PARTIAL as appropriate. Unsupported language parsing must yield no verified reference; source details remain available through manifest observations.
- Resolution: PASS in the final broader regression selection (see final test record).

## F52 — H. React package alone is evaluated as framework signal/verified without promoting JavaScript

- Original location: `tests/unit/skill-taxonomy.test.js:977:5`.
- Exact recorded exception/assertion: `error: |- Expected values to be strictly equal: + actual - expected + 'INFERRED' - 'VERIFIED' code: 'ERR_ASSERTION' name: 'AssertionError' expected: 'VERIFIED' actual: 'INFERRED' operator: 'strictEqual'`.
- Responsible implementation: src/domain/career/skill-taxonomy.js.
- Classification: Intentional security-policy change.
- Is the old expected behavior valid? No where it expects counts, declarations, unparsed text or name matches to establish independently verified competence. Useful observations and claims must remain available with accurate labels.
- Corrective action: Retain extraction/matching utility and meaningful original assertions; replace unsupported VERIFIED/MATCHED/CORROBORATED expectations with OBSERVED/INFERRED/CLAIMED/PARTIAL as appropriate. Unsupported language parsing must yield no verified reference; source details remain available through manifest observations.
- Resolution: PASS in the final broader regression selection (see final test record).

## F53 — I. React + substantial JS source files provides supporting JavaScript evidence

- Original location: `tests/unit/skill-taxonomy.test.js:992:5`.
- Exact recorded exception/assertion: `error: |- Expected values to be strictly equal: 1 !== 4 code: 'ERR_ASSERTION' name: 'AssertionError' expected: 4 actual: 1 operator: 'strictEqual'`.
- Responsible implementation: src/domain/career/skill-taxonomy.js.
- Classification: Intentional security-policy change.
- Is the old expected behavior valid? No where it expects counts, declarations, unparsed text or name matches to establish independently verified competence. Useful observations and claims must remain available with accurate labels.
- Corrective action: Retain extraction/matching utility and meaningful original assertions; replace unsupported VERIFIED/MATCHED/CORROBORATED expectations with OBSERVED/INFERRED/CLAIMED/PARTIAL as appropriate. Unsupported language parsing must yield no verified reference; source details remain available through manifest observations.
- Resolution: PASS in the final broader regression selection (see final test record).

## F54 — J. Next.js + TypeScript source provides TypeScript evidence without automatic JavaScript verification

- Original location: `tests/unit/skill-taxonomy.test.js:1017:5`.
- Exact recorded exception/assertion: `error: |- Expected values to be strictly equal: + actual - expected + 'CLAIMED' - 'VERIFIED' code: 'ERR_ASSERTION' name: 'AssertionError' expected: 'VERIFIED' actual: 'CLAIMED' operator: 'strictEqual'`.
- Responsible implementation: src/domain/career/skill-taxonomy.js.
- Classification: Intentional security-policy change.
- Is the old expected behavior valid? No where it expects counts, declarations, unparsed text or name matches to establish independently verified competence. Useful observations and claims must remain available with accurate labels.
- Corrective action: Retain extraction/matching utility and meaningful original assertions; replace unsupported VERIFIED/MATCHED/CORROBORATED expectations with OBSERVED/INFERRED/CLAIMED/PARTIAL as appropriate. Unsupported language parsing must yield no verified reference; source details remain available through manifest observations.
- Resolution: PASS in the final broader regression selection (see final test record).

## Additional failures exposed by expanded selection

**Final closure update:** the privacy fixture is now transactional/synthetic, salary locale is explicit en-US, and the original model-prose assertion passes unchanged under server rendering. Obsolete provider/adapter expectations now preserve the server narrative. Four other expanded failures were actually reproduced against pre-ISSUE-06 HEAD (89 tests/85 PASS/4 FAIL): web dashboard repository text, extension prepare-handoff500 and two obsolete P86 direct-submit contracts. See the final report for exact locations, evidence and intermediate environment failures. No unexplained new regression remains. The following bullets describe the earlier incomplete pass, not current acceptance.

- `tests/unit/p55-ai-context-privacy.test.js:444`: expects a personal production candidate to exist; actual row count is zero. Reproduced against actual pre-ISSUE-06 HEAD in `%TEMP%/issue06-prechange-privacy-baseline.log`; retained FAIL, not skipped.
- `tests/unit/p89-ai-provider-architecture.test.js:167`: expected provider-selected resume generation to return VERIFIED. Provider choice does not verify competence; expectation is now INFERRED, with nonempty content checks retained.
- New acceptance test `assistant must not return model self-attestation as verified candidate proficiency`: FAIL, not baseline. The provider's unsupported verification sentence still reaches assistant content despite citation.verified=false. This remains a local completion blocker; do not weaken this test.
- `tests/unit/p87-extension-ai-assistant.test.js:257`: salary formatting expects `160,000`, actual `1,60,000`. Reproduced unchanged against pre-ISSUE-06 HEAD (`%TEMP%/issue06-prechange-locale-baseline.log`); retained FAIL, unrelated locale assumption.
- MCP read-tool unit/integration expectations assumed skill associations imply full matches and excluded the existing WEAK grade. Assertions now retain bounded scores/schema/size checks, expect no verified competence, and allow the actual defined grade.
- Browser-assistant TypeScript fixture used a skill-name VERIFIED shortcut. It now remains an accurately labeled PARTIAL association, not a satisfied proficiency requirement.
- Cover-letter integrity/counters must be calculated after trust normalization. Provided experience is CLAIMED; metadata verifiedParagraphs is zero and integration status is PARTIAL, not PASS based on unsupported verification.
- Artifact inline citations said Verified regardless of source authority. They now say Source observation; all four export formats qualify candidate-provided/inferred content and cannot accept a legacy verified skill label as proficiency proof.

## Baseline reproduction method

Archived actual pre-ISSUE-06 HEAD into an OS-Temp checkout without modifying the worktree; reused installed dependencies and explicit test-key preload. Ran the exact named tests against the disposable PostgreSQL configuration. The personal-candidate lookup and locale mismatch reproduce without ISSUE-06 implementation. No baseline assumption was made from a test name alone. Diagnostic failures are not added twice to final unique-suite counts.
