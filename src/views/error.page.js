/**
 * @file Dedicated User-Facing Error Page View Template
 *
 * Renders beautiful, accessible, human-friendly error views across:
 * - 404 Not Found
 * - 403 Forbidden / Authorization Error
 * - 500 Server Failure (with data preservation reassurance)
 * - 503 AI Assistant Temporarily Unavailable
 * - 409 Conflict Resolution
 * - 400 Validation Error Summary
 *
 * Never leaks stack traces, database schema, SQL, or internal class names.
 */

import { renderLayout } from './layout.js';
import { escapeHtml } from '../utils/html-escaper.js';
import { UserFacingStateEnum } from '../domain/ui/user-facing-states.js';

/**
 * Renders the full HTML error page.
 *
 * @param {object} params
 * @param {object|null} [params.user=null] Current user session if present
 * @param {number} [params.statusCode=500] HTTP status code
 * @param {string} [params.state='SERVER_FAILURE'] One of UserFacingStateEnum
 * @param {string} [params.title="We couldn't complete your request"] Human-friendly title
 * @param {string} [params.message="Your information hasn't been lost. Please try again."] Reassuring explanation
 * @param {string|null} [params.supportId=null] Safe support/request ID
 * @param {object|null} [params.recoveryAction=null] Primary action
 * @param {string} [params.recoveryAction.label='Try again']
 * @param {string} [params.recoveryAction.href]
 * @param {Array<object>} [params.fieldErrors=[]]
 * @returns {string} Full HTML document
 */
export function renderErrorPage({
  user = null,
  statusCode = 500,
  state = UserFacingStateEnum.SERVER_FAILURE,
  title = "We couldn't complete your request",
  message = "Your information hasn't been lost. Please try again.",
  supportId = null,
  recoveryAction = null,
  fieldErrors = [],
}) {
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);
  const safeSupportId = supportId ? escapeHtml(supportId) : null;

  // Icon and theme based on state
  let stateBadge = '<span class="badge badge-amber" style="font-size:0.75rem;">NOTICE</span>';
  let iconSvg = `
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="12" y1="8" x2="12" y2="12"></line>
      <line x1="12" y1="16" x2="12.01" y2="16"></line>
    </svg>`;

  if (state === UserFacingStateEnum.NOT_FOUND || statusCode === 404) {
    stateBadge = '<span class="badge badge-neutral" style="font-size:0.75rem;">PAGE NOT FOUND (404)</span>';
    iconSvg = `
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8"></circle>
        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        <line x1="8" y1="11" x2="14" y2="11"></line>
      </svg>`;
  } else if (state === UserFacingStateEnum.AUTHORIZATION_ERROR || statusCode === 403) {
    stateBadge = '<span class="badge badge-missing" style="font-size:0.75rem;">ACCESS RESTRICTED (403)</span>';
    iconSvg = `
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#F43F5E" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
      </svg>`;
  } else if (state === UserFacingStateEnum.AI_FAILURE) {
    stateBadge = '<span class="badge badge-cyan" style="font-size:0.75rem;">AI COPILOT TEMPORARY STATUS</span>';
    iconSvg = `
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#06B6D4" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2"></rect>
        <line x1="9" y1="9" x2="9.01" y2="9"></line>
        <line x1="15" y1="9" x2="15.01" y2="9"></line>
        <path d="M8 15h8"></path>
      </svg>`;
  } else if (state === UserFacingStateEnum.SERVER_FAILURE || statusCode >= 500) {
    stateBadge = '<span class="badge badge-missing" style="font-size:0.75rem;">SERVER ISSUE (500)</span>';
    iconSvg = `
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#F43F5E" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"></polygon>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>`;
  }

  const primaryActionLabel = escapeHtml(recoveryAction?.label || (statusCode === 404 ? 'Go to Dashboard' : 'Try again'));
  const primaryActionHref = recoveryAction?.href
    ? escapeHtml(recoveryAction.href)
    : statusCode === 404
      ? '/dashboard'
      : 'javascript:window.location.reload()';

  const content = `
    <div class="container" style="max-width:680px; margin: 60px auto; padding: 0 16px;">
      <div class="card" role="alert" style="padding: 40px 32px; text-align: center; background: #111827; border: 1px solid var(--border-subtle); box-shadow: 0 20px 40px rgba(0,0,0,0.6); border-radius: var(--radius-lg);">
        <div style="margin-bottom: 20px; display: inline-flex; align-items: center; justify-content: center; width: 80px; height: 80px; border-radius: 50%; background: rgba(255,255,255,0.03); border: 1px solid var(--border-subtle);">
          ${iconSvg}
        </div>

        <div style="margin-bottom: 12px;">
          ${stateBadge}
        </div>

        <h1 style="font-size: 1.65rem; font-weight: 800; letter-spacing: -0.02em; color: var(--text-main); margin-bottom: 12px;">
          ${safeTitle}
        </h1>

        <p style="color: var(--text-muted); font-size: 0.95rem; line-height: 1.6; max-width: 480px; margin: 0 auto 24px;">
          ${safeMessage}
        </p>

        ${
          fieldErrors.length > 0
            ? `
          <div style="margin: 0 auto 24px; max-width: 480px; text-align: left; background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.25); border-radius: var(--radius-md); padding: 14px 18px;">
            <div style="font-weight: 700; font-size: 0.85rem; color: #FCA5A5; margin-bottom: 8px;">Items requiring review:</div>
            <ul style="margin: 0; padding-left: 20px; font-size: 0.825rem; color: #F87171; line-height: 1.6;">
              ${fieldErrors.map((f) => `<li><strong>${escapeHtml(f.label)}:</strong> ${escapeHtml(f.message)}</li>`).join('')}
            </ul>
          </div>
        `
            : ''
        }

        <div style="display: flex; gap: 12px; justify-content: center; align-items: center; flex-wrap: wrap; margin-bottom: 24px;">
          <a href="${primaryActionHref}" class="btn btn-primary" style="padding: 10px 24px; font-weight: 600;">
            ${primaryActionLabel}
          </a>
          <a href="/dashboard" class="btn btn-secondary" style="padding: 10px 20px;">
            Go to Dashboard
          </a>
          <button type="button" class="btn btn-secondary" onclick="window.history.back()" style="padding: 10px 18px;">
            Go back
          </button>
        </div>

        ${
          safeSupportId
            ? `
          <div style="border-top: 1px solid var(--border-subtle); padding-top: 18px; margin-top: 12px;">
            <span style="font-size: 0.75rem; color: var(--text-dim); font-family: var(--font-mono); background: rgba(255,255,255,0.03); padding: 4px 10px; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle);">
              Support Reference: ${safeSupportId}
            </span>
          </div>
        `
            : ''
        }
      </div>
    </div>
  `;

  return renderLayout({
    title: `${title} (${statusCode})`,
    content,
    user,
    activeNav: '',
  });
}
