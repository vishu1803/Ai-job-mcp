/**
 * @file Resume & Candidate Claims Database Repository (P13.5-003 / ARCH-052).
 *
 * Implements multi-tenant data access operations for:
 * 1. resumes
 * 2. resume_sections
 * 3. candidate_claims
 */

import { eq, and, desc, max } from 'drizzle-orm';
import { db } from '../index.js';
import { resumes, resumeSections, candidateClaims } from '../schema.js';
import { NotFoundError } from '../../errors/index.js';

export class ResumeRepository {
  /**
   * @param {import('../index.js').db} [database=db]
   */
  constructor(database = db) {
    this.db = database;
  }

  /**
   * Retrieves maximum existing resume version for a candidate.
   *
   * @param {object} params
   * @param {string} params.tenantId
   * @param {string} params.candidateId
   * @returns {Promise<number>}
   */
  async getMaxVersion({ tenantId, candidateId }) {
    const [result] = await this.db
      .select({ maxVersion: max(resumes.version) })
      .from(resumes)
      .where(and(eq(resumes.tenantId, tenantId), eq(resumes.candidateId, candidateId)));

    return result?.maxVersion || 0;
  }

  /**
   * Inserts a new resume root record.
   *
   * @param {object} data
   * @returns {Promise<object>}
   */
  async createResume(data) {
    const [created] = await this.db.insert(resumes).values(data).returning();
    return created;
  }

  /**
   * Finds a resume by ID with tenant and candidate isolation.
   *
   * @param {object} params
   * @param {string} params.id
   * @param {string} params.tenantId
   * @param {string} [params.candidateId]
   * @returns {Promise<object>}
   */
  async getResumeById({ id, tenantId, candidateId }) {
    const conditions = [eq(resumes.id, id), eq(resumes.tenantId, tenantId)];
    if (candidateId) {
      conditions.push(eq(resumes.candidateId, candidateId));
    }

    const [found] = await this.db
      .select()
      .from(resumes)
      .where(and(...conditions));

    if (!found) {
      throw new NotFoundError(`Resume not found: ${id}`);
    }

    return found;
  }

  /**
   * Lists all resume versions for a candidate.
   *
   * @param {object} params
   * @param {string} params.tenantId
   * @param {string} params.candidateId
   * @returns {Promise<Array<object>>}
   */
  async listResumesByCandidate({ tenantId, candidateId }) {
    return this.db
      .select()
      .from(resumes)
      .where(and(eq(resumes.tenantId, tenantId), eq(resumes.candidateId, candidateId)))
      .orderBy(desc(resumes.version));
  }

  /**
   * Updates resume lifecycle state and metadata.
   *
   * @param {object} params
   * @param {string} params.id
   * @param {string} params.tenantId
   * @param {object} params.updates
   * @returns {Promise<object>}
   */
  async updateResume({ id, tenantId, updates }) {
    const [updated] = await this.db
      .update(resumes)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(resumes.id, id), eq(resumes.tenantId, tenantId)))
      .returning();

    if (!updated) {
      throw new NotFoundError(`Resume not found for update: ${id}`);
    }

    return updated;
  }

  /**
   * Promotes a resume to Base Resume, resetting previous base resumes for candidate.
   *
   * @param {object} params
   * @param {string} params.id
   * @param {string} params.tenantId
   * @param {string} params.candidateId
   * @returns {Promise<object>}
   */
  async setBaseResume({ id, tenantId, candidateId }) {
    // 1. Unset existing base resumes for this candidate
    await this.db
      .update(resumes)
      .set({ isBaseResume: false, updatedAt: new Date() })
      .where(and(eq(resumes.tenantId, tenantId), eq(resumes.candidateId, candidateId)));

    // 2. Set this resume as base resume
    const [promoted] = await this.db
      .update(resumes)
      .set({ isBaseResume: true, lifecycleState: 'BASE_RESUME', updatedAt: new Date() })
      .where(
        and(
          eq(resumes.id, id),
          eq(resumes.tenantId, tenantId),
          eq(resumes.candidateId, candidateId)
        )
      )
      .returning();

    return promoted;
  }

  /**
   * Batch creates parsed resume sections.
   *
   * @param {Array<object>} sections
   * @returns {Promise<Array<object>>}
   */
  async createResumeSections(sections) {
    if (!sections || sections.length === 0) return [];
    return this.db.insert(resumeSections).values(sections).returning();
  }

  /**
   * Gets all parsed sections for a resume.
   *
   * @param {object} params
   * @param {string} params.resumeId
   * @param {string} params.tenantId
   * @returns {Promise<Array<object>>}
   */
  async getResumeSections({ resumeId, tenantId }) {
    return this.db
      .select()
      .from(resumeSections)
      .where(and(eq(resumeSections.resumeId, resumeId), eq(resumeSections.tenantId, tenantId)))
      .orderBy(resumeSections.orderIndex);
  }

  /**
   * Batch creates candidate claims.
   *
   * @param {Array<object>} claims
   * @returns {Promise<Array<object>>}
   */
  async createCandidateClaims(claims) {
    if (!claims || claims.length === 0) return [];
    return this.db.insert(candidateClaims).values(claims).returning();
  }

  /**
   * Gets candidate claims with optional resumeId filter.
   *
   * @param {object} params
   * @param {string} params.tenantId
   * @param {string} params.candidateId
   * @param {string} [params.resumeId]
   * @returns {Promise<Array<object>>}
   */
  async getCandidateClaims({ tenantId, candidateId, resumeId }) {
    const conditions = [
      eq(candidateClaims.tenantId, tenantId),
      eq(candidateClaims.candidateId, candidateId),
    ];
    if (resumeId) {
      conditions.push(eq(candidateClaims.resumeId, resumeId));
    }

    return this.db
      .select()
      .from(candidateClaims)
      .where(and(...conditions))
      .orderBy(desc(candidateClaims.createdAt));
  }

  /**
   * Deletes a resume version and all associated sections/claims (via cascade).
   *
   * @param {object} params
   * @param {string} params.id
   * @param {string} params.tenantId
   * @param {string} params.candidateId
   * @returns {Promise<object>}
   */
  async deleteResume({ id, tenantId, candidateId }) {
    const [deleted] = await this.db
      .delete(resumes)
      .where(
        and(
          eq(resumes.id, id),
          eq(resumes.tenantId, tenantId),
          eq(resumes.candidateId, candidateId)
        )
      )
      .returning();

    if (!deleted) {
      throw new NotFoundError(`Resume not found for deletion: ${id}`);
    }

    return deleted;
  }
}

export const resumeRepository = new ResumeRepository();
