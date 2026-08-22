/**
 * @file Resume Presentation & Visual Preservation Service (P6-001 Continuation)
 *
 * Implements presentation mode separation, fingerprinting, and preservation invariants:
 * - ResumeTemplateRenderer interface contract (for GENERATE_NEW)
 * - PresentationFingerprintEngine: Deterministic non-content visual styling fingerprinting
 * - ResumePresentationService: Presentation audit, format-specific preservation validation (DOCX, PDF, Plain Text)
 *
 * Invariant: "Tailoring changes WHAT the resume says, not HOW the resume looks."
 */

import crypto from 'node:crypto';
import { ValidationError } from '../errors/index.js';
import { logger } from '../utils/logger.js';
import {
  ResumePresentationModeEnum,
  ResumeTemplateIdEnum,
  SourceDocumentFormatEnum,
} from '../domain/career/resume.schemas.js';

/**
 * Standard templates metadata catalog for GENERATE_NEW mode.
 */
export const TEMPLATE_METADATA_CATALOG = {
  ATS_FOCUSED: {
    templateId: 'ATS_FOCUSED',
    name: 'ATS Optimized Clean',
    description:
      'Single-column, linear visual flow, standard typography optimized for maximum ATS parser compliance.',
    category: 'ATS',
    defaultFont: 'Arial',
    supportsMultiColumn: false,
    isAtsOptimized: true,
  },
  PROFESSIONAL: {
    templateId: 'PROFESSIONAL',
    name: 'Executive Professional',
    description:
      'Classic executive typography with subtle horizontal dividers and balanced margins.',
    category: 'EXECUTIVE',
    defaultFont: 'Calibri',
    supportsMultiColumn: false,
    isAtsOptimized: true,
  },
  MODERN: {
    templateId: 'MODERN',
    name: 'Modern Clean',
    description:
      'Contemporary sans-serif aesthetic with streamlined header hierarchy and clean white space.',
    category: 'MODERN',
    defaultFont: 'Inter',
    supportsMultiColumn: true,
    isAtsOptimized: true,
  },
  MINIMAL: {
    templateId: 'MINIMAL',
    name: 'Minimalist Monospace/Sans',
    description:
      'Ultra-clean typographic layout emphasizing content density and clarity with minimal decoration.',
    category: 'MINIMAL',
    defaultFont: 'Roboto',
    supportsMultiColumn: false,
    isAtsOptimized: true,
  },
  TRADITIONAL: {
    templateId: 'TRADITIONAL',
    name: 'Traditional Academic / Corporate',
    description: 'Serif typography with centered headers and conventional corporate styling.',
    category: 'TRADITIONAL',
    defaultFont: 'Georgia',
    supportsMultiColumn: false,
    isAtsOptimized: true,
  },
};

/**
 * Abstract Template Renderer interface defining the boundary for future downstream renderers.
 */
export class ResumeTemplateRenderer {
  /**
   * Retrieves template metadata by identifier.
   *
   * @param {string} templateId
   * @returns {Object}
   */
  getTemplateMetadata(templateId) {
    const parsed = ResumeTemplateIdEnum.safeParse(templateId);
    if (!parsed.success) {
      throw new ValidationError(`Invalid templateId: '${templateId}'`);
    }
    return TEMPLATE_METADATA_CATALOG[parsed.data] || TEMPLATE_METADATA_CATALOG.ATS_FOCUSED;
  }

  /**
   * Abstract resume rendering method.
   *
   * @param {Object} tailoredResume
   * @param {string} templateId
   * @param {Object} [options]
   * @returns {Promise<Object>|Object}
   */
  async renderResume(_tailoredResume, _templateId, _options = {}) {
    throw new Error('renderResume must be implemented by downstream presentation adapter');
  }

  /**
   * Validates rendered output against template rules.
   *
   * @param {Object} renderedOutput
   * @param {string} _templateId
   * @returns {boolean}
   */
  validateOutput(renderedOutput, _templateId) {
    if (!renderedOutput) return false;
    return true;
  }
}

/**
 * Computes deterministic presentation fingerprints over non-content visual styling.
 */
