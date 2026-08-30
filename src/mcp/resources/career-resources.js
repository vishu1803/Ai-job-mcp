/**
 * @file MCP Career Resources Registration (P14-004C / ARCH-056).
 *
 * Exposes canonical read-only MCP resources:
 * 1. career://profile - Authenticated candidate profile and career preferences
 * 2. career://skills - Candidate verified skills with evidence links
 * 3. career://connections - Status of connected repositories and AI providers
 */

import { CandidateProfileService } from '../../services/candidate-profile.service.js';
import { NotFoundError } from '../../errors/index.js';

export function registerCareerResources(server, deps = {}) {
  const profileService = deps.profileService || new CandidateProfileService(deps.database);

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
}
