/**
 * @file Canonical Domain Zod Schemas for Resume Tailoring & Presentation Modes (P6-001)
 *
 * Implements the domain contracts approved in P6-001A (ARCH-017 / ADR-037):
 * - ResumeSectionTypeEnum
 * - ResumePresentationModeEnum (PRESERVE_EXISTING, GENERATE_NEW)
 * - ResumeTemplateIdEnum (ATS_FOCUSED, PROFESSIONAL, MODERN, MINIMAL, TRADITIONAL)
 * - PresentationIntegrityStatusEnum (PASS, WARNING, UNSUPPORTED_PRESERVATION, BLOCKED)
 * - SourceDocumentFormatEnum (DOCX, PDF, MARKDOWN, PLAIN_TEXT)
 * - PreservedAttributesSchema
 * - ModifiedAttributesSchema
 * - PresentationFingerprintSchema
 * - PresentationAuditReportSchema
 * - ResumeBulletSchema
 * - ResumeSkillItemSchema
 * - ResumeSkillCategorySchema
 * - ResumeExperienceEntrySchema
 * - ResumeProjectEntrySchema
 * - ResumeEducationEntrySchema
 * - ResumeCertificationEntrySchema
 * - TailoredResumeMetadataSchema
 * - TailoredResumeRequestOptionsSchema
 * - TailoredResumeSchema
 */

import { z } from 'zod';
import {
  SafeSlugSchema,
  ConfidenceScoreSchema,
  DateOrIsoStringSchema,
  SkillCategoryEnum,
} from '../candidate/candidate.schemas.js';
import { EvidenceRefSchema, EvidenceTrustClassEnum } from './evidence-matching.schemas.js';
import { ProjectTypeEnum, ProjectRelevanceBandEnum } from './project-relevance.schemas.js';
import { CareerAssertionStatusEnum, IntegrityStatusEnum } from './integrity-gate.schemas.js';

// ---------------------------------------------------------------------------
// 1. Enumerations
// ---------------------------------------------------------------------------

export const ResumeSectionTypeEnum = z.enum([
  'SUMMARY',
  'SKILLS',
  'EXPERIENCE',
  'PROJECTS',
  'EDUCATION',
  'CERTIFICATIONS',
]);

export const ResumePresentationModeEnum = z.enum(['PRESERVE_EXISTING', 'GENERATE_NEW']);

export const ResumeTemplateIdEnum = z.enum([
  'ATS_FOCUSED',
  'PROFESSIONAL',
  'MODERN',
  'MINIMAL',
  'TRADITIONAL',
]);

export const PresentationIntegrityStatusEnum = z.enum([
  'PASS',
  'WARNING',
  'UNSUPPORTED_PRESERVATION',
  'BLOCKED',
]);

export const SourceDocumentFormatEnum = z.enum(['DOCX', 'PDF', 'MARKDOWN', 'PLAIN_TEXT']);

// ---------------------------------------------------------------------------
// 2. Presentation Attributes & Fingerprint Schemas
// ---------------------------------------------------------------------------

export const PreservedAttributesSchema = z
  .object({
    fontFamily: z.string().trim().nullable().optional(),
    fontSize: z.union([z.string(), z.number()]).nullable().optional(),
    fontWeight: z.union([z.string(), z.number()]).nullable().optional(),
    textColor: z.string().trim().nullable().optional(),
    margins: z
      .object({
        top: z.union([z.string(), z.number()]).optional(),
        bottom: z.union([z.string(), z.number()]).optional(),
        left: z.union([z.string(), z.number()]).optional(),
        right: z.union([z.string(), z.number()]).optional(),
      })
      .nullable()
      .optional(),
    lineSpacing: z.union([z.string(), z.number()]).nullable().optional(),
    paragraphSpacing: z.union([z.string(), z.number()]).nullable().optional(),
    sectionStyling: z.record(z.any()).nullable().optional(),
    pageDimensions: z
      .object({
        width: z.union([z.string(), z.number()]).optional(),
        height: z.union([z.string(), z.number()]).optional(),
        unit: z.string().optional(),
      })
      .nullable()
      .optional(),
    headersAndFooters: z.boolean().default(false),
    layoutStructure: z.string().trim().nullable().optional(),
  })
  .strict();

