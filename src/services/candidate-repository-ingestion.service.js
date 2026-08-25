/**
 * @file Candidate Repository Ingestion Service (P5/Pipeline Fix)
 *
 * Orchestrates the complete repository synchronization pipeline:
 * Connected Resource → Deep Evidence Extraction → Project Genesis →
 * Project-Resource Linking → Evidence Association → Verified Skill Rollup
 *
 * Strict Invariants:
 * - Multi-tenant isolation: every query scoped to context.tenantId
 * - Idempotent: running twice produces identical state, no duplicates
 * - ARCH-007 compliant: 1 Resource ≠ 1 Project (project identity by slug)
 * - Zero credential leakage in output
 * - Zero code execution against repository contents
 * - Evidence-first: never invents skills, projects, or claims
 */

import { eq, and, isNull } from 'drizzle-orm';
import { db as defaultDb } from '../db/index.js';
import {
  candidates,
  resources,
  resourceConnections,
  projects,
  projectResources,
  skills,
  evidenceItems,
  candidateSkills,
} from '../db/schema.js';
import { NotFoundError, ValidationError } from '../errors/index.js';
import { logger } from '../utils/logger.js';
import { decryptSecret } from '../security/encryption.js';
import { connectorRegistry } from '../connectors/registry/connector-registry.js';
import { createConnectorContext } from '../connectors/base/context.js';
import { GitHubAppConnector } from '../connectors/github/github-connector.js';
import { GitHubAppAuthManager } from '../connectors/github/auth.js';
import { config } from '../config/env.js';
import { GitHubEvidenceExtractorService } from '../extractors/github/github-evidence-extractor.js';
import { SkillRollupCalculator } from '../extractors/github/skill-rollup.js';

export class CandidateRepositoryIngestionService {
  /**
   * @param {object} [opts]
   * @param {import('drizzle-orm/node-postgres').NodePgDatabase} [opts.db] - Database instance
   * @param {import('../connectors/registry/connector-registry.js').ConnectorRegistry} [opts.registry] - Connector registry
   * @param {GitHubEvidenceExtractorService} [opts.extractor] - Evidence extractor service
   */
  constructor(opts = {}) {
    this.db = opts.db || defaultDb;
    this.registry = opts.registry || connectorRegistry;
    this.extractor = opts.extractor || new GitHubEvidenceExtractorService();

    // Auto-register GITHUB_APP connector if environment has GitHub App credentials
    if (
      config.GITHUB_APP_ID &&
      (config.GITHUB_APP_PRIVATE_KEY || config.GITHUB_APP_PRIVATE_KEY_BASE64) &&
      !this.registry.has('GITHUB_APP')
    ) {
      const authManager = new GitHubAppAuthManager({
        appId: config.GITHUB_APP_ID,
        privateKey: config.GITHUB_APP_PRIVATE_KEY,
        privateKeyBase64: config.GITHUB_APP_PRIVATE_KEY_BASE64,
      });
      this.registry.register(
        'GITHUB_APP',
        new GitHubAppConnector({
          authManager,
        })
      );
    }
  }

