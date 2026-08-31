---
name: AI Careers Hub Precision Design System
colors:
  surface: '#111827'
  surface-dim: '#0B0F19'
  surface-bright: '#1F2937'
  surface-container-lowest: '#0B0F19'
  surface-container-low: '#0F172A'
  surface-container: '#111827'
  surface-container-high: '#1E293B'
  surface-container-highest: '#334155'
  on-surface: '#F9FAFB'
  on-surface-variant: '#94A3B8'
  inverse-surface: '#F9FAFB'
  inverse-on-surface: '#0B0F19'
  outline: '#475569'
  outline-variant: '#1E293B'
  surface-tint: '#6366F1'
  primary: '#6366F1'
  on-primary: '#FFFFFF'
  primary-container: '#4F46E5'
  on-primary-container: '#EEF2FF'
  inverse-primary: '#818CF8'
  secondary: '#10B981'
  on-secondary: '#FFFFFF'
  secondary-container: '#064E3B'
  on-secondary-container: '#D1FAE5'
  tertiary: '#06B6D4'
  on-tertiary: '#FFFFFF'
  tertiary-container: '#164E63'
  on-tertiary-container: '#CFFAFE'
  error: '#F43F5E'
  on-error: '#FFFFFF'
  error-container: '#881337'
  on-error-container: '#FFE4E6'
  primary-fixed: '#818CF8'
  primary-fixed-dim: '#6366F1'
  on-primary-fixed: '#0B0F19'
  on-primary-fixed-variant: '#312E81'
  secondary-fixed: '#34D399'
  secondary-fixed-dim: '#10B981'
  on-secondary-fixed: '#064E3B'
  on-secondary-fixed-variant: '#047857'
  tertiary-fixed: '#38BDF8'
  tertiary-fixed-dim: '#06B6D4'
  on-tertiary-fixed: '#083344'
  on-tertiary-fixed-variant: '#0E7490'
  background: '#0B0F19'
  on-background: '#F9FAFB'
  surface-variant: '#1E293B'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 40px
    fontWeight: '800'
    lineHeight: '1.15'
    letterSpacing: -0.03em
  display-lg-mobile:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '800'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '700'
    lineHeight: '1.25'
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 22px
    fontWeight: '600'
    lineHeight: '1.3'
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: '1.4'
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
  label-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: 0.04em
  mono-label:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: '1.0'
    letterSpacing: 0.05em
rounded:
  sm: 0.375rem
  DEFAULT: 0.5rem
  md: 0.625rem
  lg: 0.75rem
  xl: 1rem
  full: 9999px
spacing:
  base: 4px
  xs: 0.25rem
  sm: 0.5rem
  md: 1rem
  lg: 1.5rem
  xl: 2.5rem
  container-max: 1200px
  gutter: 24px
---

# DESIGN.md — AI Careers Hub Production Design System

> **Authoritative Design System & UI/UX Specification**  
> **Master Project**: `AI Careers Hub — Production Product` (`projects/9732215590036546874`)  
> **Status**: Frozen Design Specification (Implementation on hold until review)

---

## 1. Design DNA & Visual Philosophy

AI Careers Hub is a professional, production-grade SaaS platform designed for senior engineers, technical leaders, and AI agents. It bridges authentic code repositories and career documents with zero-hallucination truth verification.

### Core Visual Attributes
* **Calm & Focused**: Dark-slate aesthetic minimizing eye strain during deep technical review.
* **Information-Dense yet Readable**: High data density organized with rigid visual hierarchy, structured metadata strips, and clear vertical rhythm.
* **Trustworthy & Verifiable**: Every claim, skill, and project explicitly displays its provenance source and verification level. No ambiguous badges or greenwashed statistics.
* **Technical Modernity**: Clean typography (Inter for UI, JetBrains Mono for code/parameters), subtle 1px border highlights, and refined micro-interactions inspired by Linear, Ashby, and GitHub.
* **Anti-Patterns (Strictly Avoided)**:
  * No loud neon gradients or decorative mesh backgrounds.
  * No nested card mazes (card inside card inside card).
  * No unorganized pills or walls of unstructured tags.
  * No raw internal developer metrics (e.g. "AST Signals: 86") promoted to primary UI.
  * No fake metrics, mock testimonials, or fabricated user counts.