export class PresentationFingerprintEngine {
  /**
   * Computes presentation fingerprint strictly from visual styling attributes.
   * Crucial rule: Excludes all text content from the hash.
   *
   * @param {Object} documentOrStyles
   * @param {string} [format='DOCX']
   * @returns {Object} PresentationFingerprint
   */
  static computeFingerprint(documentOrStyles = {}, format = 'DOCX') {
    const docFormat = SourceDocumentFormatEnum.safeParse(format).success ? format : 'DOCX';

    const styles = documentOrStyles.styles || documentOrStyles;

    // 1. Typography (normalized, sorted)
    const fontFamilies = Array.isArray(styles.fontFamilies)
      ? [...new Set(styles.fontFamilies.map((f) => String(f).trim()))].sort()
      : styles.fontFamily
        ? [String(styles.fontFamily).trim()]
        : ['Calibri'];

    const primaryFontSize = styles.fontSize || styles.primaryFontSize || '11pt';
    const headingFontSizes = Array.isArray(styles.headingFontSizes)
      ? [...styles.headingFontSizes]
      : ['14pt', '16pt'];

    // 2. Paragraph & Spacing Styles
    const lineSpacing = styles.lineSpacing || 1.15;
    const spacingAfter = styles.spacingAfter || styles.paragraphSpacing || '6pt';
    const alignment = styles.alignment || 'LEFT';

    // 3. Page Settings & Margins
    const margins = {
      top: styles.margins?.top || styles.marginTop || '1in',
      bottom: styles.margins?.bottom || styles.marginBottom || '1in',
      left: styles.margins?.left || styles.marginLeft || '1in',
      right: styles.margins?.right || styles.marginRight || '1in',
    };

    const orientation = styles.orientation || 'PORTRAIT';
    const dimensions = styles.dimensions || { width: '8.5in', height: '11in', unit: 'in' };

    // 4. Color Palette (normalized, sorted)
    const colorPalette = Array.isArray(styles.colorPalette)
      ? [...new Set(styles.colorPalette.map((c) => String(c).trim().toLowerCase()))].sort()
      : styles.textColor
        ? [String(styles.textColor).trim().toLowerCase()]
        : ['#000000'];

    // 5. Structural Layout
    const columnCount = Number(styles.columnCount || 1);
    const sectionCount = Number(styles.sectionCount || 0);
    const sectionHeaders = Array.isArray(styles.sectionHeaders)
      ? [...styles.sectionHeaders.map((h) => String(h).trim())]
      : [];
    const hasHeader = Boolean(styles.hasHeader);
    const hasFooter = Boolean(styles.hasFooter);

    // 6. Build canonical non-content payload for hashing
    const canonicalVisualData = {
      docFormat,
      fontFamilies,
      primaryFontSize: String(primaryFontSize),
      headingFontSizes: headingFontSizes.map(String),
      lineSpacing: String(lineSpacing),
      spacingAfter: String(spacingAfter),
      alignment,
      margins,
      orientation,
      dimensions,
      colorPalette,
      columnCount,
      sectionCount,
      hasHeader,
      hasFooter,
    };

    const visualJson = JSON.stringify(canonicalVisualData);
    const fingerprintHash = crypto.createHash('sha256').update(visualJson).digest('hex');

    return {
      documentFormat: docFormat,
      typography: {
        fontFamilies,
        primaryFontSize,
        headingFontSizes,
      },
      paragraphStyles: {
        lineSpacing,
        spacingAfter,
        alignment,
      },
      pageSettings: {
        margins,
        orientation,
        dimensions,
      },
      colorPalette,
      structuralLayout: {
        columnCount,
        sectionCount,
        sectionHeaders,
        hasHeader,
        hasFooter,
      },
      fingerprintHash,
    };
  }

