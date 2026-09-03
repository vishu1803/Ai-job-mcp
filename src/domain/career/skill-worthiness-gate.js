/**
 * @file Skill Worthiness Gate (P14-005AE / Taxonomy Boundary)
 *
 * Domain-level classifier enforcing the boundary between legitimate candidate skills
 * (technologies, languages, frameworks, platforms) and low-level implementation details
 * (micro-utilities, middleware, config presets, internal modules).
 *
 * Rules:
 * 1. A package manifest entry must NOT automatically become a candidate skill.
 * 2. Real technologies/frameworks pass the gate.
 * 3. Low-level packages, internal modules, and config presets are rejected.
 * 4. Rejected packages that have parent skills are remapped to parent-skill evidence.
 * 5. Unknown-term telemetry only fires for plausible, uncataloged technologies.
 */

import { resolveParentSkills } from './parent-skill-mappings.js';

export const SKILL_CLASSIFICATIONS = Object.freeze({
  REAL_SKILL: 'REAL_SKILL',
  TECHNOLOGY: 'TECHNOLOGY',
  FRAMEWORK: 'FRAMEWORK',
  PLATFORM: 'PLATFORM',
  BUILD_TOOL: 'BUILD_TOOL',
  LIBRARY: 'LIBRARY',
  IMPLEMENTATION_DETAIL: 'IMPLEMENTATION_DETAIL',
  INTERNAL_MODULE: 'INTERNAL_MODULE',
  CONFIG_PRESET: 'CONFIG_PRESET',
  NATURAL_LANGUAGE: 'NATURAL_LANGUAGE',
  UNKNOWN: 'UNKNOWN',
});

export const REJECTED_CLASSIFICATIONS = new Set([
  SKILL_CLASSIFICATIONS.IMPLEMENTATION_DETAIL,
  SKILL_CLASSIFICATIONS.INTERNAL_MODULE,
  SKILL_CLASSIFICATIONS.CONFIG_PRESET,
  SKILL_CLASSIFICATIONS.NATURAL_LANGUAGE,
]);

/**
 * Classifications that are eligible to become candidate skills in candidate_skills.
 */
export const SKILL_WORTHY_CLASSIFICATIONS = new Set([
  SKILL_CLASSIFICATIONS.REAL_SKILL,
  SKILL_CLASSIFICATIONS.TECHNOLOGY,
  SKILL_CLASSIFICATIONS.FRAMEWORK,
  SKILL_CLASSIFICATIONS.PLATFORM,
  SKILL_CLASSIFICATIONS.BUILD_TOOL,
  SKILL_CLASSIFICATIONS.LIBRARY,
  SKILL_CLASSIFICATIONS.UNKNOWN,
]);

// Known implementation plumbing, middleware, and micro-utilities
const IMPLEMENTATION_DETAILS = new Set([
  // Micro utilities & styling helpers
  'clsx',
  'classnames',
  'tailwind-merge',
  'class-variance-authority',
  'cva',
  'tailwind-animate',
  'autoprefixer',
  'postcss',
  'css-loader',
  'style-loader',
  'ms',
  'mime',
  'mime-types',
  'uuid',
  'nanoid',
  'tslib',
  'dotenv',
  'dotenv-cli',
  'dotenv-expand',
  'cross-env',
  'concurrently',
  'nodemon',

  // Middleware & server plumbing
  'cookie-parser',
  'body-parser',
  'cors',
  'compression',
  'helmet',
  'morgan',
  'express-rate-limit',
  'multer',
  'multipart',
  'connect-timeout',
  'serve-static',

  // Logging
  'pino',
  'pino-pretty',
  'winston',
  'bunyan',
  'debug',
  'loglevel',

  // Date utilities
  'date-fns',
  'moment',
  'dayjs',
  'luxon',

  // Cryptography & auth helpers
  'bcrypt',
  'bcryptjs',
  'jsonwebtoken',
  'crypto-js',
  'passlib',
  'js-cookie',

  // Network / HTTP clients (implementation helpers)
  'axios',
  'got',
  'superagent',
  'node-fetch',
  'cross-fetch',
  'httpx',

  // Component & UI helper widgets
  'react-icons',
  'lucide-react',
  'react-dialog',
  'react-avatar',
  'react-slot',
  'react-select',
  'react-table',
  'react-hook-form',
  'cmdk',
  'headlessui',
  'heroicons',
  'radix-ui',
  'maath',
  'drei',
  'lenis',
  'framer-motion',
  'next-themes',
  'next-auth',

  // Database connectors & query builders (treated as evidence for DB or ORM)
  'drizzle-orm-node-postgres',
  'pg',
  'pg-pool',
  'node-postgres',
  'ioredis',
  'mongoose',
  'socket-io-client',
  'socket.io-client',
]);

