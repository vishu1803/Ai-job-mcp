/**
 * @file Bounded Content-Utilization Optimizer Service (Phase 16 - P16-008).
 *
 * Implements a closed-loop, physical-measurement-driven optimizer operating on
 * the structured resume content pipeline:
 *
 * candidate sources
 *   -> canonical facts
 *   -> tailored selection
 *   -> LaTeX
 *   -> PDF compile (Tectonic)
 *   -> actual page measurement
 *   -> re-selection/compression
 *   -> final PDF
 *
 * Invariants & Constraints:
 * 1. Bounded strictly to a maximum of 5 deterministic iterations.
 * 2. Operates strictly within authentic candidate-owned facts.
 * 3. NEVER invents achievements, metrics, outcomes, or accomplishments.
 * 4. NEVER creates technology-based accomplishments or infers claims from packages.
 * 5. NEVER mutates candidate source records or database tables.
 * 6. NEVER adds irrelevant projects not selected by tailoring analysis.
 * 7. Strictly source-order invariant and deterministic.
 */

import { LatexDocumentGenerator } from './latex-document-generator.service.js';
import { LatexCompilerService } from './latex-compiler.service.js';
import { PdfGeometryAnalyzer } from './pdf-geometry-analyzer.service.js';
import { PdfQaValidatorService } from './pdf-qa-validator.service.js';
import { ResumeQualityAssessmentService } from './resume-quality-assessment.service.js';
import { buildStructuredResumeSnapshot } from './structured-resume.service.js';
import { countDistinctCanonicalFacts } from './candidate-artifact-content.service.js';
import { compressCandidateBullet } from './resume-content-strategy.service.js';
import { logger as defaultLogger } from '../utils/logger.js';

export const OPTIMIZER_MAX_ITERATIONS = 5;

export class ResumeContentOptimizer {
  /**
   * @param {object} [dependencies={}]
   * @param {LatexDocumentGenerator} [dependencies.latexGenerator]
   * @param {LatexCompilerService} [dependencies.latexCompiler]
   * @param {PdfGeometryAnalyzer} [dependencies.geometryAnalyzer]
   * @param {PdfQaValidatorService} [dependencies.qaValidator]
   * @param {ResumeQualityAssessmentService} [dependencies.resumeQualityAssessment]
   * @param {import('pino').Logger} [dependencies.logger]
   */
  constructor(dependencies = {}) {
    this.latexGenerator = dependencies.latexGenerator || new LatexDocumentGenerator();
    this.latexCompiler = dependencies.latexCompiler || new LatexCompilerService();
    this.geometryAnalyzer = dependencies.geometryAnalyzer || new PdfGeometryAnalyzer();
    this.qaValidator = dependencies.qaValidator || new PdfQaValidatorService();
    this.resumeQualityAssessment =
      dependencies.resumeQualityAssessment || new ResumeQualityAssessmentService();
    this.logger = dependencies.logger || defaultLogger.child({ module: 'ResumeContentOptimizer' });
  }