---

## 2. Design Tokens

### 2.1 Color Palette

```yaml
colors:
  # Base Background & Surfaces
  background: '#0B0F19'          # Slate 950 Deep Canvas
  surface: '#111827'             # Slate 900 Card Background
  surface-elevated: '#1F2937'    # Slate 800 Elevated Hover / Dropdown
  surface-glass: 'rgba(17, 24, 39, 0.75)'
  surface-interactive: 'rgba(255, 255, 255, 0.04)'

  # Borders & Separators
  border-subtle: 'rgba(255, 255, 255, 0.08)'
  border-muted: 'rgba(255, 255, 255, 0.14)'
  border-focus: '#6366F1'        # Indigo Focus Ring (2px with 0.25 glow)
  border-highlight: 'rgba(99, 102, 241, 0.3)'

  # Typography Tiers
  text-primary: '#F9FAFB'        # Gray 50 (Headings, titles, active labels)
  text-secondary: '#E2E8F0'      # Gray 200 (Body text, card copy)
  text-muted: '#94A3B8'          # Slate 400 (Secondary metadata, descriptions)
  text-dim: '#64748B'            # Slate 500 (Footers, helper text, breadcrumbs)

  # Primary Brand & Accent
  primary: '#6366F1'             # Indigo 500
  primary-hover: '#4F46E5'       # Indigo 600
  primary-subtle: 'rgba(99, 102, 241, 0.12)'
  accent-cyan: '#06B6D4'         # Cyan 500 (Inferred & Secondary actions)
  accent-emerald: '#10B981'      # Emerald 500 (Verified & Success)
  accent-amber: '#F59E0B'        # Amber 500 (Claimed & Action required)
  accent-rose: '#F43F5E'         # Rose 500 (Destructive, errors, warnings)
```

### 2.2 Semantic Truth Status System

Every qualification, claim, and project is classified under a strict truth model:

| Status | Badge Background | Badge Text | Border | Semantic Meaning |
| :--- | :--- | :--- | :--- | :--- |
| **`VERIFIED`** | `rgba(16, 185, 129, 0.15)` | `#34D399` (Emerald) | `rgba(16, 185, 129, 0.35)` | Backed by verified AST code syntax, direct commit provenance, or repository evidence. |
| **`CORROBORATED`** | `rgba(20, 184, 166, 0.15)` | `#2DD4BF` (Teal) | `rgba(20, 184, 166, 0.35)` | Resume claim corroborated by multi-file GitHub repository evidence. |
| **`CLAIMED`** | `rgba(245, 158, 11, 0.15)` | `#FBBF24` (Amber) | `rgba(245, 158, 11, 0.35)` | Extracted from resume or user-entered. Labeled as `[Unverified User Claim]`. |
| **`INFERRED`** | `rgba(6, 182, 212, 0.15)` | `#38BDF8` (Cyan) | `rgba(6, 182, 212, 0.35)` | Derived logically via taxonomy parent (e.g. Next.js implies React). |
| **`UNKNOWN`** | `rgba(148, 163, 184, 0.12)` | `#94A3B8` (Slate) | `rgba(148, 163, 184, 0.25)` | Gaps/missing evidence explicitly disclosed rather than fabricated. |

### 2.3 Product & Operational Status System