// Known spoken / natural languages
const NATURAL_LANGUAGES = new Set([
  'english',
  'spanish',
  'french',
  'german',
  'mandarin',
  'chinese',
  'hindi',
  'japanese',
  'arabic',
  'portuguese',
  'russian',
  'italian',
  'korean',
]);

// Known verified technical skills / technologies / frameworks / platforms
const VERIFIED_TECHNOLOGIES = new Map([
  // Languages
  ['javascript', SKILL_CLASSIFICATIONS.REAL_SKILL],
  ['typescript', SKILL_CLASSIFICATIONS.REAL_SKILL],
  ['python', SKILL_CLASSIFICATIONS.REAL_SKILL],
  ['go', SKILL_CLASSIFICATIONS.REAL_SKILL],
  ['golang', SKILL_CLASSIFICATIONS.REAL_SKILL],
  ['rust', SKILL_CLASSIFICATIONS.REAL_SKILL],
  ['java', SKILL_CLASSIFICATIONS.REAL_SKILL],
  ['c', SKILL_CLASSIFICATIONS.REAL_SKILL],
  ['cpp', SKILL_CLASSIFICATIONS.REAL_SKILL],
  ['c++', SKILL_CLASSIFICATIONS.REAL_SKILL],
  ['c#', SKILL_CLASSIFICATIONS.REAL_SKILL],
  ['c-sharp', SKILL_CLASSIFICATIONS.REAL_SKILL],
  ['ruby', SKILL_CLASSIFICATIONS.REAL_SKILL],
  ['php', SKILL_CLASSIFICATIONS.REAL_SKILL],
  ['scala', SKILL_CLASSIFICATIONS.REAL_SKILL],
  ['kotlin', SKILL_CLASSIFICATIONS.REAL_SKILL],
  ['swift', SKILL_CLASSIFICATIONS.REAL_SKILL],
  ['sql', SKILL_CLASSIFICATIONS.REAL_SKILL],
  ['html', SKILL_CLASSIFICATIONS.REAL_SKILL],
  ['css', SKILL_CLASSIFICATIONS.REAL_SKILL],

  // Core Technologies & Databases
  ['docker', SKILL_CLASSIFICATIONS.TECHNOLOGY],
  ['kubernetes', SKILL_CLASSIFICATIONS.TECHNOLOGY],
  ['k8s', SKILL_CLASSIFICATIONS.TECHNOLOGY],
  ['redis', SKILL_CLASSIFICATIONS.TECHNOLOGY],
  ['postgresql', SKILL_CLASSIFICATIONS.TECHNOLOGY],
  ['postgres', SKILL_CLASSIFICATIONS.TECHNOLOGY],
  ['mysql', SKILL_CLASSIFICATIONS.TECHNOLOGY],
  ['mongodb', SKILL_CLASSIFICATIONS.TECHNOLOGY],
  ['sqlite', SKILL_CLASSIFICATIONS.TECHNOLOGY],
  ['kafka', SKILL_CLASSIFICATIONS.TECHNOLOGY],
  ['rabbitmq', SKILL_CLASSIFICATIONS.TECHNOLOGY],
  ['elasticsearch', SKILL_CLASSIFICATIONS.TECHNOLOGY],
  ['node-js', SKILL_CLASSIFICATIONS.TECHNOLOGY],
  ['nodejs', SKILL_CLASSIFICATIONS.TECHNOLOGY],
  ['node', SKILL_CLASSIFICATIONS.TECHNOLOGY],
  ['git', SKILL_CLASSIFICATIONS.TECHNOLOGY],
  ['linux', SKILL_CLASSIFICATIONS.TECHNOLOGY],
  ['nginx', SKILL_CLASSIFICATIONS.TECHNOLOGY],
  ['socket-io', SKILL_CLASSIFICATIONS.TECHNOLOGY],
  ['socketio', SKILL_CLASSIFICATIONS.TECHNOLOGY],
  ['tensorflow', SKILL_CLASSIFICATIONS.TECHNOLOGY],
  ['pytorch', SKILL_CLASSIFICATIONS.TECHNOLOGY],
  ['mcp', SKILL_CLASSIFICATIONS.TECHNOLOGY],
  ['graphql', SKILL_CLASSIFICATIONS.TECHNOLOGY],
  ['grpc', SKILL_CLASSIFICATIONS.TECHNOLOGY],
  ['rest-api', SKILL_CLASSIFICATIONS.TECHNOLOGY],
  ['microservices', SKILL_CLASSIFICATIONS.TECHNOLOGY],
  ['requests', SKILL_CLASSIFICATIONS.LIBRARY],

  // Frameworks
  ['react', SKILL_CLASSIFICATIONS.FRAMEWORK],
  ['next-js', SKILL_CLASSIFICATIONS.FRAMEWORK],
  ['nextjs', SKILL_CLASSIFICATIONS.FRAMEWORK],
  ['vue', SKILL_CLASSIFICATIONS.FRAMEWORK],
  ['vuejs', SKILL_CLASSIFICATIONS.FRAMEWORK],
  ['angular', SKILL_CLASSIFICATIONS.FRAMEWORK],
  ['svelte', SKILL_CLASSIFICATIONS.FRAMEWORK],
  ['express', SKILL_CLASSIFICATIONS.FRAMEWORK],
  ['fastify', SKILL_CLASSIFICATIONS.FRAMEWORK],
  ['nest-js', SKILL_CLASSIFICATIONS.FRAMEWORK],
  ['nestjs', SKILL_CLASSIFICATIONS.FRAMEWORK],
  ['django', SKILL_CLASSIFICATIONS.FRAMEWORK],
  ['flask', SKILL_CLASSIFICATIONS.FRAMEWORK],
  ['fastapi', SKILL_CLASSIFICATIONS.FRAMEWORK],
  ['spring-boot', SKILL_CLASSIFICATIONS.FRAMEWORK],
  ['springboot', SKILL_CLASSIFICATIONS.FRAMEWORK],
  ['drizzle-orm', SKILL_CLASSIFICATIONS.FRAMEWORK],
  ['prisma', SKILL_CLASSIFICATIONS.FRAMEWORK],
  ['tailwindcss', SKILL_CLASSIFICATIONS.FRAMEWORK],
  ['tailwind-css', SKILL_CLASSIFICATIONS.FRAMEWORK],

  // Platforms
  ['aws', SKILL_CLASSIFICATIONS.PLATFORM],
  ['gcp', SKILL_CLASSIFICATIONS.PLATFORM],
  ['google-cloud', SKILL_CLASSIFICATIONS.PLATFORM],
  ['azure', SKILL_CLASSIFICATIONS.PLATFORM],
  ['vercel', SKILL_CLASSIFICATIONS.PLATFORM],
  ['firebase', SKILL_CLASSIFICATIONS.PLATFORM],
  ['github', SKILL_CLASSIFICATIONS.PLATFORM],
  ['gitlab', SKILL_CLASSIFICATIONS.PLATFORM],

  // Build & Testing Tools
  ['terraform', SKILL_CLASSIFICATIONS.BUILD_TOOL],
  ['ansible', SKILL_CLASSIFICATIONS.BUILD_TOOL],
  ['webpack', SKILL_CLASSIFICATIONS.BUILD_TOOL],
  ['vite', SKILL_CLASSIFICATIONS.BUILD_TOOL],
  ['esbuild', SKILL_CLASSIFICATIONS.BUILD_TOOL],
  ['jest', SKILL_CLASSIFICATIONS.BUILD_TOOL],
  ['cypress', SKILL_CLASSIFICATIONS.BUILD_TOOL],
  ['playwright', SKILL_CLASSIFICATIONS.BUILD_TOOL],
  ['github-actions', SKILL_CLASSIFICATIONS.BUILD_TOOL],
  ['eslint', SKILL_CLASSIFICATIONS.BUILD_TOOL],
]);

