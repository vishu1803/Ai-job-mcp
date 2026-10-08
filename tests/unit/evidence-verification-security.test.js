import { test } from 'node:test';
import { after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ImportScanner } from '../../src/extractors/github/code-scanners/import-scanner.js';
import { SkillRollupCalculator } from '../../src/extractors/github/skill-rollup.js';
import { EvidenceRefMapper } from '../../src/services/evidence/evidence-ref-mapper.js';
import {
  evidenceStatus,
  verifiedSourceFact,
  enforceEvidenceTrust,
  EVIDENCE_POLICY_VERSION,
  trustDatabaseEvidence,
  copyEvidenceAuthority,
} from '../../src/services/evidence/verification-policy.js';
import { SkillTaxonomyEngine } from '../../src/domain/career/skill-taxonomy.js';
import { ZeroHallucinationIntegrityService } from '../../src/services/zero-hallucination-integrity.service.js';
import { EvidenceMatchingService } from '../../src/services/evidence-matching.service.js';
import { buildStructuredResumeSnapshot } from '../../src/services/structured-resume.service.js';
import { buildCanonicalFactInventory } from '../../src/services/candidate-fact-inventory.service.js';
import { pool, closeDatabase } from '../../src/db/index.js';
import { ExtensionAssistantService } from '../../src/services/extension-assistant.service.js';
import { AiCareerAssistantService } from '../../src/services/ai-career-assistant.service.js';
import { AiResumeContentGeneratorService } from '../../src/services/ai-resume-content-generator.service.js';
import {
  EvidenceNodeSchema,
  ProjectEvidenceSchema,
} from '../../src/domain/candidate/candidate.schemas.js';
import { CoverLetterParagraphSchema } from '../../src/domain/career/cover-letter.schemas.js';
import { CareerArtifactExportService } from '../../src/services/career-artifact-export.service.js';
import { TailoredProjectBulletSchema } from '../../src/domain/career/resume.schemas.js';
import {
  CoverLetterParagraphOutputSchema,
  ResumeBulletOutputSchema,
} from '../../src/domain/mcp/career-artifact-tools.schemas.js';

after(async () => {
  await closeDatabase(pool);
});

test('legacy boolean verification and model citations cannot independently verify claims', () => {
  const claim = enforceEvidenceTrust({
    verified: true,
    status: 'VERIFIED',
    text: 'Expert in React',
  });
  assert.equal(claim.verified, false);
  assert.equal(claim.status, 'INFERRED');
  assert.equal(claim.text, 'Expert in React', 'preserve the claim without endorsing it');
});

test('assistant readiness completeness does not verify candidate qualifications', async () => {
  const assistant = new AiCareerAssistantService({ aiProvider: false });
  const result = await assistant.handleUserMessage({
    message: 'check application readiness',
    candidateProfile: {
      displayName: 'Candidate',
      skills: [{ name: 'React', provenanceStatus: 'VERIFIED' }],
    },
    readiness: { overallScore: 100, missingItems: [] },
  });
  assert.match(result.content, /not independent verification/);
  assert.ok(result.citations.every((citation) => citation.verified === false));
});

test('assistant model context does not label supplied skill names as verified proficiency', async () => {
  let prompt;
  const assistant = new AiCareerAssistantService({
    logger: {
      warn({ err }) {
        throw err;
      },
      error() {},
    },
    aiProvider: {
      async generateText(input) {
        prompt = input.prompt;
        return {
          text: JSON.stringify({
            summary: 'React is a reported skill association.',
            findings: [],
            actions: [],
          }),
        };
      },
    },
  });
  const result = await assistant.handleUserMessage({
    message: 'Summarize the skill associations in my profile',
    candidateProfile: {
      displayName: 'Candidate',
      skills: [{ name: 'React', provenanceStatus: 'VERIFIED' }],
    },
    candidateSkills: [{ name: 'React', provenanceStatus: 'VERIFIED' }],
    readiness: { overallScore: 100, missingItems: [] },
  });
  assert.match(prompt, /Reported skill associations \(not verified proficiency\): React/);
  assert.doesNotMatch(prompt, /Verified Skills:/);
  assert.ok(result.citations.every((citation) => citation.verified === false));
});

