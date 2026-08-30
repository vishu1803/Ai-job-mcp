/**
 * @file Source Resume Ingestion & Lifecycle Management Service (P13.5-003 / ARCH-052).
 *
 * Implements the end-to-end source resume lifecycle:
 * 1. Upload & Validation (PDF, DOCX, TXT <= 10MB)
 * 2. Encrypted Blob Storage (AES-256-GCM) with immutable SHA-256 hashing
 * 3. Sandboxed Multi-Format Parsing & Structured Section Extraction
 * 4. Factual Claim Extraction with strict CLAIMED truth status ([Unverified User Claim])
 * 5. Explicit Versioning (Resume v1, v2, v3) without destructive overwrite
 * 6. User Review, Editing, Promotion to Base Resume, and Decrypted Downloads
 * 7. Multi-tenant isolation & sovereign default-deny security
 */

import { eq, and, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { candidates, candidateSkills, skills, auditLogs } from '../db/schema.js';
import { resumeRepository } from '../db/repositories/resume.repository.js';
import { documentStorageService } from './document-storage.service.js';
import { resumeParserService } from './resume-parser.service.js';
import { NotFoundError, AuthorizationError } from '../errors/index.js';
import { logger } from '../utils/logger.js';

export class SourceResumeIngestionService {
  /**
   * @param {object} [dependencies={}]
   * @param {import('../db/repositories/resume.repository.js').ResumeRepository} [dependencies.resumeRepo=resumeRepository]
   * @param {import('./document-storage.service.js').DocumentStorageService} [dependencies.documentStorage=documentStorageService]
   * @param {import('./resume-parser.service.js').ResumeParserService} [dependencies.resumeParser=resumeParserService]
   * @param {import('../db/index.js').db} [dependencies.database=db]
   */
  constructor(dependencies = {}) {
    this.resumeRepo = dependencies.resumeRepo || resumeRepository;
    this.documentStorage = dependencies.documentStorage || documentStorageService;
    this.resumeParser = dependencies.resumeParser || resumeParserService;
    this.db = dependencies.database || db;
  }

  /**
   * Validates authenticated context and tenant ownership.
   *
   * @private
   * @param {object} context
   */
  _validateContext(context) {
    if (!context || !context.tenantId || !context.userId) {
      throw new AuthorizationError('Authentication required to perform resume operations');
    }
  }

  /**
   * Asserts candidate belongs to authenticated tenant.
   *
   * @private
   * @param {string} candidateId
   * @param {string} tenantId
   * @returns {Promise<object>}
   */
  async _assertCandidateOwnership(candidateId, tenantId) {
    const [candidate] = await this.db
      .select()
      .from(candidates)
      .where(and(eq(candidates.id, candidateId), eq(candidates.tenantId, tenantId)));

    if (!candidate) {
      throw new NotFoundError(`Candidate not found: ${candidateId}`);
    }

    return candidate;
  }

  /**
   * Uploads, encrypts, and parses a new source resume version for a candidate.
   *
   * @param {object} params
   * @param {object} params.context Authenticated context ({ tenantId, userId, role })
   * @param {string} params.candidateId Candidate UUID
   * @param {Buffer} params.fileBuffer Raw binary buffer
   * @param {string} params.fileName Uploaded filename
   * @param {string} [params.declaredMimeType] Uploaded Content-Type header
   * @returns {Promise<{ resume: object, sections: Array<object>, claims: Array<object> }>}
   */
  async uploadSourceResume({ context, candidateId, fileBuffer, fileName, declaredMimeType = '' }) {
    this._validateContext(context);
    const tenantId = context.tenantId;

    await this._assertCandidateOwnership(candidateId, tenantId);

    // 1. Validate file format, magic bytes, size limits, and sanitize filename
    const { format, detectedMimeType, sanitizedFileName } = this.resumeParser.validateFile({
      buffer: fileBuffer,
      fileName,
      declaredMimeType,
    });

    // 2. Determine next explicit version number for candidate
    const currentMaxVersion = await this.resumeRepo.getMaxVersion({ tenantId, candidateId });
    const nextVersion = currentMaxVersion + 1;

    // 3. Encrypt and persist binary in DocumentStorageService
    const { storageKey, contentHash, fileSizeBytes } =
      await this.documentStorage.storeEncryptedDocument({
        tenantId,
        candidateId,
        buffer: fileBuffer,
        originalFileName: sanitizedFileName,
        mimeType: detectedMimeType,
      });

    // 4. Create root resume record with lifecycleState = 'SOURCE'
    const resume = await this.resumeRepo.createResume({
      tenantId,
      candidateId,
      version: nextVersion,
      fileName: sanitizedFileName,
      fileSizeBytes,
      mimeType: detectedMimeType,
      contentHash,
      storageKey,
      lifecycleState: 'SOURCE',
      isBaseResume: false,
      metadata: {
        format,
        declaredMimeType,
        uploadedByUserId: context.userId,
      },
    });

    // 5. Sandboxed multi-format parsing & text normalization
    let rawText = '';
    let parsedSections = [];
    let parsedClaims = [];
    let parseError = null;

    try {
      rawText = this.resumeParser.extractRawText({ buffer: fileBuffer, format });
      const rawSections = this.resumeParser.splitIntoSections(rawText);

      // Create structured section records
      const sectionRows = rawSections.map((s) => ({
        tenantId,
        candidateId,
        resumeId: resume.id,
        sectionType: s.sectionType,
        rawText: s.rawText,
        structuredData: s.structuredData || {},
        orderIndex: s.orderIndex,
      }));

      parsedSections = await this.resumeRepo.createResumeSections(sectionRows);

      // Generate claims strictly tagged with CLAIMED provenance
      const rawClaims = this.resumeParser.generateClaims(rawSections);
      const claimRows = rawClaims.map((c) => ({
        tenantId,
        candidateId,
        resumeId: resume.id,
        claimType: c.claimType,
        statement: c.statement,
        context: c.context,
        provenanceStatus: 'CLAIMED',
        isCorroborated: false,
        metadata: {
          sourceResumeVersion: nextVersion,
          extractedAt: new Date().toISOString(),
        },
      }));

      parsedClaims = await this.resumeRepo.createCandidateClaims(claimRows);
    } catch (err) {
      logger.error({ err, resumeId: resume.id }, 'Resume parsing encountered an error');
      parseError = err.message || 'Unknown parsing error';
    }

    // 6. Update resume status to PARSED
    const updatedResume = await this.resumeRepo.updateResume({
      id: resume.id,
      tenantId,
      updates: {
        lifecycleState: parseError ? 'SOURCE' : 'PARSED',
        parseError,
        parsedAt: new Date(),
      },
    });

    // 7. Audit log (sanitized: never store raw resume content or credentials in audit logs)
    await this.db.insert(auditLogs).values({
      tenantId,
      userId: context.userId,
      eventType: 'resume.uploaded',
      resourceType: 'resume',
      resourceId: resume.id,
      details: {
        version: nextVersion,
        fileName: sanitizedFileName,
        fileSizeBytes,
        contentHash,
        sectionsExtracted: parsedSections.length,
        claimsExtracted: parsedClaims.length,
      },
    });

    return {
      resume: updatedResume,
      sections: parsedSections,
      claims: parsedClaims,
    };
  }

  /**
   * Lists all uploaded resume versions for a candidate.
   *
   * @param {object} params
   * @param {object} params.context
   * @param {string} params.candidateId
   * @returns {Promise<Array<object>>}
   */
  async listResumes({ context, candidateId }) {
    this._validateContext(context);
    const tenantId = context.tenantId;
    await this._assertCandidateOwnership(candidateId, tenantId);

    return this.resumeRepo.listResumesByCandidate({ tenantId, candidateId });
  }

  /**
   * Retrieves full details, parsed sections, and extracted claims for a resume version.
   *
   * @param {object} params
   * @param {object} params.context
   * @param {string} params.resumeId
   * @param {string} [params.candidateId]
   * @returns {Promise<{ resume: object, sections: Array<object>, claims: Array<object> }>}
   */
  async getResumeDetails({ context, resumeId, candidateId }) {
    this._validateContext(context);
    const tenantId = context.tenantId;

    const resume = await this.resumeRepo.getResumeById({
      id: resumeId,
      tenantId,
      candidateId,
    });

    const [sections, claims] = await Promise.all([
      this.resumeRepo.getResumeSections({ resumeId: resume.id, tenantId }),
      this.resumeRepo.getCandidateClaims({
        tenantId,
        candidateId: resume.candidateId,
        resumeId: resume.id,
      }),
    ]);

    return {
      resume,
      sections,
      claims,
    };
  }

  /**
   * Reviews and approves parsed resume claims, optionally promoting the version to Base Resume.
   *
   * @param {object} params
   * @param {object} params.context
   * @param {string} params.resumeId
   * @param {string} params.candidateId
   * @param {Array<string>} [params.approvedSkillClaims=[]] Approved skill names
   * @param {boolean} [params.promoteToBase=false] Whether to designate this version as Base Resume
   * @param {string} [params.headline] Optional updated headline
   * @param {string} [params.bio] Optional updated bio summary
   * @returns {Promise<{ resume: object, candidate: object }>}
   */
  async reviewAndApproveResume({
    context,
    resumeId,
    candidateId,
    approvedSkillClaims = [],
    promoteToBase = false,
    headline,
    bio,
  }) {
    this._validateContext(context);
    const tenantId = context.tenantId;

    const existingResume = await this.resumeRepo.getResumeById({
      id: resumeId,
      tenantId,
      candidateId,
    });

    let updatedResume;
    if (promoteToBase) {
      updatedResume = await this.resumeRepo.setBaseResume({
        id: resumeId,
        tenantId,
        candidateId,
      });
    } else {
      updatedResume = await this.resumeRepo.updateResume({
        id: resumeId,
        tenantId,
        updates: {
          lifecycleState: 'USER_APPROVED',
          reviewedAt: new Date(),
        },
      });
    }

    // 1. Fetch parsed resume sections to extract rich resume qualifications
    const sections = await this.resumeRepo.getResumeSections({
      resumeId,
      tenantId,
    });

    let contactName = null;
    let contactEmail = null;
    let contactPhone = null;
    let contactGithub = null;
    let contactLinkedin = null;
    let contactLeetcode = null;
    const contactUrls = [];
    let detectedLocation = null;
    let detectedHeadline = null;
    let detectedCurrentRole = null;
    let resumeSummary = null;
    const resumeExperiences = [];
    const resumeEducation = [];
    const resumeProjects = [];
    const resumeCerts = [];
    const resumeSkills = [];

    for (const sec of sections) {
      const sd = sec.structuredData || {};
      if (sec.sectionType === 'CONTACT_INFO' || sec.sectionType === 'SUMMARY') {
        if (sd.name && !contactName) contactName = sd.name;
        if (sd.email && !contactEmail) contactEmail = sd.email;
        if (sd.phone && !contactPhone) contactPhone = sd.phone;
        if (sd.github && !contactGithub) contactGithub = sd.github;
        if (sd.linkedin && !contactLinkedin) contactLinkedin = sd.linkedin;
        if (sd.leetcode && !contactLeetcode) contactLeetcode = sd.leetcode;
        if (Array.isArray(sd.urls)) {
          contactUrls.push(...sd.urls);
        }
      }

      if (sec.sectionType === 'SUMMARY') {
        if (typeof sd.content === 'string' && sd.content.trim()) {
          resumeSummary = sd.content.trim();
        } else if (sec.rawText && sec.rawText.trim()) {
          resumeSummary = sec.rawText.trim();
        }
      }

      if (sec.sectionType === 'WORK_EXPERIENCE') {
        if (Array.isArray(sd.experiences) && sd.experiences.length > 0) {
          for (const exp of sd.experiences) {
            const role = (exp.role || '').trim();
            const company = (exp.company || '').trim();
            const loc = (exp.location || '').trim();
            const dates = (exp.dates || '').trim();
            const bullets = Array.isArray(exp.bullets) ? exp.bullets : [];

            if (!detectedCurrentRole && role) detectedCurrentRole = role;
            if (!detectedHeadline && role) detectedHeadline = role;
            if (!detectedLocation && loc) detectedLocation = loc;

            resumeExperiences.push({
              company: company || 'Company',
              title: role || 'Role',
              role: role || 'Role',
              location: loc || null,
              startDate: dates || null,
              endDate: null,
              isCurrent: /present|current|now/i.test(dates),
              bullets,
              verifiedSkillsUsed: [],
              provenanceStatus: 'CLAIMED',
            });
          }
        }
      }

      if (sec.sectionType === 'EDUCATION') {
        if (Array.isArray(sd.degrees) && sd.degrees.length > 0) {
          for (const d of sd.degrees) {
            const raw = String(d || '').trim();
            if (!raw) continue;
            const parts = raw
              .split(/[|,]/)
              .map((p) => p.trim())
              .filter(Boolean);
            if (parts.length >= 2) {
              resumeEducation.push({
                institution: parts[1],
                degree: parts[0],
                fieldOfStudy: parts[2] || null,
                startDate: null,
                endDate: null,
                text: raw,
                provenanceStatus: 'CLAIMED',
              });
            } else {
              resumeEducation.push({
                institution: raw,
                degree: null,
                fieldOfStudy: null,
                startDate: null,
                endDate: null,
                text: raw,
                provenanceStatus: 'CLAIMED',
              });
            }
          }
        }
      }

      if (sec.sectionType === 'PROJECTS') {
        if (Array.isArray(sd.projects) && sd.projects.length > 0) {
          for (const proj of sd.projects) {
            const title = (proj.title || '').trim();
            if (!title) continue;
            const techs = Array.isArray(proj.technologies) ? proj.technologies : [];
            const bullets = Array.isArray(proj.bullets) ? proj.bullets : [];
            const urls = Array.isArray(proj.urls) ? proj.urls : [];

            resumeProjects.push({
              name: title,
              title,
              headline: bullets[0] || null,
              role: null,
              summary: bullets.join(' ') || null,
              technologies: techs,
              bullets,
              urls,
              startDate: null,
              endDate: null,
              linkedResourceCount: 0,
              verifiedSignalCount: 0,
              provenanceStatus: 'CLAIMED',
            });
          }
        }
      }

      if (sec.sectionType === 'CERTIFICATIONS') {
        if (Array.isArray(sd.certs)) {
          for (const c of sd.certs) {
            const trimmed = String(c || '').trim();
            if (trimmed) resumeCerts.push(trimmed);
          }
        }
      }

      if (sec.sectionType === 'SKILLS') {
        if (Array.isArray(sd.skills)) {
          for (const s of sd.skills) {
            const trimmed = String(s || '').trim();
            if (trimmed && !resumeSkills.includes(trimmed)) {
              resumeSkills.push(trimmed);
            }
          }
        }
      }
    }

    const resumeData = {
      sourceResumeId: existingResume.id,
      sourceVersion: existingResume.version,
      extractedAt: new Date().toISOString(),
      identity: {
        name: contactName,
        email: contactEmail,
        phone: contactPhone,
        location: detectedLocation,
        headline: detectedHeadline,
        currentRole: detectedCurrentRole,
        github: contactGithub,
        linkedin: contactLinkedin,
        leetcode: contactLeetcode,
        portfolioUrls: [...new Set(contactUrls)],
      },
      summary: resumeSummary,
      experience: resumeExperiences,
      education: resumeEducation,
      projects: resumeProjects,
      certifications: [...new Set(resumeCerts)],
      skills: resumeSkills,
      provenance: 'RESUME_CLAIM',
    };

    // 2. Fetch current candidate to preserve existing narrative and metadata
    const [currentCandidate] = await this.db
      .select()
      .from(candidates)
      .where(and(eq(candidates.id, candidateId), eq(candidates.tenantId, tenantId)));

    const existingMeta = currentCandidate?.profileMetadata || {};
    const updatedMeta = {
      ...existingMeta,
      resumeData,
      location: existingMeta.location || detectedLocation || null,
      currentRole: existingMeta.currentRole || detectedCurrentRole || null,
    };

    // 3. Update candidate narrative profile (Explicit user input > Existing > Resume default)
    const candidateUpdates = {
      profileMetadata: updatedMeta,
      updatedAt: new Date(),
    };

    if (headline && typeof headline === 'string') {
      candidateUpdates.headline = headline.trim().slice(0, 255);
    } else if (!currentCandidate?.headline && detectedHeadline) {
      candidateUpdates.headline = detectedHeadline.slice(0, 255);
    }

    if (bio && typeof bio === 'string') {
      candidateUpdates.summary = bio.trim().slice(0, 4000);
    } else if (!currentCandidate?.summary && resumeSummary) {
      candidateUpdates.summary = resumeSummary.slice(0, 4000);
    }

    if (!currentCandidate?.canonicalEmail && contactEmail) {
      candidateUpdates.canonicalEmail = contactEmail.toLowerCase().trim();
    }

    const [updatedCandidate] = await this.db
      .update(candidates)
      .set(candidateUpdates)
      .where(and(eq(candidates.id, candidateId), eq(candidates.tenantId, tenantId)))
      .returning();

    // 2. Promote approved skill claims to candidate_skills with CLAIMED status (Never overwrite VERIFIED skills)
    if (Array.isArray(approvedSkillClaims) && approvedSkillClaims.length > 0) {
      for (const skillName of approvedSkillClaims) {
        const normalizedName = String(skillName).trim();
        if (!normalizedName) continue;

        // Ensure global skill exists in taxonomy
        const [existingGlobalSkill] = await this.db
          .select()
          .from(skills)
          .where(sql`lower(${skills.name}) = lower(${normalizedName})`);

        let skillId = existingGlobalSkill?.id;
        let skillCat = existingGlobalSkill?.category;
        if (!skillId) {
          const [createdSkill] = await this.db
            .insert(skills)
            .values({
              name: normalizedName,
              slug: normalizedName.toLowerCase().replace(/[^a-z0-9]/g, '-'),
              category: 'TOOL',
            })
            .onConflictDoNothing()
            .returning();
          skillId = createdSkill?.id || existingGlobalSkill?.id;
          skillCat = createdSkill?.category || skillCat || 'TOOL';
        }

        if (skillId) {
          // Check if candidate already has this skill
          const [existingCandidateSkill] = await this.db
            .select()
            .from(candidateSkills)
            .where(
              and(
                eq(candidateSkills.tenantId, tenantId),
                eq(candidateSkills.candidateId, candidateId),
                eq(candidateSkills.skillId, skillId)
              )
            );

          if (!existingCandidateSkill) {
            // Add as CLAIMED (never VERIFIED)
            await this.db.insert(candidateSkills).values({
              tenantId,
              candidateId,
              skillId,
              category: skillCat || 'TOOL',
              provenanceStatus: 'CLAIMED',
              confidenceScore: 0.5,
              evidenceCount: 0,
              metadata: {
                source: 'RESUME_UPLOAD',
                resumeId: existingResume.id,
                claimNote: '[Unverified User Claim]',
              },
            });
          }
          // If candidate already has skill as VERIFIED, keep VERIFIED!
        }
      }
    }

    // 3. Log audit event
    await this.db.insert(auditLogs).values({
      tenantId,
      userId: context.userId,
      eventType: 'resume.reviewed',
      resourceType: 'resume',
      resourceId: resumeId,
      details: {
        version: existingResume.version,
        promotedToBase: promoteToBase,
        approvedSkillsCount: approvedSkillClaims.length,
      },
    });

    return {
      resume: updatedResume,
      candidate: updatedCandidate,
    };
  }

  /**
   * Decrypts and streams the original binary file for authorized candidate download.
   *
   * @param {object} params
   * @param {object} params.context
   * @param {string} params.resumeId
   * @param {string} [params.candidateId]
   * @returns {Promise<{ buffer: Buffer, fileName: string, mimeType: string, fileSizeBytes: number }>}
   */
  async downloadSourceResume({ context, resumeId, candidateId }) {
    this._validateContext(context);
    const tenantId = context.tenantId;

    const resume = await this.resumeRepo.getResumeById({
      id: resumeId,
      tenantId,
      candidateId,
    });

    const decryptedBuffer = await this.documentStorage.getDecryptedDocument({
      tenantId,
      storageKey: resume.storageKey,
    });

    return {
      buffer: decryptedBuffer,
      fileName: resume.fileName,
      mimeType: resume.mimeType,
      fileSizeBytes: resume.fileSizeBytes,
    };
  }

  /**
   * Deletes a resume version and its encrypted storage blob.
   *
   * @param {object} params
   * @param {object} params.context
   * @param {string} params.resumeId
   * @param {string} params.candidateId
   * @returns {Promise<object>}
   */
  async deleteResumeVersion({ context, resumeId, candidateId }) {
    this._validateContext(context);
    const tenantId = context.tenantId;

    const resume = await this.resumeRepo.getResumeById({
      id: resumeId,
      tenantId,
      candidateId,
    });

    // 1. Delete encrypted blob from storage
    await this.documentStorage.deleteEncryptedDocument({
      tenantId,
      storageKey: resume.storageKey,
    });

    // 2. Delete database record (cascading sections and claims)
    const deleted = await this.resumeRepo.deleteResume({
      id: resumeId,
      tenantId,
      candidateId,
    });

    // 3. Log audit event
    await this.db.insert(auditLogs).values({
      tenantId,
      userId: context.userId,
      eventType: 'resume.deleted',
      resourceType: 'resume',
      resourceId: resumeId,
      details: {
        version: resume.version,
        fileName: resume.fileName,
      },
    });

    return deleted;
  }
}

export const sourceResumeIngestionService = new SourceResumeIngestionService();
