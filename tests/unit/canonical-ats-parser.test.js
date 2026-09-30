/**
 * @file Unit Tests for Canonical ATS Parser Layer (Phase 3)
 *
 * Verifies:
 * 1. Executes 4-stage canonical parsing pipeline
 * 2. Emits CanonicalCandidateProfile strictly conforming to CanonicalCandidateProfileSchema
 * 3. Extracts identity, contact, work authorization, summary, skills, experience, tenure,
 *    education, projects, open-source contributions, and certifications
 * 4. Correctly classifies project complexity (Tutorial vs Production-grade)
 * 5. Computes duration and tenure deterministically
 * 6. Preserves candidate-job separation (never invents qualifications)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { CanonicalAtsParserService } from '../../src/services/canonical-ats-parser.service.js';
import { CanonicalCandidateProfileSchema } from '../../src/domain/career/canonical-candidate-profile.schemas.js';

describe('Canonical ATS Parser Layer (Phase 3)', () => {
  const parserService = new CanonicalAtsParserService();

  const SAMPLE_RESUME_TEXT = `
Alex Mercer
alex.mercer@example.com | +1 (555) 234-5678 | San Francisco, CA
US Citizen | Authorized to work in the US
https://github.com/alexmercer | https://linkedin.com/in/alexmercer | https://alexmercer.dev

Professional Summary
Senior Software Engineer with 6+ years of experience designing and scaling distributed backend systems.
Specialized in Node.js, TypeScript, PostgreSQL, and Kubernetes.

Technical Skills
Languages: JavaScript, TypeScript, Python, Go, SQL
Frameworks & Libraries: React, Node.js, Express, Next.js, FastAPI
Databases: PostgreSQL, Redis, MongoDB
Cloud & DevOps: AWS, Docker, Kubernetes, CI/CD, Terraform, Linux
Architecture: Microservices, RESTful APIs, Event-Driven Architecture

Professional Experience
Senior Software Engineer | Stripe | San Francisco, CA | 2022 - Present
● Architected high-throughput payment processing microservice handling 15,000 req/sec using Node.js and PostgreSQL.
● Reduced P99 latency by 35% through Redis distributed caching and database query indexing.
● Mentored junior engineers and led bi-weekly distributed architecture design reviews.

Software Engineer | Cloudflare | Austin, TX | 2019 - 2022
● Developed edge network telemetry pipeline using Go and TypeScript.
● Implemented automated CI/CD deployment pipelines using Docker, Kubernetes, and GitHub Actions.

Software Engineering Intern | Red Hat | Boston, MA | 2018 - 2019
● Built diagnostic CLI tools for OpenShift clusters in Python and Go.

Technical Projects
Distributed Key-Value Store | Go, Raft, Docker | https://github.com/alexmercer/raft-kv
● Engineered production-grade distributed consensus key-value store implementing Raft consensus algorithm.
● Deployed multi-node cluster on Kubernetes with automated failure injection testing.

Fullstack Task Manager | React, Node.js, MongoDB
● Simple note-taking and task-tracking web application with JWT authentication.

Education
University of California, Berkeley | Bachelor of Science in Computer Science | 2015 - 2019
● Graduated with Honors. GPA: 3.85 / 4.0.

Certifications
● AWS Certified Solutions Architect - Associate
● Certified Kubernetes Administrator (CKA)
  `.trim();

  it('successfully parses multi-section text into a validated Canonical Candidate Profile', async () => {
    const tenantId = randomUUID();
    const candidateId = randomUUID();

    const profile = await parserService.parseDocumentToCanonicalProfile({
      rawText: SAMPLE_RESUME_TEXT,
      fileName: 'alex_mercer_resume.txt',
      tenantId,
      candidateId,
    });

    // 1. Must parse successfully against canonical Zod schema
    const validated = CanonicalCandidateProfileSchema.parse(profile);
    assert.ok(validated);
    assert.strictEqual(validated.schemaVersion, '1.0.0');
    assert.strictEqual(validated.tenantId, tenantId);
    assert.strictEqual(validated.candidateId, candidateId);

    // 2. Identity and Contact Validation
    assert.strictEqual(profile.identity.name, 'Alex Mercer');
    assert.strictEqual(profile.identity.contact.email, 'alex.mercer@example.com');
    assert.strictEqual(profile.identity.contact.phone, '+1 (555) 234-5678');
    assert.strictEqual(profile.identity.location, 'San Francisco, CA');
    assert.strictEqual(profile.identity.workAuthorization, 'US_CITIZEN');
    assert.strictEqual(profile.identity.links.github, 'https://github.com/alexmercer');
    assert.strictEqual(profile.identity.links.linkedin, 'https://linkedin.com/in/alexmercer');
    assert.strictEqual(profile.identity.links.portfolio, 'https://alexmercer.dev');

    // 3. Summary Validation
    assert.ok(profile.summary.text.includes('Senior Software Engineer with 6+ years'));
    assert.strictEqual(profile.summary.yearsOfExperience, 6);

    // 4. Skills Extraction & Categorization Validation
    assert.ok(profile.skills.length >= 10);
    const skillNames = profile.skills.map((s) => s.name);
    assert.ok(skillNames.includes('JavaScript') || skillNames.includes('TypeScript'));
    assert.ok(skillNames.includes('PostgreSQL'));
    assert.ok(skillNames.includes('Kubernetes'));

    const tsSkill = profile.skills.find((s) => s.name === 'TypeScript');
    if (tsSkill) {
      assert.strictEqual(tsSkill.category, 'LANGUAGE');
    }
    const pgSkill = profile.skills.find((s) => s.name === 'PostgreSQL');
    if (pgSkill) {
      assert.strictEqual(pgSkill.category, 'DATABASE');
    }

    // 5. Professional Experience & Tenure Validation
    assert.strictEqual(profile.experience.length, 3);
    const stripeExp = profile.experience[0];
    assert.strictEqual(stripeExp.company, 'Stripe');
    assert.strictEqual(stripeExp.title, 'Senior Software Engineer');
    assert.strictEqual(stripeExp.isCurrent, true);
    assert.strictEqual(stripeExp.employmentType, 'FULL_TIME');
    assert.ok(stripeExp.durationMonths > 0);
    assert.ok(stripeExp.technologies.includes('Node.js'));
    assert.ok(stripeExp.technologies.includes('PostgreSQL'));

    const internExp = profile.experience[2];
    assert.strictEqual(internExp.company, 'Red Hat');
    assert.strictEqual(internExp.employmentType, 'INTERNSHIP');

    // 6. Education Validation
    assert.ok(profile.education.length >= 1);
    const edu = profile.education[0];
    assert.ok(edu.institution.includes('University of California'));
    assert.ok(edu.degree.includes('Bachelor of Science'));
    assert.strictEqual(edu.fieldOfStudy, 'Computer Science');

    // 7. Projects & Complexity Level Classification
    assert.ok(profile.projects.length >= 2);
    const raftProj = profile.projects.find((p) => p.name.includes('Distributed Key-Value Store'));
    assert.ok(raftProj);
    assert.strictEqual(raftProj.complexityLevel, 'PRODUCTION_GRADE');
    assert.strictEqual(raftProj.githubUrl, 'https://github.com/alexmercer/raft-kv');

    // 8. Open Source Contributions
    assert.ok(profile.openSourceContributions.length >= 1);
    assert.strictEqual(profile.openSourceContributions[0].role, 'MAINTAINER');

    // 9. Certifications
    assert.ok(profile.certifications.length >= 2);
    assert.ok(profile.certifications.some((c) => c.name.includes('AWS Certified')));
    assert.ok(
      profile.certifications.some((c) => c.name.includes('Certified Kubernetes Administrator'))
    );

    // 10. Artifact Quality Audit & Metadata
    assert.ok(profile.artifactQuality.parseabilityScore >= 70.0);
    assert.strictEqual(profile.artifactQuality.qualityStatus, 'PASS');
    assert.ok(profile.parseMetadata.extractionConfidence >= 0.85);
    assert.strictEqual(profile.sourceArtifact.format, 'TXT');
    assert.strictEqual(profile.sourceArtifact.fileName, 'alex_mercer_resume.txt');
  });

  it('correctly handles documents with tutorial project complexity', async () => {
    const text = `
Bob Developer
bob@example.com
Projects
Todo App
Built simple todo list application with React.
Calculator
Created basic calculator app with JavaScript.
    `.trim();

    const profile = await parserService.parseDocumentToCanonicalProfile({
      rawText: text,
      fileName: 'bob.txt',
    });

    assert.strictEqual(profile.projects.length, 2);
    assert.strictEqual(profile.projects[0].complexityLevel, 'TUTORIAL');
    assert.strictEqual(profile.projects[1].complexityLevel, 'TUTORIAL');
  });

  it('correctly extracts work authorization status across varied phrasing', async () => {
    const usCitizenProfile = await parserService.parseDocumentToCanonicalProfile({
      rawText: 'Jane Doe\njane@example.com\nUnited States Citizen',
      fileName: 'jane.txt',
    });
    assert.strictEqual(usCitizenProfile.identity.workAuthorization, 'US_CITIZEN');

    const greenCardProfile = await parserService.parseDocumentToCanonicalProfile({
      rawText: 'John Doe\njohn@example.com\nPermanent Resident (Green Card holder)',
      fileName: 'john.txt',
    });
    assert.strictEqual(greenCardProfile.identity.workAuthorization, 'GREEN_CARD');

    const h1bProfile = await parserService.parseDocumentToCanonicalProfile({
      rawText: 'Priya Sharma\npriya@example.com\nRequires H1B Visa Sponsorship',
      fileName: 'priya.txt',
    });
    assert.strictEqual(h1bProfile.identity.workAuthorization, 'WORK_VISA_OR_SPONSORSHIP');
  });
});