for (const format of ['MARKDOWN', 'PLAIN_TEXT', 'CANONICAL_JSON', 'JSON_RESUME']) {
  test(`historical artifact export ${format} does not endorse legacy verified skill/citation`, () => {
    const tenantId = randomUUID();
    const artifact = {
      tenantId,
      resumeId: randomUUID(),
      integrityStatus: 'PASS',
      headline: 'Candidate-provided headline',
      summary: 'Candidate claims React experience.',
      skills: [{ name: 'Frameworks', skills: [{ name: 'React', status: 'VERIFIED' }] }],
      experience: [],
      education: [],
      projects: [
        {
          name: 'Repository',
          bullets: [
            {
              text: 'Repository references React.',
              status: 'VERIFIED',
              evidenceRefs: [{ tenantId, filePath: 'src/app.js', commitSha: 'c'.repeat(40) }],
            },
          ],
        },
      ],
    };
    // Legacy prose cannot be made safe by downgrading only its badge. Preserve
    // the historical object, but require fresh server generation before export.
    assert.throws(
      () =>
        new CareerArtifactExportService().exportCareerArtifact(
          { tenantId, userId: randomUUID() },
          artifact,
          { format, citationStyle: 'INLINE', includeUnverifiedClaims: true }
        ),
      { code: 'ARTIFACT_REVALIDATION_REQUIRED' }
    );
    assert.equal(artifact.summary, 'Candidate claims React experience.');
  });
}

// Open ISSUE-06 acceptance gate: structured labels alone cannot sanitize prose.
// Regression: a badge cannot neutralize an unsupported narrative assertion.
test('assistant must not return model self-attestation as verified candidate proficiency', async () => {
  const assistant = new AiCareerAssistantService({
    aiProvider: {
      async generateText() {
        return {
          text: JSON.stringify({
            summary: 'Your React proficiency is independently verified.',
            findings: [],
            actions: [],
          }),
        };
      },
    },
  });
  const result = await assistant.handleUserMessage({
    message: 'Summarize the skill associations in my profile',
    candidateProfile: {
      displayName: 'Synthetic candidate',
      skills: [{ name: 'React', provenanceStatus: 'INFERRED' }],
    },
    readiness: { overallScore: 100, missingItems: [] },
  });
  assert.ok(result.citations.every((citation) => citation.verified === false));
  assert.doesNotMatch(
    result.content,
    /Your React proficiency is independently verified\./,
    'an unverified citation does not make an unsupported verification assertion safe'
  );
});

for (const [name, schema, input, field] of [
  [
    'project',
    ProjectEvidenceSchema,
    { id: randomUUID(), candidateId: randomUUID(), name: 'Project', slug: 'project' },
    'provenanceStatus',
  ],
  [
    'cover letter',
    CoverLetterParagraphSchema,
    {
      id: randomUUID(),
      paragraphType: 'OPENING',
      text: 'Candidate reports developing an application.',
    },
    'status',
  ],
  [
    'resume project bullet',
    TailoredProjectBulletSchema,
    { text: 'Candidate reports developing an application.' },
    'provenanceStatus',
  ],
  [
    'MCP cover letter',
    CoverLetterParagraphOutputSchema,
    {
      paragraphId: randomUUID(),
      paragraphType: 'OPENING',
      text: 'Candidate reports developing an application.',
    },
    'status',
  ],
  [
    'MCP resume bullet',
    ResumeBulletOutputSchema,
    { bulletId: randomUUID(), text: 'Candidate reports developing an application.' },
    'status',
  ],
])
  test(`${name} schema does not default omitted trust to VERIFIED`, () => {
    assert.equal(schema.parse(input)[field], 'CLAIMED');
  });

test('strict evidence node contract retains scoped verification metadata', () => {
  const source = proofFixture();
  const row = copyEvidenceAuthority(source, {
    ...source,
    detectedAt: new Date(),
    createdAt: new Date(),
  });
  const result = EvidenceNodeSchema.parse(EvidenceRefMapper.toEvidenceNode(row));
  assert.equal(result.verificationStatus, 'VERIFIED');
  // Shape validation is not server-side source verification.
  assert.equal(verifiedSourceFact(result), false);
  assert.equal(enforceEvidenceTrust(result).verificationStatus, 'OBSERVED');
});

