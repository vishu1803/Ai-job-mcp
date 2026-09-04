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
  <title>${safeTitle} | AI Careers Hub</title>
  <meta name="description" content="${safeDesc}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      /* Palette Tokens (DESIGN.md §2.1) */
      --bg-canvas: #0B0F19;
      --bg-surface: #111827;
      --bg-surface-elevated: #1F2937;
      --bg-card: #111827;
      --bg-glass: rgba(17, 24, 39, 0.75);
      --bg-dim: #070E1D;
      --bg-primary: #0B0F19;
      --bg-secondary: #111827;

      /* Border Tokens */
      --border-subtle: rgba(255, 255, 255, 0.08);
      --border-muted: rgba(255, 255, 255, 0.14);
      --border-highlight: rgba(99, 102, 241, 0.3);
      --border-outline: #475569;
      --border-focus: #6366F1;

      /* Typography Tokens (DESIGN.md §2.1 & §2.4) */
      --text-main: #F9FAFB;
      --text-secondary: #E2E8F0;
      --text-muted: #94A3B8;
      --text-dim: #64748B;
      --text-primary: #F9FAFB;

      /* Brand & Semantic Accents */
      --accent-indigo: #6366F1;
      --accent-indigo-hover: #4F46E5;
      --accent-primary: #6366F1;
      --accent-emerald: #10B981;
      --accent-teal: #14B8A6;
      --accent-cyan: #06B6D4;
      --accent-amber: #F59E0B;
      --accent-rose: #F43F5E;
      --accent-purple: #A855F7;

      /* Font Families */
      --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      --font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, monospace;

      /* Radii (DESIGN.md §2.5) */
      --radius-xs: 4px;
      --radius-sm: 6px;
      --radius-md: 8px;
      --radius-lg: 12px;
      --radius-xl: 16px;
      --radius-full: 9999px;

      /* Shadows & Elevations */
      --shadow-card: 0 4px 20px -2px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.05);
      --shadow-dropdown: 0 16px 36px -4px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.08);
      --shadow-glow: 0 0 25px rgba(99, 102, 241, 0.25);
      --shadow-glow-emerald: 0 0 20px rgba(16, 185, 129, 0.2);
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background-color: var(--bg-primary);
      color: var(--text-main);
      font-family: var(--font-sans);
      line-height: 1.6;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      -webkit-font-smoothing: antialiased;
    }

    h1 {
      font-size: 1.625rem;
      line-height: 2.125rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      color: var(--text-main);
    }
    h2 {
      font-size: 1.25rem;
      line-height: 1.75rem;
      font-weight: 600;
      letter-spacing: -0.015em;
      color: var(--text-main);
    }
    h3 {
      font-size: 1rem;
      line-height: 1.5rem;
      font-weight: 600;
      letter-spacing: -0.01em;
      color: var(--text-main);
    }
    p {
      color: var(--text-secondary);
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
      border: 1px solid transparent;
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
    .nav-dropdown.open .nav-dropdown-btn {
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
    .nav-dropdown.open .nav-chevron,
    .user-dropdown.open .nav-chevron {
      transform: rotate(180deg);
    }
    .nav-dropdown-menu {
      position: absolute;
      top: calc(100% + 6px);
      left: 0;
      min-width: 220px;
      background: var(--bg-surface);
      border: 1px solid var(--border-muted);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-dropdown);
      padding: 6px;
      display: none;
      flex-direction: column;
      gap: 2px;
      z-index: 200;
    }
    .nav-dropdown.open .nav-dropdown-menu {
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
    .user-dropdown.open .user-dropdown-btn {
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
      background: var(--bg-surface);
      border: 1px solid var(--border-muted);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-dropdown);
      padding: 6px;
      display: none;
      flex-direction: column;
      gap: 2px;
      z-index: 200;
    }
    .user-dropdown.open .user-dropdown-menu {
      display: flex;
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

    /* Contextual Back Navigation & Breadcrumbs */
    .back-nav-link {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 0.85rem;
      color: var(--text-muted);
      text-decoration: none;
      margin-bottom: 16px;
      transition: color 0.15s ease, transform 0.15s ease;
      font-weight: 500;
    }
    .back-nav-link:hover {
      color: var(--text-main);
      transform: translateX(-2px);
    }
    .breadcrumb {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.825rem;
      color: var(--text-dim);
      margin-bottom: 16px;
      flex-wrap: wrap;
    }
    .breadcrumb a {
      color: var(--text-muted);
      text-decoration: none;
      transition: color 0.15s;
    }
    .breadcrumb a:hover {
      color: var(--text-main);
    }
    .breadcrumb .separator {
      color: var(--text-dim);
      opacity: 0.6;
    }
    .breadcrumb .current {
      color: var(--text-main);
      font-weight: 600;
    }

    /* Visual Architecture Pipeline Flow */
    .pipeline-banner {
      background: rgba(17, 24, 39, 0.65);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      padding: 16px 20px;
      margin-bottom: 24px;
    }
    .pipeline-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
      flex-wrap: wrap;
      gap: 8px;
    }
    .pipeline-title {
      font-size: 0.775rem;
      font-weight: 700;
      color: var(--accent-indigo);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .pipeline-steps {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .pipeline-step {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(31, 41, 55, 0.6);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-sm);
      padding: 4px 10px;
      font-size: 0.775rem;
      color: var(--text-muted);
      font-weight: 500;
    }
    .pipeline-step.active {
      background: rgba(99, 102, 241, 0.15);
      border-color: rgba(99, 102, 241, 0.35);
      color: #C7D2FE;
      font-weight: 600;
    }
    .pipeline-arrow {
      color: var(--text-dim);
      font-size: 0.75rem;
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
      padding: 8px 16px;
      font-size: 0.875rem;
      font-weight: 600;
      line-height: 1.25;
      border-radius: var(--radius-md);
      cursor: pointer;
      transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
      border: 1px solid transparent;
      text-decoration: none;
      font-family: inherit;
    }
    .btn-primary {
      background: #6366F1;
      color: #FFFFFF;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.15);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    .btn-primary:hover {
      background: #4F46E5;
      color: #FFFFFF;
      box-shadow: 0 4px 12px rgba(99, 102, 241, 0.35);
      transform: translateY(-1px);
    }
    .btn-secondary {
      background: var(--bg-surface);
      color: var(--text-main);
      border: 1px solid var(--border-subtle);
    }
    .btn-secondary:hover {
      background: var(--bg-surface-elevated);
      border-color: var(--border-muted);
      color: #FFFFFF;
    }
    .btn-sm {
      padding: 5px 12px;
      font-size: 0.8rem;
      border-radius: var(--radius-sm);
    }

    /* Cards */
    .card {
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-lg);
      padding: 24px;
      box-shadow: var(--shadow-card);
    }

    /* Semantic Truth & Operational Badges (DESIGN.md) */
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 8px;
      border-radius: var(--radius-full);
      font-size: 0.725rem;
      font-weight: 600;
      line-height: 1;
      letter-spacing: 0.03em;
      white-space: nowrap;
    }
    .badge-verified {
      background: rgba(16, 185, 129, 0.15);
      color: #34D399;
      border: 1px solid rgba(16, 185, 129, 0.35);
    }
    .badge-corroborated {
      background: rgba(20, 184, 166, 0.15);
      color: #2DD4BF;
      border: 1px solid rgba(20, 184, 166, 0.35);
    }
    .badge-inferred {
      background: rgba(6, 182, 212, 0.15);
      color: #38BDF8;
      border: 1px solid rgba(6, 182, 212, 0.35);
    }
    .badge-claimed {
      background: rgba(245, 158, 11, 0.15);
      color: #FBBF24;
      border: 1px solid rgba(245, 158, 11, 0.35);
    }
    .badge-missing {
      background: rgba(244, 63, 94, 0.15);
      color: #FB7185;
      border: 1px solid rgba(244, 63, 94, 0.35);
    }
    .badge-unknown {
      background: rgba(148, 163, 184, 0.12);
      color: #94A3B8;
      border: 1px solid rgba(148, 163, 184, 0.25);
    }
    .badge-cyan {
      background: rgba(6, 182, 212, 0.15);
      color: #38BDF8;
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
    .badge-status-connected {
      background: rgba(16, 185, 129, 0.12);
      color: #34D399;
      border: 1px solid rgba(16, 185, 129, 0.3);
    }
    .badge-status-disconnected {
      background: rgba(148, 163, 184, 0.1);
      color: #94A3B8;
      border: 1px solid rgba(148, 163, 184, 0.25);
    }
    .badge-status-processing {
      background: rgba(99, 102, 241, 0.15);
      color: #818CF8;
      border: 1px solid rgba(99, 102, 241, 0.35);
      animation: pulse-badge 2s infinite ease-in-out;
    }
    .badge-status-error {
      background: rgba(244, 63, 94, 0.15);
      color: #FB7185;
      border: 1px solid rgba(244, 63, 94, 0.35);
    }
    @keyframes pulse-badge {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.6; }
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
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md);
      padding: 18px 20px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      transition: transform 0.15s ease, border-color 0.15s ease;
    }
    .stat-card:hover {
      transform: translateY(-2px);
      border-color: var(--border-highlight);
    }
    .stat-val {
      font-size: 1.75rem;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: var(--text-main);
      line-height: 1.2;
    }
    .stat-label {
      font-size: 0.75rem;
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

    /* Alerts & Flash Messages */
    .alert {
      padding: 14px 18px;
      border-radius: var(--radius-md);
      font-size: 0.9rem;
      line-height: 1.5;
      margin-bottom: 20px;
    }
    .alert-success {
      background: rgba(16, 185, 129, 0.12);
      border: 1px solid rgba(16, 185, 129, 0.3);
      color: #A7F3D0;
    }
    .alert-error {
      background: rgba(244, 63, 94, 0.12);
      border: 1px solid rgba(244, 63, 94, 0.3);
      color: #FECDD3;
    }
    .alert-warning {
      background: rgba(245, 158, 11, 0.12);
      border: 1px solid rgba(245, 158, 11, 0.3);
      color: #FDE68A;
    }
    .alert-info {
      background: rgba(59, 130, 246, 0.1);
      border-left: 4px solid #3b82f6;
      color: #93C5FD;
    }
    .alert strong {
      font-weight: 600;
    }

    /* Page Header Pattern */
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      flex-wrap: wrap;
      gap: 16px;
      margin-bottom: 28px;
    }
    .page-header h1 {
      font-size: 1.85rem;
      font-weight: 800;
      letter-spacing: -0.02em;
    }
    .page-header p {
      color: var(--text-muted);
      font-size: 0.95rem;
      margin-top: 4px;
      max-width: 680px;
    }

    /* Context Banner */
    .context-banner {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 1rem;
      background: rgba(30, 41, 59, 0.45);
      border: 1px solid var(--border-subtle);
      padding: 0.85rem 1.25rem;
      border-radius: var(--radius-md);
      margin-bottom: 1.75rem;
    }
    .context-banner-inner {
      display: flex;
      align-items: center;
      gap: 0.85rem;
    }
    .context-banner-avatar {
      width: 38px;
      height: 38px;
      border-radius: 50%;
      background: linear-gradient(135deg, var(--accent-indigo), var(--accent-cyan));
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 0.95rem;
      color: #FFF;
      box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3);
      flex-shrink: 0;
    }
    .context-banner-meta {
      font-weight: 600;
      color: #F8FAFC;
      font-size: 0.95rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
    .context-banner-sub {
      font-size: 0.8rem;
      color: #94A3B8;
    }

    /* Loading States */
    .loading-spinner {
      display: inline-block;
      width: 18px;
      height: 18px;
      border: 2px solid rgba(255,255,255,0.2);
      border-top-color: var(--accent-indigo);
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .loading-overlay {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 48px 24px;
      color: var(--text-muted);
      gap: 12px;
    }
    .loading-overlay .loading-spinner {
      width: 32px;
      height: 32px;
      border-width: 3px;
    }

    /* Empty State Pattern */
    .empty-state {
      text-align: center;
      padding: 48px 24px;
      background: rgba(0, 0, 0, 0.15);
      border: 1px dashed var(--border-subtle);
      border-radius: var(--radius-md);
    }
    .empty-state-icon {
      font-size: 2.5rem;
      margin-bottom: 12px;
    }
    .empty-state h3 {
      font-size: 1.15rem;
      font-weight: 700;
      margin-bottom: 6px;
      color: var(--text-main);
    }
    .empty-state p {
      font-size: 0.9rem;
      color: var(--text-muted);
      max-width: 460px;
      margin: 0 auto 20px;
      line-height: 1.6;
    }

    /* Section Headers */
    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 18px;
    }
    .section-header h2 {
      font-size: 1.2rem;
      font-weight: 700;
    }
    .section-header .section-count {
      font-size: 0.85rem;
      color: var(--text-dim);
    }

    /* Breadcrumb */
    .breadcrumb {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.85rem;
      margin-bottom: 20px;
    }
    .breadcrumb a {
      color: var(--text-muted);
      text-decoration: none;
      transition: color 0.15s;
    }
    .breadcrumb a:hover {
      color: var(--text-main);
    }
    .breadcrumb .separator {
      color: var(--text-dim);
    }
    .breadcrumb .current {
      color: var(--text-main);
      font-weight: 500;
    }

    /* Danger Button */
    .btn-danger {
      background: rgba(244, 63, 94, 0.15);
      color: #FB7185;
      border: 1px solid rgba(244, 63, 94, 0.3);
    }
    .btn-danger:hover {
      background: rgba(244, 63, 94, 0.25);
      border-color: rgba(244, 63, 94, 0.5);
      color: #FECDD3;
    }

    /* Inline Tag */
    .tag {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 10px;
      border-radius: var(--radius-sm);
      font-size: 0.75rem;
      font-weight: 600;
      background: rgba(255, 255, 255, 0.05);
      color: var(--text-muted);
      border: 1px solid var(--border-subtle);
    }

    /* Focus visible for accessibility */
    :focus-visible {
      outline: 2px solid var(--accent-indigo);
      outline-offset: 2px;
    }
    button:focus-visible,
    a:focus-visible,
    input:focus-visible,
    select:focus-visible,
    textarea:focus-visible {
      outline: 2px solid var(--accent-indigo);
      outline-offset: 2px;
    }

    /* Visually Hidden (screen reader only) */
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }

    /* Responsive */
    @media (max-width: 1024px) {
      .container {
        padding: 0 20px;
      }
    }

    @media (max-width: 768px) {
      .nav-links {
        display: none;
      }
      .nav-inner {
        height: 64px;
      }
      .nav-mobile-toggle {
        display: flex;
      }
      .page-header {
        flex-direction: column;
      }
      .page-header h1 {
        font-size: 1.5rem;
      }
      .context-banner {
        flex-direction: column;
        align-items: flex-start;
      }
      main {
        padding: 24px 0 40px;
      }
      .card {
        padding: 20px;
      }
      .data-table {
        font-size: 0.825rem;
      }
      .data-table th, .data-table td {
        padding: 10px 12px;
      }
      .stat-card {
        padding: 16px;
      }
      .stat-val {
        font-size: 1.4rem;
      }
      footer .footer-inner {
        flex-direction: column;
        text-align: center;
      }
    }

    /* Mobile nav toggle (hidden by default) */
    .nav-mobile-toggle {
      display: none;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      background: transparent;
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-sm);
      color: var(--text-main);
      font-size: 1.3rem;
      cursor: pointer;
      transition: background 0.15s;
    }
    .nav-mobile-toggle:hover {
      background: rgba(255, 255, 255, 0.05);
    }

    /* Mobile expanded nav */
    .nav-mobile-menu {
      display: none;
      position: fixed;
      top: 64px;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(11, 15, 25, 0.97);
      backdrop-filter: blur(12px);
      z-index: 90;
      padding: 24px;
      overflow-y: auto;
    }
    .nav-mobile-menu.open {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .nav-mobile-menu a {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 16px;
      color: var(--text-muted);
      font-size: 1rem;
      font-weight: 500;
      border-radius: var(--radius-md);
      text-decoration: none;
      transition: all 0.15s;
    }
    .nav-mobile-menu a:hover,
    .nav-mobile-menu a.active {
      background: rgba(99, 102, 241, 0.1);
      color: var(--text-main);
    }
    .nav-mobile-menu .mobile-section-label {
      font-size: 0.7rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--text-dim);
      padding: 16px 16px 6px;
    }
    .nav-mobile-divider {
      height: 1px;
      background: var(--border-subtle);
      margin: 8px 0;
    }
    .nav-mobile-menu form {
      width: 100%;
    }
    .nav-mobile-menu .logout-form-btn {
      width: 100%;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 16px;
      color: #F87171;
      font-size: 1rem;
      font-weight: 500;
      border-radius: var(--radius-md);
      cursor: pointer;
      transition: background 0.15s;
    }
    .nav-mobile-menu .logout-form-btn:hover {
      background: rgba(239, 68, 68, 0.12);
    }

    /* Grid responsive helpers */
    @media (max-width: 768px) {
      .grid-2col {
        grid-template-columns: 1fr !important;
      }
      .grid-3col {
        grid-template-columns: 1fr !important;
      }
      .grid-4col {
        grid-template-columns: 1fr 1fr !important;
      }
    }
    @media (max-width: 480px) {
      .grid-4col {
        grid-template-columns: 1fr !important;
      }
    }

    /* Print */
    @media print {
      .navbar, footer, .nav-actions, .nav-mobile-toggle { display: none; }
      body { background: #fff; color: #000; }
      .card { border: 1px solid #ccc; box-shadow: none; background: #fff; }
    }
  </style>
</head>
<body>
  <header class="navbar">
    <div class="container nav-inner">
      <a href="/" class="brand">
        <div class="brand-icon">AG</div>
        <span>Career Hub</span>
        <span class="brand-badge">${process.env.NODE_ENV === 'production' ? 'PROD' : process.env.NODE_ENV === 'staging' ? 'STAGING' : 'DEV'}</span>
      </a>

      <nav>
        <ul class="nav-links">
          <li><a href="/" class="nav-link ${activeNav === 'home' ? 'active' : ''}">Overview</a></li>
          ${
            userLoggedIn
              ? `
          <li class="nav-dropdown">
            <button class="nav-dropdown-btn ${['dashboard', 'projects', 'skills', 'applications', 'profile'].includes(activeNav) ? 'active' : ''}" aria-expanded="false" aria-haspopup="true">
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
              <a href="/profile" class="nav-dropdown-item ${activeNav === 'profile' ? 'active' : ''}">
                <span class="item-icon">🎯</span>
                <div class="item-text">
                  <div class="item-title">Profile & Intent</div>
                  <div class="item-desc">Target roles & preferences</div>
                </div>
              </a>
              <a href="/applications" class="nav-dropdown-item ${activeNav === 'applications' ? 'active' : ''}">
                <span class="item-icon">📋</span>
                <div class="item-text">
                  <div class="item-title">Applications</div>
                  <div class="item-desc">Pipeline tracking</div>
                </div>
              </a>
            </div>
          </li>

          <li class="nav-dropdown">
            <button class="nav-dropdown-btn ${['sources', 'resumes', 'radar'].includes(activeNav) ? 'active' : ''}" aria-expanded="false" aria-haspopup="true">
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
              <a href="/apps/radar" class="nav-dropdown-item ${activeNav === 'radar' ? 'active' : ''}">
                <span class="item-icon">📡</span>
                <div class="item-text">
                  <div class="item-title">Job Fit Radar</div>
                  <div class="item-desc">ATS analysis & skill gaps</div>
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
        <!-- Mobile hamburger -->
        <button class="nav-mobile-toggle" id="mobileNavToggle" aria-label="Open navigation menu" aria-expanded="false">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
        </button>
        ${
          userLoggedIn
            ? `
          <div class="user-dropdown" id="userDropdown">
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
              <a href="/connect" class="nav-dropdown-item ${activeNav === 'connect' ? 'active' : ''}">
                <span class="item-icon">🔑</span>
                <div class="item-text">
                  <div class="item-title">API Tokens</div>
                  <div class="item-desc">MCP personal tokens</div>
                </div>
              </a>
              <a href="/docs/mcp" class="nav-dropdown-item ${activeNav === 'docs' ? 'active' : ''}">
                <span class="item-icon">📖</span>
                <div class="item-text">
                  <div class="item-title">Documentation</div>
                  <div class="item-desc">MCP tool reference</div>
                </div>
              </a>
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

  <div class="nav-mobile-menu" id="mobileNavMenu" role="dialog" aria-label="Mobile navigation">
    ${
      userLoggedIn
        ? `
      <div class="mobile-section-label">Overview</div>
      <a href="/" class="${activeNav === 'home' ? 'active' : ''}">🏠 Overview</a>
      <div class="mobile-section-label">Career</div>
      <a href="/dashboard" class="${activeNav === 'dashboard' ? 'active' : ''}">📊 Dashboard</a>
      <a href="/projects" class="${activeNav === 'projects' ? 'active' : ''}">💼 Projects</a>
      <a href="/skills" class="${activeNav === 'skills' ? 'active' : ''}">⚡ Skills</a>
      <a href="/profile" class="${activeNav === 'profile' ? 'active' : ''}">🎯 Profile & Intent</a>
      <a href="/applications" class="${activeNav === 'applications' ? 'active' : ''}">📋 Applications</a>
      <div class="mobile-section-label">Sources</div>
      <a href="/sources" class="${activeNav === 'sources' ? 'active' : ''}">🔗 Connected Sources</a>
      <a href="/resumes" class="${activeNav === 'resumes' ? 'active' : ''}">📄 Resumes</a>
      <div class="mobile-section-label">AI & Docs</div>
      <a href="/connect" class="${activeNav === 'connect' ? 'active' : ''}">🤖 AI Connect</a>
      <a href="/docs/mcp" class="${activeNav === 'docs' ? 'active' : ''}">📖 MCP Docs</a>
      <a href="/apps/radar" class="${activeNav === 'radar' ? 'active' : ''}">📡 Job Fit Radar</a>
      <div class="nav-mobile-divider"></div>
      <div class="mobile-section-label">Account & Legal</div>
      <a href="/settings" class="${activeNav === 'settings' ? 'active' : ''}">⚙️ Settings & Privacy</a>
      <a href="/privacy" class="${activeNav === 'privacy' ? 'active' : ''}">🛡️ Privacy Notice</a>
      <a href="/terms" class="${activeNav === 'terms' ? 'active' : ''}">📜 Terms of Service</a>
      <a href="/cookies" class="${activeNav === 'cookies' ? 'active' : ''}">🍪 Cookie Policy</a>
      <a href="/security" class="${activeNav === 'security' ? 'active' : ''}">🔒 Security Architecture</a>
      <a href="/data-deletion" class="${activeNav === 'data-deletion' ? 'active' : ''}">🗑️ Data Deletion</a>
      <a href="/accessibility" class="${activeNav === 'accessibility' ? 'active' : ''}">♿ Accessibility</a>
      <a href="/subprocessors" class="${activeNav === 'subprocessors' ? 'active' : ''}">🏢 Subprocessors</a>
      <form action="/auth/logout" method="POST" style="margin-top: 0.5rem;">
        <button type="submit" class="logout-form-btn">🚪 Sign Out</button>
      </form>
    `
        : `
      <a href="/" class="${activeNav === 'home' ? 'active' : ''}">🏠 Overview</a>
      <a href="/docs/mcp" class="${activeNav === 'docs' ? 'active' : ''}">📖 MCP Docs</a>
      <a href="/privacy" class="${activeNav === 'privacy' ? 'active' : ''}">🛡️ Privacy Notice</a>
      <a href="/terms" class="${activeNav === 'terms' ? 'active' : ''}">📜 Terms of Service</a>
      <a href="/cookies" class="${activeNav === 'cookies' ? 'active' : ''}">🍪 Cookie Policy</a>
      <a href="/security" class="${activeNav === 'security' ? 'active' : ''}">🔒 Security Architecture</a>
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

  <script>
    (function() {
      // 1. Mobile Navigation Drawer
      const toggle = document.getElementById('mobileNavToggle');
      const menu = document.getElementById('mobileNavMenu');
      if (toggle && menu) {
        toggle.addEventListener('click', function() {
          const isOpen = menu.classList.toggle('open');
          toggle.setAttribute('aria-expanded', String(isOpen));
          toggle.innerHTML = isOpen
            ? '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>'
            : '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>';
          document.body.style.overflow = isOpen ? 'hidden' : '';
        });

        // Close mobile nav when clicking any link
        menu.querySelectorAll('a, button').forEach(function(link) {
          link.addEventListener('click', function() {
            menu.classList.remove('open');
            toggle.setAttribute('aria-expanded', 'false');
            toggle.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>';
            document.body.style.overflow = '';
          });
        });
      }

      // 2. Global Dropdown Management (Nav & User)
      const allDropdowns = Array.from(document.querySelectorAll('.nav-dropdown, .user-dropdown'));

      function closeAllDropdowns(exceptElement) {
        allDropdowns.forEach(function(drop) {
          if (drop !== exceptElement && drop.classList.contains('open')) {
            drop.classList.remove('open');
            const btn = drop.querySelector('.nav-dropdown-btn, .user-dropdown-btn');
            if (btn) btn.setAttribute('aria-expanded', 'false');
          }
        });
      }

      allDropdowns.forEach(function(drop) {
        const btn = drop.querySelector('.nav-dropdown-btn, .user-dropdown-btn');
        if (!btn) return;

        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          const wasOpen = drop.classList.contains('open');
          closeAllDropdowns(drop);
          const isNowOpen = !wasOpen;
          drop.classList.toggle('open', isNowOpen);
          btn.setAttribute('aria-expanded', String(isNowOpen));
        });

        // Close on link click inside dropdown
        drop.querySelectorAll('a, button[type="submit"]').forEach(function(item) {
          item.addEventListener('click', function() {
            drop.classList.remove('open');
            btn.setAttribute('aria-expanded', 'false');
          });
        });
      });

      // Close on outside click
      document.addEventListener('click', function(e) {
        let insideDropdown = false;
        allDropdowns.forEach(function(drop) {
          if (drop.contains(e.target)) insideDropdown = true;
        });
        if (!insideDropdown) {
          closeAllDropdowns(null);
        }
      });

      // Close on Escape key
      document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
          if (menu && menu.classList.contains('open')) {
            menu.classList.remove('open');
            if (toggle) {
              toggle.setAttribute('aria-expanded', 'false');
              toggle.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>';
              toggle.focus();
            }
            document.body.style.overflow = '';
          }
          let focusedBtn = null;
          allDropdowns.forEach(function(drop) {
            if (drop.classList.contains('open')) {
              focusedBtn = drop.querySelector('.nav-dropdown-btn, .user-dropdown-btn');
            }
          });
          closeAllDropdowns(null);
          if (focusedBtn) focusedBtn.focus();
        }
      });
    })();
  </script>
</body>
</html>`;
}
