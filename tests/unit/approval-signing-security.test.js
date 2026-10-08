import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  TEST_ACTION_APPROVAL_SECRET,
  TEST_APPLICATION_APPROVAL_SECRET,
} from '../setup/approval-signing-env.js';
import { config, envSchema } from '../../src/config/env.js';
import {
  APPROVAL_SECRET_NAMES,
  normalizeApprovalSecret,
  assertApprovalSecrets,
} from '../../src/config/approval-secrets.js';
import {
  signTicketPayload,
  verifyTicketSignature,
  buildCanonicalTicketPayload,
} from '../../src/security/approval-signer.js';
import {
  signApplicationTicket,
  verifyApplicationTicketSignature,
} from '../../src/services/job-application-workflow.service.js';
import { canonicalPackageJson } from '../../src/domain/job/application-package-identity.js';
import { createLogger } from '../../src/utils/logger.js';

const freshKey = () => crypto.randomBytes(32).toString('hex');
const configuration = () => ({
  NODE_ENV: 'production',
  ENCRYPTION_MASTER_KEY: freshKey(),
  ACTION_APPROVAL_HMAC_SECRET: freshKey(),
  CAREER_HUB_APPROVAL_SECRET: freshKey(),
});
const original = Object.fromEntries(
  ['NODE_ENV', ...APPROVAL_SECRET_NAMES].map((name) => [name, config[name]])
);
afterEach(() => Object.assign(config, original));

const ticket = {
  ticketId: crypto.randomUUID(),
  tenantId: crypto.randomUUID(),
  userId: crypto.randomUUID(),
  candidateId: crypto.randomUUID(),
  resourceId: crypto.randomUUID(),
  proposalId: crypto.randomUUID(),
  applicationId: crypto.randomUUID(),
  jobId: 'job-1',
  repositoryName: 'owner/repository',
  baseBranch: 'main',
  targetBranch: 'proposed',
  expectedHeadSha: 'a'.repeat(40),
  patchFingerprint: 'b'.repeat(64),
  packageHash: 'c'.repeat(64),
  packageVersion: 1,
  destinationUrl: 'https://employer.example/jobs/1',
  expiresAt: new Date(Date.now() + 900000).toISOString(),
  metadata: {
    approvalTarget: { format: 'application-package-approval/v1', packageId: crypto.randomUUID() },
  },
};

