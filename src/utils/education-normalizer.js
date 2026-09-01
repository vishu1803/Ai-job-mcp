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

const TECH_OR_COURSEWORK_TOKENS = new Set([
  'c',
  'c++',
  'python',
  'java',
  'javascript',
  'typescript',
  'dsa',
  'data structures',
  'algorithms',
  'data structures & algorithms',
  'dbms',
  'database management systems',
  'operating systems',
  'os',
  'computer networks',
  'system modeling',
  'digital logic',
  'software engineering',
  'machine learning',
  'artificial intelligence',
  'ai',
  'ml',
  'deep learning',
]);

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
   * Checks if text contains institution keywords.
   *
   * @param {string} text
   * @returns {boolean}
   */
  static isInstitutionText(text) {
    if (!text || typeof text !== 'string') return false;
    const lower = text.toLowerCase();
    return INSTITUTION_KEYWORDS.some((kw) => lower.includes(kw));
  }

  /**
   * Detects whether an object in an array is a fragmented education piece rather than a complete record.
   *
   * @param {object} item
   * @returns {boolean}
   */
  static isFragmentObject(item) {
    if (!item || typeof item !== 'object') return false;
    const inst = (item.institution || '').trim();
    const deg = (item.degree || '').trim();
    const fos = (item.fieldOfStudy || '').trim();

    if (EducationNormalizer.isCourseworkLine(inst) || EducationNormalizer.isCourseworkLine(deg)) {
      return true;
    }
    if (TECH_OR_COURSEWORK_TOKENS.has(inst.toLowerCase())) {
      return true;
    }
    if (
      EducationNormalizer.classifyDegreeType(inst) !== 'OTHER' &&
      !EducationNormalizer.isInstitutionText(inst)
    ) {
      return true;
    }
    if (/^graduation\s*:/i.test(fos) || /^graduation\s*:/i.test(inst)) {
      return true;
    }
    if (
      EducationNormalizer.isInstitutionText(deg) &&
      !EducationNormalizer.isInstitutionText(inst)
    ) {
      return true;
    }
    return false;
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
          .replace(/[.,;:]+$/, '')
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
   * @param {string | string[] | object[]} input - Section raw text or array of lines / objects.
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

    // 1. If input is an array of already well-structured, non-fragmented records
    if (Array.isArray(input) && input.length > 0) {
      const hasAnyFragment = input.some(EducationNormalizer.isFragmentObject);
      if (!hasAnyFragment) {
        const allStructured = input.every(
          (item) =>
            item &&
            typeof item === 'object' &&
            item.institution &&
            item.institution !== 'Institution' &&
            !EducationNormalizer.isFragmentObject(item)
        );
        if (allStructured) {
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

            const isGraduationOnly =
              /^graduation\s*:/i.test(rawDates) || /^(?:completed|graduated)\b/i.test(rawDates);

            const finalIsCurrent = Boolean(
              item.isCurrent || item.currentlyEnrolled || (!item.endDate && dNorm?.isCurrent)
            );
            const finalEndDate = finalIsCurrent ? null : item.endDate || dNorm?.endDate || null;
            const finalStartDate = isGraduationOnly
              ? null
              : item.startDate || dNorm?.startDate || null;

            return {
              institution: item.institution || 'Institution',
              degree: item.degree || null,
              fieldOfStudy: item.fieldOfStudy || null,
              degreeType: degType,
              location: item.location || null,
              startDate: finalStartDate,
              endDate: finalEndDate,
              isCurrent: finalIsCurrent,
              rawDateRange: item.rawDateRange || dNorm?.rawDateRange || null,
              coursework: Array.isArray(item.coursework)
                ? [
                    ...new Set(
                      item.coursework
                        .map((c) =>
                          String(c)
                            .replace(/[.,;:]+$/, '')
                            .trim()
                        )
                        .filter(Boolean)
                    ),
                  ]
                : typeof item.coursework === 'string'
                  ? [
                      ...new Set(
                        item.coursework
                          .split(',')
                          .map((s) => s.replace(/[.,;:]+$/, '').trim())
                          .filter(Boolean)
                      ),
                    ]
                  : [],
              gradeOrGpa: item.gradeOrGpa || null,
              rawText: item.rawText || `${item.institution} | ${item.degree || ''}`,
              provenanceStatus: item.provenanceStatus || defaultProvenance,
            };
          });
        }
      }
    }

    // 2. Flatten and convert input into lines while unpacking fragmented objects
    let lines = [];
    if (Array.isArray(input)) {
      lines = input
        .flatMap((item) => {
          if (!item) return [];
          if (typeof item === 'string') return item.split('\n');
          if (typeof item === 'object') {
            const rawLine = item.rawText || item.text;
            if (rawLine) return String(rawLine).split('\n');

            const parts = [];
            let inst = item.institution || '';
            let deg = item.degree || '';
            let fos = item.fieldOfStudy || '';
            let loc = item.location || '';
            let dateStr = item.rawDateRange || item.endDate || '';

            // If degree has institution keyword and institution is location or city
            if (
              EducationNormalizer.isInstitutionText(deg) &&
              !EducationNormalizer.isInstitutionText(inst)
            ) {
              loc = inst;
              inst = deg;
              deg = '';
            }

            // If institution contains degree keyword
            if (
              EducationNormalizer.classifyDegreeType(inst) !== 'OTHER' &&
              !EducationNormalizer.isInstitutionText(inst)
            ) {
              deg = inst;
              inst = '';
            }

            // If field of study is actually graduation date
            if (/^graduation\s*:/i.test(fos)) {
              dateStr = fos;
              fos = '';
            }

            // If degree or institution is coursework
            if (EducationNormalizer.isCourseworkLine(deg)) {
              parts.push(deg);
              deg = '';
            }
            if (EducationNormalizer.isCourseworkLine(inst)) {
              parts.push(inst);
              inst = '';
            }
            if (TECH_OR_COURSEWORK_TOKENS.has(inst.toLowerCase())) {
              parts.push(`Relevant Coursework: ${inst}`);
              if (fos) parts.push(`Relevant Coursework: ${fos}`);
              inst = '';
              fos = '';
            }

            const headerParts = [];
            if (inst && inst !== 'Institution') headerParts.push(inst);
            if (loc) headerParts.push(loc);
            if (dateStr) headerParts.push(dateStr);

            if (headerParts.length > 0) {
              parts.unshift(headerParts.join(' | '));
            }

            if (deg) {
              const degFull = fos ? `${deg} in ${fos}` : deg;
              parts.push(degFull);
            }

            if (Array.isArray(item.coursework) && item.coursework.length > 0) {
              parts.push(`Relevant Coursework: ${item.coursework.join(', ')}`);
            }

            return parts.length > 0 ? parts : [];
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

      // 1. Check for coursework declaration line
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

      // 3. Check for standalone Date line
      const dateMatch = DateRangeNormalizer.normalize(line);
      if (
        !dateMatch.isUncertain &&
        currentEntry &&
        currentEntry.institution &&
        !currentEntry.endDate
      ) {
        const isGraduationOnly =
          /^graduation\s*:/i.test(line) || /^(?:completed|graduated)\b/i.test(line);

        currentEntry.startDate = isGraduationOnly ? null : dateMatch.startDate;
        currentEntry.endDate = dateMatch.endDate;
        currentEntry.isCurrent = Boolean(!dateMatch.endDate && dateMatch.isCurrent);
        currentEntry.rawDateRange = dateMatch.rawDateRange;
        currentEntry.rawText += `\n${line}`;
        continue;
      }

      // 4. Check for piped line e.g. "Rajkiya Engineering College | Sonbhadra | Graduation: July 2025"
      if (line.includes('|')) {
        const parts = line.split('|').map((p) => p.trim());
        let instPart = parts[0] || 'Institution';
        let degPart = null;
        let loc = null;
        let datePart = null;

        // Find date part if any
        for (let i = 0; i < parts.length; i++) {
          if (/^graduation\s*:/i.test(parts[i]) || /\b(19|20)\d{2}\b/.test(parts[i])) {
            datePart = parts[i];
            parts.splice(i, 1);
            break;
          }
        }

        const type0 = EducationNormalizer.classifyDegreeType(parts[0]);
        const type1 = parts[1] ? EducationNormalizer.classifyDegreeType(parts[1]) : 'OTHER';

        const instKw0 = EducationNormalizer.isInstitutionText(parts[0]);
        const instKw1 = parts[1] ? EducationNormalizer.isInstitutionText(parts[1]) : false;

        if (type0 !== 'OTHER') {
          degPart = parts[0];
          instPart = parts[1] || 'Institution';
        } else if (type1 !== 'OTHER') {
          degPart = parts[1];
          instPart = parts[0] || 'Institution';
        } else if (instKw1 && !instKw0) {
          instPart = parts[1];
          loc = parts[0];
        } else {
          instPart = parts[0] || 'Institution';
          if (parts[1]) loc = parts[1];
        }

        if (instPart && instPart.includes(',') && !loc) {
          const cParts = instPart.split(',').map((p) => p.trim());
          instPart = cParts[0];
          loc = cParts.slice(1).join(', ');
        }

        const dNorm = datePart ? DateRangeNormalizer.normalize(datePart) : null;
        const degType = degPart ? EducationNormalizer.classifyDegreeType(degPart) : 'OTHER';

        let fieldOfStudy = null;
        if (degPart) {
          const inMatch = degPart.match(/\b(?:in|major in|specialization in)\s+(.+)/i);
          if (inMatch) {
            fieldOfStudy = inMatch[1].trim();
          }
        }

        const isGraduationOnly = Boolean(
          datePart &&
          (/^graduation\s*:/i.test(datePart) || /^(?:completed|graduated)\b/i.test(datePart))
        );

        // If currentEntry already has the same institution, update it rather than creating a new entry
        if (currentEntry && currentEntry.institution.toLowerCase() === instPart.toLowerCase()) {
          if (degPart && (!currentEntry.degree || currentEntry.degreeType === 'OTHER')) {
            currentEntry.degree = degPart;
            currentEntry.degreeType = degType;
            currentEntry.fieldOfStudy = fieldOfStudy;
          }
          if (loc && !currentEntry.location) currentEntry.location = loc;
          if (dNorm?.endDate && !currentEntry.endDate) {
            currentEntry.startDate = isGraduationOnly ? null : dNorm.startDate;
            currentEntry.endDate = dNorm.endDate;
            currentEntry.isCurrent = Boolean(!dNorm.endDate && dNorm.isCurrent);
            currentEntry.rawDateRange = dNorm.rawDateRange;
          }
          currentEntry.rawText += `\n${line}`;
          continue;
        }

        if (currentEntry) entries.push(currentEntry);

        currentEntry = {
          institution: instPart,
          degree: degPart,
          fieldOfStudy,
          degreeType: degType,
          location: loc,
          startDate: isGraduationOnly ? null : dNorm?.startDate || null,
          endDate: dNorm?.endDate || null,
          isCurrent: Boolean(!dNorm?.endDate && dNorm?.isCurrent),
          rawDateRange: dNorm?.rawDateRange || null,
          coursework: [],
          gradeOrGpa: null,
          rawText: line,
          provenanceStatus: defaultProvenance,
        };
        continue;
      }

      // 5. Check for Institution + City/Location e.g. "Rajkiya Engineering College, Sonbhadra"
      const hasInstKw = EducationNormalizer.isInstitutionText(line);
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

        if (currentEntry && currentEntry.institution.toLowerCase() === inst.toLowerCase()) {
          if (loc && !currentEntry.location) currentEntry.location = loc;
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

      // 6. Check for Degree line e.g. "Bachelor of Technology in Electronics Engineering"
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
        if (/currently\s+enrolled|currently\s+attending|in\s+progress|present\b/i.test(line)) {
          currentEntry.isCurrent = true;
          currentEntry.endDate = null;
        }
        currentEntry.rawText += `\n${line}`;
      } else {
        const isCurrentHint =
          /currently\s+enrolled|currently\s+attending|in\s+progress|present\b/i.test(line);
        currentEntry = {
          institution: line,
          degree: null,
          fieldOfStudy: null,
          degreeType: 'OTHER',
          location: null,
          startDate: null,
          endDate: null,
          isCurrent: isCurrentHint,
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

    // 8. Deduplication / Consolidation of same-institution entries
    const consolidated = [];
    for (const entry of entries) {
      const normInst = entry.institution.toLowerCase().trim();
      const existing = consolidated.find(
        (c) => c.institution.toLowerCase().trim() === normInst && normInst !== 'institution'
      );

      if (existing) {
        // Merge attributes into existing
        if (!existing.degree || existing.degreeType === 'OTHER') {
          if (entry.degree && entry.degreeType !== 'OTHER') {
            existing.degree = entry.degree;
            existing.degreeType = entry.degreeType;
            existing.fieldOfStudy = entry.fieldOfStudy;
          }
        }
        if (!existing.location && entry.location) existing.location = entry.location;
        if (!existing.endDate && entry.endDate) {
          existing.startDate = entry.startDate;
          existing.endDate = entry.endDate;
          existing.isCurrent = entry.isCurrent;
          existing.rawDateRange = entry.rawDateRange;
        }
        if (entry.isCurrent) {
          existing.isCurrent = true;
          existing.endDate = null;
        }
        if (Array.isArray(entry.coursework) && entry.coursework.length > 0) {
          existing.coursework.push(...entry.coursework);
        }
        if (!existing.gradeOrGpa && entry.gradeOrGpa) existing.gradeOrGpa = entry.gradeOrGpa;
        existing.rawText += `\n${entry.rawText}`;
      } else {
        consolidated.push(entry);
      }
    }

    // Final cleanup of coursework formatting
    return consolidated.map((entry) => ({
      ...entry,
      coursework: [
        ...new Set(
          entry.coursework
            .map((c) =>
              String(c)
                .replace(/[.,;:]+$/, '')
                .trim()
            )
            .filter(Boolean)
        ),
      ],
    }));
  }
}
