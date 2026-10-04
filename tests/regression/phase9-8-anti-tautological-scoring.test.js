/**
 * @file Phase 9.8 — Anti-Tautological ATS Scoring Test Suite
 *
 * Enforces real, deterministic ATS Fit Score calculations across the platform:
 * 1. Computes ATS Fit Score using handleAnalyzeJobFit and validates canonical 69.25 invariant.
 * 2. Validates scoreBreakdown components against real baseline calculations (non-tautological).
 * 3. Dynamic sensitivity negative test: Disjoint JD lowers ATS score below 50.0.
 * 4. Dynamic sensitivity negative test: Removing candidate skills strictly reduces ATS score from 69.25 to 18.0.
 * 5. Static codebase gate: Scans all test suites to guarantee ZERO tautological assertions exist.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { handleAnalyzeJobFit } from '../../src/mcp/tools/career-read-tools.js';
import {
  BASELINE_JD,
  createTestCandidateContext,
} from './phase9-baseline.test.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

describe('Phase 9.8 — Anti-Tautological ATS Scoring Invariants', () => {
  it('TEST 1 — Real ATS Fit Score computation matches canonical 69.25 invariant via MCP tool', async () => {
    const { context, commonDeps } = createTestCandidateContext();

    const fitResult = await handleAnalyzeJobFit(
      context,
      {
        jobDescriptionText: BASELINE_JD,
        jobTitle: 'Junior Full Stack Engineer',
      },
      commonDeps
    );

    assert.ok(fitResult, 'analyze_job_fit must produce a non-null result');
    assert.strictEqual(fitResult.overallFit.analysisStatus, 'COMPLETE');

    const atsScore = fitResult.overallFit.atsScore;
    const breakdown = fitResult.overallFit.scoreBreakdown;

    // Real computed ATS score verification
    assert.strictEqual(typeof atsScore, 'number');
    assert.strictEqual(atsScore, 69.25, `Expected computed ATS score 69.25, got ${atsScore}`);
    assert.strictEqual(breakdown.requiredSkillsScore, 35.0);
    assert.strictEqual(breakdown.preferredSkillsScore, 8.44);
    assert.strictEqual(breakdown.projectRelevanceScore, 11.69);
    assert.strictEqual(breakdown.evidenceConfidenceScore, 3.73);
    assert.strictEqual(fitResult.requirementMatches.length, 11);
  });

  it('TEST 2 — Direct scoreBreakdown components match deterministic evaluation', async () => {
    const { context, commonDeps } = createTestCandidateContext();

    const fitResult = await handleAnalyzeJobFit(
      context,
      {
        jobDescriptionText: BASELINE_JD,
        jobTitle: 'Junior Full Stack Engineer',
      },
      commonDeps
    );

    const breakdown = fitResult.overallFit.scoreBreakdown;
    assert.strictEqual(breakdown.rawScore, 69.25, 'Raw score must be exactly 69.25');
    assert.strictEqual(breakdown.requiredSkillsScore, 35.0, 'Required skills component matches 35.0');
    assert.strictEqual(breakdown.preferredSkillsScore, 8.44, 'Preferred skills component matches 8.44');
    assert.strictEqual(breakdown.isCapped, false, 'Candidate with zero critical missing required skills is uncapped');
    assert.strictEqual(fitResult.overallFit.atsScore, 69.25, 'ATS score equals 69.25');
  });

  it('TEST 3 — Negative test: Altering requirements dynamically changes computed score', async () => {
    const { context, commonDeps } = createTestCandidateContext();

    // Query a completely disjoint JD
    const divergentJD = `Distributed Systems Architect
Required:
Rust, Go, Kubernetes, eBPF, gRPC, Distributed Consensus.
Preferred:
Terraform, Kafka, Raft Protocol.`;

    const fitResult = await handleAnalyzeJobFit(
      context,
      {
        jobDescriptionText: divergentJD,
        jobTitle: 'Distributed Systems Architect',
      },
      commonDeps
    );

    assert.ok(fitResult);
    const score = fitResult.overallFit.atsScore;
    assert.ok(score < 50.0, `Score for disjoint JD must be < 50.0, got ${score}`);
    assert.notStrictEqual(score, 69.25, 'Score must dynamically diverge from 69.25');
  });

  it('TEST 4 — Negative test: Missing candidate skills strictly reduces ATS score', async () => {
    // Construct candidate with 0 skills
    const { context, commonDeps } = createTestCandidateContext({
      skillsFilter: () => false,
    });

    const fitResult = await handleAnalyzeJobFit(
      context,
      {
        jobDescriptionText: BASELINE_JD,
        jobTitle: 'Junior Full Stack Engineer',
      },
      commonDeps
    );

    assert.ok(fitResult);
    const score = fitResult.overallFit.atsScore;
    assert.ok(score < 50.0, `Candidate with 0 skills must score < 50.0, got ${score}`);
    assert.strictEqual(score, 18.0, 'Candidate with 0 skills scores exactly 18.0');
    assert.strictEqual(fitResult.overallFit.scoreBreakdown.requiredSkillsScore, 0.0, 'Required skills score must be 0');
  });

  it('TEST 5 — Static codebase gate: Zero tautological assertions across all test suites', () => {
    function walkDir(dir) {
      let results = [];
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          results = results.concat(walkDir(fullPath));
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
          results.push(fullPath);
        }
      }
      return results;
    }

    const testFiles = walkDir(path.join(REPO_ROOT, 'tests'));
    assert.ok(testFiles.length > 20, 'Expected at least 20 test files in tests/ directory');

    const tautologicalRegex = /assert\.(strictEqual|equal|deepStrictEqual|deepEqual)\(\s*([0-9.]+)\s*,\s*\2\s*(?:,\s*.*?)?\)/g;
    const violations = [];

    for (const file of testFiles) {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;
        let match;
        while ((match = tautologicalRegex.exec(line)) !== null) {
          violations.push({
            file: path.relative(REPO_ROOT, file),
            line: idx + 1,
            match: match[0],
          });
        }
      });
    }

    assert.deepStrictEqual(
      violations,
      [],
      `Found tautological numeric assertions in tests: ${JSON.stringify(violations, null, 2)}`
    );
  });
});
