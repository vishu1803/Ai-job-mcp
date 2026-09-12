/**
 * @file Technology Taxonomy & Category Mapper
 *
 * Implements metadata-driven categorization for technologies:
 * - Languages
 * - Frameworks & Libraries
 * - Databases & Caching
 * - Cloud & DevOps
 * - Systems & Architecture
 * - AI & Machine Learning
 * - Developer Tools
 *
 * Guarantees safe pass-through for unknown technologies (Requirement 26)
 * without dropping or corrupting authentic user tools.
 */

import { CANONICAL_TECH_MAP, normalizeTechnologyName } from './technology-normalizer.js';

export const TECH_CATEGORIES = {
  LANGUAGES: 'Languages',
  FRAMEWORKS: 'Frameworks & Libraries',
  DATABASES: 'Databases & Caching',
  CLOUD_DEVOPS: 'Cloud & DevOps',
  SYSTEMS_ARCHITECTURE: 'Systems & Architecture',
  AI_ML: 'AI & Machine Learning',
  DEVELOPER_TOOLS: 'Developer Tools',
};

export const CATEGORY_MAP = {
  // Languages
  typescript: TECH_CATEGORIES.LANGUAGES,
  javascript: TECH_CATEGORIES.LANGUAGES,
  python: TECH_CATEGORIES.LANGUAGES,
  golang: TECH_CATEGORIES.LANGUAGES,
  go: TECH_CATEGORIES.LANGUAGES,
  rust: TECH_CATEGORIES.LANGUAGES,
  java: TECH_CATEGORIES.LANGUAGES,
  kotlin: TECH_CATEGORIES.LANGUAGES,
  swift: TECH_CATEGORIES.LANGUAGES,
  c: TECH_CATEGORIES.LANGUAGES,
  'c++': TECH_CATEGORIES.LANGUAGES,
  'c/c++': TECH_CATEGORIES.LANGUAGES,
  'c#': TECH_CATEGORIES.LANGUAGES,
  csharp: TECH_CATEGORIES.LANGUAGES,
  ruby: TECH_CATEGORIES.LANGUAGES,
  php: TECH_CATEGORIES.LANGUAGES,
  scala: TECH_CATEGORIES.LANGUAGES,
  sql: TECH_CATEGORIES.LANGUAGES,
  html: TECH_CATEGORIES.LANGUAGES,
  html5: TECH_CATEGORIES.LANGUAGES,
  css: TECH_CATEGORIES.LANGUAGES,
  css3: TECH_CATEGORIES.LANGUAGES,

  // Frameworks
  nestjs: TECH_CATEGORIES.FRAMEWORKS,
  react: TECH_CATEGORIES.FRAMEWORKS,
  'react.js': TECH_CATEGORIES.FRAMEWORKS,
  'react native': TECH_CATEGORIES.FRAMEWORKS,
  'node.js': TECH_CATEGORIES.FRAMEWORKS,
  nodejs: TECH_CATEGORIES.FRAMEWORKS,
  node: TECH_CATEGORIES.FRAMEWORKS,
  express: TECH_CATEGORIES.FRAMEWORKS,
  'express.js': TECH_CATEGORIES.FRAMEWORKS,
  fastapi: TECH_CATEGORIES.FRAMEWORKS,
  django: TECH_CATEGORIES.FRAMEWORKS,
  flask: TECH_CATEGORIES.FRAMEWORKS,
  'spring boot': TECH_CATEGORIES.FRAMEWORKS,
  'next.js': TECH_CATEGORIES.FRAMEWORKS,
  nextjs: TECH_CATEGORIES.FRAMEWORKS,
  'vue.js': TECH_CATEGORIES.FRAMEWORKS,
  angular: TECH_CATEGORIES.FRAMEWORKS,
  svelte: TECH_CATEGORIES.FRAMEWORKS,
  'tailwind css': TECH_CATEGORIES.FRAMEWORKS,
  graphql: TECH_CATEGORIES.FRAMEWORKS,
  trpc: TECH_CATEGORIES.FRAMEWORKS,

  // Databases
  postgresql: TECH_CATEGORIES.DATABASES,
  postgres: TECH_CATEGORIES.DATABASES,
  mysql: TECH_CATEGORIES.DATABASES,
  sqlite: TECH_CATEGORIES.DATABASES,
  redis: TECH_CATEGORIES.DATABASES,
  mongodb: TECH_CATEGORIES.DATABASES,
  dynamodb: TECH_CATEGORIES.DATABASES,
  elasticsearch: TECH_CATEGORIES.DATABASES,
  prisma: TECH_CATEGORIES.DATABASES,
  'prisma orm': TECH_CATEGORIES.DATABASES,
  typeorm: TECH_CATEGORIES.DATABASES,
  'drizzle orm': TECH_CATEGORIES.DATABASES,

  // Cloud & DevOps
  docker: TECH_CATEGORIES.CLOUD_DEVOPS,
  'docker compose': TECH_CATEGORIES.CLOUD_DEVOPS,
  kubernetes: TECH_CATEGORIES.CLOUD_DEVOPS,
  k8s: TECH_CATEGORIES.CLOUD_DEVOPS,
  aws: TECH_CATEGORIES.CLOUD_DEVOPS,
  gcp: TECH_CATEGORIES.CLOUD_DEVOPS,
  azure: TECH_CATEGORIES.CLOUD_DEVOPS,
  terraform: TECH_CATEGORIES.CLOUD_DEVOPS,
  kafka: TECH_CATEGORIES.CLOUD_DEVOPS,
  'apache kafka': TECH_CATEGORIES.CLOUD_DEVOPS,
  rabbitmq: TECH_CATEGORIES.CLOUD_DEVOPS,
  nginx: TECH_CATEGORIES.CLOUD_DEVOPS,
  linux: TECH_CATEGORIES.CLOUD_DEVOPS,
  git: TECH_CATEGORIES.DEVELOPER_TOOLS,
  github: TECH_CATEGORIES.DEVELOPER_TOOLS,
  'github actions': TECH_CATEGORIES.CLOUD_DEVOPS,
  'ci/cd': TECH_CATEGORIES.CLOUD_DEVOPS,

  // Cloud & DevOps / Observability
  prometheus: TECH_CATEGORIES.CLOUD_DEVOPS,
  grafana: TECH_CATEGORIES.CLOUD_DEVOPS,
  'chaos mesh': TECH_CATEGORIES.CLOUD_DEVOPS,

  // Systems & Architecture / Protocols
  grpc: TECH_CATEGORIES.SYSTEMS_ARCHITECTURE,
  'restful apis': TECH_CATEGORIES.SYSTEMS_ARCHITECTURE,
  rest: TECH_CATEGORIES.SYSTEMS_ARCHITECTURE,
  microservices: TECH_CATEGORIES.SYSTEMS_ARCHITECTURE,
  websockets: TECH_CATEGORIES.SYSTEMS_ARCHITECTURE,
  raft: TECH_CATEGORIES.SYSTEMS_ARCHITECTURE,
  'distributed systems': TECH_CATEGORIES.SYSTEMS_ARCHITECTURE,
  tcp: TECH_CATEGORIES.SYSTEMS_ARCHITECTURE,
  http: TECH_CATEGORIES.SYSTEMS_ARCHITECTURE,
  'http/2': TECH_CATEGORIES.SYSTEMS_ARCHITECTURE,
  wal: TECH_CATEGORIES.SYSTEMS_ARCHITECTURE,
  sstable: TECH_CATEGORIES.SYSTEMS_ARCHITECTURE,
  sstables: TECH_CATEGORIES.SYSTEMS_ARCHITECTURE,
  lua: TECH_CATEGORIES.LANGUAGES,

  // Data Infrastructure
  timescaledb: TECH_CATEGORIES.DATABASES,
  airflow: TECH_CATEGORIES.CLOUD_DEVOPS,
  snowflake: TECH_CATEGORIES.DATABASES,
  dbt: TECH_CATEGORIES.DEVELOPER_TOOLS,
  spark: TECH_CATEGORIES.SYSTEMS_ARCHITECTURE,

  // AI & ML
  pytorch: TECH_CATEGORIES.AI_ML,
  tensorflow: TECH_CATEGORIES.AI_ML,
  langchain: TECH_CATEGORIES.AI_ML,
  'openai api': TECH_CATEGORIES.AI_ML,
  mcp: TECH_CATEGORIES.AI_ML,
};

