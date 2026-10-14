import { and, eq } from 'drizzle-orm';
import { db as defaultDb } from '../db/index.js';
import { candidates } from '../db/schema.js';
import { CandidateProfileService } from './candidate-profile.service.js';
import { JobDescriptionParser } from '../domain/career/job-parser.js';
import { EvidenceMatchingService } from './evidence-matching.service.js';
import { ProjectRelevanceService } from './project-relevance.service.js';
import { AtsFitScoreService } from './ats-fit-score.service.js';
import { ResumeKeywordCoverageService } from './resume-keyword-coverage.service.js';
import { evaluateResumeWritingQuality } from './resume-writing-quality.service.js';
import { buildCanonicalFactInventory } from './candidate-fact-inventory.service.js';
import { normalizeTruthCategory } from '../domain/career/truth-category.js';
import { enforceEvidenceTrust } from './evidence/verification-policy.js';
import { NotFoundError, ValidationError, InternalServerError } from '../errors/index.js';
import {
  RESUME_STUDIO_CONTRACT_VERSION,
  StudioAnalyzeRequestSchema,
  StudioAnalyzeResponseSchema,
} from '../domain/career/resume-studio.schemas.js';

/** Bound both the Studio character limit and the existing parser's byte limit.
 * Iterating code points prevents partial UTF-8 and surrogate-pair truncation. */
export function boundStudioJobText(text) {
  let result = '',
    bytes = 0;
  for (const character of text) {
    const size = Buffer.byteLength(character, 'utf8');
    if (result.length + character.length > 50000 || bytes + size > 51200) break;
    result += character;
    bytes += size;
  }
  return { text: result, truncated: result !== text };
}

/** Lexical relationship and provenance are separate axes. Presence alone is
 * never evidence of independently verified candidate competence. */
export function projectStudioKeywords(coverage, requirementAnalysis) {
  return coverage.termBreakdown.map((term) => {
    const match = requirementAnalysis.requirementMatches.find(
      (item) => item.category === 'SKILL' && item.skillSlug === term.canonicalSlug
    );
    const truth = match
      ? normalizeTruthCategory(match.truthCategory || match.candidateProvenance)
      : 'INFERRED';
    const lexical = term.matchType;
    const absent = lexical === 'MISSING' && (!match || match.matchStatus === 'MISSING');
    const truthState = absent || truth === 'UNKNOWN' ? 'MISSING_EVIDENCE' : truth;
    let category;
    if (absent) category = 'MISSING_IN_PROFILE';
    else if (lexical === 'RELATED' || match?.relationshipType === 'RELATED')
      category = 'RELATED_INSUFFICIENT';
    else if (!['VERIFIED', 'CLAIMED'].includes(truth) || lexical === 'UNSUPPORTED_CANDIDATE')
      category = 'UNSUPPORTED_ON_RESUME';
    else if (lexical === 'TAXONOMY_EQUIVALENT') category = 'TAXONOMY_EQUIVALENT';
    else if (lexical === 'EXACT')
      category = truth === 'VERIFIED' ? 'EXACT_VERIFIED' : 'EXACT_CLAIMED';
    else category = 'UNSUPPORTED_ON_RESUME';
    return {
      term: term.term,
      category,
      truthState,
      lexicalMatchType: lexical,
      satisfiesRequirement:
        ['EXACT_VERIFIED', 'TAXONOMY_EQUIVALENT'].includes(category) &&
        truth === 'VERIFIED' &&
        term.satisfiesRequirement === true &&
        match?.matchStatus === 'MATCHED',
      explanation: match?.explanation || term.explanation,
    };
  });
}

export class ResumeStudioAnalysisService {
  constructor({ database = defaultDb, candidateProfileService } = {}) {
    this.db = database;
    this.profileService = candidateProfileService || new CandidateProfileService(database);
  }