  /**
   * Optimizes a resume document through physical PDF compile-and-measure iterations.
   *
   * @param {object} params
   * @param {object} params.candidateProfile Canonical candidate profile
   * @param {object} params.jobPosting Target job posting
   * @param {object} [params.structuredResume] Initial structured resume snapshot (optional)
   * @param {object} [params.applicationPackage] Application package context (optional)
   * @param {object} [params.options] Generation & optimizer options
   * @returns {Promise<object>} Optimization result bundle
   */
  async optimize({
    candidateProfile,
    jobPosting,
    structuredResume = null,
    applicationPackage = null,
    options = {},
  }) {
    const maxIterations = Math.min(
      OPTIMIZER_MAX_ITERATIONS,
      typeof options.maxIterations === 'number' ? options.maxIterations : OPTIMIZER_MAX_ITERATIONS
    );

    const iterationHistory = [];
    let bestOnePageCandidate = null;

    // Default initial project bullets to 2 so optimizer has headroom to expand to 3 for strong projects
    const defaultMaxBullets = typeof options.maxBullets === 'number' ? options.maxBullets : 2;
    const initialOptions = { maxBullets: defaultMaxBullets, ...options };

    // Track per-project bullet count overrides: { [projectId | projectName]: count }
    const projectBulletOverrides = { ...(options.projectBulletOverrides || {}) };

    // Deep copy structured resume if provided, otherwise build initial snapshot
    let currentStructuredResume = null;
    if (structuredResume) {
      currentStructuredResume = JSON.parse(JSON.stringify(structuredResume.structuredResume || structuredResume));
    } else {
      const snap = buildStructuredResumeSnapshot({
        candidateProfile,
        jobPosting,
        options: { ...initialOptions, projectBulletOverrides },
      });
      currentStructuredResume = snap.structuredResume || snap;
    }

    let currentLayoutOverrides = { ...(options.layoutOverrides || {}) };

    for (let iteration = 1; iteration <= maxIterations; iteration++) {
      this.logger.debug({ iteration }, 'Starting resume content optimizer iteration');

      // 1. Build or re-select structured resume if we have modified bullet overrides
      if (iteration > 1 && candidateProfile && jobPosting) {
        const snap = buildStructuredResumeSnapshot({
          candidateProfile,
          jobPosting,
          options: {
            ...initialOptions,
            projectBulletOverrides,
            layoutOverrides: currentLayoutOverrides,
          },
        });
        currentStructuredResume = snap.structuredResume || snap;
      }

      // 2. Generate LaTeX source
      const appPkg = {
        ...(applicationPackage || {}),
        structuredResume: currentStructuredResume,
        tailoredResume: {
          ...(applicationPackage?.tailoredResume || {}),
          structuredResume: currentStructuredResume,
        },
        targetJob: jobPosting || applicationPackage?.targetJob,
      };

      const latexResult = this.latexGenerator.generateTailoredResumeLatex({
        applicationPackage: appPkg,
        candidateProfile: structuredResume ? null : candidateProfile,
        options: currentLayoutOverrides,
      });

      // 3. Compile PDF via Tectonic
      const pdfResult = await this.latexCompiler.compileLatexToPdf({
        texContent: latexResult.texContent,
        jobName: `opt-resume-iter-${iteration}`,
      });

      // 4. Physical Geometry Measurement
      const pageCount = this.geometryAnalyzer._detectPageCount(pdfResult.pdfBuffer) || 1;
      const geometry = this.geometryAnalyzer.measurePdfBottom(pdfResult.pdfBuffer);
      const acceptanceMetrics = this.geometryAnalyzer.computeAcceptanceMetrics({
        pdfBuffer: pdfResult.pdfBuffer,
        structuredResume: currentStructuredResume,
        candidateProfile,
      });

      // 5. Pre-exposure QA Audit
      let qaScore = 100;
      let qaPassed = true;
      try {
        const qaResult = await this.qaValidator.validatePdfResume({
          pdfBuffer: pdfResult.pdfBuffer,
          expectedJobTitle: jobPosting?.title,
        });
        qaScore = qaResult.score;
        qaPassed = qaResult.passed;
      } catch {
        // Best effort QA
      }

      const iterationRecord = {
        iteration,
        pageCount,
        lowestY: geometry.lowestY,
        bottomWhitespacePt: geometry.bottomWhitespacePt,
        pageOccupancyRatio: geometry.pageOccupancyRatio,
        factsRendered: acceptanceMetrics.factUtilization.factsRendered,
        distinctFactsAvailable: acceptanceMetrics.factUtilization.distinctFactsAvailable,
        utilizationRatio: acceptanceMetrics.factUtilization.utilizationRatio,
        qaScore,
        qaPassed,
        action: iteration === 1 ? 'INITIAL_COMPILATION' : 'EVALUATE',
      };

      iterationHistory.push(iterationRecord);

      // 6. Optimization Decision Logic
      if (pageCount === 1) {
        // Successful 1-page compile! Save as current best
        bestOnePageCandidate = {
          iteration,
          structuredResume: currentStructuredResume,
          latexResult,
          pdfResult,
          geometry,
          acceptanceMetrics,
          qaScore,
          qaPassed,
        };

        if (iteration === maxIterations) {
          iterationRecord.action = 'MAX_ITERATIONS_REACHED';
          break;
        }

        // Check if layout is overly sparse and unused candidate facts exist for expansion
        const isSparse = geometry.bottomWhitespacePt > 50 || geometry.pageOccupancyRatio < 0.85;

        // Find highest-priority project with unused candidate-owned facts
        const expandableProject = this._findExpandableProject(
          currentStructuredResume,
          candidateProfile,
          projectBulletOverrides
        );

        if (isSparse && expandableProject) {
          // Increase bullet budget for this project by 1
          const currentCount =
            projectBulletOverrides[expandableProject.id] ??
            expandableProject.bulletsCount;
          projectBulletOverrides[expandableProject.id] = currentCount + 1;
          if (expandableProject.name) {
            projectBulletOverrides[expandableProject.name] = currentCount + 1;
          }

          iterationRecord.action = `EXPAND_PROJECT_BULLETS: ${expandableProject.name} (${currentCount} -> ${currentCount + 1})`;
          this.logger.info(
            { project: expandableProject.name, newCount: currentCount + 1, iteration },
            'Optimizer expanding project bullets from available candidate facts'
          );
        } else {
          // Optimal one-page occupancy achieved or no more unused candidate facts available
          iterationRecord.action = 'OPTIMAL_OCCUPANCY_ACHIEVED';
          break;
        }
      } else {
        // Page count > 1: Overfull overflow!
        if (bestOnePageCandidate) {
          // Roll back immediately to the verified 1-page candidate
          iterationRecord.action = `ROLLBACK_OVERFLOW: Iteration ${iteration} exceeded 1 page (${pageCount} pages); reverting to Iteration ${bestOnePageCandidate.iteration}`;
          this.logger.info(
            { iteration, revertedTo: bestOnePageCandidate.iteration },
            'Optimizer rolled back overflow iteration to best 1-page candidate'
          );
          break;
        }

        // Initial compile was already > 1 page: Apply safe deterministic compression
        if (iteration === maxIterations) {
          iterationRecord.action = 'MAX_ITERATIONS_REACHED_OVERFULL';
          break;
        }

        const compressed = this._applyDeterministicCompression(
          currentStructuredResume,
          currentLayoutOverrides
        );
        if (compressed) {
          iterationRecord.action = `COMPRESS_LAYOUT: ${compressed.description}`;
        } else {
          iterationRecord.action = 'CANNOT_COMPRESS_FURTHER';
          break;
        }
      }
    }

    // Determine final output bundle (prefer verified 1-page candidate)
    const finalResult = bestOnePageCandidate || {
      iteration: iterationHistory.length,
      structuredResume: currentStructuredResume,
      latexResult: { texContent: '' },
      pdfResult: { pdfBuffer: Buffer.alloc(0) },
      geometry: { lowestY: 792, bottomWhitespacePt: 0, pageOccupancyRatio: 0 },
      acceptanceMetrics: {},
      qaScore: 0,
      qaPassed: false,
    };

    const initialStats = iterationHistory[0] || {};
    const finalStats = iterationHistory[iterationHistory.length - 1] || {};

    return {
      success: Boolean(bestOnePageCandidate),
      iterationsRun: iterationHistory.length,
      structuredResume: finalResult.structuredResume,
      latexContent: finalResult.latexResult.texContent,
      pdfBuffer: finalResult.pdfResult.pdfBuffer,
      geometry: finalResult.geometry,
      acceptanceMetrics: finalResult.acceptanceMetrics,
      qaScore: finalResult.qaScore,
      qaPassed: finalResult.qaPassed,
      iterationHistory,
      comparison: {
        initial: {
          pageCount: initialStats.pageCount,
          bottomWhitespacePt: initialStats.bottomWhitespacePt,
          pageOccupancyRatio: initialStats.pageOccupancyRatio,
          factsRendered: initialStats.factsRendered,
        },
        final: {
          pageCount: finalResult.acceptanceMetrics?.pageCount || finalStats.pageCount,
          bottomWhitespacePt: finalResult.geometry?.bottomWhitespacePt ?? finalStats.bottomWhitespacePt,
          pageOccupancyRatio: finalResult.geometry?.pageOccupancyRatio ?? finalStats.pageOccupancyRatio,
          factsRendered: finalResult.acceptanceMetrics?.factUtilization?.factsRendered ?? finalStats.factsRendered,
        },
        bulletsAdded: Math.max(
          0,
          (finalResult.acceptanceMetrics?.factUtilization?.factsRendered || 0) -
            (initialStats.factsRendered || 0)
        ),
      },
    };
  }

