# Resume Quality Milestone A — access to the existing Aiven database

2026-10-15. **DEFERRED — optional direct-access guidance, superseded as a prerequisite.**

The owner's latest instruction requires existing authenticated application reads
first, without a new database or separate read-only user prerequisite. See the
[current read-service map](resume-quality-authenticated-read-map.md). Do not provision
a login or execute the operator SQL below for the current application-read task.
This historical guide applies only if direct SQL is later shown necessary and
separately authorized. No direct SQL is currently requested.

The target is the PostgreSQL database already configured in Career Hub. No new
database, fork, reset, migration, candidate-data transfer or remote regeneration
is requested or authorized. Local application NODE_ENV does not establish the
database's environment. Record its actual classification from the service owner.

Offline recheck: the configured application username is administrator-style;
no separate resume-audit login or trusted CA is configured in the inspected local
environment files; administrator rotation/revocation remains unconfirmed. The
application's development pool disables certificate verification. No database
client was initialized, connection attempted or query executed.

## Operator actions in the existing service

1. Open the **existing PostgreSQL service** in Aiven Console. Confirm that its
   connection host/port and the selected database match the application's current
   target privately. Do not paste those details or credentials in chat. Report
   whether the actual database is development, staging or production; do not infer
   that from the application mode or service name alone.
2. Open **Connect → Users**. If the exposed administrator password was already
   rotated/revoked, provide only its confirmation date or provider audit reference.
   Otherwise the service administrator must reset that account's password using
   the account's credential-reset action, then securely update legitimate consumers.
   Do not delete the account or service, and do not put passwords in shell arguments
   or chat. If the console offers no credential-reset action, report the available
   actions rather than guessing. No administrator-login probe will be run by the agent.
3. In **Connect → Users → Add service user / Create user**, create a normal user
   named `resume_quality_ro`. If that name already exists, have its administrator
   review it before reuse; do not alter an unrelated login. Creating a service user
   alone does **not** establish read-only table access.
4. Have the service administrator apply the permission setup below to this login,
   in the **same existing database**. This is operator access provisioning, not an
   agent-executed migration. No candidate/application records are changed.
5. Open **Overview → Connection information → CA Certificate → Download** and
   save the CA bundle locally. This is the project CA, not a client private key.
6. Save the audit user's connection URI for the exact same host/port/database and
   the CA path in a protected local file. Do not replace the app's normal `.env`
   credentials. Supply only the file path and rotation/environment confirmation
   in chat.

[Aiven service-user steps](https://aiven.io/docs/products/postgresql/howto/manage-service-users),
[read-only permissions](https://aiven.io/docs/products/postgresql/howto/readonly-user),
[CA download and verification modes](https://aiven.io/docs/platform/concepts/tls-ssl-certificates),
[documented credential-reset capability](https://aiven.io/docs/tools/cli/service/user).

## Permission setup — operator only

Use the existing database administrator's trusted SQL client, or Aiven's **SQL
editor**, selecting the exact existing database. Type the SQL manually; do not
send private records or credentials to the AI Assistant. The console editor itself
uses the administrator account, so it will not be used by the investigation agent.
See [PG Studio connections](https://aiven.io/docs/products/postgresql/howto/pg-studio/security-connections)
and [opening the editor](https://aiven.io/docs/products/postgresql/howto/pg-studio/get-started).

For a newly created audit login with no existing ownership or memberships, have
the administrator review and run the following. Replace only the database-name
placeholder with the existing database name. If any table is absent or the account
has inherited/admin rights, stop and report that rather than widening grants.

First check that this returns exactly one row and all three values are false:

```sql
SELECT rolsuper, rolreplication, rolbypassrls
FROM pg_roles WHERE rolname = 'resume_quality_ro';
```

If any is true, stop and ask the service administrator/Aiven support to correct the
login. The grant script intentionally does not try to change SUPERUSER/BYPASSRLS
attributes, which a managed non-superuser administrator might not be permitted to
alter. See [PostgreSQL role restrictions](https://www.postgresql.org/docs/current/sql-alterrole.html)
and [Aiven administrator privileges](https://aiven.io/docs/products/postgresql/concepts/dba-tasks-pg).

```sql
BEGIN;
ALTER ROLE resume_quality_ro
  NOCREATEDB NOCREATEROLE NOINHERIT;
ALTER ROLE resume_quality_ro SET default_transaction_read_only = on;
ALTER ROLE resume_quality_ro SET statement_timeout = '10s';
GRANT CONNECT ON DATABASE "<existing_database_name>" TO resume_quality_ro;
GRANT USAGE ON SCHEMA public TO resume_quality_ro;
GRANT SELECT ON TABLE
  public.candidates, public.resumes, public.resume_sections,
  public.candidate_claims, public.candidate_skills, public.skills,
  public.evidence_items, public.projects, public.project_resources,
  public.resources, public.application_packages, public.job_applications
TO resume_quality_ro;
COMMIT;
```

Do not grant access to sessions, users, OAuth/provider credentials, approval
signing material, sequences, all tables or future tables. No CREATE/INSERT/UPDATE/
DELETE/TRUNCATE privileges or administrative role memberships are needed. Default
read-only transactions are an extra guard, not a substitute for restricted grants.
The subsequent audit must inspect effective inherited/PUBLIC permissions and
ownership too; this setup is not itself a claim that access has been verified.

## Local private configuration

An option is `.env.resume-audit.local` in the existing checkout (already excluded
by `.gitignore`). Do not commit it. Restrict file access to your Windows account.

```dotenv
RESUME_AUDIT_DATABASE_URL="<same database URI with resume_quality_ro credentials>"
RESUME_AUDIT_DATABASE_CA_FILE="C:/path/to/downloaded/ca.pem"
RESUME_AUDIT_ADMIN_ROTATED_AT="<confirmed rotation timestamp>"
RESUME_AUDIT_DATABASE_ENVIRONMENT="<owner-confirmed classification>"
```

The dedicated audit client will not initialize the application pool. It must
compare the target host/port/database to the current configured target, use the
downloaded CA with `rejectUnauthorized: true` and hostname validation, then verify
only current-role/TLS metadata before any candidate query. `sslmode=require`
alone does not verify certificates. Do not change NODE_ENV as an SSL workaround.

Only after all retained authorization conditions pass may it execute bounded,
parameterized SELECTs for the owner's candidate/tenant/application in explicit
read-only transactions. Store reviewed data privately and generate corrected
documents locally without writing to the source database or calling AI providers.

Return only: the private config path, CA path if separate, database environment
classification and rotation/revocation confirmation. No password, URI, token,
private key or personal contact information is needed in chat.
