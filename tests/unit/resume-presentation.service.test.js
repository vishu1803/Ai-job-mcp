/**
 * @file Unit Tests for Resume Presentation Service & Fingerprint Engine (P6-001 Continuation)
 *
 * Verifies:
 * 1. GENERATE_NEW mode template resolution and metadata lookup
 * 2. PRESERVE_EXISTING mode with DOCX styles preservation
 * 3. PRESERVE_EXISTING mode missing source document rejection
 * 4. PRESERVE_EXISTING mode with PDF format warning
 * 5. PRESERVE_EXISTING mode with Plain Text / Markdown unsupported preservation
 * 6. Non-content visual fingerprinting: text modification does not change fingerprint hash
 * 7. Visual styling modification (font family, margins, colors) changes fingerprint hash
 * 8. Fingerprint comparison discrepancy detection
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  ResumePresentationService,
  PresentationFingerprintEngine,
  ResumeTemplateRenderer,
} from '../../src/services/resume-presentation.service.js';
import { ValidationError } from '../../src/errors/index.js';

describe('Resume Presentation Service Unit Tests (P6-001 Continuation)', () => {
  let presentationService;
  let templateRenderer;

  beforeEach(() => {
    presentationService = new ResumePresentationService();
    templateRenderer = new ResumeTemplateRenderer();
  });

  // -------------------------------------------------------------------------
  // 1. Template Metadata Catalog & Resolution
  // -------------------------------------------------------------------------
  it('1. resolves valid template metadata for all canonical template IDs', () => {
    const templateIds = ['ATS_FOCUSED', 'PROFESSIONAL', 'MODERN', 'MINIMAL', 'TRADITIONAL'];
    for (const id of templateIds) {
      const meta = templateRenderer.getTemplateMetadata(id);
      assert.ok(meta);
      assert.strictEqual(meta.templateId, id);
      assert.ok(meta.name);
      assert.ok(meta.defaultFont);
    }
  });

  it('2. throws ValidationError when invalid templateId is requested', () => {
    assert.throws(
      () => templateRenderer.getTemplateMetadata('INVALID_TEMPLATE'),
      (err) => err instanceof ValidationError
    );
  });

  // -------------------------------------------------------------------------
  // 2. GENERATE_NEW Mode Auditing
  // -------------------------------------------------------------------------
  it('3. audits GENERATE_NEW mode with default ATS_FOCUSED template', () => {
    const report = presentationService.auditPresentation('GENERATE_NEW');
    assert.strictEqual(report.presentationMode, 'GENERATE_NEW');
    assert.strictEqual(report.templateId, 'ATS_FOCUSED');
    assert.strictEqual(report.presentationIntegrityStatus, 'PASS');
    assert.strictEqual(report.discrepancies.length, 0);
  });

  it('4. audits GENERATE_NEW mode with explicit templateId (e.g. MODERN)', () => {
    const report = presentationService.auditPresentation('GENERATE_NEW', {
      templateId: 'MODERN',
    });
    assert.strictEqual(report.presentationMode, 'GENERATE_NEW');
    assert.strictEqual(report.templateId, 'MODERN');
    assert.strictEqual(report.presentationIntegrityStatus, 'PASS');
  });

  // -------------------------------------------------------------------------
  // 3. PRESERVE_EXISTING Mode Auditing
  // -------------------------------------------------------------------------
  it('5. throws ValidationError when PRESERVE_EXISTING is called without source document', () => {
    assert.throws(
      () => presentationService.auditPresentation('PRESERVE_EXISTING'),
      (err) => {
        assert.ok(err instanceof ValidationError);
        assert.ok(err.message.includes('sourceDocumentId or sourceDocument is required'));
        return true;
      }
    );
  });

  it('6. audits PRESERVE_EXISTING mode with DOCX source document and verifies PASS when styles match', () => {
    const sourceStyles = {
      fontFamily: 'Calibri',
      fontSize: '11pt',
      margins: { top: '1in', bottom: '1in', left: '1in', right: '1in' },
      lineSpacing: 1.15,
      textColor: '#333333',
      columnCount: 1,
    };

    const report = presentationService.auditPresentation('PRESERVE_EXISTING', {
      sourceDocumentId: 'doc-12345',
      sourceDocument: {
        id: 'doc-12345',
        format: 'DOCX',
        styles: sourceStyles,
      },
    });

    assert.strictEqual(report.presentationMode, 'PRESERVE_EXISTING');
    assert.strictEqual(report.sourceFormat, 'DOCX');
    assert.strictEqual(report.presentationIntegrityStatus, 'PASS');
    assert.ok(report.preservedAttributes);
    assert.strictEqual(report.preservedAttributes.fontFamily, 'Calibri');
    assert.strictEqual(report.preservedAttributes.fontSize, '11pt');
    assert.strictEqual(report.preservedAttributes.textColor, '#333333');
    assert.ok(report.modifiedAttributes.bulletPhrasing);
    assert.strictEqual(report.discrepancies.length, 0);
  });

  it('7. flags WARNING for PRESERVE_EXISTING with PDF format', () => {
    const report = presentationService.auditPresentation('PRESERVE_EXISTING', {
      sourceDocumentId: 'doc-pdf-999',
      sourceDocument: {
        id: 'doc-pdf-999',
        format: 'PDF',
      },
    });

    assert.strictEqual(report.presentationMode, 'PRESERVE_EXISTING');
    assert.strictEqual(report.sourceFormat, 'PDF');
    assert.strictEqual(report.presentationIntegrityStatus, 'WARNING');
    assert.ok(report.warnings.some((w) => w.includes('PDF format detected')));
  });

  it('8. flags UNSUPPORTED_PRESERVATION for PRESERVE_EXISTING with Plain Text or Markdown', () => {
    const reportTxt = presentationService.auditPresentation('PRESERVE_EXISTING', {
      sourceDocumentId: 'doc-txt-1',
      sourceDocument: {
        id: 'doc-txt-1',
        format: 'PLAIN_TEXT',
      },
    });
    assert.strictEqual(reportTxt.presentationIntegrityStatus, 'UNSUPPORTED_PRESERVATION');

    const reportMd = presentationService.auditPresentation('PRESERVE_EXISTING', {
      sourceDocumentId: 'doc-md-1',
      sourceDocument: {
        id: 'doc-md-1',
        format: 'MARKDOWN',
      },
    });
    assert.strictEqual(reportMd.presentationIntegrityStatus, 'UNSUPPORTED_PRESERVATION');
  });

  // -------------------------------------------------------------------------
  // 4. Presentation Fingerprint Invariants
  // -------------------------------------------------------------------------
  it('9. guarantees visual fingerprint hash does NOT change when text content changes', () => {
    const styles = {
      fontFamily: 'Arial',
      fontSize: '10.5pt',
      margins: { top: '0.8in', bottom: '0.8in', left: '0.8in', right: '0.8in' },
      lineSpacing: 1.2,
      textColor: '#111111',
    };

    const docVersion1 = { styles, rawContent: 'Original bullet point describing Python backend.' };
    const docVersion2 = { styles, rawContent: 'Adapted bullet point describing Go microservices.' };

    const fp1 = PresentationFingerprintEngine.computeFingerprint(docVersion1, 'DOCX');
    const fp2 = PresentationFingerprintEngine.computeFingerprint(docVersion2, 'DOCX');

    assert.strictEqual(fp1.fingerprintHash, fp2.fingerprintHash);
  });

  it('10. guarantees visual fingerprint hash DOES change when typography or margins are modified', () => {
    const baseStyles = {
      fontFamily: 'Georgia',
      fontSize: '12pt',
      margins: { top: '1in', bottom: '1in', left: '1in', right: '1in' },
      lineSpacing: 1.0,
      textColor: '#000000',
    };

    const modifiedStyles = {
      ...baseStyles,
      fontFamily: 'Helvetica', // Modified font
    };

    const fpBase = PresentationFingerprintEngine.computeFingerprint(baseStyles, 'DOCX');
    const fpModified = PresentationFingerprintEngine.computeFingerprint(modifiedStyles, 'DOCX');

    assert.notStrictEqual(fpBase.fingerprintHash, fpModified.fingerprintHash);
  });

  it('11. detects presentation discrepancies when target document alters source styling', () => {
    const sourceStyles = {
      fontFamily: 'Calibri',
      fontSize: '11pt',
      margins: { top: '1in', bottom: '1in', left: '1in', right: '1in' },
      lineSpacing: 1.15,
      textColor: '#000000',
      columnCount: 1,
    };

    const alteredTargetStyles = {
      fontFamily: 'Comic Sans MS', // Unauthorized font change
      fontSize: '14pt',
      margins: { top: '0.5in', bottom: '0.5in', left: '0.5in', right: '0.5in' },
      lineSpacing: 1.5,
      textColor: '#ff0000',
      columnCount: 2,
    };

    const report = presentationService.auditPresentation('PRESERVE_EXISTING', {
      sourceDocumentId: 'doc-check-disc',
      sourceDocument: {
        id: 'doc-check-disc',
        format: 'DOCX',
        styles: sourceStyles,
      },
      targetStyles: alteredTargetStyles,
    });

    assert.strictEqual(report.presentationIntegrityStatus, 'BLOCKED');
    assert.ok(report.discrepancies.length >= 3);
    assert.ok(report.discrepancies.some((d) => d.includes('Typography modified')));
    assert.ok(report.discrepancies.some((d) => d.includes('Page margins modified')));
  });
});
