/**
 * @file Database Schema Definition (Core Identity Foundation)
 *
 * Implements the core multi-tenant identity domain schema for:
 * 1. tenants
 * 2. users
 * 3. sessions
 * 4. audit_logs
 *
 * Strict adherence to docs/schema-review.md and docs/data-model.md.
 */

import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  jsonb,
  boolean,
  integer,
  real,
  date,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// ---------------------------------------------------------------------------
// Enumerations
// ---------------------------------------------------------------------------

/**
 * Tenant subscription tier levels.
 */
export const tenantTierEnum = pgEnum('tenant_tier', ['FREE', 'PRO', 'ENTERPRISE']);

/**
 * User RBAC role classifications.
 */
export const userRoleEnum = pgEnum('user_role', ['OWNER', 'MEMBER', 'READONLY']);

/**
 * User account lifecycle states.
 */
export const userStatusEnum = pgEnum('user_status', ['ACTIVE', 'SUSPENDED', 'DELETED']);

/**
 * Supported third-party resource providers.
 */
export const resourceProviderEnum = pgEnum('resource_provider', [
  'GITHUB_APP',
  'GITLAB',
  'GOOGLE_DRIVE',
  'ONEDRIVE',
  'NOTION',
  'CUSTOM_API',
  'LINKEDIN',
  'GOOGLE',
  'MANUAL',
]);

/**
 * Authentication / authorization credential mechanisms.
 */
export const connectionAuthTypeEnum = pgEnum('connection_auth_type', [
  'APP_INSTALLATION',
  'OAUTH2_CODE',
  'API_KEY',
  'SERVICE_ACCOUNT',
]);

/**
 * Resource connection lifecycle states.
 */
export const resourceConnectionStatusEnum = pgEnum('resource_connection_status', [
  'PENDING',
  'ACTIVE',
  'EXPIRED',
  'REVOKED',
  'ERROR',
  'DISCONNECTED',
]);

/**
 * Candidate profile lifecycle states.
 */
export const candidateStatusEnum = pgEnum('candidate_status', ['ACTIVE', 'ARCHIVED', 'SUSPENDED']);

/**
 * Provider-neutral resource classifications.
 */
export const resourceTypeEnum = pgEnum('resource_type', [
  'REPOSITORY',
  'DOCUMENT',
  'PROFILE',
  'PORTFOLIO_SITE',
]);

/**
 * Resource sync/availability lifecycle states.
 */
export const resourceStatusEnum = pgEnum('resource_status', [
  'ACTIVE',
  'DISCONNECTED',
  'DELETED',
  'ERROR',
]);

/**
 * Skill taxonomy categories.
 */
export const skillCategoryEnum = pgEnum('skill_category', [
  'LANGUAGE',
  'FRAMEWORK',
  'DATABASE',
  'CLOUD_DEVOPS',
  'TOOL',
  'ARCHITECTURE',
  'CONCEPT',
]);

/**
 * Provenance / proof certainty states.
 */
export const provenanceStatusEnum = pgEnum('provenance_status', [
  'VERIFIED',
  'INFERRED',
  'CLAIMED',
  'MISSING',
]);

/**
 * MCP API token lifecycle states.
 */
export const mcpTokenStatusEnum = pgEnum('mcp_token_status', ['ACTIVE', 'REVOKED', 'EXPIRED']);

/**
 * MCP client authorization types.
 */
export const mcpClientTypeEnum = pgEnum('mcp_client_type', ['PERSONAL', 'THIRD_PARTY']);

/**
 * Action approval ticket lifecycle states (P9-002 / ARCH-032 / ADR-053).
 */
export const approvalTicketStatusEnum = pgEnum('approval_ticket_status', [
  'PENDING',
  'APPROVED',
  'EXECUTING',
  'EXECUTED',
  'REJECTED',
  'CANCELLED',
  'EXPIRED',
  'FAILED',
]);

/**
 * Foundational evidence type classifications.
 */
