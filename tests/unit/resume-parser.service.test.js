/**
 * @file Unit Tests for ResumeParserService (P13.5-003 / ARCH-052).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resumeParserService,
  MAX_FILE_SIZE_BYTES,
} from '../../src/services/resume-parser.service.js';
import { SecurityError, ValidationError } from '../../src/errors/index.js';

describe('ResumeParserService (Unit)', () => {
  it('validates and detects PDF files via magic bytes', () => {
    const pdfBuffer = Buffer.from('%PDF-1.4 header text and stream elements');
    const result = resumeParserService.validateFile({
      buffer: pdfBuffer,
      fileName: 'candidate-cv.pdf',
    });

    assert.equal(result.format, 'PDF');
    assert.equal(result.detectedMimeType, 'application/pdf');
    assert.equal(result.sanitizedFileName, 'candidate-cv.pdf');
  });

  it('validates and detects DOCX files via ZIP magic bytes', () => {
    const docxBuffer = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x08, 0x00]);
    const result = resumeParserService.validateFile({
      buffer: docxBuffer,
      fileName: 'resume.docx',
    });

    assert.equal(result.format, 'DOCX');
    assert.equal(
      result.detectedMimeType,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
  });

  it('validates and detects Plain Text / Markdown files', () => {
    const txtBuffer = Buffer.from('Software Engineer\nExperience in Python, TypeScript');
    const result = resumeParserService.validateFile({
      buffer: txtBuffer,
      fileName: 'my_resume.txt',
      declaredMimeType: 'text/plain',
    });

    assert.equal(result.format, 'TXT');
    assert.equal(result.detectedMimeType, 'text/plain');
  });

  it('rejects executable binary uploads with SecurityError', () => {
    const mzExeBuffer = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]);
    assert.throws(
      () => resumeParserService.validateFile({ buffer: mzExeBuffer, fileName: 'resume.exe' }),
      (err) => err instanceof SecurityError && err.code === 'EXECUTABLE_REJECTED'
    );

    const elfBuffer = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01]);
    assert.throws(
      () => resumeParserService.validateFile({ buffer: elfBuffer, fileName: 'resume.bin' }),
      (err) => err instanceof SecurityError && err.code === 'EXECUTABLE_REJECTED'
    );
  });

  it('rejects oversized files exceeding 10MB limit', () => {
    const bigBuffer = Buffer.alloc(MAX_FILE_SIZE_BYTES + 1);
    assert.throws(
      () => resumeParserService.validateFile({ buffer: bigBuffer, fileName: 'huge.pdf' }),
      (err) => err instanceof ValidationError && err.code === 'FILE_TOO_LARGE'
    );
  });

  it('scrubs credentials, personal access tokens, and API keys from text', () => {
    const rawWithSecrets = `
      GitHub: ghp_123456789012345678901234567890123456
      OpenAI: sk-abcdefghijklmnopqrstuvwxyz1234567890123456789012
      AWS: AKIAIOSFODNN7EXAMPLE
      Database: password="superSecretPassword123!"
      Skills: React, Node.js, Postgres
    `;

    const scrubbed = resumeParserService.scrubSecrets(rawWithSecrets);
    assert.ok(!scrubbed.includes('ghp_123456789012345678901234567890123456'));
    assert.ok(!scrubbed.includes('sk-abcdefghijklmnopqrstuvwxyz1234567890123456789012'));
    assert.ok(!scrubbed.includes('AKIAIOSFODNN7EXAMPLE'));
    assert.ok(scrubbed.includes('[REDACTED_SECRET]'));
    assert.ok(scrubbed.includes('React, Node.js, Postgres'));
  });

  it('splits text into structured sections accurately', () => {
    const sampleResume = `
SUMMARY
Experienced full-stack engineer with 6 years building microservices and cloud infrastructure.

WORK EXPERIENCE
• Senior Backend Engineer at CloudScale: Built high-throughput payment settlement pipelines.
• Software Engineer at DataCorp: Implemented Redis caching layers.

EDUCATION
• Master of Science in Computer Science, Stanford University
• Bachelor of Science in Software Engineering

TECHNICAL SKILLS
TypeScript, Node.js, PostgreSQL, Docker, Kubernetes, AWS

PROJECTS
• Career MCP Server: Open-source implementation of Model Context Protocol.
    `;

    const sections = resumeParserService.splitIntoSections(sampleResume);
    assert.ok(sections.length >= 5);

    const sectionTypes = sections.map((s) => s.sectionType);
    assert.ok(sectionTypes.includes('SUMMARY'));
    assert.ok(sectionTypes.includes('WORK_EXPERIENCE'));
    assert.ok(sectionTypes.includes('EDUCATION'));
    assert.ok(sectionTypes.includes('SKILLS'));
    assert.ok(sectionTypes.includes('PROJECTS'));

    const skillsSec = sections.find((s) => s.sectionType === 'SKILLS');
    assert.ok(skillsSec.structuredData.skills.includes('TypeScript'));
    assert.ok(skillsSec.structuredData.skills.includes('PostgreSQL'));
  });

  it('generates candidate claims strictly tagged with CLAIMED truth classification', () => {
    const sampleResume = `
TECHNICAL SKILLS
TypeScript, PostgreSQL, Kubernetes

WORK EXPERIENCE
• Built resilient event-driven architecture handling 10k RPS.
    `;

    const sections = resumeParserService.splitIntoSections(sampleResume);
    const claims = resumeParserService.generateClaims(sections);

    assert.ok(claims.length >= 3);
    for (const claim of claims) {
      assert.equal(claim.provenanceStatus, 'CLAIMED');
      assert.ok(claim.context.includes('[Unverified User Claim]'));
    }

    const skillClaims = claims.filter((c) => c.claimType === 'SKILL');
    const skillNames = skillClaims.map((c) => c.statement);
    assert.ok(skillNames.includes('TypeScript'));
    assert.ok(skillNames.includes('PostgreSQL'));
    assert.ok(skillNames.includes('Kubernetes'));
  });

  it('extracts contact URLs, GitHub, and LinkedIn profiles as CONTACT claims', () => {
    const resumeWithLinks = `
CONTACT INFO
Email: engineer@example.com
GitHub: https://github.com/vishu1803
LinkedIn: https://linkedin.com/in/vishw-dev
Portfolio: https://vishw.dev

SUMMARY
Experienced systems architect.
    `;

    const sections = resumeParserService.splitIntoSections(resumeWithLinks);
    const claims = resumeParserService.generateClaims(sections);

    const contactClaims = claims.filter((c) => c.claimType === 'CONTACT');
    assert.ok(contactClaims.length >= 3);
    for (const c of contactClaims) {
      assert.equal(c.provenanceStatus, 'CLAIMED');
      assert.ok(c.context.includes('[Unverified User Claim]'));
    }

    const contactStatements = contactClaims.map((c) => c.statement);
    assert.ok(contactStatements.some((s) => s.includes('github.com/vishu1803')));
    assert.ok(contactStatements.some((s) => s.includes('linkedin.com/in/vishw-dev')));
  });

  it('extracts skills from unstructured resume text fallback', () => {
    const unstructuredResume = `
Jane Doe
Senior Fullstack Engineer who specializes in Fastify, Node.js, TypeScript, PostgreSQL, and Docker.
Delivered enterprise features and scaled services across AWS.
    `;

    const sections = resumeParserService.splitIntoSections(unstructuredResume);
    const claims = resumeParserService.generateClaims(sections);

    const skillClaims = claims.filter((c) => c.claimType === 'SKILL');
    assert.ok(skillClaims.length >= 4);

    const skillNames = skillClaims.map((c) => c.statement);
    assert.ok(skillNames.includes('Fastify'));
    assert.ok(skillNames.includes('Node.js'));
    assert.ok(skillNames.includes('TypeScript'));
    assert.ok(skillNames.includes('PostgreSQL'));
    assert.ok(skillNames.includes('Docker'));

    for (const c of skillClaims) {
      assert.equal(c.provenanceStatus, 'CLAIMED');
      assert.ok(c.context.includes('[Unverified User Claim]'));
    }
  });

  it('detects ALL CAPS headings and splits into correct sections', () => {
    const allCapsResume = `
PROFESSIONAL SUMMARY
Full-stack engineer with 5 years of experience.

TECHNICAL SKILLS
Python, JavaScript, TypeScript, React, Node.js

PROBLEM SOLVING & ALGORITHMS
Competitive programming enthusiast.

PROJECTS
AI Chatbot: Python, Flask, OpenAI API

EXPERIENCE
Software Engineer at TechCorp 2020-2024

EDUCATION
MIT Computer Science 2016
    `;

    const sections = resumeParserService.splitIntoSections(allCapsResume);
    assert.ok(sections.length >= 5, `Expected >=5 sections, got ${sections.length}`);

    const types = sections.map((s) => s.sectionType);
    assert.ok(types.includes('SUMMARY'));
    assert.ok(types.includes('SKILLS'), 'TECHNICAL SKILLS should map to SKILLS type');
    assert.ok(types.includes('PROJECTS'));
    assert.ok(types.includes('WORK_EXPERIENCE'));
    assert.ok(types.includes('EDUCATION'));

    const skillsSec = sections.find((s) => s.sectionType === 'SKILLS');
    assert.ok(skillsSec, 'Should find a SKILLS section');
    assert.ok(skillsSec.structuredData.skills.includes('Python'));
    assert.ok(skillsSec.structuredData.skills.includes('JavaScript'));
    assert.ok(skillsSec.structuredData.skills.includes('TypeScript'));

    const claims = resumeParserService.generateClaims(sections);
    assert.ok(claims.length >= 8, `Expected >=8 claims, got ${claims.length}`);
  });

  it('handles concatenated PDF text by splitting on heading keywords', () => {
    // Simulates PDF text extraction that puts everything on one line
    const concatenatedText = `PROFESSIONAL SUMMARY Full-stack engineer. TECHNICAL SKILLS Python, JavaScript, PostgreSQL. PROJECTS AI Chatbot Flask OpenAI. EXPERIENCE Engineer at TechCorp. EDUCATION MIT Computer Science`;

    const sections = resumeParserService.splitIntoSections(concatenatedText);
    assert.ok(sections.length >= 3, `Expected >=3 sections, got ${sections.length}`);

    const types = sections.map((s) => s.sectionType);
    assert.ok(
      types.includes('SKILLS'),
      `Should detect SKILLS section from concatenated text, types: ${types}`
    );
    assert.ok(
      types.includes('PROJECTS'),
      `Should detect PROJECTS section from concatenated text, types: ${types}`
    );

    const skillsSec = sections.find((s) => s.sectionType === 'SKILLS');
    if (skillsSec) {
      assert.ok(
        skillsSec.structuredData.skills.includes('Python'),
        'Should extract Python from concatenated skills'
      );
    }
  });

  it('parses Category: items sub-section format in skills', () => {
    const skillsText = `TECHNICAL SKILLS
Languages: Python, JavaScript, TypeScript
Backend & APIs: FastAPI, Node.js, Express.js, NestJS
CS Fundamentals: Data Structures, Algorithms, OOP, System Design
Data Stores: PostgreSQL, MongoDB
Frontend & Tools: React.js, Next.js, Tailwind CSS, Git, GitHub`;

    const sections = resumeParserService.splitIntoSections(skillsText);
    const skillsSec = sections.find((s) => s.sectionType === 'SKILLS');
    assert.ok(skillsSec, 'Should detect SKILLS section');

    const skills = skillsSec.structuredData.skills;
    assert.ok(skills.includes('Python'), 'Should extract Python');
    assert.ok(skills.includes('JavaScript'), 'Should extract JavaScript');
    assert.ok(skills.includes('FastAPI'), 'Should extract FastAPI');
    assert.ok(skills.includes('Node.js'), 'Should extract Node.js');
    assert.ok(skills.includes('Express.js'), 'Should extract Express.js');
    assert.ok(skills.includes('PostgreSQL'), 'Should extract PostgreSQL');
    assert.ok(skills.includes('React.js'), 'Should extract React.js');
    assert.ok(skills.includes('Data Structures'), 'Should extract Data Structures');
    assert.ok(skills.includes('Algorithms'), 'Should extract Algorithms');
    assert.ok(skills.includes('System Design'), 'Should extract System Design');
    assert.ok(
      skills.length >= 15,
      `Expected >=15 skills, got ${skills.length}: ${skills.join(', ')}`
    );
  });

  it('maps PROBLEM SOLVING & ALGORITHMS to SKILLS section', () => {
    const resume = `
PROFESSIONAL SUMMARY
Engineer

TECHNICAL SKILLS
Python, JavaScript

PROBLEM SOLVING & ALGORITHMS
Expert in graph algorithms and dynamic programming

EXPERIENCE
Engineer at TechCorp
    `;

    const sections = resumeParserService.splitIntoSections(resume);
    const skillsSections = sections.filter((s) => s.sectionType === 'SKILLS');
    assert.ok(
      skillsSections.length >= 1,
      'PROBLEM SOLVING & ALGORITHMS should be detected as SKILLS type'
    );
  });

  it('groups non-bullet WORK_EXPERIENCE entries by role/title boundaries', () => {
    const resume = `WORK EXPERIENCE
Full Stack Developer Intern
FTV Saloon
June 2024 - September 2024
Remote
Built scalable web applications using React and Node.js
Improved page load time by 40%

Backend Developer
TechCorp Inc.
January 2023 - May 2023
Designed RESTful APIs using FastAPI and PostgreSQL`;

    const sections = resumeParserService.splitIntoSections(resume);
    const expSec = sections.find((s) => s.sectionType === 'WORK_EXPERIENCE');
    assert.ok(expSec, 'Should have WORK_EXPERIENCE section');
    assert.ok(
      expSec.structuredData.items.length >= 2,
      `Should detect >=2 experience entries from non-bullet text, got ${expSec.structuredData.items.length}`
    );
    // First entry should contain the role title
    assert.ok(
      expSec.structuredData.items[0].includes('Full Stack Developer Intern'),
      'First entry should contain the role title'
    );
    // Second entry should contain the second role
    assert.ok(
      expSec.structuredData.items[1].includes('Backend Developer'),
      'Second entry should contain the second role title'
    );
  });

  it('groups non-bullet PROJECTS entries by project name boundaries', () => {
    const resume = `PROJECTS
AI-Powered Code Review Assistant
Python, Flask, FastAPI, Next.js, OpenAI API
https://github.com/user/ai-review
Built intelligent code review tool using LLMs

Collaborative Task Manager
Node.js, Prisma, PostgreSQL, Next.js, TypeScript
https://github.com/user/task-manager
Real-time collaborative project management platform`;

    const sections = resumeParserService.splitIntoSections(resume);
    const projSec = sections.find((s) => s.sectionType === 'PROJECTS');
    assert.ok(projSec, 'Should have PROJECTS section');
    assert.ok(
      projSec.structuredData.items.length >= 2,
      `Should detect >=2 project entries, got ${projSec.structuredData.items.length}`
    );
    assert.ok(
      projSec.structuredData.items[0].includes('AI-Powered Code Review Assistant'),
      'First entry should contain the project name'
    );
    assert.ok(
      projSec.structuredData.items[1].includes('Collaborative Task Manager'),
      'Second entry should contain the second project name'
    );
  });

  it('handles en-dash and em-dash date ranges in non-bullet entries', () => {
    const resume = `EXPERIENCE
Full Stack Developer Intern
FTV Saloon
June 2024 \u2013 September 2024
Remote
Built scalable web applications

Backend Developer
TechCorp
January 2023 \u2013 May 2023
Designed RESTful APIs`;

    const sections = resumeParserService.splitIntoSections(resume);
    const expSec = sections.find((s) => s.sectionType === 'WORK_EXPERIENCE');
    assert.ok(expSec, 'Should have WORK_EXPERIENCE section');
    assert.ok(
      expSec.structuredData.items.length >= 2,
      `Should detect >=2 entries with en-dash dates, got ${expSec.structuredData.items.length}`
    );
    // Verify date is included in the entry text
    const allText = expSec.structuredData.items.join(' ');
    assert.ok(allText.includes('2024'), 'Should preserve year from date range');
  });

  it('preserves single entry when no role/project boundaries found', () => {
    const resume = `EXPERIENCE
Software Engineer at Google
2020 - 2024
Mountain View, CA
Worked on distributed systems`;

    const sections = resumeParserService.splitIntoSections(resume);
    const expSec = sections.find((s) => s.sectionType === 'WORK_EXPERIENCE');
    assert.ok(expSec, 'Should have WORK_EXPERIENCE section');
    assert.equal(
      expSec.structuredData.items.length,
      1,
      'Single role should produce exactly 1 entry'
    );
    assert.ok(
      expSec.structuredData.items[0].includes('Software Engineer'),
      'Entry should contain the role'
    );
    assert.ok(
      expSec.structuredData.items[0].includes('distributed systems'),
      'Entry should include the description'
    );
  });

  it('produces CLAIMED claims from non-bullet experience entries', () => {
    const resume = `EXPERIENCE
Full Stack Developer Intern
FTV Saloon
June 2024 - September 2024
Remote
Built scalable web applications`;

    const sections = resumeParserService.splitIntoSections(resume);
    const claims = resumeParserService.generateClaims(sections);
    const expClaims = claims.filter((c) => c.claimType === 'EXPERIENCE');
    assert.ok(expClaims.length >= 1, 'Should generate experience claims');
    for (const c of expClaims) {
      assert.equal(c.provenanceStatus, 'CLAIMED');
      assert.ok(c.context.includes('[Unverified User Claim]'));
    }
  });

  it('strips leaked section headings from non-bullet entry text', () => {
    const resume = `EXPERIENCE
Full Stack Developer
Google
2020 - 2024
Worked on search infrastructure`;

    const sections = resumeParserService.splitIntoSections(resume);
    const expSec = sections.find((s) => s.sectionType === 'WORK_EXPERIENCE');
    assert.ok(expSec, 'Should have WORK_EXPERIENCE section');
    // The entry should not contain the section heading "EXPERIENCE"
    const allText = expSec.structuredData.items.join(' ');
    assert.ok(
      !allText.startsWith('EXPERIENCE'),
      'Entry should not start with leaked section heading'
    );
  });

  it('normalizes all canonical heading variants to schema section types', () => {
    const headingVariants = [
      { input: 'PROFESSIONAL SUMMARY', expected: 'SUMMARY' },
      { input: 'EXECUTIVE SUMMARY', expected: 'SUMMARY' },
      { input: 'CAREER SUMMARY', expected: 'SUMMARY' },
      { input: 'CAREER OBJECTIVE', expected: 'SUMMARY' },
      { input: 'ABOUT ME', expected: 'SUMMARY' },
      { input: 'TECHNICAL SKILLS', expected: 'SKILLS' },
      { input: 'CORE COMPETENCIES', expected: 'SKILLS' },
      { input: 'TECHNICAL EXPERTISE', expected: 'SKILLS' },
      { input: 'PROBLEM SOLVING & ALGORITHMS', expected: 'SKILLS' },
      { input: 'ALGORITHMS', expected: 'SKILLS' },
      { input: 'WORK EXPERIENCE', expected: 'WORK_EXPERIENCE' },
      { input: 'EMPLOYMENT HISTORY', expected: 'WORK_EXPERIENCE' },
      { input: 'PROFESSIONAL EXPERIENCE', expected: 'WORK_EXPERIENCE' },
      { input: 'RELEVANT EXPERIENCE', expected: 'WORK_EXPERIENCE' },
      { input: 'KEY PROJECTS', expected: 'PROJECTS' },
      { input: 'TECHNICAL PROJECTS', expected: 'PROJECTS' },
      { input: 'FEATURED PROJECTS', expected: 'PROJECTS' },
      { input: 'OPEN SOURCE', expected: 'PROJECTS' },
      { input: 'ACADEMIC BACKGROUND', expected: 'EDUCATION' },
      { input: 'EDUCATIONAL QUALIFICATIONS', expected: 'EDUCATION' },
      { input: 'EDUCATION', expected: 'EDUCATION' },
      { input: 'CERTIFICATIONS', expected: 'CERTIFICATIONS' },
      { input: 'LICENSES & CERTIFICATIONS', expected: 'CERTIFICATIONS' },
      { input: 'CONTACT INFO', expected: 'CONTACT_INFO' },
      { input: 'PERSONAL DETAILS', expected: 'CONTACT_INFO' },
    ];

    for (const variant of headingVariants) {
      const resumeText = `${variant.input}\nSome sample content under this heading.`;
      const sections = resumeParserService.splitIntoSections(resumeText);
      const section = sections[0];
      assert.equal(
        section.sectionType,
        variant.expected,
        `Expected heading "${variant.input}" to map to section type "${variant.expected}", got "${section?.sectionType}"`
      );
    }
  });

  it('strictly enforces CLAIMED truth classification on all generated claims without exception', () => {
    const complexResume = `
PROFESSIONAL SUMMARY
Principal Distributed Systems Architect with expertise in high-throughput data platforms.

TECHNICAL SKILLS
Languages: Go, Rust, TypeScript, Python
Infrastructure: Kubernetes, Docker, Terraform, AWS, Kafka

PROBLEM SOLVING & ALGORITHMS
Competitive programming with 500+ LeetCode problems solved.

PROJECTS
High-Speed Broker | Go, Kafka, Redis
https://github.com/candidate/broker
Engineered ultra-low-latency event streaming engine handling 1M ops/sec.

WORK EXPERIENCE
Principal Engineer | CloudScale Inc. | San Francisco, CA | 2021 - Present
Architected multi-region failover architecture reducing downtime by 99.9%.

EDUCATION
Master of Science in Computer Science | Stanford University | 2019

CERTIFICATIONS
AWS Certified Solutions Architect Professional
    `;

    const sections = resumeParserService.splitIntoSections(complexResume);
    const claims = resumeParserService.generateClaims(sections);

    assert.ok(claims.length >= 10, `Expected >= 10 claims, got ${claims.length}`);

    // TRUTH MODEL INVARIANT: Every single claim MUST be CLAIMED with [Unverified User Claim]
    for (const claim of claims) {
      assert.equal(
        claim.provenanceStatus,
        'CLAIMED',
        `Claim "${claim.statement}" must have provenanceStatus CLAIMED`
      );
      assert.ok(
        claim.context.includes('[Unverified User Claim]'),
        `Claim context must include "[Unverified User Claim]", got: "${claim.context}"`
      );
      // Ensure it is never marked VERIFIED
      assert.notEqual(
        claim.provenanceStatus,
        'VERIFIED',
        `Resume parser must NEVER mark claims as VERIFIED directly`
      );
    }

    // Verify structured claims existence across types
    const types = new Set(claims.map((c) => c.claimType));
    assert.ok(types.has('SUMMARY'), 'Should have SUMMARY claim');
    assert.ok(types.has('SKILL'), 'Should have SKILL claims');
    assert.ok(types.has('PROJECT'), 'Should have PROJECT claims');
    assert.ok(types.has('EXPERIENCE'), 'Should have EXPERIENCE claims');
    assert.ok(types.has('EDUCATION'), 'Should have EDUCATION claims');
    assert.ok(types.has('CERTIFICATION'), 'Should have CERTIFICATION claims');
  });

  it('correctly decodes Type0 CIDFont hex streams using CMap tables', () => {
    const sampleCMap = `
/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def
1 begincodespacerange
<0000> <FFFF>
endcodespacerange
2 beginbfchar
<0039> <0050>
<0042> <0079>
endbfchar
1 beginbfrange
<0045> <0046> [<0074> <0068>]
endbfrange
endcmap
CMapName currentdict /CMap defineresource pop
end
end
    `;

    const map = resumeParserService._parseCMap(sampleCMap);
    assert.equal(map.get(0x0039), 'P');
    assert.equal(map.get(0x0042), 'y');
    assert.equal(map.get(0x0045), 't');
    assert.equal(map.get(0x0046), 'h');
  });
});
