import crypto from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { config } from '../../config/env.js';
import { getApprovalSecret } from '../../config/approval-secrets.js';
import { resources, resourceConnections, candidates } from '../../db/schema.js';
import { ValidationError } from '../../errors/index.js';
import {
  applicationExecutionPayload,
  canonicalPackageJson,
  computeApplicationPackageHash,
} from '../../domain/job/application-package-identity.js';

export const ARTIFACT_POLICY = 'source-backed-narrative/v1';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const DOMAIN = 'career-artifact-policy-receipt/v1\n';

function rejected() {
  return new ValidationError(
    'Artifact quarantined: regenerate under current evidence policy and obtain fresh review/approval',
    'ARTIFACT_REVALIDATION_REQUIRED'
  );
}

function signature(receipt) {
  return crypto
    .createHmac('sha256', getApprovalSecret(config, 'CAREER_HUB_APPROVAL_SECRET'))
    .update(DOMAIN + canonicalPackageJson(receipt))
    .digest('hex');
}

export function packageBodyHash(pkg) {
  const payload = applicationExecutionPayload(pkg);
  delete payload.evidenceTrustReceipt;
  return computeApplicationPackageHash(payload);
}

async function sourceBindings(database, tenantId, candidateId) {
  const rows = await database
    .select({
      id: resources.id,
      status: resources.status,
      connectionId: resources.connectionId,
      metadata: resources.metadata,
      externalId: resources.externalResourceId,
      url: resources.url,
      connectionStatus: resourceConnections.status,
      connectionOwner: resourceConnections.userId,
      candidateOwner: candidates.userId,
    })
    .from(resources)
    .leftJoin(
      resourceConnections,
      and(
        eq(resources.connectionId, resourceConnections.id),
        eq(resources.tenantId, resourceConnections.tenantId)
      )
    )
    .innerJoin(
      candidates,
      and(eq(resources.candidateId, candidates.id), eq(resources.tenantId, candidates.tenantId))
    )
    .where(and(eq(resources.tenantId, tenantId), eq(resources.candidateId, candidateId)));
  return rows
    .map((row) => ({
      id: row.id,
      status: row.status,
      connectionId: row.connectionId,
      connectionStatus: row.connectionStatus,
      ownerMatches:
        !row.connectionId ||
        Boolean(row.candidateOwner && row.connectionOwner === row.candidateOwner),
      epoch: row.metadata?.evidenceEpoch || null,
      externalId: row.externalId,
      url: row.url,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/** Server generation boundary only. Never call this on imported/client packages.
 * Receipt authenticates policy provenance, NOT candidate proficiency. It is part
 * of the new immutable package/hash; historical snapshots are never rewritten.
 */
export async function sealGeneratedPackage(database, { tenantId, candidateId }, pkg) {
  if (!tenantId || !candidateId || pkg.candidateId !== candidateId) throw rejected();
  const receipt = {
    policy: ARTIFACT_POLICY,
    tenantId,
    candidateId,
    bodyHash: packageBodyHash(pkg),
    issuedAt: new Date().toISOString(),
    nonce: crypto.randomUUID(),
    sources: await sourceBindings(database, tenantId, candidateId),
  };
  const sealed = { ...pkg, evidenceTrustReceipt: { ...receipt, signature: signature(receipt) } };
  sealed.packageHash = computeApplicationPackageHash(sealed);
  return sealed;
}

export async function assertArtifactReceipt(database, context, receipt, bodyHash) {
  if (
    !receipt ||
    receipt.policy !== ARTIFACT_POLICY ||
    receipt.tenantId !== context.tenantId ||
    (context.candidateId && receipt.candidateId !== context.candidateId) ||
    !receipt.candidateId ||
    receipt.bodyHash !== bodyHash ||
    !Array.isArray(receipt.sources) ||
    typeof receipt.signature !== 'string' ||
    !/^[a-f0-9]{64}$/.test(receipt.signature)
  )
    throw rejected();
  const { signature: supplied, ...unsigned } = receipt;
  const expected = signature(unsigned);
  if (!crypto.timingSafeEqual(Buffer.from(supplied, 'hex'), Buffer.from(expected, 'hex')))
    throw rejected();
  const age = Date.now() - Date.parse(receipt.issuedAt);
  if (!Number.isFinite(age) || age < 0 || age > MAX_AGE_MS) throw rejected();
  const current = await sourceBindings(database, receipt.tenantId, receipt.candidateId);
  if (
    canonicalPackageJson(current) !== canonicalPackageJson(receipt.sources) ||
    current.some(
      (row) =>
        !row.ownerMatches ||
        row.status !== 'ACTIVE' ||
        (row.connectionId && row.connectionStatus !== 'ACTIVE')
    )
  )
    throw rejected();
  return receipt;
}

export async function assertCurrentPackage(database, context, pkg) {
  if (
    !pkg ||
    pkg.candidateId !== context.candidateId ||
    pkg.packageHash !== computeApplicationPackageHash(pkg)
  )
    throw rejected();
  return assertArtifactReceipt(database, context, pkg.evidenceTrustReceipt, packageBodyHash(pkg));
}

/** Authenticated cache metadata; a package receipt alone cannot bless substituted prose/URLs. */
export function sealHandoffManifest(kit, context, pkg) {
  delete kit.evidencePolicySignature;
  kit.evidencePolicy = { ...context, receipt: pkg.evidenceTrustReceipt };
  kit.evidencePolicySignature = signature({ type: 'HANDOFF', kit });
  return kit;
}
export async function assertHandoffManifest(database, context, kit) {
  if (
    !kit?.evidencePolicySignature ||
    kit.evidencePolicy?.tenantId !== context.tenantId ||
    kit.evidencePolicy?.candidateId !== context.candidateId
  )
    throw rejected();
  const { evidencePolicySignature: supplied, ...unsigned } = kit;
  const expected = signature({ type: 'HANDOFF', kit: unsigned });
  if (
    !/^[a-f0-9]{64}$/.test(supplied) ||
    !crypto.timingSafeEqual(Buffer.from(supplied, 'hex'), Buffer.from(expected, 'hex'))
  )
    throw rejected();
  const receipt = kit.evidencePolicy.receipt;
  await assertArtifactReceipt(database, context, receipt, receipt?.bodyHash);
}
