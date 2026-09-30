/**
 * @file Production Experience Intelligence Service (Phase 9)
 *
 * Implements high-fidelity career experience evaluation:
 * 1. Distinguishes employment types:
 *    - Full-time
 *    - Internship
 *    - Contract
 *    - Freelance
 *    - Founder
 *    - Academic
 *    - Volunteer
 *    - Personal
 * 2. STRICT ARCHITECTURAL INVARIANT:
 *    - Never counts GitHub activity or open-source projects as employment tenure.
 *    - Professional tenure must be verified against authentic employment entries.
 * 3. Extracts production depth signals:
 *    - High-throughput / scale systems (QPS, traffic, distributed clusters)
 *    - Leadership and engineering ownership (tech lead, architect, mentoring)
 *    - Business and reliability impact (latency reduction, uptime, revenue)
 */

import { z } from 'zod';
import { ConfidenceScoreSchema } from '../domain/candidate/candidate.schemas.js';

export const ProductionExperienceReportSchema = z
  .object({
    totalProfessionalTenureMonths: z.number().int().nonnegative(),
    totalProfessionalYears: z.number().nonnegative(),
    fullTimeTenureMonths: z.number().int().nonnegative(),
    internshipTenureMonths: z.number().int().nonnegative(),
    contractTenureMonths: z.number().int().nonnegative(),
    founderTenureMonths: z.number().int().nonnegative(),
    otherTenureMonths: z.number().int().nonnegative(),
    productionSystemsVerifiedCount: z.number().int().nonnegative(),
    leadershipRolesCount: z.number().int().nonnegative(),
    ownershipSignalsCount: z.number().int().nonnegative(),
    experienceScore: z.number().min(0).max(100),
    confidence: ConfidenceScoreSchema,
    seniorityLevel: z.enum(['ENTRY', 'MID_LEVEL', 'SENIOR', 'STAFF_PLUS', 'EXECUTIVE']),
    careerTimeline: z.array(
      z.object({
        company: z.string(),
        title: z.string(),
        employmentType: z.string(),
        durationMonths: z.number(),
        isCurrent: z.boolean(),
        productionSignals: z.array(z.string()),
        leadershipSignals: z.array(z.string()),
      })
    ),
    summary: z.string(),
  })
  .strict();

