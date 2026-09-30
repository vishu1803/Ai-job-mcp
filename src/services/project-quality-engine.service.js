/**
 * @file Project Quality Engine Service (Phase 8)
 *
 * Implements deep engineering evaluation of software projects:
 * 1. Categorizes project tier:
 *    - TUTORIAL (e.g. to-do app, calculator, tutorial clones)
 *    - BASIC_CRUD (standard REST endpoints over single table)
 *    - UTILITY (scripts, small CLI tools)
 *    - INTERMEDIATE (multi-model DB, authentication, unit tests)
 *    - ADVANCED (microservices, caching, queueing, third-party integrations)
 *    - PRODUCTION_GRADE (CI/CD, automated tests, Docker/K8s, metrics, security policies)
 * 2. Evaluates 5 technical dimensions (Architecture, Production Readiness, Complexity, Quality, Adoption)
 * 3. Enforces anti-inflation guards:
 *    - Technology Quantity != Engineering Depth (penalizes keyword-stuffed tutorial projects)
 *    - Hard score caps on tutorial and basic CRUD projects
 */

import { z } from 'zod';
import { ConfidenceScoreSchema } from '../domain/candidate/candidate.schemas.js';

export const ProjectTierEnum = z.enum([
  'TUTORIAL',
  'BASIC_CRUD',
  'UTILITY',
  'INTERMEDIATE',
  'ADVANCED',
  'PRODUCTION_GRADE',
]);

export const ProjectEvaluationSchema = z
  .object({
    projectId: z.string(),
    projectName: z.string(),
    tier: ProjectTierEnum,
    score: z.number().min(0).max(100),
    confidence: ConfidenceScoreSchema,
    dimensions: z.object({
      architecturalDepth: z.number().min(0).max(25),
      productionReadiness: z.number().min(0).max(25),
      technicalComplexity: z.number().min(0).max(20),
      documentationAndTesting: z.number().min(0).max(15),
      realWorldAdoption: z.number().min(0).max(15),
    }),
    detectedSignals: z.array(z.string()).default([]),
    penalties: z.array(z.string()).default([]),
    explanation: z.string(),
  })
  .strict();

export const CandidateProjectsReportSchema = z
  .object({
    overallProjectScore: z.number().min(0).max(100),
    topProjectTier: ProjectTierEnum,
    evaluations: z.array(ProjectEvaluationSchema),
    summary: z.string(),
  })
  .strict();

export class ProjectQualityEngineService {
  /**
   * Evaluates a list of candidate projects on engineering depth and production quality.
   *
   * @param {Array<object>} projects List of projects from canonical profile or repository analysis
   * @returns {object} Validated CandidateProjectsReport
   */
  evaluateProjects(projects = []) {
    if (!Array.isArray(projects) || projects.length === 0) {
      return CandidateProjectsReportSchema.parse({
        overallProjectScore: 0.0,
        topProjectTier: 'TUTORIAL',
        evaluations: [],
        summary: 'No projects evaluated.',
      });
    }

    const evaluations = projects.map((p) => this.evaluateSingleProject(p));

    // Sort descending by score
    evaluations.sort((a, b) => b.score - a.score);

    // Aggregate overall score using decaying top-3 formula (60% / 30% / 10%)
    let overallScore = 0.0;
    if (evaluations[0]) overallScore += evaluations[0].score * 0.6;
    if (evaluations[1]) overallScore += evaluations[1].score * 0.3;
    if (evaluations[2]) overallScore += evaluations[2].score * 0.1;

    // Normalize if fewer than 3 projects
    const totalWeights = evaluations.length === 1 ? 0.6 : evaluations.length === 2 ? 0.9 : 1.0;
    overallScore = Math.round((overallScore / totalWeights) * 100) / 100;

    const topProjectTier = evaluations[0] ? evaluations[0].tier : 'TUTORIAL';

    return CandidateProjectsReportSchema.parse({
      overallProjectScore: overallScore,
      topProjectTier,
      evaluations,
      summary: `Evaluated ${evaluations.length} projects. Top project is rated '${topProjectTier}' with a quality score of ${evaluations[0]?.score || 0}/100.`,
    });
  }

