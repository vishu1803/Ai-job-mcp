/**
 * @file Public Developer Documentation Page View Template (/docs/mcp).
 *
 * Implements comprehensive developer-facing documentation:
 * 1. Protocol Specification (Streamable HTTP, JSON-RPC 2.0, 2026-07-28 Spec).
 * 2. Universal MCP Endpoint & Local Development vs Staging Guide.
 * 3. OAuth 2.1 RFC 8414 / RFC 9728 Discovery & Personal Token Authentication.
 * 4. Complete 26-Tool Catalog across 6 functional domains with interactive filter and search.
 * 5. Complete 8-Resource & 4-Prompt Registry with URI schemas and safety boundaries.
 * 6. Two-Phase Write Safety & Stopping Protocol deep-dive.
 * 7. Official MCP Registry & MCP Apps Architecture (SEP-1865).
 */

import { renderLayout } from './layout.js';
import { escapeHtml } from '../utils/html-escaper.js';

/**
 * 26 Registered MCP Tool Definitions with parameters, scopes, and JSON-RPC examples.
 */
export const TOOLS_CATALOG = [
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
        required: true,
        description: 'Target project UUID to inspect.',
      },
      {
        name: 'candidateId',
        type: 'string (UUID)',
        required: false,
        description: 'Target candidate UUID. Defaults to authenticated candidate.',
      },
      {
        name: 'evidenceType',
        type: 'enum (PACKAGE_MANIFEST_DEPENDENCY, CODE_IMPORT_USAGE, CODE_USAGE, etc.)',
        required: false,
        description: 'Optional filter by evidence extraction type.',
      },
      {
        name: 'skillSlug',
        type: 'string',
        required: false,
        description: 'Optional filter by canonical skill slug (e.g. "postgresql").',
      },
      {
        name: 'page',
        type: 'number (1-indexed)',
        required: false,
        description: 'Page number for evidence pagination (default: 1).',
      },
      {
        name: 'pageSize',
        type: 'number (1 - 20)',
        required: false,
        description: 'Evidence items per page (default: 10, max: 20).',
      },
    ],
    exampleRpc: {
      method: 'tools/call',
      params: {
        name: 'inspect_project_evidence',
        arguments: {
          projectId: '0190524a-3689-4cd1-a945-22e7c59fa0ff',
          pageSize: 10,
        },
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
    parameters: [
      {
        name: 'ticketId',
        type: 'string (UUID)',
        required: true,
        description: 'Action Approval Ticket UUID issued by propose_project_improvement.',
      },
      {
        name: 'confirmed',
        type: 'boolean (literal true)',
        required: true,
        description: 'Explicit human confirmation flag. Must be strictly boolean true.',
      },
      {
        name: 'idempotencyKey',
        type: 'string (16 - 128 chars)',
        required: false,
        description: 'Optional client-supplied idempotency key to safely retry requests.',
      },
      {
        name: 'userNotes',
        type: 'string',
        required: false,
        description: 'Optional human reviewer audit notes recorded in ticket history.',
      },
    ],
    exampleRpc: {
      method: 'tools/call',
      params: {
        name: 'confirm_and_create_pr',
        arguments: {
          ticketId: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
          confirmed: true,
        },
      },
    },
    safetyNotes:
      'Strict two-phase gating with cryptographic Approval Ticket verification. Remote HEAD SHA verified. Only opens Draft PRs on isolated branches.',
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
        name: 'candidateId',
        type: 'string (UUID)',
        required: false,
        description: 'Optional candidate UUID. Defaults to authenticated candidate.',
      },
      { name: 'jobUrl', type: 'string (URL)', required: false, description: 'Job posting URL.' },
      {
        name: 'source',
        type: 'enum (LINKEDIN, INDEED, COMPANY_CAREERS, REFERRAL, RECRUITER, MANUAL, OTHER)',
        required: false,
        description: 'Lead origin (default: MANUAL).',
      },
      { name: 'location', type: 'string', required: false, description: 'Geographical location.' },
      {
        name: 'workplaceType',
        type: 'enum (REMOTE, HYBRID, ON_SITE)',
        required: false,
        description: 'Work arrangement model.',
      },
      {
        name: 'employmentType',
        type: 'enum (FULL_TIME, PART_TIME, CONTRACT, INTERNSHIP)',
        required: false,
        description: 'Employment terms.',
      },
      {
        name: 'rawJobDescription',
        type: 'string',
        required: false,
        description: 'Full job description text snapshot.',
      },
      {
        name: 'compensation',
        type: 'object (currency, minSalary, maxSalary, targetSalary, equity, period)',
        required: false,
        description: 'Target or posted compensation package.',
      },
      { name: 'notes', type: 'string', required: false, description: 'Private candidate notes.' },
      {
        name: 'status',
        type: 'enum (SAVED, APPLIED)',
        required: false,
        description: 'Initial status (default: SAVED).',
      },
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
        name: 'candidateId',
        type: 'string (UUID)',
        required: false,
        description: 'Optional candidate UUID.',
      },
      {
        name: 'status',
        type: 'enum (SAVED, APPLIED, SCREENING, INTERVIEWING, OFFER_RECEIVED, OFFER_ACCEPTED, REJECTED, WITHDRAWN, ARCHIVED)',
        required: false,
        description: 'Filter by lifecycle status or array of statuses.',
      },
      {
        name: 'companyName',
        type: 'string',
        required: false,
        description: 'Filter applications by company name substring.',
      },
      {
        name: 'source',
        type: 'enum',
        required: false,
        description: 'Filter by application origin.',
      },
      {
        name: 'workplaceType',
        type: 'enum',
        required: false,
        description: 'Filter by workplace arrangement.',
      },
      {
        name: 'limit',
        type: 'number (1 - 50)',
        required: false,
        description: 'Results limit (default: 10).',
      },
      {
        name: 'offset',
        type: 'number',
        required: false,
        description: 'Pagination offset (default: 0).',
      },
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
      {
        name: 'includeFullJd',
        type: 'boolean',
        required: false,
        description: 'Whether to include raw job description text (default: false).',
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
      'Transition application lifecycle status (e.g. SAVED -> APPLIED -> INTERVIEWING -> OFFER_RECEIVED).',
    parameters: [
      {
        name: 'applicationId',
        type: 'string (UUID)',
        required: true,
        description: 'Target application UUID.',
      },
      {
        name: 'status',
        type: 'enum (SAVED, APPLIED, SCREENING, INTERVIEWING, OFFER_RECEIVED, OFFER_ACCEPTED, REJECTED, WITHDRAWN, ARCHIVED)',
        required: true,
        description: 'New lifecycle status.',
      },
      {
        name: 'reason',
        type: 'string',
        required: false,
        description: 'Optional status transition reason.',
      },
    ],
    exampleRpc: {
      method: 'tools/call',
      params: {
        name: 'update_application_status',
        arguments: {
          applicationId: '3c8e42f0-91a6-455b-bfa1-7f8e32906b3e',
          status: 'INTERVIEWING',
          reason: 'Recruiter screen scheduled.',
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
        type: 'enum (DISCOVERY, RESUME_SUBMITTED, RECRUITER_SCREEN, TECHNICAL_ASSESSMENT, SYSTEM_DESIGN, BEHAVIORAL, ONSITE_LOOP, OFFER_NEGOTIATION, POST_OFFER, OTHER)',
        required: true,
        description: 'Interview stage category.',
      },
      {
        name: 'title',
        type: 'string',
        required: true,
        description: 'Descriptive title for the stage (e.g. System Design Architecture Round).',
      },
      {
        name: 'scheduledAt',
        type: 'string (ISO 8601 Date)',
        required: false,
        description: 'Scheduled date and time.',
      },
      {
        name: 'interviewerNames',
        type: 'array of strings',
        required: false,
        description: 'List of interviewer names or panel members.',
      },
    ],
    exampleRpc: {
      method: 'tools/call',
      params: {
        name: 'add_application_stage',
        arguments: {
          applicationId: '3c8e42f0-91a6-455b-bfa1-7f8e32906b3e',
          stageType: 'SYSTEM_DESIGN',
          title: 'System Design Architecture Round',
          interviewerNames: ['Principal Engineer'],
        },
      },
    },
    safetyNotes: 'Enforces maximum 20 stages per application.',
  },
  {
    name: 'update_application_stage_outcome',
    category: 'Career Tracking',
    scope: 'career:write',
    role: 'MEMBER',
    classification: 'Tracking',
    purpose:
      'Record the outcome (PENDING, PASSED, FAILED, SKIPPED, RESCHEDULED) and qualitative feedback for an interview stage.',
    parameters: [
      { name: 'stageId', type: 'string (UUID)', required: true, description: 'Stage UUID.' },
      {
        name: 'outcome',
        type: 'enum (PENDING, PASSED, FAILED, SKIPPED, RESCHEDULED)',
        required: true,
        description: 'Stage evaluation outcome.',
      },
      {
        name: 'feedback',
        type: 'string',
        required: false,
        description: 'Technical feedback or debrief notes.',
      },
      {
        name: 'rescheduledAt',
        type: 'string (ISO 8601 Date)',
        required: false,
        description: 'New scheduled timestamp if rescheduled.',
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
        type: 'enum (TAILORED_RESUME, TAILORED_COVER_LETTER, PORTFOLIO_RECOMMENDATION, CUSTOM_NOTE)',
        required: true,
        description: 'Document type.',
      },
      { name: 'title', type: 'string', required: true, description: 'Document title label.' },
      {
        name: 'content',
        type: 'object',
        required: true,
        description: 'Structured JSON document payload.',
      },
      {
        name: 'candidateId',
        type: 'string (UUID)',
        required: false,
        description: 'Optional candidate UUID.',
      },
      {
        name: 'renderedMarkdown',
        type: 'string',
        required: false,
        description: 'Rendered markdown representation.',
      },
      {
        name: 'renderedPlainText',
        type: 'string',
        required: false,
        description: 'Rendered plain text representation.',
      },
      {
        name: 'citationRefs',
        type: 'array of evidence citations',
        required: false,
        description: 'Array of evidence citations backing claims.',
      },
      {
        name: 'integrityScore',
        type: 'number (0.0 - 1.0)',
        required: false,
        description: 'Grounding integrity score.',
      },
      {
        name: 'atsFitScore',
        type: 'number (0.0 - 100.0)',
        required: false,
        description: 'Target job ATS fit score.',
      },
      {
        name: 'metadata',
        type: 'object',
        required: false,
        description: 'Additional structured metadata.',
      },
    ],
    exampleRpc: {
      method: 'tools/call',
      params: {
        name: 'attach_application_document',
        arguments: {
          applicationId: '3c8e42f0-91a6-455b-bfa1-7f8e32906b3e',
          documentType: 'TAILORED_RESUME',
          title: 'Stripe Tailored Resume v1',
          content: { name: 'Alex Mercer' },
        },
      },
    },
    safetyNotes: 'Encrypted storage with immutable SHA-256 content hash.',
  },

  // Category 5: Job Discovery & Application Workflow (8 tools)
  {
    name: 'search_jobs',
    category: 'Job Discovery & Workflow',
    scope: 'career:read',
    role: 'READONLY',
    classification: 'Workflow',
    purpose:
      'Query verified software engineering job listings across Greenhouse, Lever, and curated structured feeds.',
    parameters: [
      { name: 'query', type: 'string', required: true, description: 'Search keywords.' },
      {
        name: 'location',
        type: 'string',
        required: false,
        description: 'Target geographic location.',
      },
      {
        name: 'workplaceType',
        type: 'enum (REMOTE, HYBRID, ONSITE)',
        required: false,
        description: 'Workplace model.',
      },
      {
        name: 'remoteOnly',
        type: 'boolean',
        required: false,
        description: 'Filter exclusively for 100% remote roles.',
      },
      {
        name: 'skills',
        type: 'array of strings',
        required: false,
        description: 'Required candidate skills.',
      },
      {
        name: 'minSalary',
        type: 'number',
        required: false,
        description: 'Minimum annual base salary.',
      },
      {
        name: 'limit',
        type: 'integer (1-50)',
        required: false,
        description: 'Result batch size (default: 20).',
      },
      { name: 'offset', type: 'integer (>=0)', required: false, description: 'Pagination offset.' },
    ],
    exampleRpc: {
      method: 'tools/call',
      params: {
        name: 'search_jobs',
        arguments: { query: 'Staff Backend Engineer', remoteOnly: true },
      },
    },
    safetyNotes: 'Zero hallucination. Attributed with public ATS source provenance.',
  },
  {
    name: 'get_job_posting',
    category: 'Job Discovery & Workflow',
    scope: 'career:read',
    role: 'READONLY',
    classification: 'Workflow',
    purpose:
      'Fetch full normalized job details including requirements, responsibilities, compensation, and direct application URL.',
    parameters: [
      {
        name: 'jobId',
        type: 'string',
        required: true,
        description: 'Unique job posting identifier.',
      },
    ],
    exampleRpc: {
      method: 'tools/call',
      params: {
        name: 'get_job_posting',
        arguments: { jobId: 'job-gh-stripe-001' },
      },
    },
    safetyNotes: 'Deterministic schema parsing with source ATS verification.',
  },
  {
    name: 'prepare_job_application',
    category: 'Job Discovery & Workflow',
    scope: 'career:read',
    role: 'MEMBER',
    classification: 'Workflow',
    purpose:
      'Orchestrates candidate profile, verified skills, AST project evidence, tailored resume, cover letter, answers, and SHA-256 package hash.',
    parameters: [
      {
        name: 'jobPosting',
        type: 'object',
        required: true,
        description: 'Normalized job posting object.',
      },
      { name: 'answers', type: 'record', required: false, description: 'Custom question answers.' },
      {
        name: 'candidateId',
        type: 'string (UUID)',
        required: false,
        description: 'Target candidate ID.',
      },
    ],
    exampleRpc: {
      method: 'tools/call',
      params: {
        name: 'prepare_job_application',
        arguments: {
          jobPosting: {
            id: 'job-gh-stripe-001',
            company: 'Stripe',
            title: 'Senior Backend Engineer',
          },
        },
      },
    },
    safetyNotes:
      'Enforces VERIFIED vs CLAIMED truth model. Computes immutable anti-tamper SHA-256 package hash.',
  },
  {
    name: 'validate_job_application',
    category: 'Job Discovery & Workflow',
    scope: 'career:read',
    role: 'MEMBER',
    classification: 'Workflow',
    purpose:
      'Pre-flight validation: verifies required fields, checks for duplicate active applications, and classifies portal submission method.',
    parameters: [
      {
        name: 'applicationPackage',
        type: 'object',
        required: true,
        description: 'Prepared application package.',
      },
      {
        name: 'destinationUrl',
        type: 'string (URL)',
        required: false,
        description: 'Direct application portal URL.',
      },
    ],
    exampleRpc: {
      method: 'tools/call',
      params: {
        name: 'validate_job_application',
        arguments: { applicationPackage: { packageHash: '3f8e...' } },
      },
    },
    safetyNotes:
      'Identifies unsupported portals (e.g. Workday) ahead of time for instant manual handoff.',
  },
  {
    name: 'create_application_preview',
    category: 'Job Discovery & Workflow',
    scope: 'career:read',
    role: 'MEMBER',
    classification: 'Workflow',
    purpose:
      'Generates human-reviewable markdown preview of all submission materials with VERIFIED and CLAIMED provenance badges.',
    parameters: [
      {
        name: 'applicationPackage',
        type: 'object',
        required: true,
        description: 'Prepared application package.',
      },
    ],
    exampleRpc: {
      method: 'tools/call',
      params: {
        name: 'create_application_preview',
        arguments: { applicationPackage: { packageHash: '3f8e...' } },
      },
    },
    safetyNotes: 'Includes explicit human approval boundary notification.',
  },
  {
    name: 'request_application_approval',
    category: 'Job Discovery & Workflow',
    scope: 'career:write',
    role: 'MEMBER',
    classification: 'Workflow',
    purpose:
      'Mints a 15-minute single-use cryptographic approval ticket bound to the exact package SHA-256 hash and destination URL.',
    parameters: [
      { name: 'jobId', type: 'string', required: true, description: 'Target job ID.' },
      {
        name: 'destinationUrl',
        type: 'string (URL)',
        required: true,
        description: 'Destination application portal URL.',
      },
      {
        name: 'packageHash',
        type: 'string (64-char hex)',
        required: true,
        description: 'SHA-256 package hash.',
      },
      {
        name: 'candidateId',
        type: 'string (UUID)',
        required: false,
        description: 'Target candidate ID.',
      },
    ],
    exampleRpc: {
      method: 'tools/call',
      params: {
        name: 'request_application_approval',
        arguments: {
          jobId: 'job-gh-stripe-001',
          destinationUrl: 'https://boards.greenhouse.io/stripe/jobs/job-gh-stripe-001',
          packageHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        },
      },
    },
    safetyNotes:
      'Cryptographic human approval gate. Single-use replay protection with 15-minute TTL.',
  },
  {
    name: 'submit_job_application',
    category: 'Job Discovery & Workflow',
    scope: 'career:write',
    role: 'MEMBER',
    classification: 'Workflow',
    purpose:
      'Final submission boundary. Verifies approval ticket and hash; submits to supported ATS or returns instant manual handoff kit for Workday.',
    parameters: [
      {
        name: 'approvalTicketId',
        type: 'string (UUID)',
        required: true,
        description: 'Approved single-use ticket ID.',
      },
      {
        name: 'packageHash',
        type: 'string (64-char hex)',
        required: true,
        description: 'SHA-256 package hash.',
      },
      {
        name: 'destinationUrl',
        type: 'string (URL)',
        required: true,
        description: 'Target portal URL.',
      },
      {
        name: 'applicationPackage',
        type: 'object',
        required: true,
        description: 'Complete application package.',
      },
    ],
    exampleRpc: {
      method: 'tools/call',
      params: {
        name: 'submit_job_application',
        arguments: {
          approvalTicketId: 'ticket-1234-uuid',
          packageHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          destinationUrl: 'https://boards.greenhouse.io/stripe/jobs/job-gh-stripe-001',
          applicationPackage: {},
        },
      },
    },
    safetyNotes:
      'Enforces human authorization gate. Automatically tracks submission in candidate tracker.',
  },
  {
    name: 'get_application_submission_status',
    category: 'Job Discovery & Workflow',
    scope: 'career:read',
    role: 'READONLY',
    classification: 'Workflow',
    purpose:
      'Retrieves the real-time submission outcome, tracking state, and external ATS reference for an applied role.',
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
        name: 'get_application_submission_status',
        arguments: { applicationId: '3c8e42f0-91a6-455b-bfa1-7f8e32906b3e' },
      },
    },
    safetyNotes: 'Sovereign multi-tenant isolated query.',
  },

  // Category 6: Career Profile & Intent (2 tools)
  {
    name: 'get_career_profile',
    category: 'Career Profile & Intent',
    scope: 'career:read',
    role: 'READONLY',
    classification: 'Profile',
    purpose:
      'Retrieves the candidate’s persistent career profile, target roles, preferred locations, compensation floors, and verified skills summary.',
    parameters: [
      {
        name: 'candidateId',
        type: 'string (UUID)',
        required: false,
        description: 'Optional candidate UUID. Defaults to authenticated persona.',
      },
    ],
    exampleRpc: {
      method: 'tools/call',
      params: {
        name: 'get_career_profile',
        arguments: {},
      },
    },
    safetyNotes: 'Read-only query. Strictly tenant-isolated. Zero secret or token leakage.',
  },
  {
    name: 'update_career_preferences',
    category: 'Career Profile & Intent',
    scope: 'career:write',
    role: 'MEMBER',
    classification: 'Profile',
    purpose:
      'Updates the candidate’s persistent job search preferences (target roles, locations, remote policy, salary floor, tech stack) with strict user sovereignty.',
    parameters: [
      {
        name: 'targetRoles',
        type: 'array of strings',
        required: false,
        description: 'List of target job titles.',
      },
      {
        name: 'preferredLocations',
        type: 'array of strings',
        required: false,
        description: 'List of preferred locations.',
      },
      {
        name: 'remotePreference',
        type: 'enum (REMOTE_ONLY, REMOTE_FIRST, HYBRID, ON_SITE, FLEXIBLE)',
        required: false,
        description: 'Remote work policy preference.',
      },
      {
        name: 'salaryFloor',
        type: 'number',
        required: false,
        description: 'Minimum annual base salary requirement.',
      },
      {
        name: 'salaryCurrency',
        type: 'string (3-letter code)',
        required: false,
        description: 'Currency code (e.g. USD, EUR, INR).',
      },
      {
        name: 'preferredTechStack',
        type: 'array of strings',
        required: false,
        description: 'Preferred programming languages and frameworks.',
      },
      {
        name: 'workAuthorization',
        type: 'array of strings',
        required: false,
        description: 'Explicit user-provided work authorization countries (never inferred).',
      },
    ],
    exampleRpc: {
      method: 'tools/call',
      params: {
        name: 'update_career_preferences',
        arguments: {
          targetRoles: ['Staff Backend Engineer', 'Distributed Systems Architect'],
          remotePreference: 'REMOTE_ONLY',
          salaryFloor: 190000,
          preferredTechStack: ['Node.js', 'Fastify', 'PostgreSQL'],
        },
      },
    },
    safetyNotes:
      'Requires career:write scope. AI is strictly prohibited from silently overwriting preferences.',
  },
];

