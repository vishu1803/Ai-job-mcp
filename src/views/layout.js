/**
 * @file Base HTML Layout Template for Career Hub Web Application.
 *
 * Provides responsive dark-mode styling, glassmorphic design system tokens,
 * navigation headers, and accessibility compliant markup.
 */

import { escapeHtml } from '../utils/html-escaper.js';
import { renderIcon } from './components/icons.js';
import { renderCopilotDrawer } from './components/copilot-drawer.js';

/**
 * Renders the base HTML layout wrapping page content.
 *
 * @param {object} params
 * @param {string} params.title Page title
 * @param {string} params.content Inner HTML content
 * @param {string} [params.activeNav=''] Active navigation item
 * @param {object|null} [params.user=null] Authenticated user object if logged in
 * @param {string} [params.description=''] Meta description
 * @returns {string} Full HTML document
 */
export function renderLayout({
  title,
  content,
  activeNav = '',
  user = null,
  description = 'Evidence-backed AI career intelligence platform anchored in authentic repository code.',
}) {
  const safeTitle = escapeHtml(title);
  const safeDesc = escapeHtml(description);
  const userLoggedIn = Boolean(user && user.id);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTitle} | AI Careers Hub</title>
  <meta name="description" content="${safeDesc}">
  <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect width=%22100%22 height=%22100%22 rx=%2224%22 fill=%22%236366F1%22/><text y=%2268%22 x=%2250%22 text-anchor=%22middle%22 font-size=%2252%22 font-weight=%22800%22 font-family=%22Inter, sans-serif%22 fill=%22white%22>AI</text></svg>">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" media="print" onload="this.media='all'">
  <noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap"></noscript>
  <link rel="stylesheet" href="/public/css/app.css">
