/**
 * @file Universal Job Source Adapter Contract & Canonical Job Model (Phase 8.2 / ARCH-057).
 *
 * Defines the provider-neutral contract for job discovery and retrieval:
 * 1. Distinction of Domains:
 *    - JobSourceAdapter (Discovery & Ingestion) ≠ PortalAdapter (Application & Submission)
 * 2. Canonical Job Model:
 *    - Provider-agnostic canonical representation of target positions.
 *    - Strict Invariant: Provider-specific IDs (e.g. greenhouseJobId, leverJobId, workdayId)
 *      belong in externalIdentifiers or metadata, never polluting the root canonical fields.
 * 3. Provider Category Classification:
 *    - ATS, JOB_BOARD, COMPANY_CAREER_SITE, AGGREGATOR, UNKNOWN.
 */

import { z } from 'zod';
import { ValidationError } from '../../errors/index.js';

/**
 * Universal Provider Category Enum.
 */
export const ProviderCategoryEnum = z.enum([
  'ATS',
  'JOB_BOARD',
  'COMPANY_CAREER_SITE',
  'AGGREGATOR',
  'UNKNOWN',
]);

/**
 * Workplace / Remote Policy Enum.
 */
export const RemotePolicyEnum = z.enum(['REMOTE', 'HYBRID', 'ON_SITE', 'UNSPECIFIED']);

/**
 * Employment Type Enum.
 */
export const EmploymentTypeEnum = z.enum([
  'FULL_TIME',
  'PART_TIME',
  'CONTRACT',
  'INTERNSHIP',
  'FREELANCE',
  'OTHER',
]);

/**
 * Seniority Level Enum.
 */
export const SeniorityLevelEnum = z.enum([
  'INTERN',
  'ENTRY',
  'JUNIOR',
  'MID',
  'SENIOR',
  'STAFF',
  'LEAD',
  'PRINCIPAL',
  'DIRECTOR',
  'EXECUTIVE',
  'UNSPECIFIED',
]);

/**
 * Canonical Job Schema.
 * Universal schema representing an authentic job position across all providers.
 */
export const CanonicalJobSchema = z
  .object({
    canonicalJobId: z.string().min(1, 'canonicalJobId is required'),
    title: z.string().min(1, 'title is required'),
    company: z.string().min(1, 'company is required'),
    description: z.string().default(''),
    location: z.string().default('Remote'),
    locations: z.array(z.string()).default([]),
    remotePolicy: RemotePolicyEnum.default('UNSPECIFIED'),
    employmentType: EmploymentTypeEnum.default('FULL_TIME'),
    seniority: SeniorityLevelEnum.default('UNSPECIFIED'),
    salary: z
      .object({
        min: z.number().optional(),
        max: z.number().optional(),
        currency: z.string().default('USD'),
        period: z.enum(['YEARLY', 'MONTHLY', 'HOURLY']).default('YEARLY'),
      })
      .optional(),
    currency: z.string().length(3).default('USD'),
    jobUrl: z.string().url(),
    applicationUrl: z.string().url().or(z.literal('')).default(''),
    source: z.string().default(''),
    sourceType: ProviderCategoryEnum.default('UNKNOWN'),
    sourceProvider: z.string().default('UNKNOWN'),
    sourceJobId: z.string().optional().nullable(),
    externalIdentifiers: z.record(z.any()).default({}),
    postedAt: z.string().optional(),
    updatedAt: z.string().optional(),
    metadata: z.record(z.any()).default({}),
  })
  .strict();

/**
 * Validates that provider-specific fields are not directly placed at the root of a canonical job object.
 *
 * @param {object} jobObj Raw candidate job object
 * @returns {boolean} True if root is clean of vendor-specific keys
 */
export function assertNoProviderPollution(jobObj) {
  const FORBIDDEN_ROOT_VENDOR_KEYS = [
    'greenhouseJobId',
    'greenhouseId',
    'leverJobId',
    'leverId',
    'workdayId',
    'workdayJobId',
    'ashbyJobId',
    'ashbyId',
    'icimsId',
    'smartRecruitersId',
    'taleoId',
    'linkedinId',
    'indeedId',
    'naukriId',
  ];

  for (const key of FORBIDDEN_ROOT_VENDOR_KEYS) {
    if (Object.prototype.hasOwnProperty.call(jobObj, key)) {
      throw new ValidationError(
        `Provider pollution detected: vendor-specific key "${key}" must be stored in externalIdentifiers or metadata, not at the root canonical job level.`,
        'PROVIDER_POLLUTION_DETECTED'
      );
    }
  }
  return true;
}

