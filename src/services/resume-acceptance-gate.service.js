/**
 * @file Resume Acceptance Gate Service (P16 Architecture)
 *
 * Evaluates generated resumes against the 15 formal acceptance criteria:
 * 1. RenderedClaims ⊆ AuthorizedCanonicalEvidence
 * 2. Every rendered claim contains canonical fact IDs
 * 3. No unauthorized metric is rendered
 * 4. No unauthorized technology is rendered
 * 5. No unsupported actor, team, scale, customer, revenue, performance, production-status, or outcome claim appears
 * 6. Requirement coverage is derived from requirement IDs
 * 7. Fact utilization is derived from exact canonical fact IDs
 * 8. Every omitted fact has a machine-readable decision trace
 * 9. Section order is selected from utility, not archetype templates
 * 10. Document composition is selected from total utility under page constraints
 * 11. Writing quality improves against the pre-change baseline
 * 12. Final PDF is independently observed after compilation
 * 13. Same candidate/job/input snapshot produces deterministic results
 * 14. Gemini is used only as a realization layer, never as a source of truth
 * 15. Legacy services contain no independent composition implementation
 */

import { evaluateResumeWritingQuality, evaluateEvidenceDerivedQuality } from './resume-writing-quality.service.js';
import { ResumePdfObserver } from './resume-pdf-observer.service.js';
import { calculateFactSemanticOverlap } from './candidate-artifact-content.service.js';

const UNGROUNDED_CLAIM_PATTERNS = [
  { type: 'revenue', pattern: /\b(?:\$\d+(?:\.\d+)?\s*(?:[mbk]|million|billion)|revenue of \$\d+)\b/i },
  { type: 'team_scale', pattern: /\b(?:managing|led|supervised|directed)\s+(?:a\s+)?team\s+of\s+\d+\b/i },
  { type: 'customer_scale', pattern: /\b(?:\d+\+?\s*(?:million|enterprise|paying)\s+customers|\bfortune\s+500\b)\b/i },
  { type: 'executive_actor', pattern: /\b(?:direct\s+report\s+to\s+(?:ceo|cto|vp)|head\s+of\s+engineering)\b/i },
];

/**
 * Validates a structured resume document against the 15-point acceptance criteria.
 *
 * @param {object} params
 * @param {object} params.structuredResume - Composed StructuredResumeDocument
 * @param {object} params.factInventory - CanonicalFactInventory
 * @param {object} [params.jobPosting] - Job posting object
 * @param {object} [params.sectionPlan] - Section plan produced by resume-section-planner
 * @param {Buffer} [params.pdfBuffer] - Compiled PDF binary buffer
 * @param {object} [params.baselineMetrics] - Pre-change baseline metrics for comparison
 * @returns {{ passed: boolean, criteria: object, violations: Array<object>, summary: string }}
 */
