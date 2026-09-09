/**
 * @file Unit Tests: P16-001C Authoritative Job -> Skill Selection (Batch 3)
 *
 * Verifies:
 * A. Only candidate-owned skills can be selected (no hallucinated / unowned skills).
 * B. Fabricated job-required skill is never introduced.
 * C. VERIFIED / CORROBORATED evidence is preserved with evidence IDs and truthful provenance.
 * D. CLAIMED provenance is preserved and never upgraded to VERIFIED by a job requirement.
 * E. Backend job prioritizes backend skills (FastAPI, PostgreSQL, Node.js).
 * F. Frontend job prioritizes frontend skills (React, Next.js, Tailwind CSS).
 * G. Category order changes dynamically according to target job relevance.
 * H. Skill order changes dynamically according to target job relevance.
 * I. Hardcoded Flask exclusion no longer controls production behavior (verified Flask is included when relevant).
 * J. Hardcoded category caps (3/3/4/4/3) no longer control selection.
 * K. Irrelevant tooling (ESLint, Cypress, Vite) does not dominate relevant skills.
 * L. Same inputs are 100% deterministic.
 * M. Selected skills are stored in ResumeTailoringPlan with full machine-readable metadata.
 * N. StructuredResumeDocument skill order matches ResumeTailoringPlan.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildStructuredResumeDocument } from '../../src/services/structured-resume.service.js';
import { CandidateArtifactContentService } from '../../src/services/candidate-artifact-content.service.js';

describe('P16-001C: Authoritative Job -> Skill Selection', () => {
  const TENANT_ID = 'eb8b9599-c5bd-496c-b553-0f4575e346b8';
  const CANDIDATE_ID = '930c6a51-e137-4d92-911e-b830418c9912';

  const skillEvidenceIdFastAPI = 'e1111111-1111-4111-8111-111111111111';
  const skillEvidenceIdPostgres = 'e2222222-2222-4222-8222-222222222222';
  const skillEvidenceIdFlask = 'e3333333-3333-4333-8333-333333333333';

  // Comprehensive Candidate Profile Fixture
  const candidateProfile = {
    id: CANDIDATE_ID,
    tenantId: TENANT_ID,
    displayName: 'Morgan Chen',
    email: 'morgan.chen@example.com',
    headline: 'Senior Full-Stack Software Engineer',
    skills: [
      { id: 'sk-1', name: 'Python', slug: 'python', category: 'Languages', provenanceStatus: 'VERIFIED', evidenceCount: 10 },
      { id: 'sk-2', name: 'TypeScript', slug: 'typescript', category: 'Languages', provenanceStatus: 'VERIFIED', evidenceCount: 12 },
      { id: 'sk-3', name: 'FastAPI', slug: 'fastapi', category: 'Backend & APIs', provenanceStatus: 'VERIFIED', evidenceCount: 8, evidenceId: skillEvidenceIdFastAPI },
      { id: 'sk-4', name: 'Node.js', slug: 'node-js', category: 'Backend & APIs', provenanceStatus: 'VERIFIED', evidenceCount: 6 },
      { id: 'sk-5', name: 'PostgreSQL', slug: 'postgresql', category: 'Databases & ORMs', provenanceStatus: 'VERIFIED', evidenceCount: 7, evidenceId: skillEvidenceIdPostgres },
      { id: 'sk-6', name: 'Prisma ORM', slug: 'prisma-orm', category: 'Databases & ORMs', provenanceStatus: 'VERIFIED', evidenceCount: 4 },
      { id: 'sk-7', name: 'Docker', slug: 'docker', category: 'Cloud, DevOps & Systems', provenanceStatus: 'VERIFIED', evidenceCount: 5 },
      { id: 'sk-8', name: 'React', slug: 'react', category: 'Frontend & Web', provenanceStatus: 'VERIFIED', evidenceCount: 9 },
      { id: 'sk-9', name: 'Next.js', slug: 'next-js', category: 'Frontend & Web', provenanceStatus: 'VERIFIED', evidenceCount: 5 },
      { id: 'sk-10', name: 'Tailwind CSS', slug: 'tailwind-css', category: 'Frontend & Web', provenanceStatus: 'VERIFIED', evidenceCount: 6 },
      { id: 'sk-11', name: 'Django', slug: 'django', category: 'Backend & APIs', provenanceStatus: 'CLAIMED', evidenceCount: 0 },
      { id: 'sk-12', name: 'Flask', slug: 'flask', category: 'Backend & APIs', provenanceStatus: 'VERIFIED', evidenceCount: 4, evidenceId: skillEvidenceIdFlask },
      { id: 'sk-13', name: 'AWS', slug: 'aws', category: 'Cloud, DevOps & Systems', provenanceStatus: 'SELF_DECLARED', evidenceCount: 0 },
      { id: 'sk-14', name: 'ESLint', slug: 'eslint', category: 'Developer Tooling', provenanceStatus: 'VERIFIED', evidenceCount: 15 },
      { id: 'sk-15', name: 'Cypress', slug: 'cypress', category: 'Developer Tooling', provenanceStatus: 'VERIFIED', evidenceCount: 3 },
      { id: 'sk-16', name: 'Vite', slug: 'vite', category: 'Developer Tooling', provenanceStatus: 'VERIFIED', evidenceCount: 7 },
    ],
    projects: [
      {
        id: 'proj-1',
        name: 'Distributed Task Processor',
        technologies: ['FastAPI', 'PostgreSQL', 'Docker', 'Python'],
        provenanceStatus: 'VERIFIED',
        evidenceCount: 4,
      },
      {
        id: 'proj-2',
        name: 'Interactive Analytics Dashboard',
        technologies: ['React', 'Next.js', 'Tailwind CSS', 'TypeScript'],
        provenanceStatus: 'VERIFIED',
        evidenceCount: 3,
      },
    ],
  };

  // Contrasting Job 1: Python + FastAPI + PostgreSQL Backend Role
  const backendJob = {
    id: 'job-backend-101',
    title: 'Senior Backend Engineer, Distributed Platforms',
    company: 'CloudScale Inc',
    description: 'Seeking a Backend Engineer to build resilient distributed services using Python, FastAPI, and PostgreSQL.',
    requirements: [
      'Extensive experience building RESTful backend microservices in Python using FastAPI.',
      'Strong relational database design and query optimization with PostgreSQL.',
      'Containerization and deployment with Docker.',
    ],
    skills: ['Python', 'FastAPI', 'PostgreSQL', 'Docker'],
  };

  // Contrasting Job 2: React + TypeScript + Next.js Frontend Role
  const frontendJob = {
    id: 'job-frontend-202',
    title: 'Senior Frontend Engineer, Web Platform',
    company: 'Vercel',
    description: 'Seeking a Frontend Engineer to architect responsive user interfaces using React, Next.js, and TypeScript.',
    requirements: [
      'Advanced frontend architecture using React and Next.js.',
      'Deep fluency with modern TypeScript and responsive UI with Tailwind CSS.',
    ],
    skills: ['React', 'Next.js', 'TypeScript', 'Tailwind CSS'],
  };

  // Job 3: Unowned Technologies (Ruby, Kubernetes, GraphQL)
  const exoticJob = {
    id: 'job-exotic-303',
    title: 'Staff Platform Engineer',
    company: 'Exotic Systems',
    description: 'We require Ruby on Rails, Kubernetes, and GraphQL architecture experience.',
    requirements: [
      'Ruby on Rails microservice development.',
      'Production cluster management on Kubernetes.',
      'Federated GraphQL schemas.',
    ],
    skills: ['Ruby on Rails', 'Kubernetes', 'GraphQL'],
  };

  const contentService = new CandidateArtifactContentService();

  it('Test A: only candidate-owned skills can be selected', () => {
    const { categorizedSkills, selectedSkills } = contentService.selectAndCategorizeSkillsForJob(
      candidateProfile,
      exoticJob
    );

    const allPresentedSkills = Object.values(categorizedSkills).flat();
    const presentedSlugs = selectedSkills.map((s) => s.slug);

    // Candidate has never written Ruby on Rails, so it must not appear
    assert.ok(!allPresentedSkills.includes('Ruby on Rails'), 'Ruby on Rails must NOT be selected');
    assert.ok(!presentedSlugs.includes('ruby-on-rails'), 'ruby-on-rails slug must NOT be selected');
  });

  it('Test B: fabricated job-required skill is never introduced', () => {
    const jobWithFabricated = {
      title: 'COBOL & Solidity Architect',
      description: 'Must have 10 years COBOL and Solidity smart contracts.',
      requirements: ['COBOL', 'Solidity'],
      skills: ['COBOL', 'Solidity'],
    };

    const { categorizedSkills } = contentService.selectAndCategorizeSkillsForJob(
      candidateProfile,
      jobWithFabricated
    );

    const allPresented = Object.values(categorizedSkills).flat();
    assert.ok(!allPresented.includes('COBOL'));
    assert.ok(!allPresented.includes('Solidity'));
  });

  it('Test C: VERIFIED/CORROBORATED evidence is preserved', () => {
    const { selectedSkills, skillAudit } = contentService.selectAndCategorizeSkillsForJob(
      candidateProfile,
      backendJob
    );

    const pgSkill = selectedSkills.find((s) => s.name === 'PostgreSQL');
    assert.ok(pgSkill, 'PostgreSQL must be selected');
    assert.equal(pgSkill.provenanceStatus, 'VERIFIED');
    assert.equal(pgSkill.evidenceId, skillEvidenceIdPostgres);

    const fastApiAudit = skillAudit.find((s) => s.skill === 'FastAPI');
    assert.ok(fastApiAudit, 'FastAPI must be audited');
    assert.equal(fastApiAudit.provenance, 'VERIFIED');
    assert.equal(fastApiAudit.status, 'SELECTED');
  });

  it('Test D: CLAIMED provenance is preserved and not upgraded', () => {
    const jobRequiringDjango = {
      title: 'Django Backend Developer',
      description: 'Requires Django backend experience.',
      requirements: ['Django'],
      skills: ['Django'],
    };

    const { skillAudit, selectedSkills } = contentService.selectAndCategorizeSkillsForJob(
      candidateProfile,
      jobRequiringDjango
    );

    const djangoAudit = skillAudit.find((s) => s.skill === 'Django');
    assert.ok(djangoAudit, 'Django must be audited');
    assert.equal(djangoAudit.provenance, 'CLAIMED', 'Django must remain CLAIMED even when requested by job');

    const djangoSkill = selectedSkills.find((s) => s.name === 'Django');
    if (djangoSkill) {
      assert.notEqual(djangoSkill.provenanceStatus, 'VERIFIED', 'CLAIMED skill must never become VERIFIED');
    }
  });

  it('Test E: Backend job prioritizes backend skills', () => {
    const { categorizedSkills } = contentService.selectAndCategorizeSkillsForJob(
      candidateProfile,
      backendJob
    );

    assert.ok(categorizedSkills['Backend & APIs'], 'Backend & APIs must be present');
    assert.ok(categorizedSkills['Databases & ORMs'], 'Databases & ORMs must be present');
    assert.ok(categorizedSkills['Backend & APIs'].includes('FastAPI'));
    assert.ok(categorizedSkills['Databases & ORMs'].includes('PostgreSQL'));
  });

  it('Test F: Frontend/full-stack job prioritizes frontend skills', () => {
    const { categorizedSkills } = contentService.selectAndCategorizeSkillsForJob(
      candidateProfile,
      frontendJob
    );

    assert.ok(categorizedSkills['Frontend & Web'], 'Frontend & Web must be present');
    assert.ok(categorizedSkills['Frontend & Web'].includes('React'));
    assert.ok(categorizedSkills['Frontend & Web'].includes('Next.js'));
    assert.ok(categorizedSkills['Frontend & Web'].includes('Tailwind CSS'));
  });

  it('Test G: category order changes according to job relevance', () => {
    const backendResult = contentService.selectAndCategorizeSkillsForJob(
      candidateProfile,
      backendJob
    );
    const frontendResult = contentService.selectAndCategorizeSkillsForJob(
      candidateProfile,
      frontendJob
    );

    const backendCatOrder = backendResult.skillCategoryOrder;
    const frontendCatOrder = frontendResult.skillCategoryOrder;

    // In Backend job, Backend & APIs or Databases & ORMs must appear before Frontend & Web
    const backendIdx = backendCatOrder.indexOf('Backend & APIs');
    const frontendIdxInBackend = backendCatOrder.indexOf('Frontend & Web');
    assert.ok(backendIdx !== -1, 'Backend & APIs must be in category order for backend job');
    if (frontendIdxInBackend !== -1) {
      assert.ok(backendIdx < frontendIdxInBackend, 'Backend & APIs must precede Frontend & Web for backend job');
    }

    // In Frontend job, Frontend & Web must appear before Backend & APIs
    const frontendIdxInFrontend = frontendCatOrder.indexOf('Frontend & Web');
    const backendIdxInFrontend = frontendCatOrder.indexOf('Backend & APIs');
    assert.ok(frontendIdxInFrontend !== -1, 'Frontend & Web must be in category order for frontend job');
    if (backendIdxInFrontend !== -1) {
      assert.ok(frontendIdxInFrontend < backendIdxInFrontend, 'Frontend & Web must precede Backend & APIs for frontend job');
    }
  });

  it('Test H: skill order changes according to job relevance', () => {
    const backendResult = contentService.selectAndCategorizeSkillsForJob(
      candidateProfile,
      backendJob
    );
    const frontendResult = contentService.selectAndCategorizeSkillsForJob(
      candidateProfile,
      frontendJob
    );

    // In backend job, FastAPI ranks high; in frontend job, React ranks high
    const fastApiBackendRank = backendResult.selectedSkills.find((s) => s.name === 'FastAPI')?.order || 999;
    const reactBackendRank = backendResult.selectedSkills.find((s) => s.name === 'React')?.order || 999;
    assert.ok(fastApiBackendRank < reactBackendRank, 'FastAPI must outrank React for backend role');

    const reactFrontendRank = frontendResult.selectedSkills.find((s) => s.name === 'React')?.order || 999;
    const fastApiFrontendRank = frontendResult.selectedSkills.find((s) => s.name === 'FastAPI')?.order || 999;
    assert.ok(reactFrontendRank < fastApiFrontendRank, 'React must outrank FastAPI for frontend role');
  });

  it('Test I: hardcoded Flask exclusion no longer controls production behavior', () => {
    const flaskJob = {
      title: 'Python Flask Backend Engineer',
      description: 'Microservice development with Python, Flask, and PostgreSQL.',
      requirements: ['Python', 'Flask', 'PostgreSQL'],
      skills: ['Python', 'Flask', 'PostgreSQL'],
    };

    // Candidate has verified Flask evidence
    const { categorizedSkills, skillAudit } = contentService.selectAndCategorizeSkillsForJob(
      candidateProfile,
      flaskJob
    );

    const flaskAudit = skillAudit.find((s) => s.skill === 'Flask');
    assert.ok(flaskAudit, 'Flask must be audited');
    assert.equal(flaskAudit.provenance, 'VERIFIED');
    assert.equal(flaskAudit.status, 'SELECTED', 'Verified Flask must be SELECTED when requested by job');

    const backendSkills = categorizedSkills['Backend & APIs'] || [];
    assert.ok(backendSkills.includes('Flask'), 'Flask must be present in Backend & APIs');
  });

  it('Test J: hardcoded category caps no longer control selection', () => {
    // Candidate with 5 verified backend skills
    const richBackendCandidate = {
      ...candidateProfile,
      skills: [
        { name: 'FastAPI', provenanceStatus: 'VERIFIED', evidenceCount: 10 },
        { name: 'Node.js', provenanceStatus: 'VERIFIED', evidenceCount: 8 },
        { name: 'Express.js', provenanceStatus: 'VERIFIED', evidenceCount: 6 },
        { name: 'NestJS', provenanceStatus: 'VERIFIED', evidenceCount: 7 },
        { name: 'GraphQL', provenanceStatus: 'VERIFIED', evidenceCount: 5 },
      ],
      projects: [],
    };

    const wideBackendJob = {
      title: 'Senior Backend Architect',
      description: 'Broad backend architecture requiring FastAPI, Node.js, Express, NestJS, and GraphQL.',
      requirements: ['FastAPI', 'Node.js', 'Express.js', 'NestJS', 'GraphQL'],
      skills: ['FastAPI', 'Node.js', 'Express.js', 'NestJS', 'GraphQL'],
    };

    const { categorizedSkills } = contentService.selectAndCategorizeSkillsForJob(
      richBackendCandidate,
      wideBackendJob,
      { maxPerCategory: 6 }
    );

    const backendSkills = categorizedSkills['Backend & APIs'] || [];
    // Previously hardcoded cap was 4. Now 5 skills can survive.
    assert.ok(backendSkills.length >= 5, `Expected at least 5 backend skills, received ${backendSkills.length}`);
    assert.ok(backendSkills.includes('GraphQL'));
  });

  it('Test K: irrelevant tooling does not dominate relevant skills', () => {
    const { categorizedSkills, skillAudit } = contentService.selectAndCategorizeSkillsForJob(
      candidateProfile,
      backendJob
    );

    const allSkills = Object.values(categorizedSkills).flat();
    assert.ok(!allSkills.includes('ESLint'), 'ESLint must not dominate');
    assert.ok(!allSkills.includes('Cypress'), 'Cypress must not dominate');
    assert.ok(!allSkills.includes('Vite'), 'Vite must not dominate');

    const eslintAudit = skillAudit.find((s) => s.skill === 'ESLint');
    assert.ok(eslintAudit);
    assert.equal(eslintAudit.status, 'OMITTED');
    assert.ok(eslintAudit.reason.includes('tooling noise'));
  });

  it('Test L: same inputs are deterministic', () => {
    const run1 = contentService.selectAndCategorizeSkillsForJob(candidateProfile, backendJob);
    const run2 = contentService.selectAndCategorizeSkillsForJob(candidateProfile, backendJob);

    assert.deepEqual(run1.categorizedSkills, run2.categorizedSkills);
    assert.deepEqual(run1.skillCategoryOrder, run2.skillCategoryOrder);
    assert.deepEqual(run1.selectedSkillSlugs, run2.selectedSkillSlugs);
    assert.deepEqual(run1.selectedSkills, run2.selectedSkills);
    assert.deepEqual(run1.skillAudit, run2.skillAudit);
  });

  it('Test M: selected skills are stored in ResumeTailoringPlan', () => {
    const doc = buildStructuredResumeDocument({
      candidateProfile,
      jobPosting: backendJob,
    });

    const plan = doc.tailoringPlan;
    assert.ok(Array.isArray(plan.selectedSkills), 'plan.selectedSkills must be an array');
    assert.ok(plan.selectedSkills.length > 0, 'plan.selectedSkills must not be empty');

    // Each selected skill has required schema fields
    for (const skill of plan.selectedSkills) {
      assert.ok(skill.slug, 'Skill must have a slug');
      assert.ok(skill.name, 'Skill must have a name');
      assert.ok(skill.category, 'Skill must have a category');
      assert.ok(skill.provenanceStatus, 'Skill must have a provenanceStatus');
      assert.ok(typeof skill.relevanceScore === 'number', 'Skill must have numeric relevanceScore');
    }

    assert.ok(Array.isArray(plan.skillCategoryOrder), 'plan.skillCategoryOrder must be an array');
    assert.ok(plan.skillCategoryOrder.length > 0, 'plan.skillCategoryOrder must not be empty');
  });

  it('Test N: StructuredResumeDocument skill order matches the tailoring plan', () => {
    const doc = buildStructuredResumeDocument({
      candidateProfile,
      jobPosting: backendJob,
    });

    const plan = doc.tailoringPlan;
    const docCategories = doc.skills.categories.map((c) => c.categoryName);

    // Verify document category order strictly matches tailoring plan skillCategoryOrder
    for (let i = 0; i < docCategories.length; i++) {
      assert.equal(docCategories[i], plan.skillCategoryOrder[i], `Category at index ${i} must match plan`);
    }

    // Verify skills within categories are ordered consistently with plan.selectedSkills
    const allDocSkills = doc.skills.categories.flatMap((c) => c.skills.map((s) => s.slug));
    const allPlanSkills = plan.selectedSkills.map((s) => s.slug);

    assert.deepEqual(allDocSkills, allPlanSkills, 'Document skill slugs must match tailoring plan slugs in exact order');
  });
});
