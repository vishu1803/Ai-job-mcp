import { EducationNormalizer } from './education-normalizer.js';
import crypto from 'node:crypto';
import { z } from 'zod';
import { ValidationError } from '../errors/index.js';
import {
  SourceExperienceSnapshotSchema,
  SourceEducationSnapshotSchema,
  SourceCertificationSnapshotSchema,
} from '../domain/career/resume.schemas.js';
import {
  isResumeDate,
  OPTIONAL_RESUME_SECTIONS,
  ResumeOptionalEntrySchema,
} from '../domain/career/resume-source-fields.js';
import { DateRangeNormalizer } from './date-range-normalizer.js';
import { canonicalPackageJson } from '../domain/job/application-package-identity.js';

export function resumeSourceValue(profile, field, aliases = []) {
  const meta = profile.profileMetadata || profile.candidate?.profileMetadata || {};
  for (const source of [meta.userCustom, meta, profile, meta.resumeData, profile.resumeData]) {
    for (const key of [field, ...aliases])
      if (source && Object.hasOwn(source, key)) return source[key];
  }
  return undefined;
}

// Plain text preview uses the same meaningful source metadata as document exports.
export function formatResumeSourceEntry(entry) {
  if (typeof entry === 'string') return entry;
  return [
    ...new Set(
      [
        entry.title,
        entry.name,
        entry.language,
        entry.organization,
        entry.issuingOrganization,
        entry.issuer,
        entry.publisher,
        entry.category,
        entry.location,
        entry.proficiency,
        entry.date,
        entry.startDate,
        entry.isCurrent ? 'Present' : entry.endDate,
        entry.issueDate ? `Issued: ${entry.issueDate}` : null,
        entry.expirationDate ? `Expires: ${entry.expirationDate}` : null,
        entry.credentialId ? `ID: ${entry.credentialId}` : null,
        ...(entry.authors || []),
        entry.summary,
        entry.description,
        entry.notes,
        ...(entry.bullets || []),
        ...(entry.items || []),
        entry.credentialUrl || entry.url,
      ].filter(Boolean)
    ),
  ].join(' | ');
}

function lines(value) {
  if (value == null) return [];
  if (!Array.isArray(value))
    throw new ValidationError('Resume text entries must be an array', 'INVALID_RESUME_SOURCE');
  return [
    ...new Set(
      value
        .map((item) => {
          const text = typeof item === 'string' ? item : item?.text;
          if (typeof text !== 'string')
            throw new ValidationError(
              'Resume text entries must contain text',
              'INVALID_RESUME_SOURCE'
            );
          return text.trim();
        })
        .filter(Boolean)
    ),
  ];
}