export const evidenceTypeEnum = pgEnum('evidence_type', [
  'PACKAGE_MANIFEST_DEPENDENCY',
  'CODE_IMPORT_USAGE',
  'FILE_PATTERN_MATCH',
  'COMMIT_CONTRIBUTION',
  'README_SPECIFICATION',
  'DIRECTORY_STRUCTURE',
  'DOCUMENT_CLAIM',
]);

/**
 * Job application lifecycle status classifications (Phase 12 / ARCH-043 / ADR-064).
 */
export const applicationStatusEnum = pgEnum('application_status', [
  'SAVED',
  'APPLIED',
  'SCREENING',
  'INTERVIEWING',
  'OFFER_RECEIVED',
  'OFFER_ACCEPTED',
  'REJECTED',
  'WITHDRAWN',
  'ARCHIVED',
]);

/**
 * Application interview & assessment stage classifications (Phase 12 / ARCH-043 / ADR-064).
 */
export const stageTypeEnum = pgEnum('stage_type', [
  'DISCOVERY',
  'RESUME_SUBMITTED',
  'RECRUITER_SCREEN',
  'TECHNICAL_ASSESSMENT',
  'SYSTEM_DESIGN',
  'BEHAVIORAL',
  'ONSITE_LOOP',
  'OFFER_NEGOTIATION',
  'POST_OFFER',
  'OTHER',
]);

/**
 * Application stage outcome classifications.
 */
export const stageOutcomeEnum = pgEnum('stage_outcome', [
  'PENDING',
  'PASSED',
  'FAILED',
  'SKIPPED',
  'RESCHEDULED',
]);

/**
 * Tailored document artifact types attached to job applications.
 */
export const tailoredDocumentTypeEnum = pgEnum('tailored_document_type', [
  'TAILORED_RESUME',
  'TAILORED_COVER_LETTER',
  'PORTFOLIO_RECOMMENDATION',
  'CUSTOM_NOTE',
]);

/**
 * Resume document lifecycle states (Phase 13.5 / ARCH-052 / ADR-072).
 */
export const resumeLifecycleStateEnum = pgEnum('resume_lifecycle_state', [
  'SOURCE',
  'PARSED',
  'USER_APPROVED',
  'BASE_RESUME',
  'ARCHIVED',
]);

/**
 * Parsed resume section classifications (Phase 13.5 / ARCH-052 / ADR-072).
 */
export const resumeSectionTypeEnum = pgEnum('resume_section_type', [
  'SUMMARY',
  'WORK_EXPERIENCE',
  'EDUCATION',
  'SKILLS',
  'PROJECTS',
  'CERTIFICATIONS',
  'CONTACT_INFO',
  'OTHER',
]);

// ---------------------------------------------------------------------------
// 1. Tenants Table (Multi-Tenant Workspace Root)
// ---------------------------------------------------------------------------

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  tier: tenantTierEnum('tier').default('FREE').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// 2. Users Table (Identity & Account)
// ---------------------------------------------------------------------------

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    displayName: text('display_name').notNull(),
    role: userRoleEnum('role').default('MEMBER').notNull(),
    avatarUrl: text('avatar_url'),
    status: userStatusEnum('status').default('ACTIVE').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('users_tenant_email_unique').on(table.tenantId, table.email),
    index('idx_users_tenant_id').on(table.tenantId),
  ]
);

// ---------------------------------------------------------------------------
// 3. Sessions Table (Web UI Authentication)
// ---------------------------------------------------------------------------

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(), // 64-character SHA-256 hash of random session secret
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    lastActiveAt: timestamp('last_active_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_sessions_user_id').on(table.userId),
    index('idx_sessions_expires_at').on(table.expiresAt),
  ]
);

// ---------------------------------------------------------------------------
// 4. Audit Logs Table (Compliance & Security Ledger)
// ---------------------------------------------------------------------------

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    eventType: text('event_type').notNull(),
    resourceType: text('resource_type').notNull(),
    resourceId: text('resource_id'),
    requestId: text('request_id'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    details: jsonb('details').default('{}').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_audit_logs_tenant_created').on(table.tenantId, table.createdAt.desc()),
    index('idx_audit_logs_tenant_event').on(table.tenantId, table.eventType),
    index('idx_audit_logs_request_id').on(table.requestId),
  ]
);