export class SkillWorthinessGate {
  /**
   * Classifies an input term into one of the canonical SKILL_CLASSIFICATIONS.
   *
   * @param {string} rawInput
   * @returns {string} One of SKILL_CLASSIFICATIONS
   */
  static classify(rawInput) {
    if (!rawInput || typeof rawInput !== 'string') {
      return SKILL_CLASSIFICATIONS.UNKNOWN;
    }

    const norm = rawInput.toLowerCase().trim();
    const slug = norm.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

    // 1. Natural language check
    if (NATURAL_LANGUAGES.has(norm) || NATURAL_LANGUAGES.has(slug)) {
      return SKILL_CLASSIFICATIONS.NATURAL_LANGUAGE;
    }

    // 2. Internal module check (node:*, node-*, @internal/*) - excluding canonical node-js
    if (
      norm.startsWith('node:') ||
      (norm.startsWith('node-') && norm !== 'node-js' && slug !== 'node-js') ||
      norm.startsWith('@internal/') ||
      norm.includes('internal')
    ) {
      return SKILL_CLASSIFICATIONS.INTERNAL_MODULE;
    }

    // 3. Config preset check (@types/*, eslint-*, prettier-*, babel-*, tsconfig-*)
    if (
      norm.startsWith('@types/') ||
      norm.startsWith('eslint-') ||
      norm.startsWith('prettier-') ||
      norm.startsWith('babel-') ||
      norm.startsWith('postcss-') ||
      norm.startsWith('tsconfig')
    ) {
      return SKILL_CLASSIFICATIONS.CONFIG_PRESET;
    }

    // 3b. Component & UI helper library check (@radix-ui/*, @headlessui/*, @heroicons/*, @lucide/*)
    if (
      norm.startsWith('@radix-ui/') ||
      norm.startsWith('@headlessui/') ||
      norm.startsWith('@heroicons/') ||
      norm.startsWith('@lucide/')
    ) {
      return SKILL_CLASSIFICATIONS.IMPLEMENTATION_DETAIL;
    }

    // 4. Known verified technology check
    if (VERIFIED_TECHNOLOGIES.has(norm)) {
      return VERIFIED_TECHNOLOGIES.get(norm);
    }
    if (VERIFIED_TECHNOLOGIES.has(slug)) {
      return VERIFIED_TECHNOLOGIES.get(slug);
    }

    // 5. Known implementation detail check
    if (IMPLEMENTATION_DETAILS.has(norm) || IMPLEMENTATION_DETAILS.has(slug)) {
      return SKILL_CLASSIFICATIONS.IMPLEMENTATION_DETAIL;
    }

    // 6. Has explicit parent mapping check
    if (resolveParentSkills(norm) || resolveParentSkills(slug)) {
      return SKILL_CLASSIFICATIONS.IMPLEMENTATION_DETAIL;
    }

    return SKILL_CLASSIFICATIONS.UNKNOWN;
  }

