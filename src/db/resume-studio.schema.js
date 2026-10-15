import { pgTable, uuid, text, integer, timestamp, index, primaryKey } from 'drizzle-orm/pg-core';
import { tenants, users, candidates } from './schema.js';

// Separate schema keeps draft persistence isolated from source/approval repair code.
// Cross-column scope and revision guards are defined by additive migration0022.
export const resumeStudioDrafts = pgTable(
  'resume_studio_drafts',
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
    sourceResumeId: uuid('source_resume_id').notNull(),
    sourceVersion: integer('source_version').notNull(),
    sourceContentHash: text('source_content_hash').notNull(),
    sourceSnapshotHash: text('source_snapshot_hash').notNull(),
    encryptedSource: text('encrypted_source').notNull(),
    revision: integer('revision').notNull().default(1),
    contentHash: text('content_hash').notNull(),
    encryptedContent: text('encrypted_content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_studio_drafts_owner').on(table.tenantId, table.userId, table.candidateId)]
);

export const resumeStudioRevisions = pgTable(
  'resume_studio_revisions',
  {
    draftId: uuid('draft_id')
      .notNull()
      .references(() => resumeStudioDrafts.id, { onDelete: 'cascade' }),
    revision: integer('revision').notNull(),
    contentHash: text('content_hash').notNull(),
    encryptedContent: text('encrypted_content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.draftId, table.revision] })]
);

export const resumeStudioProposals = pgTable(
  'resume_studio_proposals',
  {
    id: uuid('id').primaryKey(),
    draftId: uuid('draft_id')
      .notNull()
      .references(() => resumeStudioDrafts.id, { onDelete: 'cascade' }),
    baseRevision: integer('base_revision').notNull(),
    nodeId: uuid('node_id').notNull(),
    baseContentHash: text('base_content_hash').notNull(),
    sourceSnapshotHash: text('source_snapshot_hash').notNull(),
    payloadHash: text('payload_hash').notNull(),
    encryptedPayload: text('encrypted_payload').notNull(),
    status: text('status').notNull().default('PENDING'),
    decisionRevision: integer('decision_revision'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
  },
  (table) => [index('idx_studio_proposals_draft').on(table.draftId, table.baseRevision)]
);

export const resumeStudioDocuments = pgTable(
  'resume_studio_documents',
  {
    id: uuid('id').primaryKey(),
    draftId: uuid('draft_id')
      .notNull()
      .references(() => resumeStudioDrafts.id, { onDelete: 'cascade' }),
    revision: integer('revision').notNull(),
    contentHash: text('content_hash').notNull(),
    sourceSnapshotHash: text('source_snapshot_hash').notNull(),
    payloadHash: text('payload_hash').notNull(),
    encryptedPayload: text('encrypted_payload').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('idx_studio_documents_revision').on(table.draftId, table.revision)]
);
