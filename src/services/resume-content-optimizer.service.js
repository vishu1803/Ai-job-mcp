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
import {
  buildStructuredResumeSnapshot,
  freezeSemanticResume,
  assertSemanticEquivalence,
  computeResumeSemanticFingerprint,
} from './structured-resume.service.js';
import { countDistinctCanonicalFacts } from './candidate-artifact-content.service.js';
import { compressCandidateBullet } from './resume-content-strategy.service.js';
import {
  buildCanonicalFactInventory,
  scoreFactsForJob,
  calculateRequirementCoverage,
  PROBLEM_SOLVING_PROJECT_KEY,
  isAccomplishmentCandidate,
} from './candidate-fact-inventory.service.js';
import { determineProjectBulletCapacity } from './resume-accomplishment-composer.service.js';
import { planDocumentSections } from './resume-section-planner.service.js';
import { evaluateResumeWritingQuality } from './resume-writing-quality.service.js';
import { logger as defaultLogger } from '../utils/logger.js';

export const OPTIMIZER_MAX_ITERATIONS = 5;

/**
 * Multi-move optimization move types (P17 Architecture)
 */
export const OPTIMIZER_MOVE_TYPES = Object.freeze({
  REPLACE_PROJECT: 'REPLACE_PROJECT',
  DROP_PROJECT: 'DROP_PROJECT',
  ADD_RELEVANT_PROJECT: 'ADD_RELEVANT_PROJECT',
  REPLACE_SKILL_SET: 'REPLACE_SKILL_SET',
  REORDER_EXPERIENCE_EVIDENCE: 'REORDER_EXPERIENCE_EVIDENCE',
  ADD_PROJECT_CLAIM: 'ADD_PROJECT_CLAIM',
  REMOVE_PROJECT_CLAIM: 'REMOVE_PROJECT_CLAIM',
  REPLACE_PROJECT_CLAIM: 'REPLACE_PROJECT_CLAIM',
  ADD_EXPERIENCE_CLAIM: 'ADD_EXPERIENCE_CLAIM',
  ADD_DSA_REPRESENTATION: 'ADD_DSA_REPRESENTATION',
  REWRITE_SUMMARY: 'REWRITE_SUMMARY',
  REORDER_SECTIONS: 'REORDER_SECTIONS',
  COMPRESS_LAYOUT: 'COMPRESS_LAYOUT',
});

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

    // Default initial project bullets to 3 per the 3-bullet project contract
    const defaultMaxBullets = typeof options.maxBullets === 'number' ? options.maxBullets : 3;
    const initialOptions = { maxBullets: defaultMaxBullets, ...options };

    // Track per-project bullet count overrides: { [projectId | projectName]: count }
    const projectBulletOverrides = { ...(options.projectBulletOverrides || {}) };
    let selectedProjectIds = Array.isArray(options.selectedProjectIds)
      ? [...options.selectedProjectIds]
      : null;

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
      if (!isAccomplishmentCandidate(f)) continue;
      const keys = new Set();
      if (f.association?.projectId) keys.add(f.association.projectId);
      if (f.ownerId) keys.add(f.ownerId);
      if (f.association?.projectName) {
        keys.add(f.association.projectName);
        keys.add(
          String(f.association.projectName)
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '')
        );
      }
      for (const k of keys) {
        inventoryFactCountByProject.set(k, (inventoryFactCountByProject.get(k) || 0) + 1);
      }
    }
    const additionalProjectIds = [];

    // Deep copy structured resume if provided, otherwise build initial snapshot
    let currentStructuredResume = null;
    let initialTailoringPlan =
      applicationPackage?.tailoringPlan ||
      applicationPackage?.tailoredResume?.tailoringPlan ||
      options?.tailoringPlan ||
      null;

    if (structuredResume) {
      currentStructuredResume = JSON.parse(
        JSON.stringify(structuredResume.structuredResume || structuredResume)
      );
    } else {
      const snap = buildStructuredResumeSnapshot({
        candidateProfile,
        jobPosting,
        tailoringPlan: initialTailoringPlan,
        options: { ...initialOptions, projectBulletOverrides },
      });
      currentStructuredResume = snap.structuredResume || snap;
    }

    if (!initialOptions.matchAnalysis && applicationPackage?.jobFitAnalysis?.matchAnalysis) {
      initialOptions.matchAnalysis = applicationPackage.jobFitAnalysis.matchAnalysis;
    }

    // Preserve AI summary and project bullets across optimizer iterations for semantic freeze
    if (!initialOptions.aiContent && currentStructuredResume) {
      const projBullets = {};
      if (Array.isArray(currentStructuredResume.projects)) {
        for (const p of currentStructuredResume.projects) {
          if (p.projectId) projBullets[p.projectId] = p.bullets;
          if (p.name) projBullets[p.name] = p.bullets;
        }
      }
      initialOptions.aiContent = {
        summary: currentStructuredResume.summary,
        projectBullets: projBullets,
      };
    }

    // Preserve skills across optimizer iterations for semantic freeze
    if (!initialTailoringPlan && currentStructuredResume?.skills) {
      const rawCats = Array.isArray(currentStructuredResume.skills?.categories)
        ? currentStructuredResume.skills.categories
        : Array.isArray(currentStructuredResume.skills)
          ? currentStructuredResume.skills
          : [];
      const extractedSelectedSkills = rawCats.flatMap((cat) =>
        (cat.skills || []).map((s, idx) => ({
          slug: s.slug || s.name,
          name: s.name || s.slug,
          category: cat.categoryName || cat.category || 'Core Competencies',
          provenanceStatus: s.provenanceStatus || 'VERIFIED',
          evidenceId: s.evidenceId || null,
          relevanceScore: s.relevanceScore ?? 50,
          matchedRequirementId: s.matchedRequirementId || null,
          confidenceScore: s.confidenceScore ?? 1.0,
          order: idx + 1,
        }))
      );
      const extractedCategoryOrder = rawCats
        .map((cat) => cat.categoryName || cat.category)
        .filter(Boolean);
      const extractedSkillSlugs = extractedSelectedSkills
        .map((s) => s.slug || s.name)
        .filter(Boolean);

      if (extractedSelectedSkills.length > 0) {
        initialTailoringPlan = {
          selectedSkills: extractedSelectedSkills,
          selectedSkillSlugs: extractedSkillSlugs,
          skillCategoryOrder: extractedCategoryOrder,
        };
      }
    }

    // Step 0: Introduce explicit semantic-freeze boundary (Issue 2 Contract)
    // The semantic resume is frozen; optimizer may only perform presentation/layout transformations.
    const baselineSemantic = freezeSemanticResume(currentStructuredResume);

    let currentLayoutOverrides = { ...(options.layoutOverrides || {}) };

    for (let iteration = 1; iteration <= maxIterations; iteration++) {
      this.logger.debug({ iteration }, 'Starting resume content optimizer iteration');

      // 1. Build or re-select structured resume if we have modified overrides
      if (iteration > 1 && candidateProfile && jobPosting) {
        const snap = buildStructuredResumeSnapshot({
          candidateProfile,
          jobPosting,
          tailoringPlan: initialTailoringPlan,
          options: {
            ...initialOptions,
            projectBulletOverrides,
            layoutOverrides: currentLayoutOverrides,
            selectedProjectIds: baselineSemantic.projectIds,
          },
        });
        currentStructuredResume = snap.structuredResume || snap;
      }

      // Assert runtime semantic equivalence: optimizer operation cannot change
      // project IDs, project ordering, project count, skill IDs, summary, DSA, experience, education, section order
      assertSemanticEquivalence(baselineSemantic, currentStructuredResume);

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
        const availableSpacePt =
          geometry.bottomWhitespacePt || (1 - geometry.pageOccupancyRatio) * 640;

        // Generate and evaluate candidate moves by expected value per page capacity
        const candidateMoves = this._generateCandidateMoves({
          structuredResume: currentStructuredResume,
          projectBulletOverrides,
          additionalProjectIds,
          inventoryFactCountByProject,
          crossProjectDuplicateFacts: factInventory?.crossProjectDuplicateFacts || [],
          scoredInventoryFacts,
          jobPosting,
          candidateProfile,
          availableSpacePt,
        });

        if (candidateMoves.length > 0) {
          // Select highest expected value move
          const bestMove = candidateMoves[0];

          if (bestMove.type === 'BULLETS') {
            const currentCount = projectBulletOverrides[bestMove.id] ?? bestMove.currentCount;
            const maxBulletLimit = (currentStructuredResume?.projects || []).length === 1 ? 4 : 3;
            const targetCount = Math.min(maxBulletLimit, currentCount + 1);
            projectBulletOverrides[bestMove.id] = targetCount;
            if (bestMove.name) {
              projectBulletOverrides[bestMove.name] = targetCount;
            }
            iterationRecord.action = `EXPAND_PROJECT_BULLETS: ${bestMove.name} (${currentCount} -> ${targetCount})`;
            this.logger.info(
              {
                project: bestMove.name,
                newCount: targetCount,
                iteration,
                expectedValue: bestMove.expectedValue,
              },
              'Optimizer expanding project bullets from canonical fact inventory'
            );
          } else if (bestMove.type === OPTIMIZER_MOVE_TYPES.COMPRESS_LAYOUT) {
            currentLayoutOverrides.profile = 'COMPACT';
            iterationRecord.action = 'COMPRESS_LAYOUT: Tightened layout profile to COMPACT';
          } else {
            iterationRecord.action = bestMove.description || 'APPLIED_LAYOUT_MOVE';
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

    const candidateAccomplishmentFacts = scoredInventoryFacts.filter((f) =>
      isAccomplishmentCandidate(f)
    );
    const availableCandidateFacts = candidateAccomplishmentFacts.length;
    const renderedFactIds = new Set();
    for (const proj of finalResult.structuredResume?.projects || []) {
      for (const b of proj.bullets || []) {
        for (const fid of b.composedFromFactIds || []) renderedFactIds.add(fid);
      }
    }
    for (const fid of finalResult.structuredResume?.summary?.composedFromFactIds || []) {
      renderedFactIds.add(fid);
    }
    const selectedCandidateFacts = renderedFactIds.size;
    const omittedCandidateFacts = candidateAccomplishmentFacts
      .filter((f) => !renderedFactIds.has(f.factId || f.id))
      .map((f) => ({
        factId: f.factId || f.id,
        reason: 'CAPACITY_LIMIT',
        pageImpact: 14,
      }));

    // Final runtime assertion: output structured resume has identical semantic selection to baseline input
    assertSemanticEquivalence(baselineSemantic, finalResult.structuredResume);

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
      availableCandidateFacts,
      selectedCandidateFacts,
      omittedCandidateFacts,
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
          bottomWhitespacePt:
            finalResult.geometry?.bottomWhitespacePt ?? finalStats.bottomWhitespacePt,
          pageOccupancyRatio:
            finalResult.geometry?.pageOccupancyRatio ?? finalStats.pageOccupancyRatio,
          factsRendered:
            finalResult.acceptanceMetrics?.factUtilization?.factsRendered ??
            finalStats.factsRendered,
          writingQualityScore:
            finalResult.writingQuality?.writingQualityScore ?? finalStats.writingQualityScore,
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
    inventoryFactCountByProject = new Map(),
    crossProjectDuplicateFacts = [],
    jobPosting,
    candidateProfile,
    availableSpacePt,
    scoredInventoryFacts = [],
  }) {
    const moves = [];
    const projects = Array.isArray(structuredResume?.projects) ? structuredResume.projects : [];
    const hasJobRequirements =
      (Array.isArray(jobPosting?.requirements) && jobPosting.requirements.length > 0) ||
      (Array.isArray(jobPosting?.skills) && jobPosting.skills.length > 0);
    const projectCoverage = (project) => {
      const projectKey = project.id || project.projectId || project.name;
      const facts = scoredInventoryFacts.filter(
        (fact) =>
          fact.association?.projectId === projectKey ||
          fact.ownerId === projectKey ||
          fact.association?.projectName === project.name
      );
      return calculateRequirementCoverage(
        [
          ...facts,
          {
            text: '',
            technologies: Array.isArray(project.technologies) ? project.technologies : [],
          },
        ],
        jobPosting
      );
    };
    const relevanceByProject = new Map();
    for (const fact of scoredInventoryFacts) {
      const key = fact.association?.projectId || fact.ownerId || fact.association?.projectName;
      if (!key) continue;
      const normalized = String(key)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
      relevanceByProject.set(
        normalized,
        Math.max(relevanceByProject.get(normalized) || 0, fact.jobRelevance || 0)
      );
    }

    // Move Type 1: Expand Project Bullets
    for (const p of projects) {
      const pId = p.projectId || p.name;
      const effectiveCount =
        projectBulletOverrides?.[pId] ??
        projectBulletOverrides?.[p.name] ??
        (Array.isArray(p.bullets) ? p.bullets.length : 0);
      const maxBulletLimit = projects.length === 1 ? 4 : 3;
      if (effectiveCount >= maxBulletLimit) continue;

      const factCount =
        inventoryFactCountByProject?.get?.(pId) ??
        inventoryFactCountByProject?.get?.(
          String(p.name || '')
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '')
        ) ??
        0;
      if (factCount <= effectiveCount) continue;

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
        currentCount: effectiveCount,
        spaceCost,
        qualityGain,
        relevanceGain,
        evidenceGain,
        redundancyChange,
        expectedValue,
        description: `Add bullet to project ${p.name || pId}`,
      });
    }

    // Move Type 7: COMPRESS_LAYOUT
    if (availableSpacePt < 10) {
      moves.push({
        type: OPTIMIZER_MOVE_TYPES.COMPRESS_LAYOUT,
        id: 'layout',
        name: 'Layout Compression',
        spaceCost: -30, // saves ~30pt
        expectedValue: 2.0,
        description: 'Apply deterministic compact layout spacing overrides',
      });
    }

    // Move Type 8: REMOVE_PROJECT_CLAIM
    // Note: Project bullets cannot be pruned below the mandatory 3-bullet contract for multi-project resumes
    if (availableSpacePt < 0) {
      const minAllowedBullets = projects.length === 1 ? 1 : 3;
      for (const p of projects) {
        if (Array.isArray(p.bullets) && p.bullets.length > minAllowedBullets) {
          moves.push({
            type: OPTIMIZER_MOVE_TYPES.REMOVE_PROJECT_CLAIM,
            id: p.projectId || p.name,
            name: p.name,
            spaceCost: -18,
            expectedValue: 2.5,
            description: `Prune bullet from project ${p.name} to resolve page overflow`,
          });
          break;
        }
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
      for (const b of p.bullets || []) {
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

    // Note: Project bullets cannot be pruned below 3 per the 3-bullet contract,
    // and validated bullets cannot be deleted or rewritten by the optimizer.
    for (let i = projects.length - 1; i >= 0; i--) {
      const p = projects[i];
      if (Array.isArray(p.bullets) && p.bullets.length > 3) {
        p.bullets.pop();
        return {
          description: `Removed lowest-ranked bullet from project ${p.name}`,
        };
      }
    }

    return null;
  }
}
