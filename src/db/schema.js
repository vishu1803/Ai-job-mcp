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
// Consolidated Schema Export
// ---------------------------------------------------------------------------

export const schema = {
  tenantTierEnum,
  userRoleEnum,
  userStatusEnum,
  tenants,
  users,
  sessions,
  auditLogs,
};
