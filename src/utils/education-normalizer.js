/**
 * @file Deterministic Resume Education Normalizer & Coursework Isolator
 *
 * Solves the naive comma-splitting failure mode where:
 * - "Rajkiya Engineering College, Sonbhadra" was parsed as degree="Rajkiya Engineering College", institution="Sonbhadra"
 * - "Relevant Coursework: Data Structures, OS, C" was split into fake education institutions named "Operating Systems", "C", etc.
 *
 * Implements:
 * 1. Institution vs Location recognition
 * 2. Degree & DegreeType classification (BACHELOR, MASTER, DOCTORATE, ASSOCIATE, DIPLOMA, BOOTCAMP, COURSEWORK, OTHER)
 * 3. Field of Study extraction
 * 4. Structured date range normalization via DateRangeNormalizer
 * 5. Coursework line isolation and attachment
 * 6. Claim truth status preservation (CLAIMED / USER_PROVIDED)
 */

import { DateRangeNormalizer } from './date-range-normalizer.js';

const DEGREE_PATTERNS = [
  {
    type: 'BACHELOR',
    regex:
      /\b(?:bachelor(?:'s)?|b\.?\s*tech|b\.?\s*e\.?|b\.?\s*s\.?|b\.?\s*sc|b\.?\s*c\.?\s*a|bachelor of technology|bachelor of engineering|bachelor of science|bachelor of arts|bachelor of computer applications)\b/i,
  },
  {
    type: 'MASTER',
    regex:
      /\b(?:master(?:'s)?|m\.?\s*tech|m\.?\s*e\.?|m\.?\s*s\.?|m\.?\s*sc|m\.?\s*c\.?\s*a|m\.?\s*b\.?\s*a|master of technology|master of engineering|master of science|master of computer applications)\b/i,
  },
  {
    type: 'DOCTORATE',
    regex: /\b(?:ph\.?\s*d|doctorate|doctor of philosophy)\b/i,
  },
  {
    type: 'ASSOCIATE',
    regex: /\b(?:associate(?:'s)?|associate degree|associate of science|associate of arts)\b/i,
  },
  {
    type: 'DIPLOMA',
    regex: /\b(?:diploma|higher secondary|senior secondary|intermediate|high school|12th|10th)\b/i,
  },
  {
    type: 'BOOTCAMP',
    regex: /\b(?:bootcamp|fellowship|immersive|nanodegree|accelerator)\b/i,
  },
];

const INSTITUTION_KEYWORDS = [
  'university',
  'college',
  'institute',
  'academy',
  'school',
  'polytechnic',
  'campus',
  'faculty',
  'iit',
  'nit',
  'iiit',
  'rec',
  'bits',
];

export class EducationNormalizer {
  /**
   * Checks if a line is a coursework declaration.
   *
   * @param {string} line
   * @returns {boolean}
   */
  static isCourseworkLine(line) {
    if (!line || typeof line !== 'string') return false;
    const lower = line.toLowerCase().trim();
    return (
      lower.includes('coursework') ||
      lower.includes('core cs') ||
      lower.includes('cs focus') ||
      lower.includes('core subjects') ||
      lower.startsWith('courses:') ||
      lower.startsWith('key courses') ||
      lower.startsWith('subjects:') ||
      lower.startsWith('focus:')
    );
  }

  /**
   * Extracts coursework tokens from a coursework line.
   *
   * @param {string} line
   * @returns {string[]}
   */
  static extractCourseworkItems(line) {
    if (!line) return [];
    return line
      .split(/[,;•|]/)
      .map((c) =>
        c
          .replace(/^[^:]*(?:coursework|focus|subjects|courses)\s*[:=]?\s*/i, '')
          .replace(/^[●•\-*]\s*/, '')
          .trim()
      )
      .filter(
        (c) => c.length >= 1 && !/^(?:coursework|relevant|core cs|focus|subjects|courses)$/i.test(c)
      );
  }

  /**
   * Classifies degree type from degree text.
   *
   * @param {string} text
   * @returns {'BACHELOR' | 'MASTER' | 'DOCTORATE' | 'ASSOCIATE' | 'DIPLOMA' | 'BOOTCAMP' | 'COURSEWORK' | 'OTHER'}
   */
  static classifyDegreeType(text) {
    if (!text || typeof text !== 'string') return 'OTHER';
    for (const pattern of DEGREE_PATTERNS) {
      if (pattern.regex.test(text)) {
        return pattern.type;
      }
    }
    return 'OTHER';
  }

  /**
   * Parses raw lines of an Education section into structured, normalized education entries.
   *
   * @param {string | string[]} input - Section raw text or array of lines.
   * @param {object} [options={}]
   * @param {'CLAIMED' | 'USER_PROVIDED' | 'VERIFIED'} [options.provenanceStatus='CLAIMED']
   * @returns {Array<{
   *   institution: string,
   *   degree: string | null,
   *   fieldOfStudy: string | null,
   *   degreeType: 'BACHELOR' | 'MASTER' | 'DOCTORATE' | 'ASSOCIATE' | 'DIPLOMA' | 'BOOTCAMP' | 'COURSEWORK' | 'OTHER',
   *   location: string | null,
   *   startDate: string | null,
   *   endDate: string | null,
   *   isCurrent: boolean,
   *   rawDateRange: string | null,
   *   coursework: string[],
   *   gradeOrGpa: string | null,
   *   rawText: string,
   *   provenanceStatus: 'CLAIMED' | 'USER_PROVIDED' | 'VERIFIED'
   * }>}
   */
  static normalize(input, options = {}) {
    const defaultProvenance = options.provenanceStatus || 'CLAIMED';

    if (Array.isArray(input)) {
      const allStructured = input.every(
        (item) => item && typeof item === 'object' && !item.rawText && item.institution
      );
      if (allStructured && input.length > 0) {
        return input.map((item) => {
          const rawDates =
            item.rawDateRange ||
            (item.startDate && item.endDate
              ? `${item.startDate} - ${item.endDate}`
              : item.startDate || item.endDate || '');
          const dNorm = rawDates ? DateRangeNormalizer.normalize(rawDates) : null;
          const degType =
            item.degreeType && item.degreeType !== 'OTHER'
              ? item.degreeType
              : item.degree
                ? EducationNormalizer.classifyDegreeType(item.degree)
                : item.degreeType || 'OTHER';

          return {
            institution: item.institution || 'Institution',
            degree: item.degree || null,
            fieldOfStudy: item.fieldOfStudy || null,
            degreeType: degType,
            location: item.location || null,
            startDate: item.startDate || dNorm?.startDate || null,
            endDate: item.endDate || dNorm?.endDate || null,
            isCurrent: Boolean(item.isCurrent || item.currentlyEnrolled || dNorm?.isCurrent),
            rawDateRange: item.rawDateRange || dNorm?.rawDateRange || null,
            coursework: Array.isArray(item.coursework)
              ? item.coursework
              : typeof item.coursework === 'string'
                ? item.coursework
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean)
                : [],
            gradeOrGpa: item.gradeOrGpa || null,
            rawText: item.rawText || `${item.institution} | ${item.degree || ''}`,
            provenanceStatus: item.provenanceStatus || defaultProvenance,
          };
        });
      }
    }

    let lines = [];
    if (Array.isArray(input)) {
      lines = input
        .flatMap((item) => {
          if (!item) return [];
          if (typeof item === 'string') return item.split('\n');
          if (typeof item === 'object') {
            if (item.rawText) return String(item.rawText).split('\n');
            const parts = [];
            if (item.institution && item.institution !== 'Institution')
              parts.push(item.institution);
            if (item.degree) parts.push(item.degree);
            if (item.location) parts.push(item.location);
            if (item.rawDateRange || item.endDate) parts.push(item.rawDateRange || item.endDate);
            if (Array.isArray(item.coursework) && item.coursework.length > 0) {
              parts.push(`Relevant Coursework: ${item.coursework.join(', ')}`);
            }
            return parts.length > 0 ? [parts.join(' | ')] : [];
          }
          return [String(item)];
        })
        .map((l) => l.trim().replace(/^[●•\-*]\s*/, ''))
        .filter(Boolean);
    } else if (typeof input === 'string') {
      lines = input
        .split('\n')
        .map((l) => l.trim().replace(/^[●•\-*]\s*/, ''))
        .filter(Boolean);
    }

    if (lines.length === 0) return [];

    const entries = [];
    let currentEntry = null;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      // 1. Check for coursework line
      if (EducationNormalizer.isCourseworkLine(line)) {
        const courses = EducationNormalizer.extractCourseworkItems(line);
        if (currentEntry) {
          currentEntry.coursework.push(...courses);
          currentEntry.rawText += `\n${line}`;
        }
        continue;
      }

      // 2. Check for GPA / CGPA / Percentage
      const gpaMatch = line.match(
        /\b(?:GPA|CGPA|Grade|Percentage|Score)\s*[:=]?\s*([0-9.]+(?:\s*\/\s*[0-9.]+)?%?)/i
      );
      if (gpaMatch && currentEntry && currentEntry.institution) {
        currentEntry.gradeOrGpa = gpaMatch[1].trim();
        currentEntry.rawText += `\n${line}`;
        continue;
      }

      // 3. Check for Date line
      const dateMatch = DateRangeNormalizer.normalize(line);
      if (
        !dateMatch.isUncertain &&
        currentEntry &&
        currentEntry.institution &&
        !currentEntry.startDate
      ) {
        currentEntry.startDate = dateMatch.startDate;
        currentEntry.endDate = dateMatch.endDate;
        currentEntry.isCurrent = dateMatch.isCurrent;
        currentEntry.rawDateRange = dateMatch.rawDateRange;
        currentEntry.rawText += `\n${line}`;
        continue;
      }

      // 4. Check for piped line e.g. "Bachelor of Technology | Rajkiya Engineering College, Sonbhadra | 2020 - 2024"
      // or "Rajkiya Engineering College | Sonbhadra | Graduation: July 2025"
      if (line.includes('|')) {
        if (currentEntry) entries.push(currentEntry);
        const parts = line.split('|').map((p) => p.trim());
        let instPart = parts[0] || 'Institution';
        let degPart = null;
        let loc = null;
        const datePart = parts[2] || null;

        const type0 = EducationNormalizer.classifyDegreeType(parts[0]);
        const type1 = parts[1] ? EducationNormalizer.classifyDegreeType(parts[1]) : 'OTHER';

        const instKw0 = INSTITUTION_KEYWORDS.some((kw) => parts[0].toLowerCase().includes(kw));
        const instKw1 = parts[1]
          ? INSTITUTION_KEYWORDS.some((kw) => parts[1].toLowerCase().includes(kw))
          : false;

        if (type0 !== 'OTHER') {
          // parts[0] is degree, parts[1] is institution
          degPart = parts[0];
          instPart = parts[1] || 'Institution';
        } else if (type1 !== 'OTHER') {
          // parts[0] is institution, parts[1] is degree
          degPart = parts[1];
          instPart = parts[0] || 'Institution';
        } else if (instKw1 && !instKw0) {
          // parts[1] has institution keyword and parts[0] does not (e.g. "Sonbhadra | Rajkiya Engineering College")
          instPart = parts[1];
          loc = parts[0];
        } else {
          // parts[0] is institution, parts[1] is location (e.g. "Rajkiya Engineering College | Sonbhadra")
          instPart = parts[0] || 'Institution';
          if (parts[1]) {
            loc = parts[1];
          }
        }

        if (instPart && instPart.includes(',') && !loc) {
          const cParts = instPart.split(',').map((p) => p.trim());
          instPart = cParts[0];
          loc = cParts.slice(1).join(', ');
        }

        const dNorm = datePart ? DateRangeNormalizer.normalize(datePart) : null;
        const degType = degPart ? EducationNormalizer.classifyDegreeType(degPart) : 'OTHER';

        // Extract field of study from degree part if "in" is present
        const degree = degPart;
        let fieldOfStudy = null;
        if (degPart) {
          const inMatch = degPart.match(/\b(?:in|major in|specialization in)\s+(.+)/i);
          if (inMatch) {
            fieldOfStudy = inMatch[1].trim();
          }
        }

        currentEntry = {
          institution: instPart,
          degree,
          fieldOfStudy,
          degreeType: degType,
          location: loc,
          startDate: dNorm?.startDate || null,
          endDate: dNorm?.endDate || null,
          isCurrent: dNorm?.isCurrent || false,
          rawDateRange: dNorm?.rawDateRange || null,
          coursework: [],
          gradeOrGpa: null,
          rawText: line,
          provenanceStatus: defaultProvenance,
        };
        continue;
      }

      // 5. Check for Institution + City/Location e.g. "Rajkiya Engineering College, Sonbhadra"
      const hasInstKw = INSTITUTION_KEYWORDS.some((kw) => line.toLowerCase().includes(kw));
      const hasDegreeKw = DEGREE_PATTERNS.some((dp) => dp.regex.test(line));

      if (hasInstKw && !hasDegreeKw) {
        let inst = line;
        let loc = null;
        if (line.includes(',')) {
          const cParts = line.split(',').map((p) => p.trim());
          inst = cParts[0];
          loc = cParts.slice(1).join(', ');
        }

        if (
          currentEntry &&
          currentEntry.degree &&
          (!currentEntry.institution || currentEntry.institution === 'Institution')
        ) {
          currentEntry.institution = inst;
          currentEntry.location = loc;
          currentEntry.rawText += `\n${line}`;
          continue;
        }

        if (
          currentEntry &&
          currentEntry.institution &&
          currentEntry.institution !== 'Institution'
        ) {
          entries.push(currentEntry);
        }

        currentEntry = {
          institution: inst,
          degree: null,
          fieldOfStudy: null,
          degreeType: 'OTHER',
          location: loc,
          startDate: null,
          endDate: null,
          isCurrent: false,
          rawDateRange: null,
          coursework: [],
          gradeOrGpa: null,
          rawText: line,
          provenanceStatus: defaultProvenance,
        };
        continue;
      }

      // 6. Check for Degree line e.g. "Bachelor of Technology in Computer Science and Engineering"
      if (hasDegreeKw) {
        const degType = EducationNormalizer.classifyDegreeType(line);
        let fieldOfStudy = null;
        const inMatch = line.match(/\b(?:in|major in|specialization in)\s+(.+)/i);
        if (inMatch) {
          fieldOfStudy = inMatch[1].trim().replace(/[,;.]+$/, '');
        }

        if (
          currentEntry &&
          currentEntry.institution &&
          currentEntry.institution !== 'Institution' &&
          (!currentEntry.degree || currentEntry.degreeType === 'OTHER')
        ) {
          currentEntry.degree = line;
          currentEntry.degreeType = degType;
          currentEntry.fieldOfStudy = fieldOfStudy;
          currentEntry.rawText += `\n${line}`;
        } else {
          if (currentEntry) entries.push(currentEntry);
          currentEntry = {
            institution: 'Institution',
            degree: line,
            fieldOfStudy,
            degreeType: degType,
            location: null,
            startDate: null,
            endDate: null,
            isCurrent: false,
            rawDateRange: null,
            coursework: [],
            gradeOrGpa: null,
            rawText: line,
            provenanceStatus: defaultProvenance,
          };
        }
        continue;
      }

      // 7. General supporting line or location
      if (currentEntry) {
        currentEntry.rawText += `\n${line}`;
      } else {
        currentEntry = {
          institution: line,
          degree: null,
          fieldOfStudy: null,
          degreeType: 'OTHER',
          location: null,
          startDate: null,
          endDate: null,
          isCurrent: false,
          rawDateRange: null,
          coursework: [],
          gradeOrGpa: null,
          rawText: line,
          provenanceStatus: defaultProvenance,
        };
      }
    }

    if (currentEntry) {
      entries.push(currentEntry);
    }

    // Post-process: clean up institutions and ensure deduplication of coursework
    return entries.map((entry) => ({
      ...entry,
      coursework: [...new Set(entry.coursework)],
    }));
  }
}