/**
 * Categorizes a technology into a standard taxonomy category.
 * Unknown technologies safely pass through into 'Developer Tools' or 'Other'.
 *
 * @param {string} techName
 * @returns {string} Category name
 */
export function categorizeTechnology(techName) {
  if (!techName || typeof techName !== 'string') return TECH_CATEGORIES.DEVELOPER_TOOLS;
  const key = techName.trim().toLowerCase();
  return CATEGORY_MAP[key] || TECH_CATEGORIES.DEVELOPER_TOOLS;
}

/**
 * Normalizes and categorizes a list of skills into structured categories.
 * Preserves authentic casing for unknown skills.
 *
 * @param {Array<string|object>} skills - Array of skill names or objects
 * @returns {Array<{ categoryName: string, skills: Array<{ name: string }> }>}
 */
export function groupSkillsIntoCategories(skills = []) {
  if (!Array.isArray(skills) || skills.length === 0) return [];

  const grouped = new Map();

  for (const item of skills) {
    const rawName = typeof item === 'string' ? item : item.name || item.skill;
    if (!rawName || typeof rawName !== 'string') continue;

    const normalizedName = normalizeTechnologyName(rawName);
    const category = categorizeTechnology(rawName);

    if (!grouped.has(category)) {
      grouped.set(category, new Set());
    }
    grouped.get(category).add(normalizedName);
  }

  const categoryOrder = [
    TECH_CATEGORIES.LANGUAGES,
    TECH_CATEGORIES.FRAMEWORKS,
    TECH_CATEGORIES.DATABASES,
    TECH_CATEGORIES.CLOUD_DEVOPS,
    TECH_CATEGORIES.SYSTEMS_ARCHITECTURE,
    TECH_CATEGORIES.AI_ML,
    TECH_CATEGORIES.DEVELOPER_TOOLS,
  ];

  const result = [];
  for (const cat of categoryOrder) {
    if (grouped.has(cat) && grouped.get(cat).size > 0) {
      result.push({
        categoryName: cat,
        skills: [...grouped.get(cat)].map((name) => ({
          name,
          confidenceScore: 1.0,
          relevanceScore: 80,
        })),
      });
    }
  }

  return result;
}
