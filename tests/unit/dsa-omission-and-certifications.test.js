import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isMeaningfulDsa,
  areBulletsSemanticallyRedundant,
} from '../../src/services/resume-composition-primitives.js';
import { MasterResumeStructureService } from '../../src/services/master-resume-structure.service.js';
import { LatexDocumentGenerator } from '../../src/services/latex-document-generator.service.js';
import { normalizeResumeSourceSections } from '../../src/utils/resume-source-normalizer.js';

describe('DSA Section Omission and Meaningful Criteria', () => {
  it('omits DSA when candidate only has a profile URL and no bullets or stats', () => {
    const dsaUrlOnly = {
      hasSection: true,
      profileUrl: 'https://leetcode.com/u/testcandidate',
      title: 'LeetCode Profile',
      subtitle: 'Data Structures & Algorithms',
      bullets: [],
    };
    assert.strictEqual(
      isMeaningfulDsa(dsaUrlOnly),
      false,
      'URL-only DSA must not be considered meaningful'
    );
  });

  it('omits DSA when bullets only contain filler or boilerplate', () => {
    const dsaFillerOnly = {
      hasSection: true,
      profileUrl: 'https://leetcode.com/u/testcandidate',
      bullets: [
        'Solved various algorithmic problems.',
        'Practiced data structures and algorithms.',
      ],
    };
    assert.strictEqual(
      isMeaningfulDsa(dsaFillerOnly),
      false,
      'Generic filler bullets must not force a DSA section'
    );
  });

  it('includes DSA when substantive bullets with quantifiable accomplishments exist', () => {
    const dsaSubstantive = {
      hasSection: true,
      profileUrl: 'https://leetcode.com/u/testcandidate',
      bullets: [
        '300+ LeetCode problems solved across core computer science topics (Dynamic Programming, Graphs, Trees, Arrays, Binary Search).',
      ],
    };
    assert.strictEqual(
      isMeaningfulDsa(dsaSubstantive),
      true,
      'Substantive quantified bullet must make DSA meaningful'
    );
  });

  it('includes DSA when authentic problem counts, rankings, or ratings exist', () => {
    const dsaStats = {
      hasSection: true,
      profileUrl: 'https://leetcode.com/u/testcandidate',
      problemsSolved: 450,
      rating: 1850,
    };
    assert.strictEqual(isMeaningfulDsa(dsaStats), true, 'Authentic stats must make DSA meaningful');
  });

  it('omits DSA when hasSection is explicitly false regardless of bullets', () => {
    const dsaDisabled = {
      hasSection: false,
      profileUrl: 'https://leetcode.com/u/testcandidate',
      problemsSolved: 450,
      bullets: ['300+ problems solved'],
    };
    assert.strictEqual(isMeaningfulDsa(dsaDisabled), false);
  });
});

describe('Master Resume Structure Service — Section Ingestion', () => {
  it('does NOT include DSA in activeSectionOrder when DSA only has a profile URL', () => {
    const candidateData = {
      name: 'Test Candidate',
      email: 'test@example.com',
      skills: [{ name: 'JavaScript', category: 'Languages' }],
      projects: [{ id: 'p1', name: 'Project 1', bullets: ['Implemented feature.'] }],
      experience: [],
      education: [{ institution: 'Test Univ', degree: 'BS CS' }],
      portfolioLinks: [{ platform: 'LEETCODE', url: 'https://leetcode.com/u/testcandidate' }],
      dsa: {
        hasSection: true,
        profileUrl: 'https://leetcode.com/u/testcandidate',
        bullets: [],
      },
    };

    const structure = MasterResumeStructureService.resolveMasterStructure(candidateData);
    const activeOrder = MasterResumeStructureService.deriveActiveSectionOrder(
      structure,
      candidateData
    );
    assert.ok(
      !activeOrder.includes('DSA'),
      'DSA must be omitted from activeSectionOrder when content is bare URL'
    );
  });

  it('includes DSA in activeSectionOrder immediately after PROJECTS when substantive content exists', () => {
    const candidateData = {
      name: 'Test Candidate',
      email: 'test.candidate@company.org',
      skills: [{ name: 'JavaScript', category: 'Languages' }],
      projects: [{ id: 'p1', name: 'Project 1', bullets: ['Implemented feature.'] }],
      experience: [],
      education: [{ institution: 'Test Univ', degree: 'BS CS' }],
      dsa: {
        hasSection: true,
        problemsSolved: 350,
        bullets: ['350+ LeetCode problems solved across Dynamic Programming and Graphs.'],
      },
    };

    const structure = MasterResumeStructureService.resolveMasterStructure(candidateData);
    const activeOrder = MasterResumeStructureService.deriveActiveSectionOrder(
      structure,
      candidateData
    );
    assert.ok(
      activeOrder.includes('DSA'),
      'DSA must be included in activeSectionOrder when substantive'
    );
    const projIdx = activeOrder.indexOf('PROJECTS');
    const dsaIdx = activeOrder.indexOf('DSA');
    assert.strictEqual(dsaIdx, projIdx + 1, 'DSA must immediately follow PROJECTS');
  });

  it('includes CERTIFICATIONS in activeSectionOrder when candidate has certifications', () => {
    const candidateData = {
      name: 'Test Candidate',
      email: 'test.candidate@company.org',
      skills: [{ name: 'JavaScript', category: 'Languages' }],
      projects: [{ id: 'p1', name: 'Project 1', bullets: ['Implemented feature.'] }],
      certifications: [
        {
          name: 'AWS Certified Cloud Practitioner',
          issuingOrganization: 'Amazon Web Services',
          issueDate: '2024',
        },
      ],
    };

    const structure = MasterResumeStructureService.resolveMasterStructure(candidateData);
    const activeOrder = MasterResumeStructureService.deriveActiveSectionOrder(
      structure,
      candidateData
    );
    assert.ok(
      activeOrder.includes('CERTIFICATIONS'),
      'CERTIFICATIONS must be in activeSectionOrder when certifications exist'
    );
  });
});

