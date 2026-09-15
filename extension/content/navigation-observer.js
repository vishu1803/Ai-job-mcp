/**
 * @file SPA Navigation & Route Reconciliation Observer (P57.5).
 *
 * Hooks into SPA history transitions (pushState, replaceState, popstate, hashchange)
 * and DOM mutations to reconcile workflow state across multi-step wizard routes.
 * Preserves application identity, handoff kit, and recommended projects when on the same job.
 */

import { JobIdentity } from '../lib/job-identity.js';

export class NavigationObserver {
  /**
   * @param {object} options
   * @param {Function} options.onNavigation Callback invoked when URL or route changes
   * @param {Function} options.onFormDetected Callback invoked when an application form appears
   * @param {Function} options.onJobUpdated Callback invoked when DOM mutations indicate job updates/hydration
   */
  constructor({ onNavigation, onFormDetected, onJobUpdated } = {}) {
    this.onNavigation = onNavigation;
    this.onFormDetected = onFormDetected;
    this.onJobUpdated = onJobUpdated;
    this.currentUrl = typeof window !== 'undefined' ? window.location.href : '';
    this.activeJobData = null;
    this.mutationTimeout = null;
  }

  /**
   * Starts listening for client-side navigation and route changes.
   */
  start() {
    if (typeof window === 'undefined') return;

    // 1. Hook pushState and replaceState
    const originalPushState = history.pushState;
    history.pushState = (...args) => {
      originalPushState.apply(history, args);
      this._handleUrlChange();
    };

    const originalReplaceState = history.replaceState;
    history.replaceState = (...args) => {
      originalReplaceState.apply(history, args);
      this._handleUrlChange();
    };

    // 2. Listen to popstate and hashchange
    window.addEventListener('popstate', () => this._handleUrlChange());
    window.addEventListener('hashchange', () => this._handleUrlChange());

    // 3. Monitor DOM mutations for dynamic application form rendering
    this._observeDomMutations();
  }

  setActiveJob(jobData) {
    this.activeJobData = jobData;
  }

  _handleUrlChange() {
    const newUrl = window.location.href;
    if (newUrl === this.currentUrl) return;

    const oldUrl = this.currentUrl;
    this.currentUrl = newUrl;

    const isSameJob = this.activeJobData
      ? JobIdentity.isSameJobIdentity(this.activeJobData, { sourceUrl: newUrl })
      : false;

    if (typeof this.onNavigation === 'function') {
      this.onNavigation({
        oldUrl,
        newUrl,
        isSameJob,
        activeJob: this.activeJobData,
      });
    }
  }

  _observeDomMutations() {
    if (typeof MutationObserver === 'undefined' || !document.body) return;

    const observer = new MutationObserver(() => {
      if (this.mutationTimeout) {
        clearTimeout(this.mutationTimeout);
      }
      this.mutationTimeout = setTimeout(() => {
        if (typeof this.onFormDetected === 'function') {
          this.onFormDetected();
        }
        if (typeof this.onJobUpdated === 'function') {
          this.onJobUpdated();
        }
      }, 400);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }
}
