import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { pool, closeDatabase } from '../../src/db/index.js';

after(async () => {
  await closeDatabase(pool);
});

async function isolatedDatabase(run) {
  // The parent pool must be the explicitly configured disposable loopback cluster.
  const url = new URL(pool.options.connectionString);
  assert.equal(url.hostname, '127.0.0.1');
  assert.equal(Number(url.port), 55431);
  const name = `issue06_${randomUUID().replaceAll('-', '')}`;
  assert.match(name, /^issue06_[a-f0-9]{32}$/);
  await pool.query(`CREATE DATABASE ${name}`);
  url.pathname = `/${name}`;
  const child = new pg.Pool({ connectionString: url.toString(), ssl: false, max: 2, min: 0 });
  try {
    await run(drizzle(child), child);
  } finally {
    await child.end();
    await pool.query(`DROP DATABASE ${name} WITH (FORCE)`);
  }
}

test('fresh real PostgreSQL schema and repeat migration are safe', async () =>
  isolatedDatabase(async (database, child) => {
    const migrations = readMigrationFiles({ migrationsFolder: './drizzle' });
    const options = { migrationsSchema: 'drizzle', migrationsTable: '__drizzle_migrations' };
    await database.dialect.migrate(migrations, database.session, options);
    await database.dialect.migrate(migrations, database.session, options);
    assert.equal(
      Number(
        (await child.query('SELECT count(*) FROM drizzle.__drizzle_migrations')).rows[0].count
      ),
      22
    );
    const triggers = (
      await child.query(
        "SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND tgname IN ('evidence_verification_guard','candidate_skill_verification_guard','resource_evidence_invalidation','connection_evidence_invalidation')"
      )
    ).rows;
    assert.equal(triggers.length, 4);
  }));

test('migration transaction rollback leaves no partial verification guards', async () =>
  isolatedDatabase(async (database, child) => {
    const migrations = readMigrationFiles({ migrationsFolder: './drizzle' });
    const options = { migrationsSchema: 'drizzle', migrationsTable: '__drizzle_migrations' };
    await database.dialect.migrate(migrations.slice(0, -1), database.session, options);
    await child.query('BEGIN');
    try {
      for (const statement of migrations.at(-1).sql) await child.query(statement);
      assert.equal(
        Number(
          (
            await child.query(
              "SELECT count(*) FROM pg_trigger WHERE tgname='evidence_verification_guard'"
            )
          ).rows[0].count
        ),
        1
      );
    } finally {
      await child.query('ROLLBACK');
    }
    assert.equal(
      Number(
        (
          await child.query(
            "SELECT count(*) FROM pg_trigger WHERE tgname='evidence_verification_guard'"
          )
        ).rows[0].count
      ),
      0
    );
    assert.equal(
      Number(
        (await child.query('SELECT count(*) FROM drizzle.__drizzle_migrations')).rows[0].count
      ),
      21
    );
    await database.dialect.migrate(migrations, database.session, options);
    assert.equal(
      Number(
        (
          await child.query(
            "SELECT count(*) FROM pg_trigger WHERE tgname='evidence_verification_guard'"
          )
        ).rows[0].count
      ),
      1
    );
  }));