// ---------------------------------------------------------------------------
// 5. Resource Connections Table (Authorized Third-Party Connectors)
// ---------------------------------------------------------------------------

export const resourceConnections = pgTable(
  'resource_connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: resourceProviderEnum('provider').notNull(),
    authType: connectionAuthTypeEnum('auth_type').notNull(),
    displayName: text('display_name').notNull(),
    externalAccountId: text('external_account_id').notNull(),
    externalAccountName: text('external_account_name'),
    installationId: text('installation_id'),
    encryptedCredentials: text('encrypted_credentials').notNull(),
    keyVersion: text('key_version').notNull().default('v1'),
    status: resourceConnectionStatusEnum('status').notNull().default('PENDING'),
    scopes: jsonb('scopes').default('[]').notNull(),
    metadata: jsonb('metadata').default('{}').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    refreshedAt: timestamp('refreshed_at', { withTimezone: true }),
    lastValidatedAt: timestamp('last_validated_at', { withTimezone: true }),
    lastErrorCode: text('last_error_code'),
    lastErrorAt: timestamp('last_error_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('resource_connections_tenant_provider_account_unique').on(
      table.tenantId,
      table.provider,
      table.externalAccountId
    ),
    index('idx_resource_connections_tenant_id').on(table.tenantId),
    index('idx_resource_connections_user_id').on(table.userId),
    index('idx_resource_connections_tenant_status').on(table.tenantId, table.status),
    index('idx_resource_connections_expires_at').on(table.expiresAt),
    index('idx_resource_connections_key_version').on(table.keyVersion),
  ]
);

// ---------------------------------------------------------------------------
// 6. Candidates Table (Canonical Domain Persona)
// ---------------------------------------------------------------------------

export const candidates = pgTable(
  'candidates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    displayName: text('display_name').notNull(),
    headline: text('headline'),
    summary: text('summary'),
    canonicalEmail: text('canonical_email'),
    profileMetadata: jsonb('profile_metadata').default('{}').notNull(),
    status: candidateStatusEnum('status').default('ACTIVE').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_candidates_tenant_id').on(table.tenantId),
    index('idx_candidates_tenant_user').on(table.tenantId, table.userId),
  ]
);

// ---------------------------------------------------------------------------
// 7. Candidate Identities Table (Linked External Accounts)
// ---------------------------------------------------------------------------

export const candidateIdentities = pgTable(
  'candidate_identities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    candidateId: uuid('candidate_id')
      .notNull()
      .references(() => candidates.id, { onDelete: 'cascade' }),
    provider: resourceProviderEnum('provider').notNull(),
    externalAccountId: text('external_account_id').notNull(),
    externalUsername: text('external_username'),
    externalEmail: text('external_email'),
    profileUrl: text('profile_url'),
    avatarUrl: text('avatar_url'),
    verified: boolean('verified').default(false).notNull(),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    metadata: jsonb('metadata').default('{}').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('candidate_identities_tenant_provider_account_unique').on(
      table.tenantId,
      table.provider,
      table.externalAccountId
    ),
    index('idx_candidate_identities_tenant_id').on(table.tenantId),
    index('idx_candidate_identities_tenant_candidate').on(table.tenantId, table.candidateId),
  ]
);

// ---------------------------------------------------------------------------
// 8. Resources Table (Provider-Neutral External Resource Catalog)
// ---------------------------------------------------------------------------

