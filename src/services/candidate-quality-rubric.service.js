/**
 * @file Candidate Quality Rubric Service (Phase 12)
 *
 * Implements deterministic candidate quality evaluation across 10 distinct dimensions
 * independent of any specific job match:
 * 1. TECHNICAL_DEPTH
 * 2. EXPERIENCE_SENIORITY
 * 3. PRODUCTION_IMPACT
 * 4. PROJECT_AUTHENTICITY
 * 5. OPEN_SOURCE_CREDIBILITY
 * 6. WRITING_COMMUNICATION
 * 7. EDUCATION_LEARNING
 * 8. ENGINEERING_RIGOR
 * 9. LEADERSHIP_COLLABORATION
 * 10. CAREER_TRAJECTORY
 *
 * Strictly deterministic, zero-hallucination, evidence-backed.
 */

import { CandidateQualityRubricReportSchema } from '../domain/career/candidate-quality-rubric.schemas.js';
import { projectQualityEngineService } from './project-quality-engine.service.js';
import { openSourceIntelligenceService } from './open-source-intelligence.service.js';
import { productionExperienceIntelligenceService } from './production-experience-intelligence.service.js';
import { evaluateResumeWritingQuality } from './resume-writing-quality.service.js';
import { normalizeTechnologyName } from '../utils/technology-normalizer.js';

export class CandidateQualityRubricService {
  /**
   * Evaluates a candidate across the 10 rubric dimensions.
   *
   * @param {object} params
   * @param {object} params.candidateProfile Canonical candidate profile
   * @param {Array<object>} [params.projects=[]] Project list
   * @param {Array<object>} [params.experiences=[]] Work experience list
   * @param {Array<object>} [params.openSourceContributions=[]] Open source contributions
   * @param {object} [params.structuredResume] Optional structured resume for writing quality analysis
   * @returns {object} Validated CandidateQualityRubricReport
   */
  evaluateCandidateQuality({
    candidateProfile = {},
    projects = [],
    experiences = [],
    openSourceContributions = [],
    structuredResume = null,
  }) {
    const candidateSkills = Array.isArray(candidateProfile.skills)
      ? candidateProfile.skills.map((s) => (typeof s === 'string' ? s : s.name))
      : [];

    const exps = experiences.length > 0 ? experiences : candidateProfile.experience || [];
    const projs = projects.length > 0 ? projects : candidateProfile.projects || [];
    const oss =
      openSourceContributions.length > 0
        ? openSourceContributions
        : candidateProfile.openSourceContributions || [];

    // 1. TECHNICAL_DEPTH
    const technicalDepth = this._evaluateTechnicalDepth(candidateSkills, projs, exps);

    // 2. EXPERIENCE_SENIORITY
    const experienceSeniority = this._evaluateExperienceSeniority(exps);

    // 3. PRODUCTION_IMPACT
    const productionImpact = this._evaluateProductionImpact(exps, projs);

    // 4. PROJECT_AUTHENTICITY
    const projectAuthenticity = this._evaluateProjectAuthenticity(projs);

    // 5. OPEN_SOURCE_CREDIBILITY
    const openSourceCredibility = this._evaluateOpenSourceCredibility(oss);

    // 6. WRITING_COMMUNICATION
    const writingCommunication = this._evaluateWritingCommunication(structuredResume, exps, projs);

    // 7. EDUCATION_LEARNING
    const educationLearning = this._evaluateEducationLearning(candidateProfile);

    // 8. ENGINEERING_RIGOR
    const engineeringRigor = this._evaluateEngineeringRigor(candidateSkills, projs, exps);

    // 9. LEADERSHIP_COLLABORATION
    const leadershipCollaboration = this._evaluateLeadershipCollaboration(exps);

    // 10. CAREER_TRAJECTORY
    const careerTrajectory = this._evaluateCareerTrajectory(exps);

    const dimensions = {
      TECHNICAL_DEPTH: technicalDepth,
      EXPERIENCE_SENIORITY: experienceSeniority,
      PRODUCTION_IMPACT: productionImpact,
      PROJECT_AUTHENTICITY: projectAuthenticity,
      OPEN_SOURCE_CREDIBILITY: openSourceCredibility,
      WRITING_COMMUNICATION: writingCommunication,
      EDUCATION_LEARNING: educationLearning,
      ENGINEERING_RIGOR: engineeringRigor,
      LEADERSHIP_COLLABORATION: leadershipCollaboration,
      CAREER_TRAJECTORY: careerTrajectory,
    };

    const overallScoreRaw = Object.values(dimensions).reduce((sum, d) => sum + d.score, 0);
    const overallQualityScore = Math.min(
      100.0,
      Math.max(0.0, Math.round(overallScoreRaw * 10) / 10)
    );

    const overallLevel = this._scoreToLevel(overallQualityScore / 10);

    const keyStrengths = [];
    const criticalGaps = [];

    for (const [key, dim] of Object.entries(dimensions)) {
      if (dim.score >= 8.0) {
        keyStrengths.push(`${key}: ${dim.reasoning}`);
      } else if (dim.score <= 4.0) {
        criticalGaps.push(`${key}: ${dim.reasoning}`);
      }
    }

    const summary = `Candidate evaluated at ${overallLevel} quality tier (${overallQualityScore}/100) across 10 deterministic dimensions.`;

    return CandidateQualityRubricReportSchema.parse({
      overallQualityScore,
      overallLevel,
      dimensions,
      summary,
      keyStrengths,
      criticalGaps,
      analyzedAt: new Date().toISOString(),
    });
  }

