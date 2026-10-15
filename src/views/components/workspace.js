import { escapeHtml as e } from '../../utils/html-escaper.js';

import { renderIcon } from './icons.js';

export const action = (href, label, primary = false) =>
  `<a class="ch-button ${primary ? 'ch-button-primary' : ''}" href="${e(href)}">${e(label)}${renderIcon('arrowRight', { size: 15 })}</a>`;

export const status = (label, tone = 'neutral') =>
  `<span class="ch-status ch-status-${e(tone)}">${e(label)}</span>`;

export const pageHeading = (title, description, actions = '') =>
  `<header class="ch-page-heading"><div><p class="ch-eyebrow">Career Hub / ${e(title)}</p><h1>${e(title)}</h1><p>${e(description)}</p></div><div class="ch-actions">${actions}</div></header>`;

export const draftRows = (drafts, limit = 20) =>
  drafts
    .slice(0, limit)
    .map(
      (d) =>
        `<article class="ch-row"><span class="ch-document-icon" aria-hidden="true">${renderIcon('resumes', { size: 22 })}</span><div class="ch-row-content"><h3><a href="${e(d.href)}">${e(d.title)}</a></h3><p>${e(d.company || 'Job-specific resume')} &middot; Saved ${e(new Date(d.updatedAt).toLocaleDateString('en', { month: 'short', day: 'numeric' }))}</p></div>${status('Draft')}${action(d.href, 'Continue editing')}</article>`
    )
    .join('');

export const studioTargetForm = (target, csrfToken) =>
  `<form action="/resume-studio/open?from=jobs" method="POST" class="ch-inline-form"><input type="hidden" name="_csrf" value="${e(csrfToken)}"><input type="hidden" name="jobTitle" value="${e(target.title || '')}"><input type="hidden" name="companyName" value="${e(target.company || '')}"><input type="hidden" name="sourceUrl" value="${e(target.sourceUrl || '')}"><input type="hidden" name="jobDescriptionText" value="${e(target.rawDescription || '')}"><button type="submit" class="btn btn-secondary btn-sm">Tailor in Studio</button></form>`;
