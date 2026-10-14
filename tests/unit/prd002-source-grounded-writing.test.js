import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { composeSourceGroundedSummary } from '../../src/services/source-grounded-summary.service.js';
import { AiResumeContentGeneratorService } from '../../src/services/ai-resume-content-generator.service.js';
import {
  resumeQualityProfiles,
  resumeQualityProfileByKey,
} from '../fixtures/prd002-resume-profiles.js';

const candidate = { id: 'candidate-a', tenantId: 'tenant-a' };
const fact = (factId, text, changes = {}) => ({
  factId,
  text,
  candidateId: candidate.id,
  tenantId: candidate.tenantId,
  candidateAuthored: true,
  renderable: true,
  ownerType: 'EXPERIENCE',
  provenanceStatus: 'USER_PROVIDED',
  ...changes,
});
const compose = (facts, changes = {}) =>
  composeSourceGroundedSummary({ candidateProfile: candidate, factInventory: facts, ...changes });

describe('PRD-002 source-grounded writing authority', () => {
  it('covers all ten named synthetic personas without private candidate records', () => {
    assert.equal(resumeQualityProfiles.length, 10);
    assert.equal(new Set(resumeQualityProfiles.map((p) => p.key)).size, 10);
    for (const entry of resumeQualityProfiles) {
      assert.ok(entry.profile.canonicalEmail.endsWith('@example.test'));
      assert.ok(entry.profile.id);
    }
    assert.equal(resumeQualityProfileByKey['long-history'].profile.experience.length, 15);
  });

  it('leaves empty candidate summaries empty instead of fabricating a role or generic filler', () => {
    const result = composeSourceGroundedSummary({
      candidateProfile: resumeQualityProfileByKey.empty.profile,
      jobPosting: {
        title: 'Senior Kubernetes Engineer',
        description: 'Lead engineering and optimize cloud costs.',
      },
    });
    assert.equal(result.text, '');
    assert.deepEqual(result.composedFromFactIds, []);
    assert.equal(result.writingMethod, 'SOURCE_GROUNDED_DETERMINISTIC');
  });

  it('retains legitimate user-authored claims without external corroboration', () => {
    const result = compose([fact('claim-1', 'Implemented book search endpoints in Node.js.')]);
    assert.equal(result.text, 'Implemented book search endpoints in Node.js.');
    assert.equal(result.sentences[0].provenanceStatus, 'USER_PROVIDED');
    assert.deepEqual(result.composedFromFactIds, ['claim-1']);
    assert.ok(!/unverified|no technology|proficiency/i.test(result.text));
  });

  it('job tailoring selects existing facts and cannot add a required qualification', () => {
    const facts = [
      fact('a', 'Documented supplier workflows and maintained order records.'),
      fact('b', 'Implemented PostgreSQL migrations for lending records.'),
    ];
    const result = compose(facts, {
      jobPosting: {
        title: 'Backend Developer',
        description: 'PostgreSQL migrations and Kubernetes leadership required.',
      },
    });
    assert.equal(result.composedFromFactIds[0], 'b');
    assert.ok(!/Kubernetes|leadership|Backend Developer/.test(result.text));
    for (const sentence of result.sentences) {
      assert.ok(facts.some((source) => source.text === sentence.sourceFact));
    }
  });

  it('excludes missing and unknown evidence rather than relabeling unsupported facts', () => {
    const result = compose([
      fact('missing', 'Implemented Kubernetes cluster administration.', {
        provenanceStatus: 'MISSING_EVIDENCE',
      }),
      fact('unknown', 'Led production infrastructure migrations.', { truthCategory: 'UNKNOWN' }),
      fact('valid', 'Documented API authentication error responses.'),
    ]);
    assert.deepEqual(result.composedFromFactIds, ['valid']);
    assert.ok(!/Kubernetes|Led production/.test(result.text));
  });

  it('does not turn repository observations into candidate authorship', () => {
    const result = compose([
      fact('repository', 'Repository contains PostgreSQL database migrations.', {
        candidateAuthored: false,
        ownerType: 'PROJECT',
        ownerId: 'project-a',
        provenanceStatus: 'OBSERVED',
      }),
      fact('agency', 'Implemented PostgreSQL database migrations.', {
        candidateAuthored: false,
        provenanceStatus: 'OBSERVED',
      }),
    ]);
    assert.equal(result.text, 'Repository contains PostgreSQL database migrations.');
    assert.equal(result.provenanceStatus, 'INFERRED');
    assert.deepEqual(result.composedFromFactIds, ['repository']);
  });

  it('retains the fresher education/project story without inventing employment or metrics', () => {
    const source = resumeQualityProfileByKey.fresher;
    const result = composeSourceGroundedSummary({
      candidateProfile: source.profile,
      jobPosting: source.jobPosting,
    });
    assert.ok(result.text.length > 0);
    assert.ok(
      !/senior|led a team|years of experience|\d+%|Synthetic Software Company/i.test(result.text)
    );
    assert.equal(result.text, source.profile.summary);
    assert.equal(result.sourceFact, source.profile.summary);
  });

  it('preserves career-changer source responsibilities without converting them into software employment', () => {
    const result = compose(
      [fact('operations', 'Documented supplier workflows and maintained order records.')],
      { jobPosting: { title: 'Software Engineer', description: 'Build PostgreSQL APIs.' } }
    );
    assert.equal(result.text, 'Documented supplier workflows and maintained order records.');
    assert.ok(!/Software Engineer|PostgreSQL|API/.test(result.text));
  });

  it('avoids duplicate summary sentences and technology inventories', () => {
    const result = compose([
      fact('a', 'Implemented API authentication validation.'),
      fact('b', 'Implemented API authentication validation.'),
      fact('technology', 'JavaScript, React, Docker, Kubernetes, PostgreSQL', {
        factType: 'TECHNOLOGY',
      }),
    ]);
    assert.equal(result.sentences.length, 1);
    assert.equal(result.text, 'Implemented API authentication validation.');
  });

  it('only includes facts from selected project identities', () => {
    const result = compose(
      [
        fact('a', 'Created an accessible event registration form.', {
          ownerType: 'PROJECT',
          ownerId: 'project-a',
        }),
        fact('b', 'Implemented book lending checkout validation.', {
          ownerType: 'PROJECT',
          ownerId: 'project-b',
        }),
      ],
      { selectedProjects: [{ id: 'project-b' }] }
    );
    assert.deepEqual(result.composedFromFactIds, ['b']);
  });

  it('rejects foreign ownership facts and unrenderable claims', () => {
    const result = compose([
      fact('candidate', 'Created accessible event registration forms.', { candidateId: 'foreign' }),
      fact('tenant', 'Documented authenticated API request handling.', { tenantId: 'foreign' }),
      fact('blocked', 'Maintained API deployment procedures.', { renderable: false }),
    ]);
    assert.equal(result.text, '');
  });

  it('summary is deterministic under source ordering and does not mutate source data', () => {
    const facts = [
      fact('b', 'Documented API authentication error responses.'),
      fact('a', 'Implemented book search and lending endpoints.'),
    ];
    const snapshot = structuredClone(facts);
    assert.deepEqual(compose(facts), compose([...facts].reverse()));
    assert.deepEqual(facts, snapshot);
  });

  it('advisory provider prose cannot become accepted resume content', async () => {
    const service = new AiResumeContentGeneratorService({
      aiProvider: {
        generateStructured: async () => ({
          text: 'Senior engineer at Fabricated Corp with 12 years of experience and 95% improvement.',
          summary: 'Invented MBA and cloud certification.',
        }),
      },
    });
    const result = await service.generateResumeAiContent({
      candidateProfile: candidate,
      targetJobPosting: { title: 'Backend Developer' },
      factInventory: [fact('a', 'Implemented API authentication validation.')],
    });
    assert.equal(result.summary.text, 'Implemented API authentication validation.');
    assert.ok(!/Fabricated|12 years|95%|MBA|certification/.test(result.summary.text));
    assert.equal(result.writing.method, 'SOURCE_GROUNDED_DETERMINISTIC');
    assert.equal(result.writing.providerUsed, false);
  });

  it('explicit provider opt-out is identified as factual fallback, not AI-tailored prose', async () => {
    const result = await new AiResumeContentGeneratorService({
      aiProvider: false,
    }).generateResumeAiContent({
      candidateProfile: candidate,
      factInventory: [fact('a', 'Implemented API authentication validation.')],
    });
    assert.equal(result.writing.providerStatus, 'UNAVAILABLE');
    assert.equal(result.writing.providerUsed, false);
    assert.equal(result.writing.method, 'SOURCE_GROUNDED_DETERMINISTIC');
  });
  it('provider failure is labelled explicitly while accepted source wording remains factual', async () => {
    const result = await new AiResumeContentGeneratorService({
      aiProvider: {
        generateStructured: async () => {
          throw new Error('provider unavailable');
        },
      },
    }).generateResumeAiContent({
      candidateProfile: candidate,
      factInventory: [fact('a', 'Implemented API authentication validation.')],
    });
    assert.equal(result.writing.providerStatus, 'FAILED');
    assert.equal(result.writing.providerUsed, false);
    assert.equal(result.summary.text, 'Implemented API authentication validation.');
  });
});
