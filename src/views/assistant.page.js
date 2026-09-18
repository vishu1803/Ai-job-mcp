/**
 * @file AI Career Assistant Web View Template (P87 Phase 1)
 *
 * Renders the safe AI Career Assistant interface:
 * - Conversational assistant chat with quick action prompt pills
 * - Actionable Proposal Cards requiring explicit user confirmation
 * - Profile Conflict Cards presenting discrepancies without unilateral override
 * - Evidence Source Badges linking to verified profile and repository facts
 * - Fail-closed graceful degradation banner when AI is unavailable
 */

import { renderLayout } from './layout.js';
import { escapeHtml } from '../utils/html-escaper.js';
import { renderIcon } from './components/icons.js';

/**
 * Renders the AI Career Assistant page.
 *
 * @param {object} params
 * @param {object} params.user Authenticated user
 * @param {object} params.tenant Authenticated tenant
 * @param {object|null} [params.candidate=null] Candidate profile
 * @param {object|null} [params.readiness=null] Application readiness summary
 * @param {Array<object>} [params.activeProposals=[]] Stored or current proposals
 * @param {Array<object>} [params.conflicts=[]] Detected profile conflicts
 * @param {Array<object>} [params.messages=[]] Conversation thread
 * @param {string|null} [params.flashMessage=null]
 * @param {string|null} [params.flashError=null]
 * @param {boolean} [params.aiAvailable=true]
 * @returns {string} HTML document
 */
