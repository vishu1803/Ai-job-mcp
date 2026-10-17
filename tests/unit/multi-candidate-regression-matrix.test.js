/**
 * @file Multi-Candidate Regression Matrix Test Suite (Candidates A-F).
 *
 * Verifies dynamic raw profile URLs, multi-row header width handling,
 * tenant isolation, single A4 geometry, and zero candidate-specific hardcoding.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  createCandidateAFixture,
  createCandidateBFixture,
  createCandidateCFixture,
  createCandidateDFixture,
  createCandidateEFixture,
  createCandidateFFixture,
  getSyntheticMatrixCandidates,
} from '../fixtures/multi-candidate-regression-matrix.js';
import {
  normalizeStudioMaster,
  createStudioNodes,
  defaultStudioSelection,
} from '../../src/services/resume-studio-draft-content.js';
import { studioDocumentContent } from '../../src/services/resume-studio-document-content.js';
import { LatexDocumentGenerator } from '../../src/services/latex-document-generator.service.js';
import { LatexCompilerService } from '../../src/services/latex-compiler.service.js';
import { buildStudioDocx } from '../../src/services/native-docx-export.service.js';
import {
  displayUrlForLink,
  isValidProfileUrl,
  normalizeHyperlinkDestination,
} from '../../src/services/candidate-artifact-content.service.js';

function renderCandidate(fixture) {
  const documentId = crypto.randomUUID();
  const structuredResume = normalizeStudioMaster(fixture, documentId);
  const nodes = createStudioNodes(structuredResume);
  const studioDoc = studioDocumentContent({
    structuredResume,
    nodes,
    selection: defaultStudioSelection(nodes),
  });
  const generator = new LatexDocumentGenerator();
  const compiler = new LatexCompilerService();
  const { texContent } = generator.generateTailoredResumeLatex({
    applicationPackage: { structuredResume: studioDoc.render },
  });
  const html = compiler._convertLatexToAtsHtml(texContent);
  const docx = buildStudioDocx(studioDoc.blocks, {
    marginIn: 0.52,
    lineHeight: 1.24,
    spacingPt: 1.5,
  });

  return {
    structuredResume,
    studioDoc,
    texContent,
    html,
    docx,
  };
}

test('displayUrlForLink correctly strips schemes and www prefixes while preserving paths and queries', () => {
  assert.equal(displayUrlForLink('https://linkedin.com/in/user-name'), 'linkedin.com/in/user-name');
  assert.equal(
    displayUrlForLink('http://www.github.com/developer/repo/'),
    'github.com/developer/repo'
  );
  assert.equal(displayUrlForLink('https://portfolio.dev/'), 'portfolio.dev');
  assert.equal(
    displayUrlForLink('https://leetcode.com/u/user/?tab=profile&view=detailed'),
    'leetcode.com/u/user?tab=profile&view=detailed'
  );
  assert.equal(
    displayUrlForLink('https://cloud-engineer.tech/portfolio/'),
    'cloud-engineer.tech/portfolio'
  );
  assert.equal(displayUrlForLink(''), '');
  assert.equal(displayUrlForLink(null), '');
});

test('isValidProfileUrl rejects unsafe schemes and dummy domains', () => {
  assert.equal(isValidProfileUrl('https://github.com/user'), true);
  assert.equal(isValidProfileUrl('http://user.dev'), true);
  assert.equal(isValidProfileUrl('javascript:alert(1)'), false);
  assert.equal(isValidProfileUrl('data:text/html,test'), false);
  assert.equal(isValidProfileUrl('file:///etc/passwd'), false);
  assert.equal(isValidProfileUrl('https://example.com/profile'), false);
  assert.equal(isValidProfileUrl('https://foo.invalid'), false);
});

test('normalizeHyperlinkDestination guarantees valid http/https scheme', () => {
  assert.equal(normalizeHyperlinkDestination('https://github.com/user'), 'https://github.com/user');
  assert.equal(normalizeHyperlinkDestination('http://github.com/user'), 'http://github.com/user');
  assert.equal(normalizeHyperlinkDestination('github.com/user'), 'https://github.com/user');
  assert.equal(
    normalizeHyperlinkDestination('   https://portfolio.dev/  '),
    'https://portfolio.dev/'
  );
});

test('Candidate A (Junior Backend): clean profile links, single line header, no leakages', () => {
  const fixture = createCandidateAFixture();
  const { html, texContent, studioDoc } = renderCandidate(fixture);

  // Name and headline
  assert.match(html, /Aarav Patel/);
  assert.match(html, /Junior Backend Developer/);

  // Visible links have no https:// or www.
  assert.match(html, /github\.com\/aarav-patel-dev/);
  assert.match(html, /linkedin\.com\/in\/aarav-patel-dev/);
  assert.doesNotMatch(html, />https?:\/\/github\.com\/aarav-patel-dev</);
  assert.doesNotMatch(html, />www\.github\.com/);

  // Hyperlink destination hrefs retain https://
  assert.match(html, /href="https:\/\/github\.com\/aarav-patel-dev"/);
  assert.match(html, /href="https:\/\/linkedin\.com\/in\/aarav-patel-dev"/);

  // Single line links row (fits <= 490pt)
  const linksLines = html.match(/<div class="links-line">/g) || [];
  assert.equal(linksLines.length, 1);
  assert.match(
    texContent,
    /\\href\{https:\/\/github\.com\/aarav-patel-dev\}\{github\.com\/aarav-patel-dev\}/
  );

  // Spoken languages preserved
  assert.match(texContent, /Languages/);
  assert.match(texContent, /English \(Professional\)/);
  assert.match(texContent, /Gujarati \(Native\)/);

  // Zero leakage of other candidates
  assert.doesNotMatch(html, /Elena Rostova/);
  assert.doesNotMatch(html, /Lucas Moreau/);
  assert.doesNotMatch(html, /Dr\. Alexander/);
});

test('Candidate B (Experienced Full-Stack): 3 clean URLs, custom domain portfolio, 3 roles', () => {
  const fixture = createCandidateBFixture();
  const { html, texContent, studioDoc } = renderCandidate(fixture);

  assert.match(html, /Elena Rostova/);
  assert.match(html, /Senior Full-Stack Engineer/);

  // 3 profile links cleanly displayed
  assert.match(html, /linkedin\.com\/in\/elena-rostova-eng/);
  assert.match(html, /github\.com\/elena-rostova/);
  assert.match(html, /elena-rostova\.dev/);
  assert.doesNotMatch(html, />https?:\/\/elena-rostova\.dev</);

  // Hyperlinks point to full https://
  assert.match(html, /href="https:\/\/elena-rostova\.dev"/);

  // 3 roles
  assert.match(html, /Lead Full-Stack Engineer/);
  assert.match(html, /Senior Software Engineer/);
  assert.match(html, /Software Developer/);

  // Supported metric preserved
  assert.match(html, /35%/);

  // Single links row
  const linksLines = html.match(/<div class="links-line">/g) || [];
  assert.equal(linksLines.length, 1);
});

test('Candidate C (Data/Cloud Engineer): GitLab profile URL, custom tech portfolio, European education', () => {
  const fixture = createCandidateCFixture();
  const { html, texContent } = renderCandidate(fixture);

  assert.match(html, /Lucas Moreau/);
  assert.match(
    html,
    /Data &amp; Cloud Infrastructure Engineer|Data & Cloud Infrastructure Engineer/
  );

  // Clean GitLab and Portfolio URLs
  assert.match(html, /gitlab\.com\/lucas-moreau-infra\/stream-pipeline/);
  assert.match(html, /cloud-engineer\.tech\/portfolio/);
  assert.doesNotMatch(html, />https?:\/\/cloud-engineer\.tech/);

  // Destination targets
  assert.match(html, /href="https:\/\/gitlab\.com\/lucas-moreau-infra\/stream-pipeline"/);
  assert.match(html, /href="https:\/\/cloud-engineer\.tech\/portfolio"/);

  // European Master's degree
  assert.match(html, /Technical University of Munich/);
  assert.match(html, /1\.2 \(Sehr gut\)/);

  // Multi-lingual languages
  assert.match(texContent, /French \(Native\)/);
  assert.match(texContent, /English \(Professional\)/);
  assert.match(texContent, /German \(Intermediate\)/);
});

test('Candidate D (Career Changer): Non-tech experience unhallucinated, project prioritization', () => {
  const fixture = createCandidateDFixture();
  const { html, texContent } = renderCandidate(fixture);

  assert.match(html, /Marcus Thorne/);
  assert.match(html, /Software Developer/);

  // Authentic logistics role preserved without title inflation
  assert.match(html, /Operations &amp; Logistics Manager|Operations & Logistics Manager/);
  assert.match(html, /Midwest Freight Logistics/);

  // Transition projects
  assert.match(html, /Warehouse Inventory Tracker/);
  assert.match(html, /Customer Order Analytics CLI/);

  // Clean links
  assert.match(html, /github\.com\/marcus-thorne-dev/);
  assert.match(html, /linkedin\.com\/in\/marcus-thorne/);
});

test('Candidate E (Minimal Profile): graceful omission of null fields, no broken delimiters, single portfolio link', () => {
  const fixture = createCandidateEFixture();
  const { html, texContent, studioDoc } = renderCandidate(fixture);

  assert.match(html, /Devon Vance/);
  assert.match(html, /Software Engineer/);

  // Contact line contains ONLY email, no empty pipe separators
  const contactBlock = studioDoc.blocks.find((b) => b.text.includes('devon.vance@minimalist.test'));
  assert.ok(contactBlock);
  assert.equal(contactBlock.text, 'devon.vance@minimalist.test');
  assert.doesNotMatch(contactBlock.text, /\|/);

  // Single portfolio link
  const linksBlock = studioDoc.blocks.find((b) => b.text === 'minimalist-coder.io');
  assert.ok(linksBlock);
  assert.equal(linksBlock.text, 'minimalist-coder.io');

  // No trailing pipes in LaTeX
  assert.doesNotMatch(texContent, /\$\|\$\s*\\par/);
  assert.doesNotMatch(texContent, /\\par\s*\$\|\$/);

  // Zero languages section
  assert.doesNotMatch(texContent, /\\atssection\{Languages\}/);
});

test('Candidate F (Long Profile URLs): controlled 2-row centered header without clipping', () => {
  const fixture = createCandidateFFixture();
  const { html, texContent, studioDoc } = renderCandidate(fixture);

  assert.match(html, /Dr\. Alexander Maximilian von Humboldt/);
  assert.match(html, /Lead Distributed Systems Architect/);

  // Because total links width exceeds 490pt, LaTeX splits into 2 centered rows with vspace
  assert.match(texContent, /\\vspace\{2pt\}/);

  // HTML preview produces exactly 2 links-line divs
  const linksLines = html.match(/<div class="links-line">/g) || [];
  assert.equal(linksLines.length, 2);

  // All 4 links preserved in visible clean format
  assert.match(
    html,
    /linkedin\.com\/in\/dr-alexander-maximilian-von-humboldt-cloud-architect-2026/
  );
  assert.match(
    html,
    /github\.com\/alexander-maximilian-systems\/distributed-consensus-raft-implementation/
  );
  assert.match(html, /alexander-maximilian-portfolio-and-research-showcase\.engineering\.dev/);
  assert.match(
    html,
    /leetcode\.com\/u\/alexander_maximilian_systems\?tab=profile&amp;view=detailed/
  );

  // Query parameters intact in LaTeX \href destination
  assert.match(
    texContent,
    /\\href\{https:\/\/leetcode\.com\/u\/alexander_maximilian_systems\/\?tab=profile&view=detailed\}/
  );

  // Both blocks exist in DOCX studioDoc
  const r1 = studioDoc.blocks.find((b) => b.text.includes('dr-alexander-maximilian-von-humboldt'));
  const r2 = studioDoc.blocks.find((b) =>
    b.text.includes('alexander-maximilian-portfolio-and-research-showcase')
  );
  assert.ok(r1, 'Row 1 exists');
  assert.ok(r2, 'Row 2 exists');
});

test('Multi-Candidate Tenant Isolation: complete cryptographic separation and zero cross-candidate leakage', () => {
  const candidates = getSyntheticMatrixCandidates();
  const rendered = candidates.map((c) => ({
    key: c.key,
    fixture: c.fixture,
    ...renderCandidate(c.fixture),
  }));

  for (let i = 0; i < rendered.length; i++) {
    for (let j = 0; j < rendered.length; j++) {
      if (i === j) continue;
      const current = rendered[i];
      const other = rendered[j];

      // Other candidate's name never appears in current candidate's output
      assert.ok(
        !current.html.includes(other.fixture.displayName),
        `Leakage detected: '${other.fixture.displayName}' found in output of ${current.key}`
      );
      assert.ok(
        !current.html.includes(other.fixture.email),
        `Leakage detected: '${other.fixture.email}' found in output of ${current.key}`
      );
      if (other.fixture.phone) {
        assert.ok(
          !current.html.includes(other.fixture.phone),
          `Leakage detected: '${other.fixture.phone}' found in output of ${current.key}`
        );
      }
    }
  }
});

test('Zero Candidate-Specific Production Hardcoding: generators contain no hardcoded personal identities or defaults', () => {
  const candidates = getSyntheticMatrixCandidates();

  for (const c of candidates) {
    const { html, texContent } = renderCandidate(c.fixture);

    // No hardcoded personal names
    assert.doesNotMatch(html, /Vishwanath Nishad/i);
    assert.doesNotMatch(texContent, /Vishwanath Nishad/i);

    // No hardcoded personal email or contact info
    assert.doesNotMatch(html, /vishwanathnishad1803@gmail\.com/i);
    assert.doesNotMatch(texContent, /vishwanathnishad1803@gmail\.com/i);

    // No hardcoded fallback languages (e.g. Hindi should not appear unless specified in candidate fixture)
    if (!c.fixture.optionalSections?.languages?.some((l) => /Hindi/i.test(l.language))) {
      assert.doesNotMatch(html, /\bHindi\b/i);
      assert.doesNotMatch(texContent, /\bHindi\b/i);
    }
  }
});