  /**
   * Compares source and target presentation fingerprints to verify preservation.
   *
   * @param {Object} sourceFingerprint
   * @param {Object} targetFingerprint
   * @returns {Object} Comparison result with discrepancies and attribute mappings
   */
  static compareFingerprints(sourceFingerprint, targetFingerprint) {
    if (!sourceFingerprint || !targetFingerprint) {
      return {
        matches: false,
        discrepancies: ['Missing source or target presentation fingerprint'],
        preservedAttributes: {},
        modifiedAttributes: {},
      };
    }

    const discrepancies = [];

    // Check Typography
    const srcFonts = (sourceFingerprint.typography?.fontFamilies || []).join(',');
    const tgtFonts = (targetFingerprint.typography?.fontFamilies || []).join(',');
    if (srcFonts !== tgtFonts) {
      discrepancies.push(`Typography modified: source=[${srcFonts}] target=[${tgtFonts}]`);
    }

    if (
      String(sourceFingerprint.typography?.primaryFontSize) !==
      String(targetFingerprint.typography?.primaryFontSize)
    ) {
      discrepancies.push(
        `Primary font size modified: source=${sourceFingerprint.typography?.primaryFontSize} target=${targetFingerprint.typography?.primaryFontSize}`
      );
    }

    // Check Margins
    const srcMargins = JSON.stringify(sourceFingerprint.pageSettings?.margins || {});
    const tgtMargins = JSON.stringify(targetFingerprint.pageSettings?.margins || {});
    if (srcMargins !== tgtMargins) {
      discrepancies.push(`Page margins modified: source=${srcMargins} target=${tgtMargins}`);
    }

    // Check Colors
    const srcColors = (sourceFingerprint.colorPalette || []).join(',');
    const tgtColors = (targetFingerprint.colorPalette || []).join(',');
    if (srcColors !== tgtColors) {
      discrepancies.push(`Color palette modified: source=[${srcColors}] target=[${tgtColors}]`);
    }

    // Check Spacing
    if (
      String(sourceFingerprint.paragraphStyles?.lineSpacing) !==
      String(targetFingerprint.paragraphStyles?.lineSpacing)
    ) {
      discrepancies.push(
        `Line spacing modified: source=${sourceFingerprint.paragraphStyles?.lineSpacing} target=${targetFingerprint.paragraphStyles?.lineSpacing}`
      );
    }

    // Check Structural Columns
    if (
      sourceFingerprint.structuralLayout?.columnCount !==
      targetFingerprint.structuralLayout?.columnCount
    ) {
      discrepancies.push(
        `Layout column count modified: source=${sourceFingerprint.structuralLayout?.columnCount} target=${targetFingerprint.structuralLayout?.columnCount}`
      );
    }

    const matches = discrepancies.length === 0;

    const preservedAttributes = {
      fontFamily: sourceFingerprint.typography?.fontFamilies?.[0] || 'Calibri',
      fontSize: sourceFingerprint.typography?.primaryFontSize || '11pt',
      fontWeight: 'Normal',
      textColor: sourceFingerprint.colorPalette?.[0] || '#000000',
      margins: sourceFingerprint.pageSettings?.margins || {
        top: '1in',
        bottom: '1in',
        left: '1in',
        right: '1in',
      },
      lineSpacing: sourceFingerprint.paragraphStyles?.lineSpacing || 1.15,
      paragraphSpacing: sourceFingerprint.paragraphStyles?.spacingAfter || '6pt',
      sectionStyling: {},
      pageDimensions: sourceFingerprint.pageSettings?.dimensions || {
        width: '8.5in',
        height: '11in',
        unit: 'in',
      },
      headersAndFooters: Boolean(sourceFingerprint.structuralLayout?.hasHeader),
      layoutStructure: `${sourceFingerprint.structuralLayout?.columnCount || 1}-column layout`,
    };

    const modifiedAttributes = {
      wordingChanges: ['Updated project and experience bullet phrasing for target job alignment'],
      bulletPhrasing: true,
      summaryWording: true,
      skillEmphasis: true,
      projectOrdering: true,
      atsTerminologyAdapted: true,
      omittedIrrelevantContent: true,
    };

    return {
      matches,
      discrepancies,
      preservedAttributes,
      modifiedAttributes,
    };
  }
}

/**
 * Service orchestrating presentation auditing and mode-specific verification.
 */
export class ResumePresentationService {
  constructor() {
    this.logger = logger.child({ module: 'resume-presentation-service' });
    this.templateRenderer = new ResumeTemplateRenderer();
  }