/**
 * Universal classification of a destination URL or provider slug into ProviderCategoryEnum.
 *
 * @param {string} urlOrProvider URL string or provider slug
 * @returns {{ category: string, provider: string }}
 */
export function classifyJobProvider(urlOrProvider) {
  const str = String(urlOrProvider || '').toLowerCase().trim();

  // ATS Platforms
  if (str.includes('greenhouse.io') || str === 'greenhouse') {
    return { category: 'ATS', provider: 'GREENHOUSE' };
  }
  if (str.includes('lever.co') || str === 'lever') {
    return { category: 'ATS', provider: 'LEVER' };
  }
  if (str.includes('ashbyhq.com') || str === 'ashby') {
    return { category: 'ATS', provider: 'ASHBY' };
  }
  if (str.includes('workday.com') || str.includes('myworkdayjobs.com') || str === 'workday') {
    return { category: 'ATS', provider: 'WORKDAY' };
  }
  if (str.includes('icims.com') || str === 'icims') {
    return { category: 'ATS', provider: 'ICIMS' };
  }
  if (str.includes('smartrecruiters.com') || str === 'smartrecruiters') {
    return { category: 'ATS', provider: 'SMARTRECRUITERS' };
  }
  if (str.includes('taleo.net') || str === 'taleo') {
    return { category: 'ATS', provider: 'TALEO' };
  }
  if (str.includes('successfactors.com') || str === 'successfactors' || str.includes('sap')) {
    return { category: 'ATS', provider: 'SAP_SUCCESSFACTORS' };
  }
  if (str.includes('workable.com') || str === 'workable') {
    return { category: 'ATS', provider: 'WORKABLE' };
  }
  if (str.includes('jobvite.com') || str === 'jobvite') {
    return { category: 'ATS', provider: 'JOBVITE' };
  }
  if (str.includes('bamboohr.com') || str === 'bamboohr') {
    return { category: 'ATS', provider: 'BAMBOOHR' };
  }
  if (str.includes('recruitee.com') || str === 'recruitee') {
    return { category: 'ATS', provider: 'RECRUITEE' };
  }
  if (str.includes('teamtailor.com') || str === 'teamtailor') {
    return { category: 'ATS', provider: 'TEAMTAILOR' };
  }
  if (str.includes('personio.com') || str.includes('personio.de') || str === 'personio') {
    return { category: 'ATS', provider: 'PERSONIO' };
  }

  // Job Boards & Aggregators
  if (str.includes('linkedin.com') || str === 'linkedin') {
    return { category: 'JOB_BOARD', provider: 'LINKEDIN' };
  }
  if (str.includes('indeed.com') || str === 'indeed') {
    return { category: 'JOB_BOARD', provider: 'INDEED' };
  }
  if (str.includes('naukri.com') || str === 'naukri') {
    return { category: 'JOB_BOARD', provider: 'NAUKRI' };
  }
  if (str.includes('internshala.com') || str === 'internshala') {
    return { category: 'JOB_BOARD', provider: 'INTERNSHALA' };
  }
  if (str.includes('wellfound.com') || str.includes('angel.co') || str === 'wellfound') {
    return { category: 'JOB_BOARD', provider: 'WELLFOUND' };
  }
  if (str.includes('dice.com') || str === 'dice') {
    return { category: 'JOB_BOARD', provider: 'DICE' };
  }
  if (str.includes('ziprecruiter.com') || str === 'ziprecruiter') {
    return { category: 'JOB_BOARD', provider: 'ZIPRECRUITER' };
  }
  if (str.includes('cutshort.io') || str === 'cutshort') {
    return { category: 'JOB_BOARD', provider: 'CUTSHORT' };
  }
  if (str.includes('instahyre.com') || str === 'instahyre') {
    return { category: 'JOB_BOARD', provider: 'INSTAHYRE' };
  }
  if (str.includes('foundit.in') || str === 'foundit') {
    return { category: 'JOB_BOARD', provider: 'FOUNDIT' };
  }
  if (str.includes('remoteok.com') || str === 'remote_ok') {
    return { category: 'AGGREGATOR', provider: 'REMOTE_OK' };
  }

  // Company Career Site Heuristic
  if (str.includes('careers.') || str.includes('/careers') || str.includes('/jobs') || str.includes('jobs.')) {
    return { category: 'COMPANY_CAREER_SITE', provider: 'COMPANY_CAREERS' };
  }

  return { category: 'UNKNOWN', provider: 'UNKNOWN' };
}

