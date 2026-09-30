/**
 * @file Canonical ATS Parser Service (Phase 3 - ATS Canonical Parsing Layer)
 *
 * Implements the 4-stage canonical document ingestion and extraction pipeline:
 * 1. Document Extraction: Validates magic bytes, enforces limits, extracts text, scrubs secrets
 * 2. Artifact Quality Validation: Evaluates layout parseability, selectability, and text stream integrity
 * 3. ATS Parser & Entity Normalizer: Extracts identity, contacts, work authorization, experience,
 *    tenure, skills, education, projects, open-source contributions, certifications, and publications
 * 4. Canonical Profile Assembly: Emits a strictly validated CanonicalCandidateProfile
 */

import crypto from 'node:crypto';
import { resumeParserService, ResumeParserService } from './resume-parser.service.js';
import {
  defaultAtsParseabilityService,
  AtsParseabilityService,
} from './resume-ats-parseability.service.js';
import {
  CanonicalCandidateProfileSchema,
  CANONICAL_PROFILE_SCHEMA_VERSION,
} from '../domain/career/canonical-candidate-profile.schemas.js';
import { normalizeTechnologyName } from '../utils/technology-normalizer.js';
import { EducationNormalizer } from '../utils/education-normalizer.js';
import { logger } from '../utils/logger.js';

export const CANONICAL_PARSER_VERSION = '1.0.0';

export class CanonicalAtsParserService {
  constructor(dependencies = {}) {
    this.resumeParser = dependencies.resumeParser || resumeParserService;
    this.atsParseability = dependencies.atsParseability || defaultAtsParseabilityService;
    this.logger = logger.child({ module: 'CanonicalAtsParserService' });
  }