| Status | Dot / Badge | Background | Text | Meaning |
| :--- | :--- | :--- | :--- | :--- |
| **`CONNECTED`** | `● CONNECTED` | `rgba(16, 185, 129, 0.12)` | `#34D399` | Integration is active, authorized, and reachable. |
| **`DISCONNECTED`** | `○ DISCONNECTED` | `rgba(148, 163, 184, 0.1)` | `#94A3B8` | Integration is unlinked or revoked. |
| **`PROCESSING`** | `⏳ PROCESSING` | `rgba(99, 102, 241, 0.15)` | `#818CF8` | Background extraction or AST parse in progress. |
| **`SUCCESS`** | `✓ SUCCESS` | `rgba(16, 185, 129, 0.15)` | `#34D399` | Operation completed cleanly. |
| **`ERROR`** | `✕ ERROR` | `rgba(244, 63, 94, 0.15)` | `#FB7185` | Failed execution, rate limited, or syntax error. |
| **`REQUIRES ACTION`** | `⚠️ ACTION REQUIRED` | `rgba(245, 158, 11, 0.15)` | `#FBBF24` | User review or token refresh needed. |

### 2.4 Typography Hierarchy

* **Font Families**:
  * **Primary (Sans-Serif)**: `Inter`, `-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, `sans-serif`
  * **Technical / Code / Monospace**: `JetBrains Mono`, `ui-monospace`, `Menlo`, `monospace`
* **Scale & Tracking**:
  * `Display Title`: `36px / 44px`, Weight: `800`, Tracking: `-0.03em`
  * `Page Title (h1)`: `26px / 34px`, Weight: `700`, Tracking: `-0.02em`
  * `Section Title (h2)`: `20px / 28px`, Weight: `600`, Tracking: `-0.015em`
  * `Card Title (h3)`: `16px / 24px`, Weight: `600`, Tracking: `-0.01em`
  * `Body Text`: `14px / 22px`, Weight: `400`, Color: `#E2E8F0`
  * `Small / Metadata`: `12px / 18px`, Weight: `500`, Color: `#94A3B8`
  * `Micro / Badge Label`: `11px / 16px`, Weight: `600`, Tracking: `0.04em`, Text-transform: `uppercase`
  * `Code Excerpt / Param`: `12px / 18px`, Font: `JetBrains Mono`, Weight: `500`

### 2.5 Spacing, Grid & Layout
* **Base Unit**: `4px` / `8px`
* **Page Margins**: `24px` on desktop, `16px` on mobile
* **Container Max Widths**:
  * Standard View: `1100px` (or `1200px` for wide grids)
  * Narrow Form View (Login/Settings): `680px` – `760px`
  * Full-width documentation layout: `1280px`
* **Card Corner Radius**:
  * Small tags/chips: `6px` (`rounded-sm`)
  * Buttons & inputs: `8px` (`rounded-md`)
  * Container cards & modals: `12px` (`rounded-lg`)
  * Badges & pills: `9999px` (`rounded-full`)

---

## 3. Core Component Specifications

### 3.1 Master Navigation Architecture

```
Desktop Navigation Bar (Sticky 72px, Backdrop-filter: blur(12px))
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│ 🚀 AI Careers Hub [DEV] │  Overview   Career ▾   Sources ▾   AI Connect   MCP Docs  │  👤 Alex ▾ │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
                                 │            │                                       │
                    ┌────────────┴───┐   ┌────┴───────────────┐                  ┌────┴────────┐
                    │ 👤 Career Profile│   │ 📦 GitHub Repos    │                  │ Settings    │
                    │ 🎓 Skills Graph│   │ 📄 Resumes & Docs  │                  │ API Tokens  │
                    │ 💼 Projects    │   └────────────────────┘                  │ ─────────── │
                    │ 🎯 Applications│                                           │ 🚪 Sign Out │
                    └────────────────┘                                           └─────────────┘
```

* **Desktop Header**:
  * **Brand**: Logo icon + "AI Careers Hub" + Environment Pill (`[DEV]` or `[STAGING]`).
  * **Top-Level Links**: `Overview` (Dashboard), `Career` (Dropdown), `Sources` (Dropdown), `AI Connect`, `MCP Docs`.
  * **Dropdown Menus**: Open on click/hover with clear arrow indicators. Closed by default.
  * **User Account Dropdown**:
    * Displays initials avatar + user name + chevron.
    * Closed by default. Never stays open permanently.
    * Supports keyboard `Escape` to close, outside click listener, and focus trap.
    * Links to: `Settings`, `MCP Tokens`, `Documentation`, `Sign Out`.
