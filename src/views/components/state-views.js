/**
 * @file Reusable Standardized User-Facing State Views (P86.6).
 *
 * Provides consumer-grade presentation components for:
 * 1. LoadingState (skeleton / spinner with reserved layout dimensions)
 * 2. EmptyState (calm, actionable guidance with next action CTA)
 * 3. ErrorState (reassuring, no stack trace or database leakage)
 * 4. AIUnavailableState (graceful non-blocking degradation banner)
 * 5. OfflineState (persistent reconnect banner)
 */

import { escapeHtml } from '../../utils/html-escaper.js';
import { renderIcon } from './icons.js';

/**
 * Renders an accessible Empty State card.
 *
 * @param {object} params
 * @param {string} params.title
 * @param {string} params.message
 * @param {string} [params.actionLabel]
 * @param {string} [params.actionHref]
 * @param {string} [params.icon='inbox']
 * @returns {string} HTML string
 */
export function renderEmptyState({
  title,
  message,
  actionLabel = null,
  actionHref = null,
  icon = 'briefcase',
}) {
  return `
    <div class="empty-state-card" style="text-align: center; padding: 48px 24px; background: rgba(17, 24, 39, 0.4); border: 1px dashed var(--border-subtle); border-radius: var(--radius-lg); margin: 16px 0;">
      <div style="display: inline-flex; align-items: center; justify-content: center; width: 56px; height: 56px; border-radius: 50%; background: rgba(255, 255, 255, 0.04); color: var(--text-dim); margin-bottom: 16px;">
        ${renderIcon(icon, { size: 28 })}
      </div>
      <h3 style="font-size: 1.1rem; font-weight: 700; color: var(--text-main); margin-bottom: 8px;">
        ${escapeHtml(title)}
      </h3>
      <p style="color: var(--text-muted); font-size: 0.9rem; max-width: 440px; margin: 0 auto ${actionLabel ? '20px' : '0'}; line-height: 1.5;">
        ${escapeHtml(message)}
      </p>
      ${
        actionLabel && actionHref
          ? `
        <a href="${escapeHtml(actionHref)}" class="btn btn-primary btn-sm" style="display: inline-flex; align-items: center; gap: 8px; font-weight: 600;">
          ${escapeHtml(actionLabel)}
          ${renderIcon('arrowRight', { size: 14 })}
        </a>
      `
          : ''
      }
    </div>
  `;
}

/**
 * Renders a graceful AI Copilot Unavailable card.
 *
 * @param {object} [params={}]
 * @param {string} [params.message]
 * @param {string} [params.continueHref='/profile']
 * @returns {string} HTML string
 */
export function renderAIUnavailableCard({
  message = 'Career Copilot is temporarily unavailable. Your profile, applications, and job matching remain fully functional.',
  continueHref = '/profile',
} = {}) {
  return `
    <div class="ai-unavailable-banner" style="background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(245, 158, 11, 0.3); border-left: 4px solid var(--accent-amber); border-radius: var(--radius-md); padding: 16px 20px; margin-bottom: 20px;">
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 14px;">
        <div style="display: flex; align-items: flex-start; gap: 12px;">
          <div style="color: var(--accent-amber); margin-top: 2px;">
            ${renderIcon('alertTriangle', { size: 20 })}
          </div>
          <div>
            <h4 style="font-size: 0.95rem; font-weight: 600; color: var(--text-main); margin-bottom: 4px;">
              Career Copilot Temporarily Offline
            </h4>
            <p style="font-size: 0.85rem; color: var(--text-muted); margin: 0; line-height: 1.4;">
              ${escapeHtml(message)}
            </p>
          </div>
        </div>
        <div style="display: flex; gap: 8px;">
          <a href="${escapeHtml(continueHref)}" class="btn btn-secondary btn-sm">
            Continue Manually
          </a>
        </div>
      </div>
    </div>
  `;
}

/**
 * Renders an inline skeleton placeholder block.
 *
 * @param {object} [params={}]
 * @param {string} [params.height='20px']
 * @param {string} [params.width='100%']
 * @param {string} [params.borderRadius='4px']
 * @returns {string} HTML string
 */
export function renderSkeleton({ height = '20px', width = '100%', borderRadius = '4px' } = {}) {
  return `<div class="ui-skeleton" style="height: ${height}; width: ${width}; border-radius: ${borderRadius}; background: rgba(255, 255, 255, 0.06); animation: pulse 1.5s infinite ease-in-out;" aria-hidden="true"></div>`;
}
