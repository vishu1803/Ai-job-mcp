/**
 * @file Public Accessibility Statement View Template (P14-004C / ARCH-056).
 *
 * Details digital accessibility commitments, keyboard navigation, and feedback channels.
 */

import { renderLayout } from './layout.js';

export function renderAccessibilityPage({ user = null, tenant = null } = {}) {
  const content = `
    <div class="container" style="max-width: 900px; padding: 3rem 1.5rem;">
      <h1 style="font-size: 2.2rem; font-weight: 800; color: #f8fafc; margin-bottom: 0.5rem;">
        Accessibility Statement
      </h1>
      <p style="font-size: 0.9rem; color: #94a3b8; margin-bottom: 2rem;">
        Commitment to Inclusive, Accessible Developer Experiences
      </p>

      <div class="card" style="display: flex; flex-direction: column; gap: 1.75rem; line-height: 1.7; color: #cbd5e1; font-size: 0.95rem;">
        <section>
          <h2 style="font-size: 1.25rem; font-weight: 600; color: #f8fafc; margin-bottom: 0.5rem;">1. Our Commitment</h2>
          <p>
            Antigravity Career Hub is dedicated to ensuring digital accessibility for people with disabilities. We continuously improve the user experience for everyone and apply relevant accessibility standards across our web interface.
          </p>
        </section>

        <section>
          <h2 style="font-size: 1.25rem; font-weight: 600; color: #f8fafc; margin-bottom: 0.5rem;">2. Core Accessibility Features</h2>
          <ul style="padding-left: 1.25rem; display: flex; flex-direction: column; gap: 0.5rem;">
            <li><strong>Keyboard Navigability:</strong> All interactive controls, forms, modals, and navigation dropdowns support full keyboard navigation (Tab, Shift+Tab, Enter, Space, Escape).</li>
            <li><strong>Semantic HTML5 Structure:</strong> Clear heading hierarchies (<code>h1</code> through <code>h4</code>), landmark elements (<code>main</code>, <code>nav</code>, <code>footer</code>), and descriptive button labels.</li>
            <li><strong>High-Contrast Aesthetics:</strong> Carefully curated dark mode color palette maintaining WCAG AA compliant contrast ratios between foreground text and surface backgrounds.</li>
            <li><strong>ARIA Attributes:</strong> Interactive elements include proper <code>aria-label</code>, <code>aria-expanded</code>, and <code>aria-haspopup</code> attributes for assistive screen readers.</li>
          </ul>
        </section>

        <section>
          <h2 style="font-size: 1.25rem; font-weight: 600; color: #f8fafc; margin-bottom: 0.5rem;">3. Assistive Feedback & Contact</h2>
          <p>
            We welcome feedback on the accessibility of Career Hub. If you encounter accessibility barriers, please open an issue on our GitHub repository at <a href="https://github.com/vishu1803/Ai-job-mcp" target="_blank" rel="noopener" style="color: var(--accent-indigo);">github.com/vishu1803/Ai-job-mcp</a>.
          </p>
        </section>
      </div>
    </div>
  `;

  return renderLayout({
    title: 'Accessibility Statement | Antigravity Career Hub',
    content,
    user,
    tenant,
    activeNav: 'accessibility',
  });
}
