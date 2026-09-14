/**
 * @file Backend API Client for aicareershub Extension (P15-001).
 *
 * Provides authenticated HTTP communication between the extension thin client
 * and the authoritative AI Careers Hub backend endpoints.
 * Never connects directly to databases or exposes service keys.
 *
 * P15-002: the backend base URL is credential-bearing configuration. Stored
 * values are validated before use (see extension/config.js) so cookies and
 * tokens can never be redirected to an arbitrary host.
 */

import { validateBackendUrl } from '../config.js';

export class BackendClient {
  constructor(defaultBaseUrl = 'http://localhost:3000') {
    this.defaultBaseUrl = defaultBaseUrl;
    this._cachedBaseUrl = null;
    this._lastValidationError = null;
  }

  /**
   * Resolves authoritative backend base URL from storage or default.
   *
   * @returns {Promise<string>}
   */
  async getBaseUrl() {
    if (this._cachedBaseUrl) return this._cachedBaseUrl;
    this._lastValidationError = null;
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      const data = await chrome.storage.local.get('backendUrl');
      if (data?.backendUrl) {
        const validation = validateBackendUrl(data.backendUrl);
        if (validation.valid) {
          this._cachedBaseUrl = validation.url;
          return this._cachedBaseUrl;
        }
        // P15-002: a stored backendUrl is credential-bearing state — never
        // point session cookies or tokens at an unvalidated host.
        this._lastValidationError = validation.reason;
        try {
          await chrome.storage.local.remove('backendUrl');
        } catch {
          // Storage may be unavailable; the invalid URL is simply not used.
        }
      }
    }
    const defaultValidation = validateBackendUrl(this.defaultBaseUrl);
    this._cachedBaseUrl = (defaultValidation.valid ? defaultValidation.url : this.defaultBaseUrl).replace(
      /\/+$/,
      ''
    );
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
   * Checks backend service health via /livez.
   *
   * @returns {Promise<{ status: string, ok: boolean }>}
   */
  async getHealth() {
    try {
      const data = await this._fetch('/livez', { method: 'GET' });
      return { status: data?.status || 'ok', ok: true, ...data };
    } catch (err) {
      return { status: 'error', ok: false, error: err.message };
    }
  }

  /**
   * Normalizes response payloads to ensure recommendedProjects is always present.
   *
   * @private
   * @param {object} data
   * @returns {object}
   */
  _normalizeProjects(data) {
    if (!data || typeof data !== 'object') return data;
    if (Array.isArray(data.recommendedProjects) && data.recommendedProjects.length > 0) {
      return data;
    }
    const fallback =
      (Array.isArray(data.portfolioRecommendations?.featuredProjects) && data.portfolioRecommendations.featuredProjects.length > 0)
        ? data.portfolioRecommendations.featuredProjects
        : (Array.isArray(data.fitAnalysis?.topRelevantProjects) && data.fitAnalysis.topRelevantProjects.length > 0)
          ? data.fitAnalysis.topRelevantProjects
          : [];

    data.recommendedProjects = fallback.map((p, idx) => ({
      projectId: p.projectId || p.id || `proj-${idx + 1}`,
      name: String(p.name || p.displayName || p.projectName || 'Project').replace(/^[a-zA-Z0-9_-]+\//, ''),
      displayName: p.displayName || p.name || p.projectName || 'Project',
      technologies: Array.isArray(p.technologies)
        ? p.technologies
        : (Array.isArray(p.primarySignals) ? p.primarySignals : []),
      relevanceScore: Number(p.relevanceScore ?? p.score ?? 50),
      relevanceBand: p.relevanceBand || 'MEDIUM',
      matchedRequirements: Array.isArray(p.matchedRequirements) ? p.matchedRequirements : [],
      verificationStatus: p.verificationStatus || 'VERIFIED',
    }));
    return data;
  }

  /**
   * Normalizes, canonicalizes, and executes ATS fit analysis on detected job.
   *
   * @param {object} job NormalizedJobPayload
   * @returns {Promise<object>} Analysis, matches, blockers, and recommendations
   */
  async analyzeJob(job) {
    const data = await this._fetch('/api/extension/analyze-job', {
      method: 'POST',
      body: { job },
    });
    return this._normalizeProjects(data);
  }

  /**
   * Prepares or reuses the application package and handoff artifacts.
   *
   * @param {object} job NormalizedJobPayload
   * @param {string} [applicationId] Existing application ID if known
   * @param {string} [analysisSnapshotId] Server-authoritative analysis snapshot ID (P16-001F-3B)
   * @returns {Promise<object>} Handoff package telemetry and artifact links
   */
  async prepareHandoff(job, applicationId = null, analysisSnapshotId = null) {
    const data = await this._fetch('/api/extension/prepare-handoff', {
      method: 'POST',
      body: { job, applicationId, analysisSnapshotId },
    });
    return this._normalizeProjects(data);
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