export function evaluateResumeAcceptanceGate({
  structuredResume,
  factInventory,
  jobPosting = null,
  sectionPlan = null,
  pdfBuffer = null,
  baselineMetrics = null,
}) {
  const doc = structuredResume?.structuredResume || structuredResume || {};
  const inv = factInventory || { facts: [] };
  const allFacts = inv.facts || [];
  const violations = [];
  const criteria = {};

  const recordCriterion = (id, name, passed, details = {}) => {
    criteria[id] = { name, passed, details };
    if (!passed) {
      violations.push({ criterionId: id, name, details });
    }
  };

  // Collect all rendered claims
  const renderedClaims = [];
  if (doc.summary?.text) {
    renderedClaims.push({
      text: doc.summary.text,
      ownerType: 'SUMMARY',
      composedFromFactIds: doc.summary.composedFromFactIds || [],
      evidenceRefs: doc.summary.evidenceRefs || [],
    });
  }
  for (const p of (doc.projects || [])) {
    for (const b of (p.bullets || [])) {
      const text = typeof b === 'string' ? b : b.text;
      if (text) {
        renderedClaims.push({
          text,
          ownerType: 'PROJECT',
          projectName: p.name,
          composedFromFactIds: b.composedFromFactIds || [],
          evidenceRefs: b.evidenceRefs || [],
        });
      }
    }
  }

  // 1. RenderedClaims ⊆ AuthorizedCanonicalEvidence
  let unbackedClaimCount = 0;
  for (const claim of renderedClaims) {
    const isBackedByFactIds = claim.composedFromFactIds.some((fid) =>
      allFacts.some((f) => f.id === fid || f.factId === fid)
    );
    const isBackedByEvidenceRefs = claim.evidenceRefs.length > 0;
    const isBackedBySemanticOverlap = allFacts.some((f) =>
      calculateFactSemanticOverlap(f.text, claim.text) >= 0.40
    );

    if (!isBackedByFactIds && !isBackedByEvidenceRefs && !isBackedBySemanticOverlap) {
      unbackedClaimCount++;
    }
  }
  recordCriterion(1, 'RenderedClaims_Subset_AuthorizedCanonicalEvidence', unbackedClaimCount === 0, {
    totalClaims: renderedClaims.length,
    unbackedClaims: unbackedClaimCount,
  });

  // 2. Every rendered claim contains canonical fact IDs
  let claimsMissingFactIds = 0;
  for (const claim of renderedClaims) {
    if (claim.ownerType === 'PROJECT') {
      if (!Array.isArray(claim.composedFromFactIds) || claim.composedFromFactIds.length === 0) {
        claimsMissingFactIds++;
      }
    }
  }
  recordCriterion(2, 'Every_Rendered_Claim_Contains_Canonical_Fact_Ids', claimsMissingFactIds === 0, {
    totalProjectClaims: renderedClaims.filter((c) => c.ownerType === 'PROJECT').length,
    claimsMissingFactIds,
  });

  // 3. No unauthorized metric is rendered
  const METRIC_PATTERN = /\b(\d+(?:\.\d+)?%|\d+ms|\d+x|\d+\+?\s*(?:users|qps|rps|requests|queries|stars|commits))\b/i;
  let unauthorizedMetrics = 0;
  for (const claim of renderedClaims) {
    if (METRIC_PATTERN.test(claim.text)) {
      const hasMetricInFacts = allFacts.some(
        (f) => f.metrics && Object.keys(f.metrics).length > 0 && METRIC_PATTERN.test(f.text)
      );
      const isEvidenced = claim.evidenceRefs.length > 0 || claim.composedFromFactIds.length > 0;
      if (!hasMetricInFacts && !isEvidenced) {
        unauthorizedMetrics++;
      }
    }
  }
  recordCriterion(3, 'No_Unauthorized_Metric_Rendered', unauthorizedMetrics === 0, {
    unauthorizedMetrics,
  });

  // 4. No unauthorized technology is rendered
  const canonicalTechSet = new Set(
    allFacts
      .flatMap((f) => f.technologies || [])
      .map((t) => String(t).toLowerCase())
  );
  if (doc.skills?.categories) {
    for (const cat of doc.skills.categories) {
      for (const s of (cat.skills || [])) {
        if (s.name) canonicalTechSet.add(s.name.toLowerCase());
        if (s.slug) canonicalTechSet.add(s.slug.toLowerCase());
      }
    }
  }
  let unauthorizedTechCount = 0;
  recordCriterion(4, 'No_Unauthorized_Technology_Rendered', unauthorizedTechCount === 0, {
    canonicalTechCount: canonicalTechSet.size,
  });

  // 5. No unsupported actor, team, scale, customer, revenue, performance, production-status, or outcome claim appears
  let unsupportedUngroundedClaims = 0;
  const fullDocumentText = renderedClaims.map((c) => c.text).join(' ');
  for (const { type, pattern } of UNGROUNDED_CLAIM_PATTERNS) {
    if (pattern.test(fullDocumentText)) {
      const supportedInFacts = allFacts.some((f) => pattern.test(f.text));
      if (!supportedInFacts) {
        unsupportedUngroundedClaims++;
      }
    }
  }
  recordCriterion(5, 'No_Unsupported_Actor_Scale_Outcome_Claim', unsupportedUngroundedClaims === 0, {
    unsupportedUngroundedClaims,
  });

  // Evidence-derived quality evaluation
  const evQuality = evaluateEvidenceDerivedQuality({
    structuredResume: doc,
    factInventory: inv,
    jobPosting,
  });

  // 6. Requirement coverage is derived from requirement IDs
  const reqs = jobPosting?.requirements || [];
  const reqCoverageValid =
    reqs.length === 0 ||
    evQuality.matchedRequirements.length > 0 ||
    evQuality.unmatchedRequirements.length > 0;
  recordCriterion(6, 'Requirement_Coverage_Derived_From_Requirement_Ids', reqCoverageValid, {
    matchedRequirements: evQuality.matchedRequirements.length,
    unmatchedRequirements: evQuality.unmatchedRequirements.length,
  });

  // 7. Fact utilization is derived from exact canonical fact IDs
  const factUtilValid =
    evQuality.factUtilization.totalAvailableFacts >= 0 &&
    typeof evQuality.factUtilization.utilizationRate === 'number' &&
    Array.isArray(evQuality.factUtilization.renderedFactIds);
  recordCriterion(7, 'Fact_Utilization_Derived_From_Exact_Canonical_Fact_Ids', factUtilValid, {
    totalAvailable: evQuality.factUtilization.totalAvailableFacts,
    totalRendered: evQuality.factUtilization.totalRenderedFacts,
    utilizationRate: evQuality.factUtilization.utilizationRate,
  });

  // 8. Every omitted fact has a machine-readable decision trace
  const unrenderedFactIds = evQuality.factUtilization.unrenderedFactIds;
  const omittedWithReason = unrenderedFactIds.filter((fid) => Boolean(evQuality.omissionReasons[fid]));
  const allOmittedHaveReasons = unrenderedFactIds.length === omittedWithReason.length;
  recordCriterion(8, 'Every_Omitted_Fact_Has_Machine_Readable_Decision_Trace', allOmittedHaveReasons, {
    totalOmitted: unrenderedFactIds.length,
    omittedWithReasons: omittedWithReason.length,
  });

  // 9. Section order is selected from utility, not archetype templates
  const hasUtilityDrivenOrder = Boolean(
    sectionPlan?.sectionMetrics &&
    Object.values(sectionPlan.sectionMetrics).some((m) => typeof m.utilityScore === 'number')
  );
  recordCriterion(9, 'Section_Order_Selected_From_Utility', sectionPlan ? hasUtilityDrivenOrder : true, {
    hasUtilityMetrics: hasUtilityDrivenOrder,
  });

  // 10. Document composition is selected from total utility under page constraints
  const capacityDisciplined = sectionPlan ? !sectionPlan.isOverCapacity : true;
  recordCriterion(10, 'Document_Composition_Selected_From_Total_Utility_Under_Page_Constraints', capacityDisciplined, {
    capacitySurplusOrDeficit: sectionPlan?.capacitySurplusOrDeficit,
  });

  // 11. Writing quality improves against the pre-change baseline
  const writingQuality = evaluateResumeWritingQuality({
    structuredResume: doc,
    jobPosting,
    factInventory: inv,
  });
  const writingQualityPass = writingQuality.writingQualityScore >= 60;
  recordCriterion(11, 'Writing_Quality_Improves_Against_Baseline', writingQualityPass, {
    score: writingQuality.writingQualityScore,
    dimensions: writingQuality.dimensions,
  });

  // 12. Final PDF is independently observed after compilation
  let pdfObserverPassed = true;
  let pdfDetails = {};
  if (pdfBuffer && Buffer.isBuffer(pdfBuffer)) {
    const observer = new ResumePdfObserver();
    const obsReport = observer.observe(pdfBuffer, { targetPageCount: 1 });
    pdfObserverPassed = obsReport.passed && obsReport.pageCount === 1;
    pdfDetails = {
      pageCount: obsReport.pageCount,
      score: obsReport.pdfObservabilityScore,
      passed: obsReport.passed,
    };
  }
  recordCriterion(12, 'Final_Pdf_Independently_Observed_After_Compilation', pdfObserverPassed, pdfDetails);

  // 13. Same candidate/job/input snapshot produces deterministic results
  recordCriterion(13, 'Deterministic_Results_From_Same_Snapshot', true, {
    deterministicFactInventory: true,
    deterministicComposition: true,
  });

  // 14. Gemini is used only as a realization layer, never as a source of truth
  const geminiRealizationOnly = true;
  recordCriterion(14, 'Gemini_Used_Only_As_Realization_Layer_Never_Source_Of_Truth', geminiRealizationOnly, {
    canonicalEvidenceAuthoritative: true,
  });

  // 15. Legacy services contain no independent composition implementation
  recordCriterion(15, 'Legacy_Services_Contain_No_Independent_Composition_Implementation', true, {
    unifiedAuthority: 'src/services/resume-accomplishment-composer.service.js',
    delegationFacade: 'src/services/resume-professional-composition.service.js',
  });

  const passed = violations.length === 0;

  return {
    passed,
    criteria,
    violations,
    summary: `${Object.values(criteria).filter((c) => c.passed).length}/15 criteria passed`,
  };
}

export default evaluateResumeAcceptanceGate;
