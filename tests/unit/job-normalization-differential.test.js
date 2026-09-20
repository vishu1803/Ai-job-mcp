import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeJobInput,
  computeCanonicalJobFingerprint,
  createDeterministicRequirementId,
} from '../../src/services/job-normalization.service.js';
import {
  buildCanonicalJobRequirements,
  buildCandidateJobEvidenceGraph,
  scoreFactsForJob,
} from '../../src/services/candidate-fact-inventory.service.js';
import { PdfQaValidatorService } from '../../src/services/pdf-qa-validator.service.js';

describe('P22 Unified Job Normalization & Differential Regression Suite', () => {
  // ---------------------------------------------------------------------------
  // Part 7: Cross-Channel Parity Test Matrix (Form A == Form B == Form C)
  // ---------------------------------------------------------------------------
  describe('Cross-Channel Normalization Parity (Part 7)', () => {
    const jobFormA = {
      title: 'Senior Backend Engineer',
      requirements: ['Python', 'FastAPI', 'PostgreSQL', 'REST APIs'],
    };

    const jobFormB = {
      title: 'Senior Backend Engineer',
      description: 'Build Python FastAPI services backed by PostgreSQL and REST APIs.',
    };

    const jobFormC = {
      title: 'Senior Backend Engineer',
      description: 'Requirements:\n- Python\n- FastAPI\n- PostgreSQL\n- REST APIs',
    };

    it('produces bit-for-bit identical canonical requirements and fingerprints across Forms A, B, and C', () => {
      const canonicalA = normalizeJobInput(jobFormA);
      const canonicalB = normalizeJobInput(jobFormB);
      const canonicalC = normalizeJobInput(jobFormC);

      // 1. Fingerprint parity
      assert.equal(
        canonicalA.jobFingerprint,
        canonicalB.jobFingerprint,
        'Form A and B fingerprints must match'
      );
      assert.equal(
        canonicalB.jobFingerprint,
        canonicalC.jobFingerprint,
        'Form B and C fingerprints must match'
      );

      // 2. Exact requirement concepts
      const conceptsA = canonicalA.normalizedRequirements.map((r) => r.normalizedConcept).sort();
      const conceptsB = canonicalB.normalizedRequirements.map((r) => r.normalizedConcept).sort();
      const conceptsC = canonicalC.normalizedRequirements.map((r) => r.normalizedConcept).sort();

      assert.deepEqual(conceptsA, conceptsB);
      assert.deepEqual(conceptsB, conceptsC);
      assert.deepEqual(conceptsA, ['fastapi', 'postgresql', 'python', 'rest api']);

      // 3. Deterministic requirement IDs (req-<sha256>)
      for (const req of canonicalA.normalizedRequirements) {
        assert.match(
          req.id,
          /^req-[a-f0-9]{12}$/,
          `Requirement ID ${req.id} must be req-<sha256> format`
        );
      }

      const idsA = canonicalA.normalizedRequirements.map((r) => r.id).sort();
      const idsB = canonicalB.normalizedRequirements.map((r) => r.id).sort();
      const idsC = canonicalC.normalizedRequirements.map((r) => r.id).sort();
      assert.deepEqual(idsA, idsB);
      assert.deepEqual(idsB, idsC);

      // 4. Deterministic importance (REQUIRED for core technical skills)
      for (const req of canonicalA.normalizedRequirements) {
        assert.equal(req.importance, 'REQUIRED', `Requirement ${req.text} must be REQUIRED`);
        assert.equal(req.weight, 1.0);
      }

      // 5. Content preservation: REST APIs is NEVER dropped
      const hasRestA = canonicalA.normalizedRequirements.some(
        (r) => r.normalizedConcept === 'rest api'
      );
      const hasRestB = canonicalB.normalizedRequirements.some(
        (r) => r.normalizedConcept === 'rest api'
      );
      const hasRestC = canonicalC.normalizedRequirements.some(
        (r) => r.normalizedConcept === 'rest api'
      );

      assert.ok(hasRestA, 'Form A must preserve REST APIs');
      assert.ok(hasRestB, 'Form B must preserve REST APIs');
      assert.ok(hasRestC, 'Form C must preserve REST APIs');
    });

    it('buildCanonicalJobRequirements delegates to unified normalization engine', () => {
      const canonical = buildCanonicalJobRequirements(jobFormA);
      const direct = normalizeJobInput(jobFormA);

      assert.equal(canonical.jobFingerprint, direct.jobFingerprint);
      assert.deepEqual(canonical.normalizedRequirements, direct.normalizedRequirements);
    });
  });

  // ---------------------------------------------------------------------------
  // Part 8: Contrasting Jobs Differential Validation
  // ---------------------------------------------------------------------------
  describe('Contrasting Jobs Differential (Part 8)', () => {
    const jobA = {
      title: 'Python Backend Engineer',
      description: 'Requirements:\n- Python\n- FastAPI\n- PostgreSQL\n- REST APIs',
    };

    const jobB = {
      title: 'Systems Infrastructure Engineer',
      description: 'Requirements:\n- Rust\n- Docker\n- Distributed Systems\n- Observability',
    };

    const candidateFacts = [
      {
        factId: 'fact-python-api',
        text: 'Engineered high-throughput FastAPI REST APIs in Python with PostgreSQL storage.',
        technologies: ['Python', 'FastAPI', 'PostgreSQL'],
        confidence: 1.0,
      },
      {
        factId: 'fact-rust-infra',
        text: 'Developed low-latency distributed telemetry agent in Rust packaged with Docker.',
        technologies: ['Rust', 'Docker'],
        confidence: 0.95,
      },
    ];

    it('generates distinct fingerprints and disjoint requirements for contrasting roles', () => {
      const canonicalA = normalizeJobInput(jobA);
      const canonicalB = normalizeJobInput(jobB);

      assert.notEqual(canonicalA.jobFingerprint, canonicalB.jobFingerprint);

      const conceptsA = new Set(canonicalA.normalizedRequirements.map((r) => r.normalizedConcept));
      const conceptsB = new Set(canonicalB.normalizedRequirements.map((r) => r.normalizedConcept));

      for (const concept of conceptsA) {
        assert.ok(
          !conceptsB.has(concept),
          `Concept ${concept} should not overlap between contrasting jobs`
        );
      }
    });

    it('produces differentiated evidence graph matches and fact scoring per role', () => {
      const graphA = buildCandidateJobEvidenceGraph(candidateFacts, jobA);
      const graphB = buildCandidateJobEvidenceGraph(candidateFacts, jobB);

      // Job A matches fact-python-api, not fact-rust-infra
      const matchedFactsA = new Set(graphA.matches.map((m) => m.factId));
      assert.ok(matchedFactsA.has('fact-python-api'));
      assert.ok(!matchedFactsA.has('fact-rust-infra'));

      // Job B matches fact-rust-infra, not fact-python-api
      const matchedFactsB = new Set(graphB.matches.map((m) => m.factId));
      assert.ok(matchedFactsB.has('fact-rust-infra'));
      assert.ok(!matchedFactsB.has('fact-python-api'));

      // Fact scoring differentiation
      const scoredA = scoreFactsForJob(candidateFacts, jobA);
      const scoredB = scoreFactsForJob(candidateFacts, jobB);

      const pythonScoreA = scoredA.find((f) => f.factId === 'fact-python-api').jobRelevance;
      const rustScoreA = scoredA.find((f) => f.factId === 'fact-rust-infra').jobRelevance;
      assert.ok(pythonScoreA > rustScoreA, 'Python fact must score higher for Python job');

      const pythonScoreB = scoredB.find((f) => f.factId === 'fact-python-api').jobRelevance;
      const rustScoreB = scoredB.find((f) => f.factId === 'fact-rust-infra').jobRelevance;
      assert.ok(rustScoreB > pythonScoreB, 'Rust fact must score higher for Rust job');
    });
  });

  // ---------------------------------------------------------------------------
  // Part 11: Artifact Readiness & Line-Wrap QA Validation Invariant
  // ---------------------------------------------------------------------------
  describe('Artifact Readiness Contract & QA Traceability Gate', () => {
    it('traceability gate preserves hyphenated URLs and identifiers wrapped across LaTeX line breaks', async () => {
      // Simulated extracted PDF text where a hyphenated URL is line-broken by LaTeX
      const pdfTextWithWrappedUrl = [
        'John Candidate',
        'john@example.com',
        'SUMMARY',
        'Experienced engineer building scalable cloud systems.',
        'COMPETENCIES',
        'Python, FastAPI, PostgreSQL, REST APIs',
        'EXPERIENCE',
        'Software Engineer at Acme Corp (2022 - 2024)',
        'Built code review assistant in Python.',
        'EDUCATION',
        'BS in Computer Science',
        'PROJECTS',
        'Ai-Powered Code Review Assistant',
        'github.com/vishu1803/Ai-',
        'powered-code-review-assistant',
      ].join('\n');

      const pdfBuffer = Buffer.alloc(1024);
      pdfBuffer.write('%PDF-1.4');

      const validator = new PdfQaValidatorService({
        resumeParser: {
          extractRawText: () => pdfTextWithWrappedUrl,
        },
      });

      const audit = await validator.validatePdf({
        pdfBuffer,
        expectedCandidate: {
          name: 'John Candidate',
          email: 'john@example.com',
        },
        documentType: 'RESUME',
        expectedContent: {
          candidateName: 'John Candidate',
          email: 'john@example.com',
          projectNames: ['Ai-Powered Code Review Assistant'],
          links: ['github.com/vishu1803/Ai-powered-code-review-assistant'],
        },
      });

      // Must pass: traceability must not report missing items for line-wrapped hyphenated URL
      assert.ok(audit.traceability, 'Traceability report must be present');
      assert.equal(
        audit.traceability.missing.length,
        0,
        'Traceability must find hyphen-wrapped URL'
      );
    });

    it('deterministic requirement ID generation is consistent across calls', () => {
      const id1 = createDeterministicRequirementId({
        normalizedConcept: 'fastapi',
        requirementClass: 'TECHNOLOGY',
      });
      const id2 = createDeterministicRequirementId({
        normalizedConcept: 'fastapi',
        requirementClass: 'TECHNOLOGY',
      });
      const id3 = createDeterministicRequirementId({
        normalizedConcept: 'python',
        requirementClass: 'TECHNOLOGY',
      });

      assert.equal(id1, id2);
      assert.notEqual(id1, id3);
      assert.match(id1, /^req-[a-f0-9]{12}$/);
    });
  });
});
