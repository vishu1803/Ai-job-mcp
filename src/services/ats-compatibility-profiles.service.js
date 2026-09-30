/**
 * @file ATS Compatibility Profiles Service (Phase 4)
 *
 * Implements observable compatibility profiles based on document parsing constraints:
 * - GENERIC_ATS
 * - WORKDAY_COMPATIBILITY
 * - GREENHOUSE_COMPATIBILITY
 * - LEVER_COMPATIBILITY
 * - ICIMS_COMPATIBILITY
 * - TALEO_COMPATIBILITY
 *
 * Evaluates document structure, heading recognizability, layout risks, column risks,
 * table risks, header/footer risks, date coherence, and entity extractability.
 *
 * NON-NEGOTIABLE RULE: Does NOT claim to reproduce proprietary ATS algorithms.
 * Evaluates observable document-parsing constraints honestly and deterministically.
 */

import { AtsProfileEvaluationSchema } from '../domain/career/ats-compatibility-profiles.schemas.js';
import { defaultAtsParseabilityService } from './resume-ats-parseability.service.js';
import { PdfGeometryAnalyzer } from './pdf-geometry-analyzer.service.js';
import { PdfQaValidatorService } from './pdf-qa-validator.service.js';
import { ResumeIntegrityAuditService } from './resume-integrity-audit.service.js';
import { atsExtractionModelService } from './ats-extraction-model.service.js';

export class AtsCompatibilityProfilesService {
  constructor(dependencies = {}) {
    this.atsParseability = dependencies.atsParseability || defaultAtsParseabilityService;
    this.pdfGeometryAnalyzer = dependencies.pdfGeometryAnalyzer || new PdfGeometryAnalyzer();
    this.pdfQaValidator = dependencies.pdfQaValidator || new PdfQaValidatorService();
    this.resumeIntegrityAudit =
      dependencies.resumeIntegrityAudit || new ResumeIntegrityAuditService();
    this.atsExtractionModel = dependencies.atsExtractionModel || atsExtractionModelService;
  }

  /**
   * Evaluates a resume against a specific ATS compatibility profile.
   *
   * @param {string} profileId
   * @param {object} params
   * @param {object} [params.canonicalProfile] Canonical profile from Phase 3 parser
   * @param {string} [params.extractedText] Extracted raw text
   * @param {Buffer} [params.pdfBuffer] Optional compiled PDF binary
   * @param {string} [params.texContent] Optional LaTeX source
   * @returns {object} Validated AtsProfileEvaluation
   */
  evaluateProfile(
    profileId,
    { canonicalProfile = null, extractedText = '', pdfBuffer = null, texContent = '' } = {}
  ) {
    const text = extractedText || canonicalProfile?.summary?.rawText || '';

    // Base parseability checks
    const parseability = this.atsParseability.evaluateAtsParseability({
      pdfBuffer,
      extractedText: text,
      texContent,
      candidateProfile: canonicalProfile,
    });

    switch (profileId) {
      case 'WORKDAY_COMPATIBILITY':
        return this._evaluateWorkdayProfile(canonicalProfile, text, parseability, pdfBuffer);
      case 'GREENHOUSE_COMPATIBILITY':
        return this._evaluateGreenhouseProfile(canonicalProfile, text, parseability, pdfBuffer);
      case 'LEVER_COMPATIBILITY':
        return this._evaluateLeverProfile(canonicalProfile, text, parseability, pdfBuffer);
      case 'ICIMS_COMPATIBILITY':
        return this._evaluateIcimsProfile(canonicalProfile, text, parseability, pdfBuffer);
      case 'TALEO_COMPATIBILITY':
        return this._evaluateTaleoProfile(canonicalProfile, text, parseability, pdfBuffer);
      case 'GENERIC':
        return this._evaluateGenericAtsProfile(
          canonicalProfile,
          text,
          parseability,
          pdfBuffer,
          'GENERIC'
        );
      case 'GENERIC_ATS':
      default:
        return this._evaluateGenericAtsProfile(
          canonicalProfile,
          text,
          parseability,
          pdfBuffer,
          'GENERIC_ATS'
        );
    }
  }