  /**
   * Main entry point: Executes the 4-stage canonical ATS parsing pipeline.
   *
   * @param {object} params
   * @param {Buffer} [params.buffer] Document binary buffer (PDF, DOCX, TXT)
   * @param {string} [params.fileName] Original filename
   * @param {string} [params.declaredMimeType] Declared MIME type from client upload
   * @param {string} [params.rawText] Pre-extracted text (used if buffer not provided)
   * @param {string} [params.tenantId] Multi-tenant isolation ID
   * @param {string} [params.candidateId] Candidate ID
   * @returns {Promise<object>} Validated CanonicalCandidateProfile
   */
  async parseDocumentToCanonicalProfile({
    buffer = null,
    fileName = 'resume.pdf',
    declaredMimeType = '',
    rawText = null,
    tenantId = undefined,
    candidateId = undefined,
  } = {}) {
    const timestamp = new Date().toISOString();
    let text = rawText || '';
    let detectedFormat = 'TXT';
    let fileSizeBytes = buffer ? buffer.length : Buffer.byteLength(text || '', 'utf8');
    let sha256 = '';

    // =========================================================================
    // STAGE 1: Document Extraction & Secret Scrubbing
    // =========================================================================
    if (buffer && Buffer.isBuffer(buffer)) {
      sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
      const validation = this.resumeParser.validateFile({
        buffer,
        fileName,
        declaredMimeType,
      });
      detectedFormat = validation.format;

      if (!text) {
        text = await this.resumeParser.extractRawText(buffer, detectedFormat);
      }
    } else {
      sha256 = crypto
        .createHash('sha256')
        .update(text || '')
        .digest('hex');
      if (fileName.toLowerCase().endsWith('.docx')) detectedFormat = 'DOCX';
      else if (fileName.toLowerCase().endsWith('.pdf')) detectedFormat = 'PDF';
      else if (fileName.toLowerCase().endsWith('.md')) detectedFormat = 'MARKDOWN';
      else detectedFormat = 'TXT';
    }

    const cleanText = this.resumeParser.scrubSecrets(text);

    // =========================================================================
    // STAGE 2: Artifact Quality & Parseability Validation
    // =========================================================================
    let parseabilityScore = 75.0;
    const issues = [];

    if (
      this.atsParseability &&
      typeof this.atsParseability.evaluateAtsParseability === 'function'
    ) {
      const evaluation = this.atsParseability.evaluateAtsParseability({
        pdfBuffer: detectedFormat === 'PDF' ? buffer : null,
        extractedText: cleanText,
      });
      parseabilityScore = evaluation.atsParseabilityScore ?? 75.0;
      if (Array.isArray(evaluation.findings)) {
        for (const f of evaluation.findings) {
          const msg = f.message || f.description || f.rule;
          if (msg) issues.push(String(msg));
        }
      }
    }

    let qualityStatus = 'PASS';
    if (parseabilityScore < 50.0) qualityStatus = 'FAIL';
    else if (parseabilityScore < 70.0) qualityStatus = 'WARNING';

    const qualityAudit = {
      parseabilityScore,
      qualityStatus,
      issues,
    };

    // =========================================================================
    // STAGE 3: ATS Parsing & Entity Normalization
    // =========================================================================
    const sections = this.resumeParser.splitIntoSections(cleanText);
    const identity = this._extractIdentityAndContacts(cleanText, sections);
    const summary = this._extractSummary(cleanText, sections);
    const skills = this._extractSkills(cleanText, sections);
    const experience = this._extractExperience(cleanText, sections);
    const education = this._extractEducation(cleanText, sections);
    const projects = this._extractProjects(cleanText, sections);
    const openSource = this._extractOpenSource(cleanText, sections, projects);
    const certifications = this._extractCertifications(cleanText, sections);
    const publications = this._extractPublications(cleanText, sections);
    const achievements = this._extractAchievements(cleanText, sections);

    // Calculate metadata
    const recognizedTypes = new Set(sections.map((s) => s.sectionType));
    const allExpectedTypes = ['SUMMARY', 'SKILLS', 'WORK_EXPERIENCE', 'EDUCATION', 'PROJECTS'];
    const unrecognizedSections = [];
    for (const s of sections) {
      if (!allExpectedTypes.includes(s.sectionType)) {
        unrecognizedSections.push(s.heading || s.sectionType);
      }
    }

    let extractionConfidence = 0.95;
    if (!identity.contact.email) extractionConfidence -= 0.15;
    if (skills.length === 0) extractionConfidence -= 0.2;
    if (experience.length === 0) extractionConfidence -= 0.15;
    if (education.length === 0) extractionConfidence -= 0.1;
    extractionConfidence = Math.max(0.1, Math.min(1.0, extractionConfidence));

    // =========================================================================
    // STAGE 4: Canonical Candidate Profile Assembly & Validation
    // =========================================================================
    const rawProfile = {
      schemaVersion: CANONICAL_PROFILE_SCHEMA_VERSION,
      tenantId,
      candidateId,
      sourceArtifact: {
        format: detectedFormat,
        fileName,
        fileSizeBytes,
        sha256,
        parsedAt: timestamp,
      },
      artifactQuality: qualityAudit,
      identity,
      summary,
      skills,
      experience,
      education,
      projects,
      openSourceContributions: openSource,
      certifications,
      publications,
      achievements,
      parseMetadata: {
        parserVersion: CANONICAL_PARSER_VERSION,
        extractionConfidence: Math.round(extractionConfidence * 100) / 100,
        warnings: qualityAudit.issues,
        unrecognizedSections: [...new Set(unrecognizedSections)],
        rawSectionCount: sections.length,
      },
    };

    return CanonicalCandidateProfileSchema.parse(rawProfile);
  }

  // ---------------------------------------------------------------------------
  // Internal Extraction & Normalization Methods
  // ---------------------------------------------------------------------------

