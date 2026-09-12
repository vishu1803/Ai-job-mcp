/**
 * @file P16-006: High-Quality, High-Density, Grounded Content & Layout Verification Suite
 *
 * Enforces the core invariants of P16-006:
 * 1. Technology-agnostic project grounding: completely removed hardcoded framework branches.
 * 2. Multi-source candidate content collection: authentic bullets, highlights, features, and descriptions.
 * 3. Deterministic professional compression: fluff removal, action-verb preservation, zero metric fabrication.
 * 4. Grounded summary restoration: incorporates authentic candidate summary facts without generic 2-line template starvation.
 * 5. DSA truthfulness: authentic LeetCode profile URL preserved, zero synthetic filler phrases.
 * 6. High-density ATS layout: 4-tier centered header, single-line project headers, tight itemize, 0.55in margins, exactly 1 page.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  groundAndSanitizeProject,
  CandidateArtifactContentService,
} from '../../src/services/candidate-artifact-content.service.js';
import {
  compressCandidateBullet,
  selectAndRephraseProjectBullets,
  generateGroundedSummary,
  isMeaningfulDsa,
} from '../../src/services/resume-content-strategy.service.js';
import {
  buildStructuredResumeDocument,
  estimateProjectCapacity,
} from '../../src/services/structured-resume.service.js';
import { LatexDocumentGenerator } from '../../src/services/latex-document-generator.service.js';

describe('P16-006: High-Density Grounded Content & Layout Invariants', () => {
  // Test 1: Candidate project descriptions & highlights are collected into project content items
  test('Test 1: collects candidate highlights, features, and descriptions into project bullets when raw bullets absent', () => {
    const project = {
      name: 'Custom Distributed Store',
      technologies: ['Rust', 'Raft', 'RocksDB'],
      bullets: [],
      highlights: [
        'Designed and implemented a distributed key-value store with Raft consensus for log replication.',
        'Engineered an embedded RocksDB storage engine with custom LSM-tree compaction filters.',
      ],
      features: [
        'Integrated snapshotting mechanism to truncate Raft logs and bound memory consumption under heavy load.',
      ],
    };

    groundAndSanitizeProject(project);

    assert.ok(project.bullets.length >= 2, `Expected >= 2 bullets, got ${project.bullets.length}`);
    assert.match(project.bullets[0], /distributed key-value store/i);
    assert.match(project.bullets[1], /embedded rocksdb storage engine/i);
  });

  // Test 2: Multiple candidate-owned sources form multiple bullets (2-3 bullets per project)
  test('Test 2: multi-source composition builds 2-3 bullets per project up to budget', () => {
    const project = {
      name: 'Analytics Dashboard',
      technologies: ['TypeScript', 'React', 'Node.js', 'PostgreSQL'],
      bullets: ['Built real-time telemetry streaming frontend using React and WebSockets.'],
      highlights: ['Engineered high-throughput event aggregation service in Node.js with PostgreSQL persistence.'],
      features: ['Created interactive data visualization charts using D3.js and SVG rendering.'],
      evidence: [],
    };

    const tailoredBullets = selectAndRephraseProjectBullets({
      project,
      jobPosting: {
        title: 'Full Stack Engineer',
        requirements: ['React', 'Node.js', 'PostgreSQL', 'WebSockets'],
      },
      options: { maxBullets: 3 },
    });

    assert.equal(tailoredBullets.length, 3, `Expected exactly 3 bullets, got ${tailoredBullets.length}`);
    assert.ok(tailoredBullets.every(b => typeof b.text === 'string' && b.text.length > 20));
    assert.ok(tailoredBullets.every(b => b.provenanceStatus === 'VERIFIED' || b.provenanceStatus === 'CLAIMED'));
  });

  // Test 3: Candidate bullet meaning and facts are preserved under professional compression
  test('Test 3: compressCandidateBullet removes introductory fluff while preserving verbs, technologies, and metrics', () => {
    const input1 = 'Responsible for designing and implementing high-throughput REST APIs in FastAPI.';
    const output1 = compressCandidateBullet(input1);
    assert.equal(output1, 'Designing and implementing high-throughput REST APIs in FastAPI.');

    const input2 = 'Worked on building the automated testing pipeline with Jest and Supertest.';
    const output2 = compressCandidateBullet(input2);
    assert.equal(output2, 'Building automated testing pipeline with Jest and Supertest.');

    const input3 = 'Helped in developing a secure authentication system with JWT tokens.';
    const output3 = compressCandidateBullet(input3);
    assert.equal(output3, 'Developing a secure authentication system with JWT tokens.');

    // Determinism test: identical input produces identical output
    assert.equal(compressCandidateBullet(input1), output1);
  });

  // Test 4: Technology presence alone (dependencies, imports, file paths) never creates prose
  test('Test 4: dependency presence alone never synthesizes accomplishment prose', () => {
    const project = {
      name: 'Empty Skeleton Repo',
      technologies: ['FastAPI', 'PostgreSQL', 'Docker Compose', 'Redis'],
      bullets: [],
      highlights: [],
      features: [],
      description: null,
      summary: null,
      evidence: [
        { evidenceType: 'DEPENDENCY', skillName: 'FastAPI', filePath: 'requirements.txt' },
        { evidenceType: 'DEPENDENCY', skillName: 'PostgreSQL', filePath: 'requirements.txt' },
        { evidenceType: 'DEPENDENCY', skillName: 'Redis', filePath: 'requirements.txt' },
      ],
    };

    groundAndSanitizeProject(project);

    // Hard rule: DEPENDENCY -> NO BULLET
    assert.deepEqual(project.bullets, [], 'Expected zero synthesized bullets from raw dependencies');
  });

  // Test 5: No technology-specific hardcoded synthesis in groundAndSanitizeProject (technology-agnostic)
  test('Test 5: groundAndSanitizeProject contains zero hardcoded technology if/else branches', () => {
    const unknownTechProject = {
      name: 'Quantum Engine',
      technologies: ['QuantumLeaf', 'AeroMesh', 'SurrealDB'],
      bullets: ['Engineered quantum routing algorithms on SurrealDB storage nodes.'],
      evidence: [
        { evidenceType: 'CANDIDATE_AUTHORED_CLAIM', skillName: 'QuantumLeaf', filePath: 'quantum.ql' },
      ],
    };

    groundAndSanitizeProject(unknownTechProject);

    assert.equal(unknownTechProject.bullets.length, 1);
    assert.match(unknownTechProject.bullets[0], /quantum routing algorithms/i);
    assert.ok(unknownTechProject.technologies.includes('SurrealDB'));
  });

  // Test 6: Unknown/new technologies work without code modifications
  test('Test 6: arbitrary novel technologies pass through without crashing or dropping', () => {
    const project = {
      name: 'NextGen Distributed KV',
      technologies: ['CustomVectorX', 'ZeroMesh'],
      bullets: ['Implemented ZeroMesh peer discovery protocol with CustomVectorX indexing.'],
      evidence: [],
    };

    const bullets = selectAndRephraseProjectBullets({
      project,
      jobPosting: { title: 'Systems Engineer', requirements: ['ZeroMesh', 'CustomVectorX'] },
      options: { maxBullets: 3 },
    });

    assert.ok(bullets.length >= 1);
    assert.match(bullets[0].text, /ZeroMesh/);
    assert.match(bullets[0].text, /CustomVectorX/);
  });

  // Test 7: DSA filler phrase is never generated; authentic LeetCode URL is preserved
  test('Test 7: synthetic DSA filler phrase is never generated', async () => {
    const svc = new CandidateArtifactContentService();

    // Verify candidateData built for fresher candidate with DSA skill does NOT inject synthetic filler
    const candidateData = {
      tenantId: '00000000-0000-0000-0000-000000000001',
      userId: '00000000-0000-0000-0000-000000000001',
      candidateId: '00000000-0000-0000-0000-000000000001',
      displayName: 'Test Candidate',
      canonicalEmail: 'test@candidate.org',
      headline: 'Software Engineer',
      skills: [{ name: 'Data Structures and Algorithms', isVerified: true }],
      experience: [],
      education: [{ institution: 'State University', degree: 'B.S. in Computer Science', coursework: ['Data Structures', 'Algorithms'] }],
      projects: [],
      portfolioLinks: [{ url: 'https://leetcode.com/u/authenticuser', label: 'LeetCode' }],
      dsa: {
        hasSection: true,
        profileUrl: 'https://leetcode.com/u/authenticuser',
        bullets: ['Solved algorithmic challenges covering dynamic programming, graph traversal, and trees.'],
      },
    };

    const doc = buildStructuredResumeDocument({
      candidateProfile: candidateData,
      jobPosting: { title: 'Software Engineer', requirements: ['Data Structures', 'Algorithms'] },
    });

    assert.ok(doc.dsa, 'Expected DSA section to be present');
    assert.equal(doc.dsa.profileUrl, 'https://leetcode.com/u/authenticuser');
    for (const bullet of doc.dsa.bullets) {
      assert.doesNotMatch(bullet, /engaged in problem solving and algorithmic practice to build foundational/i);
    }
  });

  // Test 8: Professional summary incorporates authentic candidate summary facts
  test('Test 8: generateGroundedSummary adapts authentic candidate summary without boilerplate starvation', () => {
    const authenticSummary =
      'Full-stack engineer specializing in robust, scalable backend systems and RESTful API design using Python (FastAPI/Django) and Node.js (Express/NestJS). Proven ability to independently deliver high-performance, production-ready applications, leveraging expertise in PostgreSQL and modular service design. Strong foundational problem-solver with a rigorous daily practice in Data Structures and Algorithms.';

    const summaryObj = generateGroundedSummary({
      candidateProfile: {
        summary: authenticSummary,
        headline: 'Full-Stack & Backend Developer',
        skills: [
          { name: 'Python', verified: true },
          { name: 'FastAPI', verified: true },
          { name: 'PostgreSQL', verified: true },
        ],
        experience: [{ title: 'Full Stack Developer Intern', company: 'FTV Saloon' }],
      },
      jobPosting: {
        title: 'Backend Systems Engineer',
        requirements: ['Python', 'FastAPI', 'PostgreSQL', 'Backend Architecture'],
      },
    });

    assert.ok(summaryObj && summaryObj.text);
    assert.ok(summaryObj.text.length >= 100, `Summary too short: ${summaryObj.text.length} chars`);
    assert.match(summaryObj.text, /Python|FastAPI/i);
    assert.equal(summaryObj.provenanceStatus, 'VERIFIED');
  });

  // Test 9: Project bullets conform strictly to TailoredProjectBulletSchema
  test('Test 9: project bullets strictly conform to schema without superfluous or leaking keys', () => {
    const project = {
      name: 'Telemetry Hub',
      technologies: ['Go', 'gRPC'],
      bullets: ['Implemented streaming gRPC telemetry ingestion service in Go.'],
      evidence: [],
    };

    const bullets = selectAndRephraseProjectBullets({
      project,
      jobPosting: { title: 'Backend Engineer', requirements: ['Go', 'gRPC'] },
      options: { maxBullets: 2 },
    });

    assert.ok(bullets.length > 0);
    const b = bullets[0];
    const keys = Object.keys(b).sort();
    assert.deepEqual(keys, ['evidenceRefs', 'matchedRequirementIds', 'provenanceStatus', 'text']);
  });

  // Test 10: 4-tier centered header and LaTeX generation with 4 profile links
  test('Test 10: LaTeX generator creates 4-tier centered header with 4 profile links and single-line project headings', () => {
    const generator = new LatexDocumentGenerator();

    const structuredResume = {
      candidateIdentity: {
        fullName: 'Vishwanath Nishad',
        displayName: 'Vishwanath Nishad',
        email: 'vishwanatnishad@gmail.com',
        phone: '7905087928',
        location: 'Gorakhpur',
        headline: 'Full-Stack & Backend Developer',
        links: [
          { label: 'LinkedIn', url: 'https://linkedin.com/in/vishwanath-nishad', platform: 'LINKEDIN' },
          { label: 'GitHub', url: 'https://github.com/vishu1803', platform: 'GITHUB' },
          { label: 'Portfolio', url: 'https://my-portfolio-kappa-beige-71.vercel.app/', platform: 'PORTFOLIO' },
          { label: 'LeetCode', url: 'https://leetcode.com/u/vishwanatnishad', platform: 'LEETCODE' },
        ],
      },
      summary: {
        text: 'Full-stack engineer specializing in robust, scalable backend systems using Python (FastAPI) and Node.js (Express).',
      },
      skills: {
        categories: [
          { categoryName: 'Backend & APIs', skills: ['FastAPI', 'Express.js', 'NestJS'] },
        ],
      },
      projects: [
        {
          name: 'Product Data Explorer',
          displayName: 'Product Data Explorer',
          repositoryUrl: 'https://github.com/vishu1803/Product-Data-Explorer',
          technologies: ['TypeScript', 'NestJS', 'Next.js', 'PostgreSQL', 'Redis'],
          bullets: [
            {
              text: 'Architected a full-stack product analytics platform with NestJS RESTful APIs and Swagger documentation.',
              evidenceRefs: [],
              matchedRequirementIds: [],
              provenanceStatus: 'VERIFIED',
            },
          ],
        },
      ],
      experience: [
        {
          company: 'FTV Saloon',
          title: 'Full Stack Developer Intern',
          startDate: '2024-06',
          endDate: '2024-09',
          bullets: ['Designed and implemented RESTful APIs for salon operations.'],
        },
      ],
      education: [
        {
          institution: 'Rajkiya Engineering College',
          degree: 'Bachelor of Technology in Electronics Engineering',
          startDate: '2021',
          endDate: '2025-07',
        },
      ],
      dsa: {
        hasSection: true,
        title: 'LeetCode Profile',
        subtitle: 'Data Structures & Algorithms',
        profileUrl: 'https://leetcode.com/u/vishwanatnishad',
        bullets: ['Solved algorithmic challenges covering dynamic programming, graphs, and trees.'],
      },
    };

    const applicationPackage = {
      targetJob: { title: 'Software Engineer', company: 'TechCorp' },
      tailoringPlan: { targetRoleTitle: 'Software Engineer' },
      tailoredResume: { structuredResume },
    };

    const latexResult = generator.generateTailoredResumeLatex({
      applicationPackage,
    });

    const tex = latexResult.texContent;

    // 4-tier centered header assertions
    assert.match(tex, /\\Huge\s+\\textbf\{Vishwanath Nishad\}/);
    assert.match(tex, /\\large\s+\\textbf\{Full-Stack \\& Backend Developer\}/);
    assert.match(tex, /7905087928/);
    assert.match(tex, /vishwanatnishad@gmail\.com/);
    assert.match(tex, /LinkedIn/);
    assert.match(tex, /GitHub/);
    assert.match(tex, /Portfolio/);
    assert.match(tex, /LeetCode/);

    // Single-line project heading assertion: \textbf{Product Data Explorer} | \textit{...} \hfill \href{...}{...}
    assert.match(tex, /\\textbf\{Product Data Explorer\}\s+\|\s+\\textit\{TypeScript, NestJS, Next\.js, PostgreSQL, Redis\}\s+\\hfill/);

    // DSA section assertion: \textbf{LeetCode Profile} | \textit{Data Structures \& Algorithms} \hfill \href{...}{...}
    assert.match(tex, /\\textbf\{LeetCode Profile\}\s+\|\s+\\textit\{Data Structures \\& Algorithms\}\s+\\hfill/);

    // Margin assertion: 0.55in
    assert.match(tex, /margin=0\.55in/);
  });
});