  async analyze(context, input) {
    if (!context?.tenantId || !context?.userId)
      throw new ValidationError('Trusted session context required');
    const parsedInput = StudioAnalyzeRequestSchema.safeParse(input);
    if (!parsedInput.success)
      throw new ValidationError(
        'Invalid Studio analysis request',
        parsedInput.error.issues.map(({ path, message }) => ({ path, message }))
      );
    const { jobTarget } = parsedInput.data;

    // Resolve ONLY this session's candidate. Tenant roles do not grant access to
    // another user's Studio, even where the profile service supports tenant reads.
    const [candidate] = await this.db
      .select({ id: candidates.id })
      .from(candidates)
      .where(and(eq(candidates.tenantId, context.tenantId), eq(candidates.userId, context.userId)));
    if (!candidate) throw new NotFoundError('Candidate profile not found');
    const view = await this.profileService.getProfile(context, candidate.id);
    if (
      view.candidate?.id !== candidate.id ||
      view.candidate?.tenantId !== context.tenantId ||
      view.candidate?.userId !== context.userId
    ) {
      throw new NotFoundError('Candidate profile not found');
    }
    const profile = enforceEvidenceTrust({
      ...view.candidate,
      skills: view.skills || [],
      projects: view.projects || [],
      resources: view.resources || [],
      experience: view.experience || [],
      education: view.education || [],
      certifications: view.certifications || [],
    });
    const bounded = boundStudioJobText(jobTarget.rawDescription);
    const parsed = await JobDescriptionParser.parse(
      {
        rawText: bounded.text,
        source: 'PASTE',
        ...(jobTarget.title ? { title: jobTarget.title } : {}),
        ...(jobTarget.company ? { company: jobTarget.company } : {}),
        metadata: jobTarget.sourceUrl ? { sourceUrl: jobTarget.sourceUrl } : {},
      },
      { tenantId: context.tenantId }
    );
    const job = { ...parsed.jobDescription, requirements: parsed.requirements };
    const requirementAnalysis = EvidenceMatchingService.matchJobToCandidate(context, job, profile);
    const projectRelevance = ProjectRelevanceService.computeProjectsRelevance(
      context,
      job,
      profile.projects,
      { candidateId: candidate.id, maxProjects: 2 }
    );
    const candidateFit = parsed.requirements.length
      ? AtsFitScoreService.calculateCandidateJobFit(
          context,
          job,
          requirementAnalysis,
          projectRelevance,
          profile
        )
      : null;

    // A read-only projection of current source content, not a generated resume.
    // Omit inferred skills and repository technologies from affirmative coverage.
    const source = {
      summary: profile.summary || '',
      skills: profile.skills.filter(
        (skill) =>
          normalizeTruthCategory(skill.truthCategory || skill.provenanceStatus) !== 'INFERRED'
      ),
      experience: profile.experience,
      projects: profile.projects.map((project) => ({ ...project, technologies: [] })),
      education: profile.education,
      certifications: profile.certifications,
    };
    const keywordCoverage = ResumeKeywordCoverageService.analyzeKeywordCoverage({
      jobDescription: job,
      structuredResume: source,
      candidateProfile: profile,
    });
    const hasBullets = [...source.experience, ...source.projects].some((item) =>
      item.bullets?.some((bullet) =>
        typeof bullet === 'string' ? bullet.trim() : bullet?.text?.trim()
      )
    );
    let report = null;
    if (hasBullets) {
      const result = evaluateResumeWritingQuality({
        structuredResume: source,
        jobPosting: job,
        factInventory: buildCanonicalFactInventory(profile, job),
      });
      // The legacy writer's "verified" metric means source-text supported, not
      // independent verification; its ATS dimension is only a text heuristic.
      // Expose writing-only dimensions and name metric support precisely.
      const {
        atsParseability: _ats,
        factUtilizationIntegrity: _utilization,
        authenticMetricUsage,
        evidenceTraceability,
        ...dimensions
      } = result.dimensions;
      report = {
        writingQualityScore: result.writingQualityScore,
        dimensions: {
          ...dimensions,
          sourceSupportedMetricUsage: authenticMetricUsage,
          sourceTraceability: evidenceTraceability,
        },
        quantification: {
          totalBullets: result.quantification.totalBullets,
          quantifiedBulletCount: result.quantification.quantifiedBulletCount,
          sourceSupportedMetricCount: result.quantification.verifiedMetricCount,
          quantificationRate: result.quantification.quantificationRate,
        },
        findings: result.findings,
        strengths: result.strengths,
        recommendations: result.recommendations,
      };
    }
    const response = StudioAnalyzeResponseSchema.safeParse({
      contractVersion: RESUME_STUDIO_CONTRACT_VERSION,
      candidateId: candidate.id,
      analyzedAt: new Date().toISOString(),
      target: {
        title: job.title,
        company: job.company || null,
        requirementsCount: parsed.requirements.length,
        extractionMode: 'DETERMINISTIC',
      },
      warnings: bounded.truncated
        ? [
            {
              code: 'JOB_DESCRIPTION_TRUNCATED',
              message:
                'Job description was truncated to the parser character/UTF-8 byte budget. Review extracted requirements.',
            },
          ]
        : [],
      candidateFit,
      fitStatus: candidateFit ? 'AVAILABLE' : 'INSUFFICIENT_REQUIREMENTS',
      requirementAnalysis,
      projectRelevance,
      keywordCoverage,
      keywords: projectStudioKeywords(keywordCoverage, requirementAnalysis),
      writingQuality: { status: report ? 'AVAILABLE' : 'NOT_EVALUABLE', report },
      parseability: { status: 'NOT_VERIFIED', reason: 'No compiled artifact was inspected.' },
    });
    if (!response.success) throw new InternalServerError('Response contract validation failed');
    return response.data;
  }
}
