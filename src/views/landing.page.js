/**
 * @file Public Landing Page View Template.
 *
 * Renders the Career Hub public value proposition, architecture highlights,
 * feature comparison, supported AI client matrix, and calls to action.
 */

import { renderLayout } from './layout.js';

/**
 * Renders the full public landing page HTML.
 *
 * @param {object} [params={}]
 * @param {object|null} [params.user=null] Authenticated user object if logged in
 * @returns {string} Full HTML document
 */
export function renderLandingPage({ user = null } = {}) {
  const content = `
    <div class="container">
      <!-- Hero Section -->
      <section style="text-align:center; padding: 48px 0 60px;">
        <div style="display:inline-flex; align-items:center; gap:8px; background:rgba(99,102,241,0.1); border:1px solid rgba(99,102,241,0.25); border-radius:var(--radius-full); padding:5px 14px; margin-bottom:20px;">
          <span style="width:7px; height:7px; border-radius:50%; background:var(--accent-emerald);"></span>
          <span style="font-size:0.825rem; font-weight:600; color:var(--text-main); letter-spacing:0.02em;">Universal Remote MCP Server (2026-07-28 Spec)</span>
        </div>
        
        <h1 style="font-size: clamp(2.2rem, 5vw, 3.4rem); font-weight:800; line-height:1.15; letter-spacing:-0.03em; max-width:860px; margin:0 auto 18px; color:var(--text-main);">
          The Evidence-Backed AI Career Platform
        </h1>
        
        <p style="font-size:1.1rem; color:var(--text-muted); max-width:680px; margin:0 auto 32px; line-height:1.6;">
          Connect your GitHub code, extract AST-verified skills with cryptographic commit provenance, and empower Claude, ChatGPT, and Gemini to generate precision tailored applications with zero hallucinations.
        </p>

        <div style="display:flex; align-items:center; justify-content:center; gap:14px; flex-wrap:wrap;">
          ${
            user
              ? `
            <a href="/dashboard" class="btn btn-primary" style="padding:10px 24px; font-size:0.95rem;">
              <span>Open My Dashboard</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </a>
            `
              : `
            <a href="/login" class="btn btn-primary" style="padding:10px 24px; font-size:0.95rem;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
              <span>Sign in with GitHub</span>
            </a>
            `
          }
          <a href="/docs/mcp" class="btn btn-secondary" style="padding:10px 20px; font-size:0.95rem;">
            <span>Explore MCP Protocol</span>
          </a>
        </div>
      </section>

      <!-- Evidence Model: Verified vs Claimed vs Inferred -->
      <section style="margin-bottom:56px;">
        <div style="text-align:center; margin-bottom:32px;">
          <h2 style="font-size:1.5rem; font-weight:700; letter-spacing:-0.02em; color:var(--text-main);">The Evidence Truth Model</h2>
          <p style="color:var(--text-muted); font-size:0.925rem; margin-top:6px; max-width:640px; margin-left:auto; margin-right:auto;">Every skill, project, and claim in Career Hub carries a strict truth classification. No ambiguity, no greenwashing.</p>
        </div>

        <!-- Four Evidence States -->
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap:16px; margin-bottom:28px;">
          <div class="card" style="text-align:center; padding:22px 18px;">
            <div class="badge badge-verified" style="margin-bottom:12px;">VERIFIED</div>
            <p style="font-size:0.875rem; color:var(--text-muted); line-height:1.5;">Backed by AST syntax analysis, dependency manifests, or cryptographic commit evidence.</p>
            <div style="margin-top:12px; font-size:0.75rem; color:var(--text-dim); font-family:var(--font-mono);">commit: a3f2c1d &bull; path: src/api/</div>
          </div>

          <div class="card" style="text-align:center; padding:22px 18px;">
            <div class="badge badge-inferred" style="margin-bottom:12px;">INFERRED</div>
            <p style="font-size:0.875rem; color:var(--text-muted); line-height:1.5;">Derived through taxonomy hierarchy. E.g., expertise in Next.js implies React proficiency.</p>
            <div style="margin-top:12px; font-size:0.75rem; color:var(--text-dim);">Logical deduction from verified foundation</div>
          </div>

          <div class="card" style="text-align:center; padding:22px 18px;">
            <div class="badge badge-claimed" style="margin-bottom:12px;">CLAIMED</div>
            <p style="font-size:0.875rem; color:var(--text-muted); line-height:1.5;">User-asserted from resume upload. Always labeled <code style="color:#FBBF24;">[Unverified User Claim]</code>.</p>
            <div style="margin-top:12px; font-size:0.75rem; color:var(--text-dim);">Candidate-provided, never auto-verified</div>
          </div>

          <div class="card" style="text-align:center; padding:22px 18px;">
            <span class="badge" style="background:rgba(148,163,184,0.12); color:#94A3B8; border:1px solid rgba(148,163,184,0.25); margin-bottom:12px;">UNKNOWN</span>
            <p style="font-size:0.875rem; color:var(--text-muted); line-height:1.5;">No claim or evidence available. The system explicitly shows gaps rather than fabricating skills.</p>
            <div style="margin-top:12px; font-size:0.75rem; color:var(--text-dim);">Transparent silence over fabrication</div>
          </div>
        </div>

        <!-- Hallucination vs Verified Comparison -->
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap:20px;">
          <div class="card" style="border:1px solid rgba(244,63,94,0.25); background:rgba(244,63,94,0.02);">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
              <span class="badge" style="background:rgba(244,63,94,0.12); color:#FB7185; border:1px solid rgba(244,63,94,0.25);">Legacy Resume Tools</span>
            </div>
            <h3 style="font-size:1.1rem; font-weight:600; margin-bottom:10px; color:var(--text-main);">Unverified Hallucinations</h3>
            <ul style="list-style:none; color:var(--text-muted); font-size:0.875rem; display:flex; flex-direction:column; gap:8px;">
              <li>✕ Generates claims without verifiable evidence</li>
              <li>✕ Keyword-stuffs resumes to fool basic ATS screeners</li>
              <li>✕ Disconnected from real engineering codebase experience</li>
              <li>✕ Exposes candidate to embarrassing interview failures</li>
            </ul>
          </div>

          <div class="card" style="border:1px solid rgba(16,185,129,0.25); background:rgba(16,185,129,0.02);">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
              <span class="badge badge-verified">AI Careers Hub</span>
            </div>
            <h3 style="font-size:1.1rem; font-weight:600; margin-bottom:10px; color:var(--text-main);">Repository-Anchored Proof</h3>
            <ul style="list-style:none; color:var(--text-muted); font-size:0.875rem; display:flex; flex-direction:column; gap:8px;">
              <li>✓ Ingests real GitHub AST syntax trees & dependencies</li>
              <li>✓ Pins every skill to authentic commit SHAs & line ranges</li>
              <li>✓ Zero-Hallucination Gate enforces <code style="color:#34D399;">VERIFIED</code> provenance</li>
              <li>✓ Labels self-authored statements as <code style="color:#FBBF24;">[Unverified User Claim]</code></li>
            </ul>
          </div>
        </div>
      </section>

      <!-- 6 Core Platform Features Grid -->
      <section style="margin-bottom:56px;">
        <div style="text-align:center; margin-bottom:32px;">
          <h2 style="font-size:1.5rem; font-weight:700; letter-spacing:-0.02em; color:var(--text-main);">Platform Capabilities</h2>
          <p style="color:var(--text-muted); font-size:0.925rem; margin-top:6px;">A complete engineering career intelligence and application suite.</p>
        </div>

        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap:20px;">
          <div class="card">
            <div style="width:36px; height:36px; border-radius:var(--radius-sm); background:rgba(99,102,241,0.12); border:1px solid rgba(99,102,241,0.25); display:flex; align-items:center; justify-content:center; margin-bottom:14px; color:var(--accent-indigo);">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 18l6-6-6-6M8 6l-6 6 6 6"/></svg>
            </div>
            <h3 style="font-size:1.05rem; font-weight:600; margin-bottom:6px; color:var(--text-main);">GitHub Ingestion</h3>
            <p style="color:var(--text-muted); font-size:0.85rem; line-height:1.5;">Deep AST analysis across JS/TS, Python, Go, Rust, Java, and Docker with automatic secret scrubbing.</p>
          </div>

          <div class="card">
            <div style="width:36px; height:36px; border-radius:var(--radius-sm); background:rgba(6,182,212,0.12); border:1px solid rgba(6,182,212,0.25); display:flex; align-items:center; justify-content:center; margin-bottom:14px; color:var(--accent-cyan);">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
            </div>
            <h3 style="font-size:1.05rem; font-weight:600; margin-bottom:6px; color:var(--text-main);">Job-Fit & ATS Scoring</h3>
            <p style="color:var(--text-muted); font-size:0.85rem; line-height:1.5;">Deterministic 4-status evaluation comparing your code evidence graph against target job descriptions.</p>
          </div>

          <div class="card">
            <div style="width:36px; height:36px; border-radius:var(--radius-sm); background:rgba(16,185,129,0.12); border:1px solid rgba(16,185,129,0.25); display:flex; align-items:center; justify-content:center; margin-bottom:14px; color:var(--accent-emerald);">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            </div>
            <h3 style="font-size:1.05rem; font-weight:600; margin-bottom:6px; color:var(--text-main);">Tailored Artifacts</h3>
            <p style="color:var(--text-muted); font-size:0.85rem; line-height:1.5;">Generate evidence-grounded resumes, targeted cover letters, and portfolio recommendations with exact code citations.</p>
          </div>

          <div class="card">
            <div style="width:36px; height:36px; border-radius:var(--radius-sm); background:rgba(245,158,11,0.12); border:1px solid rgba(245,158,11,0.25); display:flex; align-items:center; justify-content:center; margin-bottom:14px; color:var(--accent-amber);">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
            </div>
            <h3 style="font-size:1.05rem; font-weight:600; margin-bottom:6px; color:var(--text-main);">Application Tracker</h3>
            <p style="color:var(--text-muted); font-size:0.85rem; line-height:1.5;">Sovereign multi-stage job pipeline with interview logs and immutable point-in-time document snapshots.</p>
          </div>

          <div class="card">
            <div style="width:36px; height:36px; border-radius:var(--radius-sm); background:rgba(99,102,241,0.12); border:1px solid rgba(99,102,241,0.25); display:flex; align-items:center; justify-content:center; margin-bottom:14px; color:var(--accent-indigo);">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </div>
            <h3 style="font-size:1.05rem; font-weight:600; margin-bottom:6px; color:var(--text-main);">Two-Phase Write Safety</h3>
            <p style="color:var(--text-muted); font-size:0.85rem; line-height:1.5;">No AI can modify code directly. AI generates HMAC-signed approval tickets; human confirms before PR creation.</p>
          </div>

          <div class="card">
            <div style="width:36px; height:36px; border-radius:var(--radius-sm); background:rgba(6,182,212,0.12); border:1px solid rgba(6,182,212,0.25); display:flex; align-items:center; justify-content:center; margin-bottom:14px; color:var(--accent-cyan);">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
            </div>
            <h3 style="font-size:1.05rem; font-weight:600; margin-bottom:6px; color:var(--text-main);">Universal AI Access</h3>
            <p style="color:var(--text-muted); font-size:0.85rem; line-height:1.5;">Full Model Context Protocol (MCP) compatibility across Google Gemini, Anthropic Claude, and OpenAI ChatGPT.</p>
          </div>
        </div>
      </section>

      <!-- Supported AI Clients Banner -->
      <section class="card" style="margin-bottom:56px; text-align:center; padding:32px 20px;">
        <h3 style="font-size:1.2rem; font-weight:700; margin-bottom:6px; color:var(--text-main);">Connect to Any Leading AI Assistant</h3>
        <p style="color:var(--text-muted); font-size:0.875rem; margin-bottom:20px;">Use Career Hub's 26-tool MCP catalog directly inside your favorite workflow.</p>
        
        <div style="display:flex; justify-content:center; align-items:center; gap:16px; flex-wrap:wrap;">
          <div style="display:flex; align-items:center; gap:10px; background:rgba(255,255,255,0.02); padding:8px 16px; border-radius:var(--radius-md); border:1px solid var(--border-subtle);">
            <div style="width:8px; height:8px; border-radius:50%; background:var(--accent-indigo);"></div>
            <strong style="font-size:0.9rem; color:var(--text-main);">Anthropic Claude</strong>
            <span class="badge badge-indigo">OAuth 2.1 PKCE</span>
          </div>

          <div style="display:flex; align-items:center; gap:10px; background:rgba(255,255,255,0.02); padding:8px 16px; border-radius:var(--radius-md); border:1px solid var(--border-subtle);">
            <div style="width:8px; height:8px; border-radius:50%; background:var(--accent-emerald);"></div>
            <strong style="font-size:0.9rem; color:var(--text-main);">OpenAI ChatGPT</strong>
            <span class="badge badge-verified">Custom GPT Action</span>
          </div>

          <div style="display:flex; align-items:center; gap:10px; background:rgba(255,255,255,0.02); padding:8px 16px; border-radius:var(--radius-md); border:1px solid var(--border-subtle);">
            <div style="width:8px; height:8px; border-radius:50%; background:var(--accent-cyan);"></div>
            <strong style="font-size:0.9rem; color:var(--text-main);">Google Gemini</strong>
            <span class="badge badge-cyan">Personal MCP Token</span>
          </div>
        </div>
      </section>

      <!-- Bottom CTA -->
      <section style="text-align:center; padding: 24px 0 48px;">
        <h2 style="font-size:1.6rem; font-weight:700; letter-spacing:-0.02em; margin-bottom:10px; color:var(--text-main);">Ready to ground your career narrative in real code?</h2>
        <p style="color:var(--text-muted); font-size:0.95rem; margin-bottom:24px;">Connect your repositories in 2 minutes with least-privilege permissions.</p>
        <a href="/login" class="btn btn-primary" style="padding:11px 28px; font-size:0.95rem;">
          <span>Get Started with GitHub</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </a>
      </section>
    </div>
  `;

  return renderLayout({
    title: 'Universal AI Career Intelligence Platform',
    content,
    activeNav: 'home',
    user,
  });
}
