/** Credential-safe, read-only connection probe. Never migrates or reads candidate data. */
import pg from 'pg';
import { X509Certificate } from 'node:crypto';
import { config } from '../src/config/env.js';
import { getPoolConfig, closeDatabase } from '../src/db/index.js';

const options = getPoolConfig();
const target = new URL(options.connectionString);
console.log(
  JSON.stringify({
    explicitEnvironmentFile: Boolean(process.env.ENV_FILE),
    passwordPresent: Boolean(target.password),
    caConfigured: Boolean(options.ssl?.ca),
    certificateValidation: options.ssl?.rejectUnauthorized === true,
  })
);
await closeDatabase();
if (process.argv.includes('--connect')) {
  if (!options.ssl || options.ssl.rejectUnauthorized !== true)
    throw Error('Verified TLS required for probe');
  const client = new pg.Client({ ...options, connectionTimeoutMillis: 10000 });
  try {
    await client.connect();
    await client.query('SELECT 1');
    const peer = client.connection.stream.getPeerCertificate();
    const certificate = new X509Certificate(peer.raw);
    console.log(
      JSON.stringify({
        connected: true,
        readOnlyProbe: true,
        tlsAuthorized: client.connection.stream.authorized,
        hostnameMatches: Boolean(certificate.checkHost(target.hostname)),
        authentication: 'ACCEPTED',
      })
    );
  } catch (error) {
    console.log(
      JSON.stringify({
        connected: false,
        code: error.code || 'CONNECTION_FAILED',
        authentication: error.code === '28P01' ? 'REJECTED' : 'NOT_ESTABLISHED',
      })
    );
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}