export const resources = pgTable(
  'resources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    connectionId: uuid('connection_id').references(() => resourceConnections.id, {
      onDelete: 'set null',
    }),
    candidateId: uuid('candidate_id').references(() => candidates.id, {
      onDelete: 'set null',
    }),
    provider: resourceProviderEnum('provider').notNull(),
    resourceType: resourceTypeEnum('resource_type').default('REPOSITORY').notNull(),
    externalResourceId: text('external_resource_id').notNull(),
    name: text('name').notNull(),
    displayName: text('display_name').notNull(),
    url: text('url'),
    isPrivate: boolean('is_private').default(false).notNull(),
    status: resourceStatusEnum('status').default('ACTIVE').notNull(),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    metadata: jsonb('metadata').default('{}').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('resources_tenant_provider_external_id_unique').on(
      table.tenantId,
      table.provider,
      table.externalResourceId
    ),
    index('idx_resources_tenant_id').on(table.tenantId),
    index('idx_resources_tenant_candidate').on(table.tenantId, table.candidateId),
    index('idx_resources_tenant_connection').on(table.tenantId, table.connectionId),
  ]
);

// ---------------------------------------------------------------------------
// 9. Projects Table (Domain-Level Initiatives)
// ---------------------------------------------------------------------------

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    candidateId: uuid('candidate_id')
      .notNull()
      .references(() => candidates.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    headline: text('headline'),
    summary: text('summary'),
    role: text('role'),
    isHighlighted: boolean('is_highlighted').default(false).notNull(),
    startDate: date('start_date'),
    endDate: date('end_date'),
    metadata: jsonb('metadata').default('{}').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('projects_tenant_candidate_slug_unique').on(
      table.tenantId,
      table.candidateId,
      table.slug
    ),
    index('idx_projects_tenant_id').on(table.tenantId),
    index('idx_projects_tenant_candidate').on(table.tenantId, table.candidateId),
  ]
);

// ---------------------------------------------------------------------------
// 10. Project Resources Table (Project <-> Resource Many-to-Many Join)
// ---------------------------------------------------------------------------

export const projectResources = pgTable(
  'project_resources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    resourceId: uuid('resource_id')
      .notNull()
      .references(() => resources.id, { onDelete: 'cascade' }),
    roleInProject: text('role_in_project'),
    metadata: jsonb('metadata').default('{}').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('project_resources_project_resource_unique').on(table.projectId, table.resourceId),
    index('idx_project_resources_tenant_id').on(table.tenantId),
    index('idx_project_resources_tenant_project').on(table.tenantId, table.projectId),
    index('idx_project_resources_tenant_resource').on(table.tenantId, table.resourceId),
  ]
);

// ---------------------------------------------------------------------------
// 11. Skills Table (Global Canonical Taxonomy)
// ---------------------------------------------------------------------------

export const skills = pgTable(
  'skills',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    category: skillCategoryEnum('category').notNull(),
    aliases: jsonb('aliases').default('[]').notNull(),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('skills_slug_unique').on(table.slug),
    index('idx_skills_category').on(table.category),
  ]
);

// ---------------------------------------------------------------------------
// 12. Candidate Skills Table (Candidate Skill Assertions & Rollup)
// ---------------------------------------------------------------------------

export const candidateSkills = pgTable(
  'candidate_skills',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    candidateId: uuid('candidate_id')
      .notNull()
      .references(() => candidates.id, { onDelete: 'cascade' }),
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'restrict' }),
    category: skillCategoryEnum('category').notNull(),
    provenanceStatus: provenanceStatusEnum('provenance_status').default('CLAIMED').notNull(),
    confidenceScore: real('confidence_score').default(0.0).notNull(),
    evidenceCount: integer('evidence_count').default(0).notNull(),
    primaryEvidenceId: uuid('primary_evidence_id'),
    firstObservedAt: timestamp('first_observed_at', { withTimezone: true }),
    lastObservedAt: timestamp('last_observed_at', { withTimezone: true }),
    metadata: jsonb('metadata').default('{}').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('candidate_skills_tenant_candidate_skill_unique').on(
      table.tenantId,
      table.candidateId,
      table.skillId
    ),
    index('idx_candidate_skills_tenant_id').on(table.tenantId),
    index('idx_candidate_skills_tenant_candidate').on(table.tenantId, table.candidateId),
    index('idx_candidate_skills_tenant_skill').on(table.tenantId, table.skillId),
    index('idx_candidate_skills_provenance').on(table.tenantId, table.provenanceStatus),
  ]
);

// ---------------------------------------------------------------------------
// 13. Evidence Items Table (Immutable Provenance Nodes)
// ---------------------------------------------------------------------------

