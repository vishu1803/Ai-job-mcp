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
};