  /**
   * Synchronizes all (or a specific) GitHub repository resources for a candidate.
   *
   * Pipeline:
   * 1. Discover active GITHUB_APP resources for candidate
   * 2. Decrypt connection credentials
   * 3. Execute deep evidence extraction (manifests, imports, configs, commits, README)
   * 4. Create/update project from repository metadata (idempotent by slug)
   * 5. Create/update project_resources link
   * 6. Associate evidence_items with project
   * 7. Recalculate candidate_skills rollups
   * 8. Return sanitized summary
   *
   * @param {object} params
   * @param {{ tenantId: string, userId?: string }} params.context - Trusted request context
   * @param {string} params.candidateId - Target candidate UUID
   * @param {object} [params.options]
   * @param {string} [params.options.resourceId] - Optional specific resource to sync
   * @returns {Promise<SyncSummary>}
   *
   * @typedef {object} SyncSummary
   * @property {number} repositoriesProcessed
   * @property {number} projectsCreated
   * @property {number} projectsUpdated
   * @property {number} evidenceCreated
   * @property {number} evidenceLinked
   * @property {number} verifiedSkillsAdded
   * @property {string[]} verifiedSkills
   * @property {string[]} warnings
   * @property {number} durationMs
   */
  async syncCandidateRepositories({ context, candidateId, options = {} }) {
    const startTime = Date.now();

    // -------------------------------------------------------------------------
    // 1. Validate Context & Tenant Isolation
    // -------------------------------------------------------------------------
    if (!context || !context.tenantId) {
      throw new ValidationError('Trusted context with tenantId is required');
    }
    if (!candidateId) {
      throw new ValidationError('candidateId is required');
    }

    const tenantId = context.tenantId;

    // Verify candidate belongs to tenant
    const [candidate] = await this.db
      .select()
      .from(candidates)
      .where(and(eq(candidates.id, candidateId), eq(candidates.tenantId, tenantId)));

    if (!candidate) {
      throw new NotFoundError(`Candidate not found in tenant scope: ${candidateId}`);
    }

    // -------------------------------------------------------------------------
    // 2. Discover Active GitHub Resources
    // -------------------------------------------------------------------------
    const resourceConditions = [
      eq(resources.tenantId, tenantId),
      eq(resources.candidateId, candidateId),
      eq(resources.provider, 'GITHUB_APP'),
      eq(resources.status, 'ACTIVE'),
    ];

    if (options.resourceId) {
      resourceConditions.push(eq(resources.id, options.resourceId));
    }

    const activeResources = await this.db
      .select()
      .from(resources)
      .where(and(...resourceConditions));

    if (activeResources.length === 0) {
      return this._buildSummary({
        startTime,
        warnings: ['No active GITHUB_APP resources found for candidate'],
      });
    }

    logger.info(
      { tenantId, candidateId, resourceCount: activeResources.length },
      'Starting candidate repository ingestion sync'
    );

    // -------------------------------------------------------------------------
    // 3. Process Each Resource
    // -------------------------------------------------------------------------
    const summary = {
      repositoriesProcessed: 0,
      projectsCreated: 0,
      projectsUpdated: 0,
      evidenceCreated: 0,
      evidenceLinked: 0,
      verifiedSkillsAdded: 0,
      verifiedSkills: [],
      warnings: [],
    };

    for (const resource of activeResources) {
      try {
        const result = await this._processResource({
          context,
          tenantId,
          candidateId,
          resource,
        });

        summary.repositoriesProcessed++;
        summary.projectsCreated += result.projectCreated ? 1 : 0;
        summary.projectsUpdated += result.projectUpdated ? 1 : 0;
        summary.evidenceCreated += result.evidenceCreated;
        summary.evidenceLinked += result.evidenceLinked;
      } catch (err) {
        logger.warn(
          { err: err.message, resourceId: resource.id, resourceName: resource.name },
          'Failed to process repository resource; continuing with remaining resources'
        );
        summary.warnings.push(`Failed to process ${resource.name}: ${err.message}`);
      }
    }

    // -------------------------------------------------------------------------
    // 4. Recalculate ALL Candidate Skill Rollups (Post-Extraction)
    // -------------------------------------------------------------------------
    try {
      const rollupResult = await this._recalculateSkillRollups({
        tenantId,
        candidateId,
      });
      summary.verifiedSkillsAdded = rollupResult.verifiedSkillsAdded;
      summary.verifiedSkills = rollupResult.verifiedSkills;
    } catch (err) {
      logger.warn(
        { err: err.message, candidateId },
        'Skill rollup recalculation encountered an error'
      );
      summary.warnings.push(`Skill rollup error: ${err.message}`);
    }

    const durationMs = Date.now() - startTime;

    logger.info(
      {
        tenantId,
        candidateId,
        ...summary,
        durationMs,
      },
      'Candidate repository ingestion sync completed'
    );

    return {
      ...summary,
      durationMs,
    };
  }

