/**
 * @file Role-Specific Scoring Profiles Engine (Phase 6)
 *
 * Implements configurable role scoring profiles so that different engineering specializations
 * (e.g. software_engineer, backend_engineer, ml_engineer, devops_engineer) define their own
 * explicit, deterministic component weighting.
 *
 * NON-NEGOTIABLE RULE:
 * - Every profile's component weights MUST sum to exactly 100.0.
 * - Throws a ValidationError if weights do not sum to 100.0.
 * - NEVER silently normalizes invalid weight configurations.
 */

import { z } from 'zod';

export const RoleProfileIdEnum = z.enum([
  'software_engineer',
  'frontend_engineer',
  'backend_engineer',
  'fullstack_engineer',
  'mobile_engineer',
  'data_engineer',
  'ml_engineer',
  'devops_engineer',
  'qa_engineer',
  'embedded_engineer',
  'custom',
]);

export const RoleWeightsSchema = z
  .object({
    requiredSkills: z.number().nonnegative(),
    preferredSkills: z.number().nonnegative(),
    projectRelevance: z.number().nonnegative(),
    experience: z.number().nonnegative(),
    openSource: z.number().nonnegative().default(0),
    technicalDepth: z.number().nonnegative().default(0),
    education: z.number().nonnegative(),
    location: z.number().nonnegative(),
    certification: z.number().nonnegative().default(0),
    evidenceConfidence: z.number().nonnegative(),
  })
  .strict()
  .superRefine((val, ctx) => {
    const sum =
      val.requiredSkills +
      val.preferredSkills +
      val.projectRelevance +
      val.experience +
      val.openSource +
      val.technicalDepth +
      val.education +
      val.location +
      val.certification +
      val.evidenceConfidence;

    const roundedSum = Math.round(sum * 100) / 100;
    if (Math.abs(roundedSum - 100.0) > 0.001) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Role scoring weights must sum to exactly 100.0 (received ${roundedSum})`,
        path: ['weights'],
      });
    }
  });

export const RoleScoringProfileSchema = z
  .object({
    role: RoleProfileIdEnum,
    name: z.string().min(1),
    description: z.string().min(1),
    version: z.string().default('1.0.0'),
    weights: RoleWeightsSchema,
  })
  .strict();

// ---------------------------------------------------------------------------
// Canonical Built-in Role Profiles
// ---------------------------------------------------------------------------

export const CANONICAL_ROLE_PROFILES = Object.freeze({
  software_engineer: {
    role: 'software_engineer',
    name: 'General Software Engineer',
    description:
      'Balanced scoring profile emphasizing core required skills, project proof, and career experience.',
    version: '1.0.0',
    weights: {
      requiredSkills: 35.0,
      preferredSkills: 10.0,
      projectRelevance: 15.0,
      experience: 15.0,
      openSource: 5.0,
      technicalDepth: 10.0,
      education: 5.0,
      location: 2.5,
      certification: 0.0,
      evidenceConfidence: 2.5,
    },
  },
  frontend_engineer: {
    role: 'frontend_engineer',
    name: 'Frontend Engineer',
    description:
      'Emphasizes interactive project evidence, modern UI framework depth, and user-facing design execution.',
    version: '1.0.0',
    weights: {
      requiredSkills: 35.0,
      preferredSkills: 10.0,
      projectRelevance: 20.0,
      experience: 15.0,
      openSource: 5.0,
      technicalDepth: 5.0,
      education: 5.0,
      location: 2.5,
      certification: 0.0,
      evidenceConfidence: 2.5,
    },
  },
  backend_engineer: {
    role: 'backend_engineer',
    name: 'Backend Engineer',
    description:
      'Prioritizes distributed systems depth, database architectures, APIs, and production deployment track records.',
    version: '1.0.0',
    weights: {
      requiredSkills: 35.0,
      preferredSkills: 10.0,
      projectRelevance: 15.0,
      experience: 15.0,
      openSource: 5.0,
      technicalDepth: 10.0,
      education: 5.0,
      location: 2.5,
      certification: 0.0,
      evidenceConfidence: 2.5,
    },
  },
  fullstack_engineer: {
    role: 'fullstack_engineer',
    name: 'Full-Stack Engineer',
    description:
      'Balances end-to-end fullstack delivery with project completeness and multi-tier competence.',
    version: '1.0.0',
    weights: {
      requiredSkills: 35.0,
      preferredSkills: 10.0,
      projectRelevance: 18.0,
      experience: 15.0,
      openSource: 5.0,
      technicalDepth: 7.0,
      education: 5.0,
      location: 2.5,
      certification: 0.0,
      evidenceConfidence: 2.5,
    },
  },
  devops_engineer: {
    role: 'devops_engineer',
    name: 'DevOps / SRE / Cloud Engineer',
    description:
      'Weights cloud infrastructure, automation, CI/CD, and professional certifications heavily.',
    version: '1.0.0',
    weights: {
      requiredSkills: 30.0,
      preferredSkills: 10.0,
      projectRelevance: 15.0,
      experience: 15.0,
      openSource: 5.0,
      technicalDepth: 10.0,
      education: 5.0,
      location: 2.5,
      certification: 5.0,
      evidenceConfidence: 2.5,
    },
  },
  ml_engineer: {
    role: 'ml_engineer',
    name: 'Machine Learning / AI Engineer',
    description:
      'Places high value on academic and theoretical foundation, mathematical depth, and specialized ML frameworks.',
    version: '1.0.0',
    weights: {
      requiredSkills: 35.0,
      preferredSkills: 10.0,
      projectRelevance: 15.0,
      experience: 10.0,
      openSource: 5.0,
      technicalDepth: 10.0,
      education: 10.0,
      location: 2.5,
      certification: 0.0,
      evidenceConfidence: 2.5,
    },
  },
  data_engineer: {
    role: 'data_engineer',
    name: 'Data Platform Engineer',
    description:
      'Focuses on distributed data pipelines, stream processing, SQL/NoSQL architectures, and ETL systems.',
    version: '1.0.0',
    weights: {
      requiredSkills: 35.0,
      preferredSkills: 10.0,
      projectRelevance: 15.0,
      experience: 15.0,
      openSource: 5.0,
      technicalDepth: 10.0,
      education: 5.0,
      location: 2.5,
      certification: 0.0,
      evidenceConfidence: 2.5,
    },
  },
  mobile_engineer: {
    role: 'mobile_engineer',
    name: 'Mobile Application Engineer',
    description:
      'Emphasizes mobile client applications, app store deployment evidence, and platform SDK depth.',
    version: '1.0.0',
    weights: {
      requiredSkills: 35.0,
      preferredSkills: 10.0,
      projectRelevance: 20.0,
      experience: 15.0,
      openSource: 5.0,
      technicalDepth: 5.0,
      education: 5.0,
      location: 2.5,
      certification: 0.0,
      evidenceConfidence: 2.5,
    },
  },
  qa_engineer: {
    role: 'qa_engineer',
    name: 'QA / Test Automation Engineer',
    description:
      'Focuses on test framework automation, coverage verification, end-to-end pipelines, and regression testing.',
    version: '1.0.0',
    weights: {
      requiredSkills: 30.0,
      preferredSkills: 15.0,
      projectRelevance: 15.0,
      experience: 15.0,
      openSource: 5.0,
      technicalDepth: 10.0,
      education: 5.0,
      location: 2.5,
      certification: 0.0,
      evidenceConfidence: 2.5,
    },
  },
  embedded_engineer: {
    role: 'embedded_engineer',
    name: 'Embedded / Firmware Systems Engineer',
    description:
      'Emphasizes low-level systems depth, C/C++ microcontrollers, RTOS, and hardware-adjacent engineering.',
    version: '1.0.0',
    weights: {
      requiredSkills: 35.0,
      preferredSkills: 10.0,
      projectRelevance: 15.0,
      experience: 15.0,
      openSource: 0.0,
      technicalDepth: 15.0,
      education: 7.5,
      location: 2.5,
      certification: 0.0,
      evidenceConfidence: 0.0,
    },
  },
});

// Dynamic in-memory custom role profile registry
const customProfileRegistry = new Map();

/**
 * Retrieves a validated role profile by name, falling back to 'software_engineer'.
 *
 * @param {string} roleName
 * @returns {object} Validated RoleScoringProfile
 */
export function getRoleProfile(roleName) {
  const normalized = String(roleName || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

  if (customProfileRegistry.has(normalized)) {
    return customProfileRegistry.get(normalized);
  }

  if (CANONICAL_ROLE_PROFILES[normalized]) {
    return CANONICAL_ROLE_PROFILES[normalized];
  }

  return CANONICAL_ROLE_PROFILES.software_engineer;
}

/**
 * Registers a validated custom role scoring profile.
 *
 * @param {object} profile
 * @returns {object} Validated registered profile
 */
export function registerRoleProfile(profile) {
  const validated = RoleScoringProfileSchema.parse(profile);
  const normalizedKey =
    validated.role === 'custom'
      ? validated.name.toLowerCase().replace(/[\s-]+/g, '_')
      : validated.role;

  customProfileRegistry.set(normalizedKey, validated);
  return validated;
}

/**
 * Heuristically infers the most appropriate role profile from a job title.
 *
 * @param {string} jobTitle
 * @returns {string} Inferred role profile identifier
 */
export function resolveRoleFromJobTitle(jobTitle) {
  const lower = String(jobTitle || '').toLowerCase();

  if (/machine learning|ml\b|ai\b|deep learning|data scientist/i.test(lower)) {
    return 'ml_engineer';
  }
  if (/data engineer|data platform|big data|etl/i.test(lower)) {
    return 'data_engineer';
  }
  if (/devops|sre|site reliability|cloud engineer|platform engineer|infrastructure/i.test(lower)) {
    return 'devops_engineer';
  }
  if (/frontend|front-end|ui engineer|react developer|web developer/i.test(lower)) {
    return 'frontend_engineer';
  }
  if (/backend|back-end|api engineer|systems engineer|distributed systems/i.test(lower)) {
    return 'backend_engineer';
  }
  if (/fullstack|full-stack|software engineer|software developer/i.test(lower)) {
    return 'fullstack_engineer';
  }
  if (/ios|android|mobile|flutter|react native/i.test(lower)) {
    return 'mobile_engineer';
  }
  if (/embedded|firmware|rtos|microcontroller|c\+\+ engineer/i.test(lower)) {
    return 'embedded_engineer';
  }
  if (/qa|quality assurance|automation engineer|test engineer|sdet/i.test(lower)) {
    return 'qa_engineer';
  }

  return 'software_engineer';
}

export const inferRoleProfile = resolveRoleFromJobTitle;

export const ROLE_PROFILE_VERSION = '1.0.0';

/**
 * Resolves a role profile into canonical 7-component weights summing strictly to 100.0.
 *
 * @param {string} roleName
 * @returns {object} Canonical 7-component weights
 */
export function getRoleAtsWeights(roleName) {
  const profile = getRoleProfile(roleName);
  const w = profile.weights;
  return {
    requiredSkills: w.requiredSkills,
    preferredSkills: w.preferredSkills,
    projectRelevance: w.projectRelevance,
    experience: w.experience,
    education: w.education,
    location: w.location,
    evidenceConfidence:
      Math.round(
        (w.evidenceConfidence +
          (w.technicalDepth || 0) +
          (w.openSource || 0) +
          (w.certification || 0)) *
          100
      ) / 100,
  };
}