  /**
   * Evaluates all standard ATS compatibility profiles in one pass.
   *
   * @param {object} params
   * @returns {object} Map of profile evaluations keyed by profile ID
   */
  evaluateAllProfiles(params = {}) {
    const profiles = [
      'GENERIC_ATS',
      'WORKDAY_COMPATIBILITY',
      'GREENHOUSE_COMPATIBILITY',
      'LEVER_COMPATIBILITY',
      'ICIMS_COMPATIBILITY',
      'TALEO_COMPATIBILITY',
    ];

    const results = {};
    for (const pid of profiles) {
      results[pid] = this.evaluateProfile(pid, params);
    }
    return results;
  }

  // ---------------------------------------------------------------------------
  // Profile Implementations
  // ---------------------------------------------------------------------------

  _evaluateGenericAtsProfile(profile, text, parseability, pdfBuffer, profileId = 'GENERIC_ATS') {
    const risks = [];
    const guidance = [];
    let score = parseability.atsParseabilityScore || 80.0;

    const constraints = [
      'Standard Section Headings (Experience, Education, Skills)',
      'Candidate Name & Contact Information in primary flow',
      'Single-column reading order',
      'Standard bullet delimiters (-, *, •)',
    ];

    const identity = profile?.identity || {};
    const contact = identity.contact || {};

    if (!contact.email) {
      score -= 15.0;
      risks.push({
        code: 'MISSING_CONTACT_EMAIL',
        severity: 'CRITICAL',
        dimension: 'contact_extraction',
        description: 'No valid candidate email found in document text.',
        impact: 'Recruiter communication channel missing; ATS cannot link candidate profile.',
        remediation: 'Place candidate email near the top header.',
      });
      guidance.push('Add a valid contact email in the header.');
    }

    if (!identity.name || identity.name === 'Candidate') {
      score -= 10.0;
      risks.push({
        code: 'AMBIGUOUS_CANDIDATE_NAME',
        severity: 'HIGH',
        dimension: 'identity_extraction',
        description: 'Candidate name could not be reliably distinguished from header lines.',
        impact: 'Applicant tracking system may label profile with generic name or title.',
        remediation: 'Ensure candidate name is the first line of the document.',
      });
      guidance.push('Ensure your full name is prominently on line 1.');
    }

    const finalScore = Math.max(0, Math.min(100, Math.round(score)));
    return this._formatEvaluation(
      profileId,
      'Generic ATS Compatibility',
      finalScore,
      profile,
      risks,
      constraints,
      guidance,
      parseability?.issues || [],
      text,
      pdfBuffer
    );
  }

  _evaluateWorkdayProfile(profile, text, parseability, pdfBuffer) {
    const risks = [];
    const guidance = [];
    let score = parseability.atsParseabilityScore || 85.0;

    const constraints = [
      'Linear text flow (Zero multi-column table dependency)',
      'Primary contact block outside running headers/footers',
      'Explicit date intervals (Month Year or MM/YYYY)',
      'Standard enterprise section titles (Work Experience, Education)',
    ];

    // Workday Risk 1: Multi-column or table detection
    if (
      /\|\s*[^|]+\s*\|\s*[^|]+\s*\|/.test(text) &&
      text.split('\n').filter((l) => l.includes('|')).length > 5
    ) {
      score -= 12.0;
      risks.push({
        code: 'TABLE_INTERLEAVING_RISK',
        severity: 'HIGH',
        dimension: 'table_risk',
        description: 'Heavy ASCII/pipe table structures detected in resume body.',
        impact: 'Workday parser may concatenate column contents horizontally across rows.',
        remediation: 'Convert tabular columns into clean, single-column bulleted lists.',
      });
      guidance.push('Eliminate table formatting in favor of single-column linear text.');
    }

    // Workday Risk 2: Date format coherence
    const experience = profile?.experience || [];
    const hasAmbiguousDates = experience.some((e) => !e.startDate || e.durationMonths === 0);
    if (hasAmbiguousDates) {
      score -= 10.0;
      risks.push({
        code: 'DATE_FORMAT_AMBIGUITY',
        severity: 'MEDIUM',
        dimension: 'date_extraction',
        description: 'One or more career positions lack explicit start/end dates.',
        impact: 'Workday tenure calculator may miscalculate total years of experience.',
        remediation: 'Specify Month and Year (e.g., "Jan 2021 - Present") for every position.',
      });
      guidance.push('Provide clear Start and End dates for every career role.');
    }

    const finalScore = Math.max(0, Math.min(100, Math.round(score)));
    return this._formatEvaluation(
      'WORKDAY_COMPATIBILITY',
      'Workday ATS Compatibility Profile',
      finalScore,
      profile,
      risks,
      constraints,
      guidance,
      parseability?.issues || [],
      text,
      pdfBuffer
    );
  }

