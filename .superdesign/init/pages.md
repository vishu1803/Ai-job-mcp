# Dependency trees
/dashboard -> dashboard.page.js -> workspace.js components + layout.js -> workspace-shell.js -> icons.js/copilot-drawer.js
/resumes -> resumes.page.js -> workspace.js components + layout.js
/resume-studio -> resume-studio.page.js -> layout.js; resume-studio.client.js -> state/document clients; existing server services stay authoritative.
/jobs/profile/applications retain current page implementations and common shell.