export const evidenceItems = pgTable(
  'evidence_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    candidateId: uuid('candidate_id')
      .notNull()
      .references(() => candidates.id, { onDelete: 'cascade' }),
    resourceId: uuid('resource_id')
      .notNull()
      .references(() => resources.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    skillId: uuid('skill_id').references(() => skills.id, { onDelete: 'set null' }),
    evidenceType: evidenceTypeEnum('evidence_type').notNull(),
    sourceProvider: resourceProviderEnum('source_provider').notNull(),
    sourceLocation: jsonb('source_location').notNull(),
    excerpt: text('excerpt'),
    confidenceScore: real('confidence_score').default(1.0).notNull(),
    detectedAt: timestamp('detected_at', { withTimezone: true }).defaultNow().notNull(),
    metadata: jsonb('metadata').default('{}').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_evidence_items_tenant_id').on(table.tenantId),
    index('idx_evidence_items_tenant_candidate').on(table.tenantId, table.candidateId),
    index('idx_evidence_items_tenant_resource').on(table.tenantId, table.resourceId),
    index('idx_evidence_items_tenant_project').on(table.tenantId, table.projectId),
    index('idx_evidence_items_tenant_skill').on(table.tenantId, table.skillId),
  ]
);

// ---------------------------------------------------------------------------
// 14. MCP API Tokens Table (Dedicated Model Context Protocol Credentials)
// ---------------------------------------------------------------------------

export const mcpApiTokens = pgTable(
  'mcp_api_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    tokenPrefix: text('token_prefix').notNull(),
    tokenHash: text('token_hash').notNull(),
    scopes: jsonb('scopes').default('[]').notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    status: mcpTokenStatusEnum('status').default('ACTIVE').notNull(),
    clientType: mcpClientTypeEnum('client_type').default('PERSONAL').notNull(),
  },
  (table) => [
    uniqueIndex('mcp_api_tokens_token_hash_unique').on(table.tokenHash),
    index('idx_mcp_api_tokens_tenant_id').on(table.tenantId),
    index('idx_mcp_api_tokens_user_id').on(table.userId),
    index('idx_mcp_api_tokens_tenant_status').on(table.tenantId, table.status),
    index('idx_mcp_api_tokens_user_status').on(table.userId, table.status),
    index('idx_mcp_api_tokens_expires_at').on(table.expiresAt),
  ]
);

/**
 * Two-phase action approval tickets (P9-002 / ARCH-032 / ADR-053).
 */
export const actionApprovalTickets = pgTable(
  'action_approval_tickets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    candidateId: uuid('candidate_id')
      .notNull()
      .references(() => candidates.id, { onDelete: 'cascade' }),
    resourceId: uuid('resource_id')
      .notNull()
      .references(() => resourceConnections.id, { onDelete: 'cascade' }),
    proposalId: uuid('proposal_id').notNull(),

    // Action Parameters & Git Constraints
    actionType: text('action_type').notNull().default('PROJECT_IMPROVEMENT_PR'),
    repositoryName: text('repository_name').notNull(),
    baseBranch: text('base_branch').notNull().default('main'),
    targetBranch: text('target_branch').notNull(),
    expectedHeadSha: text('expected_head_sha').notNull(),

    // Cryptographic Binding & Integrity
    patchFingerprint: text('patch_fingerprint').notNull(),
    patchSummary: jsonb('patch_summary').notNull(),
    hmacSignature: text('hmac_signature').notNull(),

    // State Machine & Audit Details
    status: approvalTicketStatusEnum('status').notNull().default('PENDING'),
    rejectionReason: text('rejection_reason'),
    failureReason: text('failure_reason'),

    // Human Approval Tracking
    approvedByUserId: uuid('approved_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    approvedAt: timestamp('approved_at', { withTimezone: true }),

    // Execution Tracking
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    executedAt: timestamp('executed_at', { withTimezone: true }),
    idempotencyKey: text('idempotency_key'),
    executionResult: jsonb('execution_result'),

    // Timestamps
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('idx_approval_tickets_tenant_status').on(table.tenantId, table.status),
    index('idx_approval_tickets_candidate').on(table.candidateId),
    index('idx_approval_tickets_resource').on(table.resourceId),
    index('idx_approval_tickets_expires_at').on(table.expiresAt),
    uniqueIndex('uq_approval_tickets_idempotency').on(table.tenantId, table.idempotencyKey),
  ]
);

