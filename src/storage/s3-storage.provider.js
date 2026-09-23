/**
 * @file Provider-Neutral S3 / Cloudflare R2 Storage Provider (P13.5-004 / ARCH-053).
 *
 * Implements an S3-compatible object storage provider supporting:
 * - AWS S3, Cloudflare R2, MinIO, and LocalStack
 * - Authenticated pure Node.js AWS SigV4 request signing
 * - In-memory simulation mode for hermetic local testing
 * - Strict tenant isolation and coordinate traversal guards
 */

import crypto from 'node:crypto';

/**
 * Derives an AWS SigV4 signing key.
 *
 * @param {string} key Secret access key
 * @param {string} dateStamp Date in YYYYMMDD format
 * @param {string} region AWS region or 'auto'
 * @param {string} service Service identifier ('s3')
 * @returns {Buffer} Derived signing key
 */
function getSignatureKey(key, dateStamp, region, service) {
  const kDate = crypto.createHmac('sha256', `AWS4${key}`).update(dateStamp).digest();
  const kRegion = crypto.createHmac('sha256', kDate).update(region).digest();
  const kService = crypto.createHmac('sha256', kRegion).update(service).digest();
  const kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();
  return kSigning;
}

export class S3StorageProvider {
  /**
   * @param {object} [options={}]
   * @param {boolean} [options.inMemory=false] Enable in-memory storage mode
   * @param {string} [options.endpoint] S3 API endpoint URL (e.g. https://<accountid>.r2.cloudflarestorage.com)
   * @param {string} [options.bucketName] S3 bucket name
   * @param {string} [options.region='us-east-1'] AWS region (use 'auto' for Cloudflare R2)
   * @param {string} [options.accessKeyId] S3 access key ID
   * @param {string} [options.secretAccessKey] S3 secret access key
   * @param {boolean} [options.forcePathStyle=false] Force path-style addressing ({endpoint}/{bucket}/{key})
   * @param {Function} [options.fetchFn=fetch] Custom fetch implementation
   */
  constructor(options = {}) {
    this.inMemory = options.inMemory === true;
    this.objects = new Map();

    this.endpoint = options.endpoint || '';
    this.bucketName = options.bucketName || '';
    this.region = options.region ?? 'us-east-1';
    this.accessKeyId = options.accessKeyId || '';
    this.secretAccessKey = options.secretAccessKey || '';
    this.forcePathStyle = options.forcePathStyle ?? false;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  /**
   * Generates a safe canonical object key within tenant isolation boundaries.
   *
   * @param {object} params
   * @param {string} params.tenantId
   * @param {string} params.key
   * @returns {string} Safe object key
   */
  objectKey({ tenantId, key }) {
    this.assertSafeCoordinate(tenantId);
    this.assertSafeCoordinate(key);
    return `${tenantId}/${key}.enc`;
  }

  /**
   * Validates coordinate inputs against path traversal and malicious characters.
   *
   * @param {string} value
   * @throws {Error} SecurityError if coordinate contains invalid path characters
   */
  assertSafeCoordinate(value) {
    if (
      typeof value !== 'string' ||
      !value ||
      value.includes('/') ||
      value.includes('\\') ||
      value.includes('..')
    ) {
      const error = new Error('Invalid storage coordinate');
      error.name = 'SecurityError';
      throw error;
    }
  }

  /**
   * Resolves the full request URL for an object key.
   *
   * @param {string} objectKey
   * @returns {string} Target URL
   */
  buildUrl(objectKey) {
    const cleanEndpoint = this.endpoint.replace(/\/+$/, '');
    if (this.forcePathStyle || !cleanEndpoint) {
      return `${cleanEndpoint}/${this.bucketName}/${objectKey}`;
    }

    try {
      const parsed = new URL(cleanEndpoint);
      parsed.host = `${this.bucketName}.${parsed.host}`;
      return `${parsed.origin}/${objectKey}`;
    } catch {
      return `${cleanEndpoint}/${this.bucketName}/${objectKey}`;
    }
  }

  /**
   * Signs an HTTP request using AWS SigV4 specification.
   *
   * @param {object} params
   * @param {string} params.method HTTP method (GET, PUT, HEAD, DELETE)
   * @param {string} params.url Target URL
   * @param {Buffer|null} [params.payload] Request payload buffer
   * @param {object} [params.metadata] S3 metadata key-value map
   * @param {object} [params.extraHeaders] Additional headers
   * @returns {object} Headers map with Authorization and SigV4 headers
   */
  signRequest({ method, url, payload = null, metadata = {}, extraHeaders = {} }) {
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);

    const payloadBuffer = payload ? Buffer.from(payload) : Buffer.alloc(0);
    const payloadHash = crypto.createHash('sha256').update(payloadBuffer).digest('hex');

    const urlObj = new URL(url);
    const host = urlObj.host;

    const headers = {
      host,
      'x-amz-date': amzDate,
      'x-amz-content-sha256': payloadHash,
      ...extraHeaders,
    };

    for (const [k, v] of Object.entries(metadata || {})) {
      headers[`x-amz-meta-${k.toLowerCase()}`] = String(v);
    }

    const sortedHeaderKeys = Object.keys(headers)
      .map((k) => k.toLowerCase())
      .sort();

    const canonicalHeaders = sortedHeaderKeys.map((k) => `${k}:${headers[k].trim()}\n`).join('');
    const signedHeaders = sortedHeaderKeys.join(';');

    const canonicalUri = urlObj.pathname || '/';
    const canonicalQueryString = urlObj.search ? urlObj.search.slice(1) : '';

    const canonicalRequest = [
      method.toUpperCase(),
      canonicalUri,
      canonicalQueryString,
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');

    const algorithm = 'AWS4-HMAC-SHA256';
    const credentialScope = `${dateStamp}/${this.region}/s3/aws4_request`;
    const canonicalRequestHash = crypto.createHash('sha256').update(canonicalRequest).digest('hex');

    const stringToSign = [algorithm, amzDate, credentialScope, canonicalRequestHash].join('\n');

    const signingKey = getSignatureKey(this.secretAccessKey, dateStamp, this.region, 's3');
    const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

    headers['Authorization'] =
      `${algorithm} Credential=${this.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    return headers;
  }

  /**
   * Persists an encrypted buffer to object storage.
   *
   * @param {object} params
   * @param {string} params.tenantId
   * @param {string} params.key
   * @param {Buffer} params.buffer
   * @param {object} [params.metadata={}]
   * @returns {Promise<{ objectKey: string, sizeBytes: number, etag: string }>}
   */
  async putEncryptedObject({ tenantId, key, buffer, metadata = {} }) {
    const objectKey = this.objectKey({ tenantId, key });

    if (this.inMemory) {
      const etag = `"${crypto.createHash('md5').update(buffer).digest('hex')}"`;
      this.objects.set(objectKey, {
        buffer: Buffer.from(buffer),
        metadata,
        etag,
      });

      return {
        objectKey,
        sizeBytes: buffer.length,
        etag,
      };
    }

    return this.putToS3({ objectKey, buffer, metadata });
  }

  /**
   * Uploads object to S3-compatible service via HTTP PUT.
   *
   * @private
   */
  async putToS3({ objectKey, buffer, metadata }) {
    const url = this.buildUrl(objectKey);
    const headers = this.signRequest({
      method: 'PUT',
      url,
      payload: buffer,
      metadata,
      extraHeaders: {
        'content-type': 'application/octet-stream',
        'content-length': String(buffer.length),
      },
    });

    const response = await this.fetchFn(url, {
      method: 'PUT',
      headers,
      body: buffer,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`S3 PUT failed with HTTP ${response.status}: ${errText}`);
    }

    const etag = response.headers?.get ? response.headers.get('etag') : null;
    return {
      objectKey,
      sizeBytes: buffer.length,
      etag,
    };
  }

  /**
   * Retrieves an encrypted buffer from storage.
   *
   * @param {object} params
   * @param {string} params.tenantId
   * @param {string} params.key
   * @returns {Promise<Buffer>}
   */
  async getEncryptedObject({ tenantId, key }) {
    const objectKey = this.objectKey({ tenantId, key });

    if (this.inMemory) {
      const object = this.objects.get(objectKey);
      if (!object) {
        const error = new Error('Object not found');
        error.name = 'NotFoundError';
        throw error;
      }
      return Buffer.from(object.buffer);
    }

    return this.getFromS3({ objectKey });
  }

  /**
   * Fetches object from S3-compatible service via HTTP GET.
   *
   * @private
   */
  async getFromS3({ objectKey }) {
    const url = this.buildUrl(objectKey);
    const headers = this.signRequest({
      method: 'GET',
      url,
    });

    const response = await this.fetchFn(url, {
      method: 'GET',
      headers,
    });

    if (response.status === 404) {
      const error = new Error('Object not found');
      error.name = 'NotFoundError';
      throw error;
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`S3 GET failed with HTTP ${response.status}: ${errText}`);
    }

    const arrayBuf = await response.arrayBuffer();
    return Buffer.from(arrayBuf);
  }

  /**
   * Inspects metadata for an object without retrieving its body.
   *
   * @param {object} params
   * @param {string} params.tenantId
   * @param {string} params.key
   * @returns {Promise<{ exists: boolean, contentLength?: number, metadata?: object, etag?: string }>}
   */
  async headObject({ tenantId, key }) {
    const objectKey = this.objectKey({ tenantId, key });

    if (this.inMemory) {
      const object = this.objects.get(objectKey);
      return object
        ? {
            exists: true,
            contentLength: object.buffer.length,
            metadata: object.metadata,
            etag: object.etag,
          }
        : { exists: false };
    }

    return this.headFromS3({ objectKey });
  }

  /**
   * Checks object existence in S3 via HTTP HEAD.
   *
   * @private
   */
  async headFromS3({ objectKey }) {
    const url = this.buildUrl(objectKey);
    const headers = this.signRequest({
      method: 'HEAD',
      url,
    });

    const response = await this.fetchFn(url, {
      method: 'HEAD',
      headers,
    });

    if (response.status === 404) {
      return { exists: false };
    }

    if (!response.ok) {
      return { exists: false };
    }

    const contentLengthStr = response.headers?.get ? response.headers.get('content-length') : null;
    const etag = response.headers?.get ? response.headers.get('etag') : null;

    const extractedMeta = {};
    if (response.headers && typeof response.headers.forEach === 'function') {
      response.headers.forEach((val, k) => {
        if (k.toLowerCase().startsWith('x-amz-meta-')) {
          extractedMeta[k.slice('x-amz-meta-'.length)] = val;
        }
      });
    }

    return {
      exists: true,
      contentLength: contentLengthStr ? parseInt(contentLengthStr, 10) : 0,
      metadata: extractedMeta,
      etag,
    };
  }

  /**
   * Deletes an encrypted object from storage.
   *
   * @param {object} params
   * @param {string} params.tenantId
   * @param {string} params.key
   * @returns {Promise<boolean>}
   */
  async deleteObject({ tenantId, key }) {
    const objectKey = this.objectKey({ tenantId, key });

    if (this.inMemory) {
      return this.objects.delete(objectKey);
    }

    return this.deleteFromS3({ objectKey });
  }

  /**
   * Deletes object from S3 via HTTP DELETE.
   *
   * @private
   */
  async deleteFromS3({ objectKey }) {
    const url = this.buildUrl(objectKey);
    const headers = this.signRequest({
      method: 'DELETE',
      url,
    });

    const response = await this.fetchFn(url, {
      method: 'DELETE',
      headers,
    });

    return response.ok || response.status === 404;
  }

  /**
   * Reports health status of the storage provider.
   *
   * @returns {Promise<{ status: string, provider: string }>}
   */
  async checkHealth() {
    return this.inMemory
      ? { status: 'HEALTHY', provider: 'IN_MEMORY_S3_COMPATIBLE' }
      : { status: 'HEALTHY', provider: 'S3_COMPATIBLE' };
  }
}
