/**
 * @file Base HTML Layout Template for Career Hub Web Application.
 *
 * Provides responsive dark-mode styling, glassmorphic design system tokens,
 * navigation headers, and accessibility compliant markup.
 */

import { escapeHtml } from '../utils/html-escaper.js';

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
  <title>${safeTitle} | Antigravity Career Hub</title>
  <meta name="description" content="${safeDesc}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-primary: #0B0F19;
      --bg-secondary: #111827;
      --bg-card: rgba(17, 24, 39, 0.75);
      --bg-glass: rgba(31, 41, 55, 0.55);
      --border-subtle: rgba(255, 255, 255, 0.08);
      --border-focus: rgba(99, 102, 241, 0.4);
      --text-main: #F9FAFB;
      --text-muted: #9CA3AF;
      --text-dim: #6B7280;
      --accent-indigo: #6366F1;
      --accent-indigo-hover: #4F46E5;
      --accent-cyan: #06B6D4;
      --accent-emerald: #10B981;
      --accent-amber: #F59E0B;
      --accent-rose: #F43F5E;
      --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      --font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, monospace;
      --radius-sm: 6px;
      --radius-md: 10px;
      --radius-lg: 16px;
      --radius-full: 9999px;
      --shadow-card: 0 10px 30px -10px rgba(0, 0, 0, 0.5);
      --shadow-glow: 0 0 25px rgba(99, 102, 241, 0.25);
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background-color: var(--bg-primary);
      background-image: 
        radial-gradient(circle at 15% 15%, rgba(99, 102, 241, 0.08) 0%, transparent 40%),
        radial-gradient(circle at 85% 85%, rgba(6, 182, 212, 0.06) 0%, transparent 45%);
      background-attachment: fixed;
      color: var(--text-main);
      font-family: var(--font-sans);
      line-height: 1.6;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      -webkit-font-smoothing: antialiased;
    }

    a {
      color: var(--accent-indigo);
      text-decoration: none;
      transition: color 0.15s ease, opacity 0.15s ease;
    }
    a:hover {
      color: #818CF8;
    }

    .container {
      width: 100%;
      max-width: 1200px;
      margin: 0 auto;
      padding: 0 24px;
    }

    /* Navbar */
    .navbar {
      background: rgba(11, 15, 25, 0.85);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--border-subtle);
      position: sticky;
      top: 0;
      z-index: 100;
    }
    .nav-inner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 72px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      font-weight: 700;
      font-size: 1.15rem;
      color: var(--text-main);
      letter-spacing: -0.02em;
    }
    .brand-badge {
      font-size: 0.7rem;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: var(--radius-full);
      background: rgba(99, 102, 241, 0.15);
      color: var(--accent-indigo);
      border: 1px solid rgba(99, 102, 241, 0.3);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .brand-icon {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      background: linear-gradient(135deg, var(--accent-indigo), var(--accent-cyan));
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      color: #FFF;
      font-size: 0.95rem;
    }
    .nav-links {
      display: flex;
      align-items: center;
      gap: 12px;
      list-style: none;
    }
    .nav-link {
      color: var(--text-muted);
      font-size: 0.9rem;
      font-weight: 500;
      padding: 6px 12px;
      border-radius: var(--radius-sm);
      transition: all 0.15s ease;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .nav-link:hover, .nav-link.active {
      color: var(--text-main);
      background: rgba(255, 255, 255, 0.05);
    }
    .nav-link.active {
      color: #818CF8;
      background: rgba(99, 102, 241, 0.1);
    }

    /* Dropdown Menus */
    .nav-dropdown {
      position: relative;
    }
    .nav-dropdown-btn {
      background: transparent;
      border: none;
      color: var(--text-muted);
      font-family: inherit;
      font-size: 0.9rem;
      font-weight: 500;
      padding: 6px 12px;
      border-radius: var(--radius-sm);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s ease;
    }
    .nav-dropdown-btn:hover,
    .nav-dropdown-btn.active,
    .nav-dropdown:hover .nav-dropdown-btn,
    .nav-dropdown:focus-within .nav-dropdown-btn {
      color: var(--text-main);
      background: rgba(255, 255, 255, 0.06);
    }
    .nav-dropdown-btn.active {
      color: #818CF8;
      background: rgba(99, 102, 241, 0.1);
    }
    .nav-chevron {
      font-size: 0.75rem;
      opacity: 0.7;
      transition: transform 0.2s ease;
    }
    .nav-dropdown:hover .nav-chevron,
    .nav-dropdown:focus-within .nav-chevron {
      transform: translateY(1px);
    }
    .nav-dropdown-menu {
      position: absolute;
      top: calc(100% + 6px);
      left: 0;
      min-width: 220px;
      background: #111827;
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      box-shadow: 0 12px 30px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.05);
      padding: 6px;
      display: none;
      flex-direction: column;
      gap: 2px;
      z-index: 200;
    }
    .nav-dropdown:hover .nav-dropdown-menu,
    .nav-dropdown:focus-within .nav-dropdown-menu {
      display: flex;
    }
    .nav-dropdown-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 12px;
      border-radius: var(--radius-sm);
      color: var(--text-muted);
      font-size: 0.875rem;
      font-weight: 500;
      text-decoration: none;
      transition: background 0.15s ease, color 0.15s ease;
    }
    .nav-dropdown-item:hover, .nav-dropdown-item.active {
      background: rgba(99, 102, 241, 0.15);
      color: #F8FAFC;
    }
    .nav-dropdown-item .item-icon {
      font-size: 1rem;
    }
    .nav-dropdown-item .item-text {
      display: flex;
      flex-direction: column;
    }
    .nav-dropdown-item .item-title {
      font-weight: 500;
      color: #F8FAFC;
    }
    .nav-dropdown-item .item-desc {
      font-size: 0.725rem;
      color: var(--text-dim);
    }

    /* User Account Dropdown */
    .user-dropdown {
      position: relative;
    }
    .user-dropdown-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      background: var(--bg-glass);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-full);
      padding: 4px 12px 4px 6px;
      color: var(--text-main);
      font-family: inherit;
      font-size: 0.85rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
    }
    .user-dropdown-btn:hover,
    .user-dropdown:hover .user-dropdown-btn,
    .user-dropdown:focus-within .user-dropdown-btn {
      background: rgba(255, 255, 255, 0.08);
      border-color: rgba(255, 255, 255, 0.2);
    }
    .user-avatar-badge {
      width: 26px;
      height: 26px;
      border-radius: 50%;
      background: linear-gradient(135deg, var(--accent-indigo), var(--accent-cyan));
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.75rem;
      font-weight: 700;
      color: #FFF;
    }
    .user-dropdown-menu {
      position: absolute;
      top: calc(100% + 6px);
      right: 0;
      left: auto;
      min-width: 230px;
    }
    .user-dropdown-header {
      padding: 10px 12px;
      border-bottom: 1px solid var(--border-subtle);
      margin-bottom: 4px;
    }
    .user-dropdown-name {
      font-weight: 600;
      font-size: 0.875rem;
      color: #F8FAFC;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .user-dropdown-email {
      font-size: 0.75rem;
      color: var(--text-dim);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-top: 2px;
    }
    .user-dropdown-divider {
      height: 1px;
      background: var(--border-subtle);
      margin: 4px 0;
    }
    .logout-form-btn {
      width: 100%;
      background: none;
      border: none;
      text-align: left;
      color: #F87171;
      font-family: inherit;
      font-size: 0.875rem;
      font-weight: 500;
      padding: 8px 12px;
      border-radius: var(--radius-sm);
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 10px;
      transition: background 0.15s ease;
    }
    .logout-form-btn:hover {
      background: rgba(239, 68, 68, 0.12);
      color: #FCA5A5;
    }

    .nav-actions {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    /* Buttons */
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 9px 18px;
      font-size: 0.9rem;
      font-weight: 600;
      border-radius: var(--radius-md);
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      border: 1px solid transparent;
      text-decoration: none;
    }
    .btn-primary {
      background: linear-gradient(135deg, #6366F1 0%, #4F46E5 100%);
      color: #FFFFFF;
      box-shadow: 0 4px 14px rgba(99, 102, 241, 0.35);
    }
    .btn-primary:hover {
      background: linear-gradient(135deg, #4F46E5 0%, #4338CA 100%);
      box-shadow: 0 6px 20px rgba(99, 102, 241, 0.5);
      color: #FFF;
      transform: translateY(-1px);
    }
    .btn-secondary {
      background: var(--bg-glass);
      color: var(--text-main);
      border: 1px solid var(--border-subtle);
    }
    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.08);
      border-color: rgba(255, 255, 255, 0.2);
      color: #FFF;
    }
    .btn-sm {
      padding: 6px 12px;
      font-size: 0.8rem;
    }

    /* Cards */
    .card {
      background: var(--bg-card);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-lg);
      padding: 24px;
      box-shadow: var(--shadow-card);
    }

    /* Badges */
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 10px;
      border-radius: var(--radius-full);
      font-size: 0.75rem;
      font-weight: 600;
      letter-spacing: 0.02em;
    }
    .badge-verified {
      background: rgba(16, 185, 129, 0.15);
      color: #34D399;
      border: 1px solid rgba(16, 185, 129, 0.3);
    }
    .badge-inferred {
      background: rgba(6, 182, 212, 0.15);
      color: #22D3EE;
      border: 1px solid rgba(6, 182, 212, 0.3);
    }
    .badge-claimed {
      background: rgba(245, 158, 11, 0.15);
      color: #FBBF24;
      border: 1px solid rgba(245, 158, 11, 0.3);
    }
    .badge-missing {
      background: rgba(244, 63, 94, 0.15);
      color: #FB7185;
      border: 1px solid rgba(244, 63, 94, 0.3);
    }
    .badge-cyan {
      background: rgba(6, 182, 212, 0.15);
      color: #22D3EE;
      border: 1px solid rgba(6, 182, 212, 0.3);
    }
    .badge-indigo {
      background: rgba(99, 102, 241, 0.15);
      color: #818CF8;
      border: 1px solid rgba(99, 102, 241, 0.3);
    }
    .badge-amber {
      background: rgba(245, 158, 11, 0.15);
      color: #FBBF24;
      border: 1px solid rgba(245, 158, 11, 0.3);
    }

    /* Form Controls */
    .form-group {
      margin-bottom: 20px;
    }
    .form-label {
      display: block;
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--text-main);
      margin-bottom: 8px;
    }
    .form-control, .form-select, .form-textarea {
      width: 100%;
      background: rgba(11, 15, 25, 0.7);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      padding: 10px 14px;
      font-size: 0.925rem;
      color: var(--text-main);
      font-family: var(--font-sans);
      transition: all 0.2s ease;
      outline: none;
    }
    .form-control:focus, .form-select:focus, .form-textarea:focus {
      border-color: var(--accent-indigo);
      box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2);
    }
    .form-hint {
      font-size: 0.8rem;
      color: var(--text-dim);
      margin-top: 6px;
    }

    /* Tables */
    .table-responsive {
      width: 100%;
      overflow-x: auto;
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      background: rgba(11, 15, 25, 0.4);
    }
    .data-table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 0.9rem;
    }
    .data-table th {
      padding: 12px 16px;
      background: rgba(255, 255, 255, 0.03);
      color: var(--text-muted);
      font-weight: 600;
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      border-bottom: 1px solid var(--border-subtle);
    }
    .data-table td {
      padding: 14px 16px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      color: var(--text-main);
      vertical-align: middle;
    }
    .data-table tr:last-child td {
      border-bottom: none;
    }
    .data-table tr:hover td {
      background: rgba(255, 255, 255, 0.02);
    }

    /* Metric Cards */
    .stat-card {
      background: var(--bg-card);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      transition: transform 0.2s ease, border-color 0.2s ease;
    }
    .stat-card:hover {
      transform: translateY(-2px);
      border-color: rgba(99, 102, 241, 0.4);
    }
    .stat-val {
      font-size: 1.85rem;
      font-weight: 800;
      color: var(--text-main);
      line-height: 1.2;
    }
    .stat-label {
      font-size: 0.8rem;
      color: var(--text-muted);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    /* Stepper */
    .stepper {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 32px;
      position: relative;
    }
    .step-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      flex: 1;
      text-align: center;
      position: relative;
    }
    .step-badge {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--border-subtle);
      color: var(--text-muted);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 0.85rem;
      transition: all 0.2s ease;
    }
    .step-badge.active {
      background: var(--accent-indigo);
      border-color: var(--accent-indigo);
      color: #FFF;
      box-shadow: 0 0 15px rgba(99, 102, 241, 0.5);
    }
    .step-badge.completed {
      background: rgba(16, 185, 129, 0.2);
      border-color: var(--accent-emerald);
      color: var(--accent-emerald);
    }
    .step-title {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--text-muted);
    }
    .step-title.active {
      color: var(--text-main);
    }

    /* Main Content */
    main {
      flex: 1;
      padding: 40px 0 60px;
    }

    /* Footer */
    footer {
      border-top: 1px solid var(--border-subtle);
      background: rgba(11, 15, 25, 0.95);
      padding: 32px 0;
      color: var(--text-dim);
      font-size: 0.875rem;
      margin-top: auto;
    }
    .footer-inner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 16px;
    }
    .footer-links {
      display: flex;
      gap: 20px;
      list-style: none;
    }
    .footer-links a {
      color: var(--text-dim);
      font-size: 0.85rem;
    }
    .footer-links a:hover {
      color: var(--text-main);
    }

    /* Code styling */
    code, pre {
      font-family: var(--font-mono);
    }
    code {
      background: rgba(0, 0, 0, 0.3);
      padding: 2px 6px;
      border-radius: var(--radius-sm);
      font-size: 0.85em;
      border: 1px solid var(--border-subtle);
      color: #E0E7FF;
    }

    /* Responsive */
    @media (max-width: 768px) {
      .nav-links {
        display: none;
      }
      .nav-inner {
        height: 64px;
      }
    }
  </style>