// ---------------------------------------------------------------------------
// OAuth 2.1 & Remote MCP Authorization (P10-001)
// ---------------------------------------------------------------------------

/**
 * OAuth client type classification.
 */
export const oauthClientTypeEnum = pgEnum('oauth_client_type', ['PUBLIC', 'CONFIDENTIAL']);

/**
 * Registered OAuth 2.1 Clients (e.g. Anthropic Claude).
 */
export const oauthClients = pgTable(
  'oauth_clients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    clientId: text('client_id').notNull().unique(),
    clientName: text('client_name').notNull(),
    clientType: oauthClientTypeEnum('client_type').notNull().default('PUBLIC'),
    redirectUris: jsonb('redirect_uris').notNull(), // string[]
    allowedGrantTypes: jsonb('allowed_grant_types').notNull(), // string[]
    allowedScopes: jsonb('allowed_scopes').notNull(), // string[]
    isTrusted: boolean('is_trusted').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('uq_oauth_clients_client_id').on(table.clientId)]
);

/**
 * Single-use OAuth 2.1 Authorization Codes with PKCE (S256).
 */
export const oauthAuthorizationCodes = pgTable(
  'oauth_authorization_codes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    codeHash: text('code_hash').notNull().unique(),
    clientId: text('client_id').notNull(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    redirectUri: text('redirect_uri').notNull(),
    resource: text('resource').notNull().default('http://localhost:3000/mcp'),
    codeChallenge: text('code_challenge').notNull(),
    codeChallengeMethod: text('code_challenge_method').notNull().default('S256'),
    scopes: jsonb('scopes').notNull(), // string[]
    isConsumed: boolean('is_consumed').notNull().default(false),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_oauth_auth_codes_lookup').on(table.clientId, table.codeHash),
    index('idx_oauth_auth_codes_expires_at').on(table.expiresAt),
    index('idx_oauth_auth_codes_tenant_user').on(table.tenantId, table.userId),
  ]
);

/**
 * OAuth 2.1 Access & Refresh Tokens with Rotation & Revocation.
 */
export const oauthTokens = pgTable(
  'oauth_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    clientId: text('client_id').notNull(),
    accessTokenHash: text('access_token_hash').notNull().unique(),
    refreshTokenHash: text('refresh_token_hash').unique(),
    familyId: uuid('family_id').notNull(),
    resource: text('resource').notNull().default('http://localhost:3000/mcp'),
    tokenScopes: jsonb('token_scopes').notNull(), // string[]
    isRevoked: boolean('is_revoked').notNull().default(false),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }).notNull(),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_oauth_tokens_access_hash').on(table.accessTokenHash),
    index('idx_oauth_tokens_refresh_hash').on(table.refreshTokenHash),
    index('idx_oauth_tokens_family_id').on(table.familyId),
    index('idx_oauth_tokens_tenant_user').on(table.tenantId, table.userId),
    index('idx_oauth_tokens_expires_at').on(table.accessTokenExpiresAt),
  ]
);

// ---------------------------------------------------------------------------
// 18. Job Applications Table (Root Application Aggregate - Phase 12 / ARCH-043)
// ---------------------------------------------------------------------------

