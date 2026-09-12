import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateResumeWritingQuality,
} from '../../src/services/resume-writing-quality.service.js';
import {
  AtsParseabilityService,
  defaultAtsParseabilityService,
  ATS_CHECK_WEIGHTS,
} from '../../src/services/resume-ats-parseability.service.js';

describe('P17: Writing Quality & Honest ATS Parseability', () => {
  const cleanResume = {
    header: {
      name: 'Alex Rivera',
      email: 'alex.rivera@example-dev.org',
      phone: '+1 (555) 234-5678',
      location: 'Seattle, WA',
      github: 'https://github.com/alexrivera-dev',
      linkedin: 'https://linkedin.com/in/alexrivera-swe',
    },
    summary: {
      text: 'Backend systems engineer with production experience in Go, distributed consensus protocols, and asynchronous stream pipelines.',
    },
    skills: {
      categories: [
        {
          name: 'Languages & Core Systems',
          skills: [{ name: 'Go' }, { name: 'Python' }, { name: 'SQL' }],
        },
        {
          name: 'Distributed Systems & Datastores',
          skills: [{ name: 'PostgreSQL' }, { name: 'Redis' }, { name: 'Docker' }],
        },
      ],
    },
    projects: [
      {
        name: 'Distributed Key-Value Store',
        technologies: ['Go', 'Raft', 'gRPC'],
        bullets: [
          {
            text: 'Architected distributed key-value store using Raft consensus protocol in Go.',
            evidenceRefs: [{ factId: 'f-1', evidenceId: 'e-1' }],
            composedFromFactIds: ['f-1'],
            semanticDimensions: ['architecture'],
          },
          {
            text: 'Implemented write-ahead logging (WAL) and memory-mapped SSTables for state recovery.',
            evidenceRefs: [{ factId: 'f-2', evidenceId: 'e-2' }],
            composedFromFactIds: ['f-2'],
            semanticDimensions: ['reliability'],
          },
        ],
      },
    ],
    experience: [
      {
        company: 'CloudScale Systems',
        title: 'Associate Backend Engineer',
        startDate: '2023-07',
        endDate: '2024-08',
        bullets: [
          {
            text: 'Engineered asynchronous event processing pipeline handling 15,000 events/sec via Redis Streams.',
            evidenceRefs: [{ factId: 'f-3', evidenceId: 'e-3' }],
            composedFromFactIds: ['f-3'],
            semanticDimensions: ['performance_outcome'],
          },
        ],
      },
    ],
    education: [
      {
        institution: 'University of Washington',
        degree: 'B.S. in Computer Science',
        graduationDate: '2023-06',
      },
    ],
  };

  it('evaluates all 16 writing quality dimensions on clean structured resume', () => {
    const report = evaluateResumeWritingQuality({
      structuredResume: cleanResume,
    });

    assert.ok(report);
    assert.ok(report.writingQualityScore >= 75, `Expected high score, got ${report.writingQualityScore}`);
    const dims = report.dimensions;
    assert.ok(dims);

    // Verify presence of all key dimensions
    assert.ok(typeof dims.actionVerbStrength === 'number');
    assert.ok(typeof dims.accomplishmentRatio === 'number');
    assert.ok(typeof dims.technicalSpecificity === 'number');
    assert.ok(typeof dims.resultCoverage === 'number');
    assert.ok(typeof dims.authenticMetricUsage === 'number');
    assert.ok(typeof dims.semanticDiversity === 'number');
    assert.ok(typeof dims.redundancy === 'number');
    assert.ok(typeof dims.genericLanguage === 'number');
    assert.ok(typeof dims.passiveVoice === 'number');
    assert.ok(typeof dims.verbosity === 'number');
    assert.ok(typeof dims.evidenceTraceability === 'number');
    assert.ok(typeof dims.summaryQuality === 'number');
    assert.ok(typeof dims.atsParseability === 'number');
    assert.ok(typeof dims.factUtilizationIntegrity === 'number');
    assert.ok(typeof dims.sectionCoherence === 'number');

    assert.equal(dims.actionVerbStrength, 100, 'All bullets start with strong active verbs');
    assert.equal(dims.genericLanguage, 100, 'No clichés in clean resume');
    assert.equal(dims.passiveVoice, 100, 'No passive voice in clean resume');
  });

  it('detects clichés and passive voice in degraded resume', () => {
    const degradedResume = {
      summary: {
        text: 'A hard-working results-driven team player and fast learner looking for growth.',
      },
      projects: [
        {
          name: 'Test Project',
          bullets: [
            { text: 'Was responsible for building REST APIs as a go-getter.' },
            { text: 'Worked on database queries and helped with testing.' },
          ],
        },
      ],
    };

    const report = evaluateResumeWritingQuality({
      structuredResume: degradedResume,
    });

    assert.ok(report.writingQualityScore < 70, `Degraded resume must score lower: ${report.writingQualityScore}`);
    assert.ok(report.dimensions.genericLanguage <= 70, 'Clichés must be penalized');
    assert.ok(report.dimensions.passiveVoice < 85, 'Passive voice must be penalized');
    assert.ok(report.dimensions.actionVerbStrength < 50, 'Weak verbs must be penalized');
  });

  it('evaluates ATS parseability honestly with multi-dimensional weighted checks', () => {
    const atsResult = defaultAtsParseabilityService.evaluateAtsParseability({
      structuredResume: cleanResume,
    });

    assert.ok(atsResult);
    assert.ok(atsResult.atsParseabilityScore >= 80, `Expected clean resume >= 80, got ${atsResult.atsParseabilityScore}`);
    assert.equal(atsResult.passed, true);
    assert.ok(atsResult.checks.length >= 8);

    const checkCodes = atsResult.checks.map((c) => c.checkId);
    assert.ok(checkCodes.includes('TEXT_EXTRACTION'));
    assert.ok(checkCodes.includes('CONTACT_COMPLETENESS'));
    assert.ok(checkCodes.includes('STANDARD_HEADINGS'));
    assert.ok(checkCodes.includes('LATEX_LEAKAGE'));
  });

  it('detects missing contact details and penalizes ATS score', () => {
    const incompleteResume = {
      ...cleanResume,
      header: {
        // missing name, email and phone
      },
    };

    const atsResult = defaultAtsParseabilityService.evaluateAtsParseability({
      structuredResume: incompleteResume,
    });

    assert.ok(atsResult.findings.some((f) => f.dimension === 'contact' || f.message.includes('email')));
    assert.ok(atsResult.atsParseabilityScore <= 85);
  });

  it('detects raw LaTeX leaks and broken word hyphenation in ATS evaluation', () => {
    const leakedText = `
John Doe | john@example.com | 555-123-4567
Technical Projects
• Architected \\textbf{distributed} sys-
tem with zero downtime.
`;

    const atsResult = defaultAtsParseabilityService.evaluateAtsParseability({
      extractedText: leakedText,
    });

    assert.ok(atsResult.findings.some((f) => f.dimension === 'latexLeakage' || f.message.includes('LaTeX')));
    const latexCheck = atsResult.checks.find((c) => c.checkId === 'LATEX_LEAKAGE');
    assert.equal(latexCheck.passed, false);
    assert.ok(atsResult.atsParseabilityScore < 95);
  });
});
