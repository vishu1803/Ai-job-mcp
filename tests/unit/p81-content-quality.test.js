/**
 * @file Unit Tests for Hardened Resume Content Quality Engine (P81)
 *
 * Verifies:
 * 1. Strong action verbs vs weak responsibility phrases.
 * 2. Generic buzzword & cliché detection.
 * 3. Quantification metrics (quantificationRate, verifiedMetricCount).
 * 4. Honest metric principle: non-quantified bullets with technical mechanisms are not penalized.
 * 5. Sentence fragment and excessive bullet length (> 35 words) detection.
 * 6. Pairwise bullet redundancy detection.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateResumeWritingQuality } from '../../src/services/resume-writing-quality.service.js';

describe('P81: Resume Content Quality & Measurable Content Engine', () => {
  it('recognizes strong action verbs and technical mechanisms without penalizing unquantified bullets', () => {
    const strongTechResume = {
      summary: {
        text: 'Backend software engineer with deep expertise in distributed storage systems and consensus protocols.',
      },
      skills: { categories: [{ categoryName: 'Languages', skills: [{ name: 'Go' }] }] },
      projects: [
        {
          name: 'Storage Engine',
          bullets: [
            { text: 'Implemented Raft consensus algorithm with leader election and log replication in Go.' },
            { text: 'Architected write-ahead logging and persistent memory-mapped SSTables for state recovery.' },
          ],
        },
      ],
      experience: [
        {
          company: 'InfraCorp',
          title: 'Software Engineer',
          bullets: [
            { text: 'Engineered REST APIs using Express.js with PostgreSQL persistence to support authenticated application workflows.' },
          ],
        },
      ],
    };

    const report = evaluateResumeWritingQuality({ structuredResume: strongTechResume });

    assert.ok(report);
    assert.ok(report.writingQualityScore >= 75);
    assert.equal(report.quantification.totalBullets, 3);
    assert.equal(report.quantification.quantifiedBulletCount, 0);
    // Verified that non-quantified bullets with strong technical mechanisms receive high authenticMetricScore
    assert.ok(report.dimensions.authenticMetricUsage >= 80);
    assert.ok(report.dimensions.actionVerbStrength >= 80);
  });

  it('detects all specified weak verb openers (worked on, responsible for, assisted with, participated in, tasked with)', () => {
    const weakResume = {
      summary: { text: 'Experienced engineer.' },
      projects: [
        {
          name: 'App',
          bullets: [
            { text: 'Worked on database queries and index creation.' },
            { text: 'Responsible for server deployment and maintenance.' },
            { text: 'Assisted with code reviews and bug fixes.' },
            { text: 'Participated in agile ceremonies and sprint planning.' },
            { text: 'Tasked with migration of legacy endpoints.' },
          ],
        },
      ],
    };

    const report = evaluateResumeWritingQuality({ structuredResume: weakResume });

    const weakFinding = report.findings.find((f) => f.code === 'WEAK_VERB');
    assert.ok(weakFinding);
    assert.ok(report.dimensions.actionVerbStrength < 50);
  });

  it('detects generic corporate clichés (dynamic, results-driven, passionate, cutting-edge, world-class, seamless)', () => {
    const clicheResume = {
      summary: {
        text: 'Dynamic and results-driven professional passionate about building world-class cutting-edge seamless applications.',
      },
      projects: [
        {
          name: 'Website',
          bullets: [
            { text: 'Engineered innovative solution using highly motivated team practices.' },
          ],
        },
      ],
    };

    const report = evaluateResumeWritingQuality({ structuredResume: clicheResume });

    const clicheFinding = report.findings.find((f) => f.code === 'CLICHE_DETECTED');
    assert.ok(clicheFinding);
    assert.ok(report.dimensions.genericLanguage < 60);
  });

  it('computes exact quantification metrics for bullets with verified numbers', () => {
    const quantifiedResume = {
      summary: { text: 'Backend systems engineer.' },
      projects: [
        {
          name: 'Pipeline',
          bullets: [
            { text: 'Engineered asynchronous event processing pipeline handling 15,000 requests/sec via Redis streams.' },
            { text: 'Optimized PostgreSQL queries reducing latency by 35% across all endpoints.' },
            { text: 'Implemented distributed caching layer using Redis.' },
          ],
        },
      ],
    };

    const report = evaluateResumeWritingQuality({ structuredResume: quantifiedResume });

    assert.equal(report.quantification.totalBullets, 3);
    assert.equal(report.quantification.quantifiedBulletCount, 2);
    assert.equal(report.quantification.quantificationRate, 66.7);
  });

  it('detects sentence fragments lacking punctuation and excessive length (>35 words)', () => {
    const fragmentedResume = {
      summary: { text: 'Software developer.' },
      projects: [
        {
          name: 'Tool',
          bullets: [
            // Fragment without terminating period
            { text: 'Engineered high performance caching mechanism' },
            // Excessive length bullet (38 words)
            {
              text: 'Architected distributed event messaging infrastructure using Apache Kafka and RabbitMQ with multiple partitions and consumers to guarantee high throughput, fault tolerance, horizontal scalability, zero message loss, and real-time observability across all microservices in the enterprise cloud platform.',
            },
          ],
        },
      ],
    };

    const report = evaluateResumeWritingQuality({ structuredResume: fragmentedResume });

    const fragFinding = report.findings.find((f) => f.code === 'SENTENCE_FRAGMENT');
    assert.ok(fragFinding);
    assert.ok(report.dimensions.fragmentCount >= 1);

    const lengthFinding = report.findings.find((f) => f.code === 'EXCESSIVE_LENGTH');
    assert.ok(lengthFinding);
    assert.ok(report.dimensions.excessiveLengthCount >= 1);
  });

  it('detects semantic and token redundancy between bullet pairs', () => {
    const redundantResume = {
      summary: { text: 'Software engineer.' },
      projects: [
        {
          name: 'App',
          bullets: [
            { text: 'Engineered high throughput API services using Node.js, Express, and PostgreSQL with Redis caching.' },
            { text: 'Engineered high throughput backend services using Node.js, Express, and PostgreSQL with Redis caching.' },
          ],
        },
      ],
    };

    const report = evaluateResumeWritingQuality({ structuredResume: redundantResume });

    const redFinding = report.findings.find((f) => f.code === 'SEMANTIC_REDUNDANCY');
    assert.ok(redFinding);
    assert.ok(report.dimensions.redundancy < 80);
  });

  it('detects unauthorized metric claims and emits UNAUTHORIZED_METRIC_CLAIM finding', () => {
    const factInventory = {
      facts: [
        {
          id: 'fact-1',
          text: 'Scaled cluster to handle 10,000 requests/sec',
          metrics: { throughput: '10,000 requests/sec' },
        },
      ],
    };

    const resumeWithUnauthorizedMetric = {
      summary: { text: 'Backend engineer.' },
      projects: [
        {
          name: 'Cluster',
          bullets: [
            {
              text: 'Scaled distributed cluster achieving 99.99% availability and 75,000 requests/sec via Kubernetes.',
              composedFromFactIds: ['fact-1'],
            },
          ],
        },
      ],
    };

    const report = evaluateResumeWritingQuality({
      structuredResume: resumeWithUnauthorizedMetric,
      factInventory,
    });

    const unauthFinding = report.findings.find((f) => f.code === 'UNAUTHORIZED_METRIC_CLAIM');
    assert.ok(unauthFinding, 'Must emit UNAUTHORIZED_METRIC_CLAIM for unbacked 99.99% or 75,000 requests/sec');
    assert.equal(report.quantification.verifiedMetricCount, 0);
    assert.equal(report.dimensions.authenticMetricUsage, 0);
  });

  it('verifies authorized derived percentage metrics without unauthorized warnings', () => {
    const factInventory = {
      facts: [
        {
          id: 'fact-latency',
          text: 'Reduced response time from 1000ms to 600ms',
          metrics: { baselineLatency: '1000ms', finalLatency: '600ms' },
        },
      ],
    };

    const resumeWithDerivedMetric = {
      summary: { text: 'Backend engineer.' },
      projects: [
        {
          name: 'Optimizer',
          bullets: [
            {
              text: 'Optimized query planner reducing response time by 40% via index hints.',
              composedFromFactIds: ['fact-latency'],
            },
          ],
        },
      ],
    };

    const report = evaluateResumeWritingQuality({
      structuredResume: resumeWithDerivedMetric,
      factInventory,
    });

    const unauthFinding = report.findings.find((f) => f.code === 'UNAUTHORIZED_METRIC_CLAIM');
    assert.equal(unauthFinding, undefined, 'Authorized derived metric must not trigger unauthorized finding');
    assert.equal(report.quantification.verifiedMetricCount, 1);
    assert.equal(report.dimensions.authenticMetricUsage, 100);
  });
});
