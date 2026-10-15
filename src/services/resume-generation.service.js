import { EvidenceMatchingService } from './evidence-matching.service.js';
import { StudioDocumentResponseSchema } from '../domain/career/resume-studio-document.schemas.js';
import { resumeSkillInputs } from './structured-resume.service.js';
import { reconcileCandidateProjects } from './candidate-artifact-content.service.js';
import {
  normalizeResumeSourceSections,
  resumeSourceValue,
} from '../utils/resume-source-normalizer.js';
import crypto from 'node:crypto';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db as defaultDb } from '../db/index.js';
import { candidates, resumes, jobApplications } from '../db/schema.js';
import { CandidateProfileService } from './candidate-profile.service.js';
import { ResumeGenerationVersionService } from './resume-generation-version.service.js';
import { generateResumeContent } from './resume-generation-content.service.js';
import { ProjectRelevanceService } from './project-relevance.service.js';
import { JobDescriptionParser } from '../domain/career/job-parser.js';
import { normalizeJobInput } from './job-normalization.service.js';
import { StudioJobTargetSchema } from '../domain/career/resume-studio.schemas.js';
import { boundStudioJobText } from './resume-studio-analysis.service.js';
import { generatedResumeStudioContent } from './resume-studio-generation-content.js';
import {
  createStudioNodes,
  defaultStudioSelection,
  hashStudioContent,
} from './resume-studio-draft-content.js';
import { compileStudioDocument } from './resume-studio-document-compiler.js';
import { LatexDocumentGenerator } from './latex-document-generator.service.js';
import { LatexCompilerService } from './latex-compiler.service.js';
import { DocumentStorageService } from './document-storage.service.js';
import { sealGeneratedPackage, packageBodyHash } from './evidence/artifact-policy.js';
import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../errors/index.js';

const inputSchema = z
  .object({
    sourceResumeId: z.string().uuid(),
    sourceVersion: z.number().int().positive().optional(),
    jobTarget: StudioJobTargetSchema.extend({
      rawDescription: z.string().trim().min(10).max(250000),
      requirements: z
        .array(z.union([z.string().trim().min(1).max(2000), z.record(z.unknown())]))
        .max(500)
        .optional(),
    }),
    origin: z.enum(['WEB', 'MCP', 'EXTENSION', 'STUDIO_ENTRY', 'REGENERATION']),
    parentGenerationId: z.string().uuid().nullable().default(null),
    applicationId: z.string().uuid().nullable().default(null),
    idempotencyKey: z.string().trim().min(1).max(200).optional(),
    template: z.literal('CLASSIC_LATIN_MODERN_A4').default('CLASSIC_LATIN_MODERN_A4'),
  })
  .strict();
const json = (value) => JSON.parse(JSON.stringify(value));
const stableJobId = (fingerprint) => {
  const hex = crypto.createHash('sha256').update(fingerprint).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};

/** Source representation adapter used after ownership authorization. No writing/ranking policy. */
export function buildGenerationProfile(source, view) {
  const metadata = { ...source.owner.profileMetadata, resumeData: source.canonical };
  const masterIdentity = source.canonical.identity || {};
  const masterInput = { ...masterIdentity, ...source.canonical, profileMetadata: metadata };
  const sections = normalizeResumeSourceSections(masterInput);
  const masterDsa = resumeSourceValue(masterInput, 'dsa', ['problemSolving']);
  const masterLinks = resumeSourceValue(masterInput, 'links', ['portfolioLinks']);
  const profile = json({
    ...view.candidate,
    ...sections,
    displayName: resumeSourceValue(
      { ...masterInput, displayName: masterIdentity.name || view.candidate.displayName },
      'displayName'
    ),
    canonicalEmail:
      source.owner.canonicalEmail || masterIdentity.email || view.candidate.canonicalEmail,
    phone: resumeSourceValue(masterInput, 'phone', ['canonicalPhone', 'phoneNumber']),
    location: resumeSourceValue(masterInput, 'location'),
    headline: resumeSourceValue(masterInput, 'headline'),
    links:
      masterLinks === undefined
        ? [
            ...['github', 'linkedin', 'leetcode'].flatMap((label) =>
              masterIdentity[label] ? [{ label, url: masterIdentity[label] }] : []
            ),
            ...(masterIdentity.portfolioUrls || []).map((url) => ({ label: 'Portfolio', url })),
          ]
        : masterLinks,
    summary: resumeSourceValue(masterInput, 'summary'),
    skills: view.skills || [],
    projects: reconcileCandidateProjects({
      profileProjects: view.projects || [],
      resumeDataProjects: source.canonical.projects || [],
    }),

    dsa: masterDsa === undefined ? view.dsa || null : masterDsa,
    resumeSections: (view.resumeSections || []).filter(
      (section) => section.resumeId === source.canonical.sourceResumeId
    ),
    profileMetadata: metadata,
  });
  profile.projects = profile.projects.map((project) =>
    z.string().uuid().safeParse(project.id).success
      ? project
      : {
          ...project,
          id: stableJobId(
            'candidate:' +
              source.owner.id +
              ':project:' +
              (project.id || project.repositoryUrl || project.slug || project.name)
          ),
          metadata: {
            ...project.metadata,
            sourceProjectId: project.id || null,
            sourceProjectKey: project.repositoryUrl || project.slug || project.name,
          },
        }
  );
  profile.skills = resumeSkillInputs(profile);
  return profile;
}

