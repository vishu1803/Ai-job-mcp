/**
 * @file MCP Career Resources & Resource Templates Registration (P14-004D / ARCH-056).
 *
 * Exposes canonical read-only MCP resources & templates (2026-07-28 Standard):
 * Static Resources:
 * 1. career://profile - Authenticated candidate profile and career preferences
 * 2. career://skills - Candidate verified skills with evidence links
 * 3. career://connections - Status of connected repositories and AI providers
 *
 * Resource Templates:
 * 4. career://projects/{projectId} - Deep project inspection with linked evidence
 * 5. career://evidence/{evidenceId} - Commit-pinned AST evidence details
 * 6. career://jobs/{jobId} - Normalized target job posting details
 * 7. career://applications/{applicationId} - Tracked application dossier & timeline
 */

import { eq, and, desc } from 'drizzle-orm';
import { db as defaultDb } from '../../db/index.js';
import {
  projects,
  projectResources,
  evidenceItems,
  skills,
  resources,
  jobApplications,
  applicationStages,
  tailoredDocuments,
} from '../../db/schema.js';
import { CandidateProfileService } from '../../services/candidate-profile.service.js';
import { JobDiscoveryService } from '../../services/job-discovery.service.js';
import { NotFoundError, ValidationError } from '../../errors/index.js';

