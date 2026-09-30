/**
 * @file Unit Tests for MCP ATS Intelligence Tools (Phase 20)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createAtsMcpServer, createCareerMcpServer } from '../../src/mcp/server.js';
import { registerAtsIntelligenceTools } from '../../src/mcp/tools/ats-intelligence-tools.js';
import { McpServerWrapper } from '../../src/mcp/server.js';

describe('MCP ATS Intelligence Tools (Phase 20)', () => {
  const mockContext = {
    tenantId: '11111111-1111-1111-1111-111111111111',
    candidateId: '22222222-2222-2222-2222-222222222222',
    userId: '33333333-3333-3333-3333-333333333333',
    role: 'MEMBER',
    tokenScopes: ['career:read', 'career:write'],
    authMethod: 'MCP_API_TOKEN',
  };

  const sampleResume = `
Jane Doe
jane.doe@example.com
(555) 987-6543
https://linkedin.com/in/janedoe

PROFESSIONAL SUMMARY
Senior Distributed Systems Engineer with 8 years of experience designing high-throughput microservices in Go, Rust, and TypeScript.

SKILLS
Go, Rust, TypeScript, Docker, Kubernetes, PostgreSQL, Kafka, Redis, Distributed Systems, CI/CD, AWS

EXPERIENCE
Staff Systems Engineer | CloudScale Inc.
January 2021 - Present
- Architected high-throughput message processing pipeline handling 50k req/sec with Kafka and Go.
- Reduced p99 latency from 120ms to 18ms through memory optimization in Go microservices.
- Deployed multi-region clusters using Kubernetes and AWS EKS.

Senior Backend Engineer | DataCorp
March 2017 - December 2020
- Built distributed caching layer with Redis and PostgreSQL, improving query response time by 60%.
- Migrated monolith to microservices using Docker and CI/CD pipelines.

EDUCATION
Bachelor of Science in Computer Science
University of Washington, 2017
`;

  const sampleJob = `
Senior Distributed Systems Engineer
Seeking an experienced engineer proficient in Go, Kubernetes, Kafka, and PostgreSQL.
Requirements:
- 5+ years building distributed backend services
- Strong experience with Go or Rust
- Hands-on expertise with Kafka, Docker, and Kubernetes
- Solid relational database modeling with PostgreSQL
`;

  it('1. registers 5 ATS intelligence tools cleanly via registerAtsIntelligenceTools', () => {
    const server = new McpServerWrapper();
    registerAtsIntelligenceTools(server);
    const tools = server.getRegisteredTools();

    assert.equal(tools.length, 5);
    const names = tools.map((t) => t.name).sort();
    assert.deepEqual(names, [
      'analyze_application_readiness',
      'analyze_candidate_job_fit',
      'analyze_resume_ats',
      'simulate_ats',
      'simulate_recruiter_search',
    ]);

    for (const tool of tools) {
      assert.equal(tool.requiredRole, 'READONLY');
      assert.deepEqual(tool.requiredScopes, ['career:read']);
    }
  });

  it('2. registers 35 tools on createAtsMcpServer', () => {
    const server = createAtsMcpServer();
    const tools = server.getRegisteredTools();
    assert.equal(tools.length, 35);
  });

  it('3. executes analyze_resume_ats', async () => {
    const server = createAtsMcpServer();
    const handler = server.registeredTools.get('analyze_resume_ats').handler;

    const result = await handler(mockContext, {
      resumeText: sampleResume,
      targetAts: 'WORKDAY',
    });

    assert.ok(result.content);
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(parsed.parseabilityScore > 70);
    assert.equal(parsed.targetAts, 'WORKDAY');
    assert.ok(parsed.targetCompatibility);
    assert.ok(parsed.allProfiles.GREENHOUSE_COMPATIBILITY);
    assert.ok(parsed.extractionSimulation);
  });

  it('4. executes analyze_candidate_job_fit with raw resumeText', async () => {
    const server = createAtsMcpServer();
    const handler = server.registeredTools.get('analyze_candidate_job_fit').handler;

    const result = await handler(mockContext, {
      jobDescription: sampleJob,
      resumeText: sampleResume,
    });

    assert.ok(result.content);
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(parsed.fitScore >= 0 && parsed.fitScore <= 100);
    assert.ok(['EXCELLENT', 'STRONG', 'MODERATE', 'WEAK'].includes(parsed.fitBand));
    assert.ok(parsed.componentBreakdown);
    assert.ok(parsed.explainability);
  });

  it('5. executes analyze_application_readiness', async () => {
    const server = createAtsMcpServer();
    const handler = server.registeredTools.get('analyze_application_readiness').handler;

    const result = await handler(mockContext, {
      jobDescription: sampleJob,
      resumeText: sampleResume,
    });

    assert.ok(result.content);
    const parsed = JSON.parse(result.content[0].text);
    assert.ok(parsed.readinessScore >= 0 && parsed.readinessScore <= 100);
    assert.ok(parsed.readinessBand);
    assert.ok(parsed.recommendation);
    assert.ok(parsed.scoreBreakdown);
    assert.ok(Array.isArray(parsed.checklist));
  });

  it('6. executes simulate_ats', async () => {
    const server = createAtsMcpServer();
    const handler = server.registeredTools.get('simulate_ats').handler;

    const result = await handler(mockContext, {
      resumeText: sampleResume,
    });

    assert.ok(result.content);
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.candidateName, 'Jane Doe');
    assert.equal(parsed.contactFound, true);
    assert.ok(parsed.skillsCount > 5);
    assert.ok(parsed.extractionScore >= 50);
  });

  it('7. executes simulate_recruiter_search', async () => {
    const server = createAtsMcpServer();
    const handler = server.registeredTools.get('simulate_recruiter_search').handler;

    const result = await handler(mockContext, {
      query: 'Go AND Kubernetes AND Kafka',
      resumeText: sampleResume,
    });

    assert.ok(result.content);
    const parsed = JSON.parse(result.content[0].text);
    assert.equal(parsed.searchFound, true);
    assert.equal(parsed.coverage, 100);
    const lowerMatched = parsed.matchedKeywords.map((k) => k.toLowerCase());
    assert.ok(lowerMatched.includes('go'));
    assert.ok(lowerMatched.includes('kubernetes'));
    assert.ok(lowerMatched.includes('kafka'));
  });
});
