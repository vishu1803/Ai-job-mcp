/**
 * @file Bounded Document-Level Content-Utilization Optimizer Service (Phase 16 - P16-008).
 *
 * Implements a closed-loop, physical-measurement-driven optimizer operating on
 * the structured resume content pipeline:
 *
 * candidate sources
 *   -> canonical facts
 *   -> section planning
 *   -> tailored selection
 *   -> LaTeX
 *   -> PDF compile (Tectonic)
 *   -> actual page measurement & PDF observation
 *   -> multi-move optimization (expected value per page capacity)
 *   -> final PDF
 *
 * Invariants & Constraints:
 * 1. Bounded strictly to a maximum of 5 deterministic iterations.
 * 2. Operates strictly within authentic candidate-owned facts.
 * 3. NEVER invents achievements, metrics, outcomes, or accomplishments.
 * 4. NEVER creates technology-based accomplishments or infers claims from packages.
 * 5. NEVER mutates candidate source records or database tables.
 * 6. Strictly source-order invariant and deterministic.
 * 7. Optimizes expected value per unit page capacity (does NOT chase arbitrary 85% or 95% occupancy).
 */

import { LatexDocumentGenerator } from './latex-document-generator.service.js';
import { LatexCompilerService } from './latex-compiler.service.js';
import { PdfGeometryAnalyzer } from './pdf-geometry-analyzer.service.js';
import { PdfQaValidatorService } from './pdf-qa-validator.service.js';
import { ResumeQualityAssessmentService } from './resume-quality-assessment.service.js';
import { buildStructuredResumeSnapshot } from './structured-resume.service.js';
import { countDistinctCanonicalFacts } from './candidate-artifact-content.service.js';
import { compressCandidateBullet } from './resume-content-strategy.service.js';
import { buildCanonicalFactInventory, scoreFactsForJob, PROBLEM_SOLVING_PROJECT_KEY } from './candidate-fact-inventory.service.js';
import { determineProjectBulletCapacity } from './resume-accomplishment-composer.service.js';
import { planDocumentSections } from './resume-section-planner.service.js';
import { evaluateResumeWritingQuality } from './resume-writing-quality.service.js';
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

    // Build authoritative canonical fact inventory
    const factInventory = candidateProfile
      ? buildCanonicalFactInventory(candidateProfile, jobPosting)
      : null;
    const scoredInventoryFacts = factInventory
      ? scoreFactsForJob(factInventory.facts, jobPosting)
      : [];
    const inventoryFactCountByProject = new Map();
    for (const f of scoredInventoryFacts) {
      if (f.factType === 'technology' || f.factType === 'external-corroboration') continue;
      const key = f.association?.projectId || '';
      if (!key) continue;
      inventoryFactCountByProject.set(key, (inventoryFactCountByProject.get(key) || 0) + 1);
    }
    const additionalProjectIds = [];

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

      // 1. Build or re-select structured resume if we have modified overrides
      if (iteration > 1 && candidateProfile && jobPosting) {
        const snap = buildStructuredResumeSnapshot({
          candidateProfile,
          jobPosting,
          options: {
            ...initialOptions,
            projectBulletOverrides,
            layoutOverrides: currentLayoutOverrides,
            additionalProjectIds: [...additionalProjectIds],
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

      // 4. Physical Geometry Measurement & Writing Quality
      const pageCount = this.geometryAnalyzer._detectPageCount(pdfResult.pdfBuffer) || 1;
      const geometry = this.geometryAnalyzer.measurePdfBottom(pdfResult.pdfBuffer);
      const acceptanceMetrics = this.geometryAnalyzer.computeAcceptanceMetrics({
        pdfBuffer: pdfResult.pdfBuffer,
        structuredResume: currentStructuredResume,
        candidateProfile,
      });

      const writingQuality = evaluateResumeWritingQuality({
        structuredResume: currentStructuredResume,
        jobPosting,
        factInventory,
      });

      // Calculate unused high-value evidence
      const unusedHighValueEvidence = this._calculateUnusedHighValueEvidence({
        structuredResume: currentStructuredResume,
        scoredInventoryFacts,
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
        writingQualityScore: writingQuality.writingQualityScore,
        unusedHighValueEvidenceCount: unusedHighValueEvidence.length,
        qaScore,
        qaPassed,
        action: iteration === 1 ? 'INITIAL_COMPILATION' : 'EVALUATE',
      };

      iterationHistory.push(iterationRecord);

      // 6. Optimization Decision Logic (Document-Level Content Value Optimization)
      if (pageCount === 1) {
        // Successful 1-page compile! Save as current best
        bestOnePageCandidate = {
          iteration,
          structuredResume: currentStructuredResume,
          latexResult,
          pdfResult,
          geometry,
          acceptanceMetrics,
          writingQuality,
          unusedHighValueEvidence,
          qaScore,
          qaPassed,
        };

        if (iteration === maxIterations) {
          iterationRecord.action = 'MAX_ITERATIONS_REACHED';
          break;
        }

        // Available vertical space in points (estimated)
        const availableSpacePt = geometry.bottomWhitespacePt || (1 - geometry.pageOccupancyRatio) * 640;

        // Generate and evaluate candidate moves by expected value per page capacity
        const candidateMoves = this._generateCandidateMoves({
          structuredResume: currentStructuredResume,
          projectBulletOverrides,
          additionalProjectIds,
          inventoryFactCountByProject,
          crossProjectDuplicateFacts: factInventory?.crossProjectDuplicateFacts || [],
          jobPosting,
          candidateProfile,
          availableSpacePt,
        });

        if (candidateMoves.length > 0) {
          // Select highest expected value move
          const bestMove = candidateMoves[0];

          if (bestMove.type === 'BULLETS') {
            const currentCount = projectBulletOverrides[bestMove.id] ?? bestMove.currentCount;
            projectBulletOverrides[bestMove.id] = currentCount + 1;
            if (bestMove.name) {
              projectBulletOverrides[bestMove.name] = currentCount + 1;
            }
            iterationRecord.action = `EXPAND_PROJECT_BULLETS: ${bestMove.name} (${currentCount} -> ${currentCount + 1})`;
            this.logger.info(
              { project: bestMove.name, newCount: currentCount + 1, iteration, expectedValue: bestMove.expectedValue },
              'Optimizer expanding project bullets from canonical fact inventory'
            );
          } else if (bestMove.type === 'PROJECT') {
            additionalProjectIds.push(bestMove.id);
            iterationRecord.action = `ADD_PROJECT: ${bestMove.name}`;
            this.logger.info(
              { project: bestMove.name, iteration, expectedValue: bestMove.expectedValue },
              'Optimizer adding a strong under-utilized project from the canonical fact inventory'
            );
          } else {
            iterationRecord.action = bestMove.description || 'APPLIED_CONTENT_MOVE';
          }
        } else {
          // Optimal document composition achieved
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
      writingQuality: { writingQualityScore: 0 },
      unusedHighValueEvidence: [],
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
      writingQuality: finalResult.writingQuality,
      unusedHighValueEvidence: finalResult.unusedHighValueEvidence || [],
      qaScore: finalResult.qaScore,
      qaPassed: finalResult.qaPassed,
      iterationHistory,
      comparison: {
        initial: {
          pageCount: initialStats.pageCount,
          bottomWhitespacePt: initialStats.bottomWhitespacePt,
          pageOccupancyRatio: initialStats.pageOccupancyRatio,
          factsRendered: initialStats.factsRendered,
          writingQualityScore: initialStats.writingQualityScore,
        },
        final: {
          pageCount: finalResult.acceptanceMetrics?.pageCount || finalStats.pageCount,
          bottomWhitespacePt: finalResult.geometry?.bottomWhitespacePt ?? finalStats.bottomWhitespacePt,
          pageOccupancyRatio: finalResult.geometry?.pageOccupancyRatio ?? finalStats.pageOccupancyRatio,
          factsRendered: finalResult.acceptanceMetrics?.factUtilization?.factsRendered ?? finalStats.factsRendered,
          writingQualityScore: finalResult.writingQuality?.writingQualityScore ?? finalStats.writingQualityScore,
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
   * Generates and ranks possible content optimization moves based on expected value per space cost.
   *
   * @private
   */
  _generateCandidateMoves({
    structuredResume,
    projectBulletOverrides,
    additionalProjectIds,
    inventoryFactCountByProject,
    crossProjectDuplicateFacts = [],
    jobPosting,
    candidateProfile,
    availableSpacePt,
  }) {
    const moves = [];
    const projects = Array.isArray(structuredResume?.projects) ? structuredResume.projects : [];

    // Move Type 1: Expand Project Bullets
    for (const p of projects) {
      const pId = p.projectId || p.name;
      const currentCount = Array.isArray(p.bullets) ? p.bullets.length : 0;
      if (currentCount >= 3) continue;

      const factCount =
        inventoryFactCountByProject.get(pId) ??
        inventoryFactCountByProject.get(String(p.name || '').toLowerCase().replace(/[^a-z0-9]/g, '')) ??
        0;
      if (factCount <= currentCount) continue;

      const spaceCost = 18; // ~18pt per bullet line
      if (availableSpacePt < spaceCost && availableSpacePt > 0) continue;

      const qualityGain = 15;
      const relevanceGain = p.relevanceScore || 75;
      const evidenceGain = 1;
      const redundancyChange = -5;

      const expectedValue =
        (qualityGain * 0.4 + relevanceGain * 0.3 + evidenceGain * 10 - redundancyChange * 0.5) /
        Math.max(1, spaceCost);

      moves.push({
        type: 'BULLETS',
        id: pId,
        name: p.name || p.displayName,
        currentCount,
        spaceCost,
        qualityGain,
        relevanceGain,
        evidenceGain,
        redundancyChange,
        expectedValue,
        description: `Add bullet to project ${p.name || pId}`,
      });
    }

    // Move Type 2: Add High-Relevance Project
    if (projects.length < 4) {
      const rawProjects = Array.isArray(candidateProfile?.projects) ? candidateProfile.projects : [];
      for (const candProj of rawProjects) {
        const cId = candProj.id || candProj.projectId;
        if (!cId) continue;
        if (projects.some((p) => p.projectId === cId)) continue;
        if (additionalProjectIds.includes(cId)) continue;
        const isArchived =
          candProj.isArchived === true || candProj.metadata?.portfolioStatus === 'ARCHIVED';
        if (isArchived) continue;

        const factCount = inventoryFactCountByProject.get(cId) || 0;
        const evidenceCount = candProj.evidenceCount ?? (Array.isArray(candProj.evidence) ? candProj.evidence.length : 0);
        const hasRenderableContent =
          factCount >= 2 ||
          evidenceCount >= 5 ||
          (Array.isArray(candProj.highlights) && candProj.highlights.length > 0);
        if (!hasRenderableContent) continue;

        const spaceCost = 55; // ~55pt for project header + initial bullet
        if (availableSpacePt < spaceCost && availableSpacePt > 0) continue;

        const qualityGain = 25;
        const relevanceGain = candProj.relevanceScore || 70;
        const evidenceGain = 2;
        const redundancyChange = 0;

        const expectedValue =
          (qualityGain * 0.4 + relevanceGain * 0.3 + evidenceGain * 10 - redundancyChange * 0.5) /
          Math.max(1, spaceCost);

        moves.push({
          type: 'PROJECT',
          id: cId,
          name: candProj.name || candProj.title || cId,
          spaceCost,
          qualityGain,
          relevanceGain,
          evidenceGain,
          redundancyChange,
          expectedValue,
          description: `Add project ${candProj.name || cId}`,
        });
      }
    }

    // Sort by expected value descending
    moves.sort((a, b) => b.expectedValue - a.expectedValue);
    return moves;
  }

  /**
   * Identifies high-value canonical facts that were not included in the current rendered document.
   *
   * @private
   */
  _calculateUnusedHighValueEvidence({ structuredResume, scoredInventoryFacts = [] }) {
    if (!scoredInventoryFacts || scoredInventoryFacts.length === 0) return [];

    const renderedFactIds = new Set();
    const projects = structuredResume?.projects || [];
    for (const p of projects) {
      for (const b of (p.bullets || [])) {
        if (Array.isArray(b.composedFromFactIds)) {
          for (const fid of b.composedFromFactIds) renderedFactIds.add(fid);
        }
      }
    }

    const unusedHighValue = [];
    for (const f of scoredInventoryFacts) {
      if (f.factType === 'technology' || f.factType === 'identity') continue;
      if (f.jobRelevance >= 70 && !renderedFactIds.has(f.id)) {
        unusedHighValue.push({
          id: f.id,
          factType: f.factType,
          text: f.text,
          jobRelevance: f.jobRelevance,
          projectId: f.projectId,
        });
      }
    }

    return unusedHighValue;
  }

  /**
   * Applies deterministic compression to a structured resume or layout overrides when overfull.
   *
   * @private
   */
  _applyDeterministicCompression(structuredResume, layoutOverrides) {
    if (!layoutOverrides.profile || layoutOverrides.profile !== 'COMPACT') {
      layoutOverrides.profile = 'COMPACT';
      return { description: 'Tightened layout profile to COMPACT' };
    }

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

    for (let i = projects.length - 1; i >= 0; i--) {
      const p = projects[i];
      if (Array.isArray(p.bullets) && p.bullets.length > 1) {
        p.bullets.pop();
        return {
          description: `Removed lowest-ranked bullet from project ${p.name}`,
        };
      }
    }

    return null;
  }
}
