/**
 * @file Universal Contextual Career Copilot Drawer Component (P85 / P89).
 *
 * Provides a compact, professional right-side assistant integrated into the
 * candidate workspace (Dashboard, Profile, Radar, Applications, Resumes, Sources):
 * - Target width: ~400px desktop, 360px tablet, responsive bottom sheet on mobile.
 * - Subtle non-blurred backdrop overlay preserving dashboard visibility.
 * - Concise introduction with at most 3 compact quick actions.
 * - Collapsible prompt chips upon starting a conversation.
 * - Professional bottom composer with Enter/Shift+Enter support.
 * - Grounded in verified profile and application context with human confirmation gates.
 * - WCAG 2.2 AA keyboard accessibility and focus management.
 */

import { escapeHtml } from '../../utils/html-escaper.js';
import { renderIcon } from './icons.js';
import { renderAIUnavailableCard } from './state-views.js';
import { normalizeCopilotPageContext } from '../../domain/ai/career-assistant.schemas.js';

/**
 * Contextual suggested prompts mapped strictly by the six canonical page contexts.
 * At most 3-4 compact actions per context.
 */
export const CONTEXT_PROMPTS = {
  dashboard: [
    { label: 'What should I do next?', icon: 'sparkles', prompt: 'What should I do next?' },
    {
      label: "What's blocking me from applying?",
      icon: 'alertCircle',
      prompt: "What's blocking me from applying?",
    },
    { label: 'Improve my profile', icon: 'edit', prompt: 'Improve my profile' },
    { label: 'Find matching jobs', icon: 'radar', prompt: 'Find matching jobs' },
  ],
  profile: [
    {
      label: "What's missing from my profile?",
      icon: 'alertCircle',
      prompt: "What's missing from my profile?",
    },
    { label: 'Fix my profile gaps', icon: 'edit', prompt: 'Fix my profile gaps' },
    { label: 'What evidence is missing?', icon: 'check', prompt: 'What evidence is missing?' },
  ],
  jobs: [
    { label: 'How strong is my match?', icon: 'radar', prompt: 'How strong is my match?' },
    { label: 'What am I missing?', icon: 'alertCircle', prompt: 'What am I missing?' },
    { label: 'Should I apply?', icon: 'check', prompt: 'Should I apply?' },
    { label: 'Tailor my resume', icon: 'resumes', prompt: 'Tailor my resume' },
  ],
  applications: [
    { label: 'Is this application ready?', icon: 'check', prompt: 'Is this application ready?' },
    { label: 'What is missing?', icon: 'alertCircle', prompt: 'What is missing?' },
    { label: 'Improve my match', icon: 'sparkles', prompt: 'Improve my match' },
  ],
  resumes: [
    { label: 'Review my active resume', icon: 'resumes', prompt: 'Review my active resume' },
    {
      label: 'What claims lack evidence?',
      icon: 'alertCircle',
      prompt: 'What claims lack evidence?',
    },
    { label: 'Tailor my resume', icon: 'edit', prompt: 'Tailor my resume' },
  ],
  sources: [
    {
      label: 'What evidence do my sources provide?',
      icon: 'code',
      prompt: 'What evidence do my sources provide?',
    },
    {
      label: 'Which skills need stronger evidence?',
      icon: 'alertCircle',
      prompt: 'Which skills need stronger evidence?',
    },
    {
      label: 'Review my connected sources',
      icon: 'sources',
      prompt: 'Review my connected sources',
    },
  ],
};

/**
 * Renders the Universal Career Copilot Slide-Over Drawer HTML markup.
 *
 * @param {object} params
 * @param {string} [params.pageContext='dashboard'] Current page context or route
 * @param {Array<object>} [params.activeProposals=[]] Stored or current proposals
 * @param {Array<object>} [params.messages=[]] Conversation thread
 * @param {boolean} [params.aiAvailable=true] Whether AI assistant is online
 * @param {string|null} [params.initialIntent=null] Pre-filled query
 * @returns {string} HTML markup
 */
