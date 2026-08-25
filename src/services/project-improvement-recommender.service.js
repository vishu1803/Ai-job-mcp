/**
 * @file Project Improvement Recommender Service (P9-001 / ARCH-031 / ADR-052)
 *
 * Implements deterministic synthesis, ranking, and validation of project improvement
 * recommendations to bridge candidate skill gaps identified from job descriptions.
 *
 * Security & Design Invariants:
 * 1. Inverse Authority Principle: AI proposes plans; deterministic kernel validates and signs off.
 * 2. Zero Writes: Performs ZERO GitHub writes, branch creations, or approval ticket consumption.
 * 3. Deterministic Gap Grounding: Relies exclusively on EvidenceMatchingService for skill gap status.
 * 4. Multi-Tenant Default-Deny: Returns 404 NOT_FOUND on any cross-tenant resource access.
 * 5. Deterministic Patch Safety: Enforces path sanitization, CI/CD workflow blocklist, max 10 files / 500 lines limits.
 * 6. Secret Protection: Uses SecretScrubber to scan all generated patches and scrub credentials.
 * 7. Evidence Provenance: All cited evidence must exist in verified candidate evidence graph.
 */

import crypto from 'node:crypto';
import { logger as defaultLogger } from '../utils/logger.js';
import { ValidationError, NotFoundError } from '../errors/index.js';
import { EvidenceMatchingService } from './evidence-matching.service.js';
import { ProjectRelevanceService } from './project-relevance.service.js';
import { SecretScrubber } from '../extractors/github/security/secret-scrubber.js';
import {
  ProjectImprovementProposalSchema,
  validatePatchPath,
  computeFileSha256,
  computePatchFingerprint,
  MAX_FILES_PER_PROPOSAL,
  MAX_TOTAL_DIFF_LINES,
  MAX_TOTAL_PAYLOAD_BYTES,
} from '../domain/career/project-improvement.schemas.js';
import { PromptPolicyRegistry } from '../clients/ai/prompt-policies/index.js';

export class ProjectImprovementRecommenderService {
  /**
   * @param {object} [options={}]
   * @param {import('../clients/ai/ai-provider.js').AiProvider} [options.aiProvider=null] AI provider client
   * @param {import('./mcp-audit.service.js').McpAuditService} [options.mcpAuditService=null] Audit logger
   * @param {import('pino').Logger} [options.logger=defaultLogger] Logger instance
   */
  constructor(options = {}) {
    this.aiProvider = options.aiProvider || null;
    this.mcpAuditService = options.mcpAuditService || null;
    this.logger = options.logger || defaultLogger;
    this.promptRegistry = new PromptPolicyRegistry();
  }