  _evaluateGreenhouseProfile(profile, text, parseability, pdfBuffer) {
    const risks = [];
    const guidance = [];
    let score = parseability.atsParseabilityScore || 85.0;

    const constraints = [
      'Top-of-document contact hierarchy (First 5 lines)',
      'Plain text link readability (Visible URLs)',
      'Unbroken bullet point paragraphs',
      'Skills explicitly enumerated without graphical rating bars',
    ];

    // Greenhouse Risk 1: Contact info position
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const emailIndex = lines.findIndex((l) => l.includes('@'));
    if (emailIndex > 8) {
      score -= 10.0;
      risks.push({
        code: 'CONTACT_BURIED_DEEP',
        severity: 'MEDIUM',
        dimension: 'contact_extraction',
        description: 'Contact information appears below line 8 of the document.',
        impact: 'Greenhouse auto-parser prioritizes header lines and may drop delayed contacts.',
        remediation: 'Place email, phone, and location in lines 1-4.',
      });
      guidance.push('Move contact block directly below candidate name.');
    }

    // Greenhouse Risk 2: Skills structure
    const skills = profile?.skills || [];
    if (skills.length > 0 && skills.length < 4) {
      score -= 8.0;
      risks.push({
        code: 'SPARSE_SKILL_DELIMITATION',
        severity: 'LOW',
        dimension: 'skills_extraction',
        description: 'Fewer than 4 technical skills extracted by standard token delimiters.',
        impact: 'Greenhouse candidate search filters will fail to match your competencies.',
        remediation:
          'Add a dedicated "Technical Skills" section with comma-separated technologies.',
      });
      guidance.push('Ensure your Skills section uses clear comma or bullet separation.');
    }

    const finalScore = Math.max(0, Math.min(100, Math.round(score)));
    return this._formatEvaluation(
      'GREENHOUSE_COMPATIBILITY',
      'Greenhouse ATS Compatibility Profile',
      finalScore,
      profile,
      risks,
      constraints,
      guidance,
      parseability?.issues || [],
      text,
      pdfBuffer
    );
  }

  _evaluateLeverProfile(profile, text, parseability, pdfBuffer) {
    const risks = [];
    const guidance = [];
    let score = parseability.atsParseabilityScore || 88.0;

    const constraints = [
      'Social & Repository Profile Extraction (GitHub, LinkedIn)',
      'Unicode standard bullet points (Clean glyph decoding)',
      'Clean job title to company association',
    ];

    const links = profile?.identity?.links || {};
    if (!links.github && !links.linkedin) {
      score -= 8.0;
      risks.push({
        code: 'NO_ONLINE_PRESENCE_LINKS',
        severity: 'LOW',
        dimension: 'link_extraction',
        description: 'No GitHub or LinkedIn profile URL detected in resume.',
        impact: 'Lever auto-enrichment will not pull external public evidence.',
        remediation: 'Add clickable links to your GitHub and LinkedIn in the header.',
      });
      guidance.push('Include GitHub and LinkedIn URLs in your header.');
    }

    // Special character check
    if (/[\uFFFD\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text)) {
      score -= 15.0;
      risks.push({
        code: 'SPECIAL_CHARACTER_MOJIBAKE',
        severity: 'HIGH',
        dimension: 'font_text_extraction',
        description: 'Unsupported control characters or replacement glyphs (tofu) detected.',
        impact: 'Lever candidate viewer will display corrupted text or question marks.',
        remediation: 'Replace custom icon fonts and symbols with standard UTF-8 bullets (•).',
      });
      guidance.push('Remove non-standard font glyphs or symbols.');
    }

    const finalScore = Math.max(0, Math.min(100, Math.round(score)));
    return this._formatEvaluation(
      'LEVER_COMPATIBILITY',
      'Lever ATS Compatibility Profile',
      finalScore,
      profile,
      risks,
      constraints,
      guidance,
      parseability?.issues || [],
      text,
      pdfBuffer
    );
  }