describe('Project Accomplishment Semantic Deduplication', () => {
  it('detects duplicate accomplishments with identical text', () => {
    const bulletA = { text: 'Engineered backend REST APIs with Node.js and PostgreSQL.' };
    const bulletB = { text: 'Engineered backend REST APIs with Node.js and PostgreSQL.' };
    assert.strictEqual(areBulletsSemanticallyRedundant(bulletA, bulletB), true);
  });

  it('detects duplicate accomplishments sharing the same underlying fact ID', () => {
    const bulletA = {
      text: 'Engineered modular NestJS backend with PostgreSQL persistence and Redis caching.',
      composedFromFactIds: ['fact-101'],
    };
    const bulletB = {
      text: 'Developed NestJS services with Redis cache and PostgreSQL database.',
      composedFromFactIds: ['fact-101'],
    };
    assert.strictEqual(areBulletsSemanticallyRedundant(bulletA, bulletB), true);
  });

  it('detects duplicate accomplishments with high semantic token overlap and shared frameworks', () => {
    const bulletA = {
      text: 'Engineered automated code review assistant using Python, FastAPI, and Flask to analyze PRs.',
    };
    const bulletB = {
      text: 'Built code review tool using Python, Flask, and FastAPI to inspect pull requests for anti-patterns.',
    };
    assert.strictEqual(areBulletsSemanticallyRedundant(bulletA, bulletB), true);
  });

  it('does NOT flag distinct accomplishments within the same project', () => {
    const bulletA = {
      text: 'Engineered modular NestJS backend with TypeORM and PostgreSQL persistence.',
      composedFromFactIds: ['fact-101'],
    };
    const bulletB = {
      text: 'Integrated Swagger/OpenAPI documentation and containerized services using Docker Compose.',
      composedFromFactIds: ['fact-102'],
    };
    assert.strictEqual(areBulletsSemanticallyRedundant(bulletA, bulletB), false);
  });
});