/**
 * Job Source Adapter Identity Schema.
 */
export const JobSourceAdapterIdentitySchema = z.object({
  id: z.string().min(1, 'Source adapter id is required'),
  name: z.string().min(1, 'Source adapter name is required'),
  version: z.string().default('1.0.0'),
  providerCategory: ProviderCategoryEnum.default('UNKNOWN'),
  supportedSources: z.array(z.string()).default([]),
  priority: z.number().int().default(10),
  capabilities: z
    .object({
      search: z.boolean().default(true),
      getJob: z.boolean().default(true),
      pagination: z.boolean().default(false),
    })
    .default({}),
});

/**
 * Universal Job Source Adapter Contract.
 * Abstract base class for all job discovery and listing providers.
 */
export class JobSourceAdapterContract {
  /**
   * @param {object} identity
   */
  constructor(identity) {
    if (new.target === JobSourceAdapterContract) {
      throw new TypeError('Cannot construct JobSourceAdapterContract instances directly; extend it instead.');
    }
    const validated = JobSourceAdapterIdentitySchema.safeParse(identity);
    if (!validated.success) {
      throw new ValidationError(
        `Invalid JobSourceAdapter identity: ${validated.error.message}`,
        'INVALID_SOURCE_ADAPTER_IDENTITY'
      );
    }
    this.identity = validated.data;
  }

  get id() {
    return this.identity.id;
  }

  get name() {
    return this.identity.name;
  }

  get priority() {
    return this.identity.priority;
  }

  get providerCategory() {
    return this.identity.providerCategory;
  }

  get capabilities() {
    return this.identity.capabilities;
  }

  /**
   * Checks if this adapter can handle the given discovery source context or URL.
   *
   * @param {string|object} sourceContext
   * @returns {boolean}
   */
  canHandle(sourceContext) {
    throw new Error(`canHandle() not implemented by JobSourceAdapter "${this.id}"`);
  }

  /**
   * Discovers and retrieves multiple jobs from the source.
   *
   * @param {object} context Query parameters, pagination, filters
   * @returns {Promise<Array<z.infer<typeof CanonicalJobSchema>>>}
   */
  async discoverJobs(context) {
    throw new Error(`discoverJobs() not implemented by JobSourceAdapter "${this.id}"`);
  }

  /**
   * Retrieves single job details by job reference or ID.
   *
   * @param {string|object} jobReference
   * @returns {Promise<z.infer<typeof CanonicalJobSchema>|null>}
   */
  async getJob(jobReference) {
    throw new Error(`getJob() not implemented by JobSourceAdapter "${this.id}"`);
  }

  /**
   * Normalizes raw job payload into the canonical job model.
   *
   * @param {object} rawJob
   * @returns {z.infer<typeof CanonicalJobSchema>}
   */
  normalizeJob(rawJob) {
    throw new Error(`normalizeJob() not implemented by JobSourceAdapter "${this.id}"`);
  }

  /**
   * Derives stable canonical identity for a job from raw data.
   *
   * @param {object} rawJob
   * @returns {{ canonicalJobId: string, sourceJobId: string }}
   */
  getJobIdentity(rawJob) {
    throw new Error(`getJobIdentity() not implemented by JobSourceAdapter "${this.id}"`);
  }

  /**
   * Extracts source metadata (provider, timestamps, crawl state) from raw data.
   *
   * @param {object} rawJob
   * @returns {object}
   */
  getSourceMetadata(rawJob) {
    return {};
  }
}
