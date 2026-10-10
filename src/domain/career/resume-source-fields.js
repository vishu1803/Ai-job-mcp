import { z } from 'zod';

export function isResumeDate(value) {
  if (!/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || (month !== undefined && (month < 1 || month > 12))) return false;
  if (day === undefined) return true;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return day >= 1 && day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

export const ResumeDateSchema = z
  .string()
  .trim()
  .refine(isResumeDate, 'Use a valid YYYY, YYYY-MM or YYYY-MM-DD date')
  .nullable()
  .optional();
export const ResumeUrlSchema = z
  .string()
  .trim()
  .url()
  .refine(
    (value) => ['http:', 'https:'].includes(new URL(value).protocol),
    'Use an HTTP or HTTPS URL'
  )
  .nullable()
  .optional();

// Compare intervals, not invented month/day precision. Overlapping year/month ranges are valid.
export function validateResumeDateRange(record, context) {
  const start = record.startDate || record.issueDate;
  const end = record.endDate || record.expirationDate;
  if (!start || !end || !isResumeDate(start) || !isResumeDate(end)) return;
  const earliest =
    start.length === 4 ? `${start}-01-01` : start.length === 7 ? `${start}-01` : start;
  const latest = end.length === 4 ? `${end}-12-31` : end.length === 7 ? `${end}-31` : end;
  if (earliest > latest)
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: [record.issueDate ? 'expirationDate' : 'endDate'],
      message: 'End date precedes start date',
    });
}

export const OPTIONAL_RESUME_SECTIONS = Object.freeze({
  coursework: 'COURSEWORK',
  publications: 'PUBLICATIONS',
  achievements: 'ACHIEVEMENTS',
  additionalSkills: 'ADDITIONAL_SKILLS',
  awards: 'AWARDS',
  languages: 'LANGUAGES',
  volunteerExperience: 'VOLUNTEER',
  leadership: 'LEADERSHIP',
  customSections: 'CUSTOM',
});

const text = (limit = 1000) => z.string().trim().max(limit).nullable().optional();
const strings = z.array(z.string().trim().min(1).max(2000)).max(100).default([]);
export const ResumeOptionalEntrySchema = z
  .object({
    id: text(255),
    title: text(500),
    name: text(500),
    organization: text(255),
    issuer: text(255),
    publisher: text(500),
    description: text(5000),
    summary: text(5000),
    category: text(255),
    language: text(255),
    proficiency: z
      .enum(['NATIVE', 'FLUENT', 'PROFESSIONAL', 'INTERMEDIATE', 'BASIC'])
      .nullable()
      .optional(),
    date: ResumeDateSchema,
    startDate: ResumeDateSchema,
    endDate: ResumeDateSchema,
    isCurrent: z.boolean().default(false),
    location: text(255),
    url: ResumeUrlSchema,
    authors: strings,
    bullets: strings,
    items: strings,
    provenanceStatus: z.enum(['USER_PROVIDED', 'CLAIMED']).default('USER_PROVIDED'),
    legacyFields: z.record(z.unknown()).optional(),
  })
  .strict()
  .superRefine(validateResumeDateRange);
