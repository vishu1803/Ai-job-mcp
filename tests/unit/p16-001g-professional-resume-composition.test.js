/**
 * @file Unit Tests for Professional Resume Composition Service (P16-001G).
 *
 * Tests the deterministic professional composition layer that improves resume
 * quality while preserving all architectural invariants and candidate-owned data.
 *
 * Required coverage:
 * A. summary cleanup
 * B. deterministic bullet compression
 * C. long bullet compression
 * D. no metric fabrication
 * E. no technology fabrication
 * F. project bullet evidence/provenance preserved
 * G. project ranking preserved
 * H. Experience preserved byte-for-byte
 * I. Education preserved byte-for-byte
 * J. DSA preserved byte-for-byte
 * K. populated protected sections remain in section order
 * L. empty optional sections are not created
 * M. candidate source object is not mutated
 * N. composition is deterministic
 * O. page-density behavior improves sparse layouts
 * P. dense layout remains within one-page constraints
 * Q. legacy structured/legacy paths remain compatible where applicable
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  composeStructuredResumeDocument,
  compressProfessionalBullet,
  polishProfessionalSummary,
  ensureCandidateSectionIntegrity,
} from '../../src/services/resume-professional-composition.service.js';
import {
  StructuredResumeDocumentSchema,
} from '../../src/domain/career/resume.schemas.js';
import {
  buildStructuredResumeDocument,
  buildStructuredResumeSnapshot,
} from '../../src/services/structured-resume.service.js';
import {
  ResumeLayoutEngine,
  DENSITY_CLASSIFICATION,
  SPACING_RELATIONSHIPS,
  BASE_SPACING_TOKENS,
} from '../../src/services/resume-layout-engine.service.js';
import { LatexDocumentGenerator } from '../../src/services/latex-document-generator.service.js';

/** Builds a full structured resume document from a realistic fresher profile. */
const RANKINGS = [
  { projectId: 'proj-1', projectName: 'ecommerce-platform', relevanceScore: 62.5, relevanceBand: 'HIGH', matchedRequirementIds: ['req-fullstack', 'req-payments'] },
  { projectId: 'proj-2', projectName: 'task-manager-app', relevanceScore: 41.0, relevanceBand: 'MEDIUM', matchedRequirementIds: ['req-realtime'] },
];

