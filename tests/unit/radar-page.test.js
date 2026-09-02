/**
 * @file Unit Test Suite for Job Fit Radar Web Pages (/apps/radar).
 *
 * Verifies:
 * 1. Radar form page renders with correct structure and design system
 * 2. Radar result page renders with pre-hydrated analysis data
 * 3. Error states display correctly
 * 4. XSS protection in rendered data
 * 5. Navigation and back links
 * 6. Radar chart SVG generation with real data
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderRadarFormPage, renderRadarResultPage } from '../../src/views/radar.page.js';

const mockUser = { id: 'user-1', displayName: 'Test User', email: 'test@example.com' };
const mockTenant = { id: 'tenant-1', name: 'Test Tenant' };

const mockAnalysisData = {
  jobContext: {
    extractedTitle: 'Senior Software Engineer',
    extractedLevel: 'SENIOR',
    totalRequirementsIdentified: 8,
  },
  overallFit: {
    atsScore: 78,
    matchGrade: 'STRONG_FIT',
    fitSummary: 'Strong fit with verified backend and frontend skills.',
    scoreBreakdown: {
      requiredSkillsScore: 85,
      preferredSkillsScore: 70,
      projectRelevanceScore: 65,
      experienceFitScore: 80,
      educationFitScore: 60,
      evidenceConfidenceScore: 90,
    },
  },
  requirementSummary: {
    matchedCount: 6,
    partialCount: 1,
    missingCount: 1,
    unknownCount: 0,
    keyMatchedSkills: ['node.js', 'react', 'postgresql', 'typescript', 'python', 'rest-api'],
    keyMissingSkills: ['kubernetes'],
  },
  topRelevantProjects: [
    {
      projectId: 'proj-1',
      projectName: 'AI Code Review Assistant',
      relevanceScore: 92,
      relevanceRank: 1,
      matchedRequirements: ['python', 'fastapi'],
      summary: 'AI-powered code review tool',
    },
    {
      projectId: 'proj-2',
      projectName: 'Collaborative Task Manager',
      relevanceScore: 78,
      relevanceRank: 2,
      matchedRequirements: ['node.js', 'postgresql'],
      summary: 'Real-time task management',
    },
  ],
  prioritizedSkillGaps: [
    {
      skillSlug: 'kubernetes',
      skillName: 'Kubernetes',
      category: 'TOOL',
      priority: 'IMPORTANT',
      remediationAdvice: 'Build a project deploying containers to Kubernetes.',
    },
  ],
  evidenceBacking: {
    verifiedSkillsCount: 12,
    totalEvidenceItemsCited: 34,
  },
  _meta: {
    ui: { resourceUri: 'ui://career-hub/job-fit-radar/v1' },
  },
};

describe('Radar Form Page (renderRadarFormPage)', () => {
  it('renders complete HTML page with form', () => {
    const html = renderRadarFormPage({ user: mockUser, tenant: mockTenant });

    assert.ok(html.includes('<!DOCTYPE html>'));
    assert.ok(html.includes('Job Fit Radar'));
    assert.ok(html.includes('form'));
    assert.ok(html.includes('method="POST"'));
    assert.ok(html.includes('action="/apps/radar"'));
    assert.ok(html.includes('jobDescriptionText'));
    assert.ok(html.includes('jobTitle'));
    assert.ok(html.includes('companyName'));
    assert.ok(html.includes('targetRoleLevel'));
    assert.ok(html.includes('maxSkillGaps'));
  });

  it('includes back navigation to dashboard', () => {
    const html = renderRadarFormPage({ user: mockUser, tenant: mockTenant });

    assert.ok(html.includes('← Back to Dashboard'));
    assert.ok(html.includes('/dashboard'));
  });

  it('includes breadcrumb navigation', () => {
    const html = renderRadarFormPage({ user: mockUser, tenant: mockTenant });

    assert.ok(html.includes('breadcrumb'));
    assert.ok(html.includes('Job Fit Radar'));
  });

  it('shows error message when provided', () => {
    const html = renderRadarFormPage({
      user: mockUser,
      tenant: mockTenant,
      error: 'Job description must be at least 50 characters.',
    });

    assert.ok(html.includes('alert-error'));
    assert.ok(html.includes('Job description must be at least 50 characters.'));
  });

  it('renders "How It Works" explanation section', () => {
    const html = renderRadarFormPage({ user: mockUser, tenant: mockTenant });

    assert.ok(html.includes('How It Works'));
    assert.ok(html.includes('Paste Job Description'));
    assert.ok(html.includes('Evidence Matching'));
    assert.ok(html.includes('Radar Analysis'));
  });

  it('includes textarea with minimum length validation', () => {
    const html = renderRadarFormPage({ user: mockUser, tenant: mockTenant });

    assert.ok(html.includes('minlength="50"'));
    assert.ok(html.includes('required'));
  });

  it('escapes XSS in error messages', () => {
    const html = renderRadarFormPage({
      user: mockUser,
      tenant: mockTenant,
      error: '<script>alert("xss")</script>',
    });

    assert.ok(!html.includes('<script>alert("xss")</script>'));
    assert.ok(html.includes('&lt;script&gt;'));
  });
});

describe('Radar Result Page (renderRadarResultPage)', () => {
  it('renders complete HTML page with analysis data', () => {
    const html = renderRadarResultPage({
      user: mockUser,
      tenant: mockTenant,
      analysisData: mockAnalysisData,
    });

    assert.ok(html.includes('<!DOCTYPE html>'));
    assert.ok(html.includes('Job Fit Analysis Result'));
    assert.ok(html.includes('Senior Software Engineer'));
    assert.ok(html.includes('STRONG_FIT'));
  });

  it('renders ATS score', () => {
    const html = renderRadarResultPage({
      user: mockUser,
      tenant: mockTenant,
      analysisData: mockAnalysisData,
    });

    assert.ok(html.includes('78'));
  });

  it('renders radar chart SVG with data points', () => {
    const html = renderRadarResultPage({
      user: mockUser,
      tenant: mockTenant,
      analysisData: mockAnalysisData,
    });

    assert.ok(html.includes('svg'));
    assert.ok(html.includes('radar'));
    assert.ok(html.includes('polygon'));
    assert.ok(html.includes('Req Skills'));
    assert.ok(html.includes('Pref Skills'));
    assert.ok(html.includes('Relevance'));
    assert.ok(html.includes('Experience'));
    assert.ok(html.includes('Education'));
    assert.ok(html.includes('Confidence'));
  });

  it('renders requirement matches', () => {
    const html = renderRadarResultPage({
      user: mockUser,
      tenant: mockTenant,
      analysisData: mockAnalysisData,
    });

    assert.ok(html.includes('6 / 8 Matched'));
    assert.ok(html.includes('node.js'));
    assert.ok(html.includes('react'));
    assert.ok(html.includes('kubernetes'));
  });

  it('renders project relevance cards', () => {
    const html = renderRadarResultPage({
      user: mockUser,
      tenant: mockTenant,
      analysisData: mockAnalysisData,
    });

    assert.ok(html.includes('AI Code Review Assistant'));
    assert.ok(html.includes('Collaborative Task Manager'));
    assert.ok(html.includes('92%'));
    assert.ok(html.includes('78%'));
  });

  it('renders skill gap cards', () => {
    const html = renderRadarResultPage({
      user: mockUser,
      tenant: mockTenant,
      analysisData: mockAnalysisData,
    });

    assert.ok(html.includes('Kubernetes'));
    assert.ok(html.includes('IMPORTANT'));
    assert.ok(html.includes('Build a project deploying'));
  });

  it('renders evidence backing', () => {
    const html = renderRadarResultPage({
      user: mockUser,
      tenant: mockTenant,
      analysisData: mockAnalysisData,
    });

    assert.ok(html.includes('12 Verified Skills'));
    assert.ok(html.includes('34 Evidence Citations'));
  });

  it('includes "New Analysis" link', () => {
    const html = renderRadarResultPage({
      user: mockUser,
      tenant: mockTenant,
      analysisData: mockAnalysisData,
    });

    assert.ok(html.includes('← New Analysis'));
    assert.ok(html.includes('/apps/radar'));
  });

  it('includes breadcrumb navigation', () => {
    const html = renderRadarResultPage({
      user: mockUser,
      tenant: mockTenant,
      analysisData: mockAnalysisData,
    });

    assert.ok(html.includes('breadcrumb'));
    assert.ok(html.includes('Result'));
  });

  it('shows error state when analysisData is null', () => {
    const html = renderRadarResultPage({
      user: mockUser,
      tenant: mockTenant,
      analysisData: null,
      error: 'Analysis failed: No candidate profile found.',
    });

    assert.ok(html.includes('alert-error'));
    assert.ok(html.includes('Analysis failed: No candidate profile found.'));
    assert.ok(html.includes('No analysis data available'));
    assert.ok(html.includes('Start New Analysis'));
  });

  it('escapes XSS in analysis data', () => {
    const xssData = {
      ...mockAnalysisData,
      jobContext: {
        ...mockAnalysisData.jobContext,
        extractedTitle: '<script>alert("xss")</script>',
      },
      requirementSummary: {
        ...mockAnalysisData.requirementSummary,
        keyMatchedSkills: ['<img src=x onerror=alert(1)>'],
      },
    };

    const html = renderRadarResultPage({
      user: mockUser,
      tenant: mockTenant,
      analysisData: xssData,
    });

    assert.ok(!html.includes('<script>alert("xss")</script>'));
    assert.ok(!html.includes('<img src=x onerror=alert(1)>'));
  });

  it('renders responsive grid layout', () => {
    const html = renderRadarResultPage({
      user: mockUser,
      tenant: mockTenant,
      analysisData: mockAnalysisData,
    });

    assert.ok(html.includes('grid-template-columns'));
    assert.ok(html.includes('1fr 1fr'));
  });

  it('includes Anothan Analysis button on result page', () => {
    const html = renderRadarResultPage({
      user: mockUser,
      tenant: mockTenant,
      analysisData: mockAnalysisData,
    });

    assert.ok(html.includes('Analyze Another Job'));
  });
});