export const jobApplications = pgTable(
  'job_applications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    candidateId: uuid('candidate_id')
      .notNull()
      .references(() => candidates.id, { onDelete: 'cascade' }),
    companyName: text('company_name').notNull(),
    jobTitle: text('job_title').notNull(),
    jobUrl: text('job_url'),
    source: text('source').notNull().default('MANUAL'),
    location: text('location'),
    workplaceType: text('workplace_type'),
    employmentType: text('employment_type'),
    rawJobDescription: text('raw_job_description'),
    parsedJobDescription: jsonb('parsed_job_description'),
    atsFitSnapshot: jsonb('ats_fit_snapshot'),
    status: applicationStatusEnum('status').notNull().default('SAVED'),
    appliedAt: timestamp('applied_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    compensation: jsonb('compensation').notNull().default('{}'),
    notes: text('notes'),
    metadata: jsonb('metadata').notNull().default('{}'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_job_applications_tenant_id').on(table.tenantId),
    index('idx_job_applications_tenant_candidate').on(table.tenantId, table.candidateId),
    index('idx_job_applications_tenant_status').on(table.tenantId, table.status),
    index('idx_job_applications_tenant_company').on(table.tenantId, table.companyName),
    index('idx_job_applications_tenant_applied').on(table.tenantId, table.appliedAt.desc()),
  ]
);

// ---------------------------------------------------------------------------
// 19. Application Stages Table (Chronological Interview Log - Phase 12 / ARCH-043)
// ---------------------------------------------------------------------------

export const applicationStages = pgTable(
  'application_stages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => jobApplications.id, { onDelete: 'cascade' }),
    stageType: stageTypeEnum('stage_type').notNull(),
    title: text('title').notNull(),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    outcome: stageOutcomeEnum('outcome').notNull().default('PENDING'),
    interviewerNames: jsonb('interviewer_names').notNull().default('[]'),
    feedback: text('feedback'),
    orderIndex: integer('order_index').notNull().default(0),
    metadata: jsonb('metadata').notNull().default('{}'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_application_stages_tenant_application').on(table.tenantId, table.applicationId),
    index('idx_application_stages_app_order').on(table.applicationId, table.orderIndex),
  ]
);

// ---------------------------------------------------------------------------
// 20. Tailored Documents Table (Immutable Application Snapshots - Phase 12 / ARCH-043)
// ---------------------------------------------------------------------------

export const tailoredDocuments = pgTable(
  'tailored_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    applicationId: uuid('application_id')
      .notNull()
      .references(() => jobApplications.id, { onDelete: 'cascade' }),
    candidateId: uuid('candidate_id')
      .notNull()
      .references(() => candidates.id, { onDelete: 'cascade' }),
    documentType: tailoredDocumentTypeEnum('document_type').notNull(),
    version: integer('version').notNull().default(1),
    title: text('title').notNull(),
    content: jsonb('content').notNull(),
    renderedMarkdown: text('rendered_markdown'),
    renderedPlainText: text('rendered_plain_text'),
    contentHash: text('content_hash').notNull(),
    citationRefs: jsonb('citation_refs').notNull().default('[]'),
    integrityScore: real('integrity_score'),
    atsFitScore: real('ats_fit_score'),
    metadata: jsonb('metadata').notNull().default('{}'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_tailored_docs_tenant_application').on(table.tenantId, table.applicationId),
    index('idx_tailored_docs_tenant_candidate').on(table.tenantId, table.candidateId),
    index('idx_tailored_docs_content_hash').on(table.contentHash),
  ]
);

// ---------------------------------------------------------------------------
// 21. Resumes Table (Source Upload & Version Lifecycle - Phase 13.5 / ARCH-052)
// ---------------------------------------------------------------------------

export const resumes = pgTable(
  'resumes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    candidateId: uuid('candidate_id')
      .notNull()
      .references(() => candidates.id, { onDelete: 'cascade' }),
    version: integer('version').notNull().default(1),
    fileName: text('file_name').notNull(),
    fileSizeBytes: integer('file_size_bytes').notNull(),
    mimeType: text('mime_type').notNull(),
    contentHash: text('content_hash').notNull(),
    storageKey: text('storage_key').notNull(),
    lifecycleState: resumeLifecycleStateEnum('lifecycle_state').notNull().default('SOURCE'),
    isBaseResume: boolean('is_base_resume').notNull().default(false),
    parseError: text('parse_error'),
    parsedAt: timestamp('parsed_at', { withTimezone: true }),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    metadata: jsonb('metadata').notNull().default('{}'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_resumes_tenant_candidate').on(table.tenantId, table.candidateId),
    index('idx_resumes_tenant_state').on(table.tenantId, table.lifecycleState),
    index('idx_resumes_content_hash').on(table.contentHash),
    index('idx_resumes_candidate_version').on(table.candidateId, table.version),
  ]
);

// ---------------------------------------------------------------------------
// 22. Resume Sections Table (Structured Parsed Artifacts - Phase 13.5 / ARCH-052)
// ---------------------------------------------------------------------------

export const resumeSections = pgTable(
  'resume_sections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    resumeId: uuid('resume_id')
      .notNull()
      .references(() => resumes.id, { onDelete: 'cascade' }),
    candidateId: uuid('candidate_id')
      .notNull()
      .references(() => candidates.id, { onDelete: 'cascade' }),
    sectionType: resumeSectionTypeEnum('section_type').notNull(),
    rawText: text('raw_text').notNull(),
    structuredData: jsonb('structured_data').notNull().default('{}'),
    orderIndex: integer('order_index').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_resume_sections_tenant_resume').on(table.tenantId, table.resumeId),
    index('idx_resume_sections_tenant_candidate').on(table.tenantId, table.candidateId),
    index('idx_resume_sections_resume_order').on(table.resumeId, table.orderIndex),
  ]
);