test('direct AI resume summary cannot self-verify supplied facts', async () => {
  const generator = new AiResumeContentGeneratorService({ aiProvider: false });
  const result = await generator.generateJobConditionedSummary({
    candidateProfile: {
      id: randomUUID(),
      skills: [{ name: 'React', provenanceStatus: 'CLAIMED' }],
    },
    targetJobPosting: { title: 'Frontend Engineer', description: 'Develop React applications.' },
    factInventory: [
      {
        factId: 'self-report',
        text: 'Candidate reports developing a React dashboard.',
        candidateAuthored: true,
        provenanceStatus: 'CLAIMED',
      },
    ],
  });
  assert.ok(!['VERIFIED', 'CORROBORATED'].includes(result.provenanceStatus));
  assert.match(result.text, /Candidate-provided claims \(not independently verified\)/);
  assert.doesNotMatch(
    result.text,
    /Architected production|Demonstrated delivery|daily practice|expertise in/
  );
  assert.ok(
    result.sentences.every((s) => !['VERIFIED', 'CORROBORATED'].includes(s.provenanceStatus))
  );
});

test('direct AI resume project bullets cannot self-verify supplied facts', async () => {
  const generator = new AiResumeContentGeneratorService({ aiProvider: false });
  const result = await generator.generateJobConditionedProjectBullets({
    project: { id: randomUUID(), name: 'Dashboard', technologies: ['React'] },
    candidateProfile: { id: randomUUID() },
    targetJobPosting: { title: 'Frontend Engineer', description: 'Develop React applications.' },
    projectFacts: [
      'Implemented dashboard navigation using React components for application users.',
      'Developed form validation using application state for user input handling.',
      'Added application tests covering dashboard navigation and form validation.',
    ],
  });
  // The existing generator may deduplicate bullets; this regression checks trust,
  // not its separate minimum-bullet-count contract.
  assert.ok(result.length > 0);
  assert.ok(
    result.every((b) => !['VERIFIED', 'CORROBORATED'].includes(b.provenanceStatus || b.provenance))
  );
});

test('browser assistant cannot verify arbitrary profile skill names', () => {
  const result = new ExtensionAssistantService().compareRequirements({
    job: { requirements: ['React'] },
    candidateProfile: { skills: [{ name: 'React', provenanceStatus: 'CLAIMED' }] },
  });
  assert.equal(result.satisfiedCount, 0);
  assert.notEqual(result.matches[0].status, 'VERIFIED');
});
test('career assistant cannot verify client/model-provided skill names', () => {
  const result = new AiCareerAssistantService().explainJobRequirements({
    job: { requirements: ['React'] },
    candidateProfile: { verifiedSkills: ['React'] },
  });
  assert.equal(result.verifiedMatches.length, 0);
});

export function proofFixture() {
  const tenantId = randomUUID(),
    candidateId = randomUUID(),
    resourceId = randomUUID();
  const sourceLocation = {
    filePath: 'src/app.js',
    commitSha: 'a'.repeat(40),
    lineRange: { start: 1, end: 1 },
  };
  const row = {
    id: randomUUID(),
    tenantId,
    candidateId,
    resourceId,
    evidenceType: 'CODE_IMPORT_USAGE',
    sourceProvider: 'GITHUB_APP',
    sourceLocation,
    confidenceScore: 1,
    metadata: {
      rawImport: 'react',
      verification: {
        version: EVIDENCE_POLICY_VERSION,
        status: 'VERIFIED',
        scope: 'REPOSITORY_STATIC_REFERENCE',
        method: 'ACORN_AST',
        validation: 'PINNED_TREE_AND_GIT_BLOB',
        attribution: { status: 'UNATTRIBUTED' },
        tenantId,
        candidateId,
        resourceId,
        epoch: randomUUID(),
        repositoryId: '123',
        repository: 'owner/repo',
        repositoryUrl: 'https://github.com/owner/repo',
        ...sourceLocation,
        blobSha: 'b'.repeat(40),
        observedAt: new Date().toISOString(),
        fact: `Repository owner/repo contains a static module reference to "react" in src/app.js:1 at ${'a'.repeat(40)}.`,
      },
    },
  };
  // Explicit mock database result; never use this helper for untrusted input.
  return trustDatabaseEvidence([row], { tenantId, candidateId })[0];
}