/**
 * 8 Registered MCP Resources & Resource Templates Definitions.
 */
export const RESOURCES_CATALOG = [
  {
    name: 'job_fit_radar',
    uri: 'ui://career-hub/job-fit-radar/v1',
    mimeType: 'text/html;profile=mcp-app',
    scope: 'career:read',
    role: 'READONLY',
    isMcpApp: true,
    isTemplate: false,
    purpose:
      'Sandboxed MCP App UI widget delivering an interactive 6-axis SVG Job Fit Radar chart, ATS score gauge, and skill remediation cards (SEP-1865).',
    safetyNotes:
      'Strict CSP (connect-src none), zero external CDN scripts, read-only iframe sandbox.',
    exampleUri: 'ui://career-hub/job-fit-radar/v1',
  },
  {
    name: 'Candidate Career Profile',
    uri: 'career://profile',
    mimeType: 'application/json',
    scope: 'career:read',
    role: 'READONLY',
    isMcpApp: false,
    isTemplate: false,
    purpose:
      'Live candidate career profile snapshot, target roles, preferred locations, salary requirements, and top verified skills.',
    safetyNotes: 'Sovereign multi-tenant isolation. Zero sensitive credential or token leakage.',
    exampleUri: 'career://profile',
  },
  {
    name: 'Candidate Verified Skills',
    uri: 'career://skills',
    mimeType: 'application/json',
    scope: 'career:read',
    role: 'READONLY',
    isMcpApp: false,
    isTemplate: false,
    purpose:
      'Complete catalog of candidate skills with provenance classification (VERIFIED, CLAIMED), confidence scores, and AST evidence links.',
    safetyNotes: 'Distinguishes between repository AST evidence and self-reported user claims.',
    exampleUri: 'career://skills',
  },
  {
    name: 'Candidate Connected Resources',
    uri: 'career://connections',
    mimeType: 'application/json',
    scope: 'career:read',
    role: 'READONLY',
    isMcpApp: false,
    isTemplate: false,
    purpose:
      'List of connected GitHub installations, repositories, synchronization states, and indexed branches.',
    safetyNotes: 'Tokens and private secrets are scrubbed before serialization.',
    exampleUri: 'career://connections',
  },
  {
    name: 'Candidate Project Details',
    uri: 'career://projects/{projectId}',
    mimeType: 'application/json',
    scope: 'career:read',
    role: 'READONLY',
    isMcpApp: false,
    isTemplate: true,
    purpose:
      'Deep architectural dossier for a specific repository codebase, commit SHAs, file manifest, and language breakdown.',
    safetyNotes: 'Default-deny 404 on foreign tenant project access.',
    exampleUri: 'career://projects/3c8e42f0-91a6-455b-bfa1-7f8e32906b3e',
  },
  {
    name: 'Verified AST Evidence Item',
    uri: 'career://evidence/{evidenceId}',
    mimeType: 'application/json',
    scope: 'career:read',
    role: 'READONLY',
    isMcpApp: false,
    isTemplate: true,
    purpose:
      'Commit-pinned code evidence item with file path, line range, AST node type, and sanitized code snippet.',
    safetyNotes: 'Sanitized through SecretScrubber to redact API keys and tokens.',
    exampleUri: 'career://evidence/7f9a1b2c-3d4e-5f6a-7b8c-9d0e1f2a3b4c',
  },
  {
    name: 'Job Posting Dossier',
    uri: 'career://jobs/{jobId}',
    mimeType: 'application/json',
    scope: 'career:read',
    role: 'READONLY',
    isMcpApp: false,
    isTemplate: true,
    purpose:
      'Full normalized job posting details, required skills, responsibilities, compensation, and ATS source attribution.',
    safetyNotes: 'Sourced from verified job feeds (Greenhouse/Lever/synthetic benchmarks).',
    exampleUri: 'career://jobs/job-gh-stripe-001',
  },
  {
    name: 'Tracked Job Application Dossier',
    uri: 'career://applications/{applicationId}',
    mimeType: 'application/json',
    scope: 'career:read',
    role: 'READONLY',
    isMcpApp: false,
    isTemplate: true,
    purpose:
      'Complete lifecycle record for a tracked job application, chronological interview stages, outcomes, and attached tailored artifacts.',
    safetyNotes: 'Sovereign multi-tenant isolated access.',
    exampleUri: 'career://applications/3c8e42f0-91a6-455b-bfa1-7f8e32906b3e',
  },
];

