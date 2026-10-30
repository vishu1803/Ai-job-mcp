/** Controlled byte/HTML contracts only. Real Chrome/PDF content has separate gates. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { LatexCompilerService } from '../../src/services/latex-compiler.service.js';
import { escapeLatex } from '../../src/services/latex-document-generator.service.js';

const compiler = () => new LatexCompilerService();
const pdfFixture = (count = 1, box = '0 0 595.276 841.89') =>
  Buffer.from(
    '%PDF-1.7\n' +
      Array.from(
        { length: count },
        (_value, index) => `${index + 1} 0 obj <</Type /Page /MediaBox [${box}]>> endobj`
      ).join('\n') +
      `\n99 0 obj <</Type /Pages /Count ${count}>> endobj\n%%EOF`
  );
const text = (html) =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_all, value) => String.fromCodePoint(Number(value)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
const resumeTex = String.raw`\begin{document}
{\Huge \textbf{Synthetic Candidate}}\par
\href{mailto:fixture@example.test}{fixture@example.test}\par
\href{https://fixture.example.test/profile?a=1\&b=2}{Professional profile}\par
\atssection{Experience}
\textbf{Developer — Source Company} \hfill 2023 -- 2025\par
\begin{itemize}\item Documented C++ <T> interface behavior.\end{itemize}
\end{document}`;

test('strict Chrome contract accepts one A4 physical page', () => {
  assert.doesNotThrow(() => compiler()._assertStrictOnePage(pdfFixture(), 1));
});

test('strict contract rejects multiple physical pages with actionable overflow details', () => {
  assert.throws(
    () => compiler()._assertStrictOnePage(pdfFixture(2), 2),
    (error) => {
      assert.equal(error.code, 'ONE_PAGE_OVERFLOW');
      assert.equal(error.statusCode, 422);
      assert.deepEqual(error.details, { pageCount: 2, targetPageCount: 1 });
      assert.match(error.message, /Select fewer|shorten/);
      return true;
    }
  );
});

test('unknown or inconsistent physical page counts fail closed', () => {
  for (const count of [null, undefined, 0, NaN, 2]) {
    assert.throws(() => compiler()._assertStrictOnePage(pdfFixture(), count), {
      code: 'ONE_PAGE_UNVERIFIABLE',
    });
  }
});

test('missing, malformed and non-A4 page dimensions fail closed', () => {
  for (const box of ['0 0 612 792', '0 0 5.9.5 841.89', '0 0 595.276 500']) {
    assert.throws(() => compiler()._assertStrictOnePage(pdfFixture(1, box), 1), {
      code: 'ONE_PAGE_LAYOUT_INVALID',
    });
  }
  const missing = Buffer.from(
    pdfFixture()
      .toString()
      .replace(/\/MediaBox\s*\[[^\]]*\]/, '')
  );
  assert.throws(() => compiler()._assertStrictOnePage(missing, 1), {
    code: 'ONE_PAGE_LAYOUT_INVALID',
  });
});

test('strict compilation forces Chrome and exposes the verified page count', async () => {
  const service = new LatexCompilerService({
    tectonicPath: process.execPath,
    pdflatexPath: process.execPath,
    chromePath: process.execPath,
  });
  let calls = 0;
  service._runCommand = async (_executable, args) => {
    calls++;
    assert.ok(args.includes('--headless=new'), 'strict output cannot silently use a native engine');
    const output = args.find((arg) => arg.startsWith('--print-to-pdf='));
    await fs.writeFile(output.slice('--print-to-pdf='.length), pdfFixture());
    return { exitCode: 0 };
  };
  const result = await service.compileLatexToPdf({ texContent: resumeTex, strictOnePage: true });
  assert.equal(result.pageCount, 1);
  assert.equal(result.compilerUsed, 'chrome_headless');
  assert.equal(calls, 1);
});

test('strict overflow is propagated instead of being swallowed by an engine fallback', async () => {
  const service = new LatexCompilerService({ chromePath: process.execPath });
  service._runCommand = async (_executable, args) => {
    const output = args.find((arg) => arg.startsWith('--print-to-pdf='));
    await fs.writeFile(output.slice('--print-to-pdf='.length), pdfFixture(2));
    return { exitCode: 0 };
  };
  await assert.rejects(service.compileLatexToPdf({ texContent: resumeTex, strictOnePage: true }), {
    code: 'ONE_PAGE_OVERFLOW',
  });
});

test('readable A4 CSS retains text and links without hidden overflow or font shrinking', () => {
  const html = compiler()._convertLatexToAtsHtml(resumeTex);
  assert.match(html, /size: A4/);
  assert.match(html, /\.contact-line\s*\{\s*font-size: (?:9\.5|10)pt/);
  assert.match(html, /font-size: 10\.5pt/);
  assert.match(html, /font-size: (?:18|21)pt/);
  assert.match(html, /data-renderer-version="chrome-ats-a4-v2"/);
  assert.match(html, /href="mailto:fixture@example.test"/);
  assert.match(html, /href="https:\/\/fixture.example.test\/profile\?a=1&amp;b=2"/);
  assert.doesNotMatch(
    html,
    /overflow:\s*(?:hidden|clip)|(?:^|[;\n])\s*height:\s*\d|font-size:\s*[0-9]pt/
  );
  assert.match(text(html), /Documented C\+\+ <T> interface behavior/);
});

test('date alignment retains title-before-date logical reading order without tables', () => {
  const html = compiler()._convertLatexToAtsHtml(resumeTex);
  assert.match(
    html,
    /entry-label"><strong>Developer — Source Company<\/strong><\/span> <span class="entry-meta">2023 – 2025/
  );
  assert.match(html, /flex-wrap: wrap/);
  assert.doesNotMatch(html, /<table\b|<img\b/);
});

test('header and custom section preserve braces, backslash, Unicode and TeX metacharacters', () => {
  const name = 'José 林 {Q} <T> A&B _ # $ 50% ~ ^ \\';
  const heading = 'Research {Methods} \\ %<T> & _ # $ ~ ^';
  const tex =
    `\\begin{document}\n{\\Huge \\textbf{${escapeLatex(name)}}}\\par\n` +
    `\\href{mailto:fixture@example.test}{fixture@example.test}\\par\n` +
    `\\atssection{${escapeLatex(heading)}}\nOriginal documented work.\\par\n\\end{document}`;
  const html = compiler()._convertLatexToAtsHtml(tex);
  const nameHtml = html.match(/<h1[^>]*>(.*?)<\/h1>/s)[1];
  const headingHtml = html.match(/section-title">(.*?)<\/div>/s)[1];
  assert.equal(text(nameHtml), name);
  assert.equal(text(headingHtml), heading);
  assert.doesNotMatch(nameHtml, /<T>/);
  assert.match(html, /Original documented work/);
});