describe('ISSUE-05 centralized approval key policy', () => {
  for (const name of APPROVAL_SECRET_NAMES) {
    it(`${name}: accepts explicitly configured random hex`, () => {
      const input = configuration();
      assert.equal(envSchema.safeParse(input).success, true);
      assert.equal(normalizeApprovalSecret(input[name], name).length, 32);
    });
    it(`${name}: accepts canonical padded base64`, () => {
      const input = configuration();
      input[name] = crypto.randomBytes(32).toString('base64');
      assert.equal(envSchema.safeParse(input).success, true);
    });
    const badValues = {
      missing: undefined,
      empty: '',
      whitespace: '   ',
      short: 'short',
      placeholder: '<replace-with-independently-generated-random-signing-key>',
      example: 'example-secret-that-is-not-a-random-cryptographic-signing-key',
      repeated: 'ab'.repeat(32),
      sequential: Buffer.from(Array.from({ length: 32 }, (_, i) => i)).toString('hex'),
      'padded hex': ` ${freshKey()}`,
      'invalid base64 padding': 'A'.repeat(43) + '=',
      'encoded placeholder': Buffer.from('replace-me-with-a-real-secret!!!!').toString('base64'),
    };
    for (const [label, value] of Object.entries(badValues)) {
      it(`${name}: rejects ${label} without disclosing it`, () => {
        const input = configuration();
        input[name] = value;
        const result = envSchema.safeParse(input);
        assert.equal(result.success, false);
        const messages = result.error.issues
          .filter((issue) => issue.path[0] === name)
          .map((issue) => issue.message)
          .join(';');
        assert.ok(messages.includes(name));
        if (value?.trim()) assert.ok(!messages.includes(value));
      });
    }
    it(`${name}: development requires explicit keys`, () => {
      const input = configuration();
      input.NODE_ENV = 'development';
      delete input[name];
      assert.equal(envSchema.safeParse(input).success, false);
    });
  }
  it('production rejects both absent', () => {
    const result = envSchema.safeParse({
      NODE_ENV: 'production',
      ENCRYPTION_MASTER_KEY: freshKey(),
    });
    assert.equal(result.success, false);
    assert.equal(
      result.error.issues.filter((issue) => APPROVAL_SECRET_NAMES.includes(issue.path[0])).length,
      2
    );
  });
  for (const encoding of ['hex', 'uppercase hex', 'base64']) {
    it(`rejects shared domain key even under ${encoding} encoding`, () => {
      const input = configuration();
      input.CAREER_HUB_APPROVAL_SECRET =
        encoding === 'base64'
          ? Buffer.from(input.ACTION_APPROVAL_HMAC_SECRET, 'hex').toString('base64')
          : encoding === 'uppercase hex'
            ? input.ACTION_APPROVAL_HMAC_SECRET.toUpperCase()
            : input.ACTION_APPROVAL_HMAC_SECRET;
      assert.equal(envSchema.safeParse(input).success, false);
      assert.throws(() => assertApprovalSecrets(input), { code: 'INVALID_APPROVAL_SECRET' });
    });
  }
  it('test bootstrap may omit keys but does not manufacture signing material', () => {
    const result = envSchema.safeParse({ NODE_ENV: 'test' });
    assert.equal(result.success, true);
    for (const name of APPROVAL_SECRET_NAMES) assert.equal(result.data[name], undefined);
  });
  it('explicit test fixture keys work and differ by domain', () => {
    assert.ok(TEST_ACTION_APPROVAL_SECRET !== TEST_APPLICATION_APPROVAL_SECRET);
    assert.equal(
      verifyTicketSignature(
        { ...ticket, hmacSignature: signTicketPayload(ticket, TEST_ACTION_APPROVAL_SECRET) },
        TEST_ACTION_APPROVAL_SECRET
      ),
      true
    );
    assert.equal(
      verifyApplicationTicketSignature(
        ticket,
        signApplicationTicket(ticket, TEST_APPLICATION_APPROVAL_SECRET),
        TEST_APPLICATION_APPROVAL_SECRET
      ),
      true
    );
  });
  it('logger redacts both environment key names and named approval keys', () => {
    const key = freshKey();
    let output = '';
    const logger = createLogger(
      { level: 'info' },
      {
        write(chunk) {
          output += chunk;
        },
      }
    );
    logger.info({
      ACTION_APPROVAL_HMAC_SECRET: key,
      CAREER_HUB_APPROVAL_SECRET: key,
      nested: { actionApprovalSecret: key, applicationApprovalSecret: key },
    });
    assert.ok(!output.includes(key));
    assert.ok(output.includes('[REDACTED]'));
  });
});

