import { ValidationError } from '../../errors/index.js';

const defaults = {
  maxFiles: 50000,
  maxDirectories: 10000,
  maxDepth: 64,
  maxFileBytes: 1048576,
  maxDownloadedBytes: 33554432,
  maxRequests: 300,
  maxDurationMs: 180000,
  concurrency: 2,
};
const ceilings = {
  maxFiles: 100000,
  maxDirectories: 50000,
  maxDepth: 128,
  maxFileBytes: 1048576,
  maxDownloadedBytes: 134217728,
  maxRequests: 2000,
  maxDurationMs: 600000,
  concurrency: 8,
};

export function syncLimits(overrides = {}) {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(defaults).map(([key, fallback]) => {
        const envKey = `GITHUB_SYNC_${key.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase()}`;
        const value = Number(overrides[key] ?? process.env[envKey] ?? fallback);
        if (!Number.isSafeInteger(value) || value < 1 || value > ceilings[key]) {
          throw new ValidationError(`Invalid ${envKey} operational limit`, 'INVALID_SYNC_LIMIT');
        }
        return [key, value];
      })
    )
  );
}

export function incomplete(reason) {
  return new ValidationError(
    `GitHub synchronization incomplete: ${reason}`,
    'GITHUB_SYNC_INCOMPLETE',
    { reason }
  );
}

export class GitHubSyncBudget {
  constructor(limits, signal) {
    this.limits = syncLimits(limits);
    this.startedAt = Date.now();
    this.requests = 0;
    this.downloadedBytes = 0;
    this.signal = AbortSignal.any([
      AbortSignal.timeout(this.limits.maxDurationMs),
      ...(signal ? [signal] : []),
    ]);
    this.running = 0;
    this.waiters = [];
  }

  assertActive() {
    if (this.signal.aborted || Date.now() - this.startedAt >= this.limits.maxDurationMs) {
      throw incomplete(
        this.signal.reason?.name === 'TimeoutError' ? 'DURATION_LIMIT' : 'INTERRUPTED'
      );
    }
  }

  checkFile(bytes) {
    this.assertActive();
    if (bytes > this.limits.maxFileBytes) throw incomplete('FILE_SIZE_LIMIT');
  }

  stats() {
    return { requests: this.requests, downloadedBytes: this.downloadedBytes };
  }

  async wait(milliseconds) {
    this.assertActive();
    await new Promise((resolve, reject) => {
      const abort = () => {
        clearTimeout(timer);
        reject(incomplete('INTERRUPTED'));
      };
      const timer = setTimeout(() => {
        this.signal.removeEventListener('abort', abort);
        resolve();
      }, milliseconds);
      this.signal.addEventListener('abort', abort, { once: true });
    });
    this.assertActive();
  }

  async fetch(fetchFn, url, options) {
    this.assertActive();
    while (this.running >= this.limits.concurrency) {
      await new Promise((resolve, reject) => {
        const wake = () => {
          this.signal.removeEventListener('abort', abort);
          resolve();
        };
        const abort = () => {
          this.waiters = this.waiters.filter((w) => w !== wake);
          reject(incomplete('INTERRUPTED'));
        };
        this.waiters.push(wake);
        this.signal.addEventListener('abort', abort, { once: true });
      });
    }
    this.assertActive();
    if (this.requests >= this.limits.maxRequests) {
      this.waiters.splice(0).forEach((wake) => wake());
      throw incomplete('REQUEST_LIMIT');
    }
    this.requests++;
    this.running++;
    let response;
    try {
      response = await fetchFn(url, {
        ...options,
        signal: AbortSignal.any([this.signal, ...(options.signal ? [options.signal] : [])]),
      });
      if (!response.ok || response.status === 204 || response.status === 304) {
        await response.body?.cancel?.();
        return response;
      }
      // Count actual streamed response bytes, including base64/JSON overhead, before parsing.
      const chunks = [];
      const add = (chunk) => {
        this.assertActive();
        this.downloadedBytes += chunk.length;
        if (this.downloadedBytes > this.limits.maxDownloadedBytes)
          throw incomplete('DOWNLOAD_LIMIT');
        chunks.push(chunk);
      };
      if (response.body?.getReader) {
        const reader = response.body.getReader();
        try {
          while (true) {
            const next = await reader.read();
            if (next.done) break;
            add(Buffer.from(next.value));
          }
        } catch (error) {
          await reader.cancel().catch(() => {});
          throw error;
        }
      } else {
        // Compatibility with connector test doubles; real fetch uses the bounded stream above.
        add(Buffer.from(JSON.stringify(await response.json())));
      }
      const bytes = Buffer.concat(chunks);
      return {
        ok: response.ok,
        status: response.status,
        headers: response.headers,
        json: async () => JSON.parse(bytes.toString('utf8')),
      };
    } catch (error) {
      this.assertActive();
      throw error;
    } finally {
      this.running--;
      this.waiters.shift()?.();
    }
  }
}
