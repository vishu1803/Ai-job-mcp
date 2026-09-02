/**
 * @file Unit Test Suite for Job Fit Radar MCP App (SEP-1865 / io.modelcontextprotocol/ui).
 *
 * Verifies:
 * 1. Resource URI format and MIME type (text/html;profile=mcp-app).
 * 2. HTML template output structure and strict Content Security Policy.
 * 3. Zero external script or stylesheet CDN dependencies.
 * 4. SVG radar chart and ATS gauge elements.
 * 5. Safe HTML entity escaping / XSS protection when hydrating with malicious payloads.
 * 6. PostMessage bridge listener setup.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  JOB_FIT_RADAR_URI,
  MCP_APP_MIME_TYPE,
  JOB_FIT_RADAR_APP_RESOURCE,
  renderJobFitRadarAppHtml,
} from '../../src/mcp/apps/job-fit-radar.app.js';

describe('Job Fit Radar MCP App (SEP-1865 / P13.5-005)', () => {
  it('should declare correct URI scheme and MIME profile', () => {
    assert.equal(JOB_FIT_RADAR_URI, 'ui://career-hub/job-fit-radar/v1');
    assert.equal(MCP_APP_MIME_TYPE, 'text/html;profile=mcp-app');
    assert.equal(JOB_FIT_RADAR_APP_RESOURCE.uri, 'ui://career-hub/job-fit-radar/v1');
    assert.equal(JOB_FIT_RADAR_APP_RESOURCE.mimeType, 'text/html;profile=mcp-app');
    assert.equal(JOB_FIT_RADAR_APP_RESOURCE.requiredRole, 'READONLY');
    assert.deepEqual(JOB_FIT_RADAR_APP_RESOURCE.requiredScopes, ['career:read']);
  });

  it('should generate valid HTML5 document with strict Content Security Policy', () => {
    const html = renderJobFitRadarAppHtml();

    assert.ok(html.startsWith('<!DOCTYPE html>'));
    assert.ok(html.includes('<html lang="en">'));
    assert.ok(
      html.includes(
        "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:;\">"
      ),
      'Must contain strict CSP header'
    );
  });

  it('should have zero external CDN scripts or stylesheet links', () => {
    const html = renderJobFitRadarAppHtml();

    assert.equal(html.includes('<script src='), false, 'Must not load external scripts');
    assert.equal(
      html.includes('<link rel="stylesheet"'),
      false,
      'Must not load external stylesheets'
    );
    assert.equal(html.includes('https://cdnjs'), false);
    assert.equal(html.includes('https://cdn'), false);
  });

  it('should render SVG Radar Chart, ATS Circle, and official MCP Apps SDK integration', () => {
    const html = renderJobFitRadarAppHtml();

    assert.ok(html.includes('id="radar-chart"'));
    assert.ok(html.includes('id="radar-data-polygon"'));
    assert.ok(html.includes('id="ats-gauge-arc"'));
    assert.ok(html.includes('id="ats-score-text"'));
    // Official MCP Apps protocol: App + PostMessageTransport from ext-apps
    assert.ok(html.includes('McpApp'), 'Must use official MCP Apps App class');
    assert.ok(html.includes('McpPostMessageTransport'), 'Must use official PostMessageTransport');
    assert.ok(html.includes('app.connect'), 'Must call app.connect() for official protocol handshake');
    assert.ok(html.includes('ontoolresult'), 'Must register ontoolresult handler for tool result delivery');
  });

  it('should safely escape malicious XSS payloads in pre-hydrated data', () => {
    const maliciousPayload = {
      jobContext: {
        extractedTitle: '<script>alert("xss")</script>',
        extractedLevel: '"><img src=x onerror=alert(1)>',
      },
      overallFit: {
        atsScore: 85,
        matchGrade: 'STRONG_FIT',
        fitSummary: 'Summary <script>evil()</script>',
      },
      requirementSummary: {
        matchedCount: 5,
        missingCount: 1,
        keyMatchedSkills: ['<script>evilSkill</script>'],
        keyMissingSkills: ['"><svg/onload=alert(1)>'],
      },
      topRelevantProjects: [
        {
          relevanceRank: 1,
          projectName: 'Project <script>',
          relevanceScore: 0.95,
        },
      ],
      prioritizedSkillGaps: [
        {
          skillName: 'Skill <script>',
          priority: 'CRITICAL',
          remediationAdvice: 'Advice <img src=x>',
        },
      ],
      evidenceBacking: {
        verifiedSkillsCount: 10,
        totalEvidenceItemsCited: 42,
      },
    };

    const html = renderJobFitRadarAppHtml(maliciousPayload);

    // Assert that raw unescaped script tags are not present in the HTML template injection
    assert.equal(html.includes('<script>alert("xss")</script>'), false);
    assert.ok(html.includes('\\u003cscript>alert'));
  });

  it('should embed MCP Apps client SDK bundle for official protocol', () => {
    const html = renderJobFitRadarAppHtml();

    // The HTML must embed the official ext-apps client bundle
    assert.ok(html.includes('McpApp'), 'Must expose McpApp global');
    assert.ok(html.includes('McpPostMessageTransport'), 'Must expose McpPostMessageTransport global');
    // Official protocol elements
    assert.ok(html.includes('ui/notifications/tool-result'), 'Must reference official tool-result notification');
    assert.ok(html.includes('structuredContent'), 'Must check structuredContent for data extraction');
  });

  it('should handle tool result extraction from structuredContent', () => {
    // Test the data extraction logic embedded in the HTML
    const html = renderJobFitRadarAppHtml();

    // The extraction logic must check structuredContent first
    assert.ok(html.includes('result.structuredContent'), 'Must extract from structuredContent');
    // Fallback to content array parsing
    assert.ok(html.includes('result.content'), 'Must fallback to content array');
  });

  it('should register ontoolresult handler BEFORE calling connect for reliable delivery', () => {
    const html = renderJobFitRadarAppHtml();

    // Check for the handler assignment and connect call in the app initialization code
    // The handler assignment (app.ontoolresult = function) must come before app.connect(transport)
    const handlerIdx = html.indexOf('app.ontoolresult = function');
    const connectIdx = html.indexOf('app.connect(transport)');
    assert.ok(handlerIdx > 0, 'Must have app.ontoolresult handler assignment');
    assert.ok(connectIdx > 0, 'Must have app.connect(transport) call');
    assert.ok(handlerIdx < connectIdx, 'ontoolresult handler must be registered before connect()');
  });

  it('should fallback gracefully when App connection fails', () => {
    const html = renderJobFitRadarAppHtml();

    // Must have error handling for connection failure
    assert.ok(html.includes('Connection failed'), 'Must handle connection failure');
    assert.ok(html.includes('MCP App connection failed'), 'Must show meaningful error');
  });
});