  /**
   * Evaluates if a raw identifier is worthy of becoming a candidate skill.
   *
   * @param {string} rawIdentifier
   * @param {object} [context={}]
   * @returns {{
   *   rawIdentifier: string,
   *   safeSlug: string,
   *   classification: string,
   *   isSkillWorthy: boolean,
   *   parentMappings: Array<{ parentSlug: string, confidence: number }>|null,
   *   reason: string
   * }}
   */
  static evaluate(rawIdentifier, _context = {}) {
    if (!rawIdentifier || typeof rawIdentifier !== 'string') {
      return {
        rawIdentifier: '',
        safeSlug: '',
        classification: SKILL_CLASSIFICATIONS.UNKNOWN,
        isSkillWorthy: false,
        parentMappings: null,
        reason: 'Empty or invalid input',
      };
    }

    const norm = rawIdentifier.toLowerCase().trim();
    const safeSlug = norm.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const classification = SkillWorthinessGate.classify(norm);
    const parentMappings = resolveParentSkills(norm) || resolveParentSkills(safeSlug);
    const isSkillWorthy = !REJECTED_CLASSIFICATIONS.has(classification);

    let reason = 'Approved candidate skill';
    if (!isSkillWorthy) {
      if (Array.isArray(parentMappings) && parentMappings.length > 0) {
        reason = `Implementation package mapped to parent skill(s): ${parentMappings.map((p) => p.parentSlug).join(', ')}`;
      } else {
        reason = `Rejected as ${classification.toLowerCase().replace(/_/g, ' ')}`;
      }
    }

    return {
      rawIdentifier,
      safeSlug,
      classification,
      isSkillWorthy,
      parentMappings: Array.isArray(parentMappings) ? parentMappings : null,
      reason,
    };
  }

  /**
   * Fast predicate checking if a term can be persisted as a candidate skill.
   *
   * @param {string} rawIdentifier
   * @returns {boolean}
   */
  static isSkillWorthy(rawIdentifier) {
    const classification = SkillWorthinessGate.classify(rawIdentifier);
    return !REJECTED_CLASSIFICATIONS.has(classification);
  }

  /**
   * Determines if an unknown term is plausible enough to warrant telemetry logging.
   * Suppresses telemetry for implementation details, internal modules, and configs.
   *
   * @param {string} rawIdentifier
   * @returns {boolean}
   */
  static isPlausibleSkill(rawIdentifier) {
    const classification = SkillWorthinessGate.classify(rawIdentifier);
    // Never emit unknown telemetry for known non-skills
    if (
      classification === SKILL_CLASSIFICATIONS.IMPLEMENTATION_DETAIL ||
      classification === SKILL_CLASSIFICATIONS.INTERNAL_MODULE ||
      classification === SKILL_CLASSIFICATIONS.CONFIG_PRESET ||
      classification === SKILL_CLASSIFICATIONS.NATURAL_LANGUAGE
    ) {
      return false;
    }
    return true;
  }
}
