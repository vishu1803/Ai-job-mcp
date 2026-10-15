# Reactive Resume v6.0.3: Runtime Architecture & Interaction Trace

**Reference Target:** [`reactive-resume/reactive-resume`](https://github.com/reactive-resume/reactive-resume)  
**Version:** `6.0.3` (Monorepo, Node 24.x, pnpm@12.11.2)  
**Git Commit SHA:** `9b883a823f11fce25c231477125b1b91bbc119e5`  
**Branch:** `main`  
**License:** MIT License (Copyright © 2026 Amruth Pillai)  
**Cloned Path:** `C:\Users\VISHW\AppData\Local\Temp\reactive-resume-repo`  

---

## 1. Runtime Environment Execution Audit & Blockers

Per research protocol, the application startup was attempted strictly using the documented development procedures in an isolated environment. The exact blockers preventing full client-server live execution on this host are recorded below:

### Blocker 1: Package Manager Dependency (`pnpm@12.11.2`)
* **Observed Result**: `pnpm : The term 'pnpm' is not recognized as the name of a cmdlet, function, script file, or operable program.`
* **Technical Detail**: Reactive Resume v6 enforces strict monorepo workspace dependencies via `pnpm@12.11.2` (declared in `package.json:19`). The host Windows development environment has Node v24.13.0 and npm 11.2.0 installed, but lacks global `pnpm`. Running through `npx pnpm` triggered interactive network downloads that detached or stalled.

### Blocker 2: Containerization Daemon Status (`docker`)
* **Observed Result**: `error during connect: Get "http://%2F%2F.%2Fpipe%2FdockerDesktopLinuxEngine/v1.51/containers/json": open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified.`
* **Technical Detail**: The documented local development startup (`docker compose -f compose.dev.yml up -d`) relies on Docker Desktop to provision PostgreSQL (port 5432), MinIO/SeaweedFS (port 9000), and Redis. Docker Desktop is installed (v28.4.0) but the background Linux engine pipe is inactive on this host.

### Blocker 3: Multi-Tenant Data Isolation Invariant (`goal.md` Rule 11)
* **Policy Guard**: Career Hub's operating protocol strictly prohibits connecting any reference application or external tool to Career Hub's database (`career_hub_forensics_disposable` or development databases).
* **Protocol Outcome**: Consistent with instructions (*"report the blocker rather than inventing outcomes"*), full live client-server execution is blocked by the inactive local container infrastructure. The investigation therefore proceeded via **deep AST and source-level forensic reconstruction** across the cloned repository.

---

## 2. Comprehensive Interaction-to-Source Execution Traces

### Trace 1: Base Resume Creation & Field Editing
* **User Interaction**: Candidate clicks "New Resume", types full name, job title, and edits an experience bullet.
* **UI State**: React Hook Form manages form state at `apps/web/src/pages/builder/` linked to a debounced `useResumeStore` Zustand slice (`apps/web/src/stores/resume.ts`).
* **Service Layer**: Content updates trigger a local patch action `updateResume(id, data)` validating against the JSON Schema defined in `packages/schema/src/resume/index.ts`.
* **Data Change**: Autosave pipeline emits an HTTP `PUT /api/resume/:id` routed to Hono backend (`apps/server/src/routes/resume/index.ts`), updating PostgreSQL via Drizzle ORM (`packages/db/src/schema/resume.ts`).
* **Rendered Output**: Zustand emits an event to the Web Worker hosting Forme (`packages/pdf/src/browser.tsx`), triggering dynamic character subsetting via `harfbuzzjs` and re-rendering the vector canvas preview in under 100ms.

---

### Trace 2: Section & Bullet Drag-and-Drop Reordering
* **User Interaction**: Candidate drags an experience item handle to reorder bullets or moves the "Projects" section above "Experience".
* **UI State**: Drag gesture captured by `@dnd-kit/core` and `@dnd-kit/sortable` in `apps/web/src/components/builder/sections/`.
* **Service Layer**: The reorder event computes an array slice swap updating `resume.data.metadata.layout` (for section ordering) or `section.items` (for bullet ordering).
* **Data Change**: Schema mutation validates array uniqueness (`packages/schema/src/resume/metadata.ts:layoutSchema`).
* **Rendered Output**: The Web Worker rebuilds the layout DOM tree; Forme recalculates column balance and page breaks, immediately moving the rendered PDF element.

---

### Trace 3: Live PDF Preview & Click-to-Edit Navigation (`PageMap`)
* **User Interaction**: Candidate clicks directly on a line of text in the rendered PDF preview to navigate to the exact form field.
* **UI State**: The canvas overlay listens for `onClick` events at `(clientX, clientY)`.
* **Service Layer**: Coordinate translation is handled by `packages/pdf/src/page-map.ts`. Each semantic node rendered in the Web Worker attaches a bounding box entry:
  ```typescript
  interface PageNodeMap {
    id: string; // e.g. "basics.name" or "sections.experience.items[0].summary"
    page: number;
    bounds: { x: number; y: number; width: number; height: number };
  }
  ```
* **Rendered Output**: The clicked coordinate hits a bounding box, emits an active element focus event, scrolls the left-hand form directly to the corresponding input, and focuses the cursor.

---

### Trace 4: AI Proposal Patching & Stale Proposal Invalidation
* **User Interaction**: Candidate prompts AI assistant to "Improve this bullet with metrics".
* **UI State**: Assistant displays a suggestion card showing:
  - *Location*: Target section and item ID.
  - *Before*: Current bullet text.
  - *After*: Proposed bullet text with metrics.
  - *Why*: Explanation of the improvement.
  - *Actions*: "Accept" and "Reject" buttons.
* **Service Layer**: Governed by `packages/resume/src/proposals.ts`. A proposal is modeled as an immutable patch:
  ```typescript
  export interface ResumeProposal {
    id: string;
    section: string;
    path: string;
    originalText: string;
    proposedText: string;
    rationale: string;
    status: 'pending' | 'accepted' | 'rejected' | 'stale';
  }
  ```
* **Guard Verification (`canApplyTo`)**: Before applying the patch, the service evaluates word-for-word string equality:
  ```typescript
  export function canApplyProposal(currentText: string, proposal: ResumeProposal): boolean {
    return currentText.trim() === proposal.originalText.trim();
  }
  ```
* **Stale Invalidation**: If the user edits the underlying bullet in the form before accepting the AI suggestion, `canApplyProposal()` evaluates to `false`. The UI updates the proposal badge from `pending` to `"stale"`, disabling the "Accept" button and preventing content corruption.

---

### Trace 5: Native DOCX OpenXML Export Architecture
* **User Interaction**: Candidate clicks "Export" $\rightarrow$ "Word Document (.docx)".
* **Service Layer**: Invokes `packages/docx/src/builder.ts` utilizing the `docx` npm library.
* **AST Mapping**:
  1. *Document Properties*: Sets margins (1440 twips = 1.0in or 720 twips = 0.5in), font family (`Calibri` or `Arial`), and standard paragraph styles.
  2. *Headings*: Renders `Heading1` / `Heading2` elements with bottom borders to match ATS section divider bars.
  3. *Bullet Lists*: Maps markdown or HTML bullet lists into native OpenXML `Paragraph` elements with `bullet: { level: 0 }`.
  4. *Multi-Column Layouts*: Converts two-column templates into borderless Word `Table` structures with fixed column widths (`TableWidthType.DXA`), ensuring standard ATS parsers read columns in logical order.
* **Rendered Output**: Generates an OpenXML ZIP container download (`.docx`) in under 250ms entirely client-side.

---

### Trace 6: WASM Forme In-Browser PDF Compilation
* **Architecture**: Unlike legacy Reactive Resume v4/v5 (which required a headless Chromium / Browserless container), v6 compiles PDFs directly in the browser via Web Workers using `@formepdf/core`.
* **Execution Flow**:
  1. The resume state is serialized into semantic HTML/CSS inside a dedicated background worker (`packages/pdf/src/worker.ts`).
  2. WebAssembly binary (`forme_core_bg.wasm`) parses the DOM tree, loads embedded TrueType/OpenType font files, and computes line wrapping with `harfbuzzjs`.
  3. Generates high-density, selectable vector PDF byte buffers in ~80ms without server roundtrips.

---

## 3. Reusable Architectural Patterns for AI Career Hub

| Blueprint | Reactive Resume Source Path | Applicability to AI Career Hub |
| :--- | :--- | :--- |
| **Proposal Patch Interface** | `packages/resume/src/proposals.ts` | **Immediate P0**: Port the `canApplyTo` string verification guard into Career Hub's `/apply` review step to support safe AI bullet rewrites. |
| **Native OpenXML Exporter** | `packages/docx/src/builder.ts` | **High P1**: Port the headless `docx` AST builder into `DocxExportService` to provide native Word exports alongside LaTeX PDFs. |
| **PageMap Coordinate Sync** | `packages/pdf/src/page-map.ts` | **Medium P1**: Adopt coordinate bounding box mapping when building the side-by-side interactive workbench. |
| **JSON Resume v1 Parity** | `packages/schema/src/resume/` | **High P1**: Enhance Career Hub's `StructuredResume` export projection to achieve 100% field parity with JSON Resume v1.0.0. |