* **Mobile Navigation**:
  * Hamburger menu button toggling a sliding drawer with full navigation hierarchy and active route highlights.

### 3.2 Standard Detail Page Pattern

Used consistently across all 7 detail views: `Project Detail`, `Skill Detail`, `Evidence Inspection`, `Repository Detail`, `Resume Detail`, `Job Application Detail`, `AI Provider Detail`.

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│ ← Back to Projects                                                                         │
│ Dashboard / Projects / Fastify Gateway                                                      │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│ 💼 Fastify Gateway                                                [✓ VERIFIED] [ACTIVE]     │
│ High-performance reverse proxy and routing gateway with Redis token-bucket rate limiting.  │
│                                                                                             │
│ [Overview]  [Evidence Citations (12)]  [Technology Graph]  [Audit Logs]                     │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│ 📦 Repository Context & Provenance                                                          │
│ Repository: vishu1803/Ai-job-mcp  •  Commit: 714917b  •  Language: TypeScript (94%)        │
│                                                                                             │
│ 📎 Evidence Citations                                                                       │
│ ┌─────────────────────────────────────────────────────────────────────────────────────────┐ │
│ │ src/gateway/proxy.ts (L45-88)                       AST Match: Fastify Plugin Instance  │ │
│ │ const gateway = fastify({ logger: true });                                              │ │
│ └─────────────────────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Searchable Multi-Select Chip Component (`ChipsSelector`)

Used for Target Roles, Locations, Tech Stack, Industries, and Work Authorization:
* **Container**: Clickable input box rendering selected items as removable chips (`[ Name ✕ ]`).
* **Input**: Seamless text input with autocomplete suggestions and keyboard navigation (`Enter`/`comma` adds chip, `Backspace` on empty input removes last chip).
* **AI Quick Suggestions**: Contextual pills below the input derived from verified candidate skills. Clicking a suggestion immediately adds the chip with animation.
* **Form Sync**: Synchronizes with hidden `<input type="hidden" name="..." value="...">` as comma-separated values for 100% backend compatibility.

### 3.4 Uniform Project Card Specification

* **Header**: Project title (with link to detail page) + Verification badge (`✓ Verified`, `✓ Corroborated`, `○ Self-reported`).
* **Body**: Concise 2-line description.
* **Technology Highlights**: Maximum 4–5 compact skill chips (e.g. `[Python] [FastAPI] [PostgreSQL]`).
* **Footer**: Clean source link (`View on GitHub ↗` or `Extracted from Resume`) + subtle collapsible `Evidence details ▾` (no raw engineering numbers as primary UI).
* **Filtering Toolbar**: Instant filter tabs (`All`, `Verified`, `GitHub`, `Resume`) to filter the portfolio in real time.

### 3.5 Skills Provenance Component

Every skill displays a 4-part provenance card:
1. **Skill Name & Canonical Category**: e.g., `FastAPI` (`Backend & APIs`)
2. **Truth Classification**: `✓ Verified`, `✓ Corroborated`, `○ Self-reported`, or `Inferred`
3. **Primary Evidence Source**: Repository name (`Ai-job-mcp`) with file link (`src/server.py`) OR Resume section (`Technical Skills`)
4. **Evidence Strength**: Collapsible AST citation excerpt showing exact imports or implementation syntax.

### 3.6 AI Connect Center Specification

Unifies Claude, ChatGPT, and Gemini into a single design system:
* **Environment Banner**: High-visibility badge indicating `Local Development (http://localhost:3000)` vs `Public Staging (https://dev.aicareershub.tech)`.
* **Universal MCP Endpoint**: One-click copy box with endpoint URL (`/mcp`) and streamable HTTP guidance.
* **AI Provider Grid**:
  * **Anthropic Claude**: Desktop Claude + Claude Code instructions, OAuth 2.1 PKCE status.
  * **OpenAI ChatGPT**: Custom GPT / ChatGPT Actions configuration guide, Bearer token auth.
  * **Google Gemini**: Vertex AI / Gemini MCP adapter guide, personal API token setup.