// ---------------------------------------------------------------------------
// 23. Candidate Claims Table (Extracted Assertions & Truth Separation - Phase 13.5 / ARCH-052)
// ---------------------------------------------------------------------------

export const candidateClaims = pgTable(
  'candidate_claims',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    candidateId: uuid('candidate_id')
      .notNull()
      .references(() => candidates.id, { onDelete: 'cascade' }),
    resumeId: uuid('resume_id').references(() => resumes.id, { onDelete: 'cascade' }),
    claimType: text('claim_type').notNull(), // 'SKILL' | 'EXPERIENCE' | 'EDUCATION' | 'PROJECT' | 'ACHIEVEMENT'
    statement: text('statement').notNull(),
    context: text('context'),
    provenanceStatus: provenanceStatusEnum('provenance_status').notNull().default('CLAIMED'),
    isCorroborated: boolean('is_corroborated').notNull().default(false),
    corroboratingEvidenceId: uuid('corroborating_evidence_id').references(() => evidenceItems.id, {
      onDelete: 'set null',
    }),
    metadata: jsonb('metadata').notNull().default('{}'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_candidate_claims_tenant_candidate').on(table.tenantId, table.candidateId),
    index('idx_candidate_claims_resume').on(table.resumeId),
    index('idx_candidate_claims_status').on(table.tenantId, table.provenanceStatus),
  ]
);

// ---------------------------------------------------------------------------
// Consolidated Schema Export
// ---------------------------------------------------------------------------

export const schema = {
  tenantTierEnum,
  userRoleEnum,
  userStatusEnum,
  resourceProviderEnum,
  connectionAuthTypeEnum,
  resourceConnectionStatusEnum,
  candidateStatusEnum,
  resourceTypeEnum,
  resourceStatusEnum,
  skillCategoryEnum,
  provenanceStatusEnum,
  evidenceTypeEnum,
  mcpTokenStatusEnum,
  mcpClientTypeEnum,
  approvalTicketStatusEnum,
  oauthClientTypeEnum,
  applicationStatusEnum,
  stageTypeEnum,
  stageOutcomeEnum,
  tailoredDocumentTypeEnum,
  resumeLifecycleStateEnum,
  resumeSectionTypeEnum,
  tenants,
  users,
  sessions,
  auditLogs,
  resourceConnections,
  candidates,
  candidateIdentities,
  resources,
  projects,
  projectResources,
  skills,
  candidateSkills,
  evidenceItems,
  mcpApiTokens,
  actionApprovalTickets,
  oauthClients,
  oauthAuthorizationCodes,
  oauthTokens,
  jobApplications,
  applicationStages,
  tailoredDocuments,
  resumes,
  resumeSections,
  candidateClaims,
};