  /**
   * Audits the presentation aspect of resume tailoring.
   *
   * @param {string} presentationMode - 'PRESERVE_EXISTING' | 'GENERATE_NEW'
   * @param {Object} [options]
   * @param {string} [options.sourceDocumentId]
   * @param {Object} [options.sourceDocument]
   * @param {string} [options.templateId]
   * @returns {Object} PresentationAuditReport
   */
  auditPresentation(presentationMode, options = {}) {
    const mode = ResumePresentationModeEnum.parse(presentationMode || 'GENERATE_NEW');

    if (mode === 'GENERATE_NEW') {
      const templateId = options.templateId
        ? ResumeTemplateIdEnum.parse(options.templateId)
        : 'ATS_FOCUSED';

      this.templateRenderer.getTemplateMetadata(templateId);

      return {
        presentationMode: 'GENERATE_NEW',
        sourceDocumentId: null,
        sourceFormat: null,
        templateId,
        presentationIntegrityStatus: 'PASS',
        preservedAttributes: undefined,
        modifiedAttributes: {
          wordingChanges: ['Generated fresh resume layout aligned with target job description'],
          bulletPhrasing: true,
          summaryWording: true,
          skillEmphasis: true,
          projectOrdering: true,
          atsTerminologyAdapted: true,
          omittedIrrelevantContent: true,
        },
        sourceFingerprint: null,
        targetFingerprint: null,
        discrepancies: [],
        warnings: [],
      };
    }

    // mode === 'PRESERVE_EXISTING'
    const sourceDoc = options.sourceDocument || {};
    const sourceDocId = options.sourceDocumentId || sourceDoc.id;

    if (!sourceDocId && !sourceDoc.rawContent && !sourceDoc.format && !sourceDoc.styles) {
      throw new ValidationError(
        'sourceDocumentId or sourceDocument is required when presentationMode is PRESERVE_EXISTING'
      );
    }

    const sourceFormat = SourceDocumentFormatEnum.safeParse(sourceDoc.format).success
      ? sourceDoc.format
      : 'DOCX';

    // Format-Specific Invariant Checks
    if (sourceFormat === 'PDF') {
      return {
        presentationMode: 'PRESERVE_EXISTING',
        sourceDocumentId: sourceDocId || 'doc-pdf-input',
        sourceFormat: 'PDF',
        templateId: null,
        presentationIntegrityStatus: 'WARNING',
        preservedAttributes: undefined,
        modifiedAttributes: {
          wordingChanges: ['Tailored textual assertions to target job description'],
          bulletPhrasing: true,
          summaryWording: true,
          skillEmphasis: true,
          projectOrdering: true,
          atsTerminologyAdapted: true,
          omittedIrrelevantContent: true,
        },
        sourceFingerprint: null,
        targetFingerprint: null,
        discrepancies: [],
        warnings: [
          'PDF format detected: exact visual layout preservation cannot be guaranteed without structural reconstruction. Review output layout.',
        ],
      };
    }

    if (sourceFormat === 'PLAIN_TEXT' || sourceFormat === 'MARKDOWN') {
      return {
        presentationMode: 'PRESERVE_EXISTING',
        sourceDocumentId: sourceDocId || 'doc-text-input',
        sourceFormat,
        templateId: null,
        presentationIntegrityStatus: 'UNSUPPORTED_PRESERVATION',
        preservedAttributes: undefined,
        modifiedAttributes: {
          wordingChanges: ['Tailored plain text bullets to target job description'],
          bulletPhrasing: true,
          summaryWording: true,
          skillEmphasis: true,
          projectOrdering: true,
          atsTerminologyAdapted: true,
          omittedIrrelevantContent: true,
        },
        sourceFingerprint: null,
        targetFingerprint: null,
        discrepancies: [],
        warnings: [
          `${sourceFormat} format lacks visual styling properties. Presentation preservation is unsupported; use GENERATE_NEW template rendering.`,
        ],
      };
    }

    // Default / DOCX format: Execute full visual fingerprint comparison
    const sourceFingerprint =
      sourceDoc.fingerprint ||
      PresentationFingerprintEngine.computeFingerprint(sourceDoc.styles || sourceDoc, 'DOCX');

    // Simulate adapted document styles (defaulting to source styles to maintain preservation)
    const targetStyles = options.targetStyles || sourceDoc.styles || sourceDoc;
    const targetFingerprint = PresentationFingerprintEngine.computeFingerprint(
      targetStyles,
      'DOCX'
    );

    const comparison = PresentationFingerprintEngine.compareFingerprints(
      sourceFingerprint,
      targetFingerprint
    );

    const presentationIntegrityStatus = comparison.matches ? 'PASS' : 'BLOCKED';

    return {
      presentationMode: 'PRESERVE_EXISTING',
      sourceDocumentId: sourceDocId || 'doc-docx-input',
      sourceFormat: 'DOCX',
      templateId: null,
      presentationIntegrityStatus,
      preservedAttributes: comparison.preservedAttributes,
      modifiedAttributes: comparison.modifiedAttributes,
      sourceFingerprint,
      targetFingerprint,
      discrepancies: comparison.discrepancies,
      warnings: comparison.matches
        ? []
        : ['Visual styling discrepancies detected between source and target document.'],
    };
  }
}
