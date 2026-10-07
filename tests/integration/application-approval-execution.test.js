import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { eq, sql } from 'drizzle-orm';
import { db, pool, closeDatabase } from '../../src/db/index.js';
import {
  tenants,
  users,
  candidates,
  jobApplications,
  applicationPackages,
  applicationApprovalTickets,
  applicationExecutions,
  auditLogs,
} from '../../src/db/schema.js';
import {
  JobApplicationWorkflowService,
  computeApplicationPackageHash,
  signApplicationTicket,
} from '../../src/services/job-application-workflow.service.js';
import {
  claimApplicationExecution,
  startApplicationExecution,
  finishApplicationExecution,
} from '../../src/db/repositories/application-execution.repository.js';

describe('ISSUE-03 durable single-owner execution (real PostgreSQL)', () => {
  const tenantId = crypto.randomUUID(),
    userId = crypto.randomUUID(),
    candidateId = crypto.randomUUID();
  const destinationUrl = 'https://employer.example.test/issue03';
  const quiet = {
    info() {},
    warn() {},
    error() {},
    child() {
      return this;
    },
  };
  before(async () => {
    await db
      .insert(tenants)
      .values({ id: tenantId, name: 'ISSUE-03', slug: `issue03-${tenantId}` });
    await db.insert(users).values({
      id: userId,
      tenantId,
      email: `${userId}@example.test`,
      displayName: 'ISSUE-03',
      role: 'MEMBER',
      status: 'ACTIVE',
    });
    await db
      .insert(candidates)
      .values({ id: candidateId, tenantId, userId, displayName: 'Reviewed Candidate' });
  });
  after(async () => {
    try {
      await db.delete(tenants).where(eq(tenants.id, tenantId));
    } finally {
      await closeDatabase();
    }
  });
  async function fixture(adapter) {
    const applicationId = crypto.randomUUID();
    const pkg = {
      candidateId,
      targetJob: {
        id: applicationId,
        title: 'Engineer',
        company: 'Employer',
        applicationUrl: destinationUrl,
      },
      tailoredResume: { markdownContent: 'APPROVED A' },
      answers: { eligible: 'yes' },
      attachments: [{ contentHash: 'a'.repeat(64) }],
    };
    const packageHash = computeApplicationPackageHash(pkg);
    await db.insert(jobApplications).values({
      id: applicationId,
      tenantId,
      candidateId,
      companyName: 'Employer',
      jobTitle: 'Engineer',
      jobUrl: destinationUrl,
      status: 'SAVED',
    });
    await db.insert(applicationPackages).values({
      applicationId,
      tenantId,
      candidateId,
      packageHash,
      packagePayload: pkg,
      version: 1,
    });
    const service = () =>
      new JobApplicationWorkflowService({
        database: db,
        logger: quiet,
        portalAdapterRegistry: { resolve: () => adapter },
      });
    const first = service();
    const ticket = await first.requestApplicationApproval({
      tenantId,
      userId,
      candidateId,
      applicationId,
      packageHash,
      destinationUrl,
    });
    const args = {
      tenantId,
      userId,
      candidateId,
      approvalTicketId: ticket.ticketId,
      applicationId,
      packageHash,
      destinationUrl,
    };
    const stored = await first._getApprovalTicket(tenantId, ticket.ticketId, {
      requireDurable: true,
    });
    const execution = async () =>
      (
        await db
          .select()
          .from(applicationExecutions)
          .where(eq(applicationExecutions.approvalId, ticket.ticketId))
      )[0];
    return { service, first, ticket, stored, args, pkg, execution };
  }
  it('two interleaved service instances invoke the adapter exactly once', async () => {
    let calls = 0;
    const f = await fixture({
      submit: async () => {
        calls++;
        return { status: 'HANDOFF_READY', finalSubmitBlocked: true };
      },
    });
    let loaded = 0,
      release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const instances = [f.first, f.service()];
    for (const service of instances) {
      const original = service._getApprovalTicket.bind(service);
      service._getApprovalTicket = async (...args) => {
        const ticket = await original(...args);
        if (++loaded === 2) release();
        await gate;
        return ticket;
      };
    }
    const results = await Promise.allSettled(
      instances.map((service) => service.submitJobApplication(f.args))
    );
    console.log(
      `ISSUE-03 interleaved callers=2 adapterCalls=${calls} successes=${results.filter((r) => r.status === 'fulfilled').length}`
    );
    assert.equal(calls, 1);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(
      results.find((r) => r.status === 'rejected').reason.details,
      'TICKET_ALREADY_CONSUMED'
    );
  });

  for (const [count, separate] of [
    [10, false],
    [50, true],
  ]) {
    it(`${count} concurrent callers, ${separate ? 'separate' : 'shared'} service instances: one owner`, async () => {
      let calls = 0;
      const f = await fixture({
        submitOrHandoff: async (ctx) => {
          calls++;
          assert.equal(ctx.applicationPackage.tailoredResume.markdownContent, 'APPROVED A');
          assert.equal(ctx.idempotencyKey, ctx.executionId);
          assert.ok(Object.isFrozen(ctx.applicationPackage.answers));
          return { status: 'HANDOFF_READY', finalSubmitBlocked: true };
        },
      });
      const contentB = {
        ...f.pkg,
        tailoredResume: { markdownContent: 'UNAPPROVED B' },
        answers: { eligible: 'changed' },
        packageHash: f.args.packageHash,
      };
      const results = await Promise.allSettled(
        Array.from({ length: count }, () =>
          (separate ? f.service() : f.first).submitJobApplication({
            ...f.args,
            applicationPackage: contentB,
          })
        )
      );
      assert.equal(calls, 1);
      assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
      for (const r of results.filter((r) => r.status === 'rejected')) {
        assert.equal(r.reason.code, 'CONFLICT');
        assert.equal(r.reason.details, 'TICKET_ALREADY_CONSUMED');
      }
      assert.equal((await f.execution()).status, 'SUCCEEDED');
      console.log(
        `ISSUE-03 callers=${count} instances=${separate ? count : 1} adapterCalls=${calls}`
      );
    });
  }

  it('50 contenders waiting on an actual PostgreSQL row lock cannot double execute', async () => {
    let calls = 0,
      loaded = 0,
      release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const f = await fixture({
      submit: async () => {
        calls++;
        return { status: 'HANDOFF_READY' };
      },
    });
    const lock = await pool.connect();
    try {
      await lock.query('BEGIN');
      await lock.query('SELECT id FROM application_approval_tickets WHERE id=$1 FOR UPDATE', [
        f.ticket.ticketId,
      ]);
      const requests = Array.from({ length: 50 }, () => {
        const service = f.service(),
          get = service._getApprovalTicket.bind(service);
        service._getApprovalTicket = async (...args) => {
          const ticket = await get(...args);
          if (++loaded === 50) release();
          await gate;
          return ticket;
        };
        return service.submitJobApplication(f.args);
      });
      const settled = Promise.allSettled(requests);
      await gate;
      let waiting = 0;
      for (let i = 0; i < 500 && !waiting; i++) {
        // pg_stat_activity snapshots are cached within our lock transaction.
        await lock.query('SELECT pg_stat_clear_snapshot()');
        const r = await lock.query(
          "SELECT count(*)::int AS n FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%application_approval_tickets%for update%'"
        );
        waiting = r.rows[0].n;
      }
      assert.ok(waiting > 0, 'must observe actual database lock contention');
      assert.equal(calls, 0);
      await lock.query('COMMIT');
      const results = await settled;
      assert.equal(calls, 1);
      assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
      assert.equal(
        results.filter(
          (r) => r.status === 'rejected' && r.reason.details === 'TICKET_ALREADY_CONSUMED'
        ).length,
        49
      );
      console.log(`ISSUE-03 row-lock contenders=50 adapterCalls=${calls}`);
    } finally {
      await lock.query('ROLLBACK');
      lock.release();
    }
  });

  function transactionFault(database, at, behavior) {
    let count = 0;
    return new Proxy(database, {
      get(target, key) {
        if (key === 'transaction')
          return async (callback) => {
            if (++count === at) return behavior(target, callback);
            return target.transaction(callback);
          };
        const value = Reflect.get(target, key);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
  }
  for (const change of ['expiry while waiting', 'revocation while waiting']) {
    it(`${change} is checked after acquiring the database lock`, async () => {
      let calls = 0,
        read;
      const loaded = new Promise((resolve) => {
        read = resolve;
      });
      const f = await fixture({
        submit: async () => {
          calls++;
          return { status: 'HANDOFF_READY' };
        },
      });
      if (change.startsWith('expiry')) {
        f.stored.expiresAt = new Date(Date.now() + 1500).toISOString();
        f.stored.signature = signApplicationTicket(f.stored);
        await db
          .update(applicationApprovalTickets)
          .set({ expiresAt: new Date(f.stored.expiresAt), signature: f.stored.signature })
          .where(eq(applicationApprovalTickets.id, f.ticket.ticketId));
      }
      const get = f.first._getApprovalTicket.bind(f.first);
      f.first._getApprovalTicket = async (...args) => {
        const ticket = await get(...args);
        read();
        return ticket;
      };
      const lock = await pool.connect();
      let outcome;
      try {
        await lock.query('BEGIN');
        await lock.query('SELECT id FROM application_approval_tickets WHERE id=$1 FOR UPDATE', [
          f.ticket.ticketId,
        ]);
        outcome = f.first.submitJobApplication(f.args);
        const rejected = assert.rejects(outcome);
        await loaded;
        if (change.startsWith('expiry')) await new Promise((resolve) => setTimeout(resolve, 1600));
        else
          await lock.query("UPDATE application_approval_tickets SET status='REVOKED' WHERE id=$1", [
            f.ticket.ticketId,
          ]);
        await lock.query('COMMIT');
        await rejected;
        assert.equal(calls, 0);
        assert.equal(await f.execution(), undefined);
      } finally {
        await lock.query('ROLLBACK');
        lock.release();
        await outcome?.catch(() => {});
      }
    });
  }
  const handoff = { submit: async () => ({ status: 'HANDOFF_READY' }) };
  async function replayRejected(f) {
    await assert.rejects(
      f.service().submitJobApplication(f.args),
      (error) => error.code === 'CONFLICT' && error.details === 'TICKET_ALREADY_CONSUMED'
    );
  }
  for (const boundary of [
    'before claim',
    'claim commit acknowledgement lost',
    'before STARTED commit',
    'STARTED commit acknowledgement lost',
    'before result commit',
    'result commit acknowledgement lost',
  ]) {
    it(`failure boundary: ${boundary}`, async () => {
      let calls = 0;
      const f = await fixture({
        submit: async () => {
          calls++;
          return { status: 'HANDOFF_READY' };
        },
      });
      const at =
        boundary.startsWith('before claim') || boundary.startsWith('claim ')
          ? 1
          : boundary.includes('STARTED')
            ? 2
            : 3;
      const committed = boundary.includes('acknowledgement');
      f.first.db = transactionFault(db, at, async (target, callback) => {
        if (committed) await target.transaction(callback);
        throw new Error('SIMULATED_DATABASE_FAILURE');
      });
      await assert.rejects(f.first.submitJobApplication(f.args));
      assert.equal(calls, at === 3 ? 1 : 0);
      const row = await f.execution();
      if (at === 1 && !committed) {
        assert.equal(row, undefined);
        assert.equal((await f.service().submitJobApplication(f.args)).status, 'HANDOFF_READY');
      } else {
        assert.equal(
          row.status,
          at === 1
            ? 'CLAIMED'
            : at === 2
              ? committed
                ? 'STARTED'
                : 'FAILED'
              : committed
                ? 'SUCCEEDED'
                : 'UNKNOWN'
        );
        await replayRejected(f);
      }
    });
  }

  for (const [label, execute, expected] of [
    [
      'definitive no-side-effect rejection',
      async () => ({ status: 'FAILED', sideEffectOccurred: false }),
      'FAILED',
    ],
    ['uncertain rejection', async () => ({ status: 'FAILED' }), 'UNKNOWN'],
    [
      'network timeout',
      async () => {
        throw new Error('ETIMEDOUT');
      },
      'UNKNOWN',
    ],
    ['malformed adapter response', async () => null, 'UNKNOWN'],
    [
      'confirmed external success',
      async () => ({
        status: 'SUBMITTED',
        authorizedSubmissionExecuted: true,
        externalReference: 'external-123',
      }),
      'SUCCEEDED',
    ],
  ]) {
    it(`${label} is durable and cannot replay`, async () => {
      let calls = 0;
      const f = await fixture({
        submit: async (ctx) => {
          calls++;
          return execute(ctx);
        },
      });
      if (expected === 'SUCCEEDED') {
        const result = await f.first.submitJobApplication(f.args);
        const row = await f.execution();
        assert.equal(result.executionId, row.id);
        assert.equal(row.externalReference, 'external-123');
        const [application] = await db
          .select()
          .from(jobApplications)
          .where(eq(jobApplications.id, f.args.applicationId));
        assert.equal(application.status, 'SUBMITTED');
        assert.ok(application.appliedAt);
      } else await assert.rejects(f.first.submitJobApplication(f.args));
      assert.equal((await f.execution()).status, expected);
      await replayRejected(f);
      assert.equal(calls, 1);
    });
  }

  for (const state of ['CLAIMED', 'STARTED', 'SUCCEEDED']) {
    it(`process restart with persisted ${state} never re-executes`, async () => {
      let calls = 0;
      const f = await fixture({
        submit: async () => {
          calls++;
          return { status: 'HANDOFF_READY' };
        },
      });
      const execution = await claimApplicationExecution(db, f.stored);
      if (state !== 'CLAIMED') await startApplicationExecution(db, f.stored, execution.id);
      if (state === 'SUCCEEDED')
        await finishApplicationExecution(db, f.stored, execution.id, {
          status: state,
          result: { status: 'HANDOFF_READY' },
        });
      await replayRejected(f);
      assert.equal(calls, 0);
    });
  }
  it('immediate replay while the first adapter is running is rejected', async () => {
    let calls = 0,
      release,
      entered;
    const started = new Promise((resolve) => {
        entered = resolve;
      }),
      blocked = new Promise((resolve) => {
        release = resolve;
      });
    const f = await fixture({
      submit: async () => {
        calls++;
        entered();
        await blocked;
        return { status: 'HANDOFF_READY' };
      },
    });
    const first = f.first.submitJobApplication(f.args);
    await started;
    assert.equal((await f.execution()).status, 'STARTED');
    await replayRejected(f);
    release();
    await first;
    assert.equal(calls, 1);
  });
  it('manual handoff is also single-owner and returns only the approved snapshot', async () => {
    const f = await fixture(null);
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        f.service().submitJobApplication({
          ...f.args,
          applicationPackage: { ...f.pkg, tailoredResume: { markdownContent: 'B' } },
        })
      )
    );
    const winners = results.filter((r) => r.status === 'fulfilled');
    assert.equal(winners.length, 1);
    assert.equal(winners[0].value.manualHandoffKit.resumeMarkdown, 'APPROVED A');
    assert.equal((await f.execution()).status, 'SUCCEEDED');
    await replayRejected(f);
  });
  for (const attack of [
    'tenant',
    'user',
    'candidate',
    'hash',
    'legacy',
    'snapshot',
    'expired',
    'pending',
    'approved',
    'unknown state',
  ]) {
    it(`rejects ${attack} before ownership/adapter execution`, async () => {
      let calls = 0;
      const f = await fixture({
        submit: async () => {
          calls++;
          return { status: 'HANDOFF_READY' };
        },
      });
      const args = { ...f.args };
      if (['tenant', 'user', 'candidate'].includes(attack))
        args[`${attack}Id`] = crypto.randomUUID();
      else if (attack === 'hash') args.packageHash = 'f'.repeat(64);
      else if (attack === 'unknown state') {
        const get = f.first._getApprovalTicket.bind(f.first);
        f.first._getApprovalTicket = async (...a) => ({ ...(await get(...a)), status: 'UNKNOWN' });
      } else {
        const changes =
          attack === 'legacy'
            ? { metadata: {} }
            : attack === 'snapshot'
              ? {
                  metadata: {
                    ...f.stored.metadata,
                    approvalTarget: {
                      ...f.stored.metadata.approvalTarget,
                      applicationPackage: { ...f.pkg, answers: { eligible: 'changed' } },
                    },
                  },
                }
              : attack === 'expired'
                ? { expiresAt: new Date(Date.now() - 1000) }
                : { status: attack.toUpperCase() };
        await db
          .update(applicationApprovalTickets)
          .set(changes)
          .where(eq(applicationApprovalTickets.id, f.ticket.ticketId));
      }
      await assert.rejects(f.first.submitJobApplication(args));
      assert.equal(calls, 0);
      assert.equal(await f.execution(), undefined);
    });
  }
  it('snapshot changed after verification cannot be claimed (TOCTOU)', async () => {
    let calls = 0;
    const f = await fixture({
      submit: async () => {
        calls++;
        return { status: 'HANDOFF_READY' };
      },
    });
    const get = f.first._getApprovalTicket.bind(f.first);
    f.first._getApprovalTicket = async (...args) => {
      const ticket = await get(...args);
      await db
        .update(applicationApprovalTickets)
        .set({ metadata: { changed: true } })
        .where(eq(applicationApprovalTickets.id, ticket.ticketId));
      return ticket;
    };
    await assert.rejects(f.first.submitJobApplication(f.args), { code: 'CONFLICT' });
    assert.equal(calls, 0);
    assert.equal(await f.execution(), undefined);
  });
  it('adapter resolution failure is FAILED before execution, never reusable', async () => {
    const f = await fixture(handoff);
    f.first.portalAdapterRegistry = {
      resolve() {
        throw new Error('RESOLUTION_FAILURE');
      },
    };
    await assert.rejects(f.first.submitJobApplication(f.args), /RESOLUTION_FAILURE/);
    assert.equal((await f.execution()).status, 'FAILED');
    await replayRejected(f);
  });
  it('database uniqueness rejects a second execution record even if ticket status is corrupted', async () => {
    const f = await fixture(handoff);
    await f.first.submitJobApplication(f.args);
    await db
      .update(applicationApprovalTickets)
      .set({ status: 'ISSUED' })
      .where(eq(applicationApprovalTickets.id, f.ticket.ticketId));
    await assert.rejects(f.service().submitJobApplication(f.args));
    const rows = await db
      .select()
      .from(applicationExecutions)
      .where(eq(applicationExecutions.approvalId, f.ticket.ticketId));
    assert.equal(rows.length, 1);
  });
  async function withFailingInsert(table, approvalId, predicate, callback) {
    const name = `issue03_${crypto.randomUUID().replaceAll('-', '')}`;
    const identity =
      table === 'audit_logs' ? `NEW.details->>'approvalId'` : 'NEW.approval_id::text';
    await db.execute(
      sql.raw(
        `CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF ${identity} = '${approvalId}' ${predicate} THEN RAISE EXCEPTION 'ISSUE03_INJECTED_WRITE_FAILURE'; END IF; RETURN NEW; END $$`
      )
    );
    try {
      await db.execute(
        sql.raw(
          `CREATE TRIGGER ${name} BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION ${name}()`
        )
      );
      await callback();
    } finally {
      await db.execute(sql.raw(`DROP FUNCTION ${name}() CASCADE`));
    }
  }
  for (const [table, event, expected, adapterCalls] of [
    ['application_executions', null, undefined, 0],
    ['audit_logs', 'application.execution_claimed', undefined, 0],
    ['audit_logs', 'application.execution_started', 'FAILED', 0],
    ['audit_logs', 'application.execution_succeeded', 'UNKNOWN', 1],
  ]) {
    it(`real PostgreSQL abort during ${event || 'durable intent insert'} is fail-closed`, async () => {
      let calls = 0;
      const f = await fixture({
        submit: async () => {
          calls++;
          return { status: 'HANDOFF_READY' };
        },
      });
      await withFailingInsert(
        table,
        f.ticket.ticketId,
        event ? `AND NEW.event_type = '${event}'` : '',
        async () => {
          await assert.rejects(f.first.submitJobApplication(f.args));
          assert.equal((await f.execution())?.status, expected);
          assert.equal(calls, adapterCalls);
          const [application] = await db
            .select()
            .from(jobApplications)
            .where(eq(jobApplications.id, f.args.applicationId));
          assert.equal(
            application.status,
            'SAVED',
            'result/application/audit must commit or roll back together'
          );
          const [ticket] = await db
            .select()
            .from(applicationApprovalTickets)
            .where(eq(applicationApprovalTickets.id, f.ticket.ticketId));
          assert.equal(ticket.status, expected ? 'CONSUMED' : 'ISSUED');
        }
      );
      if (expected) await replayRejected(f);
      else await f.service().submitJobApplication(f.args);
      assert.equal(calls, expected ? adapterCalls : 1);
    });
  }
  it('result transaction rollback after its audit insert never permits replay', async () => {
    let calls = 0;
    const f = await fixture({
      submit: async () => {
        calls++;
        return { status: 'HANDOFF_READY' };
      },
    });
    f.first.db = transactionFault(db, 3, (target, callback) =>
      target.transaction(async (tx) => {
        await callback(tx);
        throw new Error('CRASH_BEFORE_RESULT_COMMIT_AFTER_AUDIT');
      })
    );
    await assert.rejects(f.first.submitJobApplication(f.args));
    assert.equal((await f.execution()).status, 'UNKNOWN');
    const events = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.resourceId, (await f.execution()).id));
    assert.equal(
      events.some((e) => e.eventType === 'application.execution_succeeded'),
      false
    );
    assert.equal(
      events.some((e) => e.eventType === 'application.execution_outcome_unknown'),
      true
    );
    await replayRejected(f);
    assert.equal(calls, 1);
  });
  it('result and recovery persistence both unavailable leave STARTED, never reusable', async () => {
    let calls = 0,
      transaction = 0;
    const f = await fixture({
      submit: async () => {
        calls++;
        return { status: 'HANDOFF_READY' };
      },
    });
    f.first.db = new Proxy(db, {
      get(target, key) {
        if (key === 'transaction')
          return (callback) => {
            if (++transaction >= 3) throw new Error('DATABASE_OFFLINE');
            return target.transaction(callback);
          };
        const value = Reflect.get(target, key);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    await assert.rejects(
      f.first.submitJobApplication(f.args),
      (error) => error.details.reason === 'EXECUTION_OUTCOME_UNKNOWN'
    );
    assert.equal((await f.execution()).status, 'STARTED');
    await replayRejected(f);
    assert.equal(calls, 1);
  });
  it('audit failure on duplicate rejection cannot reopen a successful execution', async () => {
    let calls = 0;
    const f = await fixture({
      submit: async () => {
        calls++;
        return { status: 'HANDOFF_READY' };
      },
    });
    await f.first.submitJobApplication(f.args);
    await withFailingInsert(
      'audit_logs',
      f.ticket.ticketId,
      "AND NEW.event_type = 'application.execution_replay_rejected'",
      () => replayRejected(f)
    );
    assert.equal((await f.execution()).status, 'SUCCEEDED');
    assert.equal(calls, 1);
  });
  it('terminal consumption cannot be overwritten by revoke or expiry helpers', async () => {
    const f = await fixture(handoff);
    await f.first.submitJobApplication(f.args);
    await assert.rejects(
      f.first.revokeApplicationApprovalTicket({ tenantId, userId, ticketId: f.ticket.ticketId }),
      { code: 'CONFLICT' }
    );
    await assert.rejects(
      f.first._updateApprovalTicketStatus(tenantId, f.ticket.ticketId, 'EXPIRED'),
      { code: 'CONFLICT' }
    );
    await replayRejected(f);
    const stored = await f.first._getApprovalTicket(tenantId, f.ticket.ticketId, {
      requireDurable: true,
    });
    assert.equal(stored.status, 'CONSUMED');
    assert.deepEqual(stored.metadata.approvalTarget, f.stored.metadata.approvalTarget);
  });
  it('audit sequence and persisted result identify the same durable execution', async () => {
    const f = await fixture(handoff);
    const result = await f.first.submitJobApplication(f.args);
    await replayRejected(f);
    await assert.rejects(
      f.service().submitJobApplication({ ...f.args, tenantId: crypto.randomUUID() }),
      { code: 'NOT_FOUND' }
    );
    await assert.rejects(
      f.service().submitJobApplication({ ...f.args, userId: crypto.randomUUID() }),
      { code: 'FORBIDDEN_TICKET_MISMATCH' }
    );
    await assert.rejects(
      f
        .service()
        .submitJobApplication({
          ...f.args,
          applicationPackage: {
            ...f.pkg,
            packageHash: f.args.packageHash,
            tailoredResume: { markdownContent: 'UNAPPROVED REPLAY B' },
          },
        }),
      { code: 'CONFLICT' }
    );
    const events = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.resourceId, result.executionId));
    assert.deepEqual(
      events.map((event) => event.eventType).sort(),
      [
        'application.execution_claimed',
        'application.execution_started',
        'application.execution_succeeded',
      ].sort()
    );
    const execution = await f.execution();
    assert.equal(execution.approvalId, f.ticket.ticketId);
    assert.equal(execution.packageId, f.stored.metadata.approvalTarget.packageId);
    assert.equal(execution.packageHash, f.args.packageHash);
    assert.deepEqual(execution.result, JSON.parse(JSON.stringify(result)));
  });
  for (const boundary of ['during adapter', 'after adapter success before persistence']) {
    it(`hard process death ${boundary} leaves durable STARTED and blocks restart`, async () => {
      const f = await fixture(handoff);
      const workflowUrl = new URL(
        '../../src/services/job-application-workflow.service.js',
        import.meta.url
      ).href;
      const dbUrl = new URL('../../src/db/index.js', import.meta.url).href;
      const script = `
        import { JobApplicationWorkflowService } from ${JSON.stringify(workflowUrl)};
        import { db } from ${JSON.stringify(dbUrl)};
        const pause = () => { console.log('ISSUE03_CRASH_BOUNDARY'); return new Promise(() => { setInterval(() => {}, 1000); }); };
        const adapter = { submit: async () => {
          console.log('ISSUE03_ADAPTER_INVOKED');
          ${boundary === 'during adapter' ? 'await pause();' : ''}
          return { status: 'SUBMITTED', authorizedSubmissionExecuted: true, externalReference: 'synthetic-success' };
        } };
        let count = 0;
        const database = new Proxy(db, { get(target, key) {
          if (key === 'transaction') return async callback => {
            if (++count === 3) await pause();
            return target.transaction(callback);
          };
          const value = Reflect.get(target, key);
          return typeof value === 'function' ? value.bind(target) : value;
        } });
        const service = new JobApplicationWorkflowService({ database, portalAdapterRegistry: { resolve: () => adapter } });
        await service.submitJobApplication(${JSON.stringify(f.args)});
      `;
      const child = spawn(process.execPath, ['--input-type=module', '-e', script], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let output = '',
        errors = '';
      const exited = new Promise((resolve) => child.once('exit', resolve));
      try {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(new Error(`Crash child timed out: ${errors}`)),
            20000
          );
          child.stdout.on('data', (data) => {
            output += data;
            if (output.includes('ISSUE03_CRASH_BOUNDARY')) {
              clearTimeout(timeout);
              resolve();
            }
          });
          child.stderr.on('data', (data) => {
            errors += data;
          });
          child.once('error', (error) => {
            clearTimeout(timeout);
            reject(error);
          });
          child.once('exit', (code) => {
            clearTimeout(timeout);
            reject(new Error(`Child exited early ${code}: ${errors}`));
          });
        });
        assert.equal(output.split('ISSUE03_ADAPTER_INVOKED').length - 1, 1);
        assert.equal((await f.execution()).status, 'STARTED');
        child.kill();
        await exited;
        await replayRejected(f);
        assert.equal((await f.execution()).status, 'STARTED');
      } finally {
        child.kill();
        await exited;
      }
    });
  }
  it('two independent Node processes and PostgreSQL pools acquire only one execution', async () => {
    const f = await fixture(handoff);
    const workflowUrl = new URL(
      '../../src/services/job-application-workflow.service.js',
      import.meta.url
    ).href;
    const dbUrl = new URL('../../src/db/index.js', import.meta.url).href;
    const script = `
      import { JobApplicationWorkflowService } from ${JSON.stringify(workflowUrl)};
      import { db, closeDatabase } from ${JSON.stringify(dbUrl)};
      const service = new JobApplicationWorkflowService({ database: db, portalAdapterRegistry: { resolve: () => ({
        submit: async () => { console.log('ADAPTER_INVOKED'); return { status: 'HANDOFF_READY' }; }
      }) } });
      const get = service._getApprovalTicket.bind(service);
      service._getApprovalTicket = async (...args) => {
        const ticket = await get(...args);
        console.log('APPROVAL_LOADED');
        await new Promise(resolve => process.stdin.once('data', resolve));
        return ticket;
      };
      try { await service.submitJobApplication(${JSON.stringify(f.args)}); console.log('WINNER'); }
      catch(error) { console.log('REJECTED:' + error.code + ':' + error.details); }
      finally { await closeDatabase(); process.stdin.destroy(); }
    `;
    const workers = Array.from({ length: 2 }, () => {
      const child = spawn(process.execPath, ['--input-type=module', '-e', script], {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const worker = { child, output: '', errors: '' };
      worker.exit = new Promise((resolve) => child.once('exit', resolve));
      worker.loaded = new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error(`Worker startup timed out: ${worker.errors}`)),
          20000
        );
        child.stdout.on('data', (data) => {
          worker.output += data;
          if (worker.output.includes('APPROVAL_LOADED')) {
            clearTimeout(timeout);
            resolve();
          }
        });
        child.stderr.on('data', (data) => {
          worker.errors += data;
        });
        child.once('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
        child.once('exit', (code) => {
          clearTimeout(timeout);
          reject(new Error(`Worker exited early: ${code} ${worker.errors}`));
        });
      });
      return worker;
    });
    try {
      await Promise.all(workers.map((worker) => worker.loaded));
      for (const worker of workers) worker.child.stdin.write('go\n');
      const codes = await Promise.all(workers.map((worker) => worker.exit));
      assert.deepEqual(codes, [0, 0]);
      const output = workers.map((worker) => worker.output).join('\n');
      assert.equal(output.split('ADAPTER_INVOKED').length - 1, 1);
      assert.equal(output.split('WINNER').length - 1, 1);
      assert.equal(output.split('REJECTED:CONFLICT:TICKET_ALREADY_CONSUMED').length - 1, 1);
      assert.equal((await f.execution()).status, 'SUCCEEDED');
      console.log('ISSUE-03 processes=2 adapterCalls=1');
    } finally {
      for (const worker of workers) worker.child.kill();
      await Promise.all(workers.map((worker) => worker.exit));
    }
  });
  it('application status write failure rolls back the result and cannot resubmit', async () => {
    let calls = 0;
    const f = await fixture({
      submit: async () => {
        calls++;
        return { status: 'SUBMITTED', authorizedSubmissionExecuted: true };
      },
    });
    const name = `issue03_${crypto.randomUUID().replaceAll('-', '')}`;
    await db.execute(
      sql.raw(
        `CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id::text = '${f.args.applicationId}' THEN RAISE EXCEPTION 'APPLICATION_STATUS_FAILURE'; END IF; RETURN NEW; END $$`
      )
    );
    try {
      await db.execute(
        sql.raw(
          `CREATE TRIGGER ${name} BEFORE UPDATE ON job_applications FOR EACH ROW EXECUTE FUNCTION ${name}()`
        )
      );
      await assert.rejects(f.first.submitJobApplication(f.args));
      assert.equal((await f.execution()).status, 'UNKNOWN');
      const [application] = await db
        .select()
        .from(jobApplications)
        .where(eq(jobApplications.id, f.args.applicationId));
      assert.equal(application.status, 'SAVED');
      await replayRejected(f);
      assert.equal(calls, 1);
    } finally {
      await db.execute(sql.raw(`DROP FUNCTION ${name}() CASCADE`));
    }
  });
  it('operator reconciliation records result/status/audit without invoking the adapter again', async () => {
    let calls = 0;
    const f = await fixture({
      submit: async () => {
        calls++;
        throw new Error('NETWORK_DISCONNECT');
      },
    });
    await assert.rejects(f.first.submitJobApplication(f.args));
    const execution = await f.execution();
    assert.equal(execution.status, 'UNKNOWN');
    await finishApplicationExecution(db, f.stored, execution.id, {
      fromStatus: 'UNKNOWN',
      status: 'SUCCEEDED',
      reconciliationEvidence: 'synthetic-provider-lookup:confirmed-123',
      result: {
        executionId: execution.id,
        applicationId: f.args.applicationId,
        status: 'SUBMITTED',
        submittedAt: new Date().toISOString(),
        externalReference: 'confirmed-123',
      },
    });
    const reconciled = await f.execution();
    assert.equal(reconciled.status, 'SUCCEEDED');
    assert.equal(reconciled.externalReference, 'confirmed-123');
    await assert.rejects(
      finishApplicationExecution(db, f.stored, execution.id, {
        fromStatus: 'SUCCEEDED',
        status: 'FAILED',
      }),
      /Terminal executions/
    );
    const events = await db.select().from(auditLogs).where(eq(auditLogs.resourceId, execution.id));
    assert.equal(
      events.filter((event) => event.eventType === 'application.execution_reconciliation_completed')
        .length,
      1
    );
    assert.equal(
      events.find((event) => event.eventType === 'application.execution_reconciliation_completed')
        .details.databaseActor,
      (await db.execute(sql`select current_user as actor`)).rows[0].actor
    );
    const [application] = await db
      .select()
      .from(jobApplications)
      .where(eq(jobApplications.id, f.args.applicationId));
    assert.equal(application.status, 'SUBMITTED');
    await replayRejected(f);
    assert.equal(calls, 1);
  });
  it('UNKNOWN cannot be marked successful without reconciliation evidence', async () => {
    const f = await fixture({
      submit: async () => {
        throw new Error('TIMEOUT');
      },
    });
    await assert.rejects(f.first.submitJobApplication(f.args));
    const execution = await f.execution();
    await assert.rejects(
      finishApplicationExecution(db, f.stored, execution.id, {
        fromStatus: 'UNKNOWN',
        status: 'SUCCEEDED',
        result: { status: 'HANDOFF_READY' },
      }),
      /reconciliation evidence/
    );
    assert.equal((await f.execution()).status, 'UNKNOWN');
    await replayRejected(f);
  });
});
