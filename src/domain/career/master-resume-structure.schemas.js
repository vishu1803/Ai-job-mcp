/**
 * @file Master Resume Structure Schemas (P43 / Architecture Separation).
 *
 * Enforces the strict architectural separation of ResumeStructure (invariant)
 * from JobTailoredContent (dynamic per target job).
 */

import { z } from 'zod';
import { OPTIONAL_RESUME_SECTIONS } from './resume-source-fields.js';

export const SectionPresencePolicyEnum = z.enum(['REQUIRED', 'REQUIRED_IF_DATA', 'OPTIONAL']);

export const MasterResumeSectionKeyEnum = z.enum([
  'HEADER',
  'SUMMARY',
  'SKILLS',
  'PROJECTS',
  'DSA',
  'EXPERIENCE',
  'EDUCATION',
  'CERTIFICATIONS',
  'COURSEWORK',
  'PUBLICATIONS',
  'ACHIEVEMENTS',
  'ADDITIONAL_SKILLS',
  'AWARDS',
  'LANGUAGES',
  'VOLUNTEER',
  'LEADERSHIP',
  'CUSTOM',
]);

export const DEFAULT_MASTER_SECTION_ORDER = Object.freeze([
  'HEADER',
  'SUMMARY',
  'SKILLS',
  'PROJECTS',
  'DSA',
  'EXPERIENCE',
  'EDUCATION',
  'CERTIFICATIONS',
]);

export const DEFAULT_MASTER_SECTION_TITLES = Object.freeze({
  HEADER: 'Header',
  SUMMARY: 'Professional Summary',
  SKILLS: 'Technical Skills',
  PROJECTS: 'Technical Projects',
  DSA: 'Problem Solving & Algorithmic Practice',
  EXPERIENCE: 'Professional Experience',
  EDUCATION: 'Education',
  CERTIFICATIONS: 'Certifications',
  COURSEWORK: 'Relevant Coursework',
  PUBLICATIONS: 'Publications',
  ACHIEVEMENTS: 'Key Achievements',
  ADDITIONAL_SKILLS: 'Additional Skills',
  AWARDS: 'Awards',
  LANGUAGES: 'Languages',
  VOLUNTEER: 'Volunteer Experience',
  LEADERSHIP: 'Leadership',
  CUSTOM: 'Additional Information',
});

export const DEFAULT_SECTION_POLICY = Object.freeze({
  HEADER: 'REQUIRED',
  SUMMARY: 'REQUIRED_IF_DATA',
  SKILLS: 'REQUIRED_IF_DATA',
  PROJECTS: 'REQUIRED_IF_DATA',
  DSA: 'REQUIRED_IF_DATA',
  EXPERIENCE: 'REQUIRED_IF_DATA',
  EDUCATION: 'REQUIRED_IF_DATA',
  CERTIFICATIONS: 'REQUIRED_IF_DATA',
  COURSEWORK: 'OPTIONAL',
  PUBLICATIONS: 'OPTIONAL',
  ACHIEVEMENTS: 'OPTIONAL',
  ADDITIONAL_SKILLS: 'OPTIONAL',
  AWARDS: 'OPTIONAL',
  LANGUAGES: 'OPTIONAL',
  VOLUNTEER: 'OPTIONAL',
  LEADERSHIP: 'OPTIONAL',
  CUSTOM: 'OPTIONAL',
});

export const MasterResumeStructureSchema = z.object({
  sections: z.array(z.string()).min(1),
  sectionOrder: z.array(z.string()).min(1),
  sectionTitles: z.record(z.string()).default(DEFAULT_MASTER_SECTION_TITLES),
  sectionPolicy: z.record(SectionPresencePolicyEnum).default(DEFAULT_SECTION_POLICY),
  projectSlotCapacity: z.number().int().positive().default(2),
  source: z
    .enum(['CANDIDATE_BASE_RESUME', 'PROFILE_METADATA', 'DEFAULT_CONTRACT'])
    .default('DEFAULT_CONTRACT'),
  metadata: z.record(z.unknown()).optional(),
});
