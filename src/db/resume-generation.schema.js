import { pgTable, uuid, text, integer, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import {
  tenants,
  users,
  candidates,
  resumes,
  jobApplications,
  applicationPackages,
} from './schema.js';

/** Immutable, encrypted generations are distinct from the application's selected package. */
export const resumeGenerations = pgTable(
  'resume_generations',
  {
    id: uuid('id').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    candidateId: uuid('candidate_id')
      .notNull()
      .references(() => candidates.id, { onDelete: 'cascade' }),
    sourceResumeId: uuid('source_resume_id')
      .notNull()
      .references(() => resumes.id, { onDelete: 'cascade' }),
    sourceVersion: integer('source_version').notNull(),
    sourceContentHash: text('source_content_hash').notNull(),
    parentGenerationId: uuid('parent_generation_id').references(() => resumeGenerations.id),
    applicationId: uuid('application_id').references(() => jobApplications.id, {
      onDelete: 'set null',
    }),
    applicationPackageId: uuid('application_package_id').references(() => applicationPackages.id, {
      onDelete: 'set null',
    }),
    origin: text('origin').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    requestHash: text('request_hash').notNull(),
    contentHash: text('content_hash').notNull(),
    payloadHash: text('payload_hash').notNull(),
    encryptedPayload: text('encrypted_payload').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('resume_generations_owner_request_unique').on(
      table.tenantId,
      table.candidateId,
      table.idempotencyKey
    ),
    index('idx_resume_generations_owner').on(
      table.tenantId,
      table.userId,
      table.candidateId,
      table.createdAt
    ),
    index('idx_resume_generations_user').on(table.userId),
    index('idx_resume_generations_candidate').on(table.candidateId),
    index('idx_resume_generations_source').on(table.sourceResumeId),
    index('idx_resume_generations_parent').on(table.parentGenerationId),
    index('idx_resume_generations_application').on(table.applicationId),
    index('idx_resume_generations_package').on(table.applicationPackageId),
  ]
);
