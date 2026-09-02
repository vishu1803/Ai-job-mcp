/**
 * @file Job Fit Radar & ATS Analysis MCP App (MCP Apps Official Protocol).
 *
 * Implements the official interactive UI App for the `analyze_job_fit` MCP tool:
 * - Resource URI: `ui://career-hub/job-fit-radar/v1`
 * - MIME Type: `text/html;profile=mcp-app`
 * - 100% Read-Only: Zero write authority or repository mutation capabilities.
 * - Strict Sandboxed Security: Content-Security-Policy with connect-src 'none'.
 * - Official MCP Apps SDK: Uses App + PostMessageTransport from @modelcontextprotocol/ext-apps.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Lazily loaded browser SDK bundle (embedded at HTML generation time) */
let _clientBundle = null;
function getClientBundle() {
  if (_clientBundle === null) {
    try {
      _clientBundle = readFileSync(join(__dirname, 'mcp-app-client.bundle.js'), 'utf8');
    } catch {
      _clientBundle = '// MCP Apps client bundle not found';
    }
  }
  return _clientBundle;
}

export const JOB_FIT_RADAR_URI = 'ui://career-hub/job-fit-radar/v1';
export const MCP_APP_MIME_TYPE = 'text/html;profile=mcp-app';

/**
 * MCP App Resource definition for registration with McpServerWrapper.
 */
export const JOB_FIT_RADAR_APP_RESOURCE = Object.freeze({
  uri: JOB_FIT_RADAR_URI,
  name: 'job_fit_radar',
  description:
    'Interactive Job Fit Radar & ATS Analysis Widget with 6-axis SVG radar chart, ATS score gauge, and skill gap remediation cards.',
  mimeType: MCP_APP_MIME_TYPE,
  requiredRole: 'READONLY',
  requiredScopes: ['career:read'],
});

/**
 * Generates the self-contained sandboxed HTML5 document for the Job Fit Radar app.
 * Uses the official MCP Apps protocol (App + PostMessageTransport).
 *
 * @param {object} [initialData] Optional pre-hydrated tool output
 * @returns {string} Standalone HTML document using official MCP Apps SDK
 */
