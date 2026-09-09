/**
 * @file Unit Tests for P16-001F-2: Structured Resume -> Controlled LaTeX Renderer
 *
 * Requirements Tested:
 * A. Structured package renders without candidateProfile.
 * B. Mock candidateProfileService.getProfile to throw; structured package still renders.
 * C. Summary comes from structuredResume.
 * D. Skills come from structuredResume.
 * E. Project order comes from structuredResume.
 * F. Project bullets come from structuredResume.
 * G. Experience comes from structuredResume.
 * H. Education comes from structuredResume.
 * I. Certifications come from structuredResume.
 * J. DSA comes from structuredResume.
 * K. Heading comes from structuredResume.
 * L. Links come from structuredResume.
 * M. sectionOrder comes from structuredResume.
 * N. Markdown content can be empty and structured resume still renders.
 * O. Markdown regex paths are not invoked for structured packages.
 * P. Legacy package without structuredResume still renders through fallback.
 * Q. Candidate profile mutation after package creation does not affect structured rendering.
 * R. Raw LaTeX in text is escaped.
 * S. URL containing % works.
 * T. URL containing # works.
 * U. URL containing _ works.
 * V. mailto with underscore works.
 * W. smart quotes compile.
 * X. en-dash/em-dash compile.
 * Y. same structured document produces deterministic LaTeX.
 * Z. candidate-specific hardcoded fallback is absent.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  LatexDocumentGenerator,
  escapeLatex,
  escapeLatexUrl,
} from '../../src/services/latex-document-generator.service.js';
import { ApplicationHandoffService } from '../../src/services/application-handoff.service.js';
import { LatexCompilerService } from '../../src/services/latex-compiler.service.js';

function createMockStructuredResume(overrides = {}) {
  return {
    schemaVersion: '2.0.0',
    documentId: crypto.randomUUID(),
    targetRole: 'Staff Distributed Systems Engineer',
    sectionOrder: [
      'HEADER',
      'SUMMARY',
      'TECHNICAL_SKILLS',
      'PROJECTS',
      'DSA',
      'EXPERIENCE',
      'EDUCATION',
      'CERTIFICATIONS',
    ],
    candidateIdentity: {
      displayName: 'Jordan Taylor',
      headline: 'Staff Distributed Systems Engineer',
      email: 'jordan.taylor@example.org',
      phone: '+1-555-0199',
      location: 'Austin, TX',
      links: [
        { platform: 'LINKEDIN', url: 'https://linkedin.com/in/jordantaylor', label: 'LinkedIn' },
        { platform: 'GITHUB', url: 'https://github.com/jordantaylor', label: 'GitHub' },
        { platform: 'PORTFOLIO', url: 'https://jordantaylor.dev', label: 'Portfolio' },
      ],
    },
    summary: {
      text: 'Staff engineer with 8+ years building high-throughput distributed databases and consensus engines.',
      evidenceRefs: [],
      matchedRequirementIds: ['req-dist-sys'],
      referencedSkillSlugs: ['go', 'rust', 'raft'],
      referencedProjectIds: ['proj-1'],
    },
    skills: {
      categories: [
        {
          categoryName: 'Core Languages',
          skills: [
            { name: 'Go', slug: 'go', provenanceStatus: 'VERIFIED' },
            { name: 'Rust', slug: 'rust', provenanceStatus: 'VERIFIED' },
          ],
        },
        {
          categoryName: 'Data Systems',
          skills: [
            { name: 'PostgreSQL', slug: 'postgresql', provenanceStatus: 'CORROBORATED' },
            { name: 'Redis', slug: 'redis', provenanceStatus: 'VERIFIED' },
          ],
        },
      ],
    },
    projects: [
      {
        projectId: 'proj-1',
        name: 'RaftKV',
        displayName: 'Raft Distributed Key-Value Store',
        repositoryUrl: 'https://github.com/jordantaylor/raft-kv',
        liveUrl: 'https://raft-kv.demo.org',
        technologies: ['Go', 'Raft', 'gRPC'],
        bullets: [
          { text: 'Engineered consensus algorithm supporting seamless multi-node failover' },
          { text: 'Achieved sub-millisecond p99 write latency under heavy concurrent client load' },
        ],
        relevanceScore: 96,
      },
      {
        projectId: 'proj-2',
        name: 'EventStreamingEngine',
        displayName: 'Zero-Copy Event Streamer',
        repositoryUrl: 'https://github.com/jordantaylor/event-streamer',
        liveUrl: null,
        technologies: ['Rust', 'Tokio'],
        bullets: [
          { text: 'Built lock-free ring buffer pipeline delivering 2M events/sec throughput' },
        ],
        relevanceScore: 88,
      },
    ],
    dsa: {
      hasSection: true,
      profileUrl: 'https://leetcode.com/u/jordantaylor',
      bullets: ['Solved 500+ LeetCode problems focusing on graphs, trees, and dynamic programming'],
      provenanceStatus: 'CLAIMED',
    },
    experience: [
      {
        id: 'exp-1',
        company: 'Nexus Distributed Systems',
        title: 'Principal Infrastructure Engineer',
        startDate: '2021',
        endDate: 'Present',
        isCurrent: true,
        location: 'Austin, TX',
        bullets: [
          'Architected global multi-region cloud mesh handling 100k requests/sec with 99.99% uptime',
        ],
        provenanceStatus: 'USER_PROVIDED',
      },
    ],
    education: [
      {
        id: 'edu-1',
        institution: 'University of Texas at Austin',
        degree: 'B.S.',
        fieldOfStudy: 'Computer Science',
        startDate: '2015',
        endDate: '2019',
        isCurrent: false,
        coursework: ['Distributed Systems', 'Advanced Operating Systems', 'Database Architecture'],
        provenanceStatus: 'USER_PROVIDED',
      },
    ],
    certifications: [
      {
        id: 'cert-1',
        name: 'AWS Certified Solutions Architect - Professional',
        issuingOrganization: 'Amazon Web Services',
        issueDate: '2023',
        provenanceStatus: 'USER_PROVIDED',
      },
    ],
    optionalSections: {},
    ...overrides,
  };
}

function createMockPackage(structuredResume, packageOverrides = {}) {
  return {
    candidateId: crypto.randomUUID(),
    candidateName: structuredResume.candidateIdentity.displayName,
    candidateEmail: structuredResume.candidateIdentity.email,
    candidatePhone: structuredResume.candidateIdentity.phone,
    targetJob: {
      title: 'Staff Distributed Systems Engineer',
      company: 'Acme Cloud Platform',
    },
    tailoredResume: {
      structuredResume,
      markdownContent:
        '## Professional Summary\nThis legacy markdown summary MUST NOT be rendered when structuredResume exists.\n\n## Technical Skills\n- **Old:** OldSkill\n',
    },
    coverLetter: {
      markdownContent:
        'Dear Hiring Team,\n\nI am writing to express my strong interest in the Staff Distributed Systems Engineer position at Acme Cloud Platform.\n\nWith extensive experience architecting fault-tolerant consensus mechanisms and low-latency storage engines, I am confident I will make immediate contributions to your core infrastructure.\n\nThank you for your time and consideration.',
    },
    ...packageOverrides,
  };
}

describe('P16-001F-2: Structured Resume -> Controlled LaTeX Renderer', () => {
  const generator = new LatexDocumentGenerator();

  // Test A
  it('A. Structured package renders without candidateProfile', () => {
    const structuredResume = createMockStructuredResume();
    const pkg = createMockPackage(structuredResume);

    const result = generator.generateTailoredResumeLatex({
      applicationPackage: pkg,
      candidateProfile: null,
    });

    assert.ok(result.texContent, 'texContent must be generated');
    assert.match(result.texContent, /Jordan Taylor/, 'Candidate name must be present');
    assert.match(result.texContent, /Staff Distributed Systems Engineer/, 'Headline must be present');
    assert.match(result.texContent, /Nexus Distributed Systems/, 'Company must be present');
  });

  // Test B
  it('B. Mock candidateProfileService.getProfile to throw; structured package still renders', async () => {
    const structuredResume = createMockStructuredResume();
    const pkg = createMockPackage(structuredResume, { packageHash: 'testhash12345678' });

    const throwingProfileService = {
      async getProfile() {
        throw new Error('Database connection offline');
      },
    };

    const mockTrackingService = {
      async getApplication() {
        return null;
      },
      async getApplicationDetails() {
        return { tailoredDocuments: [] };
      },
      async attachTailoredDocument() {},
    };

    const mockStorage = {
      async storeEncryptedDocument() {
        return { storageKey: 'mock-key', fileSizeBytes: 1024, contentHash: 'mockhash' };
      },
    };

    const handoffService = new ApplicationHandoffService({
      latexGenerator: generator,
      candidateProfileService: throwingProfileService,
      applicationTrackingService: mockTrackingService,
      documentStorage: mockStorage,
    });

    // Should succeed despite candidateProfileService throwing
    const kit = await handoffService.buildApplicationHandoffKit({
      tenantId: crypto.randomUUID(),
      userId: crypto.randomUUID(),
      candidateId: pkg.candidateId,
      applicationPackage: pkg,
    });

    assert.ok(kit, 'Handoff kit must be successfully created');
    assert.strictEqual(kit.status, 'HANDOFF_READY');
  });

  // Test C
  it('C. Summary comes from structuredResume', () => {
    const structuredResume = createMockStructuredResume({
      summary: {
        text: 'Unique structured summary that proves snapshot was consumed directly.',
      },
    });
    const pkg = createMockPackage(structuredResume);

    const result = generator.generateTailoredResumeLatex({
      applicationPackage: pkg,
      candidateProfile: { summary: 'Profile summary that must be ignored' },
    });

    assert.match(result.texContent, /Unique structured summary that proves snapshot was consumed directly\./);
    assert.doesNotMatch(result.texContent, /This legacy markdown summary MUST NOT be rendered/);
    assert.doesNotMatch(result.texContent, /Profile summary that must be ignored/);
  });

  // Test D
  it('D. Skills come from structuredResume in exact stored order', () => {
    const structuredResume = createMockStructuredResume({
      skills: {
        categories: [
          { categoryName: 'Specialized Langs', skills: [{ name: 'Elixir' }, { name: 'Erlang' }] },
          { categoryName: 'Cloud Storage', skills: [{ name: 'Ceph' }, { name: 'MinIO' }] },
        ],
      },
    });
    const pkg = createMockPackage(structuredResume);

    const result = generator.generateTailoredResumeLatex({
      applicationPackage: pkg,
      candidateProfile: null,
    });

    assert.match(result.texContent, /Specialized Langs/);
    assert.match(result.texContent, /Elixir, Erlang/);
    assert.match(result.texContent, /Cloud Storage/);
    assert.match(result.texContent, /Ceph, MinIO/);

    const idxSpecialized = result.texContent.indexOf('Specialized Langs');
    const idxCloud = result.texContent.indexOf('Cloud Storage');
    assert.ok(idxSpecialized < idxCloud, 'Categories must preserve stored order');
  });

  // Test E
  it('E. Project order comes from structuredResume', () => {
    const structuredResume = createMockStructuredResume({
      projects: [
        {
          name: 'FirstProjectAlpha',
          displayName: 'Alpha Service',
          technologies: ['Node.js'],
          bullets: [{ text: 'Alpha bullet' }],
        },
        {
          name: 'SecondProjectBeta',
          displayName: 'Beta Service',
          technologies: ['Python'],
          bullets: [{ text: 'Beta bullet' }],
        },
      ],
    });
    const pkg = createMockPackage(structuredResume);

    const result = generator.generateTailoredResumeLatex({
      applicationPackage: pkg,
      candidateProfile: null,
    });

    const idxAlpha = result.texContent.indexOf('Alpha Service');
    const idxBeta = result.texContent.indexOf('Beta Service');
    assert.ok(idxAlpha !== -1 && idxBeta !== -1, 'Both projects must render');
    assert.ok(idxAlpha < idxBeta, 'Projects must preserve exact structured order');
  });

  // Test F
  it('F. Project bullets come from structuredResume', () => {
    const uniqueBullet = 'Pioneered custom SIMD-accelerated serialization codec achieving 4x throughput.';
    const structuredResume = createMockStructuredResume({
      projects: [
        {
          name: 'CodecProject',
          displayName: 'SIMD Codec',
          technologies: ['C++'],
          bullets: [{ text: uniqueBullet }],
        },
      ],
    });
    const pkg = createMockPackage(structuredResume);

    const result = generator.generateTailoredResumeLatex({
      applicationPackage: pkg,
      candidateProfile: null,
    });

    assert.match(result.texContent, /Pioneered custom SIMD-accelerated serialization codec/);
  });

  // Test G
  it('G. Experience comes from structuredResume', () => {
    const structuredResume = createMockStructuredResume({
      experience: [
        {
          company: 'Quantum Ledger Corp',
          title: 'Principal Consensus Engineer',
          startDate: '2020',
          endDate: 'Present',
          isCurrent: true,
          location: 'New York, NY',
          bullets: ['Authored zero-knowledge state proof validation pipeline'],
        },
      ],
    });
    const pkg = createMockPackage(structuredResume);

    const result = generator.generateTailoredResumeLatex({
      applicationPackage: pkg,
      candidateProfile: null,
    });

    assert.match(result.texContent, /Quantum Ledger Corp/);
    assert.match(result.texContent, /Principal Consensus Engineer/);
    assert.match(result.texContent, /Authored zero-knowledge state proof validation pipeline/);
  });

  // Test H
  it('H. Education comes from structuredResume', () => {
    const structuredResume = createMockStructuredResume({
      education: [
        {
          institution: 'ETH Zurich',
          degree: 'M.S.',
          fieldOfStudy: 'Distributed Systems',
          startDate: '2019',
          endDate: '2021',
          coursework: ['Consensus Protocols', 'Byzantine Fault Tolerance'],
        },
      ],
    });
    const pkg = createMockPackage(structuredResume);

    const result = generator.generateTailoredResumeLatex({
      applicationPackage: pkg,
      candidateProfile: null,
    });

    assert.match(result.texContent, /ETH Zurich/);
    assert.match(result.texContent, /M\.S\. in Distributed Systems/);
    assert.match(result.texContent, /Consensus Protocols, Byzantine Fault Tolerance/);
  });

  // Test I
  it('I. Certifications come from structuredResume and empty section is omitted', () => {
    // 1. Present
    const structuredWithCert = createMockStructuredResume({
      certifications: [
        { name: 'Certified Kubernetes Administrator (CKA)' },
      ],
    });
    const pkgWithCert = createMockPackage(structuredWithCert);
    const resWithCert = generator.generateTailoredResumeLatex({
      applicationPackage: pkgWithCert,
      candidateProfile: null,
    });
    assert.match(resWithCert.texContent, /Certifications/);
    assert.match(resWithCert.texContent, /Certified Kubernetes Administrator \(CKA\)/);

    // 2. Empty -> omitted
    const structuredNoCert = createMockStructuredResume({ certifications: [] });
    const pkgNoCert = createMockPackage(structuredNoCert);
    const resNoCert = generator.generateTailoredResumeLatex({
      applicationPackage: pkgNoCert,
      candidateProfile: null,
    });
    assert.doesNotMatch(resNoCert.texContent, /\\atssection\{Certifications\}/);
  });

  // Test J
  it('J. DSA comes from structuredResume and null section is omitted', () => {
    // 1. Present
    const structuredWithDsa = createMockStructuredResume({
      dsa: {
        hasSection: true,
        profileUrl: 'https://leetcode.com/u/uniquecoder',
        bullets: ['Solved 600+ problems on LeetCode with top 1% contest rating'],
      },
    });
    const pkgWithDsa = createMockPackage(structuredWithDsa);
    const resWithDsa = generator.generateTailoredResumeLatex({
      applicationPackage: pkgWithDsa,
      candidateProfile: null,
    });
    assert.match(resWithDsa.texContent, /Problem Solving/);
    assert.match(resWithDsa.texContent, /leetcode\.com\/u\/uniquecoder/);

    // 2. Empty/false -> omitted
    const structuredNoDsa = createMockStructuredResume({
      dsa: { hasSection: false, bullets: [] },
    });
    const pkgNoDsa = createMockPackage(structuredNoDsa);
    const resNoDsa = generator.generateTailoredResumeLatex({
      applicationPackage: pkgNoDsa,
      candidateProfile: null,
    });
    assert.doesNotMatch(resNoDsa.texContent, /Problem Solving/);
  });

  // Test K
  it('K. Heading comes from structuredResume', () => {
    const structuredResume = createMockStructuredResume({
      candidateIdentity: {
        displayName: 'Morgan Harper',
        headline: 'Lead Cloud Infrastructure Architect',
        email: 'morgan.harper@example.org',
        links: [],
      },
    });
    const pkg = createMockPackage(structuredResume);

    const result = generator.generateTailoredResumeLatex({
      applicationPackage: pkg,
      candidateProfile: null,
    });

    assert.match(result.texContent, /Lead Cloud Infrastructure Architect/);
  });

  // Test L
  it('L. Links come from structuredResume', () => {
    const structuredResume = createMockStructuredResume({
      candidateIdentity: {
        displayName: 'Jordan Taylor',
        headline: 'Staff Engineer',
        email: 'jordan.taylor@example.org',
        links: [
          { platform: 'LINKEDIN', url: 'https://linkedin.com/in/custom-jordan', label: 'LinkedIn' },
          { platform: 'GITHUB', url: 'https://github.com/custom-jordan', label: 'GitHub' },
        ],
      },
    });
    const pkg = createMockPackage(structuredResume);

    const result = generator.generateTailoredResumeLatex({
      applicationPackage: pkg,
      candidateProfile: null,
    });

    assert.match(result.texContent, /\\href\{https:\/\/linkedin\.com\/in\/custom-jordan\}\{LinkedIn\}/);
    assert.match(result.texContent, /\\href\{https:\/\/github\.com\/custom-jordan\}\{GitHub\}/);
  });

  // Test M
  it('M. sectionOrder comes from structuredResume', () => {
    const structuredResume = createMockStructuredResume({
      sectionOrder: ['HEADER', 'PROJECTS', 'EXPERIENCE', 'TECHNICAL_SKILLS', 'EDUCATION', 'SUMMARY'],
    });
    const pkg = createMockPackage(structuredResume);

    const result = generator.generateTailoredResumeLatex({
      applicationPackage: pkg,
      candidateProfile: null,
    });

    const idxProjects = result.texContent.indexOf('Technical Projects');
    const idxExp = result.texContent.indexOf('Professional Experience');
    const idxSkills = result.texContent.indexOf('Technical Skills');
    const idxSummary = result.texContent.indexOf('Professional Summary');

    assert.ok(idxProjects < idxExp, 'Projects must precede Experience');
    assert.ok(idxExp < idxSkills, 'Experience must precede Skills');
    assert.ok(idxSkills < idxSummary, 'Skills must precede Summary');
  });

  // Test N
  it('N. Markdown content can be empty and structured resume still renders', () => {
    const structuredResume = createMockStructuredResume();
    const pkg = createMockPackage(structuredResume, {
      tailoredResume: {
        structuredResume,
        markdownContent: '', // Empty markdown!
      },
    });

    const result = generator.generateTailoredResumeLatex({
      applicationPackage: pkg,
      candidateProfile: null,
    });

    assert.ok(result.texContent, 'Must generate valid LaTeX despite empty markdown');
    assert.match(result.texContent, /Jordan Taylor/);
    assert.match(result.texContent, /Raft Distributed Key-Value Store/);
  });

  // Test O
  it('O. Markdown regex paths are not invoked for structured packages', () => {
    const structuredResume = createMockStructuredResume({
      summary: { text: 'Pure structured summary' },
    });
    // Deliberately corrupted/adversarial markdown syntax
    const corruptedMarkdown = `
## Professional Summary
[Corrupted markdown that causes catastrophic regex backtracking or syntax corruption]
${'a'.repeat(2000)}

## Technical Skills
- **FakeCat:** FakeSkill1, FakeSkill2

## Technical Projects
### [BadLink](not-a-url)
*Technologies: InjectedTech*
- Injected bullet
`;
    const pkg = createMockPackage(structuredResume, {
      tailoredResume: {
        structuredResume,
        markdownContent: corruptedMarkdown,
      },
    });

    const result = generator.generateTailoredResumeLatex({
      applicationPackage: pkg,
      candidateProfile: null,
    });

    assert.match(result.texContent, /Pure structured summary/);
    assert.doesNotMatch(result.texContent, /FakeSkill1/);
    assert.doesNotMatch(result.texContent, /InjectedTech/);
  });

  // Test P
  it('P. Legacy package without structuredResume still renders through fallback', () => {
    const legacyPkg = {
      candidateId: crypto.randomUUID(),
      candidateName: 'Alex Legacy',
      candidateEmail: 'alex.legacy@example.org',
      targetJob: { title: 'Backend Developer', company: 'Legacy Systems Inc' },
      tailoredResume: {
        // No structuredResume property!
        markdownContent: `
## Professional Summary
Dedicated backend engineer with verified experience in Node.js and PostgreSQL.

## Technical Skills
- **Backend:** Node.js, PostgreSQL

## Technical Projects
### Task Management API
*Technologies: Node.js, Express*
- Engineered RESTful microservices for task distribution
`,
      },
    };

    const legacyProfile = {
      displayName: 'Alex Legacy',
      primaryEmail: 'alex.legacy@example.org',
      headline: 'Backend Developer',
      experience: [
        {
          title: 'Software Engineer',
          company: 'Legacy Corp',
          startDate: '2020',
          endDate: 'Present',
          isCurrent: true,
          bullets: ['Maintained Node.js microservices'],
        },
      ],
      education: [
        {
          institution: 'State University',
          degree: 'B.S. in CS',
          startDate: '2016',
          endDate: '2020',
        },
      ],
    };

    const result = generator.generateTailoredResumeLatex({
      applicationPackage: legacyPkg,
      candidateProfile: legacyProfile,
    });

    assert.ok(result.texContent, 'Legacy package must generate LaTeX');
    assert.match(result.texContent, /Alex Legacy/);
    assert.match(result.texContent, /Task Management API/);
    assert.match(result.texContent, /Legacy Corp/);
  });

  // Test Q
  it('Q. Candidate profile mutation after package creation does not affect structured rendering', () => {
    const candidateProfile = {
      displayName: 'Original Name',
      primaryEmail: 'original@example.org',
      phone: '+1-555-0001',
      location: 'Original City',
      headline: 'Original Title',
    };

    const structuredResume = createMockStructuredResume({
      candidateIdentity: {
        displayName: 'Snapshot Name',
        headline: 'Snapshot Title',
        email: 'snapshot@example.org',
        phone: '+1-555-9999',
        location: 'Snapshot City',
        links: [],
      },
    });

    const pkg = createMockPackage(structuredResume);

    // Mutate profile heavily after package exists
    candidateProfile.displayName = 'MUTATED NAME';
    candidateProfile.headline = 'MUTATED HEADLINE';
    candidateProfile.phone = '000-000-0000';
    candidateProfile.location = 'MUTATED LOCATION';

    const result = generator.generateTailoredResumeLatex({
      applicationPackage: pkg,
      candidateProfile,
    });

    assert.match(result.texContent, /Snapshot Name/);
    assert.match(result.texContent, /Snapshot Title/);
    assert.match(result.texContent, /Snapshot City/);
    assert.doesNotMatch(result.texContent, /MUTATED NAME/);
    assert.doesNotMatch(result.texContent, /MUTATED HEADLINE/);
  });

  // Test R
  it('R. Raw LaTeX in text is escaped', () => {
    const rawText = 'Handled \\textbf{bold} and \\input{secret} and $500M & 100% #1 _tag_ ~home ^power <tag>';
    const escaped = escapeLatex(rawText);

    assert.ok(escaped.includes('\\textbackslash{}textbf\\{bold\\}'), 'Must neutralize textbf macro with escaped braces');
    assert.ok(escaped.includes('\\textbackslash{}input\\{secret\\}'), 'Must neutralize input macro with escaped braces');
    assert.match(escaped, /\\\$500M/);
    assert.ok(escaped.includes('\\&'));
    assert.ok(escaped.includes('\\%'));
    assert.ok(escaped.includes('\\#1'));
    assert.match(escaped, /\\_tag\\_/);
    assert.ok(escaped.includes('\\textasciitilde{}home'));
    assert.ok(escaped.includes('\\textasciicircum{}power'));
    assert.ok(escaped.includes('$<$tag$>$'));
  });

  // Test S
  it('S. URL containing % works', async () => {
    const compiler = new LatexCompilerService();
    const url = 'https://example.com/search?query=100%25&category=tech';
    const escapedUrl = escapeLatexUrl(url);

    assert.strictEqual(escapedUrl, url, 'Preserves valid percent encoded URL');

    const tex = `\\documentclass{article}\\usepackage{hyperref}\\begin{document}\\href{${escapedUrl}}{Link}\\end{document}`;
    const result = await compiler.compileLatexToPdf({ texContent: tex, jobName: 'test-url-pct' });
    assert.ok(result.pdfBuffer && result.pdfBuffer.length > 0);
  });

  // Test T
  it('T. URL containing # works', async () => {
    const compiler = new LatexCompilerService();
    const url = 'https://example.com/repo#section-readme';
    const escapedUrl = escapeLatexUrl(url);

    assert.strictEqual(escapedUrl, url, 'Preserves anchor hash');

    const tex = `\\documentclass{article}\\usepackage{hyperref}\\begin{document}\\href{${escapedUrl}}{Link}\\end{document}`;
    const result = await compiler.compileLatexToPdf({ texContent: tex, jobName: 'test-url-hash' });
    assert.ok(result.pdfBuffer && result.pdfBuffer.length > 0);
  });

  // Test U
  it('U. URL containing _ works', async () => {
    const compiler = new LatexCompilerService();
    const url = 'https://example.com/user_profile/project_repo_name';
    const escapedUrl = escapeLatexUrl(url);

    assert.strictEqual(escapedUrl, url, 'Preserves underscores inside URL target');

    const tex = `\\documentclass{article}\\usepackage{hyperref}\\begin{document}\\href{${escapedUrl}}{Link}\\end{document}`;
    const result = await compiler.compileLatexToPdf({ texContent: tex, jobName: 'test-url-und' });
    assert.ok(result.pdfBuffer && result.pdfBuffer.length > 0);
  });

  // Test V
  it('V. mailto with underscore works', async () => {
    const compiler = new LatexCompilerService();
    const email = 'jane_doe@example.com';
    const escapedTarget = `mailto:${escapeLatexUrl(email)}`;
    const escapedLabel = escapeLatex(email);

    assert.strictEqual(escapedTarget, 'mailto:jane_doe@example.com', 'Target must keep unescaped underscore');
    assert.strictEqual(escapedLabel, 'jane\\_doe@example.com', 'Label must escape underscore');

    const tex = `\\documentclass{article}\\usepackage{hyperref}\\begin{document}\\href{${escapedTarget}}{${escapedLabel}}\\end{document}`;
    const result = await compiler.compileLatexToPdf({ texContent: tex, jobName: 'test-mailto' });
    assert.ok(result.pdfBuffer && result.pdfBuffer.length > 0);
  });

  // Test W
  it('W. smart quotes compile', async () => {
    const compiler = new LatexCompilerService();
    const textWithSmartQuotes = 'Architected “zero-trust” gateway with ‘fail-safe’ mechanisms.';
    const escaped = escapeLatex(textWithSmartQuotes);

    assert.doesNotMatch(escaped, /[\u201C\u201D\u2018\u2019]/, 'Unicode smart quotes must be normalized');

    const tex = `\\documentclass{article}\\usepackage[utf8]{inputenc}\\usepackage[T1]{fontenc}\\begin{document}${escaped}\\end{document}`;
    const result = await compiler.compileLatexToPdf({ texContent: tex, jobName: 'test-smart-quotes' });
    assert.ok(result.pdfBuffer && result.pdfBuffer.length > 0);
  });

  // Test X
  it('X. en-dash/em-dash compile', async () => {
    const compiler = new LatexCompilerService();
    const textWithDashes = 'High-throughput – latency bounded — ultra-scale cluster.';
    const escaped = escapeLatex(textWithDashes);

    assert.doesNotMatch(escaped, /[\u2013\u2014]/, 'Unicode dashes must be normalized');
    assert.match(escaped, /--/);
    assert.match(escaped, /---/);

    const tex = `\\documentclass{article}\\usepackage[utf8]{inputenc}\\usepackage[T1]{fontenc}\\begin{document}${escaped}\\end{document}`;
    const result = await compiler.compileLatexToPdf({ texContent: tex, jobName: 'test-dashes' });
    assert.ok(result.pdfBuffer && result.pdfBuffer.length > 0);
  });

  // Test Y
  it('Y. same structured document produces deterministic LaTeX', () => {
    const structuredResume = createMockStructuredResume();
    const pkg = createMockPackage(structuredResume);

    const run1 = generator.generateTailoredResumeLatex({
      applicationPackage: pkg,
      candidateProfile: null,
    });
    const run2 = generator.generateTailoredResumeLatex({
      applicationPackage: pkg,
      candidateProfile: null,
    });

    assert.strictEqual(run1.texContent, run2.texContent, 'Generated LaTeX must be byte-for-byte identical');
  });

  // Test Z
  it('Z. candidate-specific hardcoded fallback is absent', () => {
    const structuredResume = createMockStructuredResume({
      candidateIdentity: {
        displayName: 'Vishw Tester',
        headline: 'Test Engineer',
        email: 'vishw.tester@custom-corp.org',
        links: [],
      },
    });
    const pkg = createMockPackage(structuredResume);

    const result = generator.generateTailoredResumeLatex({
      applicationPackage: pkg,
      candidateProfile: null,
    });

    // Verify no hardcoded github.com/vishu1803 fallback is injected
    assert.doesNotMatch(result.texContent, /vishu1803/i);
  });
});