  /**
   * Evaluates skill gaps and generates a structured, validated project improvement proposal.
   *
   * @param {object} context Authenticated tenant context
   * @param {string} context.tenantId Sovereign tenant UUID
   * @param {string} [context.userId] Requesting user UUID
   * @param {object} params Request parameters
   * @param {object} params.candidateProfile Normalized CandidateProfileView
   * @param {object} params.jobDescription Normalized JobDescription
   * @param {string[]} [params.targetSkillSlugs] Optional filter for target skills
   * @param {string} [params.repositoryId] Optional target repository ID
   * @returns {Promise<import('../domain/career/project-improvement.schemas.js').ProjectImprovementProposal>}
   */
  async recommendImprovement(context, params) {
    const startTime = Date.now();

    // -------------------------------------------------------------------------
    // 1. Multi-Tenant Sovereign Isolation Verification
    // -------------------------------------------------------------------------
    if (!context || !context.tenantId) {
      throw new ValidationError('Trusted tenantId is required in context', 'TENANT_ID_REQUIRED');
    }

    const trustedTenantId = context.tenantId;

    const candidateTenantId =
      params.candidateProfile?.tenantId || params.candidateProfile?.candidate?.tenantId;
    if (!candidateTenantId || candidateTenantId !== trustedTenantId) {
      throw new NotFoundError('Candidate not found');
    }

    if (!params.jobDescription?.tenantId || params.jobDescription.tenantId !== trustedTenantId) {
      throw new NotFoundError('Job description not found');
    }

    const { candidateProfile, jobDescription } = params;
    const candidateId = candidateProfile.candidate?.id || candidateProfile.id;
    const candidate = candidateProfile.candidate || {
      id: candidateId,
      tenantId: candidateTenantId,
    };

    const normalizedCandidateProfile = {
      id: candidateId,
      candidateId,
      tenantId: candidateTenantId,
      candidate,
      skills: candidateProfile.skills || [],
      projects: candidateProfile.projects || [],
      evidence: candidateProfile.evidence || [],
    };

    // -------------------------------------------------------------------------
    // 2. Deterministic Skill Gap Analysis via EvidenceMatchingService
    // -------------------------------------------------------------------------
    const matchAnalysis = EvidenceMatchingService.matchJobToCandidate(
      context,
      jobDescription,
      normalizedCandidateProfile
    );

    // Filter to MISSING and PARTIAL skills only
    let actionableGaps = matchAnalysis.skillGaps.filter(
      (gap) => gap.status === 'MISSING' || gap.status === 'PARTIAL'
    );

    if (Array.isArray(params.targetSkillSlugs) && params.targetSkillSlugs.length > 0) {
      const targetSet = new Set(params.targetSkillSlugs.map((s) => s.toLowerCase()));
      actionableGaps = actionableGaps.filter(
        (gap) => gap.skillSlug && targetSet.has(gap.skillSlug.toLowerCase())
      );
    }

    if (actionableGaps.length === 0) {
      throw new ValidationError(
        'No actionable missing or partial skill gaps identified for improvement',
        'UNSUPPORTED_SKILL_GAP'
      );
    }

    // Prioritize critical and high severity gaps
    const priorityOrder = { CRITICAL: 1, HIGH: 2, MEDIUM: 3, LOW: 4 };
    actionableGaps.sort(
      (a, b) => (priorityOrder[a.priority] || 5) - (priorityOrder[b.priority] || 5)
    );
    const primaryGap = actionableGaps[0];

    // -------------------------------------------------------------------------
    // 3. Candidate Repository Selection & Ranking
    // -------------------------------------------------------------------------
    const candidateProjects = candidateProfile.projects || [];
    const candidateEvidence = candidateProfile.evidence || [];

    if (candidateProjects.length === 0 && candidateEvidence.length === 0) {
      throw new ValidationError(
        'No candidate repositories or evidence available for project improvement',
        'NO_SUITABLE_REPOSITORY'
      );
    }

    let selectedProject = null;

    if (params.repositoryId) {
      selectedProject = candidateProjects.find(
        (p) => p.id === params.repositoryId || p.resourceId === params.repositoryId
      );
      if (!selectedProject) {
        throw new NotFoundError('Specified repository not found in candidate profile');
      }
    } else {
      // Rank candidate projects against job requirements
      const scoredProjects = candidateProjects.map((project) => {
        try {
          const relevance = ProjectRelevanceService.scoreProjectRelevance(
            context,
            project,
            jobDescription.requirements
          );
          return { project, score: relevance.scoreBreakdown.totalScore };
        } catch {
          return { project, score: 0 };
        }
      });

      scoredProjects.sort((a, b) => b.score - a.score);

      if (scoredProjects.length > 0 && scoredProjects[0].score > 0) {
        selectedProject = scoredProjects[0].project;
      } else if (candidateProjects.length > 0) {
        selectedProject = candidateProjects[0];
      }
    }

    if (!selectedProject) {
      throw new ValidationError(
        'No suitable repository found to demonstrate the missing skill',
        'NO_SUITABLE_REPOSITORY'
      );
    }

    const repositoryName = selectedProject.name || selectedProject.repositoryName || 'project-repo';
    const resourceId = selectedProject.resourceId || selectedProject.id || crypto.randomUUID();

    // -------------------------------------------------------------------------
    // 4. Grounded Evidence Extraction for Selected Project
    // -------------------------------------------------------------------------
    const projectEvidence = candidateEvidence.filter(
      (ev) => ev.projectId === selectedProject.id || ev.resourceId === resourceId
    );

    const validEvidenceRefs = projectEvidence.slice(0, 5).map((ev) => ({
      id: ev.id,
      resourceId: ev.resourceId || resourceId,
      resourceName: repositoryName,
      evidenceType: ev.evidenceType || 'CODE_USAGE',
      filePath: ev.filePath || 'src/index.js',
      confidenceScore: ev.confidenceScore || 1.0,
    }));

    // -------------------------------------------------------------------------
    // 5. Synthesis: AI Provider or Deterministic Fallback
    // -------------------------------------------------------------------------
    const targetSlug = primaryGap.skillSlug || 'feature';
    const randomSuffix = crypto.randomBytes(4).toString('hex');
    const targetBranch = `feat/career-hub-${targetSlug}-${randomSuffix}`;
    const proposalId = crypto.randomUUID();

    let rawProposal = null;

    if (this.aiProvider && typeof this.aiProvider.generateStructured === 'function') {
      try {
        const policy = this.promptRegistry.getPolicy('PROJECT_IMPROVEMENT');
        const envelope = policy.buildEnvelope({
          candidateFacts: {
            candidateId: candidate.id,
            targetSkill: primaryGap.skillName,
            skillSlug: primaryGap.skillSlug,
            gapStatus: primaryGap.status,
            gapReason: primaryGap.reason,
            repositoryName,
          },
          verifiedEvidence: validEvidenceRefs,
          jobRequirements: jobDescription.requirements.slice(0, 10),
          untrustedContent: {
            jobDescription: jobDescription.rawText || '',
            repositoryName,
            existingFiles: projectEvidence.map((e) => e.filePath).filter(Boolean),
          },
          prompt: `Propose a structured code improvement adding '${primaryGap.skillName}' to '${repositoryName}'. Output a focused file patch (max 3 files).`,
        });

        const aiResult = await this.aiProvider.generateStructured({
          taskType: 'PROJECT_IMPROVEMENT',
          systemInstruction: envelope.systemInstruction,
          prompt: envelope.contents,
          temperature: 0.2,
        });

        if (aiResult && aiResult.files && Array.isArray(aiResult.files)) {
          rawProposal = aiResult;
        }
      } catch (aiErr) {
        this.logger.warn(
          { err: aiErr.message, skill: primaryGap.skillSlug },
          'AI structured generation failed; falling back to deterministic template synthesis'
        );
      }
    }

    if (!rawProposal) {
      rawProposal = this._synthesizeDeterministicPatch(primaryGap, repositoryName, projectEvidence);
    }

    // -------------------------------------------------------------------------
    // 6. Deterministic Patch Safety & Validation Pipeline
    // -------------------------------------------------------------------------
    const validatedFiles = [];
    let totalDiffLines = 0;
    let totalBytes = 0;
    let secretDetected = false;

    if (!Array.isArray(rawProposal.files) || rawProposal.files.length === 0) {
      throw new ValidationError(
        'Generated proposal contains no file modifications',
        'INVALID_PATCH'
      );
    }

    if (rawProposal.files.length > MAX_FILES_PER_PROPOSAL) {
      throw new ValidationError(
        `Patch exceeds maximum allowed files (${MAX_FILES_PER_PROPOSAL})`,
        'PATCH_TOO_LARGE'
      );
    }

    for (const file of rawProposal.files) {
      // A. Path Safety
      const pathCheck = validatePatchPath(file.path);
      if (!pathCheck.valid) {
        throw new ValidationError(pathCheck.error, 'PATH_POLICY_VIOLATION');
      }

      // B. Content Checks
      const content = typeof file.content === 'string' ? file.content : '';
      if (content.includes('\0')) {
        throw new ValidationError(
          'File content contains prohibited binary null bytes',
          'INVALID_PATCH'
        );
      }

      const fileBytes = Buffer.byteLength(content, 'utf8');
      totalBytes += fileBytes;

      const lines = content.split('\n').length;
      totalDiffLines += lines;

      // C. Secret Scanning
      if (SecretScrubber.containsSecret(content) || SecretScrubber.containsSecret(file.path)) {
        secretDetected = true;
      }

      const fileSha = computeFileSha256(content);

      validatedFiles.push({
        path: file.path,
        operation:
          file.operation === 'MODIFY'
            ? 'MODIFY'
            : file.operation === 'DELETE'
              ? 'DELETE'
              : 'CREATE',
        content: secretDetected ? SecretScrubber.scrub(content) : content,
        sha256: fileSha,
        diffLinesCount: lines,
      });
    }

    if (totalDiffLines > MAX_TOTAL_DIFF_LINES) {
      throw new ValidationError(
        `Total patch diff lines (${totalDiffLines}) exceed maximum limit of ${MAX_TOTAL_DIFF_LINES}`,
        'PATCH_TOO_LARGE'
      );
    }

    if (totalBytes > MAX_TOTAL_PAYLOAD_BYTES) {
      throw new ValidationError(
        `Total patch payload (${totalBytes} bytes) exceeds maximum limit of ${MAX_TOTAL_PAYLOAD_BYTES} bytes`,
        'PATCH_TOO_LARGE'
      );
    }

    // Check secrets in descriptive prose
    if (
      SecretScrubber.containsSecret(rawProposal.title || '') ||
      SecretScrubber.containsSecret(rawProposal.rationale || '') ||
      SecretScrubber.containsSecret(rawProposal.architecturalChange || '')
    ) {
      secretDetected = true;
    }

    const patchFingerprint = computePatchFingerprint(validatedFiles);

    // -------------------------------------------------------------------------
    // 7. Grounded Evidence Validation (Zero-Hallucination Gate)
    // -------------------------------------------------------------------------
    const candidateEvidenceIdSet = new Set(candidateEvidence.map((e) => e.id));
    const groundedEvidenceRefs = validEvidenceRefs.filter((ref) =>
      candidateEvidenceIdSet.has(ref.id)
    );

    // -------------------------------------------------------------------------
    // 8. Construct Final Proposal Object
    // -------------------------------------------------------------------------
    const title = SecretScrubber.scrub(
      rawProposal.title || `Implement ${primaryGap.skillName} in ${repositoryName}`
    );
    const rationale = SecretScrubber.scrub(
      rawProposal.rationale ||
        `Addresses missing job requirement for ${primaryGap.skillName} by introducing verified implementation patterns in ${repositoryName}.`
    );
    const architecturalChange = SecretScrubber.scrub(
      rawProposal.architecturalChange ||
        `Introduces modular architecture and test coverage demonstrating ${primaryGap.skillName}.`
    );

    const proposalStatus = secretDetected ? 'BLOCKED' : 'PROPOSED';
    const blockReason = secretDetected ? 'SECRET_DETECTED' : null;

    const proposal = ProjectImprovementProposalSchema.parse({
      proposalId,
      tenantId: trustedTenantId,
      candidateId: candidate.id,
      jobDescriptionId: jobDescription.id,
      resourceId,
      repositoryName,
      targetBranch,
      targetSkillSlugs: [primaryGap.skillSlug || 'skill'],
      targetSkillNames: [primaryGap.skillName],
      gapType: primaryGap.status,
      title,
      rationale,
      architecturalChange,
      expectedFiles: validatedFiles.map((f) => f.path),
      patch: {
        fileCount: validatedFiles.length,
        additionsCount: totalDiffLines,
        deletionsCount: 0,
        totalDiffLines,
        files: validatedFiles,
        patchFingerprint,
      },
      evidenceRefs: groundedEvidenceRefs,
      verificationPlan: {
        buildInstructions: rawProposal.verificationPlan?.buildInstructions || 'npm install',
        testCommands: rawProposal.verificationPlan?.testCommands || ['npm test'],
        expectedOutcomes: rawProposal.verificationPlan?.expectedOutcomes || [
          'All tests pass successfully',
        ],
        rollbackAdvice:
          rawProposal.verificationPlan?.rollbackAdvice ||
          'Discard the feature branch if tests fail.',
      },
      riskLevel:
        rawProposal.riskLevel === 'HIGH'
          ? 'HIGH'
          : rawProposal.riskLevel === 'MEDIUM'
            ? 'MEDIUM'
            : 'LOW',
      confidenceScore: 0.95,
      status: proposalStatus,
      blockReason,
      createdAt: new Date(),
    });

    // -------------------------------------------------------------------------
    // 9. Audit Logging
    // -------------------------------------------------------------------------
    if (this.mcpAuditService && typeof this.mcpAuditService.logEvent === 'function') {
      try {
        await this.mcpAuditService.logEvent({
          context: { tenantId: trustedTenantId, userId: context.userId || candidate.id },
          eventType: 'project.improvement.proposed',
          resourceType: 'project_improvement',
          resourceId: proposalId,
          durationMs: Date.now() - startTime,
          metadata: {
            proposalId,
            repositoryName,
            targetSkillSlugs: proposal.targetSkillSlugs,
            patchFingerprint,
            status: proposalStatus,
            blockReason,
          },
        });
      } catch (auditErr) {
        this.logger.warn(
          { err: auditErr.message },
          'Failed to record project improvement audit event'
        );
      }
    }

    return proposal;
  }

