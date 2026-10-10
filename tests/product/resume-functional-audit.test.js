/** Audit characterization with PRD-003 regressions updated on 2026-10-10.
 * Remaining parser/template cases intentionally characterize unresolved defects. */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { ResumeParserService } from '../../src/services/resume-parser.service.js';
import { ResumeTemplateRenderer } from '../../src/services/resume-presentation.service.js';
import {
  LatexDocumentGenerator,
  formatNormalizedDateRange,
} from '../../src/services/latex-document-generator.service.js';
import { LatexCompilerService } from '../../src/services/latex-compiler.service.js';
import {
  buildStructuredResumeDocument,
  buildStructuredResumeSnapshot,
} from '../../src/services/structured-resume.service.js';
import { SourceExperienceSnapshotSchema } from '../../src/domain/career/resume.schemas.js';

const parser = new ResumeParserService();
const renderer = new LatexDocumentGenerator();
const profile = {
  displayName: 'Synthetic Candidate',
  canonicalEmail: 'candidate@example.test',
  headline: 'Software Developer',
  skills: [],
  projects: [],
};
const job = { title: 'Software Developer', description: 'Build web software.' };
function document(extra = {}) {
  return buildStructuredResumeDocument({
    candidateProfile: { ...profile, ...extra },
    jobPosting: job,
  });
}
function tex(resume, templateId = 'ATS_FOCUSED') {
  return renderer.generateTailoredResumeLatex({
    applicationPackage: { structuredResume: resume, templateId, targetJob: job },
  }).texContent;
}
function docxLocal(xml, descriptor = false) {
  const name = Buffer.from('word/document.xml');
  const payload = zlib.deflateRawSync(Buffer.from(xml));
  const header = Buffer.alloc(30);
  let crc = 0xffffffff;
  for (const byte of Buffer.from(xml)) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  crc = (crc ^ 0xffffffff) >>> 0;
  header.writeUInt32LE(0x04034b50);
  header.writeUInt16LE(descriptor ? 8 : 0, 6);
  header.writeUInt16LE(8, 8);
  header.writeUInt32LE(descriptor ? 0 : crc, 14);
  header.writeUInt32LE(descriptor ? 0 : payload.length, 18);
  header.writeUInt32LE(descriptor ? 0 : Buffer.byteLength(xml), 22);
  header.writeUInt16LE(name.length, 26);
  const dataDescriptor = Buffer.alloc(16);
  dataDescriptor.writeUInt32LE(0x08074b50);
  dataDescriptor.writeUInt32LE(crc, 4);
  dataDescriptor.writeUInt32LE(payload.length, 8);
  dataDescriptor.writeUInt32LE(Buffer.byteLength(xml), 12);
  const local = Buffer.concat([header, name, payload, ...(descriptor ? [dataDescriptor] : [])]);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(descriptor ? 8 : 0, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(payload.length, 20);
  central.writeUInt32LE(Buffer.byteLength(xml), 24);
  central.writeUInt16LE(name.length, 28);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length, 12);
  end.writeUInt32LE(local.length, 16);
  return Buffer.concat([local, central, name, end]);
}