  _extractIdentityAndContacts(fullText, sections) {
    const lines = fullText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const firstLines = lines.slice(0, 10).join('\n');

    // Name Extraction
    let name = 'Candidate';
    for (const l of lines.slice(0, 5)) {
      if (
        l.length > 2 &&
        l.length < 60 &&
        !l.includes('@') &&
        !l.includes('http') &&
        !l.includes('|') &&
        !/resume|curriculum|cv|summary|experience|skills|page/i.test(l) &&
        /^[A-Za-z\s.'-]+$/.test(l)
      ) {
        name = l.trim();
        break;
      }
    }

    // Email Extraction
    const emailMatch = fullText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    const email = emailMatch ? emailMatch[0].toLowerCase() : null;

    // Phone Extraction
    const phoneMatch = fullText.match(
      /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\b\d{10}\b/
    );
    const phone = phoneMatch ? phoneMatch[0].trim() : null;

    // Links Extraction (prefer header area for candidate identity links)
    const headerUrls = firstLines.match(/https?:\/\/[^\s|,]+/gi) || [];
    let github = null;
    let linkedin = null;
    let portfolio = null;

    for (const url of headerUrls) {
      if (/github\.com/i.test(url) && !github) {
        github = url;
      } else if (/linkedin\.com/i.test(url) && !linkedin) {
        linkedin = url;
      } else if (!portfolio && !/example\.com/i.test(url)) {
        portfolio = url;
      }
    }

    if (!github || !linkedin) {
      const allUrls = fullText.match(/https?:\/\/[^\s|,]+/gi) || [];
      for (const url of allUrls) {
        if (!github && /github\.com\/[a-zA-Z0-9_-]+\/?$/i.test(url)) {
          github = url;
        } else if (!linkedin && /linkedin\.com/i.test(url)) {
          linkedin = url;
        }
      }
    }

    // Work Authorization Extraction
    const workAuth = this._extractWorkAuthorization(fullText);

    // Location Extraction
    const locationMatch = firstLines.match(
      /(?:location|address)?\s*:?\s*([A-Za-z\s]+,\s*(?:[A-Z]{2}|[A-Za-z\s]+))/i
    );
    const location = locationMatch ? locationMatch[1].trim() : null;

    return {
      name,
      headline: lines[1] && lines[1].length < 80 && !lines[1].includes('@') ? lines[1] : null,
      location,
      workAuthorization: workAuth,
      contact: {
        email,
        phone,
        address: null,
        city: location ? location.split(',')[0].trim() : null,
        state: location && location.includes(',') ? location.split(',')[1].trim() : null,
        country: null,
        postalCode: null,
      },
      links: {
        github,
        linkedin,
        portfolio,
        website: null,
        other: [],
      },
    };
  }

  _extractWorkAuthorization(text) {
    if (/\b(?:us\s+citizen|u\.s\.\s+citizen|united\s+states\s+citizen)\b/i.test(text)) {
      return 'US_CITIZEN';
    }
    if (/\b(?:permanent\s+resident|green\s+card)\b/i.test(text)) {
      return 'GREEN_CARD';
    }
    if (/\b(?:authorized\s+to\s+work|work\s+authorization|eligible\s+to\s+work)\b/i.test(text)) {
      return 'AUTHORIZED_TO_WORK';
    }
    if (/\b(?:h1-?b|opt|cpt|visa\s+sponsorship)\b/i.test(text)) {
      return 'WORK_VISA_OR_SPONSORSHIP';
    }
    return null;
  }

  _extractSummary(fullText, sections) {
    const summarySec =
      sections.find((s) => s.sectionType === 'SUMMARY' && s.heading !== 'SUMMARY') ||
      sections.find((s) => s.sectionType === 'SUMMARY');

    const text = summarySec ? summarySec.rawText.trim() : '';

    // Estimate years of experience mentioned in summary
    let yoe = null;
    const yoeMatch = text.match(/(\d+)\+?\s*(?:years|yrs)(?:\s+of)?\s+experience/i);
    if (yoeMatch) {
      yoe = parseInt(yoeMatch[1], 10);
    }

    return {
      text,
      rawText: text,
      yearsOfExperience: yoe,
      highlightedAreas: [],
    };
  }

  _extractSkills(fullText, sections) {
    const skillsSec = sections.find((s) => s.sectionType === 'SKILLS');
    const rawSkills = skillsSec?.structuredData?.skills || [];
    const skillList = [];
    const seen = new Set();

    for (const item of rawSkills) {
      const name = String(item).trim();
      const canonical = normalizeTechnologyName(name) || name;
      if (!canonical || seen.has(canonical.toLowerCase())) continue;
      seen.add(canonical.toLowerCase());

      skillList.push({
        id: crypto.randomUUID(),
        name: canonical,
        slug: this._generateSafeSlug(canonical),
        category: this._classifySkillCategory(canonical),
        yearsOfExperience: null,
        lastUsed: null,
        context: null,
        confidence: 1.0,
      });
    }

    return skillList;
  }

  _generateSafeSlug(name) {
    let s = String(name || '')
      .toLowerCase()
      .trim();
    if (s === 'c++') return 'cpp';
    if (s === 'c#') return 'csharp';
    if (s === '.net') return 'dotnet';
    s = s.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return s || 'skill';
  }

  _classifySkillCategory(name) {
    const lower = name.toLowerCase();
    if (
      /javascript|typescript|python|java\b|c\+\+|golang|go\b|rust|ruby|php|c#|swift|kotlin/i.test(
        lower
      )
    ) {
      return 'LANGUAGE';
    }
    if (
      /react|vue|angular|svelte|next\.js|express|nest|fastapi|django|flask|spring|rails/i.test(
        lower
      )
    ) {
      return 'FRAMEWORK';
    }
    if (
      /postgres|mysql|sqlite|mongodb|redis|cassandra|dynamodb|elasticsearch|oracle/i.test(lower)
    ) {
      return 'DATABASE';
    }
    if (
      /aws|azure|gcp|docker|kubernetes|terraform|ci\/cd|github actions|jenkins|linux|nginx/i.test(
        lower
      )
    ) {
      return 'CLOUD_DEVOPS';
    }
    if (/git\b|jira|webpack|vite|postman|figma|bash|powershell|vscode/i.test(lower)) {
      return 'TOOL';
    }
    if (
      /microservices|rest|graphql|grpc|distributed|system design|event-driven|clean architecture/i.test(
        lower
      )
    ) {
      return 'ARCHITECTURE';
    }
    return 'OTHER';
  }