export function renderCopilotDrawer({
  pageContext = 'dashboard',
  activeProposals = [],
  messages = [],
  aiAvailable = true,
  initialIntent = null,
}) {
  const normalizedContext = normalizeCopilotPageContext(pageContext);
  const suggestedPrompts = CONTEXT_PROMPTS[normalizedContext] || CONTEXT_PROMPTS.dashboard;

  return `
    <!-- Career Copilot Drawer Styles -->
    <link rel="stylesheet" href="/public/css/copilot.css">

    <div id="copilot-drawer-backdrop" class="copilot-backdrop" onclick="window.toggleCopilotDrawer && window.toggleCopilotDrawer(false)"></div>
    <aside
      id="copilot-drawer"
      class="copilot-drawer"
      role="dialog"
      aria-label="Career Copilot"
      aria-modal="true"
      data-page-context="${escapeHtml(normalizedContext)}"
    >
      <!-- Compact Professional Header (P90) -->
      <div class="copilot-drawer-header">
        <div class="copilot-header-info">
          <h2 style="font-size:0.95rem; font-weight:600; color:var(--text-main, #F8FAFC); margin:0; letter-spacing:-0.01em;">Career Copilot</h2>
          <span style="font-size:0.725rem; color:var(--text-dim, #94A3B8); margin-top:2px; display:block;">Contextual career assistance</span>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <button
            type="button"
            id="copilotClearBtn"
            class="copilot-clear-btn"
            onclick="window.clearCopilotConversation && window.clearCopilotConversation()"
            aria-label="Clear conversation"
            title="Clear conversation"
            style="padding:2px 6px; font-size:0.685rem; border-radius:4px; background:transparent; border:none; color:var(--text-dim, #64748B); cursor:pointer; opacity:0.75; transition:opacity 0.15s, color 0.15s;"
            onmouseover="this.style.opacity='1'; this.style.color='var(--text-muted, #94A3B8)';"
            onmouseout="this.style.opacity='0.75'; this.style.color='var(--text-dim, #64748B)';"
          >
            Clear
          </button>
          <button
            type="button"
            class="btn btn-secondary btn-sm"
            id="copilotCloseBtn"
            onclick="window.toggleCopilotDrawer && window.toggleCopilotDrawer(false)"
            aria-label="Close Career Copilot"
            style="padding:5px 8px; border-radius:6px; background:transparent; border:1px solid var(--border-subtle, #334155); color:var(--text-muted, #94A3B8); cursor:pointer;"
          >
            ${renderIcon('cross', { size: 14 })}
          </button>
        </div>
      </div>

      <!-- Drawer Body -->
      <div class="copilot-drawer-body" id="copilot-body" tabindex="-1">
        <!-- AI Unavailable Banner if service offline -->
        ${!aiAvailable ? renderAIUnavailableCard({ continueHref: '/profile' }) : ''}

        <!-- Active Safe Proposals (Human-in-the-Loop Confirmation Required) -->
        ${
          activeProposals.length > 0
            ? `
          <div style="background:rgba(245,158,11,0.08); border:1px solid rgba(245,158,11,0.3); border-left:3px solid var(--accent-amber, #F59E0B); padding:12px; border-radius:6px;">
            <div style="font-size:0.725rem; font-weight:700; color:var(--accent-amber, #F59E0B); text-transform:uppercase; margin-bottom:8px; display:flex; align-items:center; gap:6px;">
              ${renderIcon('alertCircle', { size: 13 })}
              <span>Proposed Profile Updates (Confirmation Required)</span>
            </div>
            ${activeProposals
              .map(
                (p) => `
              <div style="margin-bottom:10px; padding-bottom:10px; border-bottom:1px solid rgba(255,255,255,0.06);">
                <div style="font-size:0.85rem; font-weight:600; color:var(--text-main, #F8FAFC);">${escapeHtml(p.fieldLabel || p.field)}</div>
                <div style="font-size:0.78rem; color:var(--text-muted, #94A3B8); margin:3px 0 6px;">
                  Current: <code>${escapeHtml(String(p.currentValue ?? 'Not set'))}</code> &rarr; Proposed: <strong style="color:var(--accent-emerald, #10B981);">${escapeHtml(String(p.proposedValue))}</strong>
                </div>
                <div style="display:flex; gap:8px;">
                  <form method="POST" action="/assistant/proposals/confirm" style="display:inline;">
                    <input type="hidden" name="proposalId" value="${escapeHtml(p.id)}">
                    <input type="hidden" name="confirmedByUser" value="true">
                    <button type="submit" class="btn btn-primary btn-sm" style="padding:3px 8px; font-size:0.75rem;">
                      ${renderIcon('check', { size: 12 })} <span>Confirm</span>
                    </button>
                  </form>
                  <form method="POST" action="/assistant/proposals/reject" style="display:inline;">
                    <input type="hidden" name="proposalId" value="${escapeHtml(p.id)}">
                    <button type="submit" class="btn btn-secondary btn-sm" style="padding:3px 8px; font-size:0.75rem;">
                      <span>Dismiss</span>
                    </button>
                  </form>
                </div>
              </div>
            `
              )
              .join('')}
          </div>
        `
            : ''
        }

        <!-- Initial Concise Intro & Max 4 Contextual Actions -->
        <div id="copilotIntroSection" style="${messages.length > 0 ? 'display:none;' : ''}">
          <p style="font-size:0.825rem; color:var(--text-muted, #94A3B8); line-height:1.45; margin:0 0 10px 0;">
            I can help you improve your profile, prepare applications, and decide what to do next.
          </p>
          <div id="copilotSuggestionsSection">
            <div style="font-size:0.68rem; color:var(--text-dim, #64748B); text-transform:uppercase; font-weight:600; margin-bottom:6px; letter-spacing:0.04em;">
              Suggested actions
            </div>
            <div class="copilot-chips-container" style="display:flex; flex-direction:column; gap:6px;">
              ${suggestedPrompts
                .slice(0, 4)
                .map(
                  (item) => `
                <button type="button" class="copilot-chip" data-prompt="${escapeHtml(item.prompt)}">
                  <span style="color:var(--accent-indigo, #6366F1); flex-shrink:0;">${renderIcon(item.icon || 'arrowRight', { size: 13 })}</span>
                  <span>${escapeHtml(item.label)}</span>
                </button>
              `
                )
                .join('')}
            </div>
          </div>
        </div>

        <!-- Chat Conversation Messages -->
        <div id="copilot-messages" style="display:${messages.length > 0 ? 'flex' : 'none'}; flex-direction:column; gap:10px;">
          ${messages
            .map(
              (m) => `
            <div style="display:flex; gap:8px; align-items:flex-start; ${m.role === 'user' ? 'justify-content:flex-end;' : ''}">
              <div style="max-width:85%; padding:8px 12px; border-radius:${m.role === 'user' ? '8px 8px 2px 8px' : '8px 8px 8px 2px'}; font-size:0.835rem; line-height:1.45; ${m.role === 'user' ? 'background:var(--accent-indigo, #6366F1); color:#FFFFFF;' : 'background:rgba(255,255,255,0.03); border:1px solid var(--border-subtle, #334155); color:var(--text-main, #F8FAFC);'} word-break:break-word; white-space:pre-line;">
                ${escapeHtml(m.content)}
              </div>
            </div>
          `
            )
            .join('')}
        </div>
      </div>

      <!-- Professional Bottom Composer -->
      <div class="copilot-drawer-footer">
        <form id="copilot-form" method="POST" action="/assistant/message" style="margin:0;">
          <div class="copilot-composer-box" style="display:flex; align-items:flex-end; background:var(--bg-surface, #1E293B); border:1px solid var(--border-subtle, #334155); border-radius:8px; padding:6px 10px; transition:border-color 0.15s, box-shadow 0.15s;">
            <textarea
              id="copilot-input"
              name="message"
              rows="1"
              placeholder="Ask Career Copilot..."
              required
              aria-label="Ask Career Copilot"
              style="flex:1; border:none; background:transparent; resize:none; color:var(--text-main, #F8FAFC); font-size:0.835rem; line-height:1.4; outline:none; max-height:96px; padding:4px 0; font-family:inherit;"
            >${initialIntent ? escapeHtml(initialIntent) : ''}</textarea>
            <button
              id="copilot-submit-btn"
              type="submit"
              class="copilot-send-btn"
              aria-label="Send message"
              style="border:none; background:var(--accent-indigo, #6366F1); color:#FFF; width:28px; height:28px; border-radius:6px; display:inline-flex; align-items:center; justify-content:center; cursor:pointer; flex-shrink:0; margin-left:6px; transition:opacity 0.15s;"
            >
              ${renderIcon('arrowRight', { size: 13 })}
            </button>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:5px; font-size:0.68rem; color:var(--text-dim, #64748B); padding:0 2px;">
            <span>Enter to send &bull; Shift+Enter for newline</span>
            <span id="copilot-context-status">Grounded in verified profile</span>
          </div>
        </form>
      </div>
    </aside>

    <!-- Universal Copilot Controller Script (P90 Hardened) -->
    <script src="/public/js/copilot.js" defer></script>
  `;
}

export default renderCopilotDrawer;