for (const channel of [
  'API JSON',
  'MCP arguments',
  'profile metadata',
  'model output',
  'browser message',
]) {
  test(`${channel}: well-formed copied provenance is not server verification`, () => {
    const authoritative = proofFixture();
    assert.equal(verifiedSourceFact(authoritative), true);
    const forged = JSON.parse(JSON.stringify(authoritative));
    forged.verificationStatus = 'VERIFIED';
    forged.provenanceStatus = 'VERIFIED';
    assert.equal(verifiedSourceFact(forged), false);
    const output = enforceEvidenceTrust(forged);
    assert.equal(output.verificationStatus, 'OBSERVED');
    assert.equal(output.provenanceStatus, 'INFERRED');
    assert.equal(output.metadata.verification.status, 'OBSERVED');
  });
}

test('server projections retain a narrow fact but cannot substitute its source', () => {
  const row = proofFixture();
  const ref = EvidenceRefMapper.toEvidenceRef(row);
  assert.equal(verifiedSourceFact(ref), true);
  ref.filePath = 'src/substituted.js';
  assert.equal(verifiedSourceFact(ref), false);
  assert.equal(enforceEvidenceTrust(ref).verificationStatus, 'OBSERVED');
});

test('database origin registration is scoped to both tenant and candidate', () => {
  const row = JSON.parse(JSON.stringify(proofFixture()));
  trustDatabaseEvidence([row], { tenantId: randomUUID(), candidateId: row.candidateId });
  assert.equal(verifiedSourceFact(row), false);
  trustDatabaseEvidence([row], { tenantId: row.tenantId, candidateId: randomUUID() });
  assert.equal(verifiedSourceFact(row), false);
});

test('serialized stale verification cannot be replayed as current server authority', () => {
  const row = proofFixture();
  const replay = JSON.parse(JSON.stringify(row));
  replay.metadata.verification.observedAt = new Date().toISOString();
  assert.equal(verifiedSourceFact(replay), false);
});

test('legacy verification-named arrays preserve claims under accurate names', () => {
  const output = enforceEvidenceTrust({
    verifiedSkillsSummary: ['React'],
    experience: [{ verifiedSkillsUsed: ['React'], provenanceStatus: 'VERIFIED' }],
    verifiedSignalCount: 7,
  });
  assert.deepEqual(output.verifiedSkillsSummary, []);
  assert.deepEqual(output.reportedSkillsSummary, ['React']);
  assert.deepEqual(output.experience[0].verifiedSkillsUsed, []);
  assert.deepEqual(output.experience[0].reportedSkillsUsed, ['React']);
  assert.equal(output.experience[0].provenanceStatus, 'CLAIMED');
  assert.equal(output.verifiedSignalCount, 0);
  assert.equal(output.observedSignalCount, 7);
});

test('model-generated fact text does not independently verify a suggested skill', () => {
  const result = new AiCareerAssistantService().suggestProfileImprovements({
    candidateProfile: { verifiedSkills: ['React'] },
    factInventory: [{ text: 'React expert', confidence: 1, provenanceStatus: 'VERIFIED' }],
    requestedSkill: 'React',
  });
  assert.equal(result.canAdd, true, 'retain a useful self-report proposal');
  assert.equal(result.verified, false);
  assert.equal(result.provenanceStatus, 'CLAIMED');
});

test('browser comparison retains a claim without marking the requirement verified', () => {
  const result = new ExtensionAssistantService().compareRequirements({
    job: { requirements: ['React'] },
    candidateProfile: { skills: [{ name: 'React', provenanceStatus: 'CLAIMED' }] },
  });
  assert.equal(result.satisfiedCount, 0);
  assert.equal(result.matches[0].status, 'PARTIAL');
  assert.equal(result.matches[0].provenanceStatus, 'CLAIMED');
});