describe('LaTeX Typography and Section Formatting', () => {
  const generator = new LatexDocumentGenerator();

  it('renders 4-tier header typography: Name 21pt, Headline 12.5pt, Contact 9.5pt', () => {
    const pkg = {
      candidateName: 'Jane Developer',
      headline: 'Senior Backend Engineer',
      contactLine: 'jane.developer@company.org | +1 555-0100 | San Francisco, CA',
      tailoredResume: {
        structuredResume: {
          candidateIdentity: {
            name: 'Jane Developer',
            headline: 'Senior Backend Engineer',
            email: 'jane.developer@company.org',
            phone: '+1 555-0100',
            location: 'San Francisco, CA',
            links: [{ label: 'GitHub', url: 'https://github.com/janedev' }],
          },
          summary: { text: 'Experienced backend systems engineer.' },
          skills: { categories: [{ name: 'Languages', skills: ['Go', 'Python'] }] },
          projects: [],
          experience: [],
          education: [],
        },
      },
    };

    const { texContent } = generator.generateTailoredResumeLatex({ applicationPackage: pkg });
    assert.ok(
      texContent.includes('\\fontsize{21pt}{25pt}\\selectfont'),
      'Candidate Name must be formatted at 21pt font'
    );
    assert.ok(
      texContent.includes('\\fontsize{12.5pt}{15pt}\\selectfont'),
      'Target Role must be formatted at 12.5pt font'
    );
    assert.ok(
      texContent.includes('\\fontsize{9.5pt}{11.5pt}\\selectfont'),
      'Contact line must be formatted at 9.5pt font'
    );
  });

  it('omits DSA section from LaTeX output when candidate DSA is URL-only', () => {
    const pkg = {
      candidateName: 'Jane Developer',
      contactLine: 'jane.developer@company.org | +1 555-0100 | San Francisco, CA',
      tailoredResume: {
        structuredResume: {
          candidateIdentity: {
            name: 'Jane Developer',
            email: 'jane.developer@company.org',
            phone: '+1 555-0100',
            location: 'San Francisco, CA',
            links: [{ label: 'LeetCode', url: 'https://leetcode.com/u/janedev' }],
          },
          summary: { text: 'Experienced engineer.' },
          skills: { categories: [{ name: 'Languages', skills: ['Python'] }] },
          projects: [],
          experience: [],
          education: [],
          dsa: {
            hasSection: true,
            profileUrl: 'https://leetcode.com/u/janedev',
            bullets: [],
          },
        },
      },
    };

    const { texContent } = generator.generateTailoredResumeLatex({ applicationPackage: pkg });
    assert.ok(
      !texContent.includes('\\atssection{PROBLEM SOLVING}'),
      'LaTeX must NOT render PROBLEM SOLVING section when DSA has no bullets or stats'
    );
    assert.ok(
      texContent.includes('leetcode.com/u/janedev'),
      'LeetCode URL must still be preserved in header links'
    );
  });

  it('renders certifications with Title — Issuer | Year and clickable hyperlink', () => {
    const pkg = {
      candidateName: 'Jane Developer',
      contactLine: 'jane.developer@company.org | +1 555-0100 | San Francisco, CA',
      tailoredResume: {
        structuredResume: {
          candidateIdentity: {
            name: 'Jane Developer',
            email: 'jane.developer@company.org',
            phone: '+1 555-0100',
            location: 'San Francisco, CA',
          },
          summary: { text: 'Experienced engineer.' },
          skills: { categories: [{ name: 'Languages', skills: ['Python'] }] },
          projects: [],
          experience: [],
          education: [],
          certifications: [
            {
              name: 'AWS Solutions Architect',
              issuingOrganization: 'Amazon Web Services',
              issueDate: '2024',
              credentialUrl: 'https://aws.amazon.com/verify/12345',
            },
          ],
        },
      },
    };

    const { texContent } = generator.generateTailoredResumeLatex({ applicationPackage: pkg });
    assert.ok(
      /\\atssection\{certifications\}/i.test(texContent),
      'Certifications heading must render'
    );
    assert.ok(
      texContent.includes('\\href{https://aws.amazon.com/verify/12345}'),
      'Clickable hyperlink to credential URL must render'
    );
    assert.ok(texContent.includes('AWS Solutions Architect'), 'Certification title must render');
    assert.ok(texContent.includes('Amazon Web Services'), 'Issuer must render');
  });
});

describe('Certifications Normalization & Validation', () => {
  it('normalizes valid certification record from candidate profile', () => {
    const rawProfile = {
      certifications: [
        {
          name: 'CKA: Certified Kubernetes Administrator',
          issuingOrganization: 'Linux Foundation',
          issueDate: '2024-01',
          expirationDate: '2027-01',
          credentialId: 'LF-CKA-7890',
          credentialUrl: 'https://www.credly.com/badges/sample',
        },
      ],
    };

    const normalized = normalizeResumeSourceSections(rawProfile);
    assert.strictEqual(normalized.certifications.length, 1);
    const cert = normalized.certifications[0];
    assert.strictEqual(cert.name, 'CKA: Certified Kubernetes Administrator');
    assert.strictEqual(cert.issuingOrganization, 'Linux Foundation');
    assert.strictEqual(cert.issueDate, '2024-01');
    assert.strictEqual(cert.expirationDate, '2027-01');
    assert.strictEqual(cert.credentialId, 'LF-CKA-7890');
    assert.strictEqual(cert.credentialUrl, 'https://www.credly.com/badges/sample');
  });

  it('rejects certification with issueDate after expirationDate', () => {
    const rawProfile = {
      certifications: [
        {
          name: 'Invalid Date Cert',
          issuingOrganization: 'Some Org',
          issueDate: '2025-01',
          expirationDate: '2023-01',
        },
      ],
    };

    assert.throws(() => normalizeResumeSourceSections(rawProfile), /Invalid resume source fields/);
  });
});