* **Personal Token Management**: SHA-256 encrypted personal tokens with create modal, expiration picker, single-view secret reveal, and instant revocation action.

### 3.7 MCP Developer Documentation Specification

* **Protocol Highlights**: Streamable HTTP 2026-07-28, OAuth 2.1 RFC 8414/9728 discovery, JSON-RPC 2.0.
* **26-Tool Interactive Catalog**: Search bar + category filters across 6 functional domains (`Career Read`, `Career Artifacts`, `Career Write`, `Career Tracking`, `Job Discovery & Workflow`, `Career Profile & Intent`).
* **Tool Schema Inspector**: Parameter table (type, required, default, description) + copyable JSON-RPC `tools/call` payload + safety notes.
* **8 Canonical Resources & 4 Prompts**: Structured inspector for `career://` and `ui://` resources and interactive prompt templates.

---

## 4. Full Screen Inventory & UX Flows

### 4.1 Screen Directory (22 Product Screens)

| # | Screen Name | Route | Purpose & Core Content |
| :--- | :--- | :--- | :--- |
| **01** | **Landing Page** | `GET /` | Value proposition, MCP protocol highlights, truth model comparison, CTA to sign in. |
| **02** | **Login Portal** | `GET /login` | Secure OAuth sign-in with GitHub, session security notices, single-sign-on flow. |
| **03** | **Onboarding Step 1** | `GET /onboarding?step=1` | Candidate identity, display name, professional headline, primary specialization. |
| **04** | **Onboarding Step 2** | `GET /onboarding?step=2` | GitHub App connection, installation authorization, least-privilege review. |
| **05** | **Onboarding Step 3** | `GET /onboarding?step=3` | Repository discovery & multi-selection filter pills (`All`, `Available`, `Indexed`). |
| **06** | **Onboarding Step 4** | `GET /onboarding?step=4` | AST ingestion state machine, real-time repository progress cards, button locks. |
| **07** | **Candidate Dashboard** | `GET /dashboard` | Outcomes-focused overview: profile summary, readiness, quick metrics, next actions. |
| **08** | **Career Profile** | `GET /profile` | Guided identity, categorized skills, interactive job search preferences, eligibility. |
| **09** | **Verified Skills Graph** | `GET /skills` | Categorized primary skills, technology signals, 5-tier evidence explorer. |
| **10** | **Skill Detail View** | `GET /skills/:slug` | In-depth evidence citations, source files, commit links, and confidence scoring. |
| **11** | **Portfolio Projects** | `GET /projects` | Uniform project cards, repository sync links, portfolio removal/restoration. |
| **12** | **Project Detail View** | `GET /projects/:id` | Deep AST evidence inspection, commit SHA, file path line ranges, code excerpts. |
| **13** | **Connected Sources** | `GET /sources` | GitHub App connection status, repository synchronization list, sync triggers. |
| **14** | **Resume Index & Upload**| `GET /resumes` | Drag-and-drop upload (PDF/DOCX/TXT), encrypted storage, version history table. |
| **15** | **Resume Claim Review** | `GET /resumes/:id` | Parsed sections inspector, extracted claims, approve & promote to Base Resume. |
| **16** | **Job Tracker** | `GET /applications` | Application pipeline stages, match scores, document links, interview notes. |
| **17** | **AI Connect Center** | `GET /connect` | Claude, ChatGPT, Gemini cards, MCP endpoint copy, personal API token generator. |
| **18** | **MCP Developer Docs** | `GET /docs/mcp` | 26-tool catalog, 8 resources, 4 prompts, parameters, JSON-RPC examples, OAuth discovery specs. |
| **19** | **Job Fit Radar (App)** | `GET /apps/radar` | MCP interactive tool: job description paste -> instant radar fit & gap analysis. |
| **20** | **Settings & Privacy** | `GET /settings` | Profile info, session management, integrations summary, GDPR Article 17 deletion. |
| **21** | **Legal & Policy Suite** | `GET /privacy` etc. | Unified legal pages: Privacy, Cookies, Terms, Security, Data Deletion, Accessibility. |
| **22** | **Error & State Pages** | `404 / 500 / 403` | Branded fallback screens with clear recovery actions and breadcrumbs. |