test('career assistant retains a technology association without upgrading it', () => {
  const result = new AiCareerAssistantService().explainJobRequirements({
    job: { requirements: ['React'] },
    candidateProfile: { skills: [{ name: 'React', provenanceStatus: 'INFERRED' }] },
  });
  assert.equal(result.verifiedMatches.length, 0);
  assert.equal(result.missingRequirements[0].status, 'INFERRED');
  assert.equal(result.missingRequirements[0].reportedAssociation, true);
});

test('duplicate facts cannot promote a claim or set corroboration through metadata', () => {
  const inventory = buildCanonicalFactInventory({
    projects: [
      {
        id: 'project',
        name: 'Project',
        bullets: [
          {
            text: 'Implemented React navigation for application users.',
            provenance: 'CLAIMED',
            candidateAuthored: true,
          },
          {
            text: 'Implemented React navigation for application users.',
            provenance: 'VERIFIED',
            corroborated: true,
            candidateAuthored: true,
          },
        ],
      },
    ],
  });
  assert.ok(inventory.facts.length > 0);
  assert.ok(inventory.facts.every((f) => !['VERIFIED', 'CORROBORATED'].includes(f.provenance)));
  assert.ok(inventory.facts.every((f) => f.corroborated === false));
});

for (const [name, content, path = 'src/app.js'] of [
  ['block-comment import', "/*\nimport React from 'react';\n*/"],
  ['line-comment import', "// import React from 'react';"],
  ['block-comment require', "/* const React = require('react'); */"],
  ['line-comment require', "// const React = require('react');"],
  ['ordinary string', 'const text = "import React from \'react\';";'],
  ['template literal', 'const text = `import React from "react";`;'],
  ['README code block', "```js\nimport React from 'react';\n```", 'README.md'],
  ['documentation file', "import React from 'react';", 'docs/app.js'],
  ['generated directory', "import React from 'react';", 'generated/app.js'],
  ['generated header', "// @generated\nimport React from 'react';"],
  ['test fixture', "import React from 'react';", 'test/fixtures/app.js'],
  ['test-only file', "import React from 'react';", 'src/app.test.js'],
  ['lockfile', "import React from 'react';", 'package-lock.json'],
  ['dynamic reference', "const name='react'; import(name);"],
  ['shadowed require', "function f(require) { return require('react'); }"],
  ['unsupported TypeScript', "import React from 'react'; const n: number=1;", 'src/app.ts'],
  ['Python docstring', '"""\nimport django\n"""', 'app.py'],
  ['Go comment', '// import "github.com/gin-gonic/gin"', 'main.go'],
  ['Rust comment', '/* use serde::Serialize; */', 'main.rs'],
  ['malformed source', "import React from 'react'; {{{"],
  ['bounded input', "import React from 'react';\n".repeat(1001)],
])
  test(`parser rejects ${name}`, () =>
    assert.deepEqual(ImportScanner.scanImports(content, path), []));

for (const [name, content, count] of [
  ['executable ESM declaration', "import React from 'react';", 1],
  ['multiline import', "import {\n useState\n} from 'react';", 1],
  ['re-export', "export { createRoot } from 'react-dom/client';", 1],
  ['escaped module specifier', "import React from '\\u0072eact';", 1],
  ['relative/internal imports excluded', "import x from './x.js'; import fs from 'node:fs';", 0],
])
  test(`parser supports ${name}`, () => {
    const refs = ImportScanner.scanImports(content, 'src/app.js');
    assert.equal(refs.length, count);
    if (count) {
      assert.equal(refs[0].extractionMethod, 'ACORN_AST');
      assert.equal(refs[0].lineRange.start, 1);
    }
  });

