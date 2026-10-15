/** Configuration only: no connection or database query. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rootCertificates } from 'node:tls';
import { getPoolConfig } from '../../src/db/index.js';
import { config } from '../../src/config/env.js';

test('explicit TLS verification and existing CA are honored in development too', () => {
  const old = {
    mode: config.NODE_ENV,
    url: config.DATABASE_URL,
    flag: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED,
    ca: process.env.DATABASE_CA_CERT,
  };
  try {
    config.NODE_ENV = 'development';
    config.DATABASE_URL =
      'postgres://synthetic:unused@db.example.test:5432/existing?sslmode=require';
    process.env.DATABASE_SSL_REJECT_UNAUTHORIZED = 'true';
    process.env.DATABASE_CA_CERT = rootCertificates.find((pem) =>
      pem.includes('BEGIN CERTIFICATE')
    );
    const options = getPoolConfig();
    assert.equal(options.ssl.rejectUnauthorized, true);
    assert.equal(options.ssl.ca.trim(), process.env.DATABASE_CA_CERT.trim());
    assert.ok(!options.connectionString.includes('sslmode='));
  } finally {
    config.NODE_ENV = old.mode;
    config.DATABASE_URL = old.url;
    for (const [name, value] of [
      ['DATABASE_SSL_REJECT_UNAUTHORIZED', old.flag],
      ['DATABASE_CA_CERT', old.ca],
    ])
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
  }
});