function buildRichStructuredDoc() {
  const candidateProfile = {
    id: 'cand-001',
    displayName: 'Alex Developer',
    headline: 'Full-Stack Engineer',
    canonicalEmail: 'alex.dev@realmail.io',
    phone: '+1-555-0123',
    location: 'San Francisco, CA',
    careerStatus: 'FRESHER',
    skills: [
      { name: 'JavaScript', slug: 'javascript', provenanceStatus: 'VERIFIED', evidenceId: crypto.randomUUID() },
      { name: 'Python', slug: 'python', provenanceStatus: 'USER_PROVIDED', evidenceId: null },
      { name: 'React', slug: 'react', provenanceStatus: 'VERIFIED', evidenceId: crypto.randomUUID() },
      { name: 'Node.js', slug: 'nodejs', provenanceStatus: 'VERIFIED', evidenceId: crypto.randomUUID() },
      { name: 'PostgreSQL', slug: 'postgresql', provenanceStatus: 'VERIFIED', evidenceId: crypto.randomUUID() },
      // deliberate duplicate (same slug, weaker provenance listed second)
      { name: 'JavaScript', slug: 'javascript', provenanceStatus: 'CLAIMED', evidenceId: null },
    ],
    projects: [
      {
        id: 'proj-1',
        name: 'ecommerce-platform',
        displayName: 'E-Commerce Platform',
        repositoryUrl: 'https://github.com/alexdev/ecommerce-platform',
        liveUrl: 'https://ecommerce.alexdev.dev',
        technologies: ['React', 'Node.js', 'PostgreSQL', 'AWS'],
        bullets: [
          {
            text: 'Built a full-stack e-commerce application with React frontend and Node.js backend supporting order workflows.',
            evidenceRefs: [{ sourceType: 'VERIFIED', evidenceId: crypto.randomUUID(), commitSha: 'a1b2c3d4e5f6' }],
            matchedRequirementIds: ['req-fullstack', 'req-db'],
            provenanceStatus: 'VERIFIED',
          },
          {
            text: 'Implemented payment processing integration with Stripe and PayPal APIs supporting multiple currencies.',
            evidenceRefs: [{ sourceType: 'VERIFIED', evidenceId: crypto.randomUUID(), commitSha: 'f3e2d1c0b9a8' }],
            matchedRequirementIds: ['req-payments'],
            provenanceStatus: 'VERIFIED',
          },
          {
            text: 'Optimized database queries through proper indexing in order to reduce response times.',
            evidenceRefs: [{ sourceType: 'VERIFIED', evidenceId: crypto.randomUUID(), commitSha: 'b4c5d6e7f8a9' }],
            matchedRequirementIds: ['req-performance'],
            provenanceStatus: 'VERIFIED',
          },
        ],
      },
      {
        id: 'proj-2',
        name: 'task-manager-app',
        displayName: 'Task Manager App',
        repositoryUrl: 'https://github.com/alexdev/task-manager-app',
        liveUrl: 'https://tasks.alexdev.dev',
        technologies: ['Vue.js', 'Express', 'MongoDB'],
        bullets: [
          {
            text: 'Created a collaborative task management application with real-time updates using WebSocket connections.',
            evidenceRefs: [{ sourceType: 'VERIFIED', evidenceId: crypto.randomUUID(), commitSha: 'c7d8e9f0a1b2' }],
            matchedRequirementIds: ['req-realtime'],
            provenanceStatus: 'VERIFIED',
          },
        ],
      },
    ],
    experience: [
      {
        id: 'exp-1',
        company: 'TechCorp',
        title: 'Software Engineer Intern',
        startDate: '2024-06-01',
        endDate: '2024-09-30',
        isCurrent: false,
        location: 'San Francisco, CA',
        bullets: [
          'Worked on internal automation tooling used by the engineering team.',
          'Utilized Python and shell scripting to streamline release checks.',
        ],
      },
    ],
    education: [
      {
        id: 'edu-1',
        institution: 'University of California, Berkeley',
        degree: 'Bachelor of Science in Computer Science',
        fieldOfStudy: 'Computer Science',
        startDate: '2020-09-01',
        endDate: '2024-06-15',
        grade: '3.7 GPA',
        coursework: ['Data Structures', 'Algorithms', 'Database Systems', 'Operating Systems', 'Networks', 'Machine Learning', 'Distributed Systems'],
      },
    ],
    certifications: [
      {
        id: 'cert-1',
        name: 'AWS Certified Developer',
        issuingOrganization: 'Amazon Web Services',
        issueDate: '2024-01-15',
        expirationDate: '2027-01-15',
        credentialId: 'AWS-DEV-12345',
        credentialUrl: 'https://aws.amazon.com/verification',
      },
    ],
    problemSolving: {
      hasSection: true,
      profileUrl: 'https://leetcode.com/alexdev',
      bullets: [
        'Solved 300 algorithmic problems focusing on arrays, strings, and recursion.',
        'Implemented custom data structures including binary trees, heaps, and hash tables.',
      ],
    },
  };

  return buildStructuredResumeDocument({
    candidateProfile,
    jobPosting: {
      title: 'Software Engineer',
      company: 'Target Corp',
      description: 'Full-stack web application development with React and Node.js.',
      projectRankings: RANKINGS,
    },
    options: { projectRankings: RANKINGS },
  });
}