export function renderAssistantPage({
  user,
  _tenant,
  candidate = null,
  readiness = null,
  activeProposals = [],
  conflicts = [],
  messages = [],
  flashMessage = null,
  flashError = null,
  aiAvailable = true,
}) {
  const userName = escapeHtml(user?.displayName || candidate?.displayName || 'Candidate');
  const readinessScore = readiness?.readinessScore ?? readiness?.semantics?.overallReadinessScore ?? 85;

  const content = `
  <div class="container assistant-container" style="max-width: 1080px; margin: 32px auto; padding: 0 16px;">
    
    <!-- Top Header & Safe Boundary Notice -->
    <div class="assistant-header-card" style="background: linear-gradient(135deg, rgba(30, 41, 59, 0.8), rgba(15, 23, 42, 0.9)); border: 1px solid var(--border-highlight); border-radius: var(--radius-md); padding: 24px; margin-bottom: 24px;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 16px;">
        <div>
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
            ${renderIcon('robot', { size: 28, style: 'color: #818CF8;' })}
            <h1 style="font-size: 1.5rem; font-weight: 700; color: var(--text-main); margin: 0;">AI Career Assistant</h1>
            <span class="badge" style="background: rgba(99, 102, 241, 0.2); color: #A5B4FC; border: 1px solid rgba(99, 102, 241, 0.4); font-size: 0.75rem; padding: 2px 8px; border-radius: 12px;">Safe & Evidence-Grounded</span>
          </div>
          <p style="color: var(--text-muted); font-size: 0.9rem; margin: 0; max-width: 680px; line-height: 1.5;">
            Your evidence-backed career copilot. Explains profile fields, summarizes readiness, detects application conflicts, and proposes updates. 
            <strong style="color: var(--text-main);">AI is not a source of truth</strong> — your canonical profile and evidence remain authoritative.
          </p>
        </div>
        <div style="display: flex; gap: 12px; align-items: center;">
          <div style="background: rgba(17, 24, 39, 0.7); border: 1px solid var(--border-subtle); padding: 10px 16px; border-radius: var(--radius-sm); text-align: center;">
            <div style="font-size: 0.75rem; color: var(--text-dim); text-transform: uppercase;">Readiness</div>
            <div style="font-size: 1.25rem; font-weight: 700; color: ${readinessScore >= 80 ? '#34D399' : '#FBBF24'};">${readinessScore}%</div>
          </div>
          <a href="/profile" class="btn btn-secondary" style="font-size: 0.85rem; padding: 8px 14px; text-decoration: none;">View Canonical Profile</a>
        </div>
      </div>
    </div>

    <!-- AI Unavailability / Degradation Banner -->
    ${
      !aiAvailable
        ? `
      <div class="card" style="border-left: 4px solid #F59E0B; background: rgba(245, 158, 11, 0.1); margin-bottom: 24px; padding: 16px;">
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
          <div>
            <h3 style="margin: 0 0 4px; font-size: 0.95rem; color: #FBBF24;">AI Assistant Temporarily Unavailable</h3>
            <p style="margin: 0; font-size: 0.85rem; color: var(--text-muted);">
              The core portal remains fully functional. You can update your profile, track applications, and view ATS radar directly without AI.
            </p>
          </div>
          <a href="/profile" class="btn btn-primary" style="font-size: 0.825rem; padding: 6px 14px;">Continue without AI</a>
        </div>
      </div>
    `
        : ''
    }

    <!-- Flash Messages -->
    ${
      flashMessage
        ? `
      <div class="card" style="border-left: 4px solid #10B981; background: rgba(16, 185, 129, 0.1); margin-bottom: 20px; padding: 14px;">
        <p style="margin: 0; font-size: 0.9rem; color: #34D399;">${escapeHtml(flashMessage)}</p>
      </div>
    `
        : ''
    }
    ${
      flashError
        ? `
      <div class="card" style="border-left: 4px solid #EF4444; background: rgba(239, 68, 68, 0.1); margin-bottom: 20px; padding: 14px;">
        <p style="margin: 0; font-size: 0.9rem; color: #F87171;">${escapeHtml(flashError)}</p>
      </div>
    `
        : ''
    }

    <div style="display: grid; grid-template-columns: 1fr 340px; gap: 24px;" class="grid-2col">
      
      <!-- Main Column: Chat Thread & Proposals -->
      <div>
        
        <!-- Active Safe Proposals Section -->
        ${
          activeProposals.length > 0
            ? `
          <div class="proposals-container" style="margin-bottom: 24px;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
              <h2 style="font-size: 1.1rem; font-weight: 600; color: var(--text-main); margin: 0; display: flex; align-items: center; gap: 8px;">
                ${renderIcon('edit', { size: 18, style: 'color: #FBBF24;' })}
                <span>Proposed Profile Updates</span>
                <span class="badge" style="background: rgba(245, 158, 11, 0.2); color: #FBBF24; font-size: 0.75rem; padding: 2px 8px; border-radius: 10px;">Requires Confirmation</span>
              </h2>
            </div>
            
            ${activeProposals
              .map(
                (p) => `
              <div class="card proposal-card" style="background: var(--bg-surface-elevated); border: 1px solid rgba(245, 158, 11, 0.4); border-radius: var(--radius-sm); padding: 16px; margin-bottom: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 10px;">
                  <div>
                    <span style="font-size: 0.75rem; font-weight: 700; color: #FBBF24; text-transform: uppercase; letter-spacing: 0.05em;">${escapeHtml(p.category || 'PREFERENCE')}</span>
                    <h3 style="font-size: 1rem; font-weight: 600; margin: 2px 0 4px; color: var(--text-main);">${escapeHtml(p.fieldLabel || p.field)}</h3>
                  </div>
                  <span class="badge" style="background: rgba(99, 102, 241, 0.15); color: #A5B4FC; font-size: 0.75rem; padding: 3px 8px; border-radius: 6px;">
                    Source: ${escapeHtml(p.evidence?.label || 'User chat')}
                  </span>
                </div>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; background: rgba(15, 23, 42, 0.6); padding: 12px; border-radius: 6px; margin-bottom: 12px; font-size: 0.85rem;">
                  <div>
                    <div style="color: var(--text-dim); font-size: 0.75rem;">Current Value:</div>
                    <div style="color: var(--text-muted); font-family: var(--font-mono, monospace);">${escapeHtml(JSON.stringify(p.currentValue ?? 'Not set'))}</div>
                  </div>
                  <div>
                    <div style="color: #34D399; font-size: 0.75rem; font-weight: 600;">Proposed Value:</div>
                    <div style="color: #34D399; font-weight: 600; font-family: var(--font-mono, monospace);">${escapeHtml(JSON.stringify(p.proposedValue))}</div>
                  </div>
                </div>

                <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 14px;">
                  <em>"${escapeHtml(p.reason)}"</em>
                </div>

                <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-subtle); padding-top: 12px;">
                  <span style="font-size: 0.775rem; color: var(--text-dim);">I won't change your profile until you confirm.</span>
                  <div style="display: flex; gap: 8px;">
                    <form action="/assistant/proposals/reject" method="POST" style="margin: 0;">
                      <input type="hidden" name="proposalId" value="${escapeHtml(p.id)}">
                      <button type="submit" class="btn btn-secondary" style="font-size: 0.8rem; padding: 6px 12px;">Dismiss</button>
                    </form>
                    <form action="/assistant/proposals/confirm" method="POST" style="margin: 0;">
                      <input type="hidden" name="proposalId" value="${escapeHtml(p.id)}">
                      <input type="hidden" name="confirmedByUser" value="true">
                      <button type="submit" class="btn btn-primary" style="font-size: 0.8rem; padding: 6px 16px; background: #059669; border-color: #10B981;">
                        Confirm & Update Profile
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            `
              )
              .join('')}
          </div>
        `
            : ''
        }

        <!-- Conflicts Warning Section -->
        ${
          conflicts.length > 0
            ? `
          <div class="conflicts-container" style="margin-bottom: 24px;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
              ${renderIcon('alertTriangle', { size: 18, style: 'color: #F87171;' })}
              <h2 style="font-size: 1.1rem; font-weight: 600; color: #F87171; margin: 0;">Profile Discrepancies Detected</h2>
            </div>
            ${conflicts
              .map(
                (c) => `
              <div class="card conflict-card" style="border-left: 4px solid #EF4444; background: rgba(239, 68, 68, 0.08); border-radius: var(--radius-sm); padding: 14px; margin-bottom: 10px;">
                <div style="font-weight: 600; color: var(--text-main); font-size: 0.95rem; margin-bottom: 6px;">${escapeHtml(c.fieldLabel)}</div>
                <div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 10px;">${escapeHtml(c.notes)}</div>
                <div style="display: flex; gap: 10px; font-size: 0.8rem;">
                  <a href="/profile" class="btn btn-secondary" style="padding: 4px 10px; text-decoration: none;">Review Profile</a>
                  <a href="/applications" class="btn btn-secondary" style="padding: 4px 10px; text-decoration: none;">Review Application</a>
                </div>
              </div>
            `
              )
              .join('')}
          </div>
        `
            : ''
        }

        <!-- Chat Conversation Card -->
        <div class="card chat-card" style="background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); overflow: hidden; display: flex; flex-direction: column; min-height: 480px;">
          
          <!-- Message Thread -->
          <div id="chatMessages" style="flex: 1; padding: 20px; overflow-y: auto; display: flex; flex-direction: column; gap: 16px;">
            
            <!-- Default Welcome Message -->
            <div class="chat-message assistant-message" style="display: flex; gap: 12px; align-items: flex-start;">
              <div style="background: rgba(99, 102, 241, 0.2); width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                ${renderIcon('robot', { size: 18, style: 'color: #818CF8;' })}
              </div>
              <div style="background: var(--bg-surface-elevated); border: 1px solid var(--border-subtle); border-radius: 12px; border-top-left-radius: 2px; padding: 14px 18px; max-width: 85%;">
                <div style="font-weight: 600; font-size: 0.825rem; color: #A5B4FC; margin-bottom: 4px;">Career Assistant</div>
                <div style="color: var(--text-main); font-size: 0.9rem; line-height: 1.5;">
                  Hello ${userName}! How can I help you today? I can:
                  <ul style="margin: 8px 0 0; padding-left: 20px; color: var(--text-muted);">
                    <li>Explain your profile fields & readiness criteria</li>
                    <li>Help update your job search preferences</li>
                    <li>Check for conflicts between your profile and application answers</li>
                    <li>Explain target job requirements and check your verified skills</li>
                    <li>Suggest phrasing improvements for resume bullets without inventing metrics</li>
                  </ul>
                </div>
              </div>
            </div>

            <!-- Stored conversation messages -->
            ${messages
              .map(
                (m) => `
              <div class="chat-message ${m.role === 'user' ? 'user-message' : 'assistant-message'}" style="display: flex; gap: 12px; align-items: flex-start; ${m.role === 'user' ? 'flex-direction: row-reverse;' : ''}">
                <div style="background: ${m.role === 'user' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(99, 102, 241, 0.2)'}; width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                  ${m.role === 'user' ? renderIcon('user', { size: 16, style: 'color: #34D399;' }) : renderIcon('robot', { size: 16, style: 'color: #818CF8;' })}
                </div>
                <div style="background: ${m.role === 'user' ? 'rgba(99, 102, 241, 0.15)' : 'var(--bg-surface-elevated)'}; border: 1px solid ${m.role === 'user' ? 'rgba(99, 102, 241, 0.3)' : 'var(--border-subtle)'}; border-radius: 12px; ${m.role === 'user' ? 'border-top-right-radius: 2px;' : 'border-top-left-radius: 2px;'} padding: 14px 18px; max-width: 85%;">
                  <div style="font-weight: 600; font-size: 0.8rem; color: ${m.role === 'user' ? '#34D399' : '#A5B4FC'}; margin-bottom: 4px;">
                    ${m.role === 'user' ? 'You' : 'Career Assistant'}
                  </div>
                  <div style="color: var(--text-main); font-size: 0.9rem; line-height: 1.5; white-space: pre-wrap;">${escapeHtml(m.content)}</div>
                </div>
              </div>
            `
              )
              .join('')}

          </div>

          <!-- Chat Input Form -->
          <div style="border-top: 1px solid var(--border-subtle); padding: 16px; background: rgba(15, 23, 42, 0.4);">
            <form id="assistantForm" action="/assistant/message" method="POST" style="display: flex; gap: 10px; margin: 0;">
              <input 
                type="text" 
                name="message" 
                id="messageInput"
                class="form-control" 
                placeholder="Ask a question or say: 'I'm looking for backend jobs with remote options and at least ₹10 LPA'..." 
                required 
                autocomplete="off"
                style="flex: 1; min-height: 44px; padding: 10px 14px; background: var(--bg-surface-elevated); border: 1px solid var(--border-muted); border-radius: var(--radius-sm); color: var(--text-main); font-size: 0.925rem;"
              >
              <button 
                type="submit" 
                class="btn btn-primary" 
                id="sendButton"
                data-loading-text="Thinking..."
                style="min-width: 100px; min-height: 44px; font-weight: 600;"
              >
                Send
              </button>
            </form>
          </div>

        </div>

      </div>

      <!-- Right Sidebar: Quick Actions & Guardrails Guide -->
      <div>
        
        <!-- Quick Action Prompts Card -->
        <div class="card" style="background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: 18px; margin-bottom: 20px;">
          <h3 style="font-size: 0.95rem; font-weight: 600; color: var(--text-main); margin: 0 0 12px; display: flex; align-items: center; gap: 6px;">
            ${renderIcon('zap', { size: 16, style: 'color: #FBBF24;' })}
            <span>Quick Inquiries</span>
          </h3>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <button class="quick-btn" onclick="setQuery('Check my application readiness and missing fields')" style="text-align: left; background: var(--bg-surface-elevated); border: 1px solid var(--border-subtle); border-radius: 6px; padding: 8px 12px; color: var(--text-main); font-size: 0.825rem; cursor: pointer; transition: all 0.15s ease; display: flex; align-items: center; gap: 6px;">
              ${renderIcon('clipboard', { size: 14 })}
              <span>Check my application readiness</span>
            </button>
            <button class="quick-btn" onclick="setQuery('Explain why notice period is needed in profile')" style="text-align: left; background: var(--bg-surface-elevated); border: 1px solid var(--border-subtle); border-radius: 6px; padding: 8px 12px; color: var(--text-main); font-size: 0.825rem; cursor: pointer; transition: all 0.15s ease; display: flex; align-items: center; gap: 6px;">
              ${renderIcon('helpCircle', { size: 14 })}
              <span>Explain notice period field</span>
            </button>
            <button class="quick-btn" onclick="setQuery('Check if I have any profile conflicts')" style="text-align: left; background: var(--bg-surface-elevated); border: 1px solid var(--border-subtle); border-radius: 6px; padding: 8px 12px; color: var(--text-main); font-size: 0.825rem; cursor: pointer; transition: all 0.15s ease; display: flex; align-items: center; gap: 6px;">
              ${renderIcon('alertTriangle', { size: 14, style: 'color: #F87171;' })}
              <span>Check for profile conflicts</span>
            </button>
            <button class="quick-btn" onclick="setQuery('I\'m looking for backend jobs with remote options and at least ₹10 LPA.')" style="text-align: left; background: var(--bg-surface-elevated); border: 1px solid var(--border-subtle); border-radius: 6px; padding: 8px 12px; color: var(--text-main); font-size: 0.825rem; cursor: pointer; transition: all 0.15s ease; display: flex; align-items: center; gap: 6px;">
              ${renderIcon('target', { size: 14, style: 'color: #34D399;' })}
              <span>Update job preferences (₹10 LPA)</span>
            </button>
          </div>
        </div>

        <!-- Safe AI Operating Invariants Card -->
        <div class="card" style="background: rgba(15, 23, 42, 0.6); border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: 18px;">
          <h3 style="font-size: 0.9rem; font-weight: 600; color: #A5B4FC; margin: 0 0 10px; display: flex; align-items: center; gap: 6px;">
            ${renderIcon('shield', { size: 16, style: 'color: #818CF8;' })}
            <span>AI Safety Guarantees</span>
          </h3>
          <ul style="margin: 0; padding-left: 18px; font-size: 0.8rem; color: var(--text-muted); line-height: 1.6;">
            <li><strong>Zero Fabrication:</strong> AI never invents skills, metrics, or credentials.</li>
            <li><strong>No Silent Updates:</strong> Profile changes require your explicit review and confirmation.</li>
            <li><strong>No Auto-Apply:</strong> AI will never submit job applications on your behalf.</li>
            <li><strong>Conflict Honesty:</strong> Discrepancies are reported for you to resolve.</li>
            <li><strong>Portal Resilience:</strong> The portal remains 100% usable if AI is unavailable.</li>
          </ul>
        </div>

      </div>

    </div>

  </div>

  <script>
    function setQuery(text) {
      const input = document.getElementById('messageInput');
      if (input) {
        input.value = text;
        input.focus();
      }
    }

    // Scroll chat to bottom
    const chatContainer = document.getElementById('chatMessages');
    if (chatContainer) {
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }
  </script>
  `;

  return renderLayout({
    title: 'AI Career Assistant',
    content,
    activeNav: 'assistant',
    user,
    description:
      'Safe, evidence-grounded AI Career Assistant for application readiness, profile explanations, and preference updates.',
  });
}

export default renderAssistantPage;
