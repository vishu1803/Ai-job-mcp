/**
 * @file ATS Extraction Model Service (Priority 1)
 *
 * Implements the canonical industry ATS extraction contract on top of the existing
 * ResumeParserService and CanonicalAtsParserService.
 *
 * Every extracted field strictly adheres to:
 * {
 *   "value": "...",
 *   "confidence": 0.97,
 *   "source": {
 *     "page": 1,
 *     "section": "experience",
 *     "textRange": "lines 14-22"
 *   }
 * }
 */

import crypto from 'node:crypto';
import { resumeParserService, ResumeParserService } from './resume-parser.service.js';
import {
  canonicalAtsParserService,
  CanonicalAtsParserService,
} from './canonical-ats-parser.service.js';
import {
  AtsExtractionModelSchema,
  ATS_EXTRACTION_MODEL_VERSION,
} from '../domain/career/ats-extraction-model.schemas.js';

export class AtsExtractionModelService {
  /**
   * @param {object} [dependencies]
   * @param {ResumeParserService} [dependencies.resumeParser]
   * @param {CanonicalAtsParserService} [dependencies.canonicalParser]
   */
  constructor(dependencies = {}) {
    this.resumeParser = dependencies.resumeParser || resumeParserService;
    this.canonicalParser = dependencies.canonicalParser || canonicalAtsParserService;
  }

  /**
   * Builds an industry-grade ATS extraction model from raw text or canonical profile.
   *
   * @param {object} params
   * @param {string} [params.rawText] Extracted resume text
   * @param {Buffer} [params.buffer] Document buffer
   * @param {string} [params.fileName] Original file name
   * @param {object} [params.canonicalProfile] Pre-parsed canonical profile
   * @returns {Promise<object>} Validated AtsExtractionModel
   */
  async extractModel({
    rawText = null,
    buffer = null,
    fileName = 'resume.pdf',
    canonicalProfile = null,
  } = {}) {
    let profile = canonicalProfile;
    let text = rawText;

    if (!profile) {
      profile = await this.canonicalParser.parseDocumentToCanonicalProfile({
        rawText: text,
        buffer,
        fileName,
      });
    }

    if (!text) {
      text = profile?.summary?.rawText || '';
    }

    // Index text by line and section for source location tracking
    const lineIndex = this._buildLineIndex(text);
    const sections = this.resumeParser.splitIntoSections(text);

    return this.buildExtractionModelFromProfile(profile, { lineIndex, sections, text });
  }

