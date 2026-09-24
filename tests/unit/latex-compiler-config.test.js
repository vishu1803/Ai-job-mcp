/**
 * @file Unit Tests: LaTeX compiler engine resolution & timeout configuration.
 *
 * These are pure configuration tests (no PDF compilation, no browser, no TeX
 * toolchain required) verifying that compiler selection is provider-neutral and
 * that compile ceilings are explicit rather than hard-coded inline.
 */

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  LatexCompilerService,
  resolveTectonicExecutable,
  DEFAULT_COMPILE_TIMEOUTS_MS,
} from '../../src/services/latex-compiler.service.js';

describe('LatexCompilerService configuration', () => {
  const envKeys = [
    'TECTONIC_BIN',
    'PDF_COMPILE_TECTONIC_TIMEOUT_MS',
    'PDF_COMPILE_PDFLATEX_TIMEOUT_MS',
    'PDF_COMPILE_CHROME_TIMEOUT_MS',
  ];
  const originalEnv = Object.fromEntries(envKeys.map((k) => [k, process.env[k]]));

  afterEach(() => {
    for (const key of envKeys) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
  });

  it('exposes explicit, generous default compile ceilings (no hard-coded 15s browser timeout)', () => {
    assert.ok(DEFAULT_COMPILE_TIMEOUTS_MS.tectonic > 0);
    assert.ok(DEFAULT_COMPILE_TIMEOUTS_MS.pdflatex > 0);
    assert.ok(
      DEFAULT_COMPILE_TIMEOUTS_MS.chrome > 15000,
      'Chrome fallback ceiling must exceed the historical brittle 15s browser timeout'
    );
  });

  it('applies the documented defaults when nothing is configured', () => {
    for (const key of envKeys) delete process.env[key];
    const compiler = new LatexCompilerService();
    assert.deepEqual(compiler.timeouts, { ...DEFAULT_COMPILE_TIMEOUTS_MS });
  });

  it('honours explicit per-instance timeout options', () => {
    const compiler = new LatexCompilerService({
      tectonicTimeoutMs: 1111,
      pdflatexTimeoutMs: 2222,
      chromeTimeoutMs: 3333,
    });
    assert.deepEqual(compiler.timeouts, { tectonic: 1111, pdflatex: 2222, chrome: 3333 });
  });

  it('honours environment timeout overrides when no explicit option is supplied', () => {
    process.env.PDF_COMPILE_TECTONIC_TIMEOUT_MS = '4444';
    process.env.PDF_COMPILE_PDFLATEX_TIMEOUT_MS = '5555';
    process.env.PDF_COMPILE_CHROME_TIMEOUT_MS = '6666';
    const compiler = new LatexCompilerService();
    assert.deepEqual(compiler.timeouts, { tectonic: 4444, pdflatex: 5555, chrome: 6666 });
  });

  it('ignores invalid timeout configuration and falls back to the default ceiling', () => {
    process.env.PDF_COMPILE_TECTONIC_TIMEOUT_MS = 'not-a-number';
    const compiler = new LatexCompilerService({ chromeTimeoutMs: -5 });
    assert.equal(compiler.timeouts.tectonic, DEFAULT_COMPILE_TIMEOUTS_MS.tectonic);
    assert.equal(compiler.timeouts.chrome, DEFAULT_COMPILE_TIMEOUTS_MS.chrome);
  });

  it('prefers an explicit tectonic override that exists on disk', () => {
    assert.equal(resolveTectonicExecutable(process.execPath), process.execPath);
    const compiler = new LatexCompilerService({ tectonicPath: process.execPath });
    assert.equal(compiler.tectonicPath, process.execPath);
  });

  it('resolves TECTONIC_BIN ahead of repo-local and PATH candidates', () => {
    process.env.TECTONIC_BIN = process.execPath;
    assert.equal(resolveTectonicExecutable(), process.execPath);
    assert.equal(new LatexCompilerService().tectonicPath, process.execPath);
  });

  it('ignores a nonexistent TECTONIC_BIN and falls through to other candidates', () => {
    process.env.TECTONIC_BIN = '/definitely/missing/tectonic';
    const resolved = resolveTectonicExecutable('/definitely/missing/other-tectonic');
    assert.notEqual(resolved, '/definitely/missing/tectonic');
    assert.notEqual(resolved, '/definitely/missing/other-tectonic');
  });
});