  /**
   * Processes a single repository resource through the ingestion pipeline.
   *
   * @private
   * @param {object} params
   * @param {object} params.context
   * @param {string} params.tenantId
   * @param {string} params.candidateId
   * @param {object} params.resource
   * @returns {Promise<{ projectCreated: boolean, projectUpdated: boolean, evidenceCreated: number, evidenceLinked: number }>}
   */
  async _processResource({ context, tenantId, candidateId, resource }) {
    // A. Resolve Connection & Credentials
    if (!resource.connectionId) {
      throw new ValidationError(`Resource ${resource.name} has no associated connection`);
    }

    const [connection] = await this.db
      .select()
      .from(resourceConnections)
      .where(
        and(
          eq(resourceConnections.id, resource.connectionId),
          eq(resourceConnections.tenantId, tenantId)
        )
      );

    if (!connection) {
      throw new NotFoundError(`Connection not found for resource ${resource.name}`);
    }

    if (connection.status !== 'ACTIVE') {
      throw new ValidationError(
        `Connection for resource ${resource.name} is ${connection.status}, not ACTIVE`
      );
    }

    // Transiently decrypt credentials
    let credentials;
    try {
      const decryptedString = decryptSecret(connection.encryptedCredentials);
      credentials = JSON.parse(decryptedString);
    } catch {
      throw new ValidationError(`Failed to decrypt credentials for resource ${resource.name}`);
    }

    // B. Resolve Connector
    const connector = this.registry.get(resource.provider);

    // C. Build Connector Context
    const connectorContext = createConnectorContext({
      tenantId,
      userId: context.userId || connection.userId,
      connectionId: connection.id,
      provider: connection.provider,
      authType: connection.authType,
      scopes: connection.scopes || [],
      requestId: context.requestId,
    });

    // D. Execute Deep Evidence Extraction
    const extractionResult = await this.extractor.extractRepositoryEvidence({
      context: connectorContext,
      candidateId,
      resourceId: resource.id,
      connector,
      credentials,
    });

    logger.info(
      {
        tenantId,
        candidateId,
        resourceId: resource.id,
        resourceName: resource.name,
        evidenceCount: extractionResult.evidenceCount,
        skillsCount: extractionResult.skillsCount,
      },
      'Evidence extraction completed for resource'
    );

    // E. Project Genesis (Idempotent)
    const projectResult = await this._ensureProject({
      tenantId,
      candidateId,
      resource,
    });

    // F. Link Evidence to Project
    const evidenceLinked = await this._linkEvidenceToProject({
      tenantId,
      candidateId,
      resourceId: resource.id,
      projectId: projectResult.projectId,
    });

    // G. Ensure Project-Resource Association
    await this._ensureProjectResource({
      tenantId,
      projectId: projectResult.projectId,
      resourceId: resource.id,
    });

    return {
      projectCreated: projectResult.created,
      projectUpdated: projectResult.updated,
      evidenceCreated: extractionResult.evidenceCount,
      evidenceLinked,
    };
  }

