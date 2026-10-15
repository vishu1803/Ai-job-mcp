/** Offline saved-generation dependency fixture. Uses the real source/builder/writer;
 * compilation, ownership lookup and persistence are exercised in integration tests. */
import assert from 'node:assert/strict';
import { buildGenerationProfile } from '../../src/services/resume-generation.service.js';
import { generateResumeContent } from '../../src/services/resume-generation-content.service.js';
import { ProjectRelevanceService } from '../../src/services/project-relevance.service.js';
import { normalizeJobInput } from '../../src/services/job-normalization.service.js';
import { hashStudioContent } from '../../src/services/resume-studio-draft-content.js';

export function savedGenerationFixture(view) {
  return {
    async execute(context, input) {
      const canonical = view.candidate.profileMetadata.resumeData;
      assert.equal(input.sourceResumeId, canonical.sourceResumeId);
      assert.equal(input.sourceVersion, canonical.sourceVersion);
      const profile = buildGenerationProfile({ owner: view.candidate, canonical }, view);
      const normalized = normalizeJobInput({
        title: input.jobTarget.title,
        description: input.jobTarget.rawDescription,
        requirements: input.jobTarget.requirements,
      });
      const job = {
        ...normalized,
        id: '00000000-0000-4000-8000-00000000f002',
        tenantId: context.tenantId,
        title: input.jobTarget.title,
        description: input.jobTarget.rawDescription,
        requirements: normalized.normalizedRequirements,
      };
      const projectRanking = ProjectRelevanceService.computeProjectsRelevance(
        context,
        job,
        profile.projects,
        { candidateId: profile.id, skills: profile.skills }
      );
      const ids = new Set(
        projectRanking.projectRankings
          .filter((p) => p.selectionStatus === 'SELECTED')
          .map((p) => p.projectId)
      );
      const result = await generateResumeContent({
        candidateProfile: profile,
        jobPosting: job,
        selectedProjects: profile.projects.filter((p) => ids.has(p.id)),
        selectedSkills: profile.skills,
        projectRankings: projectRanking.projectRankings,
        aiProvider: false,
        generator: {
          generateTailoredResumeLatex: () => ({ texContent: 'Offline contract fixture' }),
        },
        compiler: { compileLatexToPdf: async () => ({ pageCount: 1 }) },
      });
      return {
        id: '00000000-0000-4000-8000-00000000f001',
        sourceResumeId: input.sourceResumeId,
        sourceVersion: input.sourceVersion,
        contentHash: hashStudioContent(result.safeStructuredResume),
        bundle: {
          structuredResume: result.safeStructuredResume,
          tailoringPlan: result.safeTailoringPlan,
          evidenceValidationReceipt: result.safeEvidenceReceipt,
          metadata: { projectRanking, sourceProfileSnapshot: profile },
        },
      };
    },
  };
}
