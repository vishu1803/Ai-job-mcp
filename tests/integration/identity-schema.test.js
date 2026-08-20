import { test, describe, after, before } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { eq, and, gt, desc, sql } from 'drizzle-orm';
import { pool, db, closeDatabase } from '../../src/db/index.js';
import { tenants, users, sessions, auditLogs } from '../../src/db/schema.js';
import { sanitizeAuditDetails } from '../../src/utils/audit-sanitizer.js';

// Helper to inspect both Drizzle error wrapper and underlying pg cause error message
function matchesError(err, regex) {
  const fullMsg = `${err?.message || ''} ${err?.cause?.message || ''} ${err?.cause?.detail || ''}`;
  return regex.test(fullMsg);
}

describe('Live Core Identity Schema Integration Tests (P1-004)', () => {
  // Test isolation fixtures
  const testRunId = crypto.randomBytes(4).toString('hex');
  const tenantASlug = `test-tenant-a-${testRunId}`;
  const tenantBSlug = `test-tenant-b-${testRunId}`;

  let tenantAId;
  let tenantBId;
  let userA1Id;
  let userA2Id;
  let userB1Id;

  // Track created tenant IDs for guaranteed clean teardown
  const createdTenantIds = [];

  before(async () => {
    // Ensure clean connection
    assert.ok(db);
    assert.ok(pool);
  });

  after(async () => {
    // Clean teardown of any created test tenants (cascades to users, sessions, audit_logs)
    for (const id of createdTenantIds) {
      try {
        await db.delete(tenants).where(eq(tenants.id, id));
      } catch {
        // Silently continue if already deleted by cascade tests
      }
    }
    await closeDatabase(pool);
  });

  test('1. Database Metadata Verification: Confirms expected tables, enums, and foreign keys exist in PostgreSQL', async () => {
    // Verify 4 core tables exist in public schema
    const tablesResult = await db.execute(sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name IN ('tenants', 'users', 'sessions', 'audit_logs')
      ORDER BY table_name;
    `);

    const tableNames = tablesResult.rows.map((r) => r.table_name);
    assert.ok(tableNames.includes('tenants'), 'Table tenants must exist');
    assert.ok(tableNames.includes('users'), 'Table users must exist');
    assert.ok(tableNames.includes('sessions'), 'Table sessions must exist');
    assert.ok(tableNames.includes('audit_logs'), 'Table audit_logs must exist');

    // Verify 3 custom enum types exist in PostgreSQL
    const enumsResult = await db.execute(sql`
      SELECT typname 
      FROM pg_type 
      WHERE typname IN ('tenant_tier', 'user_role', 'user_status')
      ORDER BY typname;
    `);

    const enumNames = enumsResult.rows.map((r) => r.typname);
    assert.ok(enumNames.includes('tenant_tier'), 'Enum tenant_tier must exist');
    assert.ok(enumNames.includes('user_role'), 'Enum user_role must exist');
    assert.ok(enumNames.includes('user_status'), 'Enum user_status must exist');
  });

  test('2. Tenants CRUD: Creates, reads, updates tenant and enforces unique slug constraint', async () => {
    // 2.1 Create Tenant A
    const [createdA] = await db
      .insert(tenants)
      .values({
        name: `Tenant Alpha ${testRunId}`,
        slug: tenantASlug,
        tier: 'FREE',
      })
      .returning();

    assert.ok(createdA.id, 'Tenant ID must be a generated UUID');
    assert.equal(createdA.slug, tenantASlug);
    assert.equal(createdA.tier, 'FREE');
    assert.ok(createdA.createdAt instanceof Date);
    assert.ok(createdA.updatedAt instanceof Date);

    tenantAId = createdA.id;
    createdTenantIds.push(tenantAId);

    // 2.2 Read Tenant
    const [fetched] = await db.select().from(tenants).where(eq(tenants.id, tenantAId));
    assert.equal(fetched.id, tenantAId);
    assert.equal(fetched.name, `Tenant Alpha ${testRunId}`);

    // 2.3 Update Tenant
    const [updated] = await db
      .update(tenants)
      .set({ name: `Tenant Alpha Updated ${testRunId}`, tier: 'PRO' })
      .where(eq(tenants.id, tenantAId))
      .returning();

    assert.equal(updated.name, `Tenant Alpha Updated ${testRunId}`);
    assert.equal(updated.tier, 'PRO');

    // 2.4 Duplicate Slug Unique Violation
    await assert.rejects(
      async () => {
        await db.insert(tenants).values({
          name: 'Duplicate Tenant Slug',
          slug: tenantASlug, // Duplicate slug
        });
      },
      (err) => matchesError(err, /unique|duplicate/i)
    );

    // Create Tenant B for multi-tenant tests
    const [createdB] = await db
      .insert(tenants)
      .values({
        name: `Tenant Beta ${testRunId}`,
        slug: tenantBSlug,
        tier: 'FREE',
      })
      .returning();

    tenantBId = createdB.id;
    createdTenantIds.push(tenantBId);
  });

  test('3. Users CRUD: Creates users, validates (tenant_id, email) unique composite constraint, and prevents orphaned users', async () => {
    const userEmail = `alice-${testRunId}@example.com`;

    // 3.1 Create User A1 in Tenant A
    const [userA1] = await db
      .insert(users)
      .values({
        tenantId: tenantAId,
        email: userEmail,
        displayName: 'Alice Engineer',
        role: 'OWNER',
      })
      .returning();

    assert.ok(userA1.id);
    assert.equal(userA1.tenantId, tenantAId);
    assert.equal(userA1.email, userEmail);
    assert.equal(userA1.role, 'OWNER');
    assert.equal(userA1.status, 'ACTIVE'); // Default status
    assert.ok(userA1.createdAt instanceof Date);

    userA1Id = userA1.id;

    // 3.2 Create User A2 in Tenant A
    const [userA2] = await db
      .insert(users)
      .values({
        tenantId: tenantAId,
        email: `bob-${testRunId}@example.com`,
        displayName: 'Bob Member',
        role: 'MEMBER',
      })
      .returning();

    userA2Id = userA2.id;

    // 3.3 Create User B1 in Tenant B with the SAME email as User A1 (Allowed across distinct tenants)
    const [userB1] = await db
      .insert(users)
      .values({
        tenantId: tenantBId,
        email: userEmail, // Same email, different tenant
        displayName: 'Alice Beta Org',
        role: 'OWNER',
      })
      .returning();

    assert.ok(userB1.id);
    assert.equal(userB1.tenantId, tenantBId);
    assert.equal(userB1.email, userEmail);
    userB1Id = userB1.id;

    // 3.4 Duplicate (tenant_id, email) in SAME tenant must be rejected
    await assert.rejects(
      async () => {
        await db.insert(users).values({
          tenantId: tenantAId,
          email: userEmail, // Duplicate email in Tenant A
          displayName: 'Alice Duplicate',
        });
      },
      (err) => matchesError(err, /unique|duplicate/i)
    );

    // 3.5 Nonexistent Tenant Foreign Key Rejection
    await assert.rejects(
      async () => {
        await db.insert(users).values({
          tenantId: '00000000-0000-0000-0000-000000000000',
          email: `orphan-${testRunId}@example.com`,
          displayName: 'Orphan User',
        });
      },
      (err) => matchesError(err, /foreign key|violates foreign key/i)
    );

    // 3.6 Update User
    const [updatedUser] = await db
      .update(users)
      .set({ displayName: 'Alice Principal Engineer', status: 'ACTIVE' })
      .where(eq(users.id, userA1Id))
      .returning();

    assert.equal(updatedUser.displayName, 'Alice Principal Engineer');
  });

  test('4. Sessions CRUD: Stores SHA-256 hashed token IDs, validates active expiry, updates activity, and deletes sessions', async () => {
    // Generate secure random raw secret and compute SHA-256 hash
    const rawSessionSecret = crypto.randomBytes(32).toString('hex');
    const hashedSessionId = crypto.createHash('sha256').update(rawSessionSecret).digest('hex');

    const futureExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // +24 hours

    // 4.1 Insert Session
    const [session] = await db
      .insert(sessions)
      .values({
        id: hashedSessionId,
        userId: userA1Id,
        tenantId: tenantAId,
        ipAddress: '192.168.1.***',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        expiresAt: futureExpiry,
      })
      .returning();

    assert.equal(session.id, hashedSessionId);
    assert.equal(session.userId, userA1Id);
    assert.equal(session.tenantId, tenantAId);
    assert.ok(session.expiresAt instanceof Date);

    // 4.2 Query Active Session (Active Check: expires_at > NOW())
    const [activeSession] = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, hashedSessionId), gt(sessions.expiresAt, sql`NOW()`)));

    assert.ok(activeSession);
    assert.equal(activeSession.id, hashedSessionId);

    // 4.3 Expired Session Behavior Test: Create an expired session in past
    const expiredSecret = crypto.randomBytes(32).toString('hex');
    const expiredHashedId = crypto.createHash('sha256').update(expiredSecret).digest('hex');
    const pastExpiry = new Date(Date.now() - 1000 * 60 * 60); // 1 hour in past

    await db.insert(sessions).values({
      id: expiredHashedId,
      userId: userA1Id,
      tenantId: tenantAId,
      expiresAt: pastExpiry,
    });

    // Querying with active check `expires_at > NOW()` returns nothing
    const expiredQueryResult = await db
      .select()
      .from(sessions)
      .where(and(eq(sessions.id, expiredHashedId), gt(sessions.expiresAt, sql`NOW()`)));

    assert.equal(expiredQueryResult.length, 0, 'Active query must reject expired session');

    // 4.4 Update last_active_at
    const [touchResult] = await db
      .update(sessions)
      .set({ lastActiveAt: sql`NOW()` })
      .where(eq(sessions.id, hashedSessionId))
      .returning();

    assert.ok(touchResult.lastActiveAt instanceof Date);

    // 4.5 Delete / Revoke session
    const deleteResult = await db
      .delete(sessions)
      .where(eq(sessions.id, expiredHashedId))
      .returning();

    assert.equal(deleteResult.length, 1);
  });

  test('5. Audit Logs CRUD: Inserts sanitized metadata, enforces tenant scoping, and preserves audit trail on user deletion', async () => {
    // 5.1 Sanitize details metadata before insertion
    const rawDetails = {
      action: 'MCP_TOOL_INVOKED',
      toolName: 'generate_tailored_resume',
      targetRepo: 'octocat/spoon-knife',
      token: 'ghp_secret_token_to_strip',
      password: 'strip_this_password',
      durationMs: 450.2,
      status: 'SUCCESS',
    };

    const sanitizedDetails = sanitizeAuditDetails(rawDetails);

    // Assert sensitive keys stripped
    assert.equal(sanitizedDetails.token, undefined);
    assert.equal(sanitizedDetails.password, undefined);
    assert.equal(sanitizedDetails.toolName, 'generate_tailored_resume');

    // 5.2 Insert Audit Log in Tenant A
    const [auditEntryA] = await db
      .insert(auditLogs)
      .values({
        tenantId: tenantAId,
        userId: userA1Id,
        eventType: 'MCP_TOOL_INVOKED',
        resourceType: 'CandidateProfile',
        resourceId: 'cand_12345',
        requestId: `req_${testRunId}_001`,
        ipAddress: '10.0.0.***',
        userAgent: 'Antigravity-Agent/1.0',
        details: sanitizedDetails,
      })
      .returning();

    assert.ok(auditEntryA.id);
    assert.equal(auditEntryA.tenantId, tenantAId);
    assert.equal(auditEntryA.userId, userA1Id);
    assert.equal(auditEntryA.details.toolName, 'generate_tailored_resume');
    assert.equal(auditEntryA.details.token, undefined);

    // 5.3 Insert Audit Log in Tenant B
    const [auditEntryB] = await db
      .insert(auditLogs)
      .values({
        tenantId: tenantBId,
        userId: userB1Id,
        eventType: 'CONNECTOR_CONNECTED',
        resourceType: 'ResourceConnection',
        resourceId: 'conn_github_001',
        requestId: `req_${testRunId}_002`,
        details: sanitizeAuditDetails({ provider: 'github', status: 'HEALTHY' }),
      })
      .returning();

    assert.ok(auditEntryB.id);
    assert.equal(auditEntryB.tenantId, tenantBId);

    // 5.4 Read and query audit log chronological timeline scoped to tenant A
    const tenantALogs = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.tenantId, tenantAId))
      .orderBy(desc(auditLogs.createdAt));

    assert.ok(tenantALogs.length >= 1);
    assert.ok(tenantALogs.every((log) => log.tenantId === tenantAId));
  });

  test('6. Multi-Tenant Isolation: Proves cross-tenant queries cannot access foreign tenant records', async () => {
    // 6.1 Query users for Tenant A: Must return User A1 and A2, and ZERO User B1
    const tenantAUsers = await db.select().from(users).where(eq(users.tenantId, tenantAId));
    const tenantAUserIds = tenantAUsers.map((u) => u.id);

    assert.ok(tenantAUserIds.includes(userA1Id));
    assert.ok(tenantAUserIds.includes(userA2Id));
    assert.equal(
      tenantAUserIds.includes(userB1Id),
      false,
      'Tenant A query must never return Tenant B user'
    );

    // 6.2 Query users for Tenant B: Must return User B1, and ZERO Tenant A users
    const tenantBUsers = await db.select().from(users).where(eq(users.tenantId, tenantBId));
    const tenantBUserIds = tenantBUsers.map((u) => u.id);

    assert.ok(tenantBUserIds.includes(userB1Id));
    assert.equal(
      tenantBUserIds.includes(userA1Id),
      false,
      'Tenant B query must never return Tenant A user'
    );

    // 6.3 Query audit logs for Tenant A: Must contain 0 records from Tenant B
    const tenantALogs = await db.select().from(auditLogs).where(eq(auditLogs.tenantId, tenantAId));

    assert.ok(tenantALogs.length > 0);
    assert.ok(
      tenantALogs.every((l) => l.tenantId === tenantAId),
      'All returned audit records must strictly belong to Tenant A'
    );
  });

  test('7. Cascade Deletion Behavior: Proves user deletion cascades sessions and sets audit_logs.user_id to NULL', async () => {
    // 7.1 Create a temporary test user in Tenant A
    const [tempUser] = await db
      .insert(users)
      .values({
        tenantId: tenantAId,
        email: `temp-delete-${testRunId}@example.com`,
        displayName: 'Temp Deletion User',
      })
      .returning();

    // 7.2 Create an active session for the temp user
    const tempSessionSecret = crypto.randomBytes(32).toString('hex');
    const tempSessionHash = crypto.createHash('sha256').update(tempSessionSecret).digest('hex');

    await db.insert(sessions).values({
      id: tempSessionHash,
      userId: tempUser.id,
      tenantId: tenantAId,
      expiresAt: new Date(Date.now() + 3600000),
    });

    // 7.3 Create an audit log record for the temp user
    const [tempAuditLog] = await db
      .insert(auditLogs)
      .values({
        tenantId: tenantAId,
        userId: tempUser.id,
        eventType: 'USER_LOGIN',
        resourceType: 'User',
        resourceId: tempUser.id,
        details: sanitizeAuditDetails({ authMethod: 'password_test' }),
      })
      .returning();

    assert.equal(tempAuditLog.userId, tempUser.id);

    // 7.4 Delete the temporary user
    await db.delete(users).where(eq(users.id, tempUser.id));

    // 7.5 Verify that the user's session was automatically CASCADE deleted
    const sessionCheck = await db.select().from(sessions).where(eq(sessions.id, tempSessionHash));

    assert.equal(
      sessionCheck.length,
      0,
      'User deletion must automatically cascade delete active sessions'
    );

    // 7.6 Verify that the audit record STILL EXISTS, but with user_id SET NULL
    const [auditCheck] = await db.select().from(auditLogs).where(eq(auditLogs.id, tempAuditLog.id));

    assert.ok(auditCheck, 'Audit record must not be deleted on user deletion');
    assert.equal(
      auditCheck.userId,
      null,
      'audit_logs.user_id must be set to NULL on user deletion (ON DELETE SET NULL)'
    );
    assert.equal(auditCheck.tenantId, tenantAId, 'Tenant scoping remains intact');
  });

  test('8. Tenant Cascade Deletion: Proves tenant hard-deletion cascades all child entities', async () => {
    // 8.1 Create a standalone disposable tenant with user, session, and audit log
    const disposableSlug = `disposable-tenant-${testRunId}`;
    const [disposableTenant] = await db
      .insert(tenants)
      .values({
        name: 'Disposable Workspace',
        slug: disposableSlug,
      })
      .returning();

    const [disposableUser] = await db
      .insert(users)
      .values({
        tenantId: disposableTenant.id,
        email: `disposable-${testRunId}@example.com`,
        displayName: 'Disposable User',
      })
      .returning();

    const dispSessionHash = crypto
      .createHash('sha256')
      .update(crypto.randomBytes(32))
      .digest('hex');

    await db.insert(sessions).values({
      id: dispSessionHash,
      userId: disposableUser.id,
      tenantId: disposableTenant.id,
      expiresAt: new Date(Date.now() + 3600000),
    });

    const [dispAudit] = await db
      .insert(auditLogs)
      .values({
        tenantId: disposableTenant.id,
        userId: disposableUser.id,
        eventType: 'WORKSPACE_CREATED',
        resourceType: 'Tenant',
        resourceId: disposableTenant.id,
        details: sanitizeAuditDetails({ action: 'create_workspace' }),
      })
      .returning();

    // 8.2 Delete the disposable tenant
    await db.delete(tenants).where(eq(tenants.id, disposableTenant.id));

    // 8.3 Verify cascade deletion of users, sessions, and audit_logs
    const userCheck = await db.select().from(users).where(eq(users.id, disposableUser.id));
    const sessionCheck = await db.select().from(sessions).where(eq(sessions.id, dispSessionHash));
    const auditCheck = await db.select().from(auditLogs).where(eq(auditLogs.id, dispAudit.id));

    assert.equal(userCheck.length, 0, 'Tenant deletion must cascade delete users');
    assert.equal(sessionCheck.length, 0, 'Tenant deletion must cascade delete sessions');
    assert.equal(auditCheck.length, 0, 'Tenant deletion must cascade delete audit_logs');
  });
});