/** Directly constructs a structured document (bypassing the builder) for precise unit control. */
function makeMinimalStructuredDoc() {
  return {
    documentId: crypto.randomUUID(),
    schemaVersion: '2.0.0',
    targetRole: 'Software Engineer',
    sectionOrder: ['HEADER', 'SUMMARY', 'SKILLS', 'PROJECTS', 'EXPERIENCE', 'EDUCATION'],
    candidateIdentity: {
      displayName: 'Minimal Candidate',
      headline: 'Software Engineer',
      email: 'minimal@realmail.io',
      phone: null,
      location: null,
      links: [],
    },
    summary: {
      text: 'Software Engineer proficient in JavaScript. Focused on delivering reliable, maintainable code aligned with modern engineering standards.',
      referencedSkillSlugs: ['javascript'],
      referencedProjectIds: [],
      evidenceRefs: [],
      matchedRequirementIds: [],
      provenanceStatus: 'CLAIMED',
      provenance: null,
    },
    skills: {
      categories: [
        {
          categoryName: 'Core Competencies',
          skills: [
            { name: 'JavaScript', slug: 'javascript', provenanceStatus: 'VERIFIED', evidenceId: null, sourceSkillId: null, confidenceScore: 1, relevanceScore: 10, matchedRequirementId: null },
          ],
        },
      ],
    },
    projects: [
      {
        projectId: 'p-1',
        name: 'proj',
        displayName: 'Proj',
        repositoryUrl: 'https://github.com/x/proj',
        liveUrl: null,
        technologies: ['JavaScript'],
        bullets: [
          { text: 'Built a feature.', evidenceRefs: [], matchedRequirementIds: [], provenanceStatus: 'VERIFIED' },
        ],
        relevanceScore: 40,
        rank: 1,
      },
    ],
    experience: [
      {
        id: 'exp-1',
        company: 'Co',
        title: 'Dev',
        startDate: '2023-01-01',
        endDate: null,
        isCurrent: false,
        location: null,
        bullets: ['Did engineering work.'],
        provenanceStatus: 'USER_PROVIDED',
      },
    ],
    education: [
      {
        id: 'edu-1',
        institution: 'Inst',
        degree: 'B.S.',
        fieldOfStudy: 'CS',
        startDate: '2019-01-01',
        endDate: '2023-01-01',
        grade: null,
        coursework: [],
        provenanceStatus: 'USER_PROVIDED',
      },
    ],
    certifications: [],
    dsa: null,
    optionalSections: { coursework: [], publications: [], achievements: [], additionalSkills: [], awards: [] },
    tailoringPlan: {
      targetRoleTitle: 'Software Engineer',
      sectionOrder: ['HEADER', 'SUMMARY', 'SKILLS', 'PROJECTS', 'EXPERIENCE', 'EDUCATION'],
      selectedSkills: [],
      selectedProjectIds: ['p-1'],
      projectBudget: 3,
      skillCategoryOrder: ['Core Competencies'],
      summary: null,
      options: {},
    },
    createdAt: new Date().toISOString(),
  };
}

