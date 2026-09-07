/**
 * @file Unit Tests: Content Selection / Optional Section Boundary
 *
 * Verifies:
 * 1. Content Strategy is authoritative for all optional candidate-owned sections:
 *    - Problem Solving / DSA
 *    - Certifications
 *    - Coursework
 *    - Publications
 *    - Achievements
 *    - Additional Skills
 *    - Awards
 * 2. The renderer receives selectedSections + sectionSnapshots and only performs layout/rendering.
 * 3. For every selected optional section:
 *    - Section must exist in the package snapshot (sectionSnapshots);
 *    - Content must be candidate-owned / provenance-valid;
 *    - Renderer must render it;
 *    - Renderer must never infer selection from available page space;
 *    - Renderer must never create content to fill whitespace.
 * 4. For DSA specifically:
 *    - LeetCode URL presence is NOT the selection condition.
 *    - DSA selection comes strictly from Content Strategy.
 *    - LeetCode is optional content inside the selected DSA section.
 *    - If DSA is selected but valid candidate-owned DSA content is missing, fail validation rather than inventing content.
 *    - If DSA is not selected, renderer must omit the section even if a LeetCode link exists.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CandidateArtifactContentService } from '../../src/services/candidate-artifact-content.service.js';
import { LatexDocumentGenerator } from '../../src/services/latex-document-generator.service.js';
import { ResumeLayoutEngine } from '../../src/services/resume-layout-engine.service.js';
import { ValidationError } from '../../src/errors/index.js';

describe('Content Selection / Optional Section Boundary', () => {
  const contentService = new CandidateArtifactContentService();
  const latexGenerator = new LatexDocumentGenerator();
  const layoutEngine = new ResumeLayoutEngine();

  const dummyJob = {
    id: 'job-123',
    title: 'Senior Backend Engineer',
    company: 'Cloud Corp',
    skills: ['Node.js', 'PostgreSQL', 'TypeScript', 'Redis'],
    requirements: ['Microservices', 'Distributed Systems'],
  };

  const baseCandidate = {
    displayName: 'Alex Mercer',
    email: 'alex.mercer@example.org',
    phone: '555-0199',
    location: 'San Francisco, CA',
    headline: 'Senior Backend Engineer',
    summary: 'Experienced backend systems architect specializing in high-throughput distributed microservices.',
    skills: [
      { name: 'Node.js', provenanceStatus: 'VERIFIED', evidenceCount: 10 },
      { name: 'PostgreSQL', provenanceStatus: 'VERIFIED', evidenceCount: 8 },
      { name: 'TypeScript', provenanceStatus: 'VERIFIED', evidenceCount: 6 },
    ],
    experience: [
      {
        title: 'Backend Engineer',
        company: 'DataFlow Inc',
        startDate: '2022-01',
        endDate: '2024-05',
        location: 'San Francisco, CA',
        bullets: ['Architected distributed telemetry pipeline processing 50M events daily.'],
      },
    ],
    education: [
      {
        degree: 'Bachelor of Science in Computer Science',
        institution: 'University of California, Berkeley',
        startDate: '2018',
        endDate: '2022',
        coursework: ['Data Structures & Algorithms', 'Distributed Systems', 'Operating Systems'],
      },
    ],
    projects: [
      {
        name: 'Distributed KV Store',
        title: 'Distributed KV Store',
        repositoryUrl: 'https://github.com/alexmercer/distributed-kv',
        technologies: ['Node.js', 'TypeScript', 'Raft'],
        bullets: ['Implemented Raft consensus algorithm for distributed state replication.'],
      },
      {
        name: 'Event Streamer',
        title: 'Event Streamer',
        repositoryUrl: 'https://github.com/alexmercer/event-streamer',
        technologies: ['TypeScript', 'Redis', 'PostgreSQL'],
        bullets: ['Engineered pub-sub messaging broker with sub-millisecond dispatch.'],
      },
    ],
  };

  describe('Content Strategy Authority & Section Snapshots', () => {
    it('constructs structured sectionSnapshots matching selectedSections', () => {
      const candidateWithOptional = {
        ...baseCandidate,
        hasProblemSolvingSection: true,
        problemSolving: {
          hasSection: true,
          profileUrl: 'https://leetcode.com/u/alexmercer',
          bullets: [
            'Solved 400+ algorithmic problems across trees, graphs, dynamic programming, and heaps.',
            'Regularly participate in weekly algorithmic contests with top 5% rank.',
          ],
        },
        certifications: ['AWS Certified Solutions Architect - Associate'],
        publications: ['Efficient Consensus in Asynchronous Networks (IEEE 2023)'],
        achievements: ['1st Place - Berkeley Hackathon 2021'],
        additionalSkills: ['Docker', 'Kubernetes'],
        awards: ['Dean Honors List 2020-2022'],
      };

      const resume = contentService.buildTailoredResumeMarkdown(candidateWithOptional, dummyJob, {
        includeProblemSolving: true,
        includeCertifications: true,
        includePublications: true,
        includeAchievements: true,
        includeAdditionalSkills: true,
        includeAwards: true,
      });

      // Verify sections and sectionSnapshots
      assert.ok(Array.isArray(resume.selectedSections), 'selectedSections must be an array');
      assert.ok(resume.selectedSections.includes('PROFESSIONAL_SUMMARY'));
      assert.ok(resume.selectedSections.includes('TECHNICAL_SKILLS'));
      assert.ok(resume.selectedSections.includes('PROJECTS'));
      assert.ok(resume.selectedSections.includes('PROBLEM_SOLVING'));
      assert.ok(resume.selectedSections.includes('PROFESSIONAL_EXPERIENCE'));
      assert.ok(resume.selectedSections.includes('EDUCATION'));
      assert.ok(resume.selectedSections.includes('CERTIFICATIONS'));
      assert.ok(resume.selectedSections.includes('PUBLICATIONS'));
      assert.ok(resume.selectedSections.includes('ACHIEVEMENTS'));
      assert.ok(resume.selectedSections.includes('ADDITIONAL_SKILLS'));
      assert.ok(resume.selectedSections.includes('AWARDS'));

      assert.ok(resume.sectionSnapshots, 'sectionSnapshots must be present');
      assert.equal(resume.sectionSnapshots.PROBLEM_SOLVING.bullets.length, 2);
      assert.equal(resume.sectionSnapshots.PROBLEM_SOLVING.profileUrl, 'https://leetcode.com/u/alexmercer');
      assert.equal(resume.sectionSnapshots.CERTIFICATIONS.records.length, 1);
      assert.equal(resume.sectionSnapshots.PUBLICATIONS.records.length, 1);
      assert.equal(resume.sectionSnapshots.ACHIEVEMENTS.records.length, 1);
      assert.equal(resume.sectionSnapshots.ADDITIONAL_SKILLS.records.length, 2);
      assert.equal(resume.sectionSnapshots.AWARDS.records.length, 1);
    });

    it('omits optional sections when Content Strategy specifies omission', () => {
      const candidateWithOptional = {
        ...baseCandidate,
        hasProblemSolvingSection: true,
        problemSolving: {
          hasSection: true,
          bullets: ['Solved algorithmic problems.'],
        },
        certifications: ['AWS Certified Solutions Architect'],
      };

      const resume = contentService.buildTailoredResumeMarkdown(candidateWithOptional, dummyJob, {
        includeProblemSolving: false,
        includeCertifications: false,
      });

      assert.ok(!resume.selectedSections.includes('PROBLEM_SOLVING'));
      assert.ok(!resume.selectedSections.includes('CERTIFICATIONS'));
      assert.ok(!resume.markdownContent.includes('Problem Solving & Algorithmic Practice'));
      assert.ok(!resume.markdownContent.includes('## Certifications'));
      assert.equal(resume.sectionSnapshots.PROBLEM_SOLVING, undefined);
      assert.equal(resume.sectionSnapshots.CERTIFICATIONS, undefined);
    });
  });

  describe('DSA Section Authority & LeetCode Optional Content', () => {
    it('LeetCode URL presence is NOT the selection condition: omits DSA when Content Strategy omits it', () => {
      const candidateWithLeetCodeOnly = {
        ...baseCandidate,
        portfolioLinks: [
          { label: 'LeetCode', url: 'https://leetcode.com/u/alexmercer' },
          { label: 'GitHub', url: 'https://github.com/alexmercer' },
        ],
      };

      // Content Strategy explicitly omits DSA
      const resume = contentService.buildTailoredResumeMarkdown(candidateWithLeetCodeOnly, dummyJob, {
        includeProblemSolving: false,
      });

      assert.ok(!resume.selectedSections.includes('PROBLEM_SOLVING'), 'DSA must NOT be selected');
      assert.ok(!resume.markdownContent.includes('Problem Solving & Algorithmic Practice'));

      // Renderer must strictly omit the section even though LeetCode URL exists
      const pkg = {
        candidateName: 'Alex Mercer',
        candidateEmail: 'alex.mercer@example.org',
        targetJob: dummyJob,
        tailoredResume: resume,
      };

      const latex = latexGenerator.generateTailoredResumeLatex({
        applicationPackage: pkg,
        candidateProfile: candidateWithLeetCodeOnly,
      });

      assert.ok(
        !latex.texContent.includes('Problem Solving'),
        'Renderer MUST omit DSA section when not in selectedSections even if LeetCode URL exists'
      );
    });

    it('renders DSA without LeetCode URL if candidate has valid DSA content but no LeetCode profile', () => {
      const candidateWithDsaNoUrl = {
        ...baseCandidate,
        hasProblemSolvingSection: true,
        problemSolving: {
          hasSection: true,
          profileUrl: null, // No LeetCode URL
          bullets: [
            'Competed in algorithmic programming contests focusing on dynamic programming and graph algorithms.',
            'Practiced advanced data structure implementations including segment trees and disjoint-set unions.',
          ],
        },
      };

      const resume = contentService.buildTailoredResumeMarkdown(candidateWithDsaNoUrl, dummyJob, {
        includeProblemSolving: true,
      });

      assert.ok(resume.selectedSections.includes('PROBLEM_SOLVING'), 'DSA must be selected');

      const pkg = {
        candidateName: 'Alex Mercer',
        candidateEmail: 'alex.mercer@example.org',
        targetJob: dummyJob,
        tailoredResume: resume,
      };

      const latex = latexGenerator.generateTailoredResumeLatex({
        applicationPackage: pkg,
        candidateProfile: candidateWithDsaNoUrl,
      });

      assert.ok(
        latex.texContent.includes('\\atssection{Problem Solving \\& Algorithmic Practice}'),
        'Must render DSA section'
      );
      assert.ok(
        latex.texContent.includes('Candidate-Reported'),
        'Must render Candidate-Reported label'
      );
      assert.ok(
        !latex.texContent.includes('href{https://leetcode.com'),
        'Must NOT contain LeetCode URL link when not present'
      );
      assert.ok(
        latex.texContent.includes('Competed in algorithmic programming contests'),
        'Must render authentic candidate bullets'
      );
    });

    it('fails validation when DSA is selected by Content Strategy but valid candidate DSA content is missing', () => {
      const candidateWithNoDsaContent = {
        ...baseCandidate,
        portfolioLinks: [
          { label: 'LeetCode', url: 'https://leetcode.com/u/alexmercer' },
        ],
        problemSolving: null,
        hasProblemSolvingSection: false,
      };

      // Content Strategy forced selection when candidate has no DSA bullets -> must fail validation
      assert.throws(
        () => {
          contentService.buildTailoredResumeMarkdown(candidateWithNoDsaContent, dummyJob, {
            includeProblemSolving: true,
          });
        },
        (err) => {
          assert.ok(err instanceof ValidationError);
          assert.ok(err.message.includes('valid candidate-owned DSA content is missing'));
          return true;
        }
      );
    });

    it('renderer fails validation if selectedSections includes DSA but snapshot content is missing', () => {
      const pkgMissingDsaContent = {
        candidateName: 'Alex Mercer',
        candidateEmail: 'alex.mercer@example.org',
        targetJob: dummyJob,
        tailoredResume: {
          title: 'Resume',
          markdownContent: '## Professional Summary\nSummary.\n\n## Technical Skills\n- Skills.',
          selectedSections: ['SUMMARY', 'TECHNICAL_SKILLS', 'PROJECTS', 'PROBLEM_SOLVING'],
          sectionSnapshots: {}, // Empty snapshots!
        },
      };

      assert.throws(
        () => {
          latexGenerator.generateTailoredResumeLatex({
            applicationPackage: pkgMissingDsaContent,
            candidateProfile: baseCandidate,
          });
        },
        (err) => {
          assert.ok(err instanceof ValidationError);
          assert.ok(err.message.includes('DSA section is selected by Content Strategy, but valid candidate-owned DSA content is missing'));
          return true;
        }
      );
    });
  });

  describe('Rendering Layer Pure Execution (Zero Inference, Zero Filler)', () => {
    it('omits Certifications when selectedSections excludes it, even if candidateProfile has certifications', () => {
      const candidateWithCerts = {
        ...baseCandidate,
        certifications: ['AWS Solutions Architect Pro', 'Certified Kubernetes Administrator'],
      };

      const pkg = {
        candidateName: 'Alex Mercer',
        candidateEmail: 'alex.mercer@example.org',
        targetJob: dummyJob,
        tailoredResume: {
          title: 'Resume',
          markdownContent: '## Professional Summary\nSummary.',
          selectedSections: ['SUMMARY', 'TECHNICAL_SKILLS', 'PROJECTS', 'PROFESSIONAL_EXPERIENCE', 'EDUCATION'],
          sectionSnapshots: {},
        },
      };

      const latex = latexGenerator.generateTailoredResumeLatex({
        applicationPackage: pkg,
        candidateProfile: candidateWithCerts,
      });

      assert.ok(
        !latex.texContent.includes('Certifications'),
        'Renderer must NOT render Certifications when omitted from selectedSections'
      );
      assert.ok(
        !latex.texContent.includes('AWS Solutions Architect Pro'),
        'Renderer must NOT leak unselected certifications'
      );
    });

    it('renders optional sections strictly when present in selectedSections and sectionSnapshots', () => {
      const pkg = {
        candidateName: 'Alex Mercer',
        candidateEmail: 'alex.mercer@example.org',
        targetJob: dummyJob,
        tailoredResume: {
          title: 'Resume',
          markdownContent: '## Professional Summary\nSummary.',
          selectedSections: [
            'SUMMARY',
            'TECHNICAL_SKILLS',
            'PROJECTS',
            'PROFESSIONAL_EXPERIENCE',
            'EDUCATION',
            'PUBLICATIONS',
            'AWARDS',
          ],
          sectionSnapshots: {
            PUBLICATIONS: {
              records: ['Distributed Consensus in Modern Clouds (ACM 2024)'],
            },
            AWARDS: {
              records: ['Top Open Source Contributor Award 2023'],
            },
          },
        },
      };

      const latex = latexGenerator.generateTailoredResumeLatex({
        applicationPackage: pkg,
        candidateProfile: baseCandidate,
      });

      assert.ok(latex.texContent.includes('\\atssection{Publications}'), 'Must render Publications');
      assert.ok(
        latex.texContent.includes('Distributed Consensus in Modern Clouds'),
        'Must render authentic publication title'
      );
      assert.ok(latex.texContent.includes('\\atssection{Awards}'), 'Must render Awards');
      assert.ok(
        latex.texContent.includes('Top Open Source Contributor Award 2023'),
        'Must render authentic award title'
      );
    });

    it('layout engine semantic model respects authoritative selectedSections', () => {
      const pkgNoDsa = {
        candidateName: 'Alex Mercer',
        candidateEmail: 'alex.mercer@example.org',
        targetJob: dummyJob,
        tailoredResume: {
          title: 'Resume',
          selectedSections: ['SUMMARY', 'TECHNICAL_SKILLS', 'PROJECTS', 'PROFESSIONAL_EXPERIENCE', 'EDUCATION'],
        },
      };

      const candidateWithLeetcode = {
        ...baseCandidate,
        portfolioLinks: [{ label: 'LeetCode', url: 'https://leetcode.com/u/alexmercer' }],
      };

      const { model } = layoutEngine.computeLayout({
        applicationPackage: pkgNoDsa,
        candidateProfile: candidateWithLeetcode,
      });

      assert.equal(model.optionalSections.dsa, null, 'Layout engine must not include DSA when selectedSections omits it');
    });
  });
});
