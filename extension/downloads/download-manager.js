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

      return { downloadId, verified: true, url: downloadUrl };
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
}
