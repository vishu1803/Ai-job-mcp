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
});