test('upgrade preserves historical evidence and claims, downgrades unsupported VERIFIED, repeat does not restore it', async () =>
  isolatedDatabase(async (database, child) => {
    const migrations = readMigrationFiles({ migrationsFolder: './drizzle' });
    const options = { migrationsSchema: 'drizzle', migrationsTable: '__drizzle_migrations' };
    await database.dialect.migrate(migrations.slice(0, -1), database.session, options);
    const tenant = randomUUID(),
      user = randomUUID(),
      candidate = randomUUID(),
      resource = randomUUID(),
      skill = randomUUID(),
      evidence = randomUUID();
    await child.query("INSERT INTO tenants (id,name,slug) VALUES ($1,'Historical fixture',$2)", [
      tenant,
      `historical-${tenant}`,
    ]);
    await child.query(
      "INSERT INTO users (id,tenant_id,email,display_name) VALUES ($1,$2,$3,'Historical candidate')",
      [user, tenant, `${user}@example.test`]
    );
    await child.query(
      "INSERT INTO candidates (id,tenant_id,user_id,display_name) VALUES ($1,$2,$3,'Historical candidate')",
      [candidate, tenant, user]
    );
    await child.query(
      "INSERT INTO resources (id,tenant_id,candidate_id,provider,external_resource_id,name,display_name) VALUES ($1,$2,$3,'GITHUB_APP','123','owner/repo','Repository')",
      [resource, tenant, candidate]
    );
    await child.query(
      "INSERT INTO skills (id,slug,name,category) VALUES ($1,$2,'React','FRAMEWORK')",
      [skill, `historical-${skill}`]
    );
    await child.query(
      "INSERT INTO evidence_items (id,tenant_id,candidate_id,resource_id,skill_id,evidence_type,source_provider,source_location,excerpt,metadata) VALUES ($1,$2,$3,$4,$5,'CODE_IMPORT_USAGE','GITHUB_APP',$6,'original preserved excerpt',$7)",
      [
        evidence,
        tenant,
        candidate,
        resource,
        skill,
        { filePath: 'src/app.js', commitSha: 'HEAD' },
        { fingerprint: 'preserved', verification: { status: 'VERIFIED' } },
      ]
    );
    await child.query(
      "INSERT INTO candidate_skills (tenant_id,candidate_id,skill_id,category,provenance_status,metadata) VALUES ($1,$2,$3,'FRAMEWORK','VERIFIED',$4)",
      [tenant, candidate, skill, { isUserClaim: true, claimNote: 'Preserve this claim' }]
    );
    // A second tenant must remain a separate source/claim lineage during upgrade.
    const foreignTenant = randomUUID(),
      foreignUser = randomUUID(),
      foreignCandidate = randomUUID(),
      foreignResource = randomUUID(),
      foreignEvidence = randomUUID();
    await child.query("INSERT INTO tenants (id,name,slug) VALUES ($1,'Other tenant',$2)", [
      foreignTenant,
      `historical-${foreignTenant}`,
    ]);
    await child.query(
      "INSERT INTO users (id,tenant_id,email,display_name) VALUES ($1,$2,$3,'Other user')",
      [foreignUser, foreignTenant, `${foreignUser}@example.test`]
    );
    await child.query(
      "INSERT INTO candidates (id,tenant_id,user_id,display_name) VALUES ($1,$2,$3,'Other candidate')",
      [foreignCandidate, foreignTenant, foreignUser]
    );
    await child.query(
      "INSERT INTO resources (id,tenant_id,candidate_id,provider,external_resource_id,name,display_name) VALUES ($1,$2,$3,'GITHUB_APP','456','other/repo','Other repository')",
      [foreignResource, foreignTenant, foreignCandidate]
    );
    await child.query(
      "INSERT INTO evidence_items (id,tenant_id,candidate_id,resource_id,skill_id,evidence_type,source_provider,source_location,excerpt,metadata) VALUES ($1,$2,$3,$4,$5,'DOCUMENT_CLAIM','GITHUB_APP',$6,'Other preserved claim',$7)",
      [
        foreignEvidence,
        foreignTenant,
        foreignCandidate,
        foreignResource,
        skill,
        { filePath: 'README.md' },
        { note: 'Other tenant note', verification: { status: 'VERIFIED' } },
      ]
    );
    await database.dialect.migrate(migrations, database.session, options);
    await database.dialect.migrate(migrations, database.session, options);
    const e = (await child.query('SELECT * FROM evidence_items WHERE id=$1', [evidence])).rows[0];
    assert.equal(e.excerpt, 'original preserved excerpt');
    assert.equal(e.metadata.fingerprint, 'preserved');
    assert.equal(e.metadata.verification.status, 'OBSERVED');
    assert.equal(e.metadata.verification.previousMetadata.status, 'VERIFIED');
    const s = (
      await child.query('SELECT * FROM candidate_skills WHERE candidate_id=$1', [candidate])
    ).rows[0];
    assert.equal(s.provenance_status, 'CLAIMED');
    assert.equal(s.metadata.claimNote, 'Preserve this claim');
    assert.equal(s.metadata.issue06HistoricalStatus, 'VERIFIED');
    const foreign = (
      await child.query('SELECT * FROM evidence_items WHERE id=$1', [foreignEvidence])
    ).rows[0];
    assert.equal(foreign.tenant_id, foreignTenant);
    assert.equal(foreign.candidate_id, foreignCandidate);
    assert.equal(foreign.resource_id, foreignResource);
    assert.equal(foreign.excerpt, 'Other preserved claim');
    assert.equal(foreign.metadata.note, 'Other tenant note');
    assert.equal(foreign.metadata.verification.status, 'OBSERVED');
    assert.equal(e.tenant_id, tenant);
    assert.equal(e.candidate_id, candidate);
    assert.equal(e.resource_id, resource);
  }));
