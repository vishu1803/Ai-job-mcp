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

  it('should render SVG Radar Chart, ATS Circle, and SEP-1865 postMessage bridge', () => {
    const html = renderJobFitRadarAppHtml();

    assert.ok(html.includes('id="radar-chart"'));
    assert.ok(html.includes('id="radar-data-polygon"'));
    assert.ok(html.includes('id="ats-gauge-arc"'));
    assert.ok(html.includes('id="ats-score-text"'));
    assert.ok(html.includes("window.addEventListener('message'"));
    assert.ok(html.includes('ui/initialize'));
    assert.ok(html.includes('ui/ready'));
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
});