function date(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string')
    throw new ValidationError('Resume dates must be text', 'INVALID_RESUME_SOURCE');
  const raw = value.trim();
  if (isResumeDate(raw) || /^\d{4}-/.test(raw)) return raw;
  if (/\s+(?:[-–—]|to)\s+/i.test(raw)) {
    const compact = /^(\d{4})\s*[-–—]\s*(\d{4}|present|current|ongoing)$/i.exec(raw);
    const parts = compact ? compact.slice(1) : raw.split(/\s+(?:[-–—]|to)\s+/i);
    if (parts.length >= 1 && parts[0]) {
      return date(parts[0]);
    }
  }
  if (
    !/^(?:(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{4}|\d{1,2}[/-]\d{4})$/i.test(
      raw
    )
  )
    throw new ValidationError(
      'Unrecognized resume date; retain the original and correct it',
      'INVALID_RESUME_SOURCE'
    );
  const result = DateRangeNormalizer.normalize(raw);
  if (result.isUncertain || !result.startDate)
    throw new ValidationError(
      'Unrecognized resume date; retain the original and correct it',
      'INVALID_RESUME_SOURCE'
    );
  return result.startDate;
}

function flag(value) {
  if (value == null) return false;
  if (typeof value !== 'boolean')
    throw new ValidationError('Resume current flags must be boolean', 'INVALID_RESUME_SOURCE');
  return value;
}

function sourceRange(value) {
  if (!value) return null;
  if (typeof value !== 'string')
    throw new ValidationError('Resume date range must be text', 'INVALID_RESUME_SOURCE');
  const raw = value.trim();
  const compact = /^(\d{4})\s*[-–—]\s*(\d{4}|present|current|ongoing)$/i.exec(raw);
  const parts = compact ? compact.slice(1) : raw.split(/\s+(?:[-–—]|to)\s+/i);
  if (parts.length > 2)
    throw new ValidationError(
      'Unrecognized resume date range retained in source; review it',
      'INVALID_RESUME_SOURCE'
    );
  const isCurrent = /^(present|current|ongoing)$/i.test(parts[1] || '');
  return { startDate: date(parts[0]), endDate: isCurrent ? null : date(parts[1]), isCurrent };
}

function entries(input, prefix, schema, convert) {
  if (input == null) return [];
  if (!Array.isArray(input))
    throw new ValidationError(`${prefix} must be an array`, 'INVALID_RESUME_SOURCE');
  const seen = new Set();
  const ids = new Map();
  return input
    .map((raw) => {
      if (typeof raw === 'string') raw = { name: raw };
      if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        throw new ValidationError(`Invalid ${prefix} entry`, 'INVALID_RESUME_SOURCE');
      const converted = convert(raw);
      const shape = (typeof schema?.innerType === 'function' ? schema.innerType() : schema).shape;
      const aliases = new Set(
        prefix === 'exp'
          ? ['role', 'employer', 'organization', 'highlights', 'responsibilities']
          : prefix === 'edu'
            ? [
                'school',
                'major',
                'field',
                'gpa',
                'gradeOrGpa',
                'currentlyEnrolled',
                'graduationYear',
                'year',
              ]
            : prefix === 'cert'
              ? ['issuer', 'expiryDate', 'date', 'title']
              : []
      );
      const legacyFields = { ...(raw.legacyFields || {}) };
      for (const [key, value] of Object.entries(raw))
        if (!(key in shape) && !aliases.has(key)) legacyFields[key] = value;
      // Conflicting aliases are source information, not permission to overwrite a fact.
      const aliasTargets = {
        role: 'title',
        employer: 'company',
        organization: 'company',
        school: 'institution',
        major: 'fieldOfStudy',
        field: 'fieldOfStudy',
        gpa: 'grade',
        gradeOrGpa: 'grade',
        issuer: 'issuingOrganization',
        expiryDate: 'expirationDate',
        date: 'issueDate',
        title: 'name',
      };
      for (const key of aliases) {
        const target = aliasTargets[key];
        if (
          target &&
          raw[key] != null &&
          raw[target] != null &&
          String(raw[key]) !== String(raw[target])
        )
          legacyFields[key] = raw[key];
      }
      if (Object.keys(legacyFields).length) converted.legacyFields = legacyFields;
      const parsed = schema.parse({
        ...converted,
        provenanceStatus: raw.provenanceStatus === 'CLAIMED' ? 'CLAIMED' : 'USER_PROVIDED',
      });
      const meaningful = Object.entries(parsed).some(
        ([key, value]) =>
          !['id', 'provenanceStatus', 'isCurrent', 'legacyFields'].includes(key) &&
          (Array.isArray(value) ? value.length : value != null && value !== '')
      );
      if (!meaningful) {
        if (Object.keys(legacyFields).length)
          throw new ValidationError(
            'Unsupported resume entry retained in source; review its legacy fields',
            'INVALID_RESUME_SOURCE'
          );
        return null;
      }
      const identity = canonicalPackageJson({ ...parsed, id: undefined });
      parsed.id ||= `${prefix}-${crypto.createHash('sha256').update(identity).digest('hex').slice(0, 20)}`;
      if (ids.has(parsed.id) && ids.get(parsed.id) !== identity)
        throw new ValidationError(
          'Conflicting resume records have the same ID',
          'INVALID_RESUME_SOURCE'
        );
      ids.set(parsed.id, identity);
      return { parsed, identity };
    })
    .filter(Boolean)
    .filter(({ identity }) => !seen.has(identity) && seen.add(identity))
    .map(({ parsed }) => parsed);
}

export function normalizeResumeSourceSections(profile) {
  try {
    const experience = entries(
      resumeSourceValue(profile, 'experience', ['workExperience', 'recentExperience']),
      'exp',
      SourceExperienceSnapshotSchema,
      (r) => {
        const rawRange =
          r.rawDateRange ||
          (typeof r.startDate === 'string' && /\s+(?:[-–—]|to)\s+/i.test(r.startDate)
            ? r.startDate
            : null);
        const range = sourceRange(rawRange);
        // Earlier snapshots retained these fields as unknown metadata. Promote
        // only the now-supported keys, preserve metadata/IDs, and honor clears.
        const workText = {};
        for (const key of ['summary', 'description']) {
          const value = Object.hasOwn(r, key) ? r[key] : r.legacyFields?.[key];
          if (value !== undefined) workText[key] = value === '' ? null : value;
        }
        return {
          id: r.id,
          company: r.company || r.employer || r.organization || null,
          title: r.title || r.role || null,
          startDate: range?.startDate || date(r.startDate),
          endDate: /^(present|current|ongoing)$/i.test(r.endDate || '')
            ? null
            : date(r.endDate) || range?.endDate || null,
          isCurrent:
            flag(r.isCurrent) ||
            Boolean(range?.isCurrent || /^(present|current|ongoing)$/i.test(r.endDate || '')),
          location: r.location || null,
          bullets: lines(r.bullets ?? r.highlights ?? r.responsibilities),
          technologies: lines(r.technologies),
          employmentType: r.employmentType || null,
          ...workText,
          rawDateRange: r.rawDateRange || rawRange || null,
        };
      }
    );
    const rawEducation = resumeSourceValue(profile, 'education');
    const education = entries(
      Array.isArray(rawEducation) && rawEducation.some((e) => typeof e === 'string')
        ? rawEducation.every((e) => typeof e === 'string')
          ? EducationNormalizer.normalize(rawEducation)
          : rawEducation.flatMap((e) =>
              typeof e === 'string' ? EducationNormalizer.normalize([e]) : [e]
            )
        : rawEducation,
      'edu',
      SourceEducationSnapshotSchema,
      (r) => {
        const rawRange =
          r.rawDateRange ||
          (typeof r.startDate === 'string' && /\s+(?:[-–—]|to)\s+/i.test(r.startDate)
            ? r.startDate
            : null);
        const range = sourceRange(rawRange);
        const grade = r.grade ?? r.gpa ?? r.gradeOrGpa;
        if (typeof grade === 'number' && !Number.isFinite(grade))
          throw new ValidationError('Resume grade must be finite', 'INVALID_RESUME_SOURCE');
        return {
          id: r.id,
          institution: r.institution || r.school || null,
          degree: r.degree || null,
          fieldOfStudy: r.fieldOfStudy || r.major || r.field || null,
          startDate: range?.startDate || date(r.startDate),
          endDate: /^(present|current|ongoing)$/i.test(r.endDate || '')
            ? null
            : date(r.endDate) ||
              range?.endDate ||
              date(String(r.graduationYear || r.year || '') || null),
          isCurrent:
            flag(r.isCurrent) ||
            flag(r.currentlyEnrolled) ||
            Boolean(range?.isCurrent) ||
            /^(present|current|ongoing)$/i.test(r.endDate || ''),
          grade:
            typeof (r.grade ?? r.gpa ?? r.gradeOrGpa) === 'number'
              ? String(r.grade ?? r.gpa ?? r.gradeOrGpa)
              : (r.grade ?? r.gpa ?? r.gradeOrGpa ?? null),
          location: r.location || null,
          coursework: lines(r.coursework),
          honors: lines(r.honors),
          bullets: lines(r.bullets),
          rawDateRange: r.rawDateRange || rawRange || null,
        };
      }
    );
    const certifications = entries(
      resumeSourceValue(profile, 'certifications', ['licenses']),
      'cert',
      SourceCertificationSnapshotSchema,
      (r) => ({
        id: r.id,
        name: r.name || r.title || null,
        issuingOrganization: r.issuingOrganization || r.issuer || null,
        issueDate: date(r.issueDate || r.date),
        expirationDate: date(r.expirationDate || r.expiryDate),
        credentialId: r.credentialId || null,
        credentialUrl: r.credentialUrl || null,
        notes: r.notes || null,
      })
    );
    const optionalSections = {};
    for (const field of Object.keys(OPTIONAL_RESUME_SECTIONS)) {
      const sourceValue = resumeSourceValue(profile, field);
      optionalSections[field] = entries(
        sourceValue === undefined
          ? resumeSourceValue(profile, 'optionalSections')?.[field]
          : sourceValue,
        field,
        ResumeOptionalEntrySchema,
        (r) => {
          const converted = {};
          const optShape =
            typeof ResumeOptionalEntrySchema.innerType === 'function'
              ? ResumeOptionalEntrySchema.innerType().shape
              : ResumeOptionalEntrySchema.shape;
          for (const key of Object.keys(optShape))
            if (Object.hasOwn(r, key)) converted[key] = r[key];
          for (const key of ['date', 'startDate', 'endDate'])
            if (converted[key] !== undefined) converted[key] = date(converted[key]);
          for (const key of ['authors', 'bullets', 'items']) converted[key] = lines(converted[key]);
          if (field === 'languages') converted.language ||= r.name;
          return converted;
        }
      );
    }
    return { experience, education, certifications, optionalSections };
  } catch (error) {
    if (!(error instanceof z.ZodError)) throw error;
    throw new ValidationError(
      'Invalid resume source fields; original data has not been changed',
      'INVALID_RESUME_SOURCE',
      error.issues
    );
  }
}