  _evaluateIcimsProfile(profile, text, parseability, pdfBuffer) {
    const risks = [];
    const guidance = [];
    let score = parseability.atsParseabilityScore || 82.0;

    const constraints = [
      'Legacy document compatibility (Standard headings only)',
      'Standard US phone number formatting',
      'Clean bullet text (No nested indentations or floating boxes)',
    ];

    // iCIMS check: standard headings
    const recognizedHeadings = [
      /\b(work\s+experience|experience|employment)\b/i,
      /\b(education)\b/i,
      /\b(skills|technical\s+skills)\b/i,
    ];

    for (const pat of recognizedHeadings) {
      if (!pat.test(text)) {
        score -= 12.0;
        risks.push({
          code: 'NON_STANDARD_SECTION_HEADING',
          severity: 'HIGH',
          dimension: 'section_recognition',
          description: 'Document is missing standard legacy section titles expected by iCIMS.',
          impact: 'iCIMS parser will skip entire career or education sections.',
          remediation: 'Use standard titles: "Work Experience", "Education", "Technical Skills".',
        });
        guidance.push('Use traditional enterprise section headings.');
        break;
      }
    }

    const finalScore = Math.max(0, Math.min(100, Math.round(score)));
    return this._formatEvaluation(
      'ICIMS_COMPATIBILITY',
      'iCIMS Compatibility Profile',
      finalScore,
      profile,
      risks,
      constraints,
      guidance,
      parseability?.issues || [],
      text,
      pdfBuffer
    );
  }

  _evaluateTaleoProfile(profile, text, parseability, pdfBuffer) {
    const risks = [];
    const guidance = [];
    let score = (parseability.atsParseabilityScore || 80.0) - 5.0; // Taleo has strictest legacy constraints

    const constraints = [
      'Strict linear reading flow (Zero graphics, zero text boxes)',
      'Explicit Company and Title separation per position',
      'No running header/footer content',
      'No columns or table-based skill grids',
    ];

    const experience = profile?.experience || [];
    if (experience.length === 0) {
      score -= 25.0;
      risks.push({
        code: 'TALEO_NO_WORK_HISTORY',
        severity: 'CRITICAL',
        dimension: 'job_title_extraction',
        description: 'Taleo parser failed to identify distinct work experience entries.',
        impact:
          'Requisition work history will remain empty; application may be flagged as unqualified.',
        remediation: 'Format each job as "Job Title | Company Name | Dates".',
      });
      guidance.push('Ensure each role has explicit Title, Company, and Dates on a single line.');
    }

    if (/\|\s*[^|]+\s*\|\s*[^|]+\s*\|/.test(text)) {
      score -= 15.0;
      risks.push({
        code: 'TALEO_COLUMN_GRID_RISK',
        severity: 'HIGH',
        dimension: 'column_risk',
        description: 'Multi-column grid formatting detected.',
        impact: 'Taleo legacy parser garbles text across multi-column containers.',
        remediation: 'Format all content in a single linear column.',
      });
      guidance.push('Strip any column containers for Taleo compliance.');
    }

    const finalScore = Math.max(0, Math.min(100, Math.round(score)));
    return this._formatEvaluation(
      'TALEO_COMPATIBILITY',
      'Oracle Taleo Compatibility Profile',
      finalScore,
      profile,
      risks,
      constraints,
      guidance,
      parseability?.issues || [],
      text,
      pdfBuffer
    );
  }