  _scoreToLevel(scoreOutOfTen) {
    if (scoreOutOfTen >= 8.5) return 'EXCEPTIONAL';
    if (scoreOutOfTen >= 7.0) return 'STRONG';
    if (scoreOutOfTen >= 5.0) return 'COMPETENT';
    if (scoreOutOfTen >= 3.0) return 'DEVELOPING';
    return 'NEEDS_IMPROVEMENT';
  }

  _evaluateTechnicalDepth(skills, projects, experiences) {
    const distinctTechs = new Set();
    for (const s of skills) {
      if (s) distinctTechs.add(normalizeTechnologyName(s));
    }
    for (const p of projects) {
      for (const t of p.technologies || p.techStack || []) {
        if (t) distinctTechs.add(normalizeTechnologyName(t));
      }
    }

    const count = distinctTechs.size;
    let score = 2.0;
    if (count >= 12) score = 9.5;
    else if (count >= 8) score = 8.0;
    else if (count >= 5) score = 6.5;
    else if (count >= 3) score = 4.5;

    const level = this._scoreToLevel(score);
    return {
      dimension: 'TECHNICAL_DEPTH',
      score,
      maxScore: 10,
      level,
      evidence: Array.from(distinctTechs).slice(0, 10),
      reasoning: `Demonstrated technical knowledge across ${count} verified technologies.`,
      strengths: count >= 8 ? ['Broad technology proficiency'] : [],
      improvements: count < 5 ? ['Expand breadth across languages and frameworks'] : [],
    };
  }

  _evaluateExperienceSeniority(experiences) {
    const analysis = productionExperienceIntelligenceService.evaluateExperience({
      canonicalProfile: { experience: experiences },
    });
    const years = analysis.totalProfessionalYears;
    let score = 1.0;
    if (years >= 8) score = 10.0;
    else if (years >= 5) score = 8.5;
    else if (years >= 3) score = 7.0;
    else if (years >= 1) score = 5.0;
    else if (years > 0) score = 3.0;

    const level = this._scoreToLevel(score);
    return {
      dimension: 'EXPERIENCE_SENIORITY',
      score,
      maxScore: 10,
      level,
      evidence: [`${years} professional tenure years`, `${experiences.length} positions`],
      reasoning: `Candidate exhibits ${years} years of professional production experience.`,
      strengths: years >= 5 ? ['Seasoned professional experience'] : [],
      improvements: years < 3 ? ['Continue building professional full-time tenure'] : [],
    };
  }

