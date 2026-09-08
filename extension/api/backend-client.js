/**
 * @file Backend API Client for aicareershub Extension (P15-001).
 *
 * Provides authenticated HTTP communication between the extension thin client
 * and the authoritative AI Careers Hub backend endpoints.
 * Never connects directly to databases or exposes service keys.
 */

export class BackendClient {
  constructor(defaultBaseUrl = 'http://localhost:3000') {
    this.defaultBaseUrl = defaultBaseUrl;
    this._cachedBaseUrl = null;
  }

  /**
   * Resolves authoritative backend base URL from storage or default.
   *
   * @returns {Promise<string>}
   */
  async getBaseUrl() {
    if (this._cachedBaseUrl) return this._cachedBaseUrl;
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const data = await chrome.storage.local.get('backendUrl');
      if (data?.backendUrl) {
        this._cachedBaseUrl = data.backendUrl.replace(/\/+$/, '');
        return this._cachedBaseUrl;
      }
    }
    this._cachedBaseUrl = this.defaultBaseUrl.replace(/\/+$/, '');
    return this._cachedBaseUrl;
  }

  /**
   * Dispatches an HTTP request to the backend with credentials included.
   *
   * @private
   * @param {string} endpoint
   * @param {RequestInit} [options={}]
   * @returns {Promise<any>}
   */
  async _fetch(endpoint, options = {}) {
    const baseUrl = await this.getBaseUrl();
    const url = `${baseUrl}${endpoint}`;

    const headers = {
      Accept: 'application/json',
      'X-AiCareersHub-Extension': 'true',
      ...(options.headers || {}),
    };

    if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        credentials: 'include', // Includes server-side session cookies
      });

      const contentType = response.headers.get('content-type') || '';
      let data = null;
      if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        data = { rawText: text };
      }

      if (!response.ok) {
        const error = new Error(data?.message || data?.error || `HTTP ${response.status}: ${response.statusText}`);
        error.status = response.status;
        error.code = data?.code || 'API_ERROR';
        error.data = data;
        throw error;
      }

      return data;
    } catch (err) {
      if (err.name === 'TypeError' && err.message?.includes('Failed to fetch')) {
        const connError = new Error(`Cannot connect to AI Careers Hub at ${baseUrl}. Ensure the application is running.`);
        connError.code = 'NETWORK_UNREACHABLE';
        throw connError;
      }
      throw err;
    }
  }

  /**
   * Retrieves active session authentication state.
   *
   * @returns {Promise<{ status: string, authenticated: boolean, user?: object, tenant?: object, candidate?: object }>}
   */
  async getAuthStatus() {
    try {
      return await this._fetch('/api/extension/session', { method: 'GET' });
    } catch (err) {
      if (err.status === 401) {
        return { status: 'NOT_AUTHENTICATED', authenticated: false };
      }
      return { status: 'AUTH_ERROR', authenticated: false, error: err.message };
    }
  }

  /**
   * Normalizes, canonicalizes, and executes ATS fit analysis on detected job.
   *
   * @param {object} job NormalizedJobPayload
   * @returns {Promise<object>} Analysis, matches, blockers, and recommendations
   */
  async analyzeJob(job) {
    return this._fetch('/api/extension/analyze-job', {
      method: 'POST',
      body: { job },
    });
  }

  /**
   * Prepares or reuses the application package and handoff artifacts.
   *
   * @param {object} job NormalizedJobPayload
   * @param {string} [applicationId] Existing application ID if known
   * @returns {Promise<object>} Handoff package telemetry and artifact links
   */
  async prepareHandoff(job, applicationId = null) {
    return this._fetch('/api/extension/prepare-handoff', {
      method: 'POST',
      body: { job, applicationId },
    });
  }

  /**
   * Validates the exact persisted package.
   *
   * @param {string} applicationId
   * @param {string} packageHash
   * @returns {Promise<object>} Validation report
   */
  async validatePackage(applicationId, packageHash) {
    return this._fetch('/api/extension/validate-package', {
      method: 'POST',
      body: { applicationId, packageHash },
    });
  }

  /**
   * Generates structured and markdown preview of the package.
   *
   * @param {string} applicationId
   * @param {string} packageHash
   * @returns {Promise<object>} Preview payload
   */
  async previewPackage(applicationId, packageHash) {
    return this._fetch('/api/extension/preview-package', {
      method: 'POST',
      body: { applicationId, packageHash },
    });
  }

  /**
   * Constructs fully qualified download URL for an artifact.
   *
   * @param {string} applicationId
   * @param {'resume'|'cover-letter'|'bundle'} artifactType
   * @param {string} packageHash
   * @returns {Promise<string>}
   */
  async getArtifactDownloadUrl(applicationId, artifactType, packageHash) {
    const baseUrl = await this.getBaseUrl();
    const query = packageHash ? `?packageHash=${encodeURIComponent(packageHash)}` : '';
    return `${baseUrl}/api/applications/${applicationId}/artifacts/${artifactType}/download${query}`;
  }
}
