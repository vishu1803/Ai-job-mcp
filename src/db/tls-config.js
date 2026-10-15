import fs from 'node:fs';
import path from 'node:path';
import { X509Certificate } from 'node:crypto';

function invalid(code) {
  const error = new Error(
    'Database TLS CA configuration is invalid. Supply a trusted PEM CA certificate or readable certificate file.'
  );
  error.code = code;
  return error;
}

/** Public certificates only; never accept a private key or silently use an invalid CA. */
export function resolveDatabaseCa({ ca = '', caFile = '', baseDir = process.cwd() } = {}) {
  if (!ca && !caFile) return undefined;
  if (ca && caFile) throw invalid('DATABASE_TLS_CA_AMBIGUOUS');
  let pem = ca;
  if (caFile || !ca.trim().startsWith('-----BEGIN CERTIFICATE-----')) {
    const file = caFile || ca;
    if (/\r|\n|-----BEGIN/.test(file)) throw invalid('DATABASE_TLS_CA_INVALID');
    try {
      const target = path.resolve(baseDir, file);
      const stat = fs.statSync(target);
      if (!stat.isFile() || stat.size > 256 * 1024) throw Error();
      pem = fs.readFileSync(target, 'utf8');
    } catch {
      throw invalid('DATABASE_TLS_CA_FILE_UNREADABLE');
    }
  }
  pem = pem.replace(/\\n/g, '\n').trim();
  if (pem.length > 256 * 1024 || /PRIVATE KEY/.test(pem)) throw invalid('DATABASE_TLS_CA_INVALID');
  const certificates = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g);
  if (
    !certificates?.length ||
    pem.replace(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g, '').trim()
  )
    throw invalid('DATABASE_TLS_CA_INVALID');
  for (const certificate of certificates) {
    try {
      const parsed = new X509Certificate(certificate);
      if (!parsed.ca) throw Error();
      const now = Date.now();
      if (Date.parse(parsed.validFrom) > now || Date.parse(parsed.validTo) < now) throw Error();
    } catch {
      throw invalid('DATABASE_TLS_CA_INVALID');
    }
  }
  return certificates.join('\n') + '\n';
}

export function databaseTlsOptions({ connectionString, ssl = false, ca, caFile, baseDir }) {
  const url = new URL(connectionString);
  const loopback = ['localhost', '127.0.0.1', '[::1]', 'host.docker.internal'].includes(
    url.hostname.toLowerCase()
  );
  const requested =
    ssl ||
    !loopback ||
    ['require', 'verify-full', 'verify-ca'].includes(url.searchParams.get('sslmode')) ||
    url.searchParams.get('ssl') === 'true';
  // pg-connection-string must not replace the trusted, hostname-validating object.
  for (const name of ['ssl', 'sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'uselibpqcompat'])
    url.searchParams.delete(name);
  return {
    connectionString: url.toString(),
    ssl: requested
      ? { rejectUnauthorized: true, ca: resolveDatabaseCa({ ca, caFile, baseDir }) }
      : false,
  };
}
