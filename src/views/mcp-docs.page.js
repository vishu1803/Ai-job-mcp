/**
 * @file Public Developer Documentation Page View Template (/docs/mcp).
 *
 * Implements comprehensive developer-facing documentation:
 * 1. Protocol Specification (Streamable HTTP, JSON-RPC 2.0, 2026-07-28 Spec).
 * 2. Universal MCP Endpoint & Local Development vs Staging Guide.
 * 3. OAuth 2.1 RFC 8414 / RFC 9728 Discovery & Personal Token Authentication.
 * 4. Complete 16-Tool Catalog with interactive category filter and real-time search.
 * 5. Two-Phase Write Safety & Stopping Protocol deep-dive.
 * 6. Explicit Roadmap Boundaries (Registry & MCP Apps planned/unimplemented).
 */

import { renderLayout } from './layout.js';
import { escapeHtml } from '../utils/html-escaper.js';

/**
 * 16 Registered MCP Tool Definitions with parameters, scopes, and JSON-RPC examples.
 */
const TOOLS_CATALOG = [
  // Category 1: Career Read (4 tools)
  {
    name: 'get_candidate_profile',
    category: 'Career Read',
    scope: 'career:read',
    role: 'READONLY',
    classification: 'Read',
    purpose:
      'Inspect candidate profile, headline, summary narrative, verified skills overview, and showcase project highlights.',
    parameters: [
      {
        name: 'candidateId',
        type: 'string (UUID)',
        required: false,
        description: 'Target candidate ID. Defaults to authenticated persona.',
      },
    ],
    exampleRpc: {
      method: 'tools/call',
      params: {
        name: 'get_candidate_profile',
        arguments: {},
      },
    },
    safetyNotes:
      'Read-only query. Strictly isolated within caller tenant boundary. Zero secret leakage.',
  },
  {
    name: 'list_verified_skills',
    category: 'Career Read',
    scope: 'career:read',
    role: 'READONLY',
    classification: 'Read',
    purpose:
      'List candidate skills verified through code AST analysis, package manifests, and repository commit evidence.',
    parameters: [
      {
        name: 'candidateId',
        type: 'string (UUID)',
        required: false,
        description: 'Target candidate ID.',
      },
      {
        name: 'category',
        type: 'enum (LANGUAGE, FRAMEWORK, DATABASE, CLOUD_DEVOPS, TOOL, ARCHITECTURE)',
        required: false,
        description: 'Filter by skill category.',
      },
      {
        name: 'minConfidence',
        type: 'number (0.0 - 1.0)',
        required: false,
        description: 'Minimum evidence confidence threshold.',
      },
    ],
    exampleRpc: {
      method: 'tools/call',
      params: {
        name: 'list_verified_skills',
        arguments: { category: 'LANGUAGE', minConfidence: 0.8 },
      },
    },
    safetyNotes:
      'Distinguishes between VERIFIED (AST code evidence), INFERRED, and CLAIMED skills.',
  },
  {
    name: 'inspect_project_evidence',
    category: 'Career Read',
    scope: 'career:read',
    role: 'READONLY',
    classification: 'Read',
    purpose:
      'Inspect commit-pinned evidence items, file paths, line ranges, and sanitized code excerpts for a candidate project codebase.',
    parameters: [
      {
        name: 'projectId',
        type: 'string (UUID)',
        required: false,
        description: 'Target project UUID.',
      },
      {
        name: 'candidateId',
        type: 'string (UUID)',
        required: false,
        description: 'Target candidate UUID.',
      },
      {
        name: 'limit',
        type: 'number (1 - 50)',
        required: false,
        description: 'Maximum evidence items to return.',
      },
    ],
    exampleRpc: {
      method: 'tools/call',
      params: {
        name: 'inspect_project_evidence',
        arguments: { limit: 10 },
      },
    },
    safetyNotes:
      'Code excerpts are scrubbed by SecretScrubber (redacting API keys, passwords, and private tokens).',
  },
  {
    name: 'analyze_job_fit',
    category: 'Career Read',
    scope: 'career:read',
    role: 'READONLY',
    classification: 'Read',
    purpose:
      'Evaluate candidate evidence graph against a target job description, calculating ATS match score, skill coverage, and prioritized gaps.',
    parameters: [
      {
        name: 'jobDescriptionText',
        type: 'string (min 50 chars)',
        required: true,
        description: 'Full text of target job posting.',
      },
      {
        name: 'candidateId',
        type: 'string (UUID)',
        required: false,
        description: 'Target candidate UUID.',
      },
    ],
    exampleRpc: {
      method: 'tools/call',
      params: {
        name: 'analyze_job_fit',
        arguments: {
          jobDescriptionText:
            'Senior Backend Engineer with Node.js, PostgreSQL, Distributed Systems...',
        },
      },
    },
    safetyNotes: 'Deterministic scoring algorithm. Input sanitized against prompt injection.',
  },

  // Category 2: Career Artifacts (3 tools)
  {
    name: 'generate_tailored_resume',
    category: 'Career Artifacts',
    scope: 'career:write',
    role: 'MEMBER',
    classification: 'Artifact',
    purpose:
      'Synthesize an ATS-optimized tailored resume markdown strictly citing authentic, verified repository evidence.',
    parameters: [
      {
        name: 'jobDescriptionText',
        type: 'string',
        required: true,
        description: 'Target job description.',
      },
      {
        name: 'format',
        type: 'enum (MARKDOWN, PLAIN_TEXT, JSON_RESUME)',
        required: false,
        description: 'Output document format (default: MARKDOWN).',
      },
      {
        name: 'candidateId',
        type: 'string (UUID)',
        required: false,
        description: 'Target candidate UUID.',
      },
    ],
    exampleRpc: {
      method: 'tools/call',
      params: {
        name: 'generate_tailored_resume',
        arguments: {
          jobDescriptionText: 'Staff Cloud Architect with Kubernetes...',
          format: 'MARKDOWN',
        },
      },
    },
    safetyNotes:
      'Passes dual-layer integrity gating: pre-generation ZeroHallucination + post-generation ResumeIntegrityAudit.',
  },
  {
    name: 'draft_cover_letter',
    category: 'Career Artifacts',
    scope: 'career:write',
    role: 'MEMBER',
    classification: 'Artifact',
    purpose:
      'Draft a targeted cover letter weaving authentic commit-pinned code achievements into a compelling application narrative.',
    parameters: [
      {
        name: 'jobDescriptionText',
        type: 'string',
        required: true,
        description: 'Target job posting text.',
      },
      {
        name: 'tone',
        type: 'enum (PROFESSIONAL, CONCISE, CONFIDENT, WARM)',
        required: false,
        description: 'Narrative tone preset.',
      },
      {
        name: 'candidateId',
        type: 'string (UUID)',
        required: false,
        description: 'Target candidate UUID.',
      },
    ],
    exampleRpc: {
      method: 'tools/call',
      params: {
        name: 'draft_cover_letter',
        arguments: { jobDescriptionText: 'Lead AI Engineer at Anthropic...', tone: 'PROFESSIONAL' },
      },
    },
    safetyNotes:
      'Grounds all technical claims in commit-pinned evidence. Zero hallucination of work history.',
  },
  {
    name: 'recommend_portfolio_projects',
    category: 'Career Artifacts',
    scope: 'career:read',
    role: 'READONLY',
    classification: 'Artifact',
    purpose:
      'Select and rank top 3-5 candidate repository codebases optimized for signal complementarity against target job requirements.',
    parameters: [
      {
        name: 'jobDescriptionText',
        type: 'string',
        required: true,
        description: 'Target job description text.',
      },
      {
        name: 'maxProjects',
        type: 'number (1 - 5)',
        required: false,
        description: 'Max recommended projects.',
      },
      {
        name: 'candidateId',
        type: 'string (UUID)',
        required: false,
        description: 'Target candidate UUID.',
      },
    ],
    exampleRpc: {
      method: 'tools/call',
      params: {
        name: 'recommend_portfolio_projects',
        arguments: {
          jobDescriptionText: 'Full Stack Distributed Systems Architect...',
          maxProjects: 3,
        },
      },
    },
    safetyNotes:
      'Evaluates architectural density, test coverage, and engineering depth. Excludes toy tutorials.',
  },

  // Category 3: Career Write (2 tools)
  {
    name: 'propose_project_improvement',
    category: 'Career Write',
    scope: 'career:write',
    role: 'MEMBER',
    classification: 'Write Safety',
    purpose:
      'Analyze repository gap against job requirements, generate a unified diff patch proposal, and issue an HMAC-signed Action Approval Ticket.',
    parameters: [
      {
        name: 'projectId',
        type: 'string (UUID)',
        required: true,
        description: 'Target project codebase UUID.',
      },
      {
        name: 'jobDescriptionText',
        type: 'string',
        required: true,
        description: 'Target job description text.',
      },
      {
        name: 'candidateId',
        type: 'string (UUID)',
        required: false,
        description: 'Target candidate UUID.',
      },
    ],
    exampleRpc: {
      method: 'tools/call',
      params: {
        name: 'propose_project_improvement',
        arguments: {
          projectId: '0190524a-3689-4cd1-a945-22e7c59fa0ff',
          jobDescriptionText: 'Requires Redis distributed caching...',
        },
      },
    },
    safetyNotes:
      'DOES NOT modify GitHub repository. Emits machine-readable STOP instruction and Action Approval Ticket.',
  },
  {
    name: 'confirm_and_create_pr',
    category: 'Career Write',
    scope: 'career:write',
    role: 'MEMBER',
    classification: 'Write Safety',
    purpose:
      'Verify human confirmation, validate Action Approval Ticket signature and expiration, create an isolated branch (feat/career-hub-*), and open a GitHub Draft PR.',
    parameters: [
      {
        name: 'ticketId',
        type: 'string (UUID)',
        required: true,
        description: 'Action Approval Ticket UUID issued by propose_project_improvement.',
      },
      {
        name: 'candidateConfirmation',
        type: 'boolean',
        required: true,
        description: 'Must be explicitly set to true by human.',
      },
    ],
    exampleRpc: {
      method: 'tools/call',
      params: {
        name: 'confirm_and_create_pr',
        arguments: {
          ticketId: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
          candidateConfirmation: true,
        },
      },
    },
    safetyNotes:
      'Strict two-phase gating. Remote HEAD SHA verified. Only opens Draft PRs on isolated branches.',
  },

  // Category 4: Career Tracking (7 tools)
  {
    name: 'track_job_application',
    category: 'Career Tracking',
    scope: 'career:write',
    role: 'MEMBER',
    classification: 'Tracking',
    purpose: 'Create a new tracked job application record in the workspace career pipeline.',
    parameters: [
      { name: 'companyName', type: 'string', required: true, description: 'Target company name.' },
      { name: 'jobTitle', type: 'string', required: true, description: 'Target job title.' },
      {
        name: 'jobDescription',
        type: 'string',
        required: false,
        description: 'Full job description text.',
      },
      { name: 'jobUrl', type: 'string (URL)', required: false, description: 'Job posting URL.' },
      {
        name: 'status',
        type: 'enum (SAVED, APPLIED, INTERVIEWING, OFFER, REJECTED, WITHDRAWN)',
        required: false,
        description: 'Initial status.',
      },
      { name: 'salaryRange', type: 'string', required: false, description: 'Target salary range.' },
      { name: 'location', type: 'string', required: false, description: 'Job location or Remote.' },
    ],
    exampleRpc: {
      method: 'tools/call',
      params: {
        name: 'track_job_application',
        arguments: {
          companyName: 'Stripe',
          jobTitle: 'Senior Infrastructure Engineer',
          status: 'APPLIED',
        },
      },
    },
    safetyNotes: 'Tenant-isolated. Auto-indexes requirements against candidate evidence.',
  },
  {
    name: 'list_active_applications',
    category: 'Career Tracking',
    scope: 'career:read',
    role: 'READONLY',
    classification: 'Tracking',
    purpose: 'List active and historical job applications tracked in the candidate workspace.',
    parameters: [
      {
        name: 'status',
        type: 'enum',
        required: false,
        description: 'Filter by application lifecycle status.',
      },
      { name: 'limit', type: 'number (1 - 50)', required: false, description: 'Results limit.' },
      { name: 'offset', type: 'number', required: false, description: 'Pagination offset.' },
    ],
    exampleRpc: {
      method: 'tools/call',
      params: {
        name: 'list_active_applications',
        arguments: { status: 'INTERVIEWING', limit: 10 },
      },
    },
    safetyNotes: 'Read-only. Output bounded to <= 15 KB.',
  },
  {
    name: 'get_job_application',
    category: 'Career Tracking',
    scope: 'career:read',
    role: 'READONLY',
    classification: 'Tracking',
    purpose:
      'Retrieve full application dossier including timeline stages, interview feedback, and attached tailored document snapshots.',
    parameters: [
      {
        name: 'applicationId',
        type: 'string (UUID)',
        required: true,
        description: 'Application record UUID.',
      },
    ],
    exampleRpc: {
      method: 'tools/call',
      params: {
        name: 'get_job_application',
        arguments: { applicationId: '3c8e42f0-91a6-455b-bfa1-7f8e32906b3e' },
      },
    },
    safetyNotes: '404 default-deny on cross-tenant requests. Output capped to <= 25 KB.',
  },
  {
    name: 'update_application_status',
    category: 'Career Tracking',
    scope: 'career:write',
    role: 'MEMBER',
    classification: 'Tracking',
    purpose:
      'Transition application lifecycle status (e.g. SAVED -> APPLIED -> INTERVIEWING -> OFFER).',
    parameters: [
      {
        name: 'applicationId',
        type: 'string (UUID)',
        required: true,
        description: 'Target application UUID.',
      },
      {
        name: 'status',
        type: 'enum (SAVED, APPLIED, SCREENING, INTERVIEWING, OFFER, REJECTED, WITHDRAWN)',
        required: true,
        description: 'New lifecycle status.',
      },
      { name: 'notes', type: 'string', required: false, description: 'Status transition notes.' },
    ],
    exampleRpc: {
      method: 'tools/call',
      params: {
        name: 'update_application_status',
        arguments: {
          applicationId: '3c8e42f0-91a6-455b-bfa1-7f8e32906b3e',
          status: 'INTERVIEWING',
          notes: 'Recruiter screen scheduled.',
        },
      },
    },
    safetyNotes: 'Records audit log event and timestamp transitions.',
  },
  {
    name: 'add_application_stage',
    category: 'Career Tracking',
    scope: 'career:write',
    role: 'MEMBER',
    classification: 'Tracking',
    purpose:
      'Add a new interview or evaluation stage (e.g. SCREENING, TECHNICAL, SYSTEM_DESIGN, BEHAVIORAL, EXECUTIVE) to an application.',
    parameters: [
      {
        name: 'applicationId',
        type: 'string (UUID)',
        required: true,
        description: 'Application UUID.',
      },
      {
        name: 'stageType',
        type: 'enum (SCREENING, TECHNICAL_SCREEN, SYSTEM_DESIGN, CODING_CHALLENGE, ONSITE, BEHAVIORAL, EXECUTIVE, OFFER_NEGOTIATION)',
        required: true,
        description: 'Interview stage type.',
      },
      {
        name: 'scheduledAt',
        type: 'string (ISO 8601 Date)',
        required: false,
        description: 'Scheduled date and time.',
      },
      {
        name: 'interviewerName',
        type: 'string',
        required: false,
        description: 'Interviewer name or panel.',
      },
    ],
    exampleRpc: {
      method: 'tools/call',
      params: {
        name: 'add_application_stage',
        arguments: {
          applicationId: '3c8e42f0-91a6-455b-bfa1-7f8e32906b3e',
          stageType: 'SYSTEM_DESIGN',
          interviewerName: 'Principal Engineer',
        },
      },
    },
    safetyNotes: 'Enforces maximum 15 stages per application.',
  },
  {
    name: 'update_application_stage_outcome',
    category: 'Career Tracking',
    scope: 'career:write',
    role: 'MEMBER',
    classification: 'Tracking',
    purpose:
      'Record the outcome (PASSED, REJECTED, CANCELLED, WAITING) and qualitative feedback for an interview stage.',
    parameters: [
      { name: 'stageId', type: 'string (UUID)', required: true, description: 'Stage UUID.' },
      {
        name: 'outcome',
        type: 'enum (PASSED, REJECTED, CANCELLED, WAITING)',
        required: true,
        description: 'Stage evaluation outcome.',
      },
      {
        name: 'feedback',
        type: 'string',
        required: false,
        description: 'Technical feedback or debrief notes.',
      },
    ],
    exampleRpc: {
      method: 'tools/call',
      params: {
        name: 'update_application_stage_outcome',
        arguments: {
          stageId: '7f9a1b2c-3d4e-5f6a-7b8c-9d0e1f2a3b4c',
          outcome: 'PASSED',
          feedback: 'Deep knowledge of distributed consensus.',
        },
      },
    },
    safetyNotes: 'Tenant-bound update. Scrubbed against secret leakage.',
  },
  {
    name: 'attach_application_document',
    category: 'Career Tracking',
    scope: 'career:write',
    role: 'MEMBER',
    classification: 'Tracking',
    purpose:
      'Attach an immutable tailored resume, cover letter, or case study document snapshot to a tracked application record.',
    parameters: [
      {
        name: 'applicationId',
        type: 'string (UUID)',
        required: true,
        description: 'Application UUID.',
      },
      {
        name: 'documentType',
        type: 'enum (TAILORED_RESUME, COVER_LETTER, PORTFOLIO_NOTE, OTHER)',
        required: true,
        description: 'Document type.',
      },
      { name: 'content', type: 'string', required: true, description: 'Document content text.' },
      { name: 'title', type: 'string', required: false, description: 'Document title label.' },
    ],
    exampleRpc: {
      method: 'tools/call',
      params: {
        name: 'attach_application_document',
        arguments: {
          applicationId: '3c8e42f0-91a6-455b-bfa1-7f8e32906b3e',
          documentType: 'TAILORED_RESUME',
          title: 'Stripe Tailored Resume v1',
          content: '# Alex Mercer\n\n...',
        },
      },
    },
    safetyNotes: 'Encrypted storage with immutable SHA-256 content hash.',
  },
];