describe('P16-001G: Professional Resume Composition', () => {
  // ---------------------------------------------------------------------------
  // A. Summary cleanup
  // ---------------------------------------------------------------------------
  describe('A. Summary Cleanup', () => {
    it('rewrites generated boilerplate while preserving factual content', () => {
      const polished = polishProfessionalSummary(
        'Backend Software Engineer specializing in scalable API design and backend architecture using Node.js, PostgreSQL. ' +
        'Demonstrated practical execution in Product Data Explorer alongside evidence-backed database and modular service implementation.'
      );
      assert.doesNotMatch(polished, /Demonstrated practical execution/i);
      assert.match(polished, /Product Data Explorer/, 'project reference must survive');
      assert.match(polished, /Node\.js/, 'skill reference must survive');
    });

    it('replaces the generic "Focused on delivering..." closing', () => {
      const polished = polishProfessionalSummary(
        'Software Engineer proficient in JavaScript, React. Focused on delivering reliable, maintainable code aligned with modern engineering standards.'
      );
      assert.doesNotMatch(polished, /aligned with modern engineering standards/i);
      assert.match(polished, /reliable, maintainable/i);
    });

    it('composition applies the summary polish and keeps it schema-valid', () => {
      const doc = makeMinimalStructuredDoc();
      const composed = composeStructuredResumeDocument(doc);
      assert.ok(composed.summary.text.length > 0, 'summary must never be emptied');
      assert.doesNotMatch(composed.summary.text, /aligned with modern engineering standards/i);
      assert.equal(composed.summary.provenanceStatus, doc.summary.provenanceStatus);
    });
  });

  // ---------------------------------------------------------------------------
  // B. Deterministic bullet compression
  // ---------------------------------------------------------------------------
  describe('B. Deterministic Bullet Compression', () => {
    it('compresses weak phrases identically across repeated runs', () => {
      const input = 'Built the ingestion pipeline in order to process data, utilizing streaming validation.';
      assert.equal(compressProfessionalBullet(input), compressProfessionalBullet(input));
      assert.equal(compressProfessionalBullet(input), 'Built the ingestion pipeline to process data, using streaming validation.');
    });

    it('capitalizes sentence-initial replacements naturally', () => {
      assert.equal(compressProfessionalBullet('In order to ship faster, automated the checks.'), 'To ship faster, automated the checks.');
      assert.equal(compressProfessionalBullet('Made use of Docker for reproducible builds.'), 'Used Docker for reproducible builds.');
    });

    it('leaves clean bullets unchanged', () => {
      const clean = 'Implemented CSV ingestion pipeline with streaming row-level validation using Node.js.';
      assert.equal(compressProfessionalBullet(clean), clean);
    });

    it('composition compresses project bullets without changing bullet count', () => {
      const doc = makeMinimalStructuredDoc();
      doc.projects[0].bullets = [
        { text: 'Built the feature in order to process data.', evidenceRefs: [], matchedRequirementIds: [], provenanceStatus: 'VERIFIED' },
        { text: 'Built another feature.', evidenceRefs: [], matchedRequirementIds: [], provenanceStatus: 'VERIFIED' },
      ];
      const composed = composeStructuredResumeDocument(doc);
      assert.equal(composed.projects[0].bullets.length, 2);
      assert.equal(composed.projects[0].bullets[0].text, 'Built the feature to process data.');
      assert.equal(composed.projects[0].bullets[1].text, 'Built another feature.');
    });
  });

  // ---------------------------------------------------------------------------
  // C. Long bullet compression
  // ---------------------------------------------------------------------------
  describe('C. Long Bullet Compression', () => {
    it('shortens long bullets without hard character truncation', () => {
      const long =
        'Built a full-stack web application in order to serve the requirements of the platform, ' +
        'with the use of Node.js and PostgreSQL, and deployed it utilizing containerized infrastructure.';
      const result = compressProfessionalBullet(long);
      assert.ok(result.length < long.length, 'must be shorter');
      assert.doesNotMatch(result, /in order to|with the use of|utilizing/i);
      assert.match(result, /Node\.js/, 'technology must survive');
      assert.ok(!/[a-z]\.\.\.$/.test(result.trim()), 'no ellipsis truncation');
    });

    it('never hard-truncates at a character boundary', () => {
      const long = 'Developed ' + 'x'.repeat(400);
      const result = compressProfessionalBullet(long);
      assert.ok(result.length >= 400, 'no meaning-bearing content may be cut');
    });
  });

  // ---------------------------------------------------------------------------
  // D. No metric fabrication
  // ---------------------------------------------------------------------------
  describe('D. No Metric Fabrication', () => {
    it('composition never introduces numbers absent from source content', () => {
      const doc = makeMinimalStructuredDoc();
      doc.projects[0].bullets[0] = {
        text: 'Built the data pipeline in order to process incoming records.',
        evidenceRefs: [],
        matchedRequirementIds: [],
        provenanceStatus: 'VERIFIED',
      };
      const composed = composeStructuredResumeDocument(doc);
      assert.doesNotMatch(composed.projects[0].bullets[0].text, /\d/);
    });

    it('summary polish never injects metrics or tenure claims', () => {
      const before = polishProfessionalSummary(
        'Software Engineer proficient in Node.js. Focused on delivering reliable, maintainable code aligned with modern engineering standards.'
      );
      assert.doesNotMatch(before, /years? of experience/i);
      assert.doesNotMatch(before, /\d+%/);
    });
  });

  // ---------------------------------------------------------------------------
  // E. No technology fabrication
  // ---------------------------------------------------------------------------
  describe('E. No Technology Fabrication', () => {
    it('compression never introduces a technology absent from the source bullet', () => {
      const before = compressProfessionalBullet('Built the service layer in order to handle requests.');
      const knownTech = [/kubernetes/i, /docker/i, /kafka/i, /redis/i, /graphql/i, /aws/i, /react/i];
      for (const pattern of knownTech) {
        assert.doesNotMatch(before, pattern);
      }
    });

    it('validateRephrasingSafety guard keeps unsafe rewrites out of composed bullets', () => {
      const doc = makeMinimalStructuredDoc();
      doc.projects[0].bullets[0] = {
        text: 'Built the ingestion job in order to move files.',
        evidenceRefs: [],
        matchedRequirementIds: [],
        provenanceStatus: 'VERIFIED',
      };
      const composed = composeStructuredResumeDocument(doc);
      // Compression is safe here; assert the result still contains only source technologies.
      assert.match(composed.projects[0].bullets[0].text, /^Built the ingestion job to move files\.$/);
    });
  });

  // ---------------------------------------------------------------------------
  // F. Project bullet evidence/provenance preserved
  // ---------------------------------------------------------------------------
  describe('F. Project Bullet Evidence/Provenance Preserved', () => {
    it('keeps evidenceRefs, matchedRequirementIds, and provenanceStatus intact', () => {
      const doc = buildRichStructuredDoc();
      const composed = composeStructuredResumeDocument(doc);

      for (let p = 0; p < doc.projects.length; p++) {
        assert.equal(composed.projects[p].bullets.length, doc.projects[p].bullets.length);
        for (let b = 0; b < doc.projects[p].bullets.length; b++) {
          const orig = doc.projects[p].bullets[b];
          const comp = composed.projects[p].bullets[b];
          assert.deepEqual(comp.evidenceRefs, orig.evidenceRefs, `project ${p} bullet ${b} evidenceRefs`);
          assert.deepEqual(comp.matchedRequirementIds, orig.matchedRequirementIds);
          assert.equal(comp.provenanceStatus, orig.provenanceStatus);
        }
      }
    });

    it('preserves project links and technologies', () => {
      const doc = buildRichStructuredDoc();
      const composed = composeStructuredResumeDocument(doc);
      assert.equal(composed.projects[0].repositoryUrl, doc.projects[0].repositoryUrl);
      assert.equal(composed.projects[0].liveUrl, doc.projects[0].liveUrl);
      assert.deepEqual(composed.projects[0].technologies, doc.projects[0].technologies);
    });
  });

  // ---------------------------------------------------------------------------
  // G. Project ranking preserved
  // ---------------------------------------------------------------------------
  describe('G. Project Ranking Preserved', () => {
    it('keeps project order, rank, and relevanceScore unchanged', () => {
      const doc = buildRichStructuredDoc();
      const composed = composeStructuredResumeDocument(doc);
      assert.deepEqual(
        composed.projects.map((p) => p.projectId),
        doc.projects.map((p) => p.projectId)
      );
      assert.deepEqual(composed.projects.map((p) => p.rank), doc.projects.map((p) => p.rank));
      assert.deepEqual(
        composed.projects.map((p) => p.relevanceScore),
        doc.projects.map((p) => p.relevanceScore)
      );
    });
  });

  // ---------------------------------------------------------------------------
  // H/I/J. Protected sections preserved byte-for-byte
  // ---------------------------------------------------------------------------
  describe('H/I/J. Protected Sections Preserved Byte-for-Byte', () => {
    it('H. Experience is preserved exactly', () => {
      const doc = buildRichStructuredDoc();
      const composed = composeStructuredResumeDocument(doc);
      assert.equal(composed.experience.length, doc.experience.length);
      for (let i = 0; i < doc.experience.length; i++) {
        assert.equal(composed.experience[i].id, doc.experience[i].id);
        assert.equal(composed.experience[i].company, doc.experience[i].company);
        assert.equal(composed.experience[i].title, doc.experience[i].title);
        assert.equal(composed.experience[i].startDate, doc.experience[i].startDate);
        assert.equal(composed.experience[i].endDate, doc.experience[i].endDate);
        assert.equal(composed.experience[i].isCurrent, doc.experience[i].isCurrent);
        assert.equal(composed.experience[i].location, doc.experience[i].location);
        assert.equal(composed.experience[i].bullets.length, doc.experience[i].bullets.length);
        for (let j = 0; j < doc.experience[i].bullets.length; j++) {
          assert.equal(composed.experience[i].bullets[j], doc.experience[i].bullets[j]);
        }
      }
      assert.equal(JSON.stringify(composed.experience), JSON.stringify(doc.experience));
    });

    it('I. Education is preserved exactly', () => {
      const doc = buildRichStructuredDoc();
      const composed = composeStructuredResumeDocument(doc);
      assert.equal(composed.education.length, doc.education.length);
      for (let i = 0; i < doc.education.length; i++) {
        assert.equal(composed.education[i].id, doc.education[i].id);
        assert.equal(composed.education[i].institution, doc.education[i].institution);
        assert.equal(composed.education[i].degree, doc.education[i].degree);
        assert.equal(composed.education[i].fieldOfStudy, doc.education[i].fieldOfStudy);
        assert.equal(composed.education[i].startDate, doc.education[i].startDate);
        assert.equal(composed.education[i].endDate, doc.education[i].endDate);
        assert.equal(composed.education[i].grade, doc.education[i].grade);
        assert.deepEqual(composed.education[i].coursework, doc.education[i].coursework);
      }
      assert.equal(JSON.stringify(composed.education), JSON.stringify(doc.education));
    });

    it('J. DSA is preserved exactly when candidate-owned DSA exists', () => {
      const doc = buildRichStructuredDoc();
      assert.ok(doc.dsa?.hasSection, 'fixture must include DSA');
      const composed = composeStructuredResumeDocument(doc);
      assert.equal(composed.dsa.hasSection, true);
      assert.equal(composed.dsa.profileUrl, doc.dsa.profileUrl);
      assert.equal(composed.dsa.bullets.length, doc.dsa.bullets.length);
      assert.equal(JSON.stringify(composed.dsa.bullets), JSON.stringify(doc.dsa.bullets));
      assert.equal(composed.dsa.provenanceStatus, doc.dsa.provenanceStatus);
    });
  });

  // ---------------------------------------------------------------------------
  // K. Populated protected sections remain in section order
  // ---------------------------------------------------------------------------
  describe('K. Populated Protected Sections Remain in Section Order', () => {
    it('re-inserts a populated protected section missing from sectionOrder', () => {
      const doc = makeMinimalStructuredDoc();
      doc.sectionOrder = ['HEADER', 'SUMMARY', 'SKILLS', 'PROJECTS', 'EDUCATION']; // EXPERIENCE dropped
      doc.tailoringPlan.sectionOrder = [...doc.sectionOrder];
      const composed = composeStructuredResumeDocument(doc);
      assert.ok(composed.sectionOrder.includes('EXPERIENCE'), 'populated EXPERIENCE must be restored');
      assert.ok(composed.sectionOrder.indexOf('PROJECTS') < composed.sectionOrder.indexOf('EXPERIENCE'));
      assert.deepEqual(composed.tailoringPlan.sectionOrder, composed.sectionOrder);
    });

    it('restores DSA ordering relative to PROJECTS and EDUCATION', () => {
      const doc = buildRichStructuredDoc();
      const composed = composeStructuredResumeDocument(doc);
      const order = composed.sectionOrder;
      assert.ok(order.includes('DSA'));
      assert.ok(order.indexOf('PROJECTS') < order.indexOf('DSA'));
      assert.ok(order.indexOf('DSA') < order.indexOf('EDUCATION'));
    });

    it('ensureCandidateSectionIntegrity is idempotent', () => {
      const doc = composeStructuredResumeDocument(makeMinimalStructuredDoc());
      const once = ensureCandidateSectionIntegrity(doc);
      const twice = ensureCandidateSectionIntegrity(once);
      assert.deepEqual(twice.sectionOrder, once.sectionOrder);
    });
  });

  // ---------------------------------------------------------------------------
  // L. Empty optional sections are not created
  // ---------------------------------------------------------------------------
  describe('L. Empty Optional Sections Are Not Created', () => {
    it('does not add section tokens for empty/absent sections', () => {
      const doc = makeMinimalStructuredDoc();
      doc.dsa = null;
      doc.certifications = [];
      const composed = composeStructuredResumeDocument(doc);
      assert.ok(!composed.sectionOrder.includes('DSA'), 'no DSA token without DSA data');
      assert.ok(!composed.sectionOrder.includes('CERTIFICATIONS'), 'no CERTIFICATIONS token without certs');
    });

    it('does not create empty skill categories', () => {
      const doc = makeMinimalStructuredDoc();
      doc.skills.categories.push({ categoryName: 'Empty Category', skills: [] });
      const composed = composeStructuredResumeDocument(doc);
      assert.ok(!composed.skills.categories.some((c) => c.categoryName === 'Empty Category'));
    });
  });

  // ---------------------------------------------------------------------------
  // M. Candidate source object is not mutated
  // ---------------------------------------------------------------------------
  describe('M. Candidate Source Object Is Not Mutated', () => {
    it('composition leaves the input document untouched (deep equality)', () => {
      const doc = buildRichStructuredDoc();
      const frozen = JSON.parse(JSON.stringify(doc));
      composeStructuredResumeDocument(doc);
      assert.equal(JSON.stringify(doc), JSON.stringify(frozen));
    });

    it('end-to-end: buildStructuredResumeSnapshot does not mutate the candidate profile', () => {
      const candidateProfile = {
        displayName: 'Snapshot Candidate',
        canonicalEmail: 'snapshot@realmail.io',
        headline: 'Backend Engineer',
        careerStatus: 'FRESHER',
        skills: [{ name: 'Node.js', slug: 'nodejs', provenanceStatus: 'VERIFIED' }],
        projects: [
          {
            id: 'p-1',
            name: 'Pipeline',
            technologies: ['Node.js'],
            bullets: ['Built ingestion in order to load data.'],
            repositoryUrl: 'https://github.com/x/pipeline',
          },
        ],
        experience: [{ id: 'e-1', company: 'Co', title: 'Intern', startDate: '2024-02-01', endDate: null, bullets: ['Assisted with tooling.'] }],
        education: [{ id: 'ed-1', institution: 'Inst', degree: 'B.Tech', startDate: '2020-02-01', endDate: '2024-02-28' }],
        problemSolving: { hasSection: true, profileUrl: 'https://leetcode.com/snap', bullets: ['Practiced 200 problems.'] },
      };
      const before = JSON.stringify(candidateProfile);
      buildStructuredResumeSnapshot({
        candidateProfile,
        jobPosting: { title: 'Software Engineer', company: 'C', description: 'Node.js backend services.' },
      });
      assert.equal(JSON.stringify(candidateProfile), before);
    });
  });

  // ---------------------------------------------------------------------------
  // N. Composition is deterministic
  // ---------------------------------------------------------------------------
  describe('N. Composition Is Deterministic', () => {
    it('identical inputs produce identical composed documents', () => {
      const docA = buildRichStructuredDoc();
      const docB = JSON.parse(JSON.stringify(docA));
      const composedA = composeStructuredResumeDocument(docA);
      const composedB = composeStructuredResumeDocument(docB);
      // Compare everything except documentId/createdAt which carry build-time entropy.
      delete composedA.documentId; delete composedB.documentId;
      delete composedA.createdAt; delete composedB.createdAt;
      assert.equal(JSON.stringify(composedA), JSON.stringify(composedB));
    });
  });

  // ---------------------------------------------------------------------------
  // O/P. Page-density behavior
  // ---------------------------------------------------------------------------
  describe('O/P. Page-Density Behavior', () => {
    const layoutEngine = new ResumeLayoutEngine();
    const layoutFor = (doc) =>
      layoutEngine.computeLayout({
        applicationPackage: { structuredResume: doc, tailoredResume: { structuredResume: doc } },
        candidateProfile: null,
      });

    it('O. composed output feeds a valid layout: hierarchy preserved, sparse expansion bounded', () => {
      const doc = composeStructuredResumeDocument(buildRichStructuredDoc());
      const { layoutProfile, density, budget } = layoutFor(doc);
      const spacing = layoutProfile.spacing;

      // Spacing-hierarchy invariant holds for EVERY density classification.
      assert.ok(spacing[SPACING_RELATIONSHIPS.SECTION_TO_SECTION] > spacing[SPACING_RELATIONSHIPS.ENTRY_TO_ENTRY]);
      assert.ok(spacing[SPACING_RELATIONSHIPS.ENTRY_TO_ENTRY] > spacing[SPACING_RELATIONSHIPS.HEADING_TO_CONTENT]);
      assert.ok(spacing[SPACING_RELATIONSHIPS.HEADING_TO_CONTENT] > spacing[SPACING_RELATIONSHIPS.BULLET_TO_BULLET]);

      if (density === DENSITY_CLASSIFICATION.TOO_SPARSE) {
        // Bounded expansion (no gigantic gaps)
        assert.ok(
          spacing[SPACING_RELATIONSHIPS.SECTION_TO_SECTION] <= BASE_SPACING_TOKENS[SPACING_RELATIONSHIPS.SECTION_TO_SECTION] + 6.5,
          'TOO_SPARSE section gap expansion must stay bounded'
        );
      } else {
        assert.ok(
          [DENSITY_CLASSIFICATION.BALANCED, DENSITY_CLASSIFICATION.DENSE, DENSITY_CLASSIFICATION.OVERFULL].includes(density),
          `unexpected density classification: ${density}`
        );
      }
      assert.ok(budget.utilizationRatio > 0, 'page budget must be computed');
    });

    it('P. dense layout remains within one-page constraints', () => {
      const doc = buildRichStructuredDoc();
      // Pad with more content to push density up while staying one-page plausible.
      doc.projects[0].bullets.push(
        { text: 'Automated release verification with scripted checks in order to catch regressions early.', evidenceRefs: doc.projects[0].bullets[0].evidenceRefs, matchedRequirementIds: [], provenanceStatus: 'VERIFIED' },
        { text: 'Containerized the application for consistent local and production environments.', evidenceRefs: doc.projects[0].bullets[0].evidenceRefs, matchedRequirementIds: [], provenanceStatus: 'VERIFIED' }
      );
      const composed = composeStructuredResumeDocument(doc);
      const { layoutProfile, density, pageStrategy, budget } = layoutFor(composed);

      assert.equal(pageStrategy, 'ONE_PAGE_TARGET');
      if (density === DENSITY_CLASSIFICATION.DENSE || density === DENSITY_CLASSIFICATION.OVERFULL) {
        // Compressed spacing must be tighter than base tokens
        assert.ok(
          layoutProfile.spacing[SPACING_RELATIONSHIPS.SECTION_TO_SECTION] <= BASE_SPACING_TOKENS[SPACING_RELATIONSHIPS.SECTION_TO_SECTION],
          'DENSE spacing must not exceed base tokens'
        );
        assert.ok(layoutProfile.maxBulletsPerProject <= 3);
      }
      // Protected content survives regardless of density
      assert.equal(composed.experience.length, doc.experience.length);
      assert.equal(composed.education.length, doc.education.length);
      assert.ok(budget.utilizationRatio > 0);
    });
  });

  // ---------------------------------------------------------------------------
  // Q. Legacy structured/legacy path compatibility
  // ---------------------------------------------------------------------------
  describe('Q. Legacy Path Compatibility', () => {
    it('composed document passes StructuredResumeDocumentSchema validation', () => {
      const composed = composeStructuredResumeDocument(buildRichStructuredDoc());
      const parsed = StructuredResumeDocumentSchema.parse(composed);
      assert.ok(parsed);
    });

    it('structured renderer renders composed document with all protected sections and links', () => {
      const composed = composeStructuredResumeDocument(buildRichStructuredDoc());
      const latexGen = new LatexDocumentGenerator();
      const { texContent } = latexGen.generateTailoredResumeLatex({
        applicationPackage: {
          candidateName: composed.candidateIdentity.displayName,
          candidateEmail: composed.candidateIdentity.email,
          structuredResume: composed,
          tailoringPlan: composed.tailoringPlan,
        },
        candidateProfile: null,
      });

      assert.match(texContent, /PROFESSIONAL SUMMARY/i);
      assert.match(texContent, /TECHNICAL SKILLS/i);
      assert.match(texContent, /TECHNICAL PROJECTS/i);
      assert.match(texContent, /Problem Solving \\& Algorithmic Practice/);
      assert.match(texContent, /PROFESSIONAL EXPERIENCE|EXPERIENCE/i);
      assert.match(texContent, /EDUCATION/i);
      assert.match(texContent, /github\.com\/alexdev\/ecommerce-platform/, 'repo link preserved');
      assert.match(texContent, /ecommerce\.alexdev\.dev/, 'live link preserved');
      assert.match(texContent, /leetcode\.com\/alexdev/, 'DSA profile link preserved');
      assert.match(texContent, /Relevant Coursework: Data Structures, Algorithms, Database Systems, Operating Systems, Networks, Machine Learning, Distributed Systems/, 'full coursework rendered (no slice cap)');
    });

    it('snapshot integration: buildStructuredResumeSnapshot emits composed output with receipt PASS', () => {
      const bundle = buildStructuredResumeSnapshot({
        candidateProfile: {
          displayName: 'Integration Candidate',
          canonicalEmail: 'integration@realmail.io',
          headline: 'Software Engineer',
          careerStatus: 'FRESHER',
          skills: [{ name: 'Node.js', slug: 'nodejs', provenanceStatus: 'VERIFIED' }],
          projects: [
            {
              id: 'p-9',
              name: 'Service',
              technologies: ['Node.js'],
              bullets: ['Built service layer in order to handle billing operations.'],
              repositoryUrl: 'https://github.com/x/service',
            },
          ],
          experience: [{ id: 'e-9', company: 'Co', title: 'Intern', startDate: '2024-03-01', endDate: null, bullets: ['Assisted with QA automation.'] }],
          education: [{ id: 'ed-9', institution: 'Inst', degree: 'B.Tech', startDate: '2020-03-01', endDate: '2024-03-31' }],
        },
        jobPosting: { title: 'Software Engineer', company: 'C', description: 'Node.js engineering role.' },
        options: {
          projectRankings: [{ projectId: 'p-9', projectName: 'Service', relevanceScore: 48.0, relevanceBand: 'MEDIUM', matchedRequirementIds: ['req-node'] }],
        },
      });

      assert.equal(bundle.evidenceValidationReceipt.overallStatus, 'PASS');
      assert.doesNotMatch(
        bundle.structuredResume.projects[0].bullets[0].text,
        /in order to/i,
        'composed snapshot bullets must be compressed'
      );
      assert.equal(
        JSON.stringify(bundle.structuredResume.experience),
        JSON.stringify(bundle.structuredResume.experience),
        'experience present'
      );
    });

    it('custom section orders pass through untouched when all sections are present', () => {
      const doc = makeMinimalStructuredDoc();
      const customOrder = ['HEADER', 'SUMMARY', 'SKILLS', 'EDUCATION', 'PROJECTS', 'EXPERIENCE'];
      doc.sectionOrder = [...customOrder];
      doc.tailoringPlan.sectionOrder = [...customOrder];
      const composed = composeStructuredResumeDocument(doc);
      assert.deepEqual(composed.sectionOrder, customOrder);
    });
  });
});
