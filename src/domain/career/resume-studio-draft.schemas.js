import { z } from 'zod';
import { StudioJobTargetSchema } from './resume-studio.schemas.js';
import {
  SourceDsaSnapshotSchema,
  SourceExperienceSnapshotSchema,
  SourceEducationSnapshotSchema,
  SourceCertificationSnapshotSchema,
  SourceOptionalSectionsSnapshotSchema,
} from './resume.schemas.js';
import { JobDescriptionSchema } from './job-description.schemas.js';
import { JobRequirementSchema } from './job-requirement.schemas.js';

export const STUDIO_DRAFT_CONTRACT_VERSION = '1.1.0';
const id = z.string().uuid();
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const nullableText = (max) => z.string().trim().max(max).nullable();

export const StudioDraftContentSchema = z
  .object({
    documentId: id,
    schemaVersion: z.literal('studio-draft/1.0.0'),
    targetRole: z.string().max(255).optional(),
    sectionOrder: z.array(z.string()).optional(),
    dsa: SourceDsaSnapshotSchema.nullable().optional(),
    candidateIdentity: z
      .object({
        displayName: nullableText(255),
        headline: nullableText(500),
        email: z.string().email().nullable(),
        phone: nullableText(50),
        location: nullableText(255),
        links: z.array(z.object({ label: z.string(), url: z.string().url() }).strict()),
      })
      .strict(),
    summary: z
      .object({ text: z.string().trim().max(5000), provenanceStatus: z.literal('CLAIMED') })
      .strict(),
    experience: z.array(SourceExperienceSnapshotSchema),
    education: z.array(SourceEducationSnapshotSchema),
    certifications: z.array(SourceCertificationSnapshotSchema),
    optionalSections: SourceOptionalSectionsSnapshotSchema,
    projects: z.array(
      z
        .object({
          id: z.string().min(1),
          name: z.string().trim().min(1).max(255),
          description: nullableText(8000),
          technologies: z.array(z.string().trim().min(1).max(255)),
          bullets: z.array(z.string().trim().min(1).max(2000)),
          urls: z.array(z.string().url()),
          provenanceStatus: z.literal('CLAIMED'),
          sourceFields: z.record(z.unknown()),
        })
        .strict()
    ),
    skills: z.array(
      z
        .object({
          id: z.string().min(1),
          name: z.string().trim().min(1).max(255),
          provenanceStatus: z.literal('CLAIMED'),
          sourceFields: z.record(z.unknown()),
        })
        .strict()
    ),
  })
  .strict();

export const StudioDraftParamsSchema = z.object({ id }).strict();
export const StudioCreateDraftRequestSchema = z.union([
  z.object({ generationId: id }).strict(),
  z
    .object({
      source: z.object({ kind: z.literal('RESUME'), resumeId: id }).strict(),
      jobTarget: StudioJobTargetSchema.extend({
        rawDescription: z.string().trim().min(100).max(250000),
      }),
    })
    .strict(),
  z
    .object({
      source: z.object({ kind: z.literal('RESUME'), resumeId: id }).strict(),
      applicationId: id,
      jobTarget: StudioJobTargetSchema.extend({
        rawDescription: z.string().trim().min(1).max(250000),
      }).optional(),
    })
    .strict(),
]);
const ids = (max = 10000) =>
  z
    .array(id)
    .max(max)
    .refine((values) => new Set(values).size === values.length, 'Duplicate selection IDs');
export const StudioDraftSelectionSchema = z
  .object({
    experienceIds: ids(),
    projectIds: ids(4),
    bulletIds: ids(),
    skillIds: ids(),
  })
  .strict();
export const StudioUpdateDraftRequestSchema = z
  .object({
    expectedRevision: z.number().int().min(1).max(2147483646),
    edits: z
      .array(z.object({ nodeId: id, text: z.string().max(8000).nullable() }).strict())
      .min(1)
      .max(200)
      .optional(),
    selection: StudioDraftSelectionSchema.partial()
      .refine((value) => Object.keys(value).length > 0, 'Provide a selection field')
      .optional(),
  })
  .strict()
  .refine((value) => value.edits || value.selection, 'Provide edits or selection');

export const StudioDraftNodeSchema = z
  .object({
    nodeId: id,
    kind: z.enum(['IDENTITY', 'SUMMARY', 'EXPERIENCE', 'PROJECT', 'SKILL', 'BULLET', 'TEXT']),
    path: z.array(z.union([z.string(), z.number().int().nonnegative()])),
    parentId: id.nullable(),
    editable: z.boolean(),
  })
  .strict();
export const StudioDraftResponseSchema = z
  .object({
    contractVersion: z.literal(STUDIO_DRAFT_CONTRACT_VERSION),
    id,
    candidateId: id,
    revision: z.number().int().positive(),
    status: z.literal('DRAFT'),
    generation: z
      .object({ id, contentHash: hash, parentGenerationId: id.nullable(), origin: z.string() })
      .strict()
      .optional(),
    sourceResumeId: id,
    sourceVersion: z.number().int().positive(),
    sourceContentHash: hash,
    sourceSnapshotHash: hash,
    contentHash: hash,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    jobTarget: StudioJobTargetSchema.extend({
      rawDescription: z.string().trim().min(10).max(250000),
    }),
    jobDescription: JobDescriptionSchema.extend({ requirements: z.array(JobRequirementSchema) }),
    warnings: z.array(
      z.object({ code: z.literal('JOB_DESCRIPTION_TRUNCATED'), message: z.string() }).strict()
    ),
    masterSnapshot: StudioDraftContentSchema,
    structuredResume: StudioDraftContentSchema,
    nodes: z.array(StudioDraftNodeSchema),
    nodeProvenance: z.record(
      id,
      z
        .object({
          truthState: z.literal('CLAIMED'),
          editedAtRevision: z.number().int().positive().nullable(),
        })
        .strict()
    ),
    selection: StudioDraftSelectionSchema,
  })
  .strict();
