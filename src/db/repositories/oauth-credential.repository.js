import { and, eq, sql } from 'drizzle-orm';
import { auditLogs, oauthTokens } from '../schema.js';

// PostgreSQL transaction-scoped lock, shared by rotation, replay and explicit
// revocation. Hash collisions only serialize unrelated families; no local locks.
export async function lockOAuthFamily(tx, familyId) {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${familyId}, 0))`);
}

export async function oauthSecurityEvent(tx, record, eventType, details = {}) {
  await tx.insert(auditLogs).values({
    tenantId: record.tenantId,
    userId: record.userId,
    eventType,
    resourceType: 'oauth_credential',
    resourceId: record.id,
    details: { clientId: record.clientId, familyId: record.familyId, ...details },
  });
}

// Caller owns the family lock. Durable tombstones distinguish family revocation
// from ordinary rotation and prevent resurrection of any old family member.
export async function revokeLockedOAuthFamily(tx, record, now) {
  await tx
    .update(oauthTokens)
    .set({
      isRevoked: true,
      revokedAt: now,
      familyRevokedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(oauthTokens.familyId, record.familyId),
        eq(oauthTokens.tenantId, record.tenantId),
        eq(oauthTokens.userId, record.userId),
        eq(oauthTokens.clientId, record.clientId)
      )
    );
  await oauthSecurityEvent(tx, record, 'oauth.family.revoked');
}

export async function revokeOAuthFamily(database, record) {
  return database.transaction(async (tx) => {
    await lockOAuthFamily(tx, record.familyId);
    await revokeLockedOAuthFamily(tx, record, new Date());
  });
}
