/**
 * @file MCP Career Profile & Preferences Tool Implementations (P14-004C / ARCH-056).
 *
 * Implements handlers for:
 * 1. get_career_profile
 * 2. update_career_preferences
 */

import { CandidateProfileService } from '../../services/candidate-profile.service.js';
import {
  CAREER_PROFILE_TOOL_DEFINITIONS,
  GetCareerProfileInputSchema,
} from '../../domain/mcp/career-profile-tools.schemas.js';
import { UpdateCareerPreferencesInputSchema } from '../../domain/candidate/career-preferences.schemas.js';
import { NotFoundError } from '../../errors/index.js';

/**
 * Resolves target candidate UUID from parameters or context.
 *
 * @param {object} context - Trusted McpRequestContext
 * @param {string} [paramCandidateId] - Optional candidateId from tool input
 * @param {CandidateProfileService} profileService
 * @returns {Promise<string>} Candidate UUID
 */
async function resolveCandidateId(context, paramCandidateId, profileService) {
  if (paramCandidateId) return paramCandidateId;
  if (context.candidateId) return context.candidateId;

  // Lookup candidate for tenant
  const list = await profileService.listCandidates(context, { pageSize: 1, page: 1 });
  if (Array.isArray(list.items) && list.items.length > 0) {
    return list.items[0].id;
  }
  if (Array.isArray(list.candidates) && list.candidates.length > 0) {
    return list.candidates[0].id;
  }
  throw new NotFoundError('No candidate profile associated with active session or tenant');
}

/**
 * Registers Career Profile and Preferences MCP Tools with the McpServerWrapper.
 *
 * @param {import('../server.js').McpServerWrapper} server - MCP Server wrapper instance
 * @param {object} [deps={}] - Injectable dependencies
 */
export function registerCareerProfileTools(server, deps = {}) {
  const profileService = deps.profileService || new CandidateProfileService(deps.database);

  // 1. get_career_profile
  server.registerTool(
    CAREER_PROFILE_TOOL_DEFINITIONS.get_career_profile,
    async (context, params = {}) => {
      const validated = GetCareerProfileInputSchema.parse(params || {});
      const candidateId = await resolveCandidateId(context, validated.candidateId, profileService);

      const profile = await profileService.getCareerProfile(context, candidateId);

      return {
        profile,
      };
    }
  );

  // 2. update_career_preferences
  server.registerTool(
    CAREER_PROFILE_TOOL_DEFINITIONS.update_career_preferences,
    async (context, params = {}) => {
      const { candidateId: rawCandidateId, ...preferencesInput } = params || {};
      const candidateId = await resolveCandidateId(context, rawCandidateId, profileService);

      const validatedPreferences = UpdateCareerPreferencesInputSchema.parse(preferencesInput);
      const updated = await profileService.updateCareerPreferences(
        context,
        candidateId,
        validatedPreferences
      );

      return {
        preferences: updated,
        message: 'Career preferences updated successfully.',
      };
    }
  );
}