  /**
   * Transforms a CanonicalCandidateProfile into the field-level ATS extraction model.
   *
   * @param {object} profile CanonicalCandidateProfile
   * @param {object} [context]
   * @returns {object} Validated AtsExtractionModel
   */
  buildExtractionModelFromProfile(profile, context = {}) {
    const text = context.text || profile?.summary?.rawText || '';
    const lineIndex = context.lineIndex || this._buildLineIndex(text);
    const overallConfidence = profile?.parseMetadata?.extractionConfidence || 0.95;

    // 1. Identity & Contacts
    const identityData = profile?.identity || {};
    const contactData = identityData.contact || {};
    const linksData = identityData.links || {};

    const name = this._wrapField({
      value: identityData.name || 'Candidate',
      confidence: 0.98,
      section: 'CONTACT_INFO',
      query: identityData.name,
      lineIndex,
    });

    const headline = this._wrapField({
      value: identityData.headline || null,
      confidence: identityData.headline ? 0.95 : 0.0,
      section: 'CONTACT_INFO',
      query: identityData.headline,
      lineIndex,
    });

    const location = this._wrapField({
      value: identityData.location || null,
      confidence: identityData.location ? 0.92 : 0.0,
      section: 'CONTACT_INFO',
      query: identityData.location,
      lineIndex,
    });

    const workAuthorization = this._wrapField({
      value: identityData.workAuthorization || null,
      confidence: identityData.workAuthorization ? 0.9 : 0.0,
      section: 'SUMMARY',
      query: identityData.workAuthorization,
      lineIndex,
    });

    const contact = {
      email: this._wrapField({
        value: contactData.email || null,
        confidence: contactData.email ? 0.99 : 0.0,
        section: 'CONTACT_INFO',
        query: contactData.email,
        lineIndex,
      }),
      phone: this._wrapField({
        value: contactData.phone || null,
        confidence: contactData.phone ? 0.95 : 0.0,
        section: 'CONTACT_INFO',
        query: contactData.phone,
        lineIndex,
      }),
      address: this._wrapField({
        value: contactData.address || null,
        confidence: contactData.address ? 0.85 : 0.0,
        section: 'CONTACT_INFO',
        query: contactData.address,
        lineIndex,
      }),
      city: this._wrapField({
        value: contactData.city || null,
        confidence: contactData.city ? 0.88 : 0.0,
        section: 'CONTACT_INFO',
        query: contactData.city,
        lineIndex,
      }),
      state: this._wrapField({
        value: contactData.state || null,
        confidence: contactData.state ? 0.88 : 0.0,
        section: 'CONTACT_INFO',
        query: contactData.state,
        lineIndex,
      }),
      country: this._wrapField({
        value: contactData.country || null,
        confidence: contactData.country ? 0.88 : 0.0,
        section: 'CONTACT_INFO',
        query: contactData.country,
        lineIndex,
      }),
      postalCode: this._wrapField({
        value: contactData.postalCode || null,
        confidence: contactData.postalCode ? 0.85 : 0.0,
        section: 'CONTACT_INFO',
        query: contactData.postalCode,
        lineIndex,
      }),
    };

    const links = {
      github: this._wrapField({
        value: linksData.github || null,
        confidence: linksData.github ? 0.98 : 0.0,
        section: 'CONTACT_INFO',
        query: linksData.github,
        lineIndex,
      }),
      linkedin: this._wrapField({
        value: linksData.linkedin || null,
        confidence: linksData.linkedin ? 0.98 : 0.0,
        section: 'CONTACT_INFO',
        query: linksData.linkedin,
        lineIndex,
      }),
      portfolio: this._wrapField({
        value: linksData.portfolio || null,
        confidence: linksData.portfolio ? 0.95 : 0.0,
        section: 'CONTACT_INFO',
        query: linksData.portfolio,
        lineIndex,
      }),
      website: this._wrapField({
        value: linksData.website || null,
        confidence: linksData.website ? 0.95 : 0.0,
        section: 'CONTACT_INFO',
        query: linksData.website,
        lineIndex,
      }),
      other: (linksData.other || []).map((o) => ({
        label: o.label,
        field: this._wrapField({
          value: o.url,
          confidence: 0.92,
          section: 'CONTACT_INFO',
          query: o.url,
          lineIndex,
        }),
      })),
    };

    // 2. Summary
    const summaryData = profile?.summary || {};
    const summary = {
      text: this._wrapField({
        value: summaryData.text || null,
        confidence: summaryData.text ? 0.95 : 0.0,
        section: 'SUMMARY',
        query: summaryData.text ? summaryData.text.slice(0, 40) : null,
        lineIndex,
      }),
      yearsOfExperience: this._wrapField({
        value: summaryData.yearsOfExperience ?? null,
        confidence: summaryData.yearsOfExperience !== undefined ? 0.9 : 0.0,
        section: 'SUMMARY',
        lineIndex,
      }),
    };

    // 3. Skills
    const skills = (profile?.skills || []).map((s) => ({
      name: this._wrapField({
        value: s.name,
        confidence: s.confidence || 0.95,
        section: 'SKILLS',
        query: s.name,
        lineIndex,
      }),
      category: this._wrapField({
        value: s.category || 'OTHER',
        confidence: 0.92,
        section: 'SKILLS',
        lineIndex,
      }),
      yearsOfExperience: this._wrapField({
        value: s.yearsOfExperience ?? null,
        confidence: s.yearsOfExperience ? 0.88 : 0.0,
        section: 'SKILLS',
        lineIndex,
      }),
    }));

    // 4. Employment History
    const employment = (profile?.experience || []).map((exp) => ({
      id: exp.id || crypto.randomUUID(),
      jobTitle: this._wrapField({
        value: exp.title,
        confidence: 0.96,
        section: 'WORK_EXPERIENCE',
        query: exp.title,
        lineIndex,
      }),
      employer: this._wrapField({
        value: exp.company,
        confidence: 0.96,
        section: 'WORK_EXPERIENCE',
        query: exp.company,
        lineIndex,
      }),
      location: this._wrapField({
        value: exp.location || null,
        confidence: exp.location ? 0.9 : 0.0,
        section: 'WORK_EXPERIENCE',
        query: exp.location,
        lineIndex,
      }),
      dates: this._wrapField({
        value: `${exp.startDate} - ${exp.endDate || (exp.isCurrent ? 'Present' : '')}`,
        confidence: 0.94,
        section: 'WORK_EXPERIENCE',
        query: exp.startDate,
        lineIndex,
      }),
      startDate: this._wrapField({
        value: exp.startDate,
        confidence: 0.95,
        section: 'WORK_EXPERIENCE',
        query: exp.startDate,
        lineIndex,
      }),
      endDate: this._wrapField({
        value: exp.endDate || null,
        confidence: exp.endDate ? 0.95 : 0.0,
        section: 'WORK_EXPERIENCE',
        query: exp.endDate,
        lineIndex,
      }),
      isCurrent: this._wrapField({
        value: Boolean(exp.isCurrent),
        confidence: 0.98,
        section: 'WORK_EXPERIENCE',
        lineIndex,
      }),
      tenureMonths: this._wrapField({
        value: exp.durationMonths ?? null,
        confidence: 0.92,
        section: 'WORK_EXPERIENCE',
        lineIndex,
      }),
      responsibilities: this._wrapField({
        value: exp.responsibilities || [],
        confidence: 0.92,
        section: 'WORK_EXPERIENCE',
        lineIndex,
      }),
      technologies: (exp.technologies || []).map((tech) =>
        this._wrapField({
          value: tech,
          confidence: 0.94,
          section: 'WORK_EXPERIENCE',
          query: tech,
          lineIndex,
        })
      ),
      bullets: this._wrapField({
        value: exp.bullets || [],
        confidence: 0.95,
        section: 'WORK_EXPERIENCE',
        lineIndex,
      }),
    }));

    // 5. Education
    const education = (profile?.education || []).map((edu) => ({
      id: edu.id || crypto.randomUUID(),
      institution: this._wrapField({
        value: edu.institution,
        confidence: 0.96,
        section: 'EDUCATION',
        query: edu.institution,
        lineIndex,
      }),
      degree: this._wrapField({
        value: edu.degree,
        confidence: 0.95,
        section: 'EDUCATION',
        query: edu.degree,
        lineIndex,
      }),
      fieldOfStudy: this._wrapField({
        value: edu.fieldOfStudy || null,
        confidence: edu.fieldOfStudy ? 0.92 : 0.0,
        section: 'EDUCATION',
        query: edu.fieldOfStudy,
        lineIndex,
      }),
      dates: this._wrapField({
        value: edu.startDate ? `${edu.startDate} - ${edu.endDate || ''}` : null,
        confidence: edu.startDate ? 0.9 : 0.0,
        section: 'EDUCATION',
        query: edu.startDate,
        lineIndex,
      }),
      graduationYear: this._wrapField({
        value: edu.graduationYear ?? null,
        confidence: edu.graduationYear ? 0.94 : 0.0,
        section: 'EDUCATION',
        lineIndex,
      }),
      gpa: this._wrapField({
        value: edu.gpa || null,
        confidence: edu.gpa ? 0.95 : 0.0,
        section: 'EDUCATION',
        query: edu.gpa,
        lineIndex,
      }),
    }));

    // 6. Certifications
    const certifications = (profile?.certifications || []).map((cert) => ({
      id: cert.id || crypto.randomUUID(),
      name: this._wrapField({
        value: cert.name,
        confidence: 0.95,
        section: 'CERTIFICATIONS',
        query: cert.name,
        lineIndex,
      }),
      issuingOrganization: this._wrapField({
        value: cert.issuingOrganization || null,
        confidence: cert.issuingOrganization ? 0.92 : 0.0,
        section: 'CERTIFICATIONS',
        query: cert.issuingOrganization,
        lineIndex,
      }),
      issueDate: this._wrapField({
        value: cert.issueDate || null,
        confidence: cert.issueDate ? 0.9 : 0.0,
        section: 'CERTIFICATIONS',
        lineIndex,
      }),
      credentialId: this._wrapField({
        value: cert.credentialId || null,
        confidence: cert.credentialId ? 0.9 : 0.0,
        section: 'CERTIFICATIONS',
        query: cert.credentialId,
        lineIndex,
      }),
    }));

    // 7. Projects
    const projects = (profile?.projects || []).map((proj) => ({
      id: proj.id || crypto.randomUUID(),
      name: this._wrapField({
        value: proj.name,
        confidence: 0.95,
        section: 'PROJECTS',
        query: proj.name,
        lineIndex,
      }),
      description: this._wrapField({
        value: proj.description || null,
        confidence: proj.description ? 0.92 : 0.0,
        section: 'PROJECTS',
        lineIndex,
      }),
      role: this._wrapField({
        value: proj.role || null,
        confidence: proj.role ? 0.9 : 0.0,
        section: 'PROJECTS',
        query: proj.role,
        lineIndex,
      }),
      technologies: (proj.technologies || []).map((tech) =>
        this._wrapField({
          value: tech,
          confidence: 0.94,
          section: 'PROJECTS',
          query: tech,
          lineIndex,
        })
      ),
      url: this._wrapField({
        value: proj.url || null,
        confidence: proj.url ? 0.95 : 0.0,
        section: 'PROJECTS',
        query: proj.url,
        lineIndex,
      }),
      githubUrl: this._wrapField({
        value: proj.githubUrl || null,
        confidence: proj.githubUrl ? 0.95 : 0.0,
        section: 'PROJECTS',
        query: proj.githubUrl,
        lineIndex,
      }),
      bullets: this._wrapField({
        value: proj.bullets || [],
        confidence: 0.92,
        section: 'PROJECTS',
        lineIndex,
      }),
    }));

    // 8. Achievements
    const achievements = (profile?.achievements || []).map((ach) => ({
      id: ach.id || crypto.randomUUID(),
      title: this._wrapField({
        value: ach.title,
        confidence: 0.92,
        section: 'ACHIEVEMENTS',
        query: ach.title,
        lineIndex,
      }),
      description: this._wrapField({
        value: ach.description || null,
        confidence: ach.description ? 0.9 : 0.0,
        section: 'ACHIEVEMENTS',
        lineIndex,
      }),
      date: this._wrapField({
        value: ach.date || null,
        confidence: ach.date ? 0.88 : 0.0,
        section: 'ACHIEVEMENTS',
        lineIndex,
      }),
    }));

    const rawResult = {
      extractionModelVersion: ATS_EXTRACTION_MODEL_VERSION,
      extractedAt: new Date().toISOString(),
      overallConfidence,
      identity: {
        name,
        headline,
        location,
        workAuthorization,
        contact,
        links,
      },
      summary,
      skills,
      employment,
      education,
      certifications,
      projects,
      achievements,
    };

    return AtsExtractionModelSchema.parse(rawResult);
  }