export function renderJobFitRadarAppHtml(initialData = null) {
  const serializedInitialData = initialData
    ? JSON.stringify(initialData).replace(/</g, '\\u003c')
    : 'null';

  const clientBundle = getClientBundle();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:;">
  <title>Career Hub — Job Fit Radar</title>
  <style>
    :root {
      --bg: #090d16;
      --card-bg: rgba(15, 23, 42, 0.85);
      --card-border: rgba(255, 255, 255, 0.1);
      --text: #f1f5f9;
      --text-muted: #94a3b8;
      --primary: #3b82f6;
      --success: #10b981;
      --warning: #f59e0b;
      --danger: #ef4444;
      --accent: #8b5cf6;
      --font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background-color: var(--bg);
      color: var(--text);
      font-family: var(--font-family);
      font-size: 13px;
      line-height: 1.5;
      padding: 16px;
      -webkit-font-smoothing: antialiased;
    }

    .container {
      max-width: 760px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .header-card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
    }

    .header-info h1 {
      font-size: 16px;
      font-weight: 700;
      color: #fff;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .header-info .company {
      font-size: 13px;
      color: var(--text-muted);
      margin-top: 2px;
    }

    .ats-badge-container {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .ats-circle {
      width: 64px;
      height: 64px;
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .ats-circle svg {
      transform: rotate(-90deg);
    }

    .ats-circle-text {
      position: absolute;
      font-size: 16px;
      font-weight: 800;
      font-family: var(--font-mono);
    }

    .fit-pill {
      font-size: 11px;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: 20px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .fit-strong { background: rgba(16, 185, 129, 0.15); color: var(--success); border: 1px solid rgba(16, 185, 129, 0.3); }
    .fit-moderate { background: rgba(59, 130, 246, 0.15); color: var(--primary); border: 1px solid rgba(59, 130, 246, 0.3); }
    .fit-weak { background: rgba(245, 158, 11, 0.15); color: var(--warning); border: 1px solid rgba(245, 158, 11, 0.3); }

    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
    }

    @media (max-width: 600px) {
      .grid-2 { grid-template-columns: 1fr; }
    }

    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 12px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .card-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    /* Radar Chart Styling */
    .radar-wrapper {
      display: flex;
      justify-content: center;
      align-items: center;
      position: relative;
    }

    .radar-svg {
      width: 100%;
      max-width: 320px;
      height: auto;
      overflow: visible;
    }

    .radar-grid {
      fill: none;
      stroke: rgba(255, 255, 255, 0.08);
      stroke-width: 1;
    }

    .radar-axis {
      stroke: rgba(255, 255, 255, 0.12);
      stroke-width: 1;
      stroke-dasharray: 2 2;
    }

    .radar-polygon {
      fill: rgba(59, 130, 246, 0.35);
      stroke: var(--primary);
      stroke-width: 2;
      transition: all 0.3s ease;
    }

    .radar-point {
      fill: var(--primary);
      stroke: #fff;
      stroke-width: 1.5;
    }

    .radar-label {
      font-size: 10px;
      fill: var(--text-muted);
      font-family: var(--font-family);
      text-anchor: middle;
      dominant-baseline: middle;
    }

    /* Requirement Chips */
    .chips-group {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .chip {
      font-size: 11px;
      padding: 3px 8px;
      border-radius: 6px;
      font-family: var(--font-mono);
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }

    .chip-matched {
      background: rgba(16, 185, 129, 0.12);
      color: #6ee7b7;
      border: 1px solid rgba(16, 185, 129, 0.25);
    }

    .chip-missing {
      background: rgba(239, 68, 68, 0.12);
      color: #fca5a5;
      border: 1px solid rgba(239, 68, 68, 0.25);
    }

    /* Projects List */
    .project-item {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 8px 10px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 8px;
    }

    .project-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .project-name {
      font-weight: 600;
      color: #fff;
      font-size: 12px;
    }

    .project-score {
      font-family: var(--font-mono);
      font-size: 11px;
      color: var(--primary);
    }

    .progress-bar-bg {
      height: 4px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 2px;
      overflow: hidden;
    }

    .progress-bar-fill {
      height: 100%;
      background: var(--primary);
      border-radius: 2px;
    }

    /* Skill Gap Cards */
    .gap-item {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 8px 10px;
      background: rgba(245, 158, 11, 0.06);
      border: 1px solid rgba(245, 158, 11, 0.2);
      border-radius: 8px;
    }

    .gap-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .gap-title {
      font-weight: 600;
      color: #fde68a;
      font-size: 12px;
    }

    .gap-priority {
      font-size: 9px;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 4px;
      text-transform: uppercase;
    }

    .priority-critical { background: var(--danger); color: #fff; }
    .priority-important { background: var(--warning); color: #000; }
    .priority-nice_to_have { background: rgba(255, 255, 255, 0.15); color: var(--text); }

    .gap-advice {
      font-size: 11px;
      color: var(--text-muted);
    }

    .footer-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      color: var(--text-muted);
      padding: 4px 8px;
    }
  </style>
</head>
<body>
  <div class="container" id="app-root">
    <div class="header-card">
      <div class="header-info">
        <h1 id="job-title">Job Fit Analysis</h1>
        <div class="company" id="company-name">Analyzing candidate evidence graph...</div>
      </div>
      <div class="ats-badge-container">
        <div class="ats-circle">
          <svg width="64" height="64" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r="26" stroke="rgba(255,255,255,0.1)" stroke-width="5" fill="none"/>
            <circle id="ats-gauge-arc" cx="32" cy="32" r="26" stroke="#3b82f6" stroke-width="5" fill="none" stroke-dasharray="163.36" stroke-dashoffset="163.36" stroke-linecap="round"/>
          </svg>
          <span class="ats-circle-text" id="ats-score-text">--</span>
        </div>
        <div id="fit-band-pill" class="fit-pill fit-moderate">LOADING</div>
      </div>
    </div>

    <div class="grid-2">
      <!-- 6-Axis Radar Chart -->
      <div class="card">
        <div class="card-title">
          <span>6-Axis Evidence Radar</span>
          <span style="font-size: 10px; font-weight: normal;">0–100 Scale</span>
        </div>
        <div class="radar-wrapper">
          <svg class="radar-svg" viewBox="-140 -140 280 280" id="radar-chart">
            <!-- Grid rings (25%, 50%, 75%, 100%) -->
            <polygon class="radar-grid" points="0,-25 21.65,-12.5 21.65,12.5 0,25 -21.65,12.5 -21.65,-12.5"/>
            <polygon class="radar-grid" points="0,-50 43.3,-25 43.3,25 0,50 -43.3,25 -43.3,-25"/>
            <polygon class="radar-grid" points="0,-75 64.95,-37.5 64.95,37.5 0,75 -64.95,37.5 -64.95,-37.5"/>
            <polygon class="radar-grid" points="0,-100 86.6,-50 86.6,50 0,100 -86.6,50 -86.6,-50"/>
            <!-- Axes -->
            <line class="radar-axis" x1="0" y1="0" x2="0" y2="-100"/>
            <line class="radar-axis" x1="0" y1="0" x2="86.6" y2="-50"/>
            <line class="radar-axis" x1="0" y1="0" x2="86.6" y2="50"/>
            <line class="radar-axis" x1="0" y1="0" x2="0" y2="100"/>
            <line class="radar-axis" x1="0" y1="0" x2="-86.6" y2="50"/>
            <line class="radar-axis" x1="0" y1="0" x2="-86.6" y2="-50"/>
            <!-- Labels -->
            <text class="radar-label" x="0" y="-115">Req Skills</text>
            <text class="radar-label" x="105" y="-55">Pref Skills</text>
            <text class="radar-label" x="105" y="55">Relevance</text>
            <text class="radar-label" x="0" y="115">Experience</text>
            <text class="radar-label" x="-105" y="55">Education</text>
            <text class="radar-label" x="-105" y="-55">Confidence</text>
            <!-- Data polygon & points -->
            <polygon id="radar-data-polygon" class="radar-polygon" points="0,0 0,0 0,0 0,0 0,0 0,0"/>
            <g id="radar-data-points"></g>
          </svg>
        </div>
      </div>

      <!-- Requirement Match Breakdown -->
      <div class="card">
        <div class="card-title">
          <span>Requirement Matches</span>
          <span id="match-counts-summary" style="font-size: 11px; font-weight: 700; color: #fff;">-- / --</span>
        </div>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <div>
            <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px;">Verified Matched Skills:</div>
            <div class="chips-group" id="matched-skills-chips">
              <span class="chip chip-matched">Analyzing...</span>
            </div>
          </div>
          <div style="margin-top: 4px;">
            <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px;">Missing Requirements / Skill Gaps:</div>
            <div class="chips-group" id="missing-skills-chips">
              <span class="chip chip-missing">Analyzing...</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Recommended Projects & Skill Gaps -->
    <div class="grid-2">
      <!-- Projects -->
      <div class="card">
        <div class="card-title">
          <span>Top Relevant Projects</span>
          <span style="font-size: 10px; color: var(--text-muted);">AST Evidence Grounded</span>
        </div>
        <div id="projects-list" style="display: flex; flex-direction: column; gap: 8px;">
          <div style="font-size: 12px; color: var(--text-muted);">No projects ranked yet.</div>
        </div>
      </div>

      <!-- Skill Gaps -->
      <div class="card">
        <div class="card-title">
          <span>Prioritized Remediation Gaps</span>
          <span style="font-size: 10px; color: var(--text-muted);">Actionable Advice</span>
        </div>
        <div id="gaps-list" style="display: flex; flex-direction: column; gap: 8px;">
          <div style="font-size: 12px; color: var(--text-muted);">No skill gaps identified.</div>
        </div>
      </div>
    </div>

    <div class="footer-bar">
      <span>AI Careers Hub MCP App • SEP-1865 Compliant</span>
      <span id="evidence-summary-text">Verified AST Evidence</span>
    </div>
  </div>

  <script>
    // Escape helper for safe DOM insertion
    function esc(str) {
      if (str === null || str === undefined) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function calculateRadarPoints(breakdown) {
      const radius = 100;
      // 6 dimensions: Required, Preferred, Relevance, Experience, Education, Confidence
      const values = [
        Math.min(100, Math.max(0, breakdown.requiredSkillsScore || 0)),
        Math.min(100, Math.max(0, breakdown.preferredSkillsScore || 0)),
        Math.min(100, Math.max(0, breakdown.projectRelevanceScore || 0)),
        Math.min(100, Math.max(0, breakdown.experienceFitScore || 0)),
        Math.min(100, Math.max(0, breakdown.educationFitScore || 0)),
        Math.min(100, Math.max(0, breakdown.evidenceConfidenceScore || 0))
      ];

      const points = [];
      for (let i = 0; i < 6; i++) {
        const angle = -Math.PI / 2 + (i * 2 * Math.PI) / 6;
        const r = (values[i] / 100) * radius;
        const x = r * Math.cos(angle);
        const y = r * Math.sin(angle);
        points.push({ x: Number(x.toFixed(2)), y: Number(y.toFixed(2)), val: values[i] });
      }
      return points;
    }

    function showErrorState(message) {
      document.getElementById('company-name').textContent = message || 'No data available';
      document.getElementById('ats-score-text').textContent = '--';
      document.getElementById('fit-band-pill').textContent = 'NO DATA';
      document.getElementById('fit-band-pill').className = 'fit-pill fit-weak';
      document.getElementById('match-counts-summary').textContent = '-- / --';
      document.getElementById('matched-skills-chips').innerHTML = '<span style="font-size:11px; color:var(--text-muted);">No data</span>';
      document.getElementById('missing-skills-chips').innerHTML = '<span style="font-size:11px; color:var(--text-muted);">No data</span>';
      document.getElementById('projects-list').innerHTML = '<div style="font-size:12px; color:var(--text-muted);">No analysis data available.</div>';
      document.getElementById('gaps-list').innerHTML = '<div style="font-size:12px; color:var(--text-muted);">No analysis data available.</div>';
      document.getElementById('evidence-summary-text').textContent = 'No evidence data';
    }

    function renderApp(data) {
      if (!data) {
        showErrorState('Waiting for analysis data...');
        return;
      }

      // 1. Header & ATS score
      const jobContext = data.jobContext || {};
      const overallFit = data.overallFit || {};
      const score = typeof overallFit.atsScore === 'number' ? Math.round(overallFit.atsScore) : 0;
      const band = overallFit.matchGrade || 'MODERATE_FIT';

      document.getElementById('job-title').textContent = jobContext.extractedTitle || 'Target Role';
      document.getElementById('company-name').textContent = (jobContext.extractedLevel ? jobContext.extractedLevel + ' Level • ' : '') + (overallFit.fitSummary || 'Evidence-grounded fit analysis');

      const scoreText = document.getElementById('ats-score-text');
      scoreText.textContent = score;

      const arc = document.getElementById('ats-gauge-arc');
      const circumference = 2 * Math.PI * 26; // 163.36
      const offset = circumference - (score / 100) * circumference;
      arc.style.strokeDashoffset = offset;

      const pill = document.getElementById('fit-band-pill');
      pill.textContent = band.replace('_', ' ');
      pill.className = 'fit-pill ' + (score >= 75 ? 'fit-strong' : score >= 50 ? 'fit-moderate' : 'fit-weak');
      arc.setAttribute('stroke', score >= 75 ? '#10b981' : score >= 50 ? '#3b82f6' : '#f59e0b');

      // 2. 6-Axis Radar Chart
      const breakdown = overallFit.scoreBreakdown || {};
      const points = calculateRadarPoints(breakdown);
      const polyString = points.map(p => p.x + ',' + p.y).join(' ');
      document.getElementById('radar-data-polygon').setAttribute('points', polyString);

      const pointsContainer = document.getElementById('radar-data-points');
      pointsContainer.innerHTML = points.map(p => '<circle class="radar-point" cx="' + p.x + '" cy="' + p.y + '" r="3"/>').join('');

      // 3. Requirement Matches
      const reqSummary = data.requirementSummary || {};
      const matched = reqSummary.matchedCount || 0;
      const total = (matched + (reqSummary.missingCount || 0) + (reqSummary.partialCount || 0)) || 1;
      document.getElementById('match-counts-summary').textContent = matched + ' / ' + total + ' Matched';

      const matchedChipsContainer = document.getElementById('matched-skills-chips');
      const keyMatched = reqSummary.keyMatchedSkills || [];
      if (keyMatched.length > 0) {
        matchedChipsContainer.innerHTML = keyMatched.map(s => '<span class="chip chip-matched">✓ ' + esc(s) + '</span>').join('');
      } else {
        matchedChipsContainer.innerHTML = '<span style="font-size:11px; color:var(--text-muted);">None cited</span>';
      }

      const missingChipsContainer = document.getElementById('missing-skills-chips');
      const keyMissing = reqSummary.keyMissingSkills || [];
      if (keyMissing.length > 0) {
        missingChipsContainer.innerHTML = keyMissing.map(s => '<span class="chip chip-missing">✕ ' + esc(s) + '</span>').join('');
      } else {
        missingChipsContainer.innerHTML = '<span style="font-size:11px; color:var(--text-muted);">Zero gaps detected</span>';
      }

      // 4. Projects List
      const projectsContainer = document.getElementById('projects-list');
      const projects = data.topRelevantProjects || [];
      if (projects.length > 0) {
        projectsContainer.innerHTML = projects.map(p => {
          const relPct = Math.round((p.relevanceScore || 0) * 100);
          return '<div class="project-item">' +
            '<div class="project-header">' +
              '<span class="project-name">#' + esc(p.relevanceRank) + ' ' + esc(p.projectName) + '</span>' +
              '<span class="project-score">' + relPct + '% Match</span>' +
            '</div>' +
            '<div class="progress-bar-bg"><div class="progress-bar-fill" style="width: ' + relPct + '%;"></div></div>' +
          '</div>';
        }).join('');
      }

      // 5. Skill Gaps List
      const gapsContainer = document.getElementById('gaps-list');
      const gaps = data.prioritizedSkillGaps || [];
      if (gaps.length > 0) {
        gapsContainer.innerHTML = gaps.map(g => {
          const prio = (g.priority || 'IMPORTANT').toLowerCase();
          return '<div class="gap-item">' +
            '<div class="gap-header">' +
              '<span class="gap-title">' + esc(g.skillName || g.skillSlug) + '</span>' +
              '<span class="gap-priority priority-' + prio + '">' + esc(g.priority) + '</span>' +
            '</div>' +
            '<div class="gap-advice">' + esc(g.remediationAdvice) + '</div>' +
          '</div>';
        }).join('');
      }

      // 6. Evidence Backing Footer
      const evidence = data.evidenceBacking || {};
      const vSkills = evidence.verifiedSkillsCount || 0;
      const totalEvidence = evidence.totalEvidenceItemsCited || 0;
      document.getElementById('evidence-summary-text').textContent = vSkills + ' Verified Skills • ' + totalEvidence + ' Commits/Manifest Citations';
    }

    // === Official MCP Apps SDK ===
    // The bundled McpApp (App) and McpPostMessageTransport (PostMessageTransport)
    // are loaded from the embedded @modelcontextprotocol/ext-apps bundle.
    ${clientBundle}

    // Initial hydration if pre-injected
    var initialPayload = ${serializedInitialData};
    if (initialPayload) {
      renderApp(initialPayload);
    }

    // Official MCP Apps protocol initialization
    (async function() {
      try {
        // Create App instance with identification
        var app = new window.McpApp(
          { name: 'job_fit_radar', version: '1.0.0' },
          {},  // capabilities
          { autoResize: false, allowUnsafeEval: true }
        );

        // Register tool-result handler BEFORE connect()
        // This receives the actual analyze_job_fit result from the host
        app.ontoolresult = function(result) {
          // The official SDK delivers the CallToolResult:
          // { content: [...], structuredContent: {...}, _meta: {...} }
          // Our server wraps the analysis in structuredContent
          var data = null;
          if (result && result.structuredContent) {
            data = result.structuredContent;
          } else if (result && result.content && Array.isArray(result.content)) {
            // Fallback: parse from text content blocks
            for (var i = 0; i < result.content.length; i++) {
              var block = result.content[i];
              if (block.type === 'text' && block.text) {
                try { data = JSON.parse(block.text); } catch(e) { /* skip */ }
                break;
              }
            }
          }
          if (data) {
            renderApp(data);
          }
        };

        // Connect using official PostMessageTransport
        var transport = new window.McpPostMessageTransport(window.parent, window.parent);
        await app.connect(transport);
      } catch (err) {
        console.error('[MCP App] Connection failed:', err);
        // If official protocol fails, fall back to initial data if available
        if (!initialPayload) {
          showErrorState('MCP App connection failed. The host may not support MCP Apps.');
        }
      }
    })();

    // Timeout fallback: if no data received within 15 seconds, show error
    if (!initialPayload) {
      setTimeout(function() {
        var el = document.getElementById('company-name');
        if (el && el.textContent.indexOf('Waiting for') !== -1) {
          showErrorState('No analysis data received. The AI host may not support MCP Apps yet.');
        }
      }, 15000);
    }
  </script>
</body>
</html>`;
}
