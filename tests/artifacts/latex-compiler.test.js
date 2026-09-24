/**
 * @file Unit Tests: Resilient LaTeX Compiler Service
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  LatexCompilerService,
  resolveTectonicExecutable,
} from '../../src/services/latex-compiler.service.js';

describe('LatexCompilerService', () => {
  const compiler = new LatexCompilerService();

  const sampleTex = `\\documentclass{article}
\\begin{document}
\\section*{ATS Resume}
Selectable text content for automated testing.
\\end{document}`;

  it('1. compiles LaTeX document to valid PDF buffer', async () => {
    const result = await compiler.compileLatexToPdf({
      texContent: sampleTex,
      jobName: 'test-doc',
    });

    assert.equal(result.success, true);
    assert.ok(Buffer.isBuffer(result.pdfBuffer));
    assert.ok(result.pdfBuffer.length > 500);

    const magic = result.pdfBuffer.subarray(0, 5).toString('ascii');
    assert.equal(magic, '%PDF-');
    assert.ok(['tectonic', 'pdflatex', 'chrome_headless'].includes(result.compilerUsed));
  });

  it('2. rejects empty or non-string input', async () => {
    await assert.rejects(() => compiler.compileLatexToPdf({ texContent: '' }), /non-empty string/);
  });

  it('3. uses the hermetic Tectonic engine when the TeX toolchain is required', async () => {
    // The compiler degrades Tectonic -> pdflatex -> headless Chromium, so a broken
    // TeX toolchain would otherwise still yield a PDF and look like success. CI sets
    // REQUIRE_TECTONIC_ENGINE=true to turn that silent degradation into a hard
    // failure: the toolchain *setup* steps can then be non-blocking without ever
    // weakening the PDF compilation contract.
    const required = process.env.REQUIRE_TECTONIC_ENGINE === 'true';
    const tectonicPath = resolveTectonicExecutable();

    if (!tectonicPath && !required) {
      // No TeX toolchain in this environment: the documented fallback is allowed.
      return;
    }

    assert.ok(
      tectonicPath,
      'REQUIRE_TECTONIC_ENGINE=true but no Tectonic binary could be resolved'
    );

    const result = await compiler.compileLatexToPdf({
      texContent: sampleTex,
      jobName: 'engine-check',
    });

    assert.equal(result.success, true);
    assert.equal(
      result.compilerUsed,
      'tectonic',
      'PDF compilation must use the hermetic Tectonic engine, not a fallback'
    );
  });

  it('4. normalizes compiler-generated PDF timestamps without changing byte length', () => {
    const first = Buffer.from(
      "/CreationDate (D:20260906092310+00'00')\n/ModDate (D:20260906092310+00'00')",
      'latin1'
    );
    const second = Buffer.from(
      "/CreationDate (D:20270101010101+00'00')\n/ModDate (D:20270101010101+00'00')",
      'latin1'
    );

    const normalizedFirst = compiler._normalizePdfMetadata(first);
    const normalizedSecond = compiler._normalizePdfMetadata(second);

    assert.deepEqual(normalizedFirst, normalizedSecond);
    assert.equal(normalizedFirst.length, first.length);
  });
});
