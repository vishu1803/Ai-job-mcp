/**
 * @file Universal Contextual Career Copilot Drawer Component (P85 / P89).
 *
 * Provides a shared, responsive slide-over drawer (bottom sheet on mobile)
 * that is accessible across all candidate workspace surfaces:
 * - Dashboard
 * - Profile
 * - Jobs / Radar
 * - Applications
 * - Resumes
 *
 * Implements context-aware prompt chips, human-confirmed safe proposals,
 * fail-closed error recovery, deterministic SVG icons, and WCAG 2.2 AA keyboard accessibility.
 */

import { escapeHtml } from '../../utils/html-escaper.js';
import { renderIcon } from './icons.js';
import { renderAIUnavailableCard } from './state-views.js';

/**
 * Contextual suggested prompts mapped by page context.
 */
const CONTEXT_PROMPTS = {
  dashboard: [
    { label: 'What should I do next?', icon: 'arrowRight', prompt: 'What should I do next to improve my job search?' },
    { label: 'Check my application readiness', icon: 'check', prompt: 'Check my application readiness and missing screening fields' },
    { label: 'Find jobs matching my profile', icon: 'radar', prompt: 'Find jobs matching my verified skills and target roles' },
  ],
  profile: [
    { label: 'What is missing from my profile?', icon: 'alertCircle', prompt: 'What is missing for employer screening?' },
    { label: 'Improve my professional summary', icon: 'edit', prompt: 'How can I improve my professional headline and summary based on my verified experience?' },
    { label: 'Check application readiness', icon: 'check', prompt: 'Evaluate my profile readiness against standard employer requirements' },
  ],
  radar: [
    { label: 'How well do I match?', icon: 'radar', prompt: 'How well do my verified skills match this role?' },
    { label: 'What skills am I missing?', icon: 'alertCircle', prompt: 'What are my top skill gaps for this position and how can I demonstrate them?' },
    { label: 'Help me prepare my application', icon: 'applications', prompt: 'Help me prepare my application and tailored answers for this role' },
  ],
  job: [
    { label: 'How well do I match?', icon: 'radar', prompt: 'How well do my verified skills match this role?' },
    { label: 'What skills am I missing?', icon: 'alertCircle', prompt: 'What are my top skill gaps for this position?' },
    { label: 'Help me prepare my application', icon: 'applications', prompt: 'Help me prepare my application and tailored answers for this role' },
  ],
  applications: [
    { label: 'What fields still need my attention?', icon: 'alertCircle', prompt: 'Which of my applications have missing fields, conflicts, or require action?' },
    { label: 'Review my application answers', icon: 'clipboard', prompt: 'Review my application answers before submission' },
    { label: 'Help me prepare for interviews', icon: 'chat', prompt: 'Help me prepare technical talking points based on my verified code evidence' },
  ],
  application: [
    { label: 'What fields still need my attention?', icon: 'alertCircle', prompt: 'What items need my attention on this application before I can submit?' },
    { label: 'Review my application answers', icon: 'clipboard', prompt: 'Review my screening answers for this application' },
    { label: 'Help me prepare for interviews', icon: 'chat', prompt: 'Help me prepare for this role based on verified project evidence' },
  ],
  resumes: [
    { label: 'What should I improve on my resume?', icon: 'edit', prompt: 'How can I improve my resume bullet points while strictly preserving authentic metrics?' },
    { label: 'Review active base resume', icon: 'resumes', prompt: 'Is my active base resume up to date with my verified repository skills?' },
    { label: 'Tailor resume for target role', icon: 'radar', prompt: 'How should I tailor my resume narrative for my target role?' },
  ],
  sources: [
    { label: 'Which repositories best support my target role?', icon: 'code', prompt: 'Which repositories best support my target role and showcase verified skills?' },
    { label: 'Review active base resume', icon: 'resumes', prompt: 'Review my active resume and extraction status' },
    { label: 'What sources should I connect next?', icon: 'sources', prompt: 'What sources or repositories should I connect to increase my verified credentials?' },
  ],
};