describe('Resume functional audit: documented defects and safe missing-data behavior', () => {
  it('fresh missing-email profile is refused at the schema boundary without fabricated contact', () => {
    assert.throws(() => document({ canonicalEmail: undefined }));
  });
  it('PRD-003 empty career data omits unsupported experienced wording in both job contexts', () => {
    for (const jobPosting of [job, { title: job.title }]) {
      const snapshot = buildStructuredResumeSnapshot({ candidateProfile: profile, jobPosting });
      assert.equal(snapshot.structuredResume.summary.text, '');
      assert.equal(snapshot.structuredResume.summary.provenanceStatus, 'CLAIMED');
      assert.deepEqual(snapshot.structuredResume.summary.composedFromFactIds, []);
      assert.equal(snapshot.evidenceValidationReceipt.overallStatus, 'PASS');
    }
  });
  it('DOCX paragraph boundaries are flattened, and XML entities survive literally', () => {
    const xml =
      '<w:document><w:body><w:p><w:r><w:t>EXPERIENCE</w:t></w:r></w:p><w:p><w:r><w:t>Software Engineer | Example &amp; Co</w:t></w:r></w:p><w:p><w:r><w:t>Built software.</w:t></w:r></w:p></w:body></w:document>';
    const text = parser.extractRawText({ buffer: docxLocal(xml), format: 'DOCX' });
    assert.equal(text, 'EXPERIENCE Software Engineer | Example &amp; Co Built software.');
    assert.equal(
      parser.splitIntoSections(text).find((s) => s.sectionType === 'WORK_EXPERIENCE').structuredData
        .experiences[0].company,
      'Example &amp; Co Built software.'
    );
  });
  it('valid ZIP data-descriptor mode is not extracted as readable DOCX content', () => {
    const xml =
      '<w:document><w:body><w:p><w:r><w:t>Software Engineer Synthetic Systems</w:t></w:r></w:p></w:body></w:document>';
    const text = parser.extractRawText({ buffer: docxLocal(xml, true), format: 'DOCX' });
    assert.ok(!text.includes('Software Engineer Synthetic Systems'));
  });
  it('PDF with no readable text yields a parsed-document placeholder instead of an actionable parse error', () => {
    assert.equal(
      parser.extractRawText({
        buffer: Buffer.from('%PDF-1.4\n% no text layer\n%%EOF'),
        format: 'PDF',
      }),
      'Parsed PDF Document'
    );
  });
  it('PDF page streams are sorted together by coordinates instead of page order', () => {
    const pdf = Buffer.from(
      '%PDF-1.4\n1 0 obj\nstream\nBT /F1 10 Tf 1 0 0 1 10 700 Tm (PAGE ONE HEADER) Tj 1 0 0 1 10 100 Tm (PAGE ONE END) Tj ET\nendstream\nendobj\n2 0 obj\nstream\nBT /F1 10 Tf 1 0 0 1 10 690 Tm (PAGE TWO HEADER) Tj 1 0 0 1 10 90 Tm (PAGE TWO END) Tj ET\nendstream\nendobj\n%%EOF'
    );
    const text = parser.extractRawText({ buffer: pdf, format: 'PDF' });
    assert.ok(text.indexOf('PAGE TWO HEADER') < text.indexOf('PAGE ONE END'), text);
  });
  it('five template names still expose an abstract renderer', async () => {
    await assert.rejects(
      new ResumeTemplateRenderer().renderResume(document(), 'MODERN'),
      /implemented by downstream/
    );
  });
  it('canonical renderer ignores different requested template IDs', () => {
    const resume = document();
    assert.equal(tex(resume, 'MODERN'), tex(resume, 'TRADITIONAL'));
  });
  it('PRD-003 Chrome fallback omits blank list-spacing bullets', () => {
    const resume = document({
      experience: [
        { title: 'Engineer', company: 'Synthetic Employer', bullets: ['Built a web service.'] },
      ],
    });
    const html = new LatexCompilerService()._convertLatexToAtsHtml(tex(resume));
    assert.ok(!html.includes('<li></li>'));
  });
  it('PRD-003 experience dates preserve month and day precision', () => {
    assert.equal(formatNormalizedDateRange('2024-06', '2024-09'), 'Jun 2024 -- Sep 2024');
    assert.equal(
      formatNormalizedDateRange('2024-06-01', '2024-09-30'),
      '1 Jun 2024 -- 30 Sep 2024'
    );
  });
  it('PRD-003 experience schema rejects invalid month and reversed chronology', () => {
    assert.ok(
      !SourceExperienceSnapshotSchema.safeParse({
        title: 'Engineer',
        startDate: '2026-99',
        endDate: '2020-01',
      }).success
    );
  });
  it('PRD-003 education retains current enrollment, normalized dates and grade', () => {
    const resume = document({
      education: [
        {
          institution: 'Synthetic University',
          degree: 'BEng',
          startDate: '2023-09',
          endDate: null,
          isCurrent: true,
          grade: '3.9/4',
        },
      ],
    });
    assert.equal(resume.education[0].isCurrent, true);
    const result = tex(resume);
    assert.ok(result.includes('Sep 2023'));
    assert.ok(result.includes('Present'));
    assert.ok(result.includes('3.9/4'));
  });
  it('PRD-003 certifications render complete metadata by default', () => {
    const resume = document({
      certifications: [
        {
          name: 'Synthetic Credential',
          issuingOrganization: 'Synthetic Issuer',
          issueDate: '2024-06',
          expirationDate: '2027-06',
          credentialId: 'CRED-123',
          credentialUrl: 'https://issuer.example.test/credential',
        },
      ],
    });
    assert.equal(resume.certifications[0].credentialId, 'CRED-123');
    const result = tex(resume);
    assert.ok(result.includes('Synthetic Credential'));
    for (const retained of ['Synthetic Issuer', 'CRED-123', 'Jun 2027', 'issuer.example.test'])
      assert.ok(result.includes(retained), retained);
  });
  it('PRD-003 candidate-authored publications, awards and achievements survive', () => {
    const resume = document({
      publications: [{ title: 'Synthetic Publication' }],
      awards: [{ name: 'Synthetic Award' }],
      achievements: [{ title: 'Synthetic Achievement' }],
    });
    assert.equal(resume.optionalSections.publications.length, 1);
    assert.equal(resume.optionalSections.awards.length, 1);
    assert.equal(resume.optionalSections.achievements.length, 1);
  });
});