</head>
<body>
  <div id="nav-progress-bar" aria-hidden="true"></div>
  <header class="navbar">
    <div class="container nav-inner">
      <a href="/" class="brand">
        <div class="brand-icon">AI</div>
        <span>Career Hub</span>
        <span class="brand-badge">${process.env.NODE_ENV === 'production' ? 'PROD' : process.env.NODE_ENV === 'staging' ? 'STAGING' : 'DEV'}</span>
      </a>

      <nav>
        <ul class="nav-links">
          ${
            userLoggedIn
              ? `
          <li><a href="/dashboard" class="nav-link ${activeNav === 'dashboard' ? 'active' : ''}">Dashboard</a></li>
          <li><a href="/apps/radar" class="nav-link ${activeNav === 'radar' ? 'active' : ''}">Jobs</a></li>
          <li><a href="/applications" class="nav-link ${activeNav === 'applications' ? 'active' : ''}">Applications</a></li>
          <li><a href="/profile" class="nav-link ${activeNav === 'profile' ? 'active' : ''}">Profile</a></li>
          <li><a href="/sources" class="nav-link ${activeNav === 'sources' ? 'active' : ''}">Sources</a></li>
          `
              : `
          <li><a href="/" class="nav-link ${activeNav === 'home' ? 'active' : ''}">Overview</a></li>
          <li><a href="/docs/mcp" class="nav-link ${activeNav === 'docs' ? 'active' : ''}">MCP Docs</a></li>
          `
          }
        </ul>
      </nav>

      <div class="nav-actions">
        <!-- Mobile hamburger -->
        <button class="nav-mobile-toggle" id="mobileNavToggle" aria-label="Open navigation menu" aria-expanded="false">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
        </button>
        ${
          userLoggedIn
            ? `
          <button type="button" class="copilot-nav-btn" id="copilotOpenBtn" onclick="window.toggleCopilotDrawer && window.toggleCopilotDrawer(true, this)" aria-label="Open Career Copilot" title="Open Career Copilot">
            ${renderIcon('sparkles', { size: 15 })}
            <span>Copilot</span>
          </button>
          <div class="user-dropdown" id="userDropdown">
            <button class="user-dropdown-btn" aria-haspopup="true" aria-expanded="false" title="Account Menu">
              <div class="user-avatar-badge">${escapeHtml((user.displayName || user.email || 'U').charAt(0).toUpperCase())}</div>
              <span style="max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                ${escapeHtml(user.displayName || user.email || 'My Account')}
              </span>
              <span class="chevron-icon" style="display:inline-flex; align-items:center; margin-left:4px;">${renderIcon('chevronDown', { size: 14 })}</span>
            </button>
            <div class="user-dropdown-menu">
              <div class="user-dropdown-header">
                <div class="user-dropdown-name">${escapeHtml(user.displayName || 'Candidate')}</div>
                <div class="user-dropdown-email">${escapeHtml(user.email || '')}</div>
              </div>
              <a href="/connect" class="nav-dropdown-item ${activeNav === 'connect' ? 'active' : ''}">
                <span class="nav-icon" style="display:inline-flex; align-items:center; justify-content:center; width:20px; height:20px; color:var(--text-muted);">${renderIcon('tokens', { size: 16 })}</span>
                <div class="item-text">
                  <div class="item-title">AI Connect</div>
                  <div class="item-desc">MCP personal tokens</div>
                </div>
              </a>
              <a href="/projects" class="nav-dropdown-item ${activeNav === 'projects' ? 'active' : ''}">
                <span class="nav-icon" style="display:inline-flex; align-items:center; justify-content:center; width:20px; height:20px; color:var(--text-muted);">${renderIcon('radar', { size: 16 })}</span>
                <div class="item-text">
                  <div class="item-title">Projects</div>
                  <div class="item-desc">Codebase portfolio</div>
                </div>
              </a>
              <a href="/skills" class="nav-dropdown-item ${activeNav === 'skills' ? 'active' : ''}">
                <span class="nav-icon" style="display:inline-flex; align-items:center; justify-content:center; width:20px; height:20px; color:var(--text-muted);">${renderIcon('check', { size: 16 })}</span>
                <div class="item-text">
                  <div class="item-title">Skills</div>
                  <div class="item-desc">Verified skills taxonomy</div>
                </div>
              </a>
              <a href="/resumes" class="nav-dropdown-item ${activeNav === 'resumes' ? 'active' : ''}">
                <span class="nav-icon" style="display:inline-flex; align-items:center; justify-content:center; width:20px; height:20px; color:var(--text-muted);">${renderIcon('resumes', { size: 16 })}</span>
                <div class="item-text">
                  <div class="item-title">Resumes</div>
                  <div class="item-desc">Resume archive & uploads</div>
                </div>
              </a>
              <a href="/settings" class="nav-dropdown-item ${activeNav === 'settings' ? 'active' : ''}">
                <span class="nav-icon" style="display:inline-flex; align-items:center; justify-content:center; width:20px; height:20px; color:var(--text-muted);">${renderIcon('settings', { size: 16 })}</span>
                <div class="item-text">
                  <div class="item-title">Settings & Privacy</div>
                  <div class="item-desc">Account & GDPR controls</div>
                </div>
              </a>
              <a href="/docs/mcp" class="nav-dropdown-item ${activeNav === 'docs' ? 'active' : ''}">
                <span class="nav-icon" style="display:inline-flex; align-items:center; justify-content:center; width:20px; height:20px; color:var(--text-muted);">${renderIcon('docs', { size: 16 })}</span>
                <div class="item-text">
                  <div class="item-title">MCP Docs</div>
                  <div class="item-desc">MCP tool reference</div>
                </div>
              </a>
              <div class="user-dropdown-divider"></div>
              <form action="/auth/logout" method="POST" style="margin: 0;">
                <button type="submit" class="logout-form-btn">
                  <span style="display:inline-flex; align-items:center; margin-right:8px;">${renderIcon('logout', { size: 16 })}</span>
                  <span>Sign Out</span>
                </button>
              </form>
            </div>
          </div>
          `
            : `
          <a href="/login" class="btn btn-primary btn-sm">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
            <span>Sign In</span>
          </a>
          `
        }
      </div>
    </div>
  </header>

  <main>
    ${content}
  </main>

  <div class="nav-mobile-menu" id="mobileNavMenu" role="dialog" aria-label="Mobile navigation">
    ${
      userLoggedIn
        ? `
      <div class="mobile-section-label">Workspace</div>
      <button type="button" class="copilot-nav-btn" onclick="window.toggleCopilotDrawer && window.toggleCopilotDrawer(true, this); document.getElementById('mobileNavToggle')?.click();" style="width: calc(100% - 28px); margin: 6px 14px 10px; justify-content: center; padding: 10px 14px;">
        ${renderIcon('sparkles', { size: 16 })} <span>Open Career Copilot</span>
      </button>
      <a href="/dashboard" class="${activeNav === 'dashboard' ? 'active' : ''}">${renderIcon('dashboard', { size: 18 })} <span>Dashboard</span></a>
      <a href="/apps/radar" class="${activeNav === 'radar' ? 'active' : ''}">${renderIcon('jobs', { size: 18 })} <span>Jobs</span></a>
      <a href="/applications" class="${activeNav === 'applications' ? 'active' : ''}">${renderIcon('applications', { size: 18 })} <span>Applications</span></a>
      <a href="/profile" class="${activeNav === 'profile' ? 'active' : ''}">${renderIcon('profile', { size: 18 })} <span>Profile</span></a>
      <a href="/sources" class="${activeNav === 'sources' ? 'active' : ''}">${renderIcon('sources', { size: 18 })} <span>Sources</span></a>
      <div class="nav-mobile-divider"></div>
      <div class="mobile-section-label">Account & System</div>
      <a href="/connect" class="${activeNav === 'connect' ? 'active' : ''}">${renderIcon('tokens', { size: 18 })} <span>API Tokens</span></a>
      <a href="/settings" class="${activeNav === 'settings' ? 'active' : ''}">${renderIcon('settings', { size: 18 })} <span>Settings</span></a>
      <a href="/docs/mcp" class="${activeNav === 'docs' ? 'active' : ''}">${renderIcon('docs', { size: 18 })} <span>MCP Docs</span></a>
      <form action="/auth/logout" method="POST" style="margin-top: 0.5rem;">
        <button type="submit" class="logout-form-btn">${renderIcon('logout', { size: 18 })} <span>Sign Out</span></button>
      </form>
    `
        : `
      <a href="/" class="${activeNav === 'home' ? 'active' : ''}">${renderIcon('dashboard', { size: 18 })} <span>Overview</span></a>
      <a href="/docs/mcp" class="${activeNav === 'docs' ? 'active' : ''}">${renderIcon('docs', { size: 18 })} <span>MCP Docs</span></a>
      <a href="/privacy" class="${activeNav === 'privacy' ? 'active' : ''}">${renderIcon('shield', { size: 18 })} <span>Privacy Notice</span></a>
      <a href="/terms" class="${activeNav === 'terms' ? 'active' : ''}">${renderIcon('docs', { size: 18 })} <span>Terms of Service</span></a>
      <a href="/login" class="btn btn-primary" style="margin-top:12px; text-align:center;">Sign In with GitHub</a>
    `
    }
  </div>

  <footer>
    <div class="container footer-inner" style="flex-direction: column; gap: 1.5rem; padding: 2.5rem 1.5rem 2rem;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 2rem; width: 100%;">
        <div>
          <p style="font-size: 1.05rem; font-weight: 700; color: #f8fafc;">AI Careers Hub</p>
          <p style="margin-top: 4px; font-size: 0.85rem; color: var(--text-dim); max-width: 450px; line-height: 1.5;">
            Universal Model Context Protocol (MCP) Server for evidence-grounded career intelligence & seamless AI agent orchestration.
          </p>
        </div>
        <div style="display: flex; flex-wrap: wrap; gap: 3rem;">
          <div>
            <span style="font-size: 0.8rem; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 0.6rem;">Platform</span>
            <ul style="list-style: none; display: flex; flex-direction: column; gap: 0.4rem; font-size: 0.85rem; padding: 0;">
              <li><a href="/dashboard">Dashboard</a></li>
              <li><a href="/profile">Career Intent</a></li>
              <li><a href="/docs/mcp">MCP Protocol</a></li>
              <li><a href="/healthz">Health Status</a></li>
            </ul>
          </div>
          <div>
            <span style="font-size: 0.8rem; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 0.6rem;">Privacy & Legal</span>
            <ul style="list-style: none; display: flex; flex-direction: column; gap: 0.4rem; font-size: 0.85rem; padding: 0;">
              <li><a href="/privacy">Privacy Notice</a></li>
              <li><a href="/terms">Terms of Service</a></li>
              <li><a href="/cookies">Cookie Policy</a></li>
              <li><a href="/security">Security Architecture</a></li>
              <li><a href="/data-deletion">Data Deletion</a></li>
              <li><a href="/accessibility">Accessibility</a></li>
              <li><a href="/subprocessors">Subprocessors</a></li>
            </ul>
          </div>
        </div>
      </div>
      <div style="border-top: 1px solid var(--border-subtle); padding-top: 1rem; width: 100%; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem; font-size: 0.8rem; color: #64748b;">
        <span>© 2026 AI Careers Hub. Zero-hallucination evidence model.</span>
        <a href="https://github.com/vishu1803/Ai-job-mcp" target="_blank" rel="noopener" style="color: #94a3b8;">GitHub Repository</a>
      </div>
    </div>
  </footer>

  <!-- Global Portal State Elements -->
  <div class="portal-offline-banner" id="portalOfflineBanner" role="status" aria-live="assertive">
    <span style="display:inline-flex; align-items:center; gap:8px;">
      ${renderIcon('alertTriangle', { size: 16 })}
      <span>You are currently offline. Changes will not be saved until connection is restored.</span>
    </span>
    <button type="button" onclick="window.location.reload()" style="background:rgba(255,255,255,0.2); border:1px solid rgba(255,255,255,0.4); color:#fff; border-radius:4px; padding:2px 8px; font-size:0.75rem; cursor:pointer;">
      Retry
    </button>
  </div>
  <div class="portal-toast-container" id="portalToastContainer" role="status" aria-live="polite"></div>

  <script src="/public/js/app.js" defer></script>
  ${userLoggedIn ? renderCopilotDrawer({ pageContext: activeNav }) : ''}
</body>
</html>`;
}
