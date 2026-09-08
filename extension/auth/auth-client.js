/**
 * @file Auth Client for aicareershub Extension (P15-001).
 *
 * Manages session verification against the authoritative AI Careers Hub web app
 * and triggers onboarding / authentication handoffs.
 */

export class AuthClient {
  constructor(backendClient) {
    this.backendClient = backendClient;
  }

  /**
   * Evaluates current user authentication status.
   *
   * @returns {Promise<{ state: 'AUTHENTICATED' | 'NOT_AUTHENTICATED' | 'SESSION_EXPIRED' | 'AUTH_ERROR', user?: object, tenant?: object, candidate?: object, error?: string }>}
   */
  async checkSession() {
    const result = await this.backendClient.getAuthStatus();

    if (result.status === 'AUTHENTICATED' && result.authenticated) {
      return {
        state: 'AUTHENTICATED',
        user: result.user,
        tenant: result.tenant,
        candidate: result.candidate,
      };
    }

    if (result.status === 'SESSION_EXPIRED') {
      return { state: 'SESSION_EXPIRED', error: 'Your session has expired. Please sign in again.' };
    }

    if (result.status === 'AUTH_ERROR') {
      return { state: 'AUTH_ERROR', error: result.error || 'Failed to verify session' };
    }

    return { state: 'NOT_AUTHENTICATED' };
  }

  /**
   * Opens the AI Careers Hub authentication page in a new browser tab.
   *
   * @param {string} [returnTo]
   */
  async openLoginPortal(returnTo = '/dashboard') {
    const baseUrl = await this.backendClient.getBaseUrl();
    const loginUrl = `${baseUrl}/login?returnTo=${encodeURIComponent(returnTo)}`;
    if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
      await chrome.tabs.create({ url: loginUrl });
    } else if (typeof window !== 'undefined') {
      window.open(loginUrl, '_blank');
    }
  }

  /**
   * Opens an application's handoff page in the AI Careers Hub web app.
   *
   * @param {string} applicationId
   */
  async openApplication(applicationId) {
    const baseUrl = await this.backendClient.getBaseUrl();
    const targetUrl = `${baseUrl}/applications/${applicationId}/handoff`;
    if (typeof chrome !== 'undefined' && chrome.tabs?.create) {
      await chrome.tabs.create({ url: targetUrl });
    } else if (typeof window !== 'undefined') {
      window.open(targetUrl, '_blank');
    }
  }
}