export const ModifiedAttributesSchema = z
  .object({
    wordingChanges: z.array(z.string().trim()).default([]),
    bulletPhrasing: z.boolean().default(true),
    summaryWording: z.boolean().default(true),
    skillEmphasis: z.boolean().default(true),
    projectOrdering: z.boolean().default(true),
    atsTerminologyAdapted: z.boolean().default(true),
    omittedIrrelevantContent: z.boolean().default(true),
  })
  .strict();

export const PresentationFingerprintSchema = z
  .object({
    documentFormat: SourceDocumentFormatEnum,
    typography: z
      .object({
        fontFamilies: z.array(z.string().trim()).default([]),
        primaryFontSize: z.union([z.string(), z.number()]).optional(),
        headingFontSizes: z.array(z.union([z.string(), z.number()])).default([]),
      })
      .optional(),
    paragraphStyles: z
      .object({
        lineSpacing: z.union([z.string(), z.number()]).optional(),
        spacingAfter: z.union([z.string(), z.number()]).optional(),
        alignment: z.string().optional(),
      })
      .optional(),
    pageSettings: z
      .object({
        margins: z
          .object({
            top: z.union([z.string(), z.number()]).optional(),
            bottom: z.union([z.string(), z.number()]).optional(),
            left: z.union([z.string(), z.number()]).optional(),
            right: z.union([z.string(), z.number()]).optional(),
          })
          .optional(),
        orientation: z.string().optional(),
        dimensions: z.record(z.any()).optional(),
      })
      .optional(),
    colorPalette: z.array(z.string().trim()).default([]),
    structuralLayout: z
      .object({
        columnCount: z.number().int().positive().default(1),
        sectionCount: z.number().int().nonnegative().default(0),
        sectionHeaders: z.array(z.string().trim()).default([]),
        hasHeader: z.boolean().default(false),
        hasFooter: z.boolean().default(false),
      })
      .optional(),
    fingerprintHash: z.string().trim().min(1).max(128),
  })
  .strict();

export const PresentationAuditReportSchema = z
  .object({
    presentationMode: ResumePresentationModeEnum,
    sourceDocumentId: z.string().nullable().optional(),
    sourceFormat: SourceDocumentFormatEnum.nullable().optional(),
    templateId: ResumeTemplateIdEnum.nullable().optional(),
    presentationIntegrityStatus: PresentationIntegrityStatusEnum,
    preservedAttributes: PreservedAttributesSchema.optional(),
    modifiedAttributes: ModifiedAttributesSchema.optional(),
    sourceFingerprint: PresentationFingerprintSchema.nullable().optional(),
    targetFingerprint: PresentationFingerprintSchema.nullable().optional(),
    discrepancies: z.array(z.string().trim()).default([]),
    warnings: z.array(z.string().trim()).default([]),
  })
  .strict();

// ---------------------------------------------------------------------------
// 3. Atomic Resume Bullet Schema
// ---------------------------------------------------------------------------

