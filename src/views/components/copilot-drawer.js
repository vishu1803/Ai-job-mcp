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
    <style>
      .copilot-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(15, 23, 42, 0.25);
        backdrop-filter: none;
        -webkit-backdrop-filter: none;
        z-index: 1040;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.2s ease;
      }
      .copilot-backdrop.open {
        opacity: 1;
        pointer-events: auto;
      }
      @media (min-width: 901px) {
        .copilot-backdrop {
          display: none !important;
          pointer-events: none !important;
        }
      }
      .copilot-drawer {
        position: fixed;
        top: 0;
        right: 0;
        bottom: 0;
        width: 400px;
        max-width: 90vw;
        background: #0B1120;
        border-left: 1px solid var(--border-subtle, #334155);
        box-shadow: -4px 0 24px rgba(0, 0, 0, 0.35);
        z-index: 1050;
        display: flex;
        flex-direction: column;
        transform: translateX(100%);
        transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        overscroll-behavior: contain;
        overscroll-behavior-y: contain;
      }
      .copilot-drawer.open {
        transform: translateX(0);
      }
      .copilot-drawer-header {
        padding: 14px 18px;
        border-bottom: 1px solid var(--border-subtle, #334155);
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: #0B1120;
        flex-shrink: 0;
      }
      .copilot-drawer-body {
        flex: 1;
        overflow-y: auto;
        overscroll-behavior: contain;
        overscroll-behavior-y: contain;
        padding: 16px 18px;
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .copilot-drawer-footer {
        padding: 12px 18px 14px;
        border-top: 1px solid var(--border-subtle, #334155);
        background: #0B1120;
        flex-shrink: 0;
      }
      .copilot-chip {
        text-align: left;
        background: var(--bg-surface, #1E293B);
        border: 1px solid var(--border-subtle, #334155);
        padding: 7px 11px;
        border-radius: 6px;
        color: var(--text-main, #F8FAFC);
        font-size: 0.8rem;
        cursor: pointer;
        transition: border-color 0.15s, background 0.15s;
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        line-height: 1.35;
      }
      .copilot-chip:hover {
        border-color: var(--accent-indigo, #6366F1);
        background: rgba(99, 102, 241, 0.08);
      }
      .copilot-composer-box:focus-within {
        border-color: var(--accent-indigo, #6366F1) !important;
        box-shadow: 0 0 0 1px var(--accent-indigo, #6366F1);
      }
      @keyframes copilotDotPulse {
        0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
        40% { opacity: 1; transform: scale(1.1); }
      }
      @media (max-width: 900px) {
        .copilot-drawer {
          width: 360px;
        }
      }
      @media (max-width: 600px) {
        .copilot-drawer {
          top: auto;
          width: 100vw;
          max-width: 100vw;
          height: 80vh;
          max-height: 80vh;
          border-left: none;
          border-top: 1px solid var(--border-subtle, #334155);
          border-radius: 16px 16px 0 0;
          transform: translateY(100%);
        }
        .copilot-drawer.open {
          transform: translateY(0);
        }
      }
    </style>

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
    <script>
      (function() {
        let lastFocusedElement = null;
        window.__lastCopilotMessage = '';
        const STORAGE_OPEN_KEY = 'copilot_drawer_open';
        const STORAGE_HISTORY_KEY = 'copilot_chat_history';

        const TRUSTED_ACTIONS = {
          complete_profile: { path: '/profile', label: 'Complete profile' },
          review_sources: { path: '/sources', label: 'Review sources' },
          check_readiness: { path: '/profile#eligibility', label: 'Check readiness' },
          review_resume: { path: '/resumes', label: 'Review resume' },
          view_matching_jobs: { path: '/apps/radar', label: 'View matching jobs' },
          review_applications: { path: '/applications', label: 'Review applications' },
          tailor_resume: { path: '/resumes', label: 'Tailor resume' },
        };

        const drawerEl = document.getElementById('copilot-drawer');
        const backdropEl = document.getElementById('copilot-drawer-backdrop');
        const messagesDiv = document.getElementById('copilot-messages');
        const introSection = document.getElementById('copilotIntroSection');
        const input = document.getElementById('copilot-input');
        const form = document.getElementById('copilot-form');
        const submitBtn = document.getElementById('copilot-submit-btn');
        const chips = document.querySelectorAll('.copilot-chip');

        window.toggleCopilotDrawer = function(open, explicitTrigger) {
          if (!drawerEl) return;

          if (open) {
            lastFocusedElement = explicitTrigger || document.activeElement;
            drawerEl.classList.add('open');
            if (backdropEl) backdropEl.classList.add('open');
            try { sessionStorage.setItem(STORAGE_OPEN_KEY, 'true'); } catch (e) {}
            setTimeout(() => {
              if (input) input.focus();
            }, 120);
          } else {
            drawerEl.classList.remove('open');
            if (backdropEl) backdropEl.classList.remove('open');
            try { sessionStorage.setItem(STORAGE_OPEN_KEY, 'false'); } catch (e) {}
            if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
              lastFocusedElement.focus();
            } else {
              const launcher = document.getElementById('copilotOpenBtn');
              if (launcher) launcher.focus();
            }
          }
        };

        window.retryLastCopilotMessage = function() {
          if (window.__lastCopilotMessage && input && form) {
            input.value = window.__lastCopilotMessage;
            form.dispatchEvent(new Event('submit', { cancelable: true }));
          }
        };

        window.clearCopilotConversation = function() {
          try {
            sessionStorage.removeItem(STORAGE_HISTORY_KEY);
          } catch (e) {}
          if (messagesDiv) {
            messagesDiv.innerHTML = '';
            messagesDiv.style.display = 'none';
          }
          if (introSection) {
            introSection.style.display = 'block';
          }
        };

        function saveHistoryItem(item) {
          try {
            const raw = sessionStorage.getItem(STORAGE_HISTORY_KEY);
            const history = raw ? JSON.parse(raw) : [];
            history.push(item);
            const trimmed = history.slice(-12);
            sessionStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(trimmed));
          } catch (e) {}
        }

        function buildAssistantHtml(structured, rawContent) {
          let botBubbleContent = '';

          if (structured && typeof structured === 'object') {
            botBubbleContent += '<div style="font-size:0.835rem; color:var(--text-main, #F8FAFC); line-height:1.45; margin-bottom:8px;">' +
              escapeText(structured.summary || rawContent || '') + '</div>';

            if (Array.isArray(structured.findings) && structured.findings.length > 0) {
              botBubbleContent += '<div class="copilot-findings-list" style="display:flex; flex-direction:column; gap:5px; margin-bottom:8px;">';
              structured.findings.slice(0, 5).forEach(function(f) {
                let borderCol = 'var(--accent-indigo, #6366F1)';
                let bgCol = 'rgba(99,102,241,0.04)';
                let titleCol = '#C7D2FE';
                let badgeText = 'INFO';
                let badgeBg = 'rgba(99,102,241,0.15)';
                if (f.severity === 'critical') {
                  borderCol = 'var(--accent-rose, #EF4444)';
                  bgCol = 'rgba(239,68,68,0.06)';
                  titleCol = '#FCA5A5';
                  badgeText = 'BLOCKER';
                  badgeBg = 'rgba(239,68,68,0.18)';
                } else if (f.severity === 'warning') {
                  borderCol = 'var(--accent-amber, #F59E0B)';
                  bgCol = 'rgba(245,158,11,0.06)';
                  titleCol = '#FCD34D';
                  badgeText = 'ATTENTION';
                  badgeBg = 'rgba(245,158,11,0.18)';
                }
                botBubbleContent += '<div style="padding:6px 9px; border-radius:5px; border:1px solid rgba(255,255,255,0.04); border-left:3px solid ' + borderCol + '; background:' + bgCol + '; display:flex; flex-direction:column; gap:2px;">' +
                  '<div style="display:flex; justify-content:space-between; align-items:center;">' +
                    '<span style="font-size:0.775rem; font-weight:600; color:' + titleCol + ';">' + escapeText(f.title) + '</span>' +
                    '<span style="font-size:0.625rem; font-weight:700; padding:1px 5px; border-radius:3px; background:' + badgeBg + '; color:' + titleCol + '; text-transform:uppercase; letter-spacing:0.03em;">' + badgeText + '</span>' +
                  '</div>' +
                  '<div style="font-size:0.735rem; color:var(--text-muted, #94A3B8); line-height:1.35;">' + escapeText(f.description) + '</div>' +
                  '</div>';
              });
              botBubbleContent += '</div>';
            }

            if (Array.isArray(structured.actions) && structured.actions.length > 0) {
              botBubbleContent += '<div class="copilot-actions-list" style="display:flex; flex-wrap:wrap; gap:6px; margin-top:8px;">';
              const hasExplicitPrimary = structured.actions.some(function(a) { return a.primary === true; });
              let primaryAssigned = false;
              structured.actions.slice(0, 3).forEach(function(act, actIdx) {
                const trusted = TRUSTED_ACTIONS[act.id];
                if (trusted) {
                  const label = act.label || trusted.label;
                  const isPrimary = (act.primary === true || (!hasExplicitPrimary && actIdx === 0)) && !primaryAssigned;
                  if (isPrimary) primaryAssigned = true;
                  if (isPrimary) {
                    botBubbleContent += '<button type="button" class="copilot-action-btn primary" data-href="' + trusted.path + '" style="padding:5px 12px; font-size:0.75rem; font-weight:600; border-radius:6px; background:var(--accent-indigo, #6366F1); border:1px solid var(--accent-indigo, #6366F1); color:#FFFFFF; cursor:pointer; display:inline-flex; align-items:center; gap:5px; box-shadow:0 1px 3px rgba(0,0,0,0.2);">' +
                      '<span>' + escapeText(label) + '</span> &rarr;' +
                      '</button>';
                  } else {
                    botBubbleContent += '<button type="button" class="copilot-action-btn secondary" data-href="' + trusted.path + '" style="padding:5px 10px; font-size:0.75rem; font-weight:500; border-radius:6px; background:rgba(255,255,255,0.04); border:1px solid var(--border-subtle, #334155); color:var(--text-main, #F8FAFC); cursor:pointer; display:inline-flex; align-items:center; gap:4px;">' +
                      '<span>' + escapeText(label) + '</span>' +
                      '</button>';
                  }
                }
              });
              botBubbleContent += '</div>';
            }
          } else {
            botBubbleContent = formatMarkdownLike(rawContent || 'I processed your request.');
          }

          return botBubbleContent;
        }

        function appendUserBubble(text, save = true) {
          if (!messagesDiv) return;
          messagesDiv.style.display = 'flex';
          const userBubble = document.createElement('div');
          userBubble.style.cssText = 'display:flex; justify-content:flex-end;';
          userBubble.innerHTML = '<div style="max-width:85%; padding:8px 12px; border-radius:8px 8px 2px 8px; font-size:0.835rem; line-height:1.45; background:var(--accent-indigo, #6366F1); color:#FFFFFF; word-break:break-word;">' +
            escapeText(text) + '</div>';
          messagesDiv.appendChild(userBubble);
          if (save) saveHistoryItem({ role: 'user', content: text });
        }

        function appendAssistantBubble(structured, rawContent, save = true) {
          if (!messagesDiv) return;
          messagesDiv.style.display = 'flex';
          const botBubble = document.createElement('div');
          botBubble.style.cssText = 'display:flex; gap:8px; align-items:flex-start;';
          botBubble.innerHTML = '<div style="max-width:90%; width:100%; padding:10px 14px; border-radius:8px 8px 8px 2px; font-size:0.835rem; line-height:1.5; background:rgba(255,255,255,0.03); border:1px solid var(--border-subtle, #334155); color:var(--text-main, #F8FAFC); word-break:break-word;">' +
            buildAssistantHtml(structured, rawContent) + '</div>';
          messagesDiv.appendChild(botBubble);

          botBubble.querySelectorAll('.copilot-action-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
              const targetPath = btn.getAttribute('data-href');
              if (targetPath) {
                window.location.href = targetPath;
              }
            });
          });

          if (save) saveHistoryItem({ role: 'assistant', content: rawContent, structuredResponse: structured });
        }

        // Restore chat history from sessionStorage on load
        try {
          const savedHistory = sessionStorage.getItem(STORAGE_HISTORY_KEY);
          if (savedHistory) {
            const history = JSON.parse(savedHistory);
            if (Array.isArray(history) && history.length > 0) {
              if (introSection) introSection.style.display = 'none';
              history.forEach(item => {
                if (item.role === 'user') {
                  appendUserBubble(item.content, false);
                } else if (item.role === 'assistant') {
                  appendAssistantBubble(item.structuredResponse, item.content, false);
                }
              });
              if (messagesDiv) messagesDiv.scrollTop = messagesDiv.scrollHeight;
            }
          }
        } catch (e) {}

        // Auto-open if query parameter or if previously opened in sessionStorage
        try {
          const urlParams = new URLSearchParams(window.location.search);
          const wasOpen = sessionStorage.getItem(STORAGE_OPEN_KEY) === 'true';
          if (urlParams.get('copilot') === 'open' || urlParams.get('intent') || wasOpen) {
            window.toggleCopilotDrawer(true);
          }
        } catch (e) {}

        // Close on Escape key and restore focus
        document.addEventListener('keydown', function(e) {
          if (e.key === 'Escape') {
            if (drawerEl && drawerEl.classList.contains('open')) {
              window.toggleCopilotDrawer(false);
            }
          }
        });

        // Focus trap inside drawer
        if (drawerEl) {
          drawerEl.addEventListener('keydown', function(e) {
            if (e.key !== 'Tab') return;
            const focusables = drawerEl.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
            if (!focusables || focusables.length === 0) return;
            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first.focus();
            }
          });

          // P90 Scroll Isolation: Prevent wheel & touch scroll events from leaking to background page
          drawerEl.addEventListener('wheel', function(e) {
            if (!drawerEl.classList.contains('open')) return;

            const bodyEl = document.getElementById('copilot-body');
            // If wheel event originates on non-scrollable header, footer, or other non-body container
            if (!bodyEl || !bodyEl.contains(e.target)) {
              e.preventDefault();
              e.stopPropagation();
              return;
            }

            // Inside scrollable body: prevent scroll chaining when reaching boundaries
            const deltaY = e.deltaY;
            const atTop = bodyEl.scrollTop <= 0;
            const atBottom = Math.ceil(bodyEl.scrollTop + bodyEl.clientHeight) >= bodyEl.scrollHeight;

            if ((deltaY < 0 && atTop) || (deltaY > 0 && atBottom)) {
              e.preventDefault();
              e.stopPropagation();
            }
          }, { passive: false });

          let touchStartY = 0;
          drawerEl.addEventListener('touchstart', function(e) {
            if (e.touches && e.touches.length > 0) {
              touchStartY = e.touches[0].clientY;
            }
          }, { passive: true });

          drawerEl.addEventListener('touchmove', function(e) {
            if (!drawerEl.classList.contains('open')) return;
            const bodyEl = document.getElementById('copilot-body');
            if (!bodyEl || !bodyEl.contains(e.target)) {
              e.preventDefault();
              e.stopPropagation();
              return;
            }

            if (e.touches && e.touches.length > 0) {
              const currentY = e.touches[0].clientY;
              const deltaY = touchStartY - currentY;
              const atTop = bodyEl.scrollTop <= 0;
              const atBottom = Math.ceil(bodyEl.scrollTop + bodyEl.clientHeight) >= bodyEl.scrollHeight;

              if ((deltaY < 0 && atTop) || (deltaY > 0 && atBottom)) {
                e.preventDefault();
                e.stopPropagation();
              }
            }
          }, { passive: false });
        }

        // Auto-grow textarea
        if (input) {
          input.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 96) + 'px';
          });

          // Enter submits, Shift+Enter creates newline
          input.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (form) form.dispatchEvent(new Event('submit', { cancelable: true }));
            }
          });
        }

        // Wire prompt chips
        chips.forEach(chip => {
          chip.addEventListener('click', () => {
            const prompt = chip.getAttribute('data-prompt');
            if (prompt && input && form) {
              input.value = prompt;
              form.dispatchEvent(new Event('submit', { cancelable: true }));
            }
          });
        });

        if (form && input && messagesDiv) {
          form.addEventListener('submit', async function(e) {
            const msg = input.value.trim();
            if (!msg) return;

            e.preventDefault();
            window.__lastCopilotMessage = msg;
            input.value = '';
            input.style.height = 'auto';
            if (submitBtn) submitBtn.disabled = true;

            // Collapse initial quick actions on interaction
            if (introSection) introSection.style.display = 'none';

            // Render user bubble
            appendUserBubble(msg, true);

            // Render compact typing indicator
            const thinkingBubble = document.createElement('div');
            thinkingBubble.id = 'copilotThinkingBubble';
            thinkingBubble.style.cssText = 'display:flex; gap:8px; align-items:center;';
            thinkingBubble.innerHTML = '<div style="padding:8px 12px; border-radius:8px 8px 8px 2px; background:rgba(255,255,255,0.03); border:1px solid var(--border-subtle, #334155); display:inline-flex; align-items:center; gap:4px;">' +
              '<span style="width:5px; height:5px; border-radius:50%; background:var(--accent-indigo, #6366F1); animation:copilotDotPulse 1.2s infinite ease-in-out;"></span>' +
              '<span style="width:5px; height:5px; border-radius:50%; background:var(--accent-indigo, #6366F1); animation:copilotDotPulse 1.2s infinite ease-in-out 0.2s;"></span>' +
              '<span style="width:5px; height:5px; border-radius:50%; background:var(--accent-indigo, #6366F1); animation:copilotDotPulse 1.2s infinite ease-in-out 0.4s;"></span>' +
              '</div>';
            messagesDiv.appendChild(thinkingBubble);
            messagesDiv.scrollTop = messagesDiv.scrollHeight;

            try {
              const currentPageContext = (drawerEl && drawerEl.getAttribute('data-page-context')) || 'dashboard';
              const res = await fetch('/assistant/message', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Accept': 'application/json'
                },
                body: JSON.stringify({ message: msg, pageContext: currentPageContext })
              });

              if (thinkingBubble && thinkingBubble.parentNode) {
                thinkingBubble.remove();
              }

              if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.error || ('HTTP ' + res.status));
              }

              const data = await res.json();
              window.__lastCopilotData = data;

              // Check for controlled failure states from backend
              if (data?.response?.state === 'AI_FAILURE') {
                const errBubble = document.createElement('div');
                errBubble.style.cssText = 'display:flex; gap:8px; align-items:flex-start;';
                errBubble.innerHTML = '<div style="padding:10px 14px; border-radius:8px; font-size:0.835rem; background:rgba(245,158,11,0.08); border:1px solid rgba(245,158,11,0.25); color:var(--accent-amber, #F59E0B); line-height:1.45; width:100%;">' +
                  '<div style="margin-bottom:8px; font-weight:500;">Career Copilot is temporarily unavailable.</div>' +
                  '<button type="button" class="copilot-retry-btn" onclick="window.retryLastCopilotMessage && window.retryLastCopilotMessage()" style="padding:4px 10px; font-size:0.75rem; font-weight:600; background:rgba(245,158,11,0.15); border:1px solid rgba(245,158,11,0.35); color:#FCD34D; border-radius:5px; cursor:pointer;">Try again</button>' +
                  '</div>';
                messagesDiv.appendChild(errBubble);
                messagesDiv.scrollTop = messagesDiv.scrollHeight;
                return;
              }

              if (data?.response?.state === 'INSUFFICIENT_CONTEXT') {
                const infoBubble = document.createElement('div');
                infoBubble.style.cssText = 'display:flex; gap:8px; align-items:flex-start;';
                infoBubble.innerHTML = '<div style="padding:10px 14px; border-radius:8px; font-size:0.835rem; background:rgba(99,102,241,0.08); border:1px solid rgba(99,102,241,0.25); color:var(--text-main, #F8FAFC); line-height:1.45; width:100%;">' +
                  '<div style="margin-bottom:8px; font-weight:500;">I need more profile information to answer this reliably.</div>' +
                  '<button type="button" class="copilot-nav-btn" data-href="/profile" style="padding:4px 10px; font-size:0.75rem; font-weight:600; background:var(--accent-indigo, #6366F1); color:#FFFFFF; border:none; border-radius:5px; cursor:pointer;">Review profile</button>' +
                  '</div>';
                const navBtn = infoBubble.querySelector('.copilot-nav-btn');
                if (navBtn) {
                  navBtn.addEventListener('click', function() {
                    window.location.href = '/profile';
                  });
                }
                messagesDiv.appendChild(infoBubble);
                messagesDiv.scrollTop = messagesDiv.scrollHeight;
                return;
              }

              const structured = data?.response?.structuredResponse;
              appendAssistantBubble(structured, data?.response?.content, true);
              messagesDiv.scrollTop = messagesDiv.scrollHeight;

              if (data?.response?.proposals && data.response.proposals.length > 0) {
                setTimeout(() => window.location.reload(), 900);
              }
            } catch (err) {
              console.error('Career Copilot client fetch error:', err);
              window.__lastCopilotError = err;
              if (thinkingBubble && thinkingBubble.parentNode) {
                thinkingBubble.remove();
              }
              const errBubble = document.createElement('div');
              errBubble.style.cssText = 'display:flex; gap:8px; align-items:flex-start;';
              errBubble.innerHTML = '<div style="padding:10px 14px; border-radius:8px; font-size:0.835rem; background:rgba(245,158,11,0.08); border:1px solid rgba(245,158,11,0.25); color:var(--accent-amber, #F59E0B); line-height:1.45; width:100%;">' +
                '<div style="margin-bottom:8px; font-weight:500;">Career Copilot is temporarily unavailable.</div>' +
                '<button type="button" class="copilot-retry-btn" onclick="window.retryLastCopilotMessage && window.retryLastCopilotMessage()" style="padding:4px 10px; font-size:0.75rem; font-weight:600; background:rgba(245,158,11,0.15); border:1px solid rgba(245,158,11,0.35); color:#FCD34D; border-radius:5px; cursor:pointer;">Try again</button>' +
                '</div>';
              messagesDiv.appendChild(errBubble);
            } finally {
              if (submitBtn) submitBtn.disabled = false;
            }
          });
        }

        function escapeText(str) {
          const div = document.createElement('div');
          div.textContent = str;
          return div.innerHTML;
        }

        function formatMarkdownLike(str) {
          try {
            if (!str) return '';
            return escapeText(String(str))
              .split('**').map(function(part, idx) { return idx % 2 === 1 ? '<strong>' + part + '</strong>' : part; }).join('')
              .split('*').map(function(part, idx) { return idx % 2 === 1 ? '<em>' + part + '</em>' : part; }).join('')
              .split(String.fromCharCode(96)).map(function(part, idx) { return idx % 2 === 1 ? '<code>' + part + '</code>' : part; }).join('');
          } catch (e) {
            console.error('formatMarkdownLike error:', e);
            return escapeText(String(str || ''));
          }
        }
      })();
    </script>
  `;
}

export default renderCopilotDrawer;