---

## 5. UI States & Edge Cases

Every screen is designed with explicit visual states:
1. **Default State**: Populated data with balanced hierarchy and clear action buttons.
2. **Loading / Skeleton State**: Shimmering slate placeholders preserving exact layout dimensions to avoid Cumulative Layout Shift (CLS).
3. **Empty State**: Clear explanation of *why* the section is empty, followed by a primary call-to-action button (e.g. "Connect GitHub" or "Upload Resume").
4. **Processing / Long-Running State**: Live status progress indicator, non-interactive disabled inputs, and background polling.
5. **Success State**: Non-blocking toast notification with checkmark, auto-dismissing after 3.5s.
6. **Error State**: Non-technical user-friendly error alert with specific troubleshooting guidance and "Try Again" button.
7. **Confirmation Modal**: Two-step modal with destructive confirmation for archiving projects, revoking tokens, or deleting accounts.

---

## 6. Responsive Breakpoints

| Breakpoint | Target Devices | Layout Behavior |
| :--- | :--- | :--- |
| **`>= 1440px`** | Large Monitors | Full 12-column grid, max-width 1200px/1280px centered. |
| **`1024px – 1439px`** | Desktop / Laptops | Standard desktop navigation, 2-column or 3-column project cards. |
| **`768px – 1023px`** | Tablets | 2-column grids collapse to 1-column where needed; navigation collapses to compact mode. |
| **`< 768px`** | Mobile Devices | Full-width single column, sliding mobile navigation drawer, touch-friendly tap targets (>= 44px), sticky bottom save bar. |

---

## 7. Accessibility Standards (WCAG 2.1 AA)

* **Contrast**: Minimum `4.5:1` contrast ratio for normal text against dark backgrounds (`#F9FAFB` and `#E2E8F0` on `#0B0F19` / `#111827` achieve `12:1+`).
* **Keyboard Navigation**: Full logical tab order with visible 2px Indigo focus rings (`:focus-visible`).
* **ARIA Attributes**: `aria-expanded`, `aria-controls`, `aria-live="polite"` on dynamic counters and loading spinners.
* **Touch Targets**: Minimum `44x44px` interactive area for all buttons, chips, and mobile navigation items.

---

## 8. UI Gaps vs Backend Capabilities Ledger

To ensure designs remain 100% grounded in engineering reality:

| Product Area | Observed UI Gap / Issue | Underlying Data Reality | Design Resolution |
| :--- | :--- | :--- | :--- |
| **Skills Provenance** | Previously showed "Source information unavailable" if resource wasn't linked to project. | AST evidence items in DB always contain `resourceId` and `filePath`. | Resolved via direct resource-to-skill join in `CandidateProfileService`. Design displays exact repository and path. |
| **Resume Claims** | "0 claims" seen on old uploads before entity resolver. | `ResumeEntityResolver` now extracts canonical entities with 4-tier scopes (`GLOBAL`, `PROJECT_SCOPED`, `EXPERIENCE_SCOPED`, `HYBRID`). | Design displays occurrence counts, scope pills, and linked technology tags. |
| **Project Signals** | Raw AST numbers ("Signals: 86") cluttered card titles. | AST evidence count is valuable metadata, but not a primary user label. | Design relocates evidence counts into a subtle dropdown (`Evidence details ▾`) and focuses card on name, description, and tech chips. |
| **AI Provider Status** | Previously used hardcoded status cards. | `AiConnectionStatusService` inspects real DB sessions, tokens, and OAuth scopes. | Design reflects 4 real-time states: `CONNECTED`, `NOT_CONNECTED`, `REFRESHABLE`, `REVOKED`. |
| **Multi-Repo Selection** | Form submission previously lost multi-checkbox selections. | `parseFormBody` utility now preserves array parameters across form bodies. | Design supports rich multi-repository selection with live counters and search filters. |