/**
 * Renders the Universal Career Copilot Slide-Over Drawer HTML markup.
 *
 * @param {object} params
 * @param {string} [params.pageContext='dashboard'] Current page context
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
  const normalizedContext = CONTEXT_PROMPTS[pageContext] ? pageContext : 'dashboard';
  const suggestedPrompts = CONTEXT_PROMPTS[normalizedContext] || CONTEXT_PROMPTS.dashboard;

  return `
    <!-- Career Copilot Drawer Styles -->
    <style>
      .copilot-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.65);
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        z-index: 1040;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.2s ease;
      }
      .copilot-backdrop.open {
        opacity: 1;
        pointer-events: auto;
      }
      .copilot-drawer {
        position: fixed;
        top: 0;
        right: 0;
        bottom: 0;
        width: 440px;
        max-width: 92vw;
        background: #0F172A;
        border-left: 1px solid var(--border-highlight);
        box-shadow: -8px 0 32px rgba(0, 0, 0, 0.6);
        z-index: 1050;
        display: flex;
        flex-direction: column;
        transform: translateX(100%);
        transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .copilot-drawer.open {
        transform: translateX(0);
      }
      .copilot-drawer-header {
        padding: 16px 20px;
        border-bottom: 1px solid var(--border-subtle);
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: rgba(15, 23, 42, 0.98);
        flex-shrink: 0;
      }
      .copilot-drawer-body {
        flex: 1;
        overflow-y: auto;
        padding: 20px;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .copilot-drawer-footer {
        padding: 14px 20px;
        border-top: 1px solid var(--border-subtle);
        background: rgba(15, 23, 42, 0.98);
        flex-shrink: 0;
      }
      .copilot-chip {
        text-align: left;
        background: var(--bg-surface);
        border: 1px solid var(--border-subtle);
        padding: 8px 12px;
        border-radius: 6px;
        color: var(--text-main);
        font-size: 0.825rem;
        cursor: pointer;
        transition: border-color 0.15s, background 0.15s;
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
      }
      .copilot-chip:hover {
        border-color: var(--accent-indigo);
        background: rgba(99, 102, 241, 0.08);
      }
      @media (max-width: 600px) {
        .copilot-drawer {
          top: auto;
          width: 100vw;
          max-width: 100vw;
          height: 85vh;
          max-height: 85vh;
          border-left: none;
          border-top: 1px solid var(--border-highlight);
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
      <div class="copilot-drawer-header">
        <div style="display:flex; align-items:center; gap:10px;">
          <div style="width:32px; height:32px; border-radius:8px; background:rgba(99,102,241,0.15); color:var(--accent-indigo); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
            ${renderIcon('copilot', { size: 18 })}
          </div>
          <div>
            <h2 style="font-size:1rem; font-weight:700; color:var(--text-main); margin:0;">Career Copilot</h2>
            <span style="font-size:0.75rem; color:var(--text-dim);">Context-aware application guidance</span>
          </div>
        </div>
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          id="copilotCloseBtn"
          onclick="window.toggleCopilotDrawer && window.toggleCopilotDrawer(false)"
          aria-label="Close Career Copilot"
          style="padding:4px 8px; border-radius:6px; font-size:0.8rem; cursor:pointer;"
        >
          ${renderIcon('cross', { size: 14 })}
        </button>
      </div>

      <div class="copilot-drawer-body">
        <!-- AI Unavailable Banner if service offline -->
        ${!aiAvailable ? renderAIUnavailableCard({ continueHref: '/profile' }) : ''}

        <!-- Active Safe Proposals (Human-in-the-Loop Confirmation) -->
        ${
          activeProposals.length > 0
            ? `
          <div style="background:rgba(245,158,11,0.08); border:1px solid rgba(245,158,11,0.3); border-left:4px solid var(--accent-amber); padding:14px; border-radius:var(--radius-sm);">
            <div style="font-size:0.75rem; font-weight:700; color:var(--accent-amber); text-transform:uppercase; margin-bottom:8px; display:flex; align-items:center; gap:6px;">
              ${renderIcon('alertCircle', { size: 14 })}
              <span>Proposed Profile Updates (Confirmation Required)</span>
            </div>
            ${activeProposals
              .map(
                (p) => `
              <div style="margin-bottom:12px; padding-bottom:12px; border-bottom:1px solid rgba(255,255,255,0.06);">
                <div style="font-size:0.9rem; font-weight:600; color:var(--text-main);">${escapeHtml(p.fieldLabel || p.field)}</div>
                <div style="font-size:0.8rem; color:var(--text-muted); margin:4px 0 8px;">
                  Current: <code>${escapeHtml(String(p.currentValue ?? 'Not set'))}</code> &rarr; Proposed: <strong style="color:var(--accent-emerald);">${escapeHtml(String(p.proposedValue))}</strong>
                </div>
                <div style="display:flex; gap:8px;">
                  <form method="POST" action="/assistant/proposals/confirm" style="display:inline;">
                    <input type="hidden" name="proposalId" value="${escapeHtml(p.id)}">
                    <input type="hidden" name="confirmedByUser" value="true">
                    <button type="submit" class="btn btn-primary btn-sm" style="padding:4px 10px; font-size:0.75rem;">
                      ${renderIcon('check', { size: 12 })} <span>Confirm</span>
                    </button>
                  </form>
                  <form method="POST" action="/assistant/proposals/reject" style="display:inline;">
                    <input type="hidden" name="proposalId" value="${escapeHtml(p.id)}">
                    <button type="submit" class="btn btn-secondary btn-sm" style="padding:4px 10px; font-size:0.75rem;">
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

        <!-- Context-Specific Suggested Prompts -->
        <div id="copilotSuggestionsSection">
          <div style="font-size:0.75rem; color:var(--text-dim); text-transform:uppercase; font-weight:600; margin-bottom:8px; letter-spacing:0.04em;">
            Suggested prompts
          </div>
          <div style="display:flex; flex-direction:column; gap:6px;">
            ${suggestedPrompts
              .map(
                (item) => `
              <button type="button" class="copilot-chip" data-prompt="${escapeHtml(item.prompt)}">
                <span style="color:var(--accent-indigo); flex-shrink:0;">${renderIcon(item.icon, { size: 13 })}</span>
                <span>${escapeHtml(item.label)}</span>
              </button>
            `
              )
              .join('')}
          </div>
        </div>

        <!-- Chat Conversation Messages -->
        <div id="copilot-messages" style="display:${messages.length > 0 ? 'flex' : 'none'}; flex-direction:column; gap:10px;">
          ${messages
            .map(
              (m) => `
            <div style="display:flex; gap:8px; align-items:flex-start; ${m.role === 'user' ? 'justify-content:flex-end;' : ''}">
              <div style="max-width:85%; padding:10px 14px; border-radius:10px; font-size:0.85rem; line-height:1.45; ${m.role === 'user' ? 'background:var(--accent-indigo); color:#FFFFFF;' : 'background:rgba(255,255,255,0.04); border:1px solid var(--border-subtle); color:var(--text-main);'}">
                ${escapeHtml(m.content)}
              </div>
            </div>
          `
            )
            .join('')}
        </div>
      </div>

      <div class="copilot-drawer-footer">
        <form id="copilot-form" method="POST" action="/assistant/message" style="display:flex; gap:8px; margin:0;">
          <input
            id="copilot-input"
            type="text"
            name="message"
            class="form-control"
            placeholder="Ask Career Copilot..."
            required
            autocomplete="off"
            style="flex:1; height:40px; font-size:0.875rem;"
            value="${initialIntent ? escapeHtml(initialIntent) : ''}"
          />
          <button id="copilot-submit-btn" type="submit" class="btn btn-primary" style="height:40px; padding:0 14px; font-size:0.875rem; font-weight:600; display:inline-flex; align-items:center; gap:6px;">
            ${renderIcon('copilot', { size: 14 })}
            <span>Send</span>
          </button>
        </form>
      </div>
    </aside>

    <!-- Universal Copilot Controller Script -->
    <script>
      (function() {
        let lastFocusedElement = null;

        window.toggleCopilotDrawer = function(open, explicitTrigger) {
          const drawer = document.getElementById('copilot-drawer');
          const backdrop = document.getElementById('copilot-drawer-backdrop');
          if (!drawer || !backdrop) return;

          if (open) {
            lastFocusedElement = explicitTrigger || document.activeElement;
            drawer.classList.add('open');
            backdrop.classList.add('open');
            setTimeout(() => {
              const input = document.getElementById('copilot-input');
              if (input) input.focus();
            }, 150);
          } else {
            drawer.classList.remove('open');
            backdrop.classList.remove('open');
            if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
              lastFocusedElement.focus();
            }
          }
        };

        // Auto-open if query parameter copilot=open
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('copilot') === 'open' || urlParams.get('intent')) {
          window.toggleCopilotDrawer(true);
        }

        // Close on Escape key
        document.addEventListener('keydown', function(e) {
          if (e.key === 'Escape') {
            const drawer = document.getElementById('copilot-drawer');
            if (drawer && drawer.classList.contains('open')) {
              window.toggleCopilotDrawer(false);
            }
          }
        });

        // Wire chips
        const chips = document.querySelectorAll('.copilot-chip');
        const input = document.getElementById('copilot-input');
        const form = document.getElementById('copilot-form');
        const messagesDiv = document.getElementById('copilot-messages');
        const submitBtn = document.getElementById('copilot-submit-btn');

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
            input.value = '';
            if (submitBtn) submitBtn.disabled = true;

            // Render user bubble
            messagesDiv.style.display = 'flex';
            const userBubble = document.createElement('div');
            userBubble.style.cssText = 'display:flex; justify-content:flex-end; margin-bottom:8px;';
            userBubble.innerHTML = '<div style="max-width:85%; padding:10px 14px; border-radius:10px; font-size:0.85rem; line-height:1.45; background:var(--accent-indigo); color:#FFFFFF;">' +
              escapeText(msg) + '</div>';
            messagesDiv.appendChild(userBubble);

            // Render thinking indicator
            const thinkingBubble = document.createElement('div');
            thinkingBubble.style.cssText = 'display:flex; gap:8px; align-items:flex-start; margin-bottom:8px;';
            thinkingBubble.innerHTML = '<div style="width:24px; height:24px; border-radius:6px; background:rgba(99,102,241,0.2); color:var(--accent-indigo); display:flex; align-items:center; justify-content:center; flex-shrink:0;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>' +
              '<div style="max-width:85%; padding:10px 14px; border-radius:10px; font-size:0.85rem; background:rgba(255,255,255,0.04); border:1px solid var(--border-subtle); color:var(--text-muted); font-style:italic;">Thinking...</div>';
            messagesDiv.appendChild(thinkingBubble);
            messagesDiv.scrollTop = messagesDiv.scrollHeight;

            try {
              const res = await fetch('/assistant/message', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Accept': 'application/json'
                },
                body: JSON.stringify({ message: msg })
              });

              thinkingBubble.remove();

              if (!res.ok) {
                throw new Error('Assistant error: ' + res.status);
              }

              const data = await res.json();
              const responseText = data?.response?.content || 'I processed your request.';

              const botBubble = document.createElement('div');
              botBubble.style.cssText = 'display:flex; gap:8px; align-items:flex-start; margin-bottom:8px;';
              botBubble.innerHTML = '<div style="width:24px; height:24px; border-radius:6px; background:rgba(99,102,241,0.2); color:var(--accent-indigo); display:flex; align-items:center; justify-content:center; flex-shrink:0;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg></div>' +
                '<div style="max-width:85%; padding:10px 14px; border-radius:10px; font-size:0.85rem; line-height:1.45; background:rgba(255,255,255,0.04); border:1px solid var(--border-subtle); color:var(--text-main); white-space:pre-line;">' +
                escapeText(responseText) + '</div>';
              messagesDiv.appendChild(botBubble);
              messagesDiv.scrollTop = messagesDiv.scrollHeight;

              if (data?.response?.proposals && data.response.proposals.length > 0) {
                setTimeout(() => window.location.reload(), 900);
              }
            } catch (err) {
              thinkingBubble.remove();
              const errBubble = document.createElement('div');
              errBubble.style.cssText = 'display:flex; gap:8px; align-items:flex-start; margin-bottom:8px;';
              errBubble.innerHTML = '<div style="padding:10px 14px; border-radius:10px; font-size:0.85rem; background:rgba(245,158,11,0.1); border:1px solid rgba(245,158,11,0.3); color:var(--accent-amber);">' +
                'Career Copilot is temporarily busy. You can continue manually.' + '</div>';
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
      })();
    </script>
  `;
}