  /**
   * Idempotent project genesis from repository metadata.
   * Uses a deterministic slug derived from resource name.
   * Respects ARCH-007: 1 Resource ≠ 1 Project.
   *
   * @private
   * @param {object} params
   * @param {string} params.tenantId
   * @param {string} params.candidateId
   * @param {object} params.resource
   * @returns {Promise<{ projectId: string, created: boolean, updated: boolean }>}
   */
  async _ensureProject({ tenantId, candidateId, resource }) {
    const slug = this._deriveProjectSlug(resource.name);
    const projectName = resource.displayName || resource.name;

    // Derive headline and summary from resource metadata
    const headline = resource.metadata?.description || null;
    const summary = this._buildProjectSummary(resource);

    // Check for existing project by unique constraint (tenantId, candidateId, slug)
    const [existing] = await this.db
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.tenantId, tenantId),
          eq(projects.candidateId, candidateId),
          eq(projects.slug, slug)
        )
      );

    if (existing) {
      // Update only system-inferred fields; never overwrite user-authored narrative
      const updates = {};
      let needsUpdate = false;

      if (!existing.headline && headline) {
        updates.headline = headline;
        needsUpdate = true;
      }
      if (!existing.summary && summary) {
        updates.summary = summary;
        needsUpdate = true;
      }

      if (needsUpdate) {
        updates.updatedAt = new Date();
        await this.db.update(projects).set(updates).where(eq(projects.id, existing.id));
      }

      return { projectId: existing.id, created: false, updated: needsUpdate };
    }

    // Create new project
    const [created] = await this.db
      .insert(projects)
      .values({
        tenantId,
        candidateId,
        name: projectName,
        slug,
        headline,
        summary,
        isHighlighted: true,
        metadata: {
          sourceProvider: resource.provider,
          sourceResourceId: resource.id,
          sourceUrl: resource.url || null,
          isPrivate: resource.isPrivate,
          autoGenerated: true,
        },
      })
      .returning();

    logger.info(
      { tenantId, candidateId, projectId: created.id, slug },
      'Project genesis: created new project from repository'
    );

    return { projectId: created.id, created: true, updated: false };
  }

  /**
   * Associates all unlinked evidence items for a resource with a project.
   *
   * @private
   * @param {object} params
   * @param {string} params.tenantId
   * @param {string} params.candidateId
   * @param {string} params.resourceId
   * @param {string} params.projectId
   * @returns {Promise<number>} Count of evidence items linked
   */
  async _linkEvidenceToProject({ tenantId, candidateId, resourceId, projectId }) {
    // Find all evidence items for this resource that don't have a projectId
    const unlinked = await this.db
      .select({ id: evidenceItems.id })
      .from(evidenceItems)
      .where(
        and(
          eq(evidenceItems.tenantId, tenantId),
          eq(evidenceItems.candidateId, candidateId),
          eq(evidenceItems.resourceId, resourceId),
          isNull(evidenceItems.projectId)
        )
      );

    if (unlinked.length === 0) {
      return 0;
    }

    // Bulk update projectId
    for (const item of unlinked) {
      await this.db.update(evidenceItems).set({ projectId }).where(eq(evidenceItems.id, item.id));
    }

    logger.info(
      { tenantId, candidateId, resourceId, projectId, linkedCount: unlinked.length },
      'Linked unlinked evidence items to project'
    );

    return unlinked.length;
  }

  /**
   * Ensures a project_resources join record exists.
   *
   * @private
   * @param {object} params
   * @param {string} params.tenantId
   * @param {string} params.projectId
   * @param {string} params.resourceId
   */
  async _ensureProjectResource({ tenantId, projectId, resourceId }) {
    const [existing] = await this.db
      .select()
      .from(projectResources)
      .where(
        and(eq(projectResources.projectId, projectId), eq(projectResources.resourceId, resourceId))
      );

    if (existing) {
      return; // Already linked
    }

    await this.db.insert(projectResources).values({
      tenantId,
      projectId,
      resourceId,
      roleInProject: 'Primary Repository',
    });

    logger.info({ tenantId, projectId, resourceId }, 'Created project_resources association');
  }

  /**
   * Recalculates candidate_skills rollups from current evidence state.
   * This ensures VERIFIED status is assigned when manifest/code evidence
   * meets the confidence threshold.
   *
   * @private
   * @param {object} params
   * @param {string} params.tenantId
   * @param {string} params.candidateId
   * @returns {Promise<{ verifiedSkillsAdded: number, verifiedSkills: string[] }>}
   */
  async _recalculateSkillRollups({ tenantId, candidateId }) {
    // Fetch all evidence items for this candidate
    const allEvidence = await this.db
      .select()
      .from(evidenceItems)
      .where(and(eq(evidenceItems.tenantId, tenantId), eq(evidenceItems.candidateId, candidateId)));

    // Group by skillId
    const evidenceBySkillId = new Map();
    for (const item of allEvidence) {
      if (!item.skillId) continue;
      if (!evidenceBySkillId.has(item.skillId)) {
        evidenceBySkillId.set(item.skillId, []);
      }
      evidenceBySkillId.get(item.skillId).push(item);
    }

    let verifiedSkillsAdded = 0;
    const verifiedSkills = [];

    // Fetch current candidate_skills
    const currentSkills = await this.db
      .select()
      .from(candidateSkills)
      .where(
        and(eq(candidateSkills.tenantId, tenantId), eq(candidateSkills.candidateId, candidateId))
      );

    const currentBySkillId = new Map(currentSkills.map((s) => [s.skillId, s]));

    for (const [skillId, items] of evidenceBySkillId.entries()) {
      const rollup = SkillRollupCalculator.calculateRollup(items);
      const current = currentBySkillId.get(skillId);

      if (current) {
        const wasVerified = current.provenanceStatus === 'VERIFIED';
        const isNowVerified = rollup.provenanceStatus === 'VERIFIED';

        await this.db
          .update(candidateSkills)
          .set({
            provenanceStatus: rollup.provenanceStatus,
            confidenceScore: rollup.confidenceScore,
            evidenceCount: rollup.evidenceCount,
            firstObservedAt: rollup.firstObservedAt,
            lastObservedAt: rollup.lastObservedAt,
            updatedAt: new Date(),
          })
          .where(eq(candidateSkills.id, current.id));

        if (!wasVerified && isNowVerified) {
          verifiedSkillsAdded++;
          // We'll resolve the skill name below
        }

        if (isNowVerified) {
          verifiedSkills.push(skillId);
        }
      }
    }

    // Resolve skill names for verified skills
    const verifiedSkillNames = [];
    for (const skillId of verifiedSkills) {
      const [skill] = await this.db
        .select({ name: skills.name })
        .from(skills)
        .where(eq(skills.id, skillId));
      if (skill) {
        verifiedSkillNames.push(skill.name);
      }
    }

    return {
      verifiedSkillsAdded,
      verifiedSkills: verifiedSkillNames,
    };
  }

  /**
   * Derives a deterministic, URL-safe project slug from a repository name.
   *
   * @private
   * @param {string} name - Repository name (e.g., "Ai-job-mcp")
   * @returns {string} Slug (e.g., "ai-job-mcp")
   */
  _deriveProjectSlug(name) {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * Builds a safe project summary from resource metadata.
   *
   * @private
   * @param {object} resource
   * @returns {string|null}
   */
  _buildProjectSummary(resource) {
    const parts = [];

    if (resource.metadata?.description) {
      parts.push(resource.metadata.description);
    }

    if (resource.metadata?.language) {
      parts.push(`Primary language: ${resource.metadata.language}`);
    }

    if (resource.url) {
      parts.push(`Repository: ${resource.url}`);
    }

    return parts.length > 0 ? parts.join('. ') : null;
  }

  /**
   * Builds a standardized sync summary.
   *
   * @private
   * @param {object} params
   * @param {number} params.startTime
   * @param {string[]} [params.warnings]
   * @returns {SyncSummary}
   */
  _buildSummary({ startTime, warnings = [] }) {
    return {
      repositoriesProcessed: 0,
      projectsCreated: 0,
      projectsUpdated: 0,
      evidenceCreated: 0,
      evidenceLinked: 0,
      verifiedSkillsAdded: 0,
      verifiedSkills: [],
      warnings,
      durationMs: Date.now() - startTime,
    };
  }
}