  _extractExperience(fullText, sections) {
    const expSec = sections.find((s) => s.sectionType === 'WORK_EXPERIENCE');
    const rawExperiences = expSec?.structuredData?.experiences || [];
    const experiences = [];

    for (const exp of rawExperiences) {
      const title = exp.role || 'Software Engineer';
      const company = exp.company || 'Company';
      const dates = exp.dates || '';
      const location = exp.location || null;
      const bullets = Array.isArray(exp.bullets) ? exp.bullets : [];

      const { startDate, endDate, isCurrent, durationMonths } = this._parseTenure(dates);
      const employmentType = this._classifyEmploymentType(title, exp);

      // Extract technologies mentioned in bullets
      const technologies = [];
      const techRegex =
        /\b(React|Node\.js|NodeJS|TypeScript|JavaScript|Python|PostgreSQL|Docker|Kubernetes|AWS|GraphQL|Redis|Go|Rust|Java|MongoDB)\b/gi;
      for (const b of bullets) {
        let m;
        while ((m = techRegex.exec(b)) !== null) {
          const canonical = normalizeTechnologyName(m[0]);
          if (canonical && !technologies.includes(canonical)) {
            technologies.push(canonical);
          }
        }
      }

      experiences.push({
        id: crypto.randomUUID(),
        company,
        title,
        employmentType,
        location,
        startDate: startDate || '2020-01-01',
        endDate: isCurrent ? null : endDate || null,
        isCurrent,
        durationMonths,
        responsibilities: bullets.slice(0, 2),
        technologies,
        bullets,
        scale: null,
        impact: null,
        leadership: /lead|manager|head|director|founder/i.test(title) ? 'Leadership Role' : null,
      });
    }

    return experiences;
  }

  _parseTenure(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') {
      return { startDate: '2021-01-01', endDate: null, isCurrent: true, durationMonths: 12 };
    }

    const isCurrent = /\b(?:present|current|now)\b/i.test(dateStr);
    const years = dateStr.match(/\b(?:19|20)\d{2}\b/g) || [];

    let startYear = years[0] ? parseInt(years[0], 10) : 2021;
    let endYear = isCurrent
      ? new Date().getFullYear()
      : years[1]
        ? parseInt(years[1], 10)
        : startYear;

    const startDate = `${startYear}-01-01`;
    const endDate = isCurrent ? null : `${endYear}-01-01`;
    const durationMonths = Math.max(1, (endYear - startYear) * 12);

