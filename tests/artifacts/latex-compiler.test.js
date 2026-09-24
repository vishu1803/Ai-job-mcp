/**
 * @file Unit Tests: Resilient LaTeX Compiler Service
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LatexCompilerService } from '../../src/services/latex-compiler.service.js';

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

  it('3. normalizes compiler-generated PDF timestamps without changing byte length', () => {
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
