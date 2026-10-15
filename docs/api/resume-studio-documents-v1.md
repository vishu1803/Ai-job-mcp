# Resume Studio history and documents additive contract 1.3.0

Locally integrated additive endpoints. Existing contracts 1.0.0, 1.1.0 and 1.2.0 stay compatible.
Executable contracts: `src/domain/career/resume-studio-document.schemas.js`.
Portable schemas: `resume-studio-documents-v1.schema.json`. Synthetic request/response
fixtures: `tests/fixtures/resume-studio-document*.json`, `resume-studio-history.json`,
`resume-studio-diagnostics.json`, `resume-studio-approval.json`.
All paths below `/api/v1/resume-studio` use existing session cookies. Mutations require
session-bound CSRF, trusted Origin and OWNER/MEMBER. READONLY can read only owned data.

| Method/path | Body | Result |
| --- | --- | --- |
| GET /drafts/:id/history | none | latest 200 immutable revision headers |
| GET /drafts/:id/history/:revision | none | historical draft using unchanged 1.1.0 response |
| GET /drafts/:id/diagnostics | none | revision-bound selected draft analysis; nested unchanged 1.0.0 analysis |
| GET /drafts/:id/proposals | none | latest 50 proposals with authoritative stale state; additive 1.2.0 list |
| POST /drafts/:id/restore | expectedRevision, restoreRevision | new draft revision, older history retained |
| POST /drafts/:id/preview | expectedRevision | compiled document metadata and verification |
| GET /drafts/:id/document | none | current revision's compiled metadata, or 404 if none |
| GET /drafts/:id/documents/:documentId/pdf | none | actual PDF inline preview; may be overfull and labeled NEEDS_REVIEW |
| GET /drafts/:id/documents/:documentId/png | none | first page raster from the exact PDF |
| POST /drafts/:id/export | expectedRevision, documentId, format PDF or DOCX | pinned verified output attachment |
| POST /drafts/:id/approval | expectedRevision, documentId, reviewed true | existing approval ticket and application binding |

No proposal is applied by preview/export. No submission occurs. Compilation uses current
selected content with no implicit pruning. Bounded geometry uses margins 0.60–0.50 inches,
10pt body font, line height 1.24–1.16 and spacing adjustments. Header line height stays
1.35 (name) / 1.30 (contact) to protect actual font boxes. The measured Segoe UI layout
rejects 1.10 body spacing rather than accepting overlap. Final attachments require
exactly one measured A4 page with readable font, complete selected text, logical reading
order, safe glyphs and no detected clipping/overlap. Overflow returns actionable 422 and
candidate selection remains editable. Native DOCX uses standard paragraphs and OpenXML,
not a SaaS converter. Word layout can vary by installed fonts/viewer; universal compatibility
is not claimed. PDF is the authoritative measured final layout.

Preview is compiled outside the database transaction, then authoritative ownership/revision/
source/content hashes are checked again before encrypted immutable persistence. Conflicts
return 409 and create no artifact. Export/approval require the current draft revision and
exact document binding; older artifacts/packages remain immutable and readable in history.

Inspector dependency: Python 3 with PyMuPDF, configured server-side using
`STUDIO_PDF_PYTHON` (executable) and optional `STUDIO_PDF_PYTHONPATH` (package directory).
No client-selected executable/path. Missing verifier fails closed with 503. Compilation
requires established Chrome/Chromium support. Native DOCX is independently ZIP/XML/text
verified; desktop-office visual evaluation is a separate acceptance gate.

PDF inspection also verifies embedded font programs, ToUnicode maps and word separation.
10pt is configured; measured PDF sizes allow a documented 0.05pt numerical conversion
tolerance (current fixtures measure 9.997499pt). PageMap includes only unambiguous measured
summary/bullet rectangles. Repeated or unmeasured text has no purported click mapping.
PNG is the first page of the exact compiled PDF; the inline PDF includes all preview pages.
No artificial verification receipt, automatic content deletion or simulated preview.

Drafts/proposals need migrations 0022/0023; document persistence additionally needs 0024.
Apply only to an authorized disposable/integration environment. Document bytes are encrypted
at rest; owner-scoped responses use no-store. Restoring appends a revision, invalidates
old proposals/export bindings and never changes source/approved records. Repeated approval
of the same document returns 409 PACKAGE_ALREADY_APPROVED and creates no duplicate package
or ticket. Approval requires target title/company/posting URL and seals the exact Studio
document checksums using existing package/ticket services. External submission and other
application attachment adapters are outside this Studio action.

Sample preview body: `{"expectedRevision":3}`.
Sample export body (synthetic fixture ID):

```json
{"expectedRevision":3,"documentId":"893819dc-9652-4e89-8694-d34dc6484cd3","format":"PDF"}
```

Sample approval body:

```json
{"expectedRevision":3,"documentId":"893819dc-9652-4e89-8694-d34dc6484cd3","reviewed":true}
```

READY attests measured PDF and native DOCX ZIP/XML/text checks. It does not claim desktop
Word pagination, Google Docs/LibreOffice compatibility, live AI quality or an employer ATS
result. Office rendering remains a local acceptance blocker: installed Word waited during
read-only opening of synthetic artifacts. No Office credentials, user documents or
production data were accessed.

400 invalid request; 401 session; 403 permission/CSRF; 404 unknown/foreign resource;
409 stale revision/document; 422 output needs candidate review; 503 compiler/verifier unavailable;
500 sanitized storage/integrity error. No private text/provider details in audit logs.

Primary references: [PyMuPDF Page API](https://pymupdf.readthedocs.io/en/latest/page.html),
[Microsoft OpenXML package structure](https://learn.microsoft.com/en-us/office/open-xml/general/how-to-create-a-package).