const domains = [
  {
    label: 'action',
    name: APPROVAL_SECRET_NAMES[0],
    sign: signTicketPayload,
    verify: (data, signature, key) =>
      verifyTicketSignature({ ...data, hmacSignature: signature }, key),
    field: 'targetBranch',
  },
  {
    label: 'application',
    name: APPROVAL_SECRET_NAMES[1],
    sign: signApplicationTicket,
    verify: verifyApplicationTicketSignature,
    field: 'destinationUrl',
  },
];
describe('ISSUE-05 signing defense, rotation and historical invalidation', () => {
  for (const { label, name, sign, verify, field } of domains) {
    it(`${label}: correct key verifies`, () => {
      const key = freshKey();
      assert.equal(verify(ticket, sign(ticket, key), key), true);
    });
    it(`${label}: wrong key fails`, () => {
      assert.equal(verify(ticket, sign(ticket, freshKey()), freshKey()), false);
    });
    it(`${label}: modified payload fails`, () => {
      assert.equal(verify({ ...ticket, [field]: 'modified' }, sign(ticket)), false);
    });
    for (const signature of ['', 'x'.repeat(64), 'ab', 'ab'.repeat(32) + 'junk', null]) {
      it(`${label}: malformed signature rejected (${typeof signature}:${signature?.length ?? 0})`, () => {
        assert.equal(verify(ticket, signature), false);
      });
    }
    it(`${label}: missing key fails signing AND verification even if bootstrap bypassed`, () => {
      const signature = sign(ticket);
      delete config[name];
      assert.throws(() => sign(ticket), { code: 'INVALID_APPROVAL_SECRET' });
      assert.equal(verify(ticket, signature), false);
    });
    it(`${label}: invalid key fails signing AND verification`, () => {
      const signature = sign(ticket);
      config[name] = 'invalid';
      assert.throws(() => sign(ticket), { code: 'INVALID_APPROVAL_SECRET' });
      assert.equal(verify(ticket, signature), false);
    });
    it(`${label}: production cannot bypass missing configuration with an injected test key`, () => {
      config.NODE_ENV = 'production';
      delete config[name];
      assert.throws(() => sign(ticket, freshKey()), { code: 'INVALID_APPROVAL_SECRET' });
      assert.equal(verify(ticket, 'ab'.repeat(32), freshKey()), false);
    });
    it(`${label}: rotation invalidates outstanding approval; fresh approval verifies`, () => {
      const otherDomain = domains.find((domain) => domain.name !== name);
      const otherSignature = otherDomain.sign(ticket);
      const signature = sign(ticket);
      config[name] = freshKey();
      assert.equal(verify(ticket, signature), false);
      const newTicket = {
        ...ticket,
        ticketId: crypto.randomUUID(),
        proposalId: crypto.randomUUID(),
      };
      assert.equal(verify(newTicket, sign(newTicket)), true);
      assert.equal(otherDomain.verify(ticket, otherSignature), true);
    });
  }
  for (const explicitSharedKey of [false, true]) {
    it(`cross-domain signatures fail both directions (${explicitSharedKey ? 'even with same explicit test key' : 'independent configured keys'})`, () => {
      const key = explicitSharedKey ? freshKey() : undefined;
      assert.equal(
        verifyApplicationTicketSignature(ticket, signTicketPayload(ticket, key), key),
        false
      );
      assert.equal(
        verifyTicketSignature(
          { ...ticket, hmacSignature: signApplicationTicket(ticket, key) },
          key
        ),
        false
      );
    });
  }
  it('rejects pre-upgrade action signature even when old key was securely configured', () => {
    const key = Buffer.from(config.ACTION_APPROVAL_HMAC_SECRET, 'utf8'); // original v1 key interpretation
    const derived = crypto.hkdfSync(
      'sha256',
      key,
      Buffer.from(ticket.tenantId),
      Buffer.from('antigravity:action_approval:v1'),
      32
    );
    const payload = buildCanonicalTicketPayload(ticket).replace(
      'antigravity:action-approval:v2|',
      'V1|'
    );
    const signature = crypto
      .createHmac('sha256', Buffer.from(derived))
      .update(payload)
      .digest('hex');
    assert.equal(verifyTicketSignature({ ...ticket, hmacSignature: signature }), false);
  });
  const oldPayloads = {
    snapshot: canonicalPackageJson({
      format: ticket.metadata.approvalTarget.format,
      packageId: ticket.metadata.approvalTarget.packageId,
      ticketId: ticket.ticketId,
      tenantId: ticket.tenantId,
      userId: ticket.userId,
      candidateId: ticket.candidateId,
      applicationId: ticket.applicationId,
      jobId: ticket.jobId,
      packageVersion: ticket.packageVersion,
      packageHash: ticket.packageHash,
      destinationUrl: ticket.destinationUrl,
      expiresAt: ticket.expiresAt,
    }),
    canonical: `${ticket.ticketId}:${ticket.tenantId}:${ticket.userId}:${ticket.candidateId}:${ticket.applicationId}:${ticket.jobId}:${ticket.packageHash}:${ticket.destinationUrl}:${ticket.expiresAt}`,
    legacy: `${ticket.ticketId}:${ticket.tenantId}:${ticket.userId}:${ticket.packageHash}:${ticket.destinationUrl}:${ticket.expiresAt}`,
  };
  for (const [label, payload] of Object.entries(oldPayloads)) {
    it(`rejects pre-upgrade application ${label} signatures without re-signing`, () => {
      const signature = crypto
        .createHmac('sha256', config.CAREER_HUB_APPROVAL_SECRET)
        .update(payload)
        .digest('hex');
      const data = label === 'snapshot' ? ticket : { ...ticket, metadata: {} };
      assert.equal(verifyApplicationTicketSignature(data, signature), false);
    });
  }
  for (const field of [
    'ticketId',
    'tenantId',
    'userId',
    'candidateId',
    'applicationId',
    'jobId',
    'packageVersion',
    'packageHash',
    'destinationUrl',
    'expiresAt',
  ]) {
    it(`ISSUE-02 signature retains binding to ${field}`, () => {
      const modified = { ...ticket, [field]: field === 'packageVersion' ? 2 : 'changed' };
      assert.equal(
        verifyApplicationTicketSignature(modified, signApplicationTicket(ticket)),
        false
      );
    });
  }
  for (const field of ['packageId', 'format']) {
    it(`ISSUE-02 signature retains binding to target ${field}`, () => {
      const modified = structuredClone(ticket);
      modified.metadata.approvalTarget[field] = 'changed';
      assert.equal(
        verifyApplicationTicketSignature(modified, signApplicationTicket(ticket)),
        false
      );
    });
  }
});
