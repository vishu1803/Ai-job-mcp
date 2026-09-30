/**
 * @file Unit Tests: ATS Extraction Model (Priority 1)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  AtsExtractionModelService,
  atsExtractionModelService,
} from '../../src/services/ats-extraction-model.service.js';
import { AtsExtractionModelSchema } from '../../src/domain/career/ats-extraction-model.schemas.js';

describe('AtsExtractionModel (Priority 1)', () => {
  const sampleResumeText = `
Alex Mercer
alex.mercer@example.com | (555) 019-2834 | San Francisco, CA
https://github.com/alexmercer | https://linkedin.com/in/alexmercer | https://alexmercer.dev

SUMMARY
Staff Software Engineer with 10+ years of distributed systems engineering experience.
Authorized to work in the United States.

SKILLS
Languages: Go, TypeScript, Python, Rust, SQL
Technologies: Kubernetes, Docker, PostgreSQL, Redis, Kafka, AWS, gRPC

EXPERIENCE
Acme Cloud | Staff Systems Engineer | 2021 - Present | San Francisco, CA
- Architected high-throughput event processing platform handling 50k events/sec with Apache Kafka and Go.
- Reduced p99 query latency by 45% via Redis caching tier and PostgreSQL query optimization.

Beta Corp | Senior Backend Developer | 2017 - 2021 | Austin, TX
- Designed resilient microservices using Docker, Kubernetes, and gRPC.
- Built automated deployment pipelines reducing release turnaround from 2 days to 15 minutes.

EDUCATION
University of California, Berkeley
Bachelor of Science in Computer Science | 2013 - 2017 | GPA: 3.8

PROJECTS
DistroKV | Open Source Distributed Key-Value Store
https://github.com/alexmercer/distrokv
- Raft consensus implementation in Go supporting linearizable reads and atomic writes.

CERTIFICATIONS
AWS Certified Solutions Architect - Professional | Amazon Web Services | 2022
`;

  it('extracts all required ATS fields with uniform value, confidence, and source metadata', async () => {
    const model = await atsExtractionModelService.extractModel({
      rawText: sampleResumeText,
      fileName: 'alex_mercer.txt',
    });

    // Validates against Zod schema
    const validated = AtsExtractionModelSchema.parse(model);
    assert.ok(validated);

    // Identity
    assert.strictEqual(model.identity.name.value, 'Alex Mercer');
    assert.strictEqual(typeof model.identity.name.confidence, 'number');
    assert.strictEqual(typeof model.identity.name.source.page, 'number');
    assert.strictEqual(typeof model.identity.name.source.section, 'string');

    // Contact
    assert.strictEqual(model.identity.contact.email.value, 'alex.mercer@example.com');
    assert.strictEqual(model.identity.contact.phone.value, '(555) 019-2834');

    // Links
    assert.strictEqual(model.identity.links.github.value, 'https://github.com/alexmercer');
    assert.strictEqual(model.identity.links.linkedin.value, 'https://linkedin.com/in/alexmercer');
    assert.strictEqual(model.identity.links.portfolio.value, 'https://alexmercer.dev');

    // Skills
    assert.ok(model.skills.length >= 5);
    const goSkill = model.skills.find((s) => s.name.value === 'Go' || s.name.value === 'go');
    assert.ok(goSkill);
    assert.strictEqual(typeof goSkill.name.confidence, 'number');
    assert.strictEqual(goSkill.name.source.section, 'skills');

    // Employment
    assert.ok(model.employment.length >= 2);
    const currentJob = model.employment[0];
    assert.strictEqual(typeof currentJob.jobTitle.value, 'string');
    assert.strictEqual(typeof currentJob.employer.value, 'string');
    assert.strictEqual(typeof currentJob.dates.value, 'string');
    assert.strictEqual(currentJob.jobTitle.source.section, 'work_experience');

    // Education
    assert.ok(model.education.length >= 1);
    assert.ok(model.education[0].institution.value.includes('University of California'));
    assert.strictEqual(model.education[0].degree.value, 'Bachelor of Science');
    assert.strictEqual(model.education[0].fieldOfStudy.value, 'Computer Science');

    // Projects
    assert.ok(model.projects.length >= 1);
    assert.ok(model.projects[0].name.value.length > 0);

    // Certifications
    assert.ok(model.certifications.length >= 1);
  });
});
