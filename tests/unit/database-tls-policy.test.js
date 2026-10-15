import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rootCertificates } from 'node:tls';
import { X509Certificate } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { databaseTlsOptions, resolveDatabaseCa } from '../../src/db/tls-config.js';

const pem = rootCertificates.find((value) => {
  const cert = new X509Certificate(value);
  return (
    cert.ca && Date.parse(cert.validFrom) < Date.now() && Date.parse(cert.validTo) > Date.now()
  );
});
test('remote connections validate certificate and hostname in every environment', () => {
  const value = databaseTlsOptions({
    connectionString:
      'postgres://fixture:unused@db.example.test/test?sslmode=require&sslrootcert=other.pem&uselibpqcompat=true',
  });
  assert.equal(value.ssl.rejectUnauthorized, true);
  assert.equal(value.ssl.ca, undefined);
  assert.equal(new URL(value.connectionString).search, '');
  assert.equal(
    databaseTlsOptions({ connectionString: 'postgres://localhost.attacker.test/test' }).ssl
      .rejectUnauthorized,
    true
  );
});
test('disposable loopback PostgreSQL remains usable without TLS', () => {
  assert.equal(
    databaseTlsOptions({ connectionString: 'postgres://127.0.0.1:55449/test' }).ssl,
    false
  );
});
test('CA supports validated PEM, escaped PEM and explicitly resolved file paths', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'career-ca-test-'));
  try {
    fs.writeFileSync(path.join(dir, 'ca.pem'), pem);
    const expected = resolveDatabaseCa({ ca: pem });
    assert.equal(resolveDatabaseCa({ ca: pem.replace(/\n/g, '\\n') }), expected);
    assert.equal(resolveDatabaseCa({ caFile: 'ca.pem', baseDir: dir }), expected);
    assert.equal(resolveDatabaseCa({ ca: 'ca.pem', baseDir: dir }), expected);
  } finally {
    fs.unlinkSync(path.join(dir, 'ca.pem'));
    fs.rmdirSync(dir);
  }
});
test('ambiguous, missing, malformed and private-key CA input fails closed', () => {
  for (const input of [
    { ca: pem, caFile: 'ca.pem' },
    { caFile: 'missing-file.pem' },
    { ca: '-----BEGIN CERTIFICATE-----\ninvalid\n-----END CERTIFICATE-----' },
    { ca: pem + '\n-----BEGIN PRIVATE KEY-----' },
  ]) {
    assert.throws(
      () => resolveDatabaseCa(input),
      (error) => /^DATABASE_TLS_CA_/.test(error.code)
    );
  }
});
