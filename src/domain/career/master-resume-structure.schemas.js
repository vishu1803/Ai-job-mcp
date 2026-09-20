/**
 * @file Master Resume Structure Schemas (P43 / Architecture Separation).
 *
 * Enforces the strict architectural separation of ResumeStructure (invariant)
 * from JobTailoredContent (dynamic per target job).
 */

import { z } from 'zod';

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
]);

export const DEFAULT_MASTER_SECTION_ORDER = Object.freeze([
  'HEADER',
  'SUMMARY',
  'SKILLS',
  'PROJECTS',
  'DSA',
  'EXPERIENCE',
  'EDUCATION',
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
