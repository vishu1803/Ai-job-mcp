/**
 * @file Project Relevance Scoring Service (P5-004)
 *
 * Implements deterministic scoring and ranking of candidate projects against structured JobRequirements.
 * Evaluates 5 additive components:
 * 1. Requirement Coverage (50 Pts)
 * 2. Architectural Density (25 Pts across 10 dimensions)
 * 3. Evidence Quality (15 Pts)
 * 4. Project Completeness (5 Pts)
 * 5. Activity Recency (5 Pts)
 *
 * Conforms to:
 * - ARCH-014 (docs/project-relevance-architecture.md)
 * - ADR-034 (docs/decisions.md)
 */

import { logger } from '../utils/logger.js';
import { ValidationError, NotFoundError } from '../errors/index.js';
import { SkillTaxonomyEngine } from '../domain/career/skill-taxonomy.js';
import {
  ProjectRelevanceSchema,
  CandidateProjectRelevanceAnalysisSchema,
} from '../domain/career/project-relevance.schemas.js';

// ---------------------------------------------------------------------------
// 1. Evidentiary Provenance Hierarchy
// ---------------------------------------------------------------------------

const EVIDENCE_TYPE_WEIGHTS = Object.freeze({
  PACKAGE_MANIFEST_DEPENDENCY: 1.0,
  CODE_IMPORT_USAGE: 0.95,
  CODE_USAGE: 0.9,
  CONFIG_SYNTAX_DECLARATION: 0.85,
  COMMIT_CONTRIBUTION: 0.75,
  FILE_PATTERN_MATCH: 0.65,
  DIRECTORY_STRUCTURE: 0.5,
  README_SPECIFICATION: 0.3,
  DOCUMENT_CLAIM: 0.0,
});

const EVIDENCE_TYPE_RANK = Object.freeze({
  PACKAGE_MANIFEST_DEPENDENCY: 1,
  CODE_IMPORT_USAGE: 2,
  CODE_USAGE: 3,
  CONFIG_SYNTAX_DECLARATION: 4,
  COMMIT_CONTRIBUTION: 5,
  FILE_PATTERN_MATCH: 6,
  DIRECTORY_STRUCTURE: 7,
  README_SPECIFICATION: 8,
  DOCUMENT_CLAIM: 9,
});

// ---------------------------------------------------------------------------
// 2. Architectural Dimension Signatures (10 Dimensions, 2.5 Pts Each)
// ---------------------------------------------------------------------------

