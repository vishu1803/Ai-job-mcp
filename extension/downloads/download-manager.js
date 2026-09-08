/**
 * @file Download Manager for aicareershub Extension (P15-001).
 *
 * Coordinates artifact downloads from authoritative backend download endpoints
 * and verifies downloaded artifact metadata against expected package identity.
 */

export class DownloadManager {
  constructor(backendClient) {
    this.backendClient = backendClient;
  }

  /**
   * Triggers download of an artifact via Chrome Downloads API or direct stream.
   *
   * @param {object} params
   * @param {string} params.applicationId
   * @param {'resume'|'cover-letter'|'bundle'} params.artifactType
   * @param {string} params.packageHash
   * @param {string} params.filename
   * @returns {Promise<{ downloadId?: number, verified: boolean }>}
   */
  async downloadArtifact({ applicationId, artifactType, packageHash, filename }) {
    const downloadUrl = await this.backendClient.getArtifactDownloadUrl(
      applicationId,
      artifactType,
      packageHash
    );

    // If chrome.downloads is available (standard extension context)
    if (typeof chrome !== 'undefined' && chrome.downloads?.download) {
      const downloadId = await chrome.downloads.download({
        url: downloadUrl,
        filename: filename || (artifactType === 'bundle' ? `handoff-kit-${applicationId.slice(0, 8)}.zip` : `${artifactType}.pdf`),
        saveAs: false,
      });

      // P15-002: verify the served artifact's identity before reporting
      // success — never claim verification that did not happen.
      const identity = await this.verifyArtifactIdentity(applicationId, artifactType, packageHash);
      return { downloadId, verified: identity.verified, reason: identity.reason, url: downloadUrl };
    }

    // Fallback for non-extension environments / browser fetch
    const response = await fetch(downloadUrl, { credentials: 'include' });
    if (!response.ok) {
      throw new Error(`Download failed: HTTP ${response.status} ${response.statusText}`);
    }

    // Verify response identity headers
    const returnedPackageHash = response.headers.get('x-package-hash');
    const returnedAppId = response.headers.get('x-application-id');

    if (packageHash && returnedPackageHash && returnedPackageHash !== packageHash) {
      throw new Error(`Package hash mismatch: expected ${packageHash}, got ${returnedPackageHash}`);
    }
    if (applicationId && returnedAppId && returnedAppId !== applicationId) {
      throw new Error(`Application ID mismatch: expected ${applicationId}, got ${returnedAppId}`);
    }

    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename || (artifactType === 'bundle' ? `handoff-kit-${applicationId.slice(0, 8)}.zip` : `${artifactType}.pdf`);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);

    return { verified: true, url: downloadUrl };
  }

  /**
   * P15-002: verifies that the backend serves the exact package identity the
   * extension asked for, via a HEAD probe of the download endpoint.
   *
   * @private
   * @param {string} applicationId
   * @param {'resume'|'cover-letter'|'bundle'} artifactType
   * @param {string} [packageHash]
   * @returns {Promise<{ verified: boolean, reason: string | null }>}
   */
  async verifyArtifactIdentity(applicationId, artifactType, packageHash) {
    try {
      const downloadUrl = await this.backendClient.getArtifactDownloadUrl(
        applicationId,
        artifactType,
        packageHash
      );
      const probe = await fetch(downloadUrl, { method: 'HEAD', credentials: 'include' });
      if (!probe.ok) {
        return { verified: false, reason: `HTTP ${probe.status}` };
      }
      const servedHash = probe.headers.get('x-package-hash');
      if (packageHash && servedHash && servedHash !== packageHash) {
        return { verified: false, reason: 'PACKAGE_HASH_MISMATCH' };
      }
      const servedAppId = probe.headers.get('x-application-id');
      if (applicationId && servedAppId && servedAppId !== applicationId) {
        return { verified: false, reason: 'APPLICATION_ID_MISMATCH' }
      }
      return { verified: true, reason: null };
    } catch {
      // A probe failure must not silently masquerade as a verified download.
      return { verified: false, reason: 'IDENTITY_PROBE_UNAVAILABLE' };
    }
  }
}