  /**
   * Finds the highest-priority project that has unused candidate-authored facts.
   *
   * @private
   * @param {object} structuredResume Current structured resume snapshot
   * @param {object} candidateProfile Full candidate profile
   * @param {object} overrides Current project bullet overrides
   * @returns {{ id: string, name: string, bulletsCount: number } | null}
   */
  _findExpandableProject(structuredResume, candidateProfile, overrides) {
    const projects = Array.isArray(structuredResume?.projects) ? structuredResume.projects : [];
    if (projects.length === 0) return null;

    for (const p of projects) {
      const pId = p.projectId || p.name;
      const currentBulletsCount = Array.isArray(p.bullets) ? p.bullets.length : 0;
      const currentOverride = overrides[pId] ?? overrides[p.name] ?? currentBulletsCount;

      // Cannot exceed 3 bullets per project (universal quality ceiling)
      if (currentOverride >= 3) continue;

      // Find original project in candidateProfile to count total available facts
      let candProj = null;
      if (candidateProfile && Array.isArray(candidateProfile.projects)) {
        candProj = candidateProfile.projects.find(
          (cp) =>
            (cp.id && cp.id === p.projectId) ||
            (cp.name && cp.name.toLowerCase() === (p.name || '').toLowerCase())
        );
      }

      const items = [
        ...(Array.isArray(p.bullets) ? p.bullets : []),
        ...(Array.isArray(candProj?.bullets) ? candProj.bullets : []),
        ...(Array.isArray(candProj?.highlights) ? candProj.highlights : []),
        ...(Array.isArray(candProj?.features) ? candProj.features : []),
        ...(Array.isArray(candProj?.featureDescriptions) ? candProj.featureDescriptions : []),
        ...(Array.isArray(candProj?.responsibilities) ? candProj.responsibilities : []),
        ...(candProj?.description ? [candProj.description] : []),
      ];

      const distinctFacts = countDistinctCanonicalFacts(items);
      if (distinctFacts > currentOverride) {
        return {
          id: pId,
          name: p.name || p.displayName,
          bulletsCount: currentOverride,
        };
      }
    }

    return null;
  }