export function registerCareerResources(server, deps = {}) {
  const db = deps.database || deps.db || defaultDb;
  const profileService = deps.profileService || new CandidateProfileService(db);
  const jobDiscoveryService = deps.jobDiscoveryService || new JobDiscoveryService();

  // Helper to resolve candidate ID from context
  async function resolveCandidateId(context) {
    if (context.candidateId) return context.candidateId;
    const list = await profileService.listCandidates(context, { limit: 1 });
    if (list.candidates && list.candidates.length > 0) {
      return list.candidates[0].id;
    }
    throw new NotFoundError('No candidate profile associated with active session or tenant');
  }

  // 1. career://profile
  server.registerResource(
    {
      name: 'Candidate Career Profile',
      uri: 'career://profile',
      description:
        'Live candidate career profile, target roles, preferred locations, compensation floor, and verified skills summary.',
      mimeType: 'application/json',
      requiredScopes: ['career:read'],
      requiredRole: 'READONLY',
    },
    async (context) => {
      const candidateId = await resolveCandidateId(context);
      return await profileService.getCareerProfile(context, candidateId);
    }
  );

  // 2. career://skills
  server.registerResource(
    {
      name: 'Candidate Verified Skills',
      uri: 'career://skills',
      description:
        'List of all verified and claimed candidate skills with provenance, AST evidence references, and confidence scores.',
      mimeType: 'application/json',
      requiredScopes: ['career:read'],
      requiredRole: 'READONLY',
    },
    async (context) => {
      const candidateId = await resolveCandidateId(context);
      return await profileService.listSkillsWithEvidence(context, candidateId, {
        limit: 100,
      });
    }
  );

  // 3. career://connections
  server.registerResource(
    {
      name: 'Candidate Connected Resources',
      uri: 'career://connections',
      description:
        'Overview of connected GitHub repositories, source synchronization status, and active AI connections.',
      mimeType: 'application/json',
      requiredScopes: ['career:read'],
      requiredRole: 'READONLY',
    },
    async (context) => {
      const candidateId = await resolveCandidateId(context);
      const profile = await profileService.getProfile(context, candidateId);
      return {
        candidateId,
        connectedResources: profile.resources || [],
        identities: profile.identities || [],
      };
    }
  );

  // 4. career://projects/{projectId}
  server.registerResource(
    {
      name: 'Candidate Project Details',
      uri: 'career://projects/{projectId}',
      description:
        'Deep architectural details, linked GitHub repositories, and verified AST evidence for a specific candidate project.',
      mimeType: 'application/json',
      requiredScopes: ['career:read'],
      requiredRole: 'READONLY',
    },
    async (context, uri, params = {}) => {
      const projectId = params.projectId || String(uri).split('/').pop();
      if (!projectId || !/^[0-9a-f-]{36}$/i.test(projectId)) {
        throw new ValidationError('Invalid projectId format in resource URI');
      }

      const [proj] = await db
        .select()
        .from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.tenantId, context.tenantId)));

      if (!proj) {
        throw new NotFoundError(`Project not found: ${projectId}`);
      }

      // Fetch linked project resources and evidence
      const linkedRes = await db
        .select({
          resourceId: resources.id,
          name: resources.name,
          displayName: resources.displayName,
          url: resources.url,
          provider: resources.provider,
        })
        .from(projectResources)
        .innerJoin(resources, eq(projectResources.resourceId, resources.id))
        .where(
          and(
            eq(projectResources.tenantId, context.tenantId),
            eq(projectResources.projectId, projectId)
          )
        );

      const evRows = await db
        .select({
          id: evidenceItems.id,
          evidenceType: evidenceItems.evidenceType,
          sourceLocation: evidenceItems.sourceLocation,
          excerpt: evidenceItems.excerpt,
          confidenceScore: evidenceItems.confidenceScore,
          detectedAt: evidenceItems.detectedAt,
          skillSlug: skills.slug,
          skillName: skills.name,
        })
        .from(evidenceItems)
        .leftJoin(skills, eq(evidenceItems.skillId, skills.id))
        .where(
          and(eq(evidenceItems.tenantId, context.tenantId), eq(evidenceItems.projectId, projectId))
        )
        .orderBy(desc(evidenceItems.confidenceScore));

      return {
        id: proj.id,
        candidateId: proj.candidateId,
        name: proj.name,
        slug: proj.slug,
        headline: proj.headline,
        summary: proj.summary,
        role: proj.role,
        isHighlighted: proj.isHighlighted,
        startDate: proj.startDate ? String(proj.startDate) : null,
        endDate: proj.endDate ? String(proj.endDate) : null,
        connectedResources: linkedRes,
        evidence: evRows,
        metadata: proj.metadata || {},
      };
    }
  );

  // 5. career://evidence/{evidenceId}
  server.registerResource(
    {
      name: 'Verified AST Evidence Item',
      uri: 'career://evidence/{evidenceId}',
      description:
        'Commit-pinned AST evidence item details, code snippet excerpts, line numbers, and confidence scoring.',
      mimeType: 'application/json',
      requiredScopes: ['career:read'],
      requiredRole: 'READONLY',
    },
    async (context, uri, params = {}) => {
      const evidenceId = params.evidenceId || String(uri).split('/').pop();
      if (!evidenceId || !/^[0-9a-f-]{36}$/i.test(evidenceId)) {
        throw new ValidationError('Invalid evidenceId format in resource URI');
      }

      const [ev] = await db
        .select({
          id: evidenceItems.id,
          candidateId: evidenceItems.candidateId,
          projectId: evidenceItems.projectId,
          resourceId: evidenceItems.resourceId,
          evidenceType: evidenceItems.evidenceType,
          sourceProvider: evidenceItems.sourceProvider,
          sourceLocation: evidenceItems.sourceLocation,
          excerpt: evidenceItems.excerpt,
          confidenceScore: evidenceItems.confidenceScore,
          detectedAt: evidenceItems.detectedAt,
          metadata: evidenceItems.metadata,
          skillSlug: skills.slug,
          skillName: skills.name,
          resourceDisplayName: resources.displayName,
          resourceUrl: resources.url,
        })
        .from(evidenceItems)
        .leftJoin(skills, eq(evidenceItems.skillId, skills.id))
        .leftJoin(resources, eq(evidenceItems.resourceId, resources.id))
        .where(and(eq(evidenceItems.id, evidenceId), eq(evidenceItems.tenantId, context.tenantId)));

      if (!ev) {
        throw new NotFoundError(`Evidence item not found: ${evidenceId}`);
      }

      return {
        id: ev.id,
        candidateId: ev.candidateId,
        projectId: ev.projectId,
        skillSlug: ev.skillSlug,
        skillName: ev.skillName,
        evidenceType: ev.evidenceType,
        sourceProvider: ev.sourceProvider,
        sourceLocation: ev.sourceLocation,
        excerpt: ev.excerpt,
        confidenceScore: ev.confidenceScore,
        resourceDisplayName: ev.resourceDisplayName || null,
        resourceUrl: ev.resourceUrl || null,
        detectedAt: ev.detectedAt ? new Date(ev.detectedAt).toISOString() : null,
        metadata: ev.metadata || {},
      };
    }
  );

  // 6. career://jobs/{jobId}
  server.registerResource(
    {
      name: 'Job Posting Dossier',
      uri: 'career://jobs/{jobId}',
      description:
        'Target job posting dossier including company, role title, required skills, compensation, and direct application portal link.',
      mimeType: 'application/json',
      requiredScopes: ['career:read'],
      requiredRole: 'READONLY',
    },
    async (context, uri, params = {}) => {
      const jobId = params.jobId || String(uri).split('/').pop();
      if (!jobId) {
        throw new ValidationError('Invalid jobId in resource URI');
      }

      return await jobDiscoveryService.getJobPosting(context, jobId);
    }
  );

  // 7. career://applications/{applicationId}
  server.registerResource(
    {
      name: 'Tracked Job Application Dossier',
      uri: 'career://applications/{applicationId}',
      description:
        'Full dossier of a tracked job application including status, stages timeline, interview feedback, and attached tailored artifacts.',
      mimeType: 'application/json',
      requiredScopes: ['career:read'],
      requiredRole: 'READONLY',
    },
    async (context, uri, params = {}) => {
      const applicationId = params.applicationId || String(uri).split('/').pop();
      if (!applicationId || !/^[0-9a-f-]{36}$/i.test(applicationId)) {
        throw new ValidationError('Invalid applicationId format in resource URI');
      }

      const [app] = await db
        .select()
        .from(jobApplications)
        .where(
          and(eq(jobApplications.id, applicationId), eq(jobApplications.tenantId, context.tenantId))
        );

      if (!app) {
        throw new NotFoundError(`Job application not found: ${applicationId}`);
      }

      const stages = await db
        .select()
        .from(applicationStages)
        .where(
          and(
            eq(applicationStages.tenantId, context.tenantId),
            eq(applicationStages.applicationId, applicationId)
          )
        )
        .orderBy(applicationStages.orderIndex);

      const docs = await db
        .select()
        .from(tailoredDocuments)
        .where(
          and(
            eq(tailoredDocuments.tenantId, context.tenantId),
            eq(tailoredDocuments.applicationId, applicationId)
          )
        )
        .orderBy(desc(tailoredDocuments.version));

      return {
        id: app.id,
        candidateId: app.candidateId,
        companyName: app.companyName,
        jobTitle: app.jobTitle,
        jobUrl: app.jobUrl,
        status: app.status,
        salaryMin: app.salaryMin,
        salaryMax: app.salaryMax,
        salaryCurrency: app.salaryCurrency,
        notes: app.notes,
        stages: stages.map((s) => ({
          id: s.id,
          stageName: s.stageName,
          stageType: s.stageType,
          status: s.status,
          orderIndex: s.orderIndex,
          scheduledAt: s.scheduledAt ? new Date(s.scheduledAt).toISOString() : null,
          completedAt: s.completedAt ? new Date(s.completedAt).toISOString() : null,
        })),
        documents: docs.map((d) => ({
          id: d.id,
          documentType: d.documentType,
          version: d.version,
          contentHash: d.contentHash,
          title: d.title,
          createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : null,
        })),
        createdAt: app.createdAt ? new Date(app.createdAt).toISOString() : null,
        updatedAt: app.updatedAt ? new Date(app.updatedAt).toISOString() : null,
      };
    }
  );
}