/**
 * Returns badge markup for tool classification.
 *
 * @param {string} classification
 * @returns {string}
 */
function renderClassificationBadge(classification) {
  switch (classification) {
    case 'Read':
      return `<span class="badge badge-cyan">Read</span>`;
    case 'Artifact':
      return `<span class="badge badge-indigo">Artifact</span>`;
    case 'Write Safety':
      return `<span class="badge badge-verified">Write Safety</span>`;
    case 'Tracking':
      return `<span class="badge badge-amber">Tracking</span>`;
    default:
      return `<span class="badge">${escapeHtml(classification)}</span>`;
  }
}

/**
 * Renders the public MCP documentation page HTML.
 *
 * @param {object} [params={}]
 * @param {object|null} [params.user=null] Authenticated user object if logged in
 * @returns {string} Full HTML document
 */
export function renderMcpDocsPage({ user = null } = {}) {
  const content = `
    <div class="container" style="max-width: 1080px; margin: 20px auto 80px;">
      <!-- Hero Header -->
      <div style="margin-bottom: 2.5rem;">
        <div style="display: inline-flex; align-items: center; gap: 8px; background: rgba(99, 102, 241, 0.12); border: 1px solid rgba(99, 102, 241, 0.3); border-radius: 9999px; padding: 4px 14px; margin-bottom: 1rem;">
          <span style="font-size: 0.75rem; font-weight: 600; color: #818cf8; text-transform: uppercase; letter-spacing: 0.05em;">
            Model Context Protocol Specification 2026-07-28
          </span>
        </div>
        <h1 style="font-size: 2.25rem; font-weight: 800; color: #f8fafc; letter-spacing: -0.02em; margin-bottom: 0.75rem;">
          Universal MCP Server Documentation
        </h1>
        <p style="color: #94a3b8; font-size: 1.05rem; line-height: 1.6; max-width: 800px;">
          Antigravity Career Hub exposes a standards-compliant remote Model Context Protocol (MCP) server over Streamable HTTP transport, empowering Anthropic Claude, OpenAI ChatGPT, and Google Gemini with verified candidate career intelligence.
        </p>
      </div>

      <!-- Quick Reference Specs Box -->
      <div class="card" style="margin-bottom: 3rem; background: linear-gradient(180deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.8) 100%);">
        <h3 style="font-size: 1.1rem; font-weight: 700; color: #f8fafc; margin-bottom: 1.25rem;">Universal Protocol Endpoints</h3>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1.25rem; font-size: 0.875rem;">
          <div>
            <span style="color: #64748b; font-size: 0.75rem; text-transform: uppercase; font-weight: 600;">Streamable MCP Endpoint</span>
            <div style="margin-top: 4px;"><code>POST /mcp</code> (JSON-RPC 2.0)</div>
          </div>
          <div>
            <span style="color: #64748b; font-size: 0.75rem; text-transform: uppercase; font-weight: 600;">Transport Protocol</span>
            <div style="margin-top: 4px;"><span class="badge badge-indigo">Streamable HTTP / SSE</span></div>
          </div>
          <div>
            <span style="color: #64748b; font-size: 0.75rem; text-transform: uppercase; font-weight: 600;">OAuth 2.1 Server Metadata</span>
            <div style="margin-top: 4px;"><code>/.well-known/oauth-authorization-server</code></div>
          </div>
          <div>
            <span style="color: #64748b; font-size: 0.75rem; text-transform: uppercase; font-weight: 600;">RFC 9728 Protected Resource</span>
            <div style="margin-top: 4px;"><code>/.well-known/oauth-protected-resource</code></div>
          </div>
        </div>

        <div style="margin-top: 1.25rem; padding-top: 1rem; border-top: 1px solid var(--border-subtle); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem;">
          <div style="font-size: 0.85rem; color: #94a3b8;">
            Total Registered Tools: <strong style="color: #f8fafc;">16 Tools</strong> across 4 functional domains.
          </div>
          <a href="/connect" class="btn btn-primary btn-sm">
            <span>Open AI Connection Center →</span>
          </a>
        </div>
      </div>

      <!-- Navigation Jump Links -->
      <div style="display: flex; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 2.5rem;">
        <a href="#tools" class="btn btn-secondary btn-sm">⚡ 16-Tool Catalog</a>
        <a href="#auth" class="btn btn-secondary btn-sm">🔑 Authentication & Scopes</a>
        <a href="#write-safety" class="btn btn-secondary btn-sm">🛡️ Two-Phase Write Safety</a>
        <a href="#clients" class="btn btn-secondary btn-sm">🟣 Claude & ChatGPT Setup</a>
        <a href="#roadmap" class="btn btn-secondary btn-sm">🗺️ Roadmap & Standards</a>
      </div>

      <!-- Section 1: Complete 16-Tool Catalog -->
      <section id="tools" style="margin-bottom: 3.5rem;">
        <div style="display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.25rem;">
          <div>
            <h2 style="font-size: 1.5rem; font-weight: 700; color: #f8fafc; margin-bottom: 0.25rem;">
              1. Complete MCP Tool Catalog (${TOOLS_CATALOG.length} Tools)
            </h2>
            <p style="color: #94a3b8; font-size: 0.9rem;">
              Filter by category or search tool names and capabilities. All tools enforce multi-tenant default-deny isolation.
            </p>
          </div>

          <!-- Real-Time Tool Search Filter -->
          <div style="min-width: 260px;">
            <input type="text" id="toolSearchInput" onkeyup="filterTools()" placeholder="🔍 Filter tools (e.g. resume, pr, fit)..." class="form-control" style="font-size: 0.85rem; padding: 0.5rem 0.85rem;">
          </div>
        </div>

        <!-- Interactive Category Filter Chips -->
        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1.5rem;" id="categoryFilterContainer">
          <button type="button" class="btn btn-secondary btn-sm active" onclick="filterCategory('ALL', this)" style="font-size: 0.8rem;">All (${TOOLS_CATALOG.length})</button>
          <button type="button" class="btn btn-secondary btn-sm" onclick="filterCategory('Career Read', this)" style="font-size: 0.8rem;">Career Read (4)</button>
          <button type="button" class="btn btn-secondary btn-sm" onclick="filterCategory('Career Artifacts', this)" style="font-size: 0.8rem;">Career Artifacts (3)</button>
          <button type="button" class="btn btn-secondary btn-sm" onclick="filterCategory('Career Write', this)" style="font-size: 0.8rem;">Career Write (2)</button>
          <button type="button" class="btn btn-secondary btn-sm" onclick="filterCategory('Career Tracking', this)" style="font-size: 0.8rem;">Career Tracking (7)</button>
        </div>

        <!-- Tool Cards Container -->
        <div style="display: flex; flex-direction: column; gap: 1rem;" id="toolsList">
          ${TOOLS_CATALOG.map(
            (t) => `
            <div class="card tool-card" data-category="${escapeHtml(t.category)}" data-name="${escapeHtml(t.name)}" data-purpose="${escapeHtml(t.purpose)}" style="background: rgba(15, 23, 42, 0.6); padding: 1.25rem;">
              <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 0.75rem; margin-bottom: 0.75rem;">
                <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
                  <code style="font-size: 1rem; font-weight: 600; color: #38bdf8; background: rgba(56, 189, 248, 0.1); padding: 3px 8px; border-radius: 4px; border: 1px solid rgba(56, 189, 248, 0.25);">
                    ${escapeHtml(t.name)}
                  </code>
                  ${renderClassificationBadge(t.classification)}
                  <span class="badge" style="background: rgba(255, 255, 255, 0.05); color: #94a3b8; font-size: 0.7rem;">${escapeHtml(t.category)}</span>
                </div>

                <div style="display: flex; gap: 0.5rem; align-items: center; font-size: 0.8rem;">
                  <span style="color: #64748b;">Scope:</span>
                  <code>${escapeHtml(t.scope)}</code>
                  <span class="badge" style="background: rgba(99, 102, 241, 0.15); color: #818cf8; font-size: 0.7rem;">Role >= ${escapeHtml(t.role)}</span>
                </div>
              </div>

              <p style="color: #cbd5e1; font-size: 0.9rem; line-height: 1.5; margin-bottom: 1rem;">
                ${escapeHtml(t.purpose)}
              </p>

              <!-- Parameters Table & Example Accordion -->
              <details style="background: rgba(0, 0, 0, 0.25); border-radius: 6px; padding: 0.75rem; border: 1px solid var(--border-subtle); font-size: 0.825rem;">
                <summary style="cursor: pointer; color: #818cf8; font-weight: 500;">
                  Parameters (${t.parameters.length}) & JSON-RPC Payload Example
                </summary>

                <div style="margin-top: 0.75rem;">
                  <h5 style="color: #94a3b8; font-size: 0.75rem; text-transform: uppercase; margin-bottom: 0.5rem;">Input Parameters</h5>
                  <div class="table-responsive" style="margin-bottom: 0.75rem;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 0.8rem;">
                      <thead>
                        <tr style="border-bottom: 1px solid var(--border-subtle); color: #64748b;">
                          <th style="padding: 6px 8px; text-align: left;">Parameter</th>
                          <th style="padding: 6px 8px; text-align: left;">Type</th>
                          <th style="padding: 6px 8px; text-align: left;">Required</th>
                          <th style="padding: 6px 8px; text-align: left;">Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${t.parameters
                          .map(
                            (p) => `
                          <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.04);">
                            <td style="padding: 6px 8px;"><code>${escapeHtml(p.name)}</code></td>
                            <td style="padding: 6px 8px; color: #38bdf8;">${escapeHtml(p.type)}</td>
                            <td style="padding: 6px 8px;">${p.required ? '<span style="color:#f87171; font-weight:600;">Yes</span>' : '<span style="color:#64748b;">Optional</span>'}</td>
                            <td style="padding: 6px 8px; color: #cbd5e1;">${escapeHtml(p.description)}</td>
                          </tr>
                        `
                          )
                          .join('')}
                      </tbody>
                    </table>
                  </div>

                  <h5 style="color: #94a3b8; font-size: 0.75rem; text-transform: uppercase; margin-bottom: 0.5rem;">JSON-RPC Invocation Example</h5>
                  <pre style="background: rgba(15, 23, 42, 0.9); padding: 0.75rem; border-radius: 6px; font-size: 0.75rem; overflow-x: auto; color: #a5f3fc; border: 1px solid var(--border-subtle);">${escapeHtml(JSON.stringify(t.exampleRpc, null, 2))}</pre>

                  <div style="margin-top: 0.5rem; font-size: 0.775rem; color: #94a3b8;">
                    <strong>Safety & Integrity:</strong> ${escapeHtml(t.safetyNotes)}
                  </div>
                </div>
              </details>
            </div>
          `
          ).join('')}
        </div>
      </section>

      <!-- Section 2: Authentication & Scopes -->
      <section id="auth" style="margin-bottom: 3.5rem;">
        <h2 style="font-size: 1.5rem; font-weight: 700; color: #f8fafc; margin-bottom: 0.5rem;">
          2. Authentication, OAuth 2.1 & Scopes
        </h2>
        <p style="color: #94a3b8; font-size: 0.95rem; line-height: 1.6; margin-bottom: 1.5rem;">
          Career Hub supports two official authentication mechanisms. All MCP endpoints require an <code>Authorization: Bearer &lt;token&gt;</code> header.
        </p>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.5rem; margin-bottom: 2rem;">
          <!-- OAuth 2.1 PKCE Card -->
          <div class="card">
            <h3 style="font-size: 1.1rem; font-weight: 600; color: #818cf8; margin-bottom: 0.5rem;">
              OAuth 2.1 Authorization Code + PKCE
            </h3>
            <p style="font-size: 0.85rem; color: #94a3b8; line-height: 1.5; margin-bottom: 1rem;">
              Primary method for Anthropic Claude and OpenAI ChatGPT. Clients discover authorization server metadata and perform secure user-interactive login with PKCE S256 challenge.
            </p>
            <div style="background: rgba(15, 23, 42, 0.6); padding: 0.75rem; border-radius: 6px; font-size: 0.8rem; border: 1px solid var(--border-subtle);">
              <div><code>GET /.well-known/oauth-authorization-server</code></div>
              <div style="margin-top: 4px;"><code>GET /.well-known/oauth-protected-resource</code></div>
            </div>
          </div>

          <!-- Personal API Token Card -->
          <div class="card">
            <h3 style="font-size: 1.1rem; font-weight: 600; color: #22d3ee; margin-bottom: 0.5rem;">
              Personal MCP API Tokens
            </h3>
            <p style="font-size: 0.85rem; color: #94a3b8; line-height: 1.5; margin-bottom: 1rem;">
              For Google Gemini agents, Antigravity SDK, and IDE extensions. Generated from the Connection Center with role scope ceiling enforcement and stored as SHA-256 hashes.
            </p>
            <div style="background: rgba(15, 23, 42, 0.6); padding: 0.75rem; border-radius: 6px; font-size: 0.8rem; border: 1px solid var(--border-subtle);">
              <div>Format: <code>mcp_live_&lt;32-byte-hex&gt;</code></div>
              <div style="margin-top: 4px;">Quota: Maximum 10 active tokens per candidate</div>
            </div>
          </div>
        </div>

        <!-- Scopes Table -->
        <div class="card" style="padding: 0; overflow: hidden; margin-bottom: 1.5rem;">
          <table style="width: 100%; border-collapse: collapse; font-size: 0.875rem; text-align: left;">
            <thead>
              <tr style="background: rgba(255, 255, 255, 0.02); border-bottom: 1px solid var(--border-subtle); color: #64748b;">
                <th style="padding: 10px 16px;">Scope Identifier</th>
                <th style="padding: 10px 16px;">Role Required</th>
                <th style="padding: 10px 16px;">Permitted Operations</th>
              </tr>
            </thead>
            <tbody>
              <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.04);">
                <td style="padding: 10px 16px;"><code>career:read</code></td>
                <td style="padding: 10px 16px;"><span class="badge" style="background: rgba(255, 255, 255, 0.05); color: #94a3b8;">READONLY</span></td>
                <td style="padding: 10px 16px; color: #cbd5e1;">Inspect candidate profile, AST-verified skills, evidence items, job fit scores, portfolio rankings, and active application lists.</td>
              </tr>
              <tr>
                <td style="padding: 10px 16px;"><code>career:write</code></td>
                <td style="padding: 10px 16px;"><span class="badge badge-indigo">MEMBER</span></td>
                <td style="padding: 10px 16px; color: #cbd5e1;">Synthesize tailored resumes, draft cover letters, track job applications, update pipeline stages, propose diff improvements, and confirm GitHub Draft PRs.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Section 3: Two-Phase Write Safety -->
      <section id="write-safety" style="margin-bottom: 3.5rem;">
        <h2 style="font-size: 1.5rem; font-weight: 700; color: #f8fafc; margin-bottom: 0.5rem;">
          3. Two-Phase Write Safety State Machine
        </h2>
        <p style="color: #94a3b8; font-size: 0.95rem; line-height: 1.6; margin-bottom: 1.5rem;">
          To guarantee zero unauthorized code modifications, Career Hub strictly implements an <strong>Inverse Authority State Machine</strong>:
        </p>

        <div class="card" style="border-left: 4px solid #10b981; background: rgba(16, 185, 129, 0.03);">
          <div style="font-family: var(--font-mono); font-size: 0.85rem; color: #6ee7b7; background: rgba(15, 23, 42, 0.8); padding: 1.25rem; border-radius: 8px; border: 1px solid var(--border-subtle); line-height: 1.8; margin-bottom: 1.25rem;">
            [1. AI Proposes Improvement]  --> calls: propose_project_improvement<br>
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;|<br>
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;v<br>
            [2. Server Gating Kernel]     --> Generates Unified Diff + Action Approval Ticket (HMAC-SHA256 signed)<br>
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;|<br>
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;v<br>
            [3. Candidate Review]         --> Candidate inspects exact diff in chat UI or web console<br>
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;|<br>
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;v<br>
            [4. Candidate Confirms]       --> AI calls: confirm_and_create_pr(ticketId, candidateConfirmation: true)<br>
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;|<br>
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;v<br>
            [5. Server Verification]      --> Verifies ticket signature, expiry, and remote HEAD SHA<br>
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;|<br>
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;v<br>
            [6. GitHub Draft PR Opened]   --> Creates branch: feat/career-hub-* & opens Draft Pull Request
          </div>

          <div style="font-size: 0.875rem; color: #94a3b8; line-height: 1.6;">
            <strong>Absolute Write Boundary:</strong> AI hosts possess zero raw Git credentials and zero authority to execute direct commits, create arbitrary branches, or bypass approval tickets.
          </div>
        </div>
      </section>

      <!-- Section 4: AI Client Setup Guides -->
      <section id="clients" style="margin-bottom: 3.5rem;">
        <h2 style="font-size: 1.5rem; font-weight: 700; color: #f8fafc; margin-bottom: 0.5rem;">
          4. AI Client Setup & Configuration
        </h2>
        <p style="color: #94a3b8; font-size: 0.95rem; line-height: 1.6; margin-bottom: 1.5rem;">
          Step-by-step guides for connecting Claude, ChatGPT, and Gemini.
        </p>

        <div style="display: flex; flex-direction: column; gap: 1.5rem;">
          <!-- Claude Setup Guide -->
          <div class="card" id="claude">
            <h3 style="font-size: 1.15rem; font-weight: 600; color: #818cf8; margin-bottom: 0.75rem;">
              Anthropic Claude Setup (Claude.ai & Claude Desktop)
            </h3>
            <div style="font-size: 0.875rem; color: #cbd5e1; line-height: 1.6;">
              <p style="margin-bottom: 0.75rem;">
                <strong>Option A: Claude Desktop Configuration</strong> (<code>claude_desktop_config.json</code>):
              </p>
              <pre style="background: rgba(15, 23, 42, 0.9); padding: 0.85rem; border-radius: 6px; font-size: 0.8rem; overflow-x: auto; color: #a5f3fc; border: 1px solid var(--border-subtle); margin-bottom: 1rem;">{
  "mcpServers": {
    "antigravity-career-hub": {
      "url": "http://localhost:3000/mcp"
    }
  }
}</pre>
              <p>
                <strong>Option B: Claude.ai (Web SaaS)</strong>: Open Settings -> Connectors -> Add Custom Connector. Enter your public HTTPS URL (e.g. via Cloudflare Tunnel) and complete OAuth 2.1 login.
              </p>
            </div>
          </div>

          <!-- ChatGPT Setup Guide -->
          <div class="card" id="chatgpt">
            <h3 style="font-size: 1.15rem; font-weight: 600; color: #34d399; margin-bottom: 0.75rem;">
              OpenAI ChatGPT Setup (Custom GPTs & Actions)
            </h3>
            <div style="font-size: 0.875rem; color: #cbd5e1; line-height: 1.6;">
              <ol style="margin-left: 1.2rem; display: flex; flex-direction: column; gap: 0.5rem;">
                <li>Open <strong>ChatGPT Explore GPTs</strong> -> Create/Edit Custom GPT -> Configure Tab.</li>
                <li>Add Action pointing to your remote MCP server URL.</li>
                <li>Set Authentication Type to <strong>OAuth</strong> with Client ID <code>chatgpt-web</code>.</li>
                <li>Callback URL: <code>https://chatgpt.com/api/mcp/oauth_callback</code>.</li>
              </ol>
            </div>
          </div>

          <!-- Gemini Setup Guide -->
          <div class="card" id="gemini">
            <h3 style="font-size: 1.15rem; font-weight: 600; color: #22d3ee; margin-bottom: 0.75rem;">
              Google Gemini & Antigravity SDK Setup
            </h3>
            <div style="font-size: 0.875rem; color: #cbd5e1; line-height: 1.6;">
              <p style="margin-bottom: 0.5rem;">
                Generate a Personal MCP API Token in the <a href="/connect" style="color:#22d3ee;">Connection Center</a> and pass it via standard Bearer authorization header:
              </p>
              <pre style="background: rgba(15, 23, 42, 0.9); padding: 0.85rem; border-radius: 6px; font-size: 0.8rem; overflow-x: auto; color: #a5f3fc; border: 1px solid var(--border-subtle);">curl -X POST http://localhost:3000/mcp \
  -H "Authorization: Bearer mcp_live_4a8b..." \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":"1","method":"tools/call","params":{"name":"list_verified_skills","arguments":{}}}'</pre>
            </div>
          </div>
        </div>
      </section>

      <!-- Section 5: Official MCP Registry & MCP Apps Architecture -->
      <section id="registry-and-apps" style="margin-bottom: 3.5rem;">
        <h2 style="font-size: 1.5rem; font-weight: 700; color: #f8fafc; margin-bottom: 0.5rem;">
          5. Official MCP Registry Metadata & MCP Apps (SEP-1865)
        </h2>
        <p style="color: #94a3b8; font-size: 0.95rem; line-height: 1.6; margin-bottom: 1.5rem;">
          Standards-compliant metadata for decentralized discovery on <code>registry.modelcontextprotocol.io</code> and interactive sandboxed UI extensions.
        </p>

        <!-- Subsection 5.1: MCP Registry Metadata -->
        <div class="card" style="margin-bottom: 1.5rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
            <h3 style="font-size: 1.125rem; font-weight: 600; color: #f8fafc;">5.1 Official Registry Manifest (<code>server.json</code>)</h3>
            <span class="badge badge-claimed">PLANNED / NOT PUBLISHED</span>
          </div>
          <p style="font-size: 0.875rem; color: #94a3b8; line-height: 1.6; margin-bottom: 1rem;">
            Conforms strictly to the official MCP Registry schema (<code>https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json</code>). Publication to the public registry is gated on Phase 14 public staging deployment with verified custom domain ownership.
          </p>

          <pre style="background: #020617; border: 1px solid #334155; border-radius: 8px; padding: 1rem; color: #38bdf8; font-family: var(--font-mono); font-size: 0.8rem; overflow-x: auto; margin-bottom: 1rem;">{
  "$schema": "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
  "name": "ai.careerhub/mcp-server",
  "title": "Antigravity Career Hub",
  "version": "0.1.0",
  "transport": {
    "type": "http",
    "url": "https://staging.careerhub.ai/mcp",
    "protocolVersion": "2026-07-28"
  },
  "authentication": {
    "type": "oauth2",
    "discoveryUrl": "https://staging.careerhub.ai/.well-known/oauth-authorization-server",
    "scopes": { "career:read": "Read verified evidence graph", "career:write": "Generate career artifacts" }
  },
  "capabilities": {
    "tools": true,
    "resources": true,
    "prompts": true,
    "extensions": {
      "io.modelcontextprotocol/ui": {
        "version": "1.0.0",
        "resources": ["ui://career-hub/job-fit-radar/v1"]
      }
    }
  },
  "status": "PLANNED / NOT PUBLISHED"
}</pre>
        </div>

        <!-- Subsection 5.2: MCP Apps UI Extension -->
        <div class="card" style="margin-bottom: 1.5rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
            <h3 style="font-size: 1.125rem; font-weight: 600; color: #f8fafc;">5.2 MCP Apps UI Extension (<code>io.modelcontextprotocol/ui</code>)</h3>
            <span class="badge badge-verified">OPERATIONAL (MVP)</span>
          </div>
          <p style="font-size: 0.875rem; color: #94a3b8; line-height: 1.6; margin-bottom: 1rem;">
            Implements <strong>SEP-1865</strong> (Model Context Protocol Apps). The Career Hub server exposes interactive UI widgets rendered in sandboxed iframes inside compatible AI clients.
          </p>

          <div style="background: rgba(15, 23, 42, 0.6); border: 1px solid #334155; border-radius: 8px; padding: 1rem; margin-bottom: 1rem;">
            <h4 style="font-size: 0.9rem; font-weight: 600; color: #f8fafc; margin-bottom: 0.5rem;">Job Fit Radar MVP (<code>ui://career-hub/job-fit-radar/v1</code>)</h4>
            <ul style="color: #94a3b8; font-size: 0.85rem; line-height: 1.6; padding-left: 1.25rem;">
              <li><strong>Linked Tool</strong>: <code>analyze_job_fit</code> (via <code>_meta.ui.resourceUri</code>).</li>
              <li><strong>MIME Profile</strong>: <code>text/html;profile=mcp-app</code>.</li>
              <li><strong>Security Sandbox</strong>: Zero write access, strict CSP (<code>connect-src 'none'</code>), zero external CDN/font dependencies, strict HTML entity escaping.</li>
              <li><strong>Visual Components</strong>: Interactive 6-axis SVG Radar Chart, circular ATS score gauge, matched/missing skill chips, and prioritized remediation gap cards.</li>
              <li><strong>Graceful Fallback</strong>: Hosts without MCP Apps support automatically receive the complete standard text/markdown analysis response without disruption.</li>
            </ul>
          </div>

          <h4 style="font-size: 0.9rem; font-weight: 600; color: #f8fafc; margin-bottom: 0.75rem;">Host Compatibility Matrix</h4>
          <div style="overflow-x: auto;">
            <table class="table" style="font-size: 0.825rem;">
              <thead>
                <tr>
                  <th>AI Host</th>
                  <th>Remote MCP</th>
                  <th>OAuth 2.1</th>
                  <th>MCP Apps (UI)</th>
                  <th>Known Constraints</th>
                  <th>Fallback Behavior</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Claude Web</strong></td>
                  <td><span class="badge badge-verified">YES</span></td>
                  <td><span class="badge badge-verified">YES (PKCE)</span></td>
                  <td><span class="badge badge-verified">YES</span></td>
                  <td>Requires public HTTPS tunnel (Cloudflare/staging)</td>
                  <td>Standard text/markdown tool output</td>
                </tr>
                <tr>
                  <td><strong>Claude Desktop</strong></td>
                  <td><span class="badge badge-verified">YES</span></td>
                  <td><span class="badge badge-verified">YES (PKCE)</span></td>
                  <td><span class="badge badge-verified">YES</span></td>
                  <td>Direct streamable HTTP support</td>
                  <td>Standard text/markdown tool output</td>
                </tr>
                <tr>
                  <td><strong>ChatGPT</strong></td>
                  <td><span class="badge badge-verified">YES</span></td>
                  <td><span class="badge badge-verified">YES (RFC 9728)</span></td>
                  <td><span class="badge badge-verified">YES (Apps SDK)</span></td>
                  <td>Requires public HTTPS callback URL</td>
                  <td>Structured JSON / markdown output</td>
                </tr>
                <tr>
                  <td><strong>Google Gemini</strong></td>
                  <td><span class="badge badge-verified">YES</span></td>
                  <td><span class="badge badge-claimed">PERSONAL TOKEN</span></td>
                  <td><span class="badge badge-claimed">CLI / SDK ONLY</span></td>
                  <td>Consumer Web UI does not yet host custom MCP Apps iframes</td>
                  <td>Standard CLI/SDK JSON-RPC tool result</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- Section 6: Roadmap & Architectural Standards -->
      <section id="roadmap" style="margin-bottom: 3.5rem;">
        <h2 style="font-size: 1.5rem; font-weight: 700; color: #f8fafc; margin-bottom: 0.5rem;">
          6. Roadmap & Architectural Boundaries
        </h2>
        <p style="color: #94a3b8; font-size: 0.95rem; line-height: 1.6; margin-bottom: 1.5rem;">
          Explicit distinction between currently implemented features and future planned capabilities.
        </p>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.5rem;">
          <div class="card" style="border-left: 3px solid #6366f1;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
              <h4 style="font-size: 1rem; font-weight: 600; color: #f8fafc;">Remote MCP Server & Tools</h4>
              <span class="badge badge-verified">AVAILABLE</span>
            </div>
            <p style="font-size: 0.825rem; color: #94a3b8; line-height: 1.5;">
              All 16 registered tools, Streamable HTTP JSON-RPC 2.0 protocol, and OAuth 2.1 RFC 8414 / RFC 9728 discovery are fully operational.
            </p>
          </div>

          <div class="card" style="border-left: 3px solid #10b981;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
              <h4 style="font-size: 1rem; font-weight: 600; color: #f8fafc;">MCP Apps UI Extension (MVP)</h4>
              <span class="badge badge-verified">AVAILABLE</span>
            </div>
            <p style="font-size: 0.825rem; color: #94a3b8; line-height: 1.5;">
              Sandboxed <code>ui://career-hub/job-fit-radar/v1</code> visual radar chart and ATS scoring widget for <code>analyze_job_fit</code> (SEP-1865).
            </p>
          </div>

          <div class="card" style="border-left: 3px solid #f59e0b; opacity: 0.85;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
              <h4 style="font-size: 1rem; font-weight: 600; color: #f8fafc;">Official MCP Registry Listing</h4>
              <span class="badge badge-claimed">PLANNED / NOT PUBLISHED</span>
            </div>
            <p style="font-size: 0.825rem; color: #94a3b8; line-height: 1.5;">
              Public listing on <code>registry.modelcontextprotocol.io</code> via verified <code>server.json</code> metadata (scheduled for Phase 14 public staging).
            </p>
          </div>
        </div>
      </section>
    </div>

    <!-- Client-Side Real-Time Filter Script -->
    <script>
      let activeCategory = 'ALL';

      function filterCategory(cat, btn) {
        activeCategory = cat;
        const container = document.getElementById('categoryFilterContainer');
        if (container) {
          container.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        }
        if (btn) btn.classList.add('active');
        filterTools();
      }

      function filterTools() {
        const query = (document.getElementById('toolSearchInput')?.value || '').toLowerCase().trim();
        const cards = document.querySelectorAll('.tool-card');

        cards.forEach(card => {
          const cat = card.getAttribute('data-category') || '';
          const name = (card.getAttribute('data-name') || '').toLowerCase();
          const purpose = (card.getAttribute('data-purpose') || '').toLowerCase();

          const matchesCategory = (activeCategory === 'ALL' || cat === activeCategory);
          const matchesQuery = !query || name.includes(query) || purpose.includes(query);

          if (matchesCategory && matchesQuery) {
            card.style.display = 'block';
          } else {
            card.style.display = 'none';
          }
        });
      }
    </script>
  `;

  return renderLayout({
    title: 'Model Context Protocol (MCP) Documentation — Antigravity Career Hub',
    content,
    activeNav: 'docs',
    user,
  });
}
