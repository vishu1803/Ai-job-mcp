import { escapeHtml as e } from '../../utils/html-escaper.js';

import { renderIcon } from './icons.js';

import { renderCopilotDrawer } from './copilot-drawer.js';

const destinations = [
  ['dashboard', '/dashboard', 'Overview'],
  ['profile', '/profile', 'Profile'],
  ['radar', '/apps/radar', 'Jobs'],
  ['resumes', '/resumes', 'Resumes'],
  ['applications', '/applications', 'Applications'],
];

export function renderWorkspaceShell({ title, content, activeNav, user, description }) {
  const active =
    activeNav === 'studio'
      ? 'resumes'
      : ['sources', 'skills', 'projects'].includes(activeNav)
        ? 'profile'
        : activeNav;

  const links = destinations
    .map(
      ([key, url, label]) =>
        `<a class="ch-nav-link" href="${url}" ${active === key ? 'aria-current="page"' : ''}>${label}</a>`
    )
    .join('');

  const profileLinks =
    active === 'profile'
      ? `<nav class="ch-subnav" aria-label="Profile sections"><a href="/profile">Career profile</a><a href="/skills">Skills</a><a href="/projects">Projects</a><a href="/sources">Sources &amp; evidence</a></nav>`
      : '';

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${e(title)} | Career Hub</title><meta name="description" content="${e(description || 'Your career workspace')}"><script src="/public/js/workspace-theme-init.js"></script><link rel="stylesheet" href="/public/css/app.css"><link rel="stylesheet" href="/public/css/workspace.css"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"></head>

<body data-workspace="true" data-page="${e(activeNav)}"><a class="ch-skip" href="#workspace-main">Skip to content</a>

<header class="ch-shell-header"><div class="ch-shell-inner nav-inner"><a class="ch-brand" href="/dashboard">${renderIcon('briefcase', { size: 21 })}<span>Career Hub</span></a><nav class="ch-primary-nav" aria-label="Main navigation">${links}</nav><div class="ch-shell-actions"><label class="ch-theme-label"><span class="ch-visually-hidden">Appearance</span><select id="workspaceTheme" aria-label="Appearance"><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select></label>

<div class="user-dropdown"><button class="user-dropdown-btn ch-account" aria-label="Account menu" aria-expanded="false" aria-haspopup="true">${e((user.displayName || 'Candidate').charAt(0))}</button><div class="user-dropdown-menu"><div class="user-dropdown-header">${e(user.displayName || 'Candidate')}<div class="user-dropdown-email">${e(user.email || '')}</div></div><a class="nav-dropdown-item" href="/settings">Settings &amp; privacy</a><a class="nav-dropdown-item" href="/connect">AI connections</a><a class="nav-dropdown-item" href="/docs/mcp">Help &amp; MCP docs</a>${activeNav !== 'studio' ? '<button class="nav-dropdown-item" id="copilotOpenBtn" onclick="window.toggleCopilotDrawer && window.toggleCopilotDrawer(true,this)">Career Copilot</button>' : ''}<form action="/auth/logout" method="POST"><button class="logout-form-btn" type="submit">Sign Out</button></form></div></div><button id="mobileNavToggle" class="ch-menu-toggle" aria-label="Open navigation" aria-expanded="false" aria-controls="mobileNavMenu">${renderIcon('menu', { size: 22 })}</button></div></div></header>

<div class="nav-mobile-menu ch-mobile-menu" id="mobileNavMenu" role="dialog" aria-label="Mobile navigation" aria-modal="true">${links}<a href="/settings">Settings &amp; privacy</a><a href="/connect">AI connections</a><a href="/docs/mcp">Help</a></div>

${profileLinks}<main id="workspace-main" tabindex="-1">${content}</main>

<footer class="ch-footer"><span>Career Hub</span><nav aria-label="Legal"><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/accessibility">Accessibility</a><a href="/security">Security</a><a href="/cookies">Cookies</a><a href="/data-deletion">Data controls</a><a href="/subprocessors">Subprocessors</a></nav></footer>

<div id="portalOfflineBanner" class="portal-offline-banner" role="status">You are offline. Unsaved wording stays in this tab; reconnect and retry saving.</div><div id="portalToastContainer" class="portal-toast-container" role="status" aria-live="polite"></div><script src="/public/js/app.js" defer></script><script src="/public/js/workspace.js" defer></script>${activeNav !== 'studio' ? renderCopilotDrawer({ pageContext: activeNav }) : ''}</body></html>`;
}