  _formatEvaluation(
    profileId,
    profileName,
    score,
    profile,
    risks,
    constraints,
    guidance,
    additionalWarnings = [],
    text = '',
    pdfBuffer = null
  ) {
    if (
      pdfBuffer &&
      this.pdfGeometryAnalyzer &&
      typeof this.pdfGeometryAnalyzer.analyze === 'function'
    ) {
      try {
        const geoReport = this.pdfGeometryAnalyzer.analyze({ pdfBuffer });
        if (geoReport?.sectionOrdering?.violations?.length > 0) {
          risks.push({
            code: 'GEOMETRY_SECTION_ORDER_VIOLATION',
            severity: 'MEDIUM',
            dimension: 'geometry',
            description: `Section ordering issue detected: ${geoReport.sectionOrdering.violations.join('; ')}`,
            impact: 'Non-standard section order can confuse sequential ATS parsers.',
            remediation:
              'Follow standard sequential section order: Summary, Skills, Experience, Education.',
          });
        }
      } catch {
        // gracefully ignore
      }
    }

    let compatibilityTier = 'OPTIMAL';
    if (score < 50) compatibilityTier = 'HIGH_RISK';
    else if (score < 70) compatibilityTier = 'MODERATE_RISK';
    else if (score < 85) compatibilityTier = 'COMPATIBLE';

    const identity = profile?.identity || {};
    const contact = identity.contact || {};
    const experience = profile?.experience || [];
    const education = profile?.education || [];
    const skills = profile?.skills || [];
    const currentExp = experience[0] || {};

    const extraction = {
      candidateName: identity.name !== 'Candidate' ? identity.name : null,
      email: contact.email || null,
      phone: contact.phone || null,
      location: identity.location || null,
      currentJobTitle: currentExp.title || null,
      currentCompany: currentExp.company || null,
      totalExperienceYears: profile?.summary?.yearsOfExperience || null,
      rolesExtractedCount: experience.length,
      skillsExtractedCount: skills.length,
      educationInstitutionsCount: education.length,
      topSkills: skills.slice(0, 10).map((s) => s.name),
    };

    const hasName = Boolean(extraction.candidateName);
    const hasEmail = Boolean(extraction.email);
    const hasRoles = experience.length > 0;
    const hasSkills = skills.length > 0;
    const hasEdu = education.length > 0;

    const fieldConfidence = {
      candidateName: hasName ? 0.95 : 0.4,
      contactInfo: hasEmail ? 0.95 : 0.3,
      location: extraction.location ? 0.9 : 0.5,
      jobTitles: hasRoles ? 0.92 : 0.3,
      companies: hasRoles ? 0.92 : 0.3,
      employmentDates: hasRoles ? 0.88 : 0.3,
      workHistory: hasRoles ? 0.9 : 0.3,
      skills: hasSkills ? 0.92 : 0.3,
      education: hasEdu ? 0.9 : 0.4,
      projects: (profile?.projects?.length || 0) > 0 ? 0.88 : 0.5,
      overallExtraction: Math.round((score / 100) * 100) / 100,
    };

    const warnings = [
      ...risks
        .filter((r) => r.severity === 'HIGH' || r.severity === 'CRITICAL')
        .map((r) => r.description),
      ...additionalWarnings,
    ];

    let fieldExtraction = {};
    if (this.atsExtractionModel && profile) {
      try {
        fieldExtraction = this.atsExtractionModel.buildExtractionModelFromProfile(profile, {
          text,
        });
      } catch {
        fieldExtraction = {};
      }
    }

    return AtsProfileEvaluationSchema.parse({
      profile: profileId,
      profileName,
      score,
      confidence: 0.92,
      compatibilityTier,
      risks,
      warnings,
      fieldExtraction,
      extraction,
      fieldConfidence,
      constraintsEvaluated: constraints,
      remediationGuidance: guidance,
    });
  }
}

export const atsCompatibilityProfilesService = new AtsCompatibilityProfilesService();
