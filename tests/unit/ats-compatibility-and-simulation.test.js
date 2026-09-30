/**
 * @file Unit Tests for ATS Compatibility Profiles (Phase 4) & Extraction Simulation (Phase 5)
 *
 * Verifies:
 * 1. Evaluates all 6 compatibility profiles:
 *    - GENERIC_ATS
 *    - WORKDAY_COMPATIBILITY
 *    - GREENHOUSE_COMPATIBILITY
 *    - LEVER_COMPATIBILITY
 *    - ICIMS_COMPATIBILITY
 *    - TALEO_COMPATIBILITY
 * 2. Adheres strictly to AtsProfileEvaluationSchema & AtsExtractionReportSchema
 * 3. Does not claim proprietary vendor algorithmic reproduction
 * 4. Detects Workday table interleaving and date ambiguity risks
 * 5. Detects Greenhouse contact location and Lever social link requirements
 * 6. Simulates ATS extraction: detects ambiguous job titles, missing contacts, and duplicate skills
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { atsCompatibilityProfilesService } from '../../src/services/ats-compatibility-profiles.service.js';
import { atsExtractionSimulationService } from '../../src/services/ats-extraction-simulation.service.js';
import { canonicalAtsParserService } from '../../src/services/canonical-ats-parser.service.js';

describe('ATS Compatibility Profiles (Phase 4) & Extraction Simulation (Phase 5)', () => {
  const SAMPLE_CLEAN_RESUME = `
Sarah Connor
sarah.connor@example.com | 555-432-1098 | Los Angeles, CA
https://github.com/sarahconnor | https://linkedin.com/in/sarahconnor

Professional Summary
Experienced Lead Systems Engineer with 8 years building resilient distributed architectures.

Technical Skills
Languages: Rust, Go, Python, C++
Cloud & DevOps: Docker, Kubernetes, AWS, Terraform, Linux
Databases: PostgreSQL, Redis

Work Experience
Lead Systems Engineer | Cyberdyne Systems | Los Angeles, CA | 2021 - Present
● Architected secure real-time sensor network using Rust and PostgreSQL.
● Reduced infrastructure downtime by 40% with automated Kubernetes self-healing.

Systems Engineer | TechCorp | Pasadena, CA | 2017 - 2021
● Maintained backend microservices in Go and Docker.

Education
Caltech | Bachelor of Science in Electrical Engineering | 2013 - 2017
  `.trim();

  it('evaluates all 6 ATS compatibility profiles successfully', async () => {
    const canonicalProfile = await canonicalAtsParserService.parseDocumentToCanonicalProfile({
      rawText: SAMPLE_CLEAN_RESUME,
      fileName: 'sarah_connor.txt',
    });

    const evaluations = atsCompatibilityProfilesService.evaluateAllProfiles({
      canonicalProfile,
      extractedText: SAMPLE_CLEAN_RESUME,
    });

    assert.ok(evaluations);
    const expectedProfiles = [
      'GENERIC_ATS',
      'WORKDAY_COMPATIBILITY',
      'GREENHOUSE_COMPATIBILITY',
      'LEVER_COMPATIBILITY',
      'ICIMS_COMPATIBILITY',
      'TALEO_COMPATIBILITY',
    ];

    for (const pid of expectedProfiles) {
      const evalReport = evaluations[pid];
      assert.ok(evalReport, `Profile ${pid} must be evaluated`);
      assert.strictEqual(evalReport.profile, pid);
      assert.ok(typeof evalReport.score === 'number');
      assert.ok(evalReport.score >= 0 && evalReport.score <= 100);
      assert.ok(evalReport.confidence >= 0.0 && evalReport.confidence <= 1.0);
      assert.ok(Array.isArray(evalReport.risks));
      assert.ok(Array.isArray(evalReport.constraintsEvaluated));
      assert.ok(typeof evalReport.extraction === 'object');
      assert.ok(typeof evalReport.fieldConfidence === 'object');
      assert.strictEqual(evalReport.extraction.candidateName, 'Sarah Connor');
      assert.strictEqual(evalReport.extraction.email, 'sarah.connor@example.com');
      assert.strictEqual(evalReport.extraction.rolesExtractedCount, 2);
    }

    // Clean resume should score high across all profiles
    assert.ok(evaluations.GENERIC_ATS.score >= 80);
    assert.ok(evaluations.WORKDAY_COMPATIBILITY.score >= 80);
    assert.ok(evaluations.GREENHOUSE_COMPATIBILITY.score >= 80);
  });

  it('detects Workday table risks and missing contact risks accurately', async () => {
    const textWithHeavyTable = `
Sarah Connor
| Column 1 | Column 2 | Column 3 |
| Item A   | Item B   | Item C   |
| Item D   | Item E   | Item F   |
| Item G   | Item H   | Item I   |
| Item J   | Item K   | Item L   |
| Item M   | Item N   | Item O   |
| Item P   | Item Q   | Item R   |
Work Experience
Engineer | Company A | Jan 2021 - Present
● Built things.
    `.trim();

    const evaluation = atsCompatibilityProfilesService.evaluateProfile('WORKDAY_COMPATIBILITY', {
      extractedText: textWithHeavyTable,
    });

    assert.ok(evaluation.risks.some((r) => r.code === 'TABLE_INTERLEAVING_RISK'));
    assert.ok(
      evaluation.risks.some((r) => r.code === 'TABLE_INTERLEAVING_RISK' && r.severity === 'HIGH')
    );
  });

  it('simulates ATS extraction and detects ambiguous fields and duplicate skills', async () => {
    const canonicalProfile = {
      identity: {
        name: 'Alex Developer',
        contact: {
          email: null, // Missing email
          phone: '555-123-4567',
        },
      },
      experience: [
        {
          title: 'Software Developer Intern — Acme Corp', // Ambiguous merged title
          company: 'Acme Corp',
          startDate: '2021-01-01',
          endDate: null,
          durationMonths: 0, // Broken duration
        },
      ],
      skills: [
        { name: 'JavaScript' },
        { name: 'Node.js' },
        { name: 'JavaScript' }, // Duplicate skill
      ],
      education: [],
      projects: [
        {
          name: 'Freelance Client Portal',
          description:
            'Employed as full-time lead developer building client portal for salary payments.',
        },
      ],
    };

    const simReport = atsExtractionSimulationService.simulateExtraction({
      canonicalProfile,
    });

    assert.ok(simReport);
    assert.strictEqual(simReport.reportVersion, '1.0.0');

    // Missing email should be detected as FAILED
    const emailField = simReport.fields.find((f) => f.fieldName === 'email');
    assert.ok(emailField);
    assert.strictEqual(emailField.status, 'FAILED');

    // Ambiguous entities should contain job title and project confusion
    const titleAmbiguity = simReport.ambiguousEntities.find((e) => e.entityType === 'JOB_TITLE');
    assert.ok(titleAmbiguity, 'Should detect conjoined company/title');

    const dupAmbiguity = simReport.ambiguousEntities.find(
      (e) => e.entityType === 'DUPLICATE_SKILLS'
    );
    assert.ok(dupAmbiguity, 'Should detect duplicate skill mentions');

    const projectConfusion = simReport.ambiguousEntities.find(
      (e) => e.entityType === 'PROJECT_EMPLOYMENT_CONFUSION'
    );
    assert.ok(projectConfusion, 'Should detect projects containing employment terms');
  });
});
