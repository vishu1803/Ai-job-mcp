> Current2026-10-15: consolidated actual-main app is available on127.0.0.1:4318. Original4317/backend worktree retained. See [first milestone handoff](unified-ui-milestone-1-handoff.md) for current login,592-case evidence and remaining Office/handoff limits. Historical worktree/cluster lifecycle records below are retained. No shared-database migration/push/deployment occurred.

# Local Resume Studio visibility

2026-10-15. STUDIO-VISIBILITY-001 **COMPLETE, locally verified**. The isolated server is left running for manual inspection. No feature expansion or redesign.

## Cause and source evidence

At investigation start, port3000 served `C:\Users\VISHW\OneDrive\Desktop\Ai-career-agent`, branch `main`, HEAD890bcf03ed37bff11a912e68c1c7ee37c21f401a. Watch supervisor PID24968 and application child PID6972 had that working directory, confirmed by read-only process inspection. Entrypoint `src/index.js` imported that checkout's app, web routes and layout. Those files have no Studio route, API registration or navigation. Root HTTP200; Studio route/CSS/client and a GET to the analysis path404. Cache clearing cannot install another worktree's source. At the final check port3000 was no longer listening and those main processes were absent; this task did not stop or restart them. The final methoded POST comparison on port3000 was therefore unavailable.

The integrated `career-resume-studio-backend` worktree, branch `backend/resume-studio-20261014`, contains the route/navigation/page/CSS, both client controllers, state module and backend APIs. The separate frontend worktree contains earlier UI files but lacks the document client and backend registration. No merge was assumed or performed. Main2/frontend26 originals remain hash-identical to recovery snapshots.

Actual browser login found another issue: the existing safe return-path allowlist omitted `/resume-studio`, sending authenticated users to Dashboard. Added only that exact pathname in `src/security/oauth-state.js`, preserving external/lookalike/control-character protections. No session/authentication/CSRF redesign.

## Manual inspection

Open [the existing fixture development-login link](http://127.0.0.1:4317/auth/dev-login?e2e=1&returnTo=%2Fresume-studio%3FdraftId%3Dac572b4d-5fad-4d01-9732-fa50cf50a1ae) in a private/incognito window. It signs into the synthetic local candidate with a normal session and opens the saved draft. No credentials or server command needed. Private browsing isolates cookies from the existing development session; ports alone do not isolate cookies.

Authenticated URL: [http://127.0.0.1:4317/resume-studio?draftId=ac572b4d-5fad-4d01-9732-fa50cf50a1ae](http://127.0.0.1:4317/resume-studio?draftId=ac572b4d-5fad-4d01-9732-fa50cf50a1ae).

| Port | Application |
| --- | --- |
| 3000 | Original main development application; no longer listening at final check |
| 4317 | Integrated Studio, loopback only, Node PID25916 |
| 55447 | Authorized disposable PostgreSQL17, existing25 migrations |

Runtime manifest/logs: `C:\Users\VISHW\AppData\Local\Temp\career-studio-visual-069397d3-ae93-4d03-a84f-ca1b4b260f15`. Local helpers `scripts/start-studio-visual.ps1` and `serve-studio-visual.mjs` refuse private environment files and non-disposable DB targets, verify25 migrations without migrating, reuse the actual application/session/CSRF/harness, and bind loopback. Harness optional port keeps port0 as the existing default. No credentials/cookie values logged. Initial launcher expected201 for preview; corrected to documented200.

The previously cleaned disposable cluster lacked expected empty runtime directories, including pg_notify. Recreated only missing empty directories inside its verified stopped root; preserved database/WAL/config files, used no initdb and ran no migrations. Cluster and server remain running. Main/production databases and main server processes were untouched. A previous visual helper was stopped only after verifying PID, script and worktree; its synthetic data remains in the isolated database.

All candidates/provider responses are synthetic. Proposal generation passes deterministic fixture responses through actual grounding/lifecycle services; live AI is not claimed. Editing, autosave, analysis, persistence and PDF compilation are actual HTTP/database/services. Visibility verification applied no suggestion, approved no package and submitted no application.

## Verification and approved-design comparison

**39 OAuth/navigation tests PASS, zero failures** across four files, including two new Studio redirect-security cases. Log: OS Temp `studio-visibility-auth-tests.log`. Earlier500-case integrated gate remains historical and was not rerun or relabeled.

Live Chrome check **9 checks PASS, zero page errors**, via `scripts/verify-studio-visual.mjs`: existing development login and unauthenticated redirect; four assets byte-identical to integrated source; job analysis/diagnostics; manual autosave/reload/revision advance; proposal/evidence/explicit accept/reject controls; actual one-A4-page PDF with every measured check green and PDF/DOCX export/review-gated approval controls; persisted history; actual split-pane resizing; four responsive widths1440/1280/1024/375 without page overflow/prototype/slice/debug labels. Initial verification selector waited for a collapsed contact field; corrected to a visible textarea, without product changes.

Fresh [verification](../../output/resume-studio/visual-local-1792009003707/verification.json), [desktop](../../output/resume-studio/visual-local-1792009003707/desktop-viewport.png), [mobile](../../output/resume-studio/visual-local-1792009003707/mobile-viewport.png), [proposal](../../output/resume-studio/visual-local-1792009003707/proposal.png), [evidence](../../output/resume-studio/visual-local-1792009003707/evidence.png), [diagnostics](../../output/resume-studio/visual-local-1792009003707/diagnostics.png). Laptop/tablet/full-page captures are alongside them.

Compared fresh desktop/mobile with preserved approved Antigravity desktop-1440-default/mobile-375-stacked references. Neutral palette, restrained typography, editor/document split and contextual inspection remain. Actual master/job forms, diagnostics and application navigation differ from the standalone prototype; no pixel-identical claim. Fictional verified claims, simulated preview and REVIEW STATES dock were not copied. Temporary prototype/slice/debug labels are already absent; no additional style change needed. Standard DEV indicator remains useful on this isolated non-production server.

Changed code: one-line safe redirect fix, two navigation tests, optional harness port and three local launch/verification scripts. Scoped lint/JS formatting/tracked whitespace pass; scoped secrets scan recorded separately. Ledger updated. No commits, push, merge, deployment or active PRD repair edits. Office DOCX pagination remains a separate full-Studio acceptance blocker; it does not prevent this local inspection.

Final unauthenticated port4317 checks: Studio302 to login, CSS200, POST analysis401 as required. Authenticated browser checks above pass. The server remains reachable with normal authorization.