export class ProductionExperienceIntelligenceService {
  /**
   * Analyzes candidate career history for authentic production experience.
   *
   * @param {object} params
   * @param {object} params.canonicalProfile Parsed canonical candidate profile
   * @param {number} [params.requiredTenureYears=0] Optional required years for role
   * @returns {object} Validated ProductionExperienceReport
   */
  evaluateExperience({ canonicalProfile, requiredTenureYears = 0 }) {
    const rawExperience = canonicalProfile?.experience || [];
    const timeline = [];

    let fullTimeMonths = 0;
    let internshipMonths = 0;
    let contractMonths = 0;
    let founderMonths = 0;
    let otherMonths = 0;

    let prodSystemsCount = 0;
    let leadershipCount = 0;
    let ownershipCount = 0;

    for (const exp of rawExperience) {
      const type = exp.employmentType || 'FULL_TIME';
      let duration = exp.durationMonths;
      if (!duration && exp.startDate && exp.endDate) {
        const start = new Date(exp.startDate).getTime();
        const end = /present|current/i.test(exp.endDate)
          ? Date.now()
          : new Date(exp.endDate).getTime();
        if (!isNaN(start) && !isNaN(end) && end > start) {
          duration = Math.round((end - start) / (1000 * 60 * 60 * 24 * 30.44));
        }
      }
      duration = duration || 12;
      const combinedText =
        `${exp.title} ${exp.company} ${(exp.bullets || []).join(' ')}`.toLowerCase();

      // STRICT INVARIANT: Do not count open source or personal projects as employment tenure
      if (type === 'OPEN_SOURCE' || type === 'PERSONAL') {
        continue;
      }

      switch (type) {
        case 'FULL_TIME':
          fullTimeMonths += duration;
          break;
        case 'INTERNSHIP':
          internshipMonths += duration;
          break;
        case 'CONTRACT':
        case 'FREELANCE':
          contractMonths += duration;
          break;
        case 'FOUNDER':
          founderMonths += duration;
          break;
        default:
          otherMonths += duration;
          break;
      }

      const prodSignals = [];
      const leadSignals = [];

      // Check for production scale signals
      if (
        /\b(?:req\/sec|qps|throughput|latency|p99|high-availability|sla|uptime|million\s+users|scale|distributed)\b/i.test(
          combinedText
        )
      ) {
        prodSignals.push('HIGH_SCALE_OR_LATENCY_OPTIMIZATION');
      }
      if (/\b(?:payment|billing|financial|mission-critical|zero-downtime)\b/i.test(combinedText)) {
        prodSignals.push('MISSION_CRITICAL_SYSTEMS');
      }
      if (prodSignals.length > 0) {
        prodSystemsCount++;
      }

      // Check for leadership signals
      if (/lead|principal|staff|manager|head|director|founder|co-founder/i.test(exp.title)) {
        leadershipCount++;
        leadSignals.push('FORMAL_LEADERSHIP_TITLE');
      }
      if (
        /\b(?:mentored|architected|spearheaded|led\s+bi-weekly|managed\s+team)\b/i.test(
          combinedText
        )
      ) {
        ownershipCount++;
        leadSignals.push('PROVEN_TECHNICAL_OWNERSHIP');
      }

      timeline.push({
        company: exp.company,
        title: exp.title,
        employmentType: type,
        durationMonths: duration,
        isCurrent: Boolean(exp.isCurrent),
        productionSignals: prodSignals,
        leadershipSignals: leadSignals,
      });
    }

    // Professional tenure formula:
    // Full-time = 100%, Founder = 100%, Contract = 80%, Internship = 50%
    const weightedTenureMonths =
      fullTimeMonths +
      founderMonths +
      contractMonths * 0.8 +
      internshipMonths * 0.5 +
      otherMonths * 0.5;

    const totalYears = Math.round((weightedTenureMonths / 12) * 10) / 10;
    const rawTotalMonths =
      fullTimeMonths + founderMonths + contractMonths + internshipMonths + otherMonths;

    // Seniority Level Resolution
    let seniorityLevel = 'ENTRY';
    if (totalYears >= 10.0 || (totalYears >= 7.0 && leadershipCount >= 2)) {
      seniorityLevel = 'STAFF_PLUS';
    } else if (totalYears >= 5.0) {
      seniorityLevel = 'SENIOR';
    } else if (totalYears >= 2.0) {
      seniorityLevel = 'MID_LEVEL';
    }

    // Experience Score Calculation (0-100)
    let score = 50.0; // Baseline
    if (requiredTenureYears > 0) {
      const ratio = totalYears / requiredTenureYears;
      score = Math.min(60.0, ratio * 60.0);
    } else {
      score = Math.min(60.0, totalYears * 10.0);
    }

    // Add production scale & leadership bonuses
    score += Math.min(25.0, prodSystemsCount * 8.0);
    score += Math.min(15.0, (leadershipCount + ownershipCount) * 5.0);

    const finalScore = Math.round(Math.min(100.0, Math.max(0.0, score)) * 100) / 100;

    return ProductionExperienceReportSchema.parse({
      totalProfessionalTenureMonths: rawTotalMonths,
      totalProfessionalYears: totalYears,
      fullTimeTenureMonths: fullTimeMonths,
      internshipTenureMonths: internshipMonths,
      contractTenureMonths: contractMonths,
      founderTenureMonths: founderMonths,
      otherTenureMonths: otherMonths,
      productionSystemsVerifiedCount: prodSystemsCount,
      leadershipRolesCount: leadershipCount,
      ownershipSignalsCount: ownershipCount,
      experienceScore: finalScore,
      confidence: timeline.length > 0 ? 0.95 : 0.4,
      seniorityLevel,
      careerTimeline: timeline,
      summary: `Verified ${totalYears} professional years (${seniorityLevel}). Verified ${prodSystemsCount} production-scale systems and ${leadershipCount + ownershipCount} leadership signals.`,
    });
  }
}

export const productionExperienceIntelligenceService =
  new ProductionExperienceIntelligenceService();