const ARCHITECTURAL_DIMENSION_CONFIG = Object.freeze({
  API_ROUTING: {
    skills: new Set([
      'fastify',
      'express',
      'next-js',
      'graphql',
      'grpc',
      'fastapi',
      'gin',
      'koa',
      'nestjs',
      'flask',
      'django',
      'spring',
      'rails',
      'actix-web',
    ]),
    filePatterns: [/routes?\//i, /controllers?\//i, /endpoints?\//i, /api\//i, /handlers?\//i],
    weight: 2.5,
  },
  DATA_PERSISTENCE: {
    skills: new Set([
      'postgresql',
      'mysql',
      'sqlite',
      'mongodb',
      'drizzle-orm',
      'prisma',
      'typeorm',
      'sqlalchemy',
      'hibernate',
      'dynamodb',
      'cassandra',
      'couchdb',
    ]),
    filePatterns: [
      /db\//i,
      /migrations?\//i,
      /schemas?\//i,
      /models?\//i,
      /entities?\//i,
      /\.sql$/i,
    ],
    weight: 2.5,
  },
  AUTHENTICATION_SECURITY: {
    skills: new Set([
      'jwt',
      'oauth',
      'passport',
      'bcrypt',
      'argon2',
      'auth0',
      'keycloak',
      'jose',
      'crypto',
    ]),
    filePatterns: [/auth\//i, /security\//i, /tokens?\//i, /rbac\//i, /permissions?\//i],
    weight: 2.5,
  },
  BACKGROUND_PROCESSING: {
    skills: new Set([
      'bullmq',
      'kafka',
      'rabbitmq',
      'sqs',
      'celery',
      'redis',
      'temporal',
      'sidekiq',
    ]),
    filePatterns: [
      /workers?\//i,
      /queues?\//i,
      /jobs?\//i,
      /tasks?\//i,
      /cron\//i,
      /consumers?\//i,
    ],
    weight: 2.5,
  },
  CLOUD_DEVOPS: {
    skills: new Set([
      'docker',
      'kubernetes',
      'terraform',
      'aws',
      'gcp',
      'azure',
      'helm',
      'ansible',
      'github-actions',
    ]),
    filePatterns: [
      /dockerfile/i,
      /docker-compose/i,
      /\.github\/workflows\//i,
      /k8s\//i,
      /terraform\//i,
      /\.gitlab-ci\.yml/i,
    ],
    weight: 2.5,
  },
  TESTING: {
    skills: new Set([
      'vitest',
      'jest',
      'pytest',
      'mocha',
      'cypress',
      'playwright',
      'supertest',
      'junit',
      'testng',
    ]),
    filePatterns: [
      /tests?\//i,
      /__tests__\//i,
      /\.test\.[a-z]+$/i,
      /\.spec\.[a-z]+$/i,
      /_test\.go$/i,
    ],
    weight: 2.5,
  },
  OBSERVABILITY: {
    skills: new Set([
      'pino',
      'winston',
      'opentelemetry',
      'prometheus',
      'grafana',
      'datadog',
      'sentry',
      'jaeger',
    ]),
    filePatterns: [/metrics\//i, /logging\//i, /telemetry\//i, /tracing\//i, /logger\.[a-z]+$/i],
    weight: 2.5,
  },
  CACHING: {
    skills: new Set(['redis', 'memcached', 'lru-cache', 'zustand', 'react-query', 'varnish']),
    filePatterns: [/cache\//i, /caching\//i, /lru\//i],
    weight: 2.5,
  },
  EXTERNAL_INTEGRATIONS: {
    skills: new Set([
      'octokit',
      'stripe',
      'openai',
      'google-cloud',
      'resend',
      'sendgrid',
      'axios',
      'got',
      'undici',
    ]),
    filePatterns: [/integrations?\//i, /clients?\//i, /webhooks?\//i, /sdk\//i],
    weight: 2.5,
  },
  MODULAR_ARCHITECTURE: {
    skills: new Set(['microservices', 'clean-architecture', 'domain-driven-design']),
    filePatterns: [
      /domain\//i,
      /services\//i,
      /packages\//i,
      /modules\//i,
      /pnpm-workspace\.yaml/i,
      /lerna\.json/i,
    ],
    weight: 2.5,
  },
});

// ---------------------------------------------------------------------------
// 3. Helper Functions
// ---------------------------------------------------------------------------

/**
 * Rounds a number to a fixed number of decimal places.
 */
function round(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * Sanitizes and extracts evidence excerpt safely.
 */
function sanitizeExcerpt(excerpt) {
  if (!excerpt || typeof excerpt !== 'string') return null;
  return excerpt
    .trim()
    .replace(/[\r\n\t]+/g, ' ')
    .substring(0, 256);
}

/**
 * Creates a bounded EvidenceRef from an EvidenceNode matching EvidenceRefSchema.
 */
function buildEvidenceRef(evidence, resourceMap = new Map()) {
  const filePath = evidence.sourceLocation?.filePath || 'repository/code';
  const commitSha = evidence.sourceLocation?.commitSha || null;
  const rawRange = evidence.sourceLocation?.lineRange;
  let lineRange = null;

  if (rawRange && typeof rawRange === 'object') {
    const start = rawRange.start ?? rawRange.startLine;
    const end = rawRange.end ?? rawRange.endLine ?? start;
    if (typeof start === 'number' && typeof end === 'number' && start > 0 && end >= start) {
      lineRange = { start, end };
    }
  }

  const resourceId = evidence.resourceId || '00000000-0000-0000-0000-000000000000';
  const resourceName = resourceMap.get(resourceId) || 'Repository';

  return {
    id: evidence.id,
    resourceId,
    resourceName,
    evidenceType: evidence.evidenceType || 'CODE_USAGE',
    filePath,
    commitSha,
    lineRange,
    excerpt: sanitizeExcerpt(evidence.excerpt),
    confidenceScore: round(Math.min(1.0, Math.max(0.0, evidence.confidenceScore ?? 1.0)), 4),
    detectedAt: evidence.detectedAt ? new Date(evidence.detectedAt).toISOString() : undefined,
  };
}

/**
 * Infers deterministic project type from detected skills and files.
 */
function inferProjectType(projectSkills, projectFilePaths) {
  const skillSet = new Set(projectSkills.map((s) => s.slug));
  const files = projectFilePaths.join(' ').toLowerCase();

  if (
    files.includes('pnpm-workspace.yaml') ||
    files.includes('lerna.json') ||
    files.includes('packages/')
  ) {
    return 'MONOREPO';
  }
  if (skillSet.has('terraform') || skillSet.has('kubernetes') || skillSet.has('docker')) {
    if (!skillSet.has('fastify') && !skillSet.has('express') && !skillSet.has('react')) {
      return 'INFRASTRUCTURE';
    }
  }
  if (
    skillSet.has('pandas') ||
    skillSet.has('numpy') ||
    skillSet.has('pytorch') ||
    skillSet.has('tensorflow')
  ) {
    return 'DATA_PROJECT';
  }
  if (
    skillSet.has('fastify') ||
    skillSet.has('express') ||
    skillSet.has('fastapi') ||
    skillSet.has('gin') ||
    skillSet.has('nestjs')
  ) {
    return 'API';
  }
  if (
    skillSet.has('react') ||
    skillSet.has('next-js') ||
    skillSet.has('vue') ||
    skillSet.has('angular')
  ) {
    return 'APPLICATION';
  }
  if (
    skillSet.has('commander') ||
    skillSet.has('yargs') ||
    skillSet.has('click') ||
    files.includes('bin/')
  ) {
    return 'CLI';
  }
  return 'APPLICATION';
}

// ---------------------------------------------------------------------------
// 4. Project Relevance Service Implementation
// ---------------------------------------------------------------------------

export class ProjectRelevanceService {
  /**
   * Computes the relevance score and detailed analysis for a single candidate project against a job description.
   *
   * @param {object} context Trusted tenant context
   * @param {string} context.tenantId Sovereign tenant ID
   * @param {object} jobDescription Normalized JobDescription
   * @param {object} project Candidate project with linked resources and evidence
   * @param {object} [options] Evaluation options
   * @param {Date|string} [options.evaluationDate] Evaluation reference date
   * @returns {object} Validated ProjectRelevance entity
   */
  static computeProjectRelevance(context, jobDescription, project, options = {}) {
    // -------------------------------------------------------------------------
    // A. Multi-Tenant Sovereign Isolation Verification
    // -------------------------------------------------------------------------
    if (!context || !context.tenantId) {
      throw new ValidationError('Trusted tenantId is required in context', 'TENANT_ID_REQUIRED');
    }

    const trustedTenantId = context.tenantId;

    if (!jobDescription || !jobDescription.tenantId) {
      throw new NotFoundError('Job description not found');
    }

    if (jobDescription.tenantId !== trustedTenantId) {
      logger.warn(
        { trustedTenantId, jobTenantId: jobDescription.tenantId },
        'Cross-tenant job description access blocked'
      );
      throw new NotFoundError('Job description not found');
    }

    if (!project || !project.id) {
      throw new NotFoundError('Project not found');
    }

    if (project.tenantId && project.tenantId !== trustedTenantId) {
      logger.warn(
        { trustedTenantId, projectTenantId: project.tenantId },
        'Cross-tenant project access blocked'
      );
      throw new NotFoundError('Project not found');
    }

    // Verify all child resources and evidence belong to the trusted tenant
    const resources = Array.isArray(project.resources) ? project.resources : [];
    const resourceMap = new Map();

    for (const res of resources) {
      if (res.tenantId && res.tenantId !== trustedTenantId) {
        logger.warn(
          { trustedTenantId, resourceTenantId: res.tenantId },
          'Cross-tenant resource access blocked'
        );
        throw new NotFoundError('Project not found');
      }
      if (res.id) {
        resourceMap.set(res.id, res.name || res.displayName || 'Repository');
      }
    }

    const rawEvidence = Array.isArray(project.evidence) ? project.evidence : [];
    for (const ev of rawEvidence) {
      if (ev.tenantId && ev.tenantId !== trustedTenantId) {
        logger.warn(
          { trustedTenantId, evidenceTenantId: ev.tenantId },
          'Cross-tenant evidence access blocked'
        );
        throw new NotFoundError('Project not found');
      }
    }

    // -------------------------------------------------------------------------
    // B. Pre-Indexing & Evidence Extraction (O(N) aggregation)
    // -------------------------------------------------------------------------
    const evaluationDate = options.evaluationDate ? new Date(options.evaluationDate) : new Date();

    // Pool all evidence nodes across project and resources with deduplication
    const evidenceByFingerprint = new Map();
    const allFilePaths = new Set();

    for (const ev of rawEvidence) {
      const fp = `${ev.evidenceType}:${ev.sourceLocation?.filePath || ''}:${ev.sourceLocation?.commitSha || ''}:${ev.excerpt || ''}`;
      if (!evidenceByFingerprint.has(fp)) {
        evidenceByFingerprint.set(fp, ev);
        if (ev.sourceLocation?.filePath) {
          allFilePaths.add(ev.sourceLocation.filePath);
        }
      }
    }

    for (const res of resources) {
      if (Array.isArray(res.evidence)) {
        for (const ev of res.evidence) {
          const fp = `${ev.evidenceType}:${ev.sourceLocation?.filePath || ''}:${ev.sourceLocation?.commitSha || ''}:${ev.excerpt || ''}`;
          if (!evidenceByFingerprint.has(fp)) {
            evidenceByFingerprint.set(fp, ev);
            if (ev.sourceLocation?.filePath) {
              allFilePaths.add(ev.sourceLocation.filePath);
            }
          }
        }
      }
    }

    const pooledEvidence = Array.from(evidenceByFingerprint.values());

    // Extract all canonical skills represented in the project
    const projectSkillsMap = new Map(); // slug -> { skill, bestEvidence, rank }

    for (const ev of pooledEvidence) {
      const rawSkillName =
        ev.metadata?.skillName ||
        ev.metadata?.technology ||
        ev.metadata?.canonicalSkill ||
        ev.metadata?.framework ||
        null;
      if (rawSkillName) {
        const norm = SkillTaxonomyEngine.normalizeSkill(rawSkillName);
        const rank = EVIDENCE_TYPE_RANK[ev.evidenceType] || 99;

        if (!projectSkillsMap.has(norm.canonicalSlug)) {
          projectSkillsMap.set(norm.canonicalSlug, {
            slug: norm.canonicalSlug,
            name: norm.canonicalName,
            category: norm.category,
            bestEvidence: ev,
            bestRank: rank,
            confidence: ev.confidenceScore || 1.0,
            allEvidence: [ev],
          });
        } else {
          const entry = projectSkillsMap.get(norm.canonicalSlug);
          entry.allEvidence.push(ev);
          if (rank < entry.bestRank) {
            entry.bestEvidence = ev;
            entry.bestRank = rank;
            entry.confidence = Math.max(entry.confidence, ev.confidenceScore || 1.0);
          }
        }
      }
    }

    // -------------------------------------------------------------------------
    // C. 1. Requirement Coverage Calculation (50 Pts Max)
    // -------------------------------------------------------------------------
    const jobRequirements = Array.isArray(jobDescription.requirements)
      ? jobDescription.requirements
      : [];
    const eligibleRequirements = jobRequirements.filter(
      (r) => r.category === 'SKILL' || r.category === 'DOMAIN'
    );

    let totalTierWeight = 0;
    let totalCoveredWeight = 0;
    const matchedRequirementIds = [];
    const contributingSkillSlugs = new Set();
    const explanations = [];
    const supportingEvidenceMap = new Map();

    for (const req of eligibleRequirements) {
      // Calculate requirement tier weight
      let tierWeight = 0.5;
      if (req.category === 'DOMAIN') {
        tierWeight = 0.8;
      } else if (req.importance === 'REQUIRED') {
        tierWeight = 1.0;
      } else if (req.importance === 'PREFERRED') {
        tierWeight = (req.weight || 0.5) >= 0.5 ? 0.7 : 0.5;
      } else if (req.importance === 'OPTIONAL') {
        tierWeight = 0.25;
      }

      totalTierWeight += tierWeight;

      let matched = false;
      let relMultiplier = 0.0;
      let matchRelType = 'NONE';
      let matchingSkillSlug = null;
      let matchingEvidence = null;

      if (req.category === 'SKILL') {
        const targetNorm = SkillTaxonomyEngine.normalizeSkill(req.name);
        const targetSlug = targetNorm.canonicalSlug;

        // 1. Direct match
        if (projectSkillsMap.has(targetSlug)) {
          const entry = projectSkillsMap.get(targetSlug);
          // Only qualifying evidence counts (not manual claims)
          if (entry.bestEvidence.evidenceType !== 'DOCUMENT_CLAIM') {
            matched = true;
            relMultiplier = 1.0;
            matchRelType = 'EXACT';
            matchingSkillSlug = targetSlug;
            matchingEvidence = entry.bestEvidence;
          }
        }

        // 2. Taxonomy relationship match (BUILT_ON, PARENT_OF, ECOSYSTEM_OF, IMPLEMENTS)
        if (!matched) {
          for (const [candSlug, entry] of projectSkillsMap.entries()) {
            if (entry.bestEvidence.evidenceType === 'DOCUMENT_CLAIM') continue;

            const relations = SkillTaxonomyEngine.getRelationships(candSlug);
            if (!relations) continue;

            // Check directional relationships
            if (relations.parentOf?.includes(targetSlug)) {
              if (1.0 > relMultiplier) {
                matched = true;
                relMultiplier = 1.0;
                matchRelType = 'PARENT_OF';
                matchingSkillSlug = candSlug;
                matchingEvidence = entry.bestEvidence;
              }
            } else if (relations.builtOn?.includes(targetSlug)) {
              if (0.9 > relMultiplier) {
                matched = true;
                relMultiplier = 0.9;
                matchRelType = 'BUILT_ON';
                matchingSkillSlug = candSlug;
                matchingEvidence = entry.bestEvidence;
              }
            } else if (relations.ecosystemOf?.includes(targetSlug)) {
              if (0.75 > relMultiplier) {
                matched = true;
                relMultiplier = 0.75;
                matchRelType = 'ECOSYSTEM_OF';
                matchingSkillSlug = candSlug;
                matchingEvidence = entry.bestEvidence;
              }
            } else if (relations.implements?.includes(targetSlug)) {
              if (0.5 > relMultiplier) {
                matched = true;
                relMultiplier = 0.5;
                matchRelType = 'IMPLEMENTS';
                matchingSkillSlug = candSlug;
                matchingEvidence = entry.bestEvidence;
              }
            }
          }
        }
      } else if (req.category === 'DOMAIN') {
        // Domain match against project tags, headline, summary, and file structure
        const domainTerm = req.name.toLowerCase();
        const projectText =
          `${project.name || ''} ${project.headline || ''} ${project.summary || ''} ${Array.from(allFilePaths).join(' ')}`.toLowerCase();

        if (projectText.includes(domainTerm)) {
          matched = true;
          relMultiplier = 1.0;
          matchRelType = 'DOMAIN';
          matchingEvidence = pooledEvidence[0] || null;
        }
      }

      if (matched && relMultiplier > 0) {
        const contribution = round(tierWeight * relMultiplier, 4);
        totalCoveredWeight += contribution;
        matchedRequirementIds.push(req.id);
        if (matchingSkillSlug) {
          contributingSkillSlugs.add(matchingSkillSlug);
        }

        const evidRefs = matchingEvidence ? [buildEvidenceRef(matchingEvidence, resourceMap)] : [];
        if (matchingEvidence) {
          supportingEvidenceMap.set(
            matchingEvidence.id,
            buildEvidenceRef(matchingEvidence, resourceMap)
          );
        }

        explanations.push({
          requirementId: req.id,
          skillSlug: matchingSkillSlug,
          contribution: round(contribution * 10, 2),
          relationshipType: matchRelType,
          evidenceRefs: evidRefs,
          reason: `Project demonstrates '${req.name}' via ${matchRelType} ${matchingSkillSlug ? `'${matchingSkillSlug}'` : 'domain context'} (+${round(contribution * 10, 2)} pts)`,
        });
      }
    }

    const requirementCoverageScore =
      totalTierWeight > 0
        ? round(Math.min(50.0, 50.0 * (totalCoveredWeight / totalTierWeight)), 2)
        : 25.0;

    // -------------------------------------------------------------------------
    // D. 2. Architectural Density Calculation (25 Pts Max across 10 dimensions)
    // -------------------------------------------------------------------------
    const detectedDimensions = new Set();
    const projectSkillSlugs = new Set(projectSkillsMap.keys());
    const filePathsList = Array.from(allFilePaths);

    for (const [dimKey, config] of Object.entries(ARCHITECTURAL_DIMENSION_CONFIG)) {
      let isDetected = false;

      // Check skill triggers
      for (const skill of config.skills) {
        if (projectSkillSlugs.has(skill)) {
          isDetected = true;
          break;
        }
      }

      // Check file pattern triggers
      if (!isDetected) {
        for (const filePath of filePathsList) {
          for (const pattern of config.filePatterns) {
            if (pattern.test(filePath)) {
              isDetected = true;
              break;
            }
          }
          if (isDetected) break;
        }
      }

      if (isDetected) {
        detectedDimensions.add(dimKey);
      }
    }

    const architecturalDensityScore = round(Math.min(25.0, detectedDimensions.size * 2.5), 2);

    // -------------------------------------------------------------------------
    // E. 3. Evidence Quality Calculation (15 Pts Max)
    // -------------------------------------------------------------------------
    let evidenceQualityScore = 0.0;
    if (pooledEvidence.length > 0) {
      let totalEvidWeight = 0;
      let validEvidenceCount = 0;

      for (const ev of pooledEvidence) {
        const weight = EVIDENCE_TYPE_WEIGHTS[ev.evidenceType] ?? 0.5;
        const conf = ev.confidenceScore ?? 1.0;
        totalEvidWeight += weight * conf;
        validEvidenceCount++;
      }

      if (validEvidenceCount > 0) {
        const avgQuality = totalEvidWeight / validEvidenceCount;
        evidenceQualityScore = round(Math.min(15.0, 15.0 * avgQuality), 2);
      }
    }

    // -------------------------------------------------------------------------
    // F. 4. Project Completeness Calculation (5 Pts Max)
    // -------------------------------------------------------------------------
    let completenessSum = 0.0;

    // 1. Tests presence (+1.5)
    if (detectedDimensions.has('TESTING')) {
      completenessSum += 1.5;
    }

    // 2. README documentation > 200 chars (+1.5)
    const hasReadme = pooledEvidence.some(
      (ev) =>
        ev.evidenceType === 'README_SPECIFICATION' ||
        (ev.sourceLocation?.filePath && /readme\.md/i.test(ev.sourceLocation.filePath))
    );
    const summaryLength = (project.summary || '').length;
    if (hasReadme || summaryLength >= 200) {
      completenessSum += 1.5;
    }

    // 3. CI/CD automation (+1.0)
    if (detectedDimensions.has('CLOUD_DEVOPS')) {
      completenessSum += 1.0;
    }

    // 4. Clean build / start scripts in manifests (+1.0)
    const hasManifest = pooledEvidence.some(
      (ev) =>
        ev.evidenceType === 'PACKAGE_MANIFEST_DEPENDENCY' ||
        ev.evidenceType === 'CONFIG_SYNTAX_DECLARATION'
    );
    if (hasManifest) {
      completenessSum += 1.0;
    }

    const projectCompletenessScore = round(Math.min(5.0, completenessSum), 2);

    // -------------------------------------------------------------------------
    // G. 5. Activity Recency Calculation (5 Pts Max)
    // -------------------------------------------------------------------------
    let recencyScore = 0.0;
    const projectDateStr =
      project.updatedAt || project.endDate || project.startDate || project.createdAt || null;

    if (projectDateStr) {
      const projectDate = new Date(projectDateStr);
      if (!Number.isNaN(projectDate.getTime())) {
        const ageInMonths =
          (evaluationDate.getTime() - projectDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
        if (ageInMonths <= 6) {
          recencyScore = 5.0;
        } else if (ageInMonths <= 18) {
          recencyScore = 3.0;
        } else if (ageInMonths <= 36) {
          recencyScore = 1.5;
        } else {
          recencyScore = 0.0;
        }
      }
    }

    // -------------------------------------------------------------------------
    // H. Composite Score & Relevance Band
    // -------------------------------------------------------------------------
    const totalScore = round(
      Math.min(
        100.0,
        Math.max(
          0.0,
          requirementCoverageScore +
            architecturalDensityScore +
            evidenceQualityScore +
            projectCompletenessScore +
            recencyScore
        )
      ),
      2
    );

    let relevanceBand = 'MINIMAL';
    if (totalScore >= 75.0) {
      relevanceBand = 'HIGH';
    } else if (totalScore >= 50.0) {
      relevanceBand = 'MEDIUM';
    } else if (totalScore >= 25.0) {
      relevanceBand = 'LOW';
    }

    // -------------------------------------------------------------------------
    // I. Top Supporting Evidence Selection (Max 5, Sorted by Rank)
    // -------------------------------------------------------------------------
    const allSupportingRefs = Array.from(supportingEvidenceMap.values());
    if (allSupportingRefs.length < 5) {
      for (const ev of pooledEvidence) {
        if (!supportingEvidenceMap.has(ev.id) && ev.evidenceType !== 'DOCUMENT_CLAIM') {
          allSupportingRefs.push(buildEvidenceRef(ev, resourceMap));
          if (allSupportingRefs.length >= 5) break;
        }
      }
    }

    allSupportingRefs.sort((a, b) => {
      const rankA = EVIDENCE_TYPE_RANK[a.evidenceType] || 99;
      const rankB = EVIDENCE_TYPE_RANK[b.evidenceType] || 99;
      if (rankA !== rankB) return rankA - rankB;
      if (b.confidenceScore !== a.confidenceScore) return b.confidenceScore - a.confidenceScore;
      return a.filePath.localeCompare(b.filePath);
    });

    const topSupportingEvidence = allSupportingRefs.slice(0, 5);

    // -------------------------------------------------------------------------
    // J. Confidence Calculation & Explanation Summary
    // -------------------------------------------------------------------------
    const coverageRatio = totalTierWeight > 0 ? totalCoveredWeight / totalTierWeight : 0.5;
    const avgEvidConf =
      topSupportingEvidence.length > 0
        ? topSupportingEvidence.reduce((acc, e) => acc + e.confidenceScore, 0) /
          topSupportingEvidence.length
        : 0.5;

    const confidence = round(
      Math.min(1.0, Math.max(0.0, 0.6 * coverageRatio + 0.4 * avgEvidConf)),
      4
    );

    const projectType = inferProjectType(Array.from(projectSkillsMap.values()), filePathsList);

    const topSkillsStr =
      Array.from(contributingSkillSlugs).slice(0, 4).join(', ') || 'general engineering';
    const mainExplanation = `${relevanceBand} relevance (${totalScore}/100): Covers ${matchedRequirementIds.length} requirement(s) via ${topSkillsStr}. Demonstrates ${detectedDimensions.size} architectural dimension(s) in project '${project.name}'.`;

    const result = {
      projectId: project.id,
      projectName: project.name,
      projectSlug: project.slug,
      projectType,
      relevanceScore: totalScore,
      relevanceBand,
      scoreBreakdown: {
        requirementCoverageScore,
        architecturalDensityScore,
        evidenceQualityScore,
        projectCompletenessScore,
        recencyScore,
        totalScore,
      },
      matchedRequirementIds,
      contributingSkills: Array.from(contributingSkillSlugs).sort(),
      architecturalSignals: Array.from(detectedDimensions).sort(),
      supportingEvidence: topSupportingEvidence,
      explanations,
      explanation: mainExplanation,
      confidence,
      resourcesCount: resources.length > 0 ? resources.length : 1,
    };

    return ProjectRelevanceSchema.parse(result);
  }

  /**
   * Computes and ranks project relevance across multiple candidate projects.
   *
   * @param {object} context Trusted tenant context
   * @param {string} context.tenantId Sovereign tenant ID
   * @param {object} jobDescription Normalized JobDescription
   * @param {Array<object>} projects Candidate projects
   * @param {object} [options] Evaluation options
   * @returns {object} Validated CandidateProjectRelevanceAnalysis
   */
  static computeProjectsRelevance(context, jobDescription, projects, options = {}) {
    if (!context || !context.tenantId) {
      throw new ValidationError('Trusted tenantId is required in context', 'TENANT_ID_REQUIRED');
    }

    if (!jobDescription || !jobDescription.id || !jobDescription.tenantId) {
      throw new NotFoundError('Job description not found');
    }

    if (jobDescription.tenantId !== context.tenantId) {
      throw new NotFoundError('Job description not found');
    }

    const candidateId =
      options.candidateId || projects[0]?.candidateId || '00000000-0000-0000-0000-000000000000';
    const projectList = Array.isArray(projects) ? projects : [];

    const projectRankings = projectList.map((p) =>
      this.computeProjectRelevance(context, jobDescription, p, options)
    );

    // Stably sort rankings by relevanceScore descending, tie-break by projectId
    projectRankings.sort((a, b) => {
      if (b.relevanceScore !== a.relevanceScore) {
        return b.relevanceScore - a.relevanceScore;
      }
      return a.projectId.localeCompare(b.projectId);
    });

    let highCount = 0;
    let medCount = 0;
    let lowCount = 0;
    let minCount = 0;
    let scoreSum = 0;

    for (const r of projectRankings) {
      scoreSum += r.relevanceScore;
      if (r.relevanceBand === 'HIGH') highCount++;
      else if (r.relevanceBand === 'MEDIUM') medCount++;
      else if (r.relevanceBand === 'LOW') lowCount++;
      else minCount++;
    }

    const avgScore = projectRankings.length > 0 ? round(scoreSum / projectRankings.length, 2) : 0.0;

    const analysis = {
      jobDescriptionId: jobDescription.id,
      candidateId,
      tenantId: context.tenantId,
      projectRankings,
      topProject: projectRankings.length > 0 ? projectRankings[0] : null,
      summary: {
        totalProjectsEvaluated: projectRankings.length,
        highRelevanceCount: highCount,
        mediumRelevanceCount: medCount,
        lowRelevanceCount: lowCount,
        minimalRelevanceCount: minCount,
        averageProjectScore: avgScore,
      },
      analyzedAt: (options.evaluationDate
        ? new Date(options.evaluationDate)
        : new Date()
      ).toISOString(),
    };

    return CandidateProjectRelevanceAnalysisSchema.parse(analysis);
  }
}

/**
 * Functional export aliases for seamless integration.
 */
export const computeProjectRelevance = (context, jobDescription, project, options) =>
  ProjectRelevanceService.computeProjectRelevance(context, jobDescription, project, options);

export const computeProjectsRelevance = (context, jobDescription, projects, options) =>
  ProjectRelevanceService.computeProjectsRelevance(context, jobDescription, projects, options);