/**
 * 4 Registered Reusable MCP Prompts Definitions.
 */
export const PROMPTS_CATALOG = [
  {
    name: 'find_matching_jobs',
    description:
      'Instructs the career assistant to find suitable job openings based on saved career preferences and evaluate ATS fit using verified evidence.',
    scope: 'career:read',
    role: 'READONLY',
    arguments: [
      {
        name: 'query',
        type: 'string',
        required: false,
        description: 'Optional search keywords or role title to override saved preferences.',
      },
      {
        name: 'remoteOnly',
        type: 'boolean / string',
        required: false,
        description: 'Whether to restrict search strictly to remote positions (true/false).',
      },
    ],
    exampleUsage: 'Prompt: find_matching_jobs(query="Staff Backend Engineer", remoteOnly="true")',
  },
  {
    name: 'review_resume',
    description:
      'Instructs the career assistant to audit a candidate resume against verified repository evidence and detect ungrounded claims.',
    scope: 'career:read',
    role: 'READONLY',
    arguments: [
      {
        name: 'targetRole',
        type: 'string',
        required: false,
        description: 'Target job title or domain to evaluate relevance against.',
      },
    ],
    exampleUsage: 'Prompt: review_resume(targetRole="Staff Cloud Architect")',
  },
  {
    name: 'prepare_application',
    description:
      'Instructs the career assistant to prepare a complete tailored application package for a target job posting.',
    scope: 'career:write',
    role: 'MEMBER',
    arguments: [
      {
        name: 'jobId',
        type: 'string',
        required: true,
        description: 'The job posting ID to prepare the application for.',
      },
    ],
    exampleUsage: 'Prompt: prepare_application(jobId="job-gh-stripe-001")',
  },
  {
    name: 'explain_skill_gap',
    description:
      'Instructs the assistant to analyze candidate skill gaps for a job and suggest open-source project improvements.',
    scope: 'career:read',
    role: 'READONLY',
    arguments: [
      {
        name: 'jobDescription',
        type: 'string',
        required: true,
        description: 'Text of the job description or requirements.',
      },
    ],
    exampleUsage: 'Prompt: explain_skill_gap(jobDescription="Staff Distributed Systems...")',
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
    case 'Workflow':
      return `<span class="badge badge-emerald" style="background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3);">Workflow</span>`;
    case 'Profile':
      return `<span class="badge badge-purple" style="background: rgba(168, 85, 247, 0.15); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.3);">Profile</span>`;
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
          AI Careers Hub exposes a standards-compliant remote Model Context Protocol (MCP) server over Streamable HTTP transport, empowering Anthropic Claude, OpenAI ChatGPT, and Google Gemini with verified candidate career intelligence.
        </p>
      </div>

      <!-- Quick Reference Specs Box -->
      <div class="card" style="margin-bottom: 3rem; background: var(--bg-surface-elevated);">
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
            Active Registry: <strong style="color: #f8fafc;">${TOOLS_CATALOG.length} Tools</strong> (6 Domains) • <strong style="color: #f8fafc;">${RESOURCES_CATALOG.length} Resources</strong> • <strong style="color: #f8fafc;">${PROMPTS_CATALOG.length} Prompts</strong>
          </div>
          <a href="/connect" class="btn btn-primary btn-sm">
            <span>Open AI Connection Center →</span>
          </a>
        </div>
      </div>

      <!-- Navigation Jump Links -->
      <div style="display: flex; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 2.5rem;">
        <a href="#tools" class="btn btn-secondary btn-sm">⚡ ${TOOLS_CATALOG.length}-Tool Catalog</a>
        <a href="#resources" class="btn btn-secondary btn-sm">📦 ${RESOURCES_CATALOG.length} Resources</a>
        <a href="#prompts" class="btn btn-secondary btn-sm">💬 ${PROMPTS_CATALOG.length} Prompts</a>
        <a href="#auth" class="btn btn-secondary btn-sm">🔑 Authentication & Scopes</a>
        <a href="#write-safety" class="btn btn-secondary btn-sm">🛡️ Two-Phase Write Safety</a>
        <a href="#clients" class="btn btn-secondary btn-sm">🟣 Claude & ChatGPT Setup</a>
        <a href="#roadmap" class="btn btn-secondary btn-sm">🗺️ Roadmap & Standards</a>
      </div>

      <!-- Section 1: Complete 26-Tool Catalog -->
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
            <input type="text" id="toolSearchInput" onkeyup="filterTools()" placeholder="🔍 Filter tools (e.g. search_jobs, resume, pr, fit)..." class="form-control" style="font-size: 0.85rem; padding: 0.5rem 0.85rem;">
          </div>
        </div>

        <!-- Interactive Category Filter Chips -->
        <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1.5rem;" id="categoryFilterContainer">
          <button type="button" class="btn btn-secondary btn-sm active" onclick="filterCategory('ALL', this)" style="font-size: 0.8rem;">All (${TOOLS_CATALOG.length})</button>
          <button type="button" class="btn btn-secondary btn-sm" onclick="filterCategory('Career Read', this)" style="font-size: 0.8rem;">Career Read (4)</button>
          <button type="button" class="btn btn-secondary btn-sm" onclick="filterCategory('Career Artifacts', this)" style="font-size: 0.8rem;">Career Artifacts (3)</button>
          <button type="button" class="btn btn-secondary btn-sm" onclick="filterCategory('Career Write', this)" style="font-size: 0.8rem;">Career Write (2)</button>
          <button type="button" class="btn btn-secondary btn-sm" onclick="filterCategory('Career Tracking', this)" style="font-size: 0.8rem;">Career Tracking (7)</button>
          <button type="button" class="btn btn-secondary btn-sm" onclick="filterCategory('Job Discovery & Workflow', this)" style="font-size: 0.8rem;">Job Discovery & Workflow (8)</button>
          <button type="button" class="btn btn-secondary btn-sm" onclick="filterCategory('Career Profile & Intent', this)" style="font-size: 0.8rem;">Career Profile & Intent (2)</button>
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

      <!-- Section 2: Complete MCP Resources & Resource Templates -->
      <section id="resources" style="margin-bottom: 3.5rem;">
        <div style="margin-bottom: 1.25rem;">
          <h2 style="font-size: 1.5rem; font-weight: 700; color: #f8fafc; margin-bottom: 0.25rem;">
            2. Canonical MCP Resources & Resource Templates (${RESOURCES_CATALOG.length} Resources)
          </h2>
          <p style="color: #94a3b8; font-size: 0.9rem;">
            Read-only semantic resource URIs and parameterized templates exposing structured candidate intelligence, verified AST evidence, and the Job Fit Radar MCP App UI.
          </p>
        </div>

        <div style="display: flex; flex-direction: column; gap: 1rem;">
          ${RESOURCES_CATALOG.map(
            (r) => `
            <div class="card" style="background: rgba(15, 23, 42, 0.6); padding: 1.25rem;">
              <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 0.75rem; margin-bottom: 0.5rem;">
                <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
                  <code style="font-size: 0.95rem; font-weight: 600; color: #34d399; background: rgba(52, 211, 153, 0.1); padding: 3px 8px; border-radius: 4px; border: 1px solid rgba(52, 211, 153, 0.25);">
                    ${escapeHtml(r.uri)}
                  </code>
                  ${r.isMcpApp ? '<span class="badge badge-indigo">MCP App UI</span>' : '<span class="badge badge-cyan">Resource</span>'}
                  ${r.isTemplate ? '<span class="badge" style="background: rgba(168, 85, 247, 0.15); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.3);">Template</span>' : ''}
                </div>

                <div style="display: flex; gap: 0.5rem; align-items: center; font-size: 0.8rem;">
                  <span style="color: #64748b;">MIME:</span>
                  <code style="color: #e2e8f0; font-size: 0.75rem;">${escapeHtml(r.mimeType)}</code>
                  <span style="color: #64748b;">Scope:</span>
                  <code>${escapeHtml(r.scope)}</code>
                </div>
              </div>

              <div style="font-weight: 600; color: #f8fafc; font-size: 0.95rem; margin-bottom: 0.25rem;">
                ${escapeHtml(r.name)}
              </div>
              <p style="color: #cbd5e1; font-size: 0.875rem; line-height: 1.5; margin-bottom: 0.75rem;">
                ${escapeHtml(r.purpose)}
              </p>

              <div style="background: rgba(0, 0, 0, 0.25); border-radius: 6px; padding: 0.6rem 0.85rem; border: 1px solid var(--border-subtle); font-size: 0.8rem; color: #94a3b8; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
                <div>
                  <strong>Read Example:</strong> <code style="color: #38bdf8;">resources/read(uri="${escapeHtml(r.exampleUri)}")</code>
                </div>
                <div style="font-size: 0.75rem; color: #94a3b8;">
                  <strong>Safety:</strong> ${escapeHtml(r.safetyNotes)}
                </div>
              </div>
            </div>
          `
          ).join('')}
        </div>
      </section>

      <!-- Section 3: Reusable MCP Prompts -->
      <section id="prompts" style="margin-bottom: 3.5rem;">
        <div style="margin-bottom: 1.25rem;">
          <h2 style="font-size: 1.5rem; font-weight: 700; color: #f8fafc; margin-bottom: 0.25rem;">
            3. Structured Reusable MCP Prompts (${PROMPTS_CATALOG.length} Prompts)
          </h2>
          <p style="color: #94a3b8; font-size: 0.9rem;">
            Pre-engineered prompts guiding AI assistants through authentic resume audits, gap analysis, application preparation, and targeted job discovery.
          </p>
        </div>

        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.25rem;">
          ${PROMPTS_CATALOG.map(
            (p) => `
            <div class="card" style="background: rgba(15, 23, 42, 0.6); padding: 1.25rem; display: flex; flex-direction: column; justify-content: space-between;">
              <div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
                  <code style="font-size: 0.95rem; font-weight: 600; color: #818cf8; background: rgba(99, 102, 241, 0.1); padding: 3px 8px; border-radius: 4px; border: 1px solid rgba(99, 102, 241, 0.25);">
                    ${escapeHtml(p.name)}
                  </code>
                  <span class="badge" style="background: rgba(99, 102, 241, 0.15); color: #818cf8; font-size: 0.7rem;">${escapeHtml(p.scope)}</span>
                </div>

                <p style="color: #cbd5e1; font-size: 0.875rem; line-height: 1.5; margin-bottom: 1rem;">
                  ${escapeHtml(p.description)}
                </p>

                <div style="margin-bottom: 1rem;">
                  <div style="font-size: 0.75rem; text-transform: uppercase; color: #64748b; font-weight: 600; margin-bottom: 0.4rem;">Arguments</div>
                  ${
                    p.arguments.length === 0
                      ? '<span style="color:#64748b; font-size:0.8rem;">No arguments required</span>'
                      : p.arguments
                          .map(
                            (a) => `
                    <div style="font-size: 0.8rem; margin-bottom: 4px; color: #cbd5e1;">
                      <code>${escapeHtml(a.name)}</code> <span style="color:#38bdf8;">(${escapeHtml(a.type)})</span>${a.required ? ' <span style="color:#f87171;">*required</span>' : ''} — <span style="color:#94a3b8;">${escapeHtml(a.description)}</span>
                    </div>
                  `
                          )
                          .join('')
                  }
                </div>
              </div>

              <div style="background: rgba(0, 0, 0, 0.25); border-radius: 6px; padding: 0.5rem 0.75rem; border: 1px solid var(--border-subtle); font-size: 0.775rem; color: #a5f3fc; font-family: var(--font-mono);">
                ${escapeHtml(p.exampleUsage)}
              </div>
            </div>
          `
          ).join('')}
        </div>
      </section>

      <!-- Section 4: Authentication & Scopes -->
      <section id="auth" style="margin-bottom: 3.5rem;">
        <h2 style="font-size: 1.5rem; font-weight: 700; color: #f8fafc; margin-bottom: 0.5rem;">
          4. Authentication, OAuth 2.1 & Scopes
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
              For Google Gemini agents, IDE extensions, and CLI tools. Generated from the Connection Center with role scope ceiling enforcement and stored as SHA-256 hashes.
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
                <td style="padding: 10px 16px; color: #cbd5e1;">Inspect candidate profile, AST-verified skills, evidence items, job fit scores, portfolio rankings, resources, prompts, and active application lists.</td>
              </tr>
              <tr>
                <td style="padding: 10px 16px;"><code>career:write</code></td>
                <td style="padding: 10px 16px;"><span class="badge badge-indigo">MEMBER</span></td>
                <td style="padding: 10px 16px; color: #cbd5e1;">Synthesize tailored resumes, draft cover letters, track job applications, update pipeline stages, update preferences, propose diff improvements, and confirm GitHub Draft PRs.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Section 5: Two-Phase Write Safety -->
      <section id="write-safety" style="margin-bottom: 3.5rem;">
        <h2 style="font-size: 1.5rem; font-weight: 700; color: #f8fafc; margin-bottom: 0.5rem;">
          5. Two-Phase Write Safety State Machine
        </h2>
        <p style="color: #94a3b8; font-size: 0.95rem; line-height: 1.6; margin-bottom: 1.5rem;">
          To guarantee zero unauthorized code modifications, Career Hub strictly implements an <strong>Inverse Authority State Machine</strong>:
        </p>

        <div class="card" style="border-left: 4px solid #10b981; background: rgba(16, 185, 129, 0.03);">
          <div style="font-family: var(--font-mono); font-size: 0.85rem; color: #6ee7b7; background: rgba(15, 23, 42, 0.8); padding: 1.25rem; border-radius: 8px; border: 1px solid var(--border-subtle); line-height: 1.8; margin-bottom: 1.25rem;">
            [1. AI Proposes Improvement]  --> calls: propose_project_improvement<br>
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;|<br>
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;v<br>
            [2. Server Gating Kernel]     --> Generates Unified Diff + Action Approval Ticket (HMAC-SHA256 signed)<br>
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;|<br>
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;v<br>
            [3. Candidate Review]         --> Candidate inspects exact diff in chat UI or web console<br>
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;|<br>
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;v<br>
            [4. Candidate Confirms]       --> AI calls: confirm_and_create_pr(ticketId, confirmed: true)<br>
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;|<br>
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;v<br>
            [5. Server Verification]      --> Verifies ticket signature, expiry, and remote HEAD SHA<br>
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;|<br>
            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;v<br>
            [6. GitHub Draft PR Opened]   --> Creates branch: feat/career-hub-* & opens Draft Pull Request
          </div>

          <div style="font-size: 0.875rem; color: #94a3b8; line-height: 1.6;">
            <strong>Absolute Write Boundary:</strong> AI hosts possess zero raw Git credentials and zero authority to execute direct commits, create arbitrary branches, or bypass approval tickets.
          </div>
        </div>
      </section>

      <!-- Section 6: AI Client Setup Guides -->
      <section id="clients" style="margin-bottom: 3.5rem;">
        <h2 style="font-size: 1.5rem; font-weight: 700; color: #f8fafc; margin-bottom: 0.5rem;">
          6. AI Client Setup & Configuration
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
              Google Gemini & IDE Setup
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

      <!-- Section 7: Official MCP Registry & MCP Apps Architecture -->
      <section id="registry-and-apps" style="margin-bottom: 3.5rem;">
        <h2 style="font-size: 1.5rem; font-weight: 700; color: #f8fafc; margin-bottom: 0.5rem;">
          7. Official MCP Registry Metadata & MCP Apps (SEP-1865)
        </h2>
        <p style="color: #94a3b8; font-size: 0.95rem; line-height: 1.6; margin-bottom: 1.5rem;">
          Standards-compliant metadata for decentralized discovery on <code>registry.modelcontextprotocol.io</code> and interactive sandboxed UI extensions.
        </p>

        <!-- Subsection 7.1: MCP Registry Metadata -->
        <div class="card" style="margin-bottom: 1.5rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
            <h3 style="font-size: 1.125rem; font-weight: 600; color: #f8fafc;">7.1 Official Registry Manifest (<code>server.json</code>)</h3>
            <span class="badge badge-claimed">PLANNED / NOT PUBLISHED</span>
          </div>
          <p style="font-size: 0.875rem; color: #94a3b8; line-height: 1.6; margin-bottom: 1rem;">
            Conforms strictly to the official MCP Registry schema (<code>https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json</code>). Public submission is explicitly <strong>BLOCKED UNTIL PUBLIC STAGING</strong> (PLANNED / NOT PUBLISHED) because the official registry requires a permanent, publicly reachable HTTPS endpoint.
          </p>

          <pre style="background: #020617; border: 1px solid #334155; border-radius: 8px; padding: 1rem; color: #38bdf8; font-family: var(--font-mono); font-size: 0.8rem; overflow-x: auto; margin-bottom: 1rem;">{
  "$schema": "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
  "name": "ai.careerhub/mcp-server",
  "title": "AI Careers Hub",
  "description": "Evidence-backed career intelligence and multi-tenant MCP server with zero hallucination.",
  "version": "0.1.0",
  "websiteUrl": "https://staging.careerhub.ai",
  "repository": {
    "url": "https://github.com/vishu1803/ai-career-agent",
    "source": "github"
  },
  "remotes": [
    {
      "type": "streamable-http",
      "url": "https://staging.careerhub.ai/mcp"
    }
  ],
  "_meta": {
    "io.modelcontextprotocol/ui": {
      "version": "1.0.0",
      "resources": [
        "ui://career-hub/job-fit-radar/v1"
      ]
    },
    "ai.careerhub/auth": {
      "type": "oauth2",
      "discoveryUrl": "https://staging.careerhub.ai/.well-known/oauth-authorization-server",
      "scopes": {
        "career:read": "Read verified evidence graph, AST metrics, and ATS scores",
        "career:write": "Generate career artifacts, resumes, and project proposals"
      }
    },
    "ai.careerhub/publication": {
      "status": "BLOCKED UNTIL PUBLIC STAGING",
      "blockerReason": "Remote MCP server requires permanent public HTTPS domain (staging.careerhub.ai) and DNS TXT verification before registry submission."
    }
  }
}</pre>
        </div>

        <!-- Subsection 7.2: MCP Apps UI Extension -->
        <div class="card" style="margin-bottom: 1.5rem;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem;">
            <h3 style="font-size: 1.125rem; font-weight: 600; color: #f8fafc;">7.2 MCP Apps UI Extension (<code>io.modelcontextprotocol/ui</code>)</h3>
            <span class="badge badge-verified">PLANNED / NOT IMPLEMENTED (MVP DEMO AVAILABLE)</span>
          </div>
          <p style="font-size: 0.875rem; color: #94a3b8; line-height: 1.6; margin-bottom: 1rem;">
            Implements <strong>SEP-1865</strong> (Model Context Protocol Apps). The Career Hub server exposes interactive UI widgets rendered in sandboxed iframes. <em>Host support must be verified per client.</em>
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

          <h4 style="font-size: 0.9rem; font-weight: 600; color: #f8fafc; margin-bottom: 0.75rem;">Host Compatibility Matrix (With Evidence Levels)</h4>
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
                  <td><span class="badge badge-verified">VERIFIED HERMETICALLY</span></td>
                  <td><span class="badge badge-verified">VERIFIED HERMETICALLY (PKCE)</span></td>
                  <td><span class="badge badge-claimed">OFFICIAL DOCUMENTATION SUPPORT</span></td>
                  <td>Requires public HTTPS tunnel (Cloudflare/staging)</td>
                  <td>Standard text/markdown tool output</td>
                </tr>
                <tr>
                  <td><strong>Claude Desktop</strong></td>
                  <td><span class="badge badge-verified">VERIFIED LIVE</span></td>
                  <td><span class="badge badge-verified">VERIFIED HERMETICALLY (PKCE)</span></td>
                  <td><span class="badge badge-claimed">OFFICIAL DOCUMENTATION SUPPORT</span></td>
                  <td>Direct streamable HTTP support</td>
                  <td>Standard text/markdown tool output</td>
                </tr>
                <tr>
                  <td><strong>ChatGPT</strong></td>
                  <td><span class="badge badge-verified">VERIFIED HERMETICALLY</span></td>
                  <td><span class="badge badge-verified">VERIFIED HERMETICALLY (RFC 9728)</span></td>
                  <td><span class="badge badge-claimed">OFFICIAL DOCUMENTATION SUPPORT</span></td>
                  <td>Requires Plus/Pro developer mode and public HTTPS callback URL</td>
                  <td>Structured JSON / markdown output</td>
                </tr>
                <tr>
                  <td><strong>Google Gemini</strong></td>
                  <td><span class="badge badge-verified">VERIFIED LIVE</span></td>
                  <td><span class="badge badge-rejected">UNSUPPORTED</span></td>
                  <td><span class="badge badge-rejected">UNSUPPORTED / CLI ONLY</span></td>
                  <td>Consumer Web UI lacks custom MCP Apps iframe sandbox; uses Personal Token</td>
                  <td>Standard CLI/SDK JSON-RPC tool result</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <!-- Section 8: Roadmap & Architectural Standards -->
      <section id="roadmap" style="margin-bottom: 3.5rem;">
        <h2 style="font-size: 1.5rem; font-weight: 700; color: #f8fafc; margin-bottom: 0.5rem;">
          8. Roadmap & Architectural Boundaries
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
              All 26 registered tools across 6 domains, 8 resources, 4 prompts, Streamable HTTP JSON-RPC 2.0 protocol, and OAuth 2.1 RFC 8414 / RFC 9728 discovery are fully operational.
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
              <span class="badge badge-claimed">BLOCKED UNTIL PUBLIC STAGING</span>
            </div>
            <p style="font-size: 0.825rem; color: #94a3b8; line-height: 1.5;">
              Manifest verified with official schema; publication blocked until permanent HTTPS domain (Phase 14).
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
    title: 'MCP Developer Documentation',
    content,
    activeNav: 'docs',
    user,
  });
}