export const ResumeBulletSchema = z
  .object({
    id: z.string().uuid({ message: 'Bullet ID must be a valid UUID' }),
    section: ResumeSectionTypeEnum,
    text: z.string().trim().min(1).max(1000),
    assertionIds: z.array(z.string().uuid()).default([]),
    evidenceRefs: z.array(EvidenceRefSchema).max(5).default([]),
    status: CareerAssertionStatusEnum,
    confidenceScore: ConfidenceScoreSchema.default(1.0),
    relevanceScore: z.number().min(0).max(100).default(0.0),
    matchedKeywords: z.array(z.string().trim()).default([]),
    claimLabel: z.string().trim().nullable().optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// 4. Skills Section Schemas
// ---------------------------------------------------------------------------

export const ResumeSkillItemSchema = z
  .object({
    name: z.string().trim().min(1).max(255),
    canonicalSlug: SafeSlugSchema,
    category: SkillCategoryEnum,
    status: CareerAssertionStatusEnum,
    confidenceScore: ConfidenceScoreSchema.default(1.0),
    relevanceScore: z.number().min(0).max(100).default(0.0),
    claimLabel: z.string().trim().nullable().optional(),
    evidenceRefs: z.array(EvidenceRefSchema).max(5).default([]),
    assertionIds: z.array(z.string().uuid()).default([]),
  })
  .strict();

export const ResumeSkillCategorySchema = z
  .object({
    category: SkillCategoryEnum,
    skills: z.array(ResumeSkillItemSchema),
  })
  .strict();

// ---------------------------------------------------------------------------
// 5. Work Experience Entry Schema
// ---------------------------------------------------------------------------

export const ResumeExperienceEntrySchema = z
  .object({
    id: z.string().uuid({ message: 'Experience entry ID must be a valid UUID' }),
    company: z.string().trim().min(1).max(255),
    title: z.string().trim().min(1).max(255),
    startDate: z.string().trim().min(1).max(50),
    endDate: z.string().trim().min(1).max(50).nullable().optional(),
    location: z.string().trim().max(255).nullable().optional(),
    isCurrent: z.boolean().default(false),
    bullets: z.array(ResumeBulletSchema).default([]),
  })
  .strict();

// ---------------------------------------------------------------------------
// 6. Highlighted Project Entry Schema
// ---------------------------------------------------------------------------

export const ResumeProjectEntrySchema = z
  .object({
    id: z.string().uuid({ message: 'Project entry ID must be a valid UUID' }),
    projectId: z.string().uuid({ message: 'Project ID must be a valid UUID' }),
    name: z.string().trim().min(1).max(255),
    displayName: z.string().trim().min(1).max(255),
    description: z.string().trim().max(2000).nullable().optional(),
    projectType: ProjectTypeEnum.default('APPLICATION'),
    relevanceScore: z.number().min(0).max(100).default(0.0),
    relevanceBand: ProjectRelevanceBandEnum.default('MEDIUM'),
    primaryLanguages: z.array(z.string().trim()).default([]),
    primaryFrameworks: z.array(z.string().trim()).default([]),
    bullets: z.array(ResumeBulletSchema).default([]),
    evidenceRefs: z.array(EvidenceRefSchema).max(5).default([]),
  })
  .strict();

// ---------------------------------------------------------------------------
// 7. Education Entry Schema
// ---------------------------------------------------------------------------

export const ResumeEducationEntrySchema = z
  .object({
    id: z.string().uuid({ message: 'Education entry ID must be a valid UUID' }),
    institution: z.string().trim().min(1).max(255),
    degree: z.string().trim().min(1).max(255),
    fieldOfStudy: z.string().trim().max(255).nullable().optional(),
    startDate: z.string().trim().max(50).nullable().optional(),
    endDate: z.string().trim().max(50).nullable().optional(),
    grade: z.string().trim().max(50).nullable().optional(),
    bullets: z.array(ResumeBulletSchema).default([]),
  })
  .strict();

// ---------------------------------------------------------------------------
// 8. Certification Entry Schema
// ---------------------------------------------------------------------------

export const ResumeCertificationEntrySchema = z
  .object({
    id: z.string().uuid({ message: 'Certification entry ID must be a valid UUID' }),
    name: z.string().trim().min(1).max(255),
    issuingOrganization: z.string().trim().min(1).max(255),
    issueDate: z.string().trim().max(50).nullable().optional(),
    expirationDate: z.string().trim().max(50).nullable().optional(),
    credentialId: z.string().trim().max(255).nullable().optional(),
    credentialUrl: z.string().trim().url().nullable().optional(),
    bullets: z.array(ResumeBulletSchema).default([]),
  })
  .strict();

// ---------------------------------------------------------------------------
// 9. Resume Metadata Schema
// ---------------------------------------------------------------------------

export const TailoredResumeMetadataSchema = z
  .object({
    generatedAt: DateOrIsoStringSchema,
    sourceCandidateVersion: DateOrIsoStringSchema.optional(),
    sourceJobVersion: DateOrIsoStringSchema.optional(),
    generatorVersion: z.string().default('v1.0.0'),
    totalBullets: z.number().int().nonnegative().default(0),
    verifiedBullets: z.number().int().nonnegative().default(0),
    inferredBullets: z.number().int().nonnegative().default(0),
    claimedBullets: z.number().int().nonnegative().default(0),
    omittedSkillsCount: z.number().int().nonnegative().default(0),
    presentationMode: ResumePresentationModeEnum.default('GENERATE_NEW'),
    sourceDocumentId: z.string().nullable().optional(),
    templateId: ResumeTemplateIdEnum.nullable().optional(),
    presentationIntegrityStatus: PresentationIntegrityStatusEnum.default('PASS'),
  })
  .strict();

// ---------------------------------------------------------------------------
// 10. Request Options Schema
// ---------------------------------------------------------------------------

export const TailoredResumeRequestOptionsSchema = z
  .object({
    presentationMode: ResumePresentationModeEnum.default('GENERATE_NEW'),
    sourceDocumentId: z.string().trim().min(1).optional(),
    sourceDocument: z
      .object({
        id: z.string().optional(),
        format: SourceDocumentFormatEnum,
        rawContent: z.string().optional(),
        styles: z.record(z.any()).optional(),
        fingerprint: PresentationFingerprintSchema.optional(),
      })
      .optional(),
    templateId: ResumeTemplateIdEnum.optional(),
    llmAdapter: z.record(z.any()).optional(),
    resumeId: z.string().uuid().optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// 11. Root Tailored Resume Schema
// ---------------------------------------------------------------------------

export const TailoredResumeSchema = z
  .object({
    resumeId: z.string().uuid({ message: 'Resume ID must be a valid UUID' }),
    tenantId: z.string().uuid({ message: 'Tenant ID must be a valid UUID' }),
    candidateId: z.string().uuid({ message: 'Candidate ID must be a valid UUID' }),
    targetJobId: z.string().uuid({ message: 'Target Job ID must be a valid UUID' }),
    headline: z.string().trim().min(1).max(500),
    summary: z.string().trim().min(1).max(5000),
    summaryBullets: z.array(ResumeBulletSchema).default([]),
    skills: z.array(ResumeSkillCategorySchema).default([]),
    experience: z.array(ResumeExperienceEntrySchema).default([]),
    projects: z.array(ResumeProjectEntrySchema).default([]),
    education: z.array(ResumeEducationEntrySchema).default([]),
    certifications: z.array(ResumeCertificationEntrySchema).default([]),
    atsMatchScore: z.number().min(0).max(100).default(0.0),
    integrityStatus: IntegrityStatusEnum.default('PASS'),
    presentationMode: ResumePresentationModeEnum.default('GENERATE_NEW'),
    sourceDocumentId: z.string().nullable().optional(),
    templateId: ResumeTemplateIdEnum.nullable().optional(),
    presentationIntegrityStatus: PresentationIntegrityStatusEnum.default('PASS'),
    presentationAudit: PresentationAuditReportSchema.optional(),
    metadata: TailoredResumeMetadataSchema,
  })
  .strict();

// ===========================================================================
// P16-001A: Authoritative Structured Resume Contracts
// ===========================================================================

// ---------------------------------------------------------------------------
// 12. Provenance & Truth Category Enumerations
// ---------------------------------------------------------------------------

export const StructuredTruthCategoryEnum = z.enum([
  'VERIFIED',
  'CORROBORATED',
  'CLAIMED',
  'USER_PROVIDED',
  'INFERRED',
]);

export const StructuredResumeSectionTypeEnum = z.enum([
  'HEADER',
  'SUMMARY',
  'SKILLS',
  'EXPERIENCE',
  'PROJECTS',
  'DSA',
  'EDUCATION',
  'CERTIFICATIONS',
  'COURSEWORK',
  'PUBLICATIONS',
  'ACHIEVEMENTS',
  'ADDITIONAL_SKILLS',
  'AWARDS',
]);

// ---------------------------------------------------------------------------
// 13. Evidence Reference Contract
// ---------------------------------------------------------------------------

export const EvidenceReferenceSchema = z
  .object({
    sourceType: StructuredTruthCategoryEnum.default('USER_PROVIDED'),
    evidenceId: z.string().uuid().optional().nullable(),
    resourceId: z.string().optional().nullable(),
    resourceName: z.string().trim().max(255).optional().nullable(),
    filePath: z.string().trim().max(1000).optional().nullable(),
    commitSha: z.string().trim().max(100).optional().nullable(),
    evidenceType: z.string().trim().max(100).optional().nullable(),
    matchedRequirementId: z.string().optional().nullable(),
    confidenceScore: z.number().min(0).max(1).default(1.0),
    provenanceTrustClass: EvidenceTrustClassEnum.optional().nullable(),
    notes: z.string().trim().max(1000).optional().nullable(),
  })
  .strict();

export const EvidenceReference = EvidenceReferenceSchema;

// ---------------------------------------------------------------------------
// 14. Resume Tailoring Plan Contract
// ---------------------------------------------------------------------------

export const TailoredSelectedSkillSchema = z
  .object({
    slug: z.string().trim().min(1).max(255),
    name: z.string().trim().min(1).max(255),
    category: z.string().trim().min(1).max(100),
    provenanceStatus: StructuredTruthCategoryEnum,
    evidenceId: z.string().uuid().optional().nullable(),
    evidenceRef: EvidenceReferenceSchema.optional().nullable(),
    relevanceScore: z.number().min(0).max(100).default(0),
    matchedRequirementId: z.string().optional().nullable(),
    confidenceScore: z.number().min(0).max(1).default(1.0),
    order: z.number().int().nonnegative().optional(),
  })
  .strict();

export const ResumeTailoringPlanSchema = z
  .object({
    planId: z.string().uuid({ message: 'Plan ID must be a valid UUID' }),
    targetJobId: z.string().trim().optional().nullable(),
    targetRoleTitle: z.string().trim().min(1).max(255),
    targetCompany: z.string().trim().max(255).optional().nullable(),
    candidateArchetype: z.enum(['FRESHER', 'EXPERIENCED', 'CAREER_CHANGER']).default('EXPERIENCED'),
    pageTarget: z.enum(['ONE_PAGE_STRICT', 'TWO_PAGE_ALLOWED']).default('ONE_PAGE_STRICT'),
    sectionOrder: z.array(z.string().trim().min(1)).min(1),
    selectedProjectIds: z.array(z.string().trim()).default([]),
    selectedSkillSlugs: z.array(z.string().trim()).default([]),
    selectedSkills: z.array(TailoredSelectedSkillSchema).default([]),
    skillCategoryOrder: z.array(z.string().trim()).default([]),
    optionalSections: z
      .object({
        includeDsa: z.boolean().default(false),
        includeCertifications: z.boolean().default(false),
        includeCoursework: z.boolean().default(false),
        includePublications: z.boolean().default(false),
        includeAchievements: z.boolean().default(false),
        includeAdditionalSkills: z.boolean().default(false),
        includeAwards: z.boolean().default(false),
      })
      .default({}),
    summaryDirectives: z
      .object({
        focusAreas: z.array(z.string().trim()).default([]),
        keyHighlightedProjectIds: z.array(z.string().trim()).default([]),
        keyMatchedSkillSlugs: z.array(z.string().trim()).default([]),
      })
      .optional()
      .nullable(),
    createdAt: DateOrIsoStringSchema.optional(),
  })
  .strict();

export const ResumeTailoringPlan = ResumeTailoringPlanSchema;

// ---------------------------------------------------------------------------
// 15. Structured Tailored Resume Document Sub-Schemas
// ---------------------------------------------------------------------------

export const CandidateIdentitySnapshotSchema = z
  .object({
    displayName: z.string().trim().min(1).max(255),
    headline: z.string().trim().min(1).max(500),
    email: z.string().trim().email(),
    phone: z.string().trim().max(50).nullable().optional(),
    location: z.string().trim().max(255).nullable().optional(),
    links: z
      .array(
        z.object({
          label: z.string().trim().min(1).max(100),
          url: z.string().trim().url(),
          platform: z.enum(['LINKEDIN', 'GITHUB', 'PORTFOLIO', 'LEETCODE', 'OTHER']).default('OTHER'),
        })
      )
      .default([]),
  })
  .strict();

export const TailoredSummarySchema = z
  .object({
    text: z.string().trim().min(1).max(5000),
    referencedSkillSlugs: z.array(z.string().trim()).default([]),
    referencedProjectIds: z.array(z.string().trim()).default([]),
    evidenceRefs: z.array(EvidenceReferenceSchema).default([]),
    matchedRequirementIds: z.array(z.string().trim()).default([]),
    provenanceStatus: StructuredTruthCategoryEnum.default('CLAIMED'),
    provenance: EvidenceReferenceSchema.optional().nullable(),
  })
  .strict();

export const TailoredSkillItemSchema = z
  .object({
    name: z.string().trim().min(1).max(255),
    slug: z.string().trim().min(1).max(255),
    provenanceStatus: StructuredTruthCategoryEnum,
    evidenceId: z.string().uuid().optional().nullable(),
    sourceSkillId: z.string().optional().nullable(),
    confidenceScore: z.number().min(0).max(1).default(1.0),
    relevanceScore: z.number().min(0).max(100).default(0),
    matchedRequirementId: z.string().optional().nullable(),
  })
  .strict();

export const TailoredSkillsCategorySchema = z
  .object({
    categoryName: z.string().trim().min(1).max(100),
    skills: z.array(TailoredSkillItemSchema).default([]),
  })
  .strict();

export const TailoredProjectBulletSchema = z
  .object({
    text: z.string().trim().min(1).max(1000),
    evidenceRefs: z.array(EvidenceReferenceSchema).default([]),
    matchedRequirementIds: z.array(z.string().trim()).default([]),
    provenanceStatus: StructuredTruthCategoryEnum.default('VERIFIED'),
  })
  .strict();

export const TailoredProjectEntrySchema = z
  .object({
    projectId: z.string().trim().min(1),
    name: z.string().trim().min(1).max(255),
    displayName: z.string().trim().min(1).max(255),
    repositoryUrl: z.string().trim().url().nullable().optional(),
    liveUrl: z.string().trim().url().nullable().optional(),
    technologies: z.array(z.string().trim()).default([]),
    bullets: z.array(TailoredProjectBulletSchema).default([]),
    relevanceScore: z.number().min(0).max(100).default(0),
    rank: z.number().int().positive().optional().nullable(),
  })
  .strict();

export const SourceExperienceSnapshotSchema = z
  .object({
    id: z.string().trim().optional().nullable(),
    company: z.string().trim().min(1).max(255).nullable().optional(),
    title: z.string().trim().min(1).max(255).nullable().optional(),
    startDate: z.string().trim().max(50).nullable().optional(),
    endDate: z.string().trim().max(50).nullable().optional(),
    isCurrent: z.boolean().default(false),
    location: z.string().trim().max(255).nullable().optional(),
    bullets: z.array(z.string().trim().min(1)).default([]),
    provenanceStatus: z.literal('USER_PROVIDED').default('USER_PROVIDED'),
  })
  .strict();

export const SourceEducationSnapshotSchema = z
  .object({
    id: z.string().trim().optional().nullable(),
    institution: z.string().trim().min(1).max(255).nullable().optional(),
    degree: z.string().trim().min(1).max(255).nullable().optional(),
    fieldOfStudy: z.string().trim().max(255).nullable().optional(),
    startDate: z.string().trim().max(50).nullable().optional(),
    endDate: z.string().trim().max(50).nullable().optional(),
    grade: z.string().trim().max(50).nullable().optional(),
    coursework: z.array(z.string().trim()).default([]),
    provenanceStatus: z.literal('USER_PROVIDED').default('USER_PROVIDED'),
  })
  .strict();

export const SourceCertificationSnapshotSchema = z
  .object({
    id: z.string().trim().optional().nullable(),
    name: z.string().trim().min(1).max(255).nullable().optional(),
    issuingOrganization: z.string().trim().max(255).nullable().optional(),
    issueDate: z.string().trim().max(50).nullable().optional(),
    expirationDate: z.string().trim().max(50).nullable().optional(),
    credentialId: z.string().trim().max(255).nullable().optional(),
    credentialUrl: z.string().trim().url().nullable().optional(),
    provenanceStatus: z.literal('USER_PROVIDED').default('USER_PROVIDED'),
  })
  .strict();

export const SourceDsaSnapshotSchema = z
  .object({
    hasSection: z.boolean().default(false),
    profileUrl: z.string().trim().url().nullable().optional(),
    bullets: z.array(z.string().trim().min(1)).default([]),
    provenanceStatus: z.literal('CLAIMED').default('CLAIMED'),
  })
  .strict();

export const SourceOptionalSectionsSnapshotSchema = z
  .object({
    coursework: z.array(z.record(z.unknown())).default([]),
    publications: z.array(z.record(z.unknown())).default([]),
    achievements: z.array(z.record(z.unknown())).default([]),
    additionalSkills: z.array(z.record(z.unknown())).default([]),
    awards: z.array(z.record(z.unknown())).default([]),
  })
  .strict();

// ---------------------------------------------------------------------------
// 16. Root Structured Tailored Resume Document Schema
// ---------------------------------------------------------------------------

export const StructuredResumeDocumentSchema = z
  .object({
    documentId: z.string().uuid({ message: 'Document ID must be a valid UUID' }),
    schemaVersion: z.literal('2.0.0').default('2.0.0'),
    targetRole: z.string().trim().min(1).max(255),
    sectionOrder: z.array(z.string().trim().min(1)).min(1),
    candidateIdentity: CandidateIdentitySnapshotSchema,
    summary: TailoredSummarySchema,
    skills: z.object({
      categories: z.array(TailoredSkillsCategorySchema).default([]),
    }),
    projects: z.array(TailoredProjectEntrySchema).default([]),
    experience: z.array(SourceExperienceSnapshotSchema).default([]),
    education: z.array(SourceEducationSnapshotSchema).default([]),
    certifications: z.array(SourceCertificationSnapshotSchema).default([]),
    dsa: SourceDsaSnapshotSchema.nullable().optional(),
    optionalSections: SourceOptionalSectionsSnapshotSchema.default({}),
    tailoringPlan: ResumeTailoringPlanSchema.optional().nullable(),
    createdAt: DateOrIsoStringSchema.optional(),
  })
  .strict();

export const StructuredResumeDocument = StructuredResumeDocumentSchema;

// ---------------------------------------------------------------------------
// 17. Evidence Validation Receipt Schema
// ---------------------------------------------------------------------------

export const EvidenceViolationTypeEnum = z.enum([
  'SYNTHETIC_PLACEHOLDER_DETECTED',
  'UNBACKED_CLAIM',
  'FABRICATED_SKILL',
  'FABRICATED_PROJECT',
  'UNSUPPORTED_METRIC',
  'SENIORITY_INFLATION',
  'MISSING_REQUIRED_SOURCE',
  'SCHEMA_VALIDATION_ERROR',
]);

export const EvidenceViolationSchema = z
  .object({
    section: z.string().trim().min(1),
    field: z.string().trim().min(1),
    claimText: z.string().trim(),
    violationType: EvidenceViolationTypeEnum,
    message: z.string().trim().min(1),
  })
  .strict();

export const EvidenceValidationReceiptSchema = z
  .object({
    receiptId: z.string().uuid({ message: 'Receipt ID must be a valid UUID' }),
    documentId: z.string().uuid({ message: 'Document ID must be a valid UUID' }),
    packageHash: z.string().trim().optional().nullable(),
    overallStatus: z.enum(['PASS', 'FAIL', 'BLOCKED']),
    auditedAt: DateOrIsoStringSchema,
    summary: z.object({
      totalClaimsAudited: z.number().int().nonnegative(),
      verifiedClaimsCount: z.number().int().nonnegative(),
      corroboratedClaimsCount: z.number().int().nonnegative(),
      userProvidedClaimsCount: z.number().int().nonnegative(),
      claimedClaimsCount: z.number().int().nonnegative(),
      unbackedClaimsCount: z.number().int().nonnegative(),
    }),
    violations: z.array(EvidenceViolationSchema).default([]),
    provenanceIndex: z.record(z.array(z.string())).default({}),
  })
  .strict();

export const EvidenceValidationReceipt = EvidenceValidationReceiptSchema;

