# Resume Studio library - additive contract1.4.0

GET `/api/v1/resume-studio/drafts?limit=20&offset=0` returns `{success:true,data:{contractVersion:"1.4.0",drafts:[{id,revision,sourceResumeId,sourceVersion,title,company,updatedAt,href}],nextOffset}}`.

Existing1.0analysis/1.1draft/1.2proposal/1.3document contracts remain unchanged. Runtime schema: src/domain/career/resume-studio-library.schemas.js. Portable schema: resume-studio-library-v1.schema.json. Synthetic fixture: tests/fixtures/resume-studio-library.json.

Session cookies, OWNER/MEMBER/READONLY. Read-only operation needs no CSRF token; it never creates/revises/approves. Both draft owner and active candidate tenant/user must match. Foreign records never appear, including another owner in the same tenant. Returned metadata is derived from existing encrypted content only after integrity binding validation. No new table or plaintext job copy.

Strict query: limit integer1-50 default20, offset integer0-10000 default0; unknown query fields400. Ordered updatedAt descending, id descending. nextOffset null means end. Offset pagination can shift during edits; deduplicate by id on incremental clients. The server-rendered Library uses page links.401missing/revoked session;403role;400invalidquery;500integrityfailure. Existing canonical error envelope. All responses no-store. No candidate IDs, evidence, full resume text or private storage paths in this read projection.

## Web navigation contract

GET `/resume-studio?draftId=<ownedUUID>` restores exact current revision; GET `?sourceResumeId=<ownedMasterUUID>` preselects a master. Optional `applicationId=<ownedUUID>` reads existing application target without writing or approval. A supplied draft must match the application's title, company and exact trimmed description, else404. `from=jobs` returns to saved Jobs; otherwise application review. Direct/Library entry returns to Resumes. These links are navigation context, not a sealed attachment association or approval binding. No caller-supplied return URL is followed.

POST `/resume-studio/open?from=jobs` accepts existing form fields jobTitle,companyName,jobDescriptionText,optionalsourceUrl,_csrf. Real session, same-origin/session CSRF required. Target validated against current StudioJobTargetSchema (100-character minimum); no URL fetch. Renders prefilled Studio without persisting target or creating an application/draft. Existing Radar50-character analysis contract is preserved. Complete description required for Studio; validation errors400explain how to recover. The candidate explicitly creates a draft afterward.

Approval may expose the server-returned application review link. Export, approval and submission remain separate. Exact Studio PDF/DOCX bytes are not yet wired into every legacy handoff adapter. Office pagination and live-provider quality remain unverified.