</head>
<body>
  <header class="navbar">
    <div class="container nav-inner">
      <a href="/" class="brand">
        <div class="brand-icon">AG</div>
        <span>Career Hub</span>
        <span class="brand-badge">MCP</span>
      </a>

      <nav>
        <ul class="nav-links">
          <li><a href="/" class="nav-link ${activeNav === 'home' ? 'active' : ''}">Overview</a></li>
          ${
            userLoggedIn
              ? `
          <li class="nav-dropdown">
            <button class="nav-dropdown-btn ${['dashboard', 'projects', 'skills', 'applications'].includes(activeNav) ? 'active' : ''}" aria-expanded="false" aria-haspopup="true">
              <span>Career</span>
              <span class="nav-chevron">▾</span>
            </button>
            <div class="nav-dropdown-menu">
              <a href="/dashboard" class="nav-dropdown-item ${activeNav === 'dashboard' ? 'active' : ''}">
                <span class="item-icon">📊</span>
                <div class="item-text">
                  <div class="item-title">Dashboard</div>
                  <div class="item-desc">Overview & metrics</div>
                </div>
              </a>
              <a href="/projects" class="nav-dropdown-item ${activeNav === 'projects' ? 'active' : ''}">
                <span class="item-icon">💼</span>
                <div class="item-text">
                  <div class="item-title">Projects</div>
                  <div class="item-desc">Portfolio & code evidence</div>
                </div>
              </a>
              <a href="/skills" class="nav-dropdown-item ${activeNav === 'skills' ? 'active' : ''}">
                <span class="item-icon">⚡</span>
                <div class="item-text">
                  <div class="item-title">Skills</div>
                  <div class="item-desc">Verified taxonomy</div>
                </div>
              </a>
              <a href="/dashboard#applications" class="nav-dropdown-item">
                <span class="item-icon">🎯</span>
                <div class="item-text">
                  <div class="item-title">Applications</div>
                  <div class="item-desc">Pipeline tracking</div>
                </div>
              </a>
            </div>
          </li>

          <li class="nav-dropdown">
            <button class="nav-dropdown-btn ${['sources', 'resumes'].includes(activeNav) ? 'active' : ''}" aria-expanded="false" aria-haspopup="true">
              <span>Sources</span>
              <span class="nav-chevron">▾</span>
            </button>
            <div class="nav-dropdown-menu">
              <a href="/sources" class="nav-dropdown-item ${activeNav === 'sources' ? 'active' : ''}">
                <span class="item-icon">🔗</span>
                <div class="item-text">
                  <div class="item-title">Connected Sources</div>
                  <div class="item-desc">GitHub repositories</div>
                </div>
              </a>
              <a href="/resumes" class="nav-dropdown-item ${activeNav === 'resumes' ? 'active' : ''}">
                <span class="item-icon">📄</span>
                <div class="item-text">
                  <div class="item-title">Resumes</div>
                  <div class="item-desc">Upload & claim review</div>
                </div>
              </a>
            </div>
          </li>

          <li>
            <a href="/connect" class="nav-link ${activeNav === 'connect' ? 'active' : ''}">
              <span>AI Connect</span>
            </a>
          </li>
          `
              : ''
          }
          <li><a href="/docs/mcp" class="nav-link ${activeNav === 'docs' ? 'active' : ''}">MCP Docs</a></li>
        </ul>
      </nav>

      <div class="nav-actions">
        ${
          userLoggedIn
            ? `
          <div class="user-dropdown">
            <button class="user-dropdown-btn" aria-haspopup="true" aria-expanded="false" title="Account Menu">
              <div class="user-avatar-badge">${escapeHtml((user.displayName || user.email || 'U').charAt(0).toUpperCase())}</div>
              <span style="max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                ${escapeHtml(user.displayName || user.email || 'My Account')}
              </span>
              <span class="nav-chevron">▾</span>
            </button>
            <div class="user-dropdown-menu">
              <div class="user-dropdown-header">
                <div class="user-dropdown-name">${escapeHtml(user.displayName || 'Candidate')}</div>
                <div class="user-dropdown-email">${escapeHtml(user.email || '')}</div>
              </div>
              <a href="/settings" class="nav-dropdown-item ${activeNav === 'settings' ? 'active' : ''}">
                <span class="item-icon">⚙️</span>
                <div class="item-text">
                  <div class="item-title">Settings & Privacy</div>
                  <div class="item-desc">Account & GDPR controls</div>
                </div>
              </a>
              <div class="user-dropdown-divider"></div>
              <form action="/auth/logout" method="POST" style="margin: 0;">
                <button type="submit" class="logout-form-btn">
                  <span>🚪</span>
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

  <footer>
    <div class="container footer-inner">
      <div>
        <p><strong>Antigravity Career Hub</strong> — Universal Model Context Protocol (MCP) Server</p>
        <p style="margin-top:4px; font-size:0.8rem; color:var(--text-dim);">Evidence-grounded career intelligence & universal AI connectors.</p>
      </div>
      <ul class="footer-links">
        <li><a href="/docs/mcp">MCP Protocol</a></li>
        <li><a href="/healthz">Health Status</a></li>
        <li><a href="https://github.com/vishu1803/Ai-job-mcp" target="_blank" rel="noopener">GitHub</a></li>
      </ul>
    </div>
  </footer>
</body>
</html>`;
}