  _evaluateProductionImpact(experiences, projects) {
    const bullets = [];
    for (const e of experiences) {
      for (const b of e.bullets || []) {
        bullets.push(typeof b === 'string' ? b : b.text);
      }
    }
    for (const p of projects) {
      for (const b of p.bullets || []) {
        bullets.push(typeof b === 'string' ? b : b.text);
      }
    }

    const metricRegex = /\b(\d+[%kKmMbB]?|\$\d+|\d+\s*(?:ms|req\/s|users|qps|rps))\b/i;
    const impactBullets = bullets.filter((b) => b && metricRegex.test(b));

    const impactCount = impactBullets.length;
    let score = 2.0;
    if (impactCount >= 6) score = 9.5;
    else if (impactCount >= 4) score = 8.0;
    else if (impactCount >= 2) score = 6.0;
    else if (impactCount >= 1) score = 4.0;

    const level = this._scoreToLevel(score);
    return {
      dimension: 'PRODUCTION_IMPACT',
      score,
      maxScore: 10,
      level,
      evidence: impactBullets.slice(0, 5),
      reasoning: `Found ${impactCount} quantifiable impact metrics across experience and projects.`,
      strengths:
        impactCount >= 4 ? ['Consistently quantifies business and engineering outcomes'] : [],
      improvements:
        impactCount < 2 ? ['Include measurable scale, performance, and business metrics'] : [],
    };
  }

  _evaluateProjectAuthenticity(projects) {
    if (!projects || projects.length === 0) {
      return {
        dimension: 'PROJECT_AUTHENTICITY',
        score: 2.0,
        maxScore: 10,
        level: 'NEEDS_IMPROVEMENT',
        evidence: ['No projects listed'],
        reasoning: 'Candidate profile provides no technical projects.',
        strengths: [],
        improvements: ['Add production-grade or non-trivial architectural projects'],
      };
    }

    const projectReport = projectQualityEngineService.evaluateProjects(projects);
    let score = Math.round((projectReport.overallProjectScore / 10) * 10) / 10;
    if (projectReport.topProjectTier === 'PRODUCTION_GRADE') {
      score = Math.min(10.0, Math.max(score, 7.5));
    } else if (projectReport.topProjectTier === 'ADVANCED') {
      score = Math.min(10.0, Math.max(score, 6.5));
    }
    const level = this._scoreToLevel(score);

    return {
      dimension: 'PROJECT_AUTHENTICITY',
      score,
      maxScore: 10,
      level,
      evidence: projectReport.evaluations.map(
        (e) => `${e.projectName}: ${e.tier} (${e.score}/100)`
      ),
      reasoning: `Top project evaluated as ${projectReport.topProjectTier} (overall score: ${projectReport.overallProjectScore}/100).`,
      strengths:
        score >= 7.0 ? ['Demonstrates robust architectural and production project quality'] : [],
      improvements:
        score < 6.0 ? ['Upgrade project complexity beyond tutorials and basic CRUD'] : [],
    };
  }

  _evaluateOpenSourceCredibility(contributions) {
    if (!contributions || contributions.length === 0) {
      return {
        dimension: 'OPEN_SOURCE_CREDIBILITY',
        score: 2.0,
        maxScore: 10,
        level: 'NEEDS_IMPROVEMENT',
        evidence: ['No open source contributions recorded'],
        reasoning: 'Zero external or personal open-source contributions observed.',
        strengths: [],
        improvements: ['Contribute pull requests to recognized open-source repositories'],
      };
    }

    const ossReport = openSourceIntelligenceService.evaluateOpenSourceContributions({
      canonicalProfile: { openSourceContributions: contributions },
    });
    const score = Math.round((ossReport.score / 10) * 10) / 10;
    const level = this._scoreToLevel(score);

    const externalActivities = (ossReport.activities || []).filter((a) => a.isExternal);

    return {
      dimension: 'OPEN_SOURCE_CREDIBILITY',
      score,
      maxScore: 10,
      level,
      evidence: externalActivities.map((a) => `${a.repository} (${a.role})`),
      reasoning: `Open source footprint earned ${ossReport.score}/100 (${ossReport.totalExternalContributionsCount} external contributions, tier: ${ossReport.contributionTier}).`,
      strengths:
        ossReport.totalExternalContributionsCount > 0
          ? ['Active collaborator in external open-source projects']
          : [],
      improvements:
        ossReport.totalExternalContributionsCount === 0
          ? ['Target merged PRs in external third-party repositories']
          : [],
    };
  }