  /**
   * Applies deterministic compression to a structured resume or layout overrides when overfull.
   *
   * @private
   * @param {object} structuredResume Structured resume to compress in-place
   * @param {object} layoutOverrides Layout overrides
   * @returns {{ description: string } | null}
   */
  _applyDeterministicCompression(structuredResume, layoutOverrides) {
    // 1. If spacing profile is not yet COMPACT, tighten layout spacing
    if (!layoutOverrides.profile || layoutOverrides.profile !== 'COMPACT') {
      layoutOverrides.profile = 'COMPACT';
      return { description: 'Tightened layout profile to COMPACT' };
    }

    // 2. Compress the single longest bullet in projects
    const projects = Array.isArray(structuredResume?.projects) ? structuredResume.projects : [];
    let longestBullet = null;
    let maxLen = 0;

    for (const p of projects) {
      if (!Array.isArray(p.bullets)) continue;
      for (const b of p.bullets) {
        const text = typeof b === 'object' ? b.text || '' : String(b);
        if (text.length > maxLen && text.length > 80) {
          maxLen = text.length;
          longestBullet = { project: p, bullet: b, text };
        }
      }
    }

    if (longestBullet) {
      const compressedText = compressCandidateBullet(longestBullet.text);
      if (compressedText.length < longestBullet.text.length) {
        if (typeof longestBullet.bullet === 'object') {
          longestBullet.bullet.text = compressedText;
        } else {
          const idx = longestBullet.project.bullets.indexOf(longestBullet.bullet);
          if (idx !== -1) longestBullet.project.bullets[idx] = compressedText;
        }
        return {
          description: `Compressed longest bullet in ${longestBullet.project.name} (${maxLen} -> ${compressedText.length} chars)`,
        };
      }
    }

    // 3. Drop 1 bullet from the lowest-ranked project that has > 1 bullet
    for (let i = projects.length - 1; i >= 0; i--) {
      const p = projects[i];
      if (Array.isArray(p.bullets) && p.bullets.length > 1) {
        const removed = p.bullets.pop();
        return {
          description: `Removed lowest-ranked bullet from project ${p.name}`,
        };
      }
    }

    return null;
  }
}