  // ---------------------------------------------------------------------------
  // Internal Helpers
  // ---------------------------------------------------------------------------

  _wrapField({ value, confidence = 0.95, section = 'GENERAL', query = null, lineIndex = null }) {
    let page = 1;
    let textRange = undefined;

    if (query && typeof query === 'string' && lineIndex) {
      const match = this._findQueryInLineIndex(query, lineIndex);
      if (match) {
        page = match.page;
        textRange = `lines ${match.startLine}-${match.endLine}`;
      }
    }

    return {
      value,
      confidence: Math.round(confidence * 100) / 100,
      source: {
        page,
        section: section.toLowerCase(),
        ...(textRange ? { textRange } : {}),
      },
    };
  }

  _buildLineIndex(fullText) {
    if (!fullText) return [];
    const lines = fullText.split('\n');
    let currentPage = 1;
    let linesOnCurrentPage = 0;

    return lines.map((text, idx) => {
      linesOnCurrentPage++;
      // Check for form feed or standard page headers
      if (text.includes('\f') || /^---\s*Page\s*\d+\s*---$/i.test(text.trim())) {
        currentPage++;
        linesOnCurrentPage = 1;
      } else if (linesOnCurrentPage > 55) {
        // Standard resume page length heuristic (~55 lines per page)
        currentPage++;
        linesOnCurrentPage = 1;
      }

      return {
        lineNum: idx + 1,
        page: currentPage,
        text: text.trim().toLowerCase(),
      };
    });
  }

  _findQueryInLineIndex(query, lineIndex) {
    const q = query.trim().toLowerCase();
    if (!q || q.length < 2) return null;

    const firstWord = q.split(/\s+/)[0];
    for (let i = 0; i < lineIndex.length; i++) {
      if (lineIndex[i].text.includes(firstWord)) {
        return {
          startLine: lineIndex[i].lineNum,
          endLine: lineIndex[i].lineNum,
          page: lineIndex[i].page,
        };
      }
    }
    return null;
  }
}

export const atsExtractionModelService = new AtsExtractionModelService();