test('valid narrow verified repository fact remains usable, without candidate attribution', () => {
  const item = proofFixture();
  assert.equal(verifiedSourceFact(item), true);
  assert.equal(evidenceStatus(item), 'VERIFIED');
  assert.equal(EvidenceRefMapper.toEvidenceNode(item).verificationStatus, 'VERIFIED');
  assert.equal(SkillRollupCalculator.calculateRollup([item]).provenanceStatus, 'INFERRED');
  const guarded = enforceEvidenceTrust(EvidenceRefMapper.toEvidenceNode(item));
  assert.equal(guarded.metadata.verification.status, 'VERIFIED');
  assert.equal(verifiedSourceFact(guarded), true);
});
for (const [name, mutate] of [
  [
    'no proof',
    (x) => {
      x.metadata = {};
    },
  ],
  [
    'LLM self-verification',
    (x) => {
      x.metadata.verification.method = 'LLM';
    },
  ],
  [
    'source mismatch',
    (x) => {
      x.sourceLocation.filePath = 'src/other.js';
    },
  ],
  [
    'mutable HEAD',
    (x) => {
      x.sourceLocation.commitSha = 'HEAD';
    },
  ],
  [
    'missing commit',
    (x) => {
      delete x.sourceLocation.commitSha;
    },
  ],
  [
    'missing blob integrity',
    (x) => {
      delete x.metadata.verification.blobSha;
    },
  ],
  [
    'foreign tenant',
    (x) => {
      x.tenantId = randomUUID();
    },
  ],
  [
    'foreign candidate',
    (x) => {
      x.candidateId = randomUUID();
    },
  ],
  [
    'foreign resource',
    (x) => {
      x.resourceId = randomUUID();
    },
  ],
  [
    'invalidated source',
    (x) => {
      x.metadata.verification.status = 'INVALID';
    },
  ],
  [
    'stale observation',
    (x) => {
      x.metadata.verification.observedAt = '2000-01-01T00:00:00Z';
    },
  ],
  [
    'future observation',
    (x) => {
      x.metadata.verification.observedAt = '2100-01-01T00:00:00Z';
    },
  ],
  [
    'fabricated attribution',
    (x) => {
      x.metadata.verification.attribution.status = 'OWNER';
    },
  ],
  [
    'manifest alone',
    (x) => {
      x.evidenceType = 'PACKAGE_MANIFEST_DEPENDENCY';
    },
  ],
  [
    'missing lines',
    (x) => {
      delete x.sourceLocation.lineRange;
    },
  ],
  [
    'malformed repository ID',
    (x) => {
      x.metadata.verification.repositoryId = 'owner/repo';
    },
  ],
])
  test(`verification fails closed: ${name}`, () => {
    const item = proofFixture();
    mutate(item);
    assert.equal(verifiedSourceFact(item), false);
  });