/** Authorized orchestration around the existing shared writer/selection/renderer, never a Studio writer. */
export class ResumeGenerationService {
  constructor({
    database = defaultDb,
    aiProvider,
    compileDocument = compileStudioDocument,
    storage,
    generator = new LatexDocumentGenerator(),
    compiler = new LatexCompilerService(),
  } = {}) {
    this.db = database;
    this.aiProvider = aiProvider;
    this.compileDocument = compileDocument;
    this.storage = storage || new DocumentStorageService({ database });
    this.generator = generator;
    this.compiler = compiler;
    this.versions = new ResumeGenerationVersionService({ database });
  }
  async execute(context, input) {
    if (!context?.tenantId || !context?.userId || !['OWNER', 'MEMBER'].includes(context.role))
      throw new AuthorizationError('Candidate write session required');
    const parsedInput = inputSchema.safeParse(input);
    if (!parsedInput.success)
      throw new ValidationError(
        'Invalid generation request',
        parsedInput.error.issues.map(({ path, message }) => ({ path, message }))
      );
    const body = parsedInput.data;
    const bounded = boundStudioJobText(body.jobTarget.rawDescription);
    if (Buffer.byteLength(JSON.stringify(body.jobTarget.requirements || []), 'utf8') > 51200)
      throw new ValidationError('Job requirements exceed the bounded snapshot limit');
    const source = await this.db.transaction(async (tx) => {
      const [owner] = await tx
        .select()
        .from(candidates)
        .where(
          and(
            eq(candidates.tenantId, context.tenantId),
            eq(candidates.userId, context.userId),
            eq(candidates.status, 'ACTIVE')
          )
        )
        .for('share');
      if (!owner) throw new NotFoundError('Candidate not found');
      const [master] = await tx
        .select()
        .from(resumes)
        .where(
          and(
            eq(resumes.id, body.sourceResumeId),
            eq(resumes.tenantId, context.tenantId),
            eq(resumes.candidateId, owner.id)
          )
        )
        .for('share');
      const canonical = owner.profileMetadata?.resumeData;
      if (
        !master?.isBaseResume ||
        master.lifecycleState !== 'BASE_RESUME' ||
        canonical?.sourceResumeId !== master.id ||
        canonical.sourceVersion !== master.version ||
        (body.sourceVersion && body.sourceVersion !== master.version)
      )
        throw new ConflictError('Select the current reviewed canonical master');
      if (body.applicationId) {
        const [application] = await tx
          .select()
          .from(jobApplications)
          .where(
            and(
              eq(jobApplications.id, body.applicationId),
              eq(jobApplications.tenantId, context.tenantId),
              eq(jobApplications.candidateId, owner.id)
            )
          )
          .for('share');
        if (!application) throw new NotFoundError('Application not found');
      }
      return json({ owner, master, canonical });
    });
    if (body.parentGenerationId) {
      const parent = await this.versions.get(context, body.parentGenerationId);
      if (parent.candidateId !== source.owner.id)
        throw new NotFoundError('Parent generation not found');
    }
    const inputHash = hashStudioContent({
      ...body,
      idempotencyKey: undefined,
      origin: undefined,
      sourceVersion: source.master.version,
      sourceContentHash: source.master.contentHash,
      jobTarget: { ...body.jobTarget, rawDescription: bounded.text },
    });
    const key = body.idempotencyKey || inputHash;
    const existing = await this.versions.findByKey(context, source.owner.id, key);
    if (existing) {
      if (existing.bundle.metadata.inputHash !== inputHash)
        throw new ConflictError('Idempotency key belongs to a different generation request');
      return existing;
    }
    const parsed = await JobDescriptionParser.parse(
      {
        source: 'PASTE',
        rawText: bounded.text,
        ...(body.jobTarget.title ? { title: body.jobTarget.title } : {}),
        ...(body.jobTarget.company ? { company: body.jobTarget.company } : {}),
      },
      { tenantId: context.tenantId }
    );
    const canonicalJob = normalizeJobInput({
      title: parsed.jobDescription.title,
      description: bounded.text,
      requirements: [
        ...(body.jobTarget.requirements || []),
        ...parsed.requirements.map(
          ({ id: _id, jobDescriptionId: _job, ...requirement }) => requirement
        ),
      ],
    });
    const job = {
      id: stableJobId(canonicalJob.jobFingerprint),
      tenantId: context.tenantId,
      title: parsed.jobDescription.title,
      ...(body.jobTarget.company ? { company: body.jobTarget.company } : {}),
      description: bounded.text,
      rawDescription: bounded.text,
      ...canonicalJob,
      requirements: canonicalJob.normalizedRequirements,
      skills: canonicalJob.normalizedRequirements
        .filter((r) => r.class === 'TECHNOLOGY')
        .map((r) => r.text),
      ...(body.jobTarget.sourceUrl ? { sourceUrl: body.jobTarget.sourceUrl } : {}),
    };
    const view = await new CandidateProfileService(this.db).getProfile(context, source.owner.id);
    const profile = buildGenerationProfile(source, view);
    const ranking = ProjectRelevanceService.computeProjectsRelevance(
      context,
      job,
      profile.projects,
      { candidateId: source.owner.id, skills: profile.skills }
    );
    const matchAnalysis = EvidenceMatchingService.matchJobToCandidate(context, job, {
      ...profile,
      resources: view.resources || [],
    });
    const selected = new Set(
      ranking.projectRankings
        .filter((r) => r.selectionStatus === 'SELECTED')
        .map((r) => r.projectId)
    );
    const content = await generateResumeContent({
      candidateProfile: profile,
      jobPosting: job,
      projectRankings: ranking.projectRankings,
      matchAnalysis,
      selectedProjects: profile.projects.filter((p) => selected.has(p.id)),
      selectedSkills: profile.skills,
      aiProvider: this.aiProvider,
      generator: this.generator,
      compiler: this.compiler,
    });
    const studioContent = generatedResumeStudioContent(
      content.safeStructuredResume,
      crypto.randomUUID()
    );
    const nodes = createStudioNodes(studioContent);
    const draft = {
      structuredResume: studioContent,
      nodes,
      selection: {
        ...defaultStudioSelection(nodes),
        projectIds: nodes.filter((n) => n.kind === 'PROJECT').map((n) => n.nodeId),
      },
    };
    const compiled = await this.compileDocument(draft);
    const verification = StudioDocumentResponseSchema.shape.verification.safeParse(
      compiled?.verification
    );
    if (
      !verification.success ||
      verification.data.failedChecks.length ||
      verification.data.pageCount !== 1 ||
      verification.data.minimumFontPt < 9.95 ||
      ![
        'a4',
        'fontsEmbedded',
        'unicodeMaps',
        'wordSpacing',
        'textPreserved',
        'readingOrder',
        'noClipping',
        'noOverlaps',
        'glyphsSafe',
        'docxTextPreserved',
      ].every((key) => verification.data[key])
    )
      throw new ValidationError(
        'Generated document requires content or layout review',
        'DOCUMENT_REVIEW_REQUIRED'
      );
    const sealed = await sealGeneratedPackage(
      this.db,
      { tenantId: context.tenantId, candidateId: source.owner.id },
      json({
        candidateId: source.owner.id,
        sourceResumeId: source.master.id,
        sourceVersion: source.master.version,
        sourceContentHash: source.master.contentHash,
        structuredResume: content.safeStructuredResume,
        targetJob: job,
      })
    );
    const generatedPackage = {
      receipt: sealed.evidenceTrustReceipt,
      bodyHash: packageBodyHash(sealed),
      packageHash: sealed.packageHash,
    };
    const artifacts = {};
    try {
      for (const format of ['pdf', 'docx'])
        artifacts[format] = await this.storage.storeEncryptedDocument({
          tenantId: context.tenantId,
          candidateId: source.owner.id,
          buffer: Buffer.from(compiled[format], 'base64'),
          generatedPackage,
        });
      const saved = await this.versions.save(
        context,
        {
          candidateId: source.owner.id,
          sourceResumeId: source.master.id,
          sourceVersion: source.master.version,
          sourceContentHash: source.master.contentHash,
          origin: body.origin,
          parentGenerationId: body.parentGenerationId,
          applicationId: body.applicationId,
          idempotencyKey: key,
          jobSnapshot: job,
        },
        {
          structuredResume: content.safeStructuredResume,
          sourceSnapshot: source.canonical,
          tailoringPlan: content.safeTailoringPlan,
          evidenceValidationReceipt: content.safeEvidenceReceipt,
          artifacts,
          metadata: json({
            inputHash,
            template: body.template,
            verification: compiled.verification,
            artifactPackageHash: sealed.packageHash,
            jobDescription: { ...parsed.jobDescription, requirements: parsed.requirements },
            sourceProfileSnapshot: profile,
            projectRanking: ranking,
            matchAnalysis,
            writing: content.safeStructuredResume.writing || null,
            jobDescriptionTruncated: bounded.truncated,
          }),
        }
      );
      // A concurrent retry may have committed the same request while compilation ran.
      if (saved.bundle.artifacts.pdf.storageKey !== artifacts.pdf.storageKey)
        await Promise.allSettled(
          Object.values(artifacts).map((artifact) =>
            this.storage.deleteEncryptedDocument({
              tenantId: context.tenantId,
              storageKey: artifact.storageKey,
            })
          )
        );
      return saved;
    } catch (error) {
      await Promise.allSettled(
        Object.values(artifacts).map((artifact) =>
          this.storage.deleteEncryptedDocument({
            tenantId: context.tenantId,
            storageKey: artifact.storageKey,
          })
        )
      );
      throw error;
    }
  }
}