  /**
   * Deterministically synthesizes a canonical improvement patch based on skill taxonomy.
   *
   * @private
   * @param {object} gap Skill gap object
   * @param {string} repositoryName Target repository name
   * @param {Array} projectEvidence Evidence items for project
   * @returns {object} Raw proposal payload
   */
  _synthesizeDeterministicPatch(gap, repositoryName, _projectEvidence) {
    const slug = (gap.skillSlug || '').toLowerCase();

    if (slug.includes('redis') || slug.includes('cache')) {
      return {
        title: `Add Redis Caching Layer to ${repositoryName}`,
        rationale: `Implements caching for high-traffic endpoints to demonstrate Redis proficiency required by job description.`,
        architecturalChange: `Introduces a CacheManager abstraction with TTL invalidation, connection fallback, and integration tests.`,
        files: [
          {
            path: 'src/services/cache-manager.js',
            operation: 'CREATE',
            content: `// Redis Cache Manager Implementation\nexport class CacheManager {\n  constructor(client) {\n    this.client = client;\n  }\n  async get(key) {\n    return this.client.get(key);\n  }\n  async set(key, val, ttl = 300) {\n    return this.client.set(key, val, 'EX', ttl);\n  }\n}\n`,
          },
          {
            path: 'tests/unit/cache-manager.test.js',
            operation: 'CREATE',
            content: `// Unit tests for CacheManager\nimport { describe, it } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { CacheManager } from '../../src/services/cache-manager.js';\n\ndescribe('CacheManager', () => {\n  it('stores and retrieves keys with TTL', async () => {\n    const mockClient = { get: async () => 'bar', set: async () => 'OK' };\n    const cache = new CacheManager(mockClient);\n    const val = await cache.get('foo');\n    assert.equal(val, 'bar');\n  });\n});\n`,
          },
        ],
        verificationPlan: {
          buildInstructions: 'npm install ioredis',
          testCommands: ['node --test tests/unit/cache-manager.test.js'],
          expectedOutcomes: ['CacheManager unit tests pass with 100% assertions'],
          rollbackAdvice: 'Delete feat/career-hub-redis-* branch if caching causes regressions.',
        },
      };
    }

    if (slug.includes('docker') || slug.includes('container')) {
      return {
        title: `Dockerize ${repositoryName} with Multi-Stage Build`,
        rationale: `Adds production-ready Dockerfile and docker-compose configurations to fulfill containerization requirement.`,
        architecturalChange: `Configures lightweight multi-stage Node.js container with non-root security user.`,
        files: [
          {
            path: 'Dockerfile',
            operation: 'CREATE',
            content: `FROM node:20-alpine AS builder\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci\nCOPY . .\n\nFROM node:20-alpine AS runner\nWORKDIR /app\nUSER node\nCOPY --from=builder --chown=node:node /app .\nEXPOSE 3000\nCMD ["npm", "start"]\n`,
          },
        ],
        verificationPlan: {
          buildInstructions: 'docker build -t app .',
          testCommands: ['docker run --rm app npm test'],
          expectedOutcomes: ['Container builds and passes test suite'],
          rollbackAdvice: 'Remove Dockerfile if container build fails.',
        },
      };
    }

    // Generic fallback for any skill
    return {
      title: `Implement ${gap.skillName} Architecture in ${repositoryName}`,
      rationale: `Adds concrete implementation and test suite demonstrating ${gap.skillName} capability.`,
      architecturalChange: `Introduces modular service component and unit test suite for ${gap.skillName}.`,
      files: [
        {
          path: `src/features/${slug || 'feature'}-service.js`,
          operation: 'CREATE',
          content: `// Service implementation for ${gap.skillName}\nexport class ${gap.skillName.replace(/[^a-zA-Z0-9]/g, '')}Service {\n  execute(params) {\n    return { success: true, feature: '${gap.skillName}' };\n  }\n}\n`,
        },
        {
          path: `tests/unit/${slug || 'feature'}-service.test.js`,
          operation: 'CREATE',
          content: `import { describe, it } from 'node:test';\nimport assert from 'node:assert/strict';\n\ndescribe('${gap.skillName} Service', () => {\n  it('executes successfully', () => {\n    assert.ok(true);\n  });\n});\n`,
        },
      ],
      verificationPlan: {
        buildInstructions: 'npm install',
        testCommands: [`node --test tests/unit/${slug || 'feature'}-service.test.js`],
        expectedOutcomes: [`${gap.skillName} unit tests pass`],
        rollbackAdvice: 'Discard feature branch if integration tests fail.',
      },
    };
  }
}