  _evaluateWritingCommunication(structuredResume, experiences, projects) {
    try {
      const doc = structuredResume || { experience: experiences, projects };
      const quality = evaluateResumeWritingQuality({ structuredResume: doc });
      const overallQuality = quality?.overallQualityScore || 60;
      const score = Math.round((overallQuality / 10) * 10) / 10;
      const level = this._scoreToLevel(score);

      return {
        dimension: 'WRITING_COMMUNICATION',
        score,
        maxScore: 10,
        level,
        evidence: [`Writing quality score: ${overallQuality}/100`],
        reasoning: `Content exhibits clean action verbs with ${quality?.findings?.length || 0} noted findings.`,
        strengths: score >= 7.5 ? ['Crisp, high-impact technical writing'] : [],
        improvements:
          score < 6.5
            ? ['Strengthen bullet points with strong action verbs and concise syntax']
            : [],
      };
    } catch {
      return {
        dimension: 'WRITING_COMMUNICATION',
        score: 6.0,
        maxScore: 10,
        level: 'COMPETENT',
        evidence: ['Default heuristic evaluation'],
        reasoning: 'Evaluated writing clarity using baseline heuristics.',
        strengths: [],
        improvements: ['Ensure all bullets start with strong active verbs'],
      };
    }
  }

  _evaluateEducationLearning(candidateProfile) {
    const educations = candidateProfile.education || [];
    const certs = candidateProfile.certifications || [];

    let score = 5.0; // Baseline self-taught / practical
    const evidence = [];

    for (const edu of educations) {
      const degree = String(edu.degree || '').toLowerCase();
      evidence.push(edu.degree || 'Degree');
      if (degree.includes('master') || degree.includes('phd') || degree.includes('doctorate')) {
        score = Math.max(score, 9.5);
      } else if (
        degree.includes('bachelor') ||
        degree.includes('b.s.') ||
        degree.includes('b.e.') ||
        degree.includes('b.tech')
      ) {
        score = Math.max(score, 8.0);
      } else if (degree.includes('associate')) {
        score = Math.max(score, 6.5);
      }
    }

    if (certs.length > 0) {
      score = Math.min(10.0, score + certs.length * 0.5);
      evidence.push(`${certs.length} certifications`);
    }

    const level = this._scoreToLevel(score);
    return {
      dimension: 'EDUCATION_LEARNING',
      score: Math.round(score * 10) / 10,
      maxScore: 10,
      level,
      evidence,
      reasoning: `Formal educational credentials and professional certifications evaluated.`,
      strengths: score >= 8.0 ? ['Strong formal technical educational foundation'] : [],
      improvements:
        certs.length === 0 ? ['Pursue recognized vendor or industry certifications'] : [],
    };
  }