  /**
   * Evaluates a single project deterministically.
   *
   * @param {object} project
   * @returns {object} Validated ProjectEvaluation
   */
  evaluateSingleProject(project) {
    const name = project.name || project.title || 'Untitled Project';
    const description = project.description || '';
    const bullets = Array.isArray(project.bullets) ? project.bullets.join(' ') : '';
    const rawTechnologies = Array.isArray(project.technologies) ? project.technologies : [];
    const text = `${name} ${description} ${bullets} ${rawTechnologies.join(' ')}`.toLowerCase();

    const detectedSignals = [];
    const penalties = [];

    // 1. Detect Architectural Signals
    let archDepth = 5.0; // Baseline
    if (/\b(?:postgresql|mysql|mongodb|database|sql|orm|drizzle|prisma)\b/i.test(text)) {
      archDepth += 5.0;
      detectedSignals.push('DATA_PERSISTENCE');
    }
    if (/\b(?:redis|memcached|cache|caching)\b/i.test(text)) {
      archDepth += 5.0;
      detectedSignals.push('DISTRIBUTED_CACHING');
    }
    if (/\b(?:kafka|rabbitmq|sqs|queue|message\s+broker|event-driven)\b/i.test(text)) {
      archDepth += 5.0;
      detectedSignals.push('ASYNC_EVENT_STREAMING');
    }
    if (/\b(?:jwt|oauth|authentication|rbac|auth0|security|encryption)\b/i.test(text)) {
      archDepth += 5.0;
      detectedSignals.push('AUTHENTICATION_AND_SECURITY');
    }
    archDepth = Math.min(25.0, archDepth);

    // 2. Detect Production Readiness Signals
    let prodReadiness = 0.0;
    if (/\b(?:docker|container|dockerfile|docker-compose)\b/i.test(text)) {
      prodReadiness += 6.0;
      detectedSignals.push('CONTAINERIZATION');
    }
    if (/\b(?:kubernetes|k8s|helm|terraform)\b/i.test(text)) {
      prodReadiness += 6.0;
      detectedSignals.push('ORCHESTRATION_AND_IAC');
    }
    if (/\b(?:ci\/cd|github\s+actions|jenkins|pipeline|automated\s+deployment)\b/i.test(text)) {
      prodReadiness += 7.0;
      detectedSignals.push('CI_CD_AUTOMATION');
    }
    if (
      /\b(?:prometheus|grafana|opentelemetry|datadog|structured\s+logging|sentry)\b/i.test(text)
    ) {
      prodReadiness += 6.0;
      detectedSignals.push('OBSERVABILITY');
    }
    prodReadiness = Math.min(25.0, prodReadiness);

    // 3. Technical Complexity
    let complexity = 5.0;
    if (
      /\b(?:consensus|raft|paxos|sharding|distributed|microservices|multithreading|concurrency)\b/i.test(
        text
      )
    ) {
      complexity += 10.0;
      detectedSignals.push('DISTRIBUTED_SYSTEMS_COMPLEXITY');
    }
    if (/\b(?:compiler|ast|parser|webassembly|webrtc|socket|real-time|graphql)\b/i.test(text)) {
      complexity += 5.0;
      detectedSignals.push('SPECIALIZED_TECHNICAL_DOMAIN');
    }
    complexity = Math.min(20.0, complexity);

    // 4. Documentation & Testing
    let docTest = 3.0;
    if (/\b(?:unit\s+test|integration\s+test|e2e|jest|mocha|vitest|pytest|cypress)\b/i.test(text)) {
      docTest += 7.0;
      detectedSignals.push('AUTOMATED_TEST_SUITE');
    }
    if (
      /\b(?:openapi|swagger|documentation|readme|docs)\b/i.test(text) ||
      project.url ||
      project.githubUrl
    ) {
      docTest += 5.0;
      detectedSignals.push('DOCUMENTATION_AND_SPECS');
    }
    docTest = Math.min(15.0, docTest);

    // 5. Real-World Adoption
    let adoption = 0.0;
    if (project.url && !project.url.includes('localhost')) {
      adoption += 8.0;
      detectedSignals.push('LIVE_PRODUCTION_DEPLOYMENT');
    }
    if (project.githubUrl) {
      adoption += 4.0;
      detectedSignals.push('PUBLIC_SOURCE_AVAILABILITY');
    }
    if (/\b(?:\d+[\s+]*users|\d+[\s+]*downloads|starred|npm\s+package)\b/i.test(text)) {
      adoption += 3.0;
      detectedSignals.push('VERIFIABLE_ADOPTION_TRACTION');
    }
    adoption = Math.min(15.0, adoption);

    // Determine Base Tier
    let tier = 'INTERMEDIATE';
    if (/\btodo|calculator|tic-tac-toe|weather\s+app|counter\b/i.test(text)) {
      tier = 'TUTORIAL';
    } else if (prodReadiness >= 15.0 && (archDepth >= 15.0 || complexity >= 15.0)) {
      tier = 'PRODUCTION_GRADE';
    } else if (archDepth >= 15.0 || complexity >= 15.0) {
      tier = 'ADVANCED';
    } else if (/\bcrud|blog|simple\s+api\b/i.test(text)) {
      tier = 'BASIC_CRUD';
    } else if (/\bscript|cli|tool|utility|scraper\b/i.test(text)) {
      tier = 'UTILITY';
    }

    let rawScore = archDepth + prodReadiness + complexity + docTest + adoption;

    // Anti-Inflation Guard 1: Technology Quantity vs Engineering Depth
    // Listing > 8 technologies while lacking architectural signals indicates keyword stuffing
    if (rawTechnologies.length > 8 && detectedSignals.length < 3) {
      rawScore -= 15.0;
      penalties.push(
        'Keyword Stuffing Penalty: Listed > 8 technologies without demonstrable architectural signals.'
      );
    }

    // Anti-Inflation Guard 2: Tier Hard Score Caps
    if (tier === 'TUTORIAL' && rawScore > 35.0) {
      rawScore = 35.0;
      penalties.push('Tutorial Project Cap: Score bounded at 35.0 maximum.');
    } else if (tier === 'BASIC_CRUD' && rawScore > 55.0) {
      rawScore = 55.0;
      penalties.push('Basic CRUD Cap: Score bounded at 55.0 maximum.');
    }

    const finalScore = Math.round(Math.min(100.0, Math.max(0.0, rawScore)) * 100) / 100;

    return ProjectEvaluationSchema.parse({
      projectId:
        project.id || project.projectId || 'proj-' + Math.random().toString(36).substring(2, 9),
      projectName: name,
      tier,
      score: finalScore,
      confidence: 0.94,
      dimensions: {
        architecturalDepth: Math.round(archDepth * 100) / 100,
        productionReadiness: Math.round(prodReadiness * 100) / 100,
        technicalComplexity: Math.round(complexity * 100) / 100,
        documentationAndTesting: Math.round(docTest * 100) / 100,
        realWorldAdoption: Math.round(adoption * 100) / 100,
      },
      detectedSignals,
      penalties,
      explanation: `Project '${name}' classified as '${tier}' (${finalScore}/100) with ${detectedSignals.length} engineering signals verified.`,
    });
  }
}

export const projectQualityEngineService = new ProjectQualityEngineService();