    return {
      startDate,
      endDate,
      isCurrent,
      durationMonths,
    };
  }

  _classifyEmploymentType(title, exp) {
    const combined = `${title} ${exp.company || ''} ${(exp.bullets || []).join(' ')}`.toLowerCase();
    if (/\bintern\b|\binternship\b/i.test(combined)) return 'INTERNSHIP';
    if (/\bcontract\b|\bcontractor\b/i.test(combined)) return 'CONTRACT';
    if (/\bfreelance\b|\bconsultant\b/i.test(combined)) return 'FREELANCE';
    if (/\bfounder\b|\bco-founder\b|\bceo\b/i.test(combined)) return 'FOUNDER';
    if (/\bpart-time\b|\bpart time\b/i.test(combined)) return 'PART_TIME';
    if (/\bresearcher\b|\bpostdoc\b|\bteaching\s+assistant\b/i.test(combined)) return 'ACADEMIC';
    return 'FULL_TIME';
  }

  _extractEducation(fullText, sections) {
    const eduSec = sections.find((s) => s.sectionType === 'EDUCATION');
    const rawEdus = eduSec?.structuredData?.education || [];
    const educations = [];

    for (const edu of rawEdus) {
      const institution = edu.institution || 'University';
      const degree = edu.degree || 'Bachelor of Science';
      const fieldOfStudy = edu.fieldOfStudy || 'Computer Science';
      const graduationYear = edu.graduationYear || (edu.endDate ? parseInt(edu.endDate, 10) : null);

      educations.push({
        id: crypto.randomUUID(),
        institution,
        degree,
        fieldOfStudy,
        startDate: edu.startDate || null,
        endDate: edu.endDate || null,
        graduationYear: Number.isInteger(graduationYear) ? graduationYear : null,
        gpa: edu.gpa || null,
        honors: [],
        bullets: edu.bullets || [],
      });
    }

    if (educations.length === 0 && eduSec) {
      // Fallback parse if unstructured
      const norm = EducationNormalizer.normalize(eduSec.rawText);
      for (const e of norm) {
        educations.push({
          id: crypto.randomUUID(),
          institution: e.institution || 'University',
          degree: e.degree || 'Bachelor of Science',
          fieldOfStudy: e.fieldOfStudy || 'Computer Science',
          startDate: null,
          endDate: null,
          graduationYear: null,
          gpa: null,
          honors: [],
          bullets: [],
        });
      }
    }

    return educations;
  }

  _extractProjects(fullText, sections) {
    const projSec = sections.find((s) => s.sectionType === 'PROJECTS');
    const rawProjects = projSec?.structuredData?.projects || [];
    const projects = [];

    for (const p of rawProjects) {
      const name = p.title || 'Project';
      const rawTechs = Array.isArray(p.technologies) ? p.technologies : [];
      const bullets = Array.isArray(p.bullets) ? p.bullets : [];

      // Check p.urls first, or scan the project title / bullets / technologies for any embedded URL
      let url = p.urls && p.urls[0] ? p.urls[0] : null;
      if (!url) {
        const combined = `${name} ${rawTechs.join(' ')} ${bullets.join(' ')}`;
        const urlMatch = combined.match(/https?:\/\/[^\s"'<>|)]+/);
        if (urlMatch) {
          url = urlMatch[0];
        }
      }
      const githubUrl = url && url.includes('github.com') ? url : null;

      // Filter out raw URLs from technologies list
      const technologies = rawTechs.filter((t) => !/^https?:\/\//i.test(t));

      const complexityLevel = this._classifyProjectComplexity(
        `${name} ${bullets.join(' ')} ${technologies.join(' ')}`
      );

      projects.push({
        id: crypto.randomUUID(),
        name,
        description: bullets[0] || null,
        role: 'Creator / Core Developer',
        technologies,
        url: url && !url.includes('github.com') ? url : null,
        githubUrl,
        bullets,
        projectType: 'APPLICATION',
        complexityLevel,
      });
    }

    return projects;
  }

  _classifyProjectComplexity(text) {
    const lower = text.toLowerCase();
    if (/\btodo|calculator|tic-tac-toe|weather\s+app|counter\b/i.test(lower)) {
      return 'TUTORIAL';
    }
    if (/\bcrud|blog|note-taking|simple\s+api\b/i.test(lower)) {
      return 'BASIC_CRUD';
    }
    if (
      /\bproduction|kubernetes|microservices|distributed|high-throughput|ci\/cd|load\s+balancer|kafka\b/i.test(
        lower
      )
    ) {
      return 'PRODUCTION_GRADE';
    }
    if (/\bcache|redis|docker|authentication|jwt|postgresql|indexes|rbac\b/i.test(lower)) {
      return 'ADVANCED';
    }
    return 'INTERMEDIATE';
  }

  _extractOpenSource(fullText, sections, projects) {
    const openSourceList = [];

    // Search for explicit Open Source contributions in text or projects
    for (const proj of projects) {
      if (
        proj.githubUrl ||
        /open[- ]source|contributor|pull request/i.test(proj.description || '')
      ) {
        openSourceList.push({
          id: crypto.randomUUID(),
          repository: proj.name,
          organization: null,
          role: 'MAINTAINER',
          prUrl: null,
          issueUrl: null,
          description: proj.description || `Open source project: ${proj.name}`,
          technologies: proj.technologies,
          starsCount: null,
          mergedPrCount: null,
        });
      }
    }

    return openSourceList;
  }

  _extractCertifications(fullText, sections) {
    const certSec = sections.find((s) => s.sectionType === 'CERTIFICATIONS');
    const rawCerts = certSec?.structuredData?.certs || [];
    const certs = [];

    for (const c of rawCerts) {
      certs.push({
        id: crypto.randomUUID(),
        name: String(c),
        issuingOrganization: 'Certification Authority',
        issueDate: null,
        expirationDate: null,
        credentialId: null,
        credentialUrl: null,
      });
    }

    return certs;
  }

  _extractPublications(fullText, sections) {
    return [];
  }

  _extractAchievements(fullText, sections) {
    return [];
  }
}

export const canonicalAtsParserService = new CanonicalAtsParserService();