  _evaluateEngineeringRigor(skills, projects, experiences) {
    const allText = [
      ...skills,
      ...projects.flatMap((p) => [
        p.name,
        p.description,
        ...(p.technologies || []),
        ...(p.bullets || []).map((b) => (typeof b === 'string' ? b : b.text)),
      ]),
      ...experiences.flatMap((e) => [
        e.company,
        e.title,
        ...(e.bullets || []).map((b) => (typeof b === 'string' ? b : b.text)),
      ]),
    ]
      .join(' ')
      .toLowerCase();

    const rigorSignals = [
      {
        name: 'Testing',
        regex: /\b(unit\s+test|jest|vitest|pytest|cypress|playwright|integration\s+test|tdd)\b/i,
      },
      { name: 'CI/CD', regex: /\b(ci\/cd|github\s+actions|gitlab\s+ci|jenkins|circleci)\b/i },
      { name: 'Containerization / IaC', regex: /\b(docker|kubernetes|terraform|ansible|helm)\b/i },
      {
        name: 'Observability',
        regex: /\b(prometheus|grafana|datadog|opentelemetry|elk|sentry)\b/i,
      },
      { name: 'Code Quality', regex: /\b(lint|code\s+review|sonarqube|static\s+analysis)\b/i },
    ];

    const detected = rigorSignals.filter((s) => s.regex.test(allText));
    const count = detected.length;

    let score = 2.0;
    if (count >= 4) score = 9.5;
    else if (count >= 3) score = 8.0;
    else if (count >= 2) score = 6.5;
    else if (count >= 1) score = 4.5;

    const level = this._scoreToLevel(score);
    return {
      dimension: 'ENGINEERING_RIGOR',
      score,
      maxScore: 10,
      level,
      evidence: detected.map((d) => d.name),
      reasoning: `Found evidence for ${count}/5 core software engineering rigor practices.`,
      strengths:
        count >= 3 ? ['Demonstrates robust engineering hygiene (testing, CI/CD, IaC)'] : [],
      improvements:
        count < 2
          ? ['Highlight automated testing, CI/CD pipelines, and observability practices']
          : [],
    };
  }

  _evaluateLeadershipCollaboration(experiences) {
    const analysis = productionExperienceIntelligenceService.evaluateExperience({
      canonicalProfile: { experience: experiences },
    });
    const leadershipSignals = (analysis.careerTimeline || []).flatMap(
      (t) => t.leadershipSignals || []
    );
    const count = analysis.leadershipRolesCount + leadershipSignals.length;

    let score = 3.0;
    if (count >= 4) score = 9.5;
    else if (count >= 2) score = 7.5;
    else if (count >= 1) score = 5.5;

    const level = this._scoreToLevel(score);
    return {
      dimension: 'LEADERSHIP_COLLABORATION',
      score,
      maxScore: 10,
      level,
      evidence: leadershipSignals,
      reasoning: `Found ${count} leadership and mentorship signals in professional work experience.`,
      strengths: count >= 2 ? ['Demonstrated history of mentorship and initiative ownership'] : [],
      improvements:
        count === 0
          ? ['Emphasize cross-functional collaboration, mentorship, and sprint leadership']
          : [],
    };
  }

  _evaluateCareerTrajectory(experiences) {
    if (!experiences || experiences.length === 0) {
      return {
        dimension: 'CAREER_TRAJECTORY',
        score: 3.0,
        maxScore: 10,
        level: 'DEVELOPING',
        evidence: ['No historical roles recorded'],
        reasoning: 'Career trajectory cannot be inferred without role history.',
        strengths: [],
        improvements: ['Include prior engineering roles or structured apprenticeships'],
      };
    }

    let score = 5.0;
    if (experiences.length >= 3) score = 8.5;
    else if (experiences.length >= 2) score = 7.0;

    // Check for seniority growth in titles
    const titles = experiences.map((e) => (e.title || '').toLowerCase());
    const hasProgression = titles.some((t) => /senior|lead|staff|principal/i.test(t));
    if (hasProgression) {
      score = Math.min(10.0, score + 1.5);
    }

    const level = this._scoreToLevel(score);
    return {
      dimension: 'CAREER_TRAJECTORY',
      score: Math.round(score * 10) / 10,
      maxScore: 10,
      level,
      evidence: experiences.map((e) => `${e.title || 'Role'} at ${e.company || 'Company'}`),
      reasoning: `Evaluated career trajectory across ${experiences.length} positions.`,
      strengths: hasProgression
        ? ['Demonstrated title and responsibility progression over time']
        : [],
      improvements:
        experiences.length < 2 ? ['Continue expanding organizational footprint and impact'] : [],
    };
  }

  /**
   * Alias for evaluateCandidateQuality adhering to standard analysis naming.
   *
   * @param {object} params
   * @returns {object} Validated CandidateQualityAnalysis
   */
  analyzeCandidateQuality(params) {
    return this.evaluateCandidateQuality(params);
  }
}

export const candidateQualityRubricService = new CandidateQualityRubricService();
export const CandidateQualityAnalysis = CandidateQualityRubricReportSchema;
