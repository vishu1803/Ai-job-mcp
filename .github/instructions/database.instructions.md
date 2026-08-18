# Database & Data Access Guidelines

**Scope**: PostgreSQL database schemas, Drizzle ORM models, migrations, and query execution.  
**Governing Standard**: PostgreSQL 16+ + Drizzle ORM (`drizzle-kit`).

---

## 1. Core Principles

1. **Migration-Only Schema Changes**: NEVER alter database tables, columns, or indexes manually in production or test environments. All schema modifications MUST be authored and executed via Drizzle migrations (`npm run db:generate`, `npm run db:migrate`).
2. **Mandatory Tenant Foreign Keys**: Every table storing tenant-owned records (skills, repositories, evidence, match results, audit logs) MUST include `tenant_id` referencing `tenants.id` with `ON DELETE CASCADE`.
3. **Explicit Query Scoping**: Every `SELECT`, `UPDATE`, and `DELETE` query executed in application code MUST explicitly include a `WHERE tenant_id = ?` clause.
4. **Encryption for Sensitive Fields**: Tokens, secrets, and private keys MUST be stored as encrypted blobs (`AES-256-GCM`) with dedicated IV and Auth Tag columns. Never write plaintext credentials to the database.

---

## 2. Schema Definition Standards

* **Column Naming**: Use `snake_case` for database column names and `camelCase` for JavaScript Drizzle model properties:
  ```javascript
  import { pgTable, uuid, text, timestamp, jsonb } from 'drizzle-orm/pg-core';

  export const evidenceItems = pgTable('evidence_items', {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    technology: text('technology').notNull(),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  });
  ```
* **Indexes**: Add explicit indexes on all foreign keys (`tenant_id`, `user_id`, `repository_id`), search columns (`technology`), and GIN indexes on queryable `JSONB` fields.
* **Timestamps**: All tables must include `created_at` and `updated_at` timestamps with timezone (`timestamptz`).

---

## 3. Transaction Rules

* **Atomic State Transitions**: Multi-table writes (e.g., creating a candidate profile and inserting 20 extracted evidence items, or approving an action and updating repository status) MUST be wrapped in a database transaction (`db.transaction(async (tx) => { ... })`).
* **Short Transaction Lifespans**: Keep transactions short. Never perform external network calls (e.g., GitHub API fetches or AI queries) inside an open database transaction block.

---

## 4. Test and Seed Data Standards

* **Isolated Test Databases**: Unit and integration tests must run against an isolated test database.
* **Deterministic Seeds**: Seed scripts must generate repeatable fixture data with fixed UUIDs for test assertions.
* **Test Teardown**: Integration tests must clean up their created tenant data after test suite execution.