for (const confidenceScore of [0, 0.75, 0.99, 1])
  test(`confidence ${confidenceScore} cannot verify candidate competence`, () => {
    const evidence = { evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY', confidenceScore };
    assert.notEqual(SkillRollupCalculator.calculateRollup([evidence]).provenanceStatus, 'VERIFIED');
    for (const slug of ['react', 'javascript', 'python']) {
      const result = SkillTaxonomyEngine.evaluateEvidenceStrength({
        slug,
        evidenceCount: 50,
        confidenceScore,
        hasGithubEvidence: true,
      });
      assert.equal(result.truthStatus, 'INFERRED');
      assert.equal(
        SkillTaxonomyEngine.evaluateEvidenceStrength({
          slug,
          evidenceCount: 50,
          hasResumeClaim: true,
        }).truthStatus,
        'CLAIMED'
      );
    }
  });

test('output aggregation cannot promote skill, project, resume or MCP prose', () => {
  const raw = {
    skills: [{ provenanceStatus: 'VERIFIED', confidenceScore: 1 }],
    projects: [{ truthStatus: 'CORROBORATED', evidenceCount: 50 }],
    summary: { status: 'VERIFIED', text: 'Expert developer' },
    claim: { status: 'VERIFIED', isUserClaim: true },
  };
  const guarded = enforceEvidenceTrust(raw);
  assert.equal(guarded.skills[0].provenanceStatus, 'INFERRED');
  assert.equal(guarded.projects[0].truthStatus, 'INFERRED');
  assert.equal(guarded.summary.status, 'INFERRED');
  assert.equal(guarded.claim.status, 'CLAIMED');
  assert.equal(raw.skills[0].provenanceStatus, 'VERIFIED'); // no mutation
});

for (const [name, statement, initialStatus, expected] of [
  ['precise source fact', null, 'VERIFIED', 'VERIFIED'],
  ['unsupported proficiency', 'Expert React developer', 'VERIFIED', 'MISSING_EVIDENCE'],
  [
    'model-generated accomplishment',
    'Implemented a scalable React platform',
    'VERIFIED',
    'MISSING_EVIDENCE',
  ],
  ['CLAIMED remains CLAIMED', null, 'CLAIMED', 'CLAIMED'],
])
  test(`integrity gate: ${name}`, () => {
    const e = proofFixture();
    const gate = new ZeroHallucinationIntegrityService();
    const assertion = {
      assertionId: randomUUID(),
      tenantId: e.tenantId,
      candidateId: e.candidateId,
      assertionType: 'PROJECT',
      statement: statement || e.metadata.verification.fact,
      status: initialStatus,
      confidenceScore: 1,
      evidenceRefs: [
        {
          id: e.id,
          resourceId: e.resourceId,
          filePath: e.sourceLocation.filePath,
          commitSha: e.sourceLocation.commitSha,
          resourceName: 'owner/repo',
          evidenceType: e.evidenceType,
        },
      ],
    };
    assert.equal(
      gate.validateAssertion({ tenantId: e.tenantId }, assertion, new Map([[e.id, e]])).status,
      expected
    );
  });

for (const provenanceStatus of ['VERIFIED', 'CORROBORATED', 'CLAIMED', 'INFERRED'])
  test(`actual matching cannot verify competence from ${provenanceStatus} and a manifest`, () => {
    const e = proofFixture();
    const skill = {
      name: 'React',
      slug: 'react',
      provenanceStatus,
      confidenceScore: 1,
      evidenceItems: [
        { ...e, filePath: 'package.json', evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY' },
      ],
    };
    const req = {
      id: randomUUID(),
      category: 'SKILL',
      importance: 'REQUIRED',
      confidenceScore: 1,
      extractedValue: 'React',
      weight: 1,
    };
    const { match } = EvidenceMatchingService._evaluateExactSkillMatch(
      req,
      'react',
      'React',
      skill,
      new Map()
    );
    assert.notEqual(match.matchStatus, 'MATCHED');
    assert.notEqual(match.candidateProvenance, 'VERIFIED');
    if (provenanceStatus === 'CLAIMED') assert.equal(match.isUserClaim, true);
  });
test('actual canonical fact inventory cannot verify model-generated or README prose', () => {
  const inventory = buildCanonicalFactInventory({
    projects: [
      {
        id: randomUUID(),
        name: 'Repository',
        provenanceStatus: 'VERIFIED',
        description: 'A React repository for example applications.',
        features: ['A scalable React application serving users.'],
        bullets: [
          { text: 'Candidate reports implementing the dashboard.', provenanceStatus: 'VERIFIED' },
        ],
      },
    ],
  });
  assert.ok(inventory.facts.length > 0);
  assert.ok(
    inventory.facts.every((f) => !['VERIFIED', 'CORROBORATED'].includes(f.provenanceStatus))
  );
  assert.ok(inventory.facts.filter((f) => !f.candidateAuthored).every((f) => !f.renderable));
});
test('actual resume snapshot and final recomposition retain conservative trust labels', () => {
  const candidate = {
    id: randomUUID(),
    tenantId: randomUUID(),
    displayName: 'Candidate',
    email: 'candidate@example.test',
    skills: [
      {
        id: randomUUID(),
        name: 'React',
        slug: 'react',
        category: 'FRAMEWORK',
        provenanceStatus: 'VERIFIED',
        confidenceScore: 1,
      },
    ],
    projects: [],
    experience: [],
    education: [],
  };
  const result = buildStructuredResumeSnapshot({ candidateProfile: candidate });
  const visit = (value) => {
    if (!value || typeof value !== 'object') return;
    for (const [key, val] of Object.entries(value)) {
      if (['provenanceStatus', 'truthStatus', 'truthCategory', 'sourceType'].includes(key))
        assert.ok(!['VERIFIED', 'CORROBORATED'].includes(val));
      visit(val);
    }
  };
  visit(result.structuredResume);
  assert.equal(result.evidenceValidationReceipt.summary.verifiedClaimsCount, 0);
});
