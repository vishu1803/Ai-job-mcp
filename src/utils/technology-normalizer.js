/**
 * @file Canonical Technology Normalizer & Safe Generic Renderer
 *
 * Centralized authority for technology name normalization, taxonomy mapping,
 * noisy package filtering, and safe LaTeX formatting.
 *
 * Key Invariants:
 * - Deterministic, centralized mapping for canonical industry names (e.g. NestJS, PostgreSQL, Node.js).
 * - Unknown/new technologies render safely without requiring code modifications (Requirement 26).
 * - Preserves authentic casing for mixed-case technologies; generic title-casing for lowercase.
 * - Prevents raw build tools, utility packages, and dev-dependencies from cluttering resume stacks.
 */

export const CANONICAL_TECH_MAP = {
  // Languages
  typescript: 'TypeScript',
  javascript: 'JavaScript',
  python: 'Python',
  golang: 'Go',
  go: 'Go',
  rust: 'Rust',
  java: 'Java',
  kotlin: 'Kotlin',
  swift: 'Swift',
  c: 'C',
  'c++': 'C++',
  'c/c++': 'C/C++',
  'c#': 'C#',
  csharp: 'C#',
  ruby: 'Ruby',
  php: 'PHP',
  scala: 'Scala',
  r: 'R',
  dart: 'Dart',
  sql: 'SQL',
  html: 'HTML5',
  html5: 'HTML5',
  css: 'CSS3',
  css3: 'CSS3',

  // Frameworks & Libraries
  nestjs: 'NestJS',
  'nest.js': 'NestJS',
  nest: 'NestJS',
  'next.js': 'Next.js',
  nextjs: 'Next.js',
  next: 'Next.js',
  react: 'React',
  'react.js': 'React',
  reactjs: 'React',
  'react native': 'React Native',
  'node.js': 'Node.js',
  nodejs: 'Node.js',
  node: 'Node.js',
  express: 'Express.js',
  'express.js': 'Express.js',
  expressjs: 'Express.js',
  fastapi: 'FastAPI',
  fastify: 'Fastify',
  django: 'Django',
  flask: 'Flask',
  spring: 'Spring Boot',
  'spring boot': 'Spring Boot',
  vue: 'Vue.js',
  'vue.js': 'Vue.js',
  vuejs: 'Vue.js',
  angular: 'Angular',
  svelte: 'Svelte',
  'svelte.js': 'Svelte',
  'tailwind css': 'Tailwind CSS',
  tailwindcss: 'Tailwind CSS',
  tailwind: 'Tailwind CSS',
  bootstrap: 'Bootstrap',
  redux: 'Redux',
  'redux toolkit': 'Redux Toolkit',
  graphql: 'GraphQL',
  'apollo graphql': 'Apollo GraphQL',
  trpc: 'tRPC',

  // Databases & Caches & ORMs
  postgresql: 'PostgreSQL',
  postgres: 'PostgreSQL',
  'postgresql (sql)': 'PostgreSQL',
  mysql: 'MySQL',
  sqlite: 'SQLite',
  redis: 'Redis',
  mongodb: 'MongoDB',
  mongo: 'MongoDB',
  dynamodb: 'DynamoDB',
  cassandra: 'Cassandra',
  elasticsearch: 'Elasticsearch',
  opensearch: 'OpenSearch',
  prisma: 'Prisma ORM',
  'prisma orm': 'Prisma ORM',
  typeorm: 'TypeORM',
  'drizzle orm': 'Drizzle ORM',
  drizzle: 'Drizzle ORM',
  sequelize: 'Sequelize',
  mongoose: 'Mongoose',

  // Cloud & DevOps & Platforms
  docker: 'Docker',
  'docker compose': 'Docker Compose',
  'docker-compose': 'Docker Compose',
  kubernetes: 'Kubernetes',
  k8s: 'Kubernetes',
  aws: 'AWS',
  gcp: 'Google Cloud Platform (GCP)',
  azure: 'Microsoft Azure',
  terraform: 'Terraform',
  ansible: 'Ansible',
  kafka: 'Apache Kafka',
  'apache kafka': 'Apache Kafka',
  rabbitmq: 'RabbitMQ',
  nginx: 'NGINX',
  linux: 'Linux',
  git: 'Git',
  github: 'GitHub',
  'github actions': 'GitHub Actions',
  gitlab: 'GitLab',
  'ci/cd': 'CI/CD',
  cicd: 'CI/CD',

  // AI / ML & Protocols
  openai: 'OpenAI API',
  'openai api': 'OpenAI API',
  langchain: 'LangChain',
  pytorch: 'PyTorch',
  tensorflow: 'TensorFlow',
  'socket.io': 'Socket.io',
  'socket io': 'Socket.io',
  'role-based access control': 'Role-Based Access Control (RBAC)',
  rbac: 'Role-Based Access Control (RBAC)',
  jwt: 'JWT',
  'restful apis': 'RESTful APIs',
  'rest api': 'RESTful APIs',
  'rest apis': 'RESTful APIs',
  grpc: 'gRPC',
  'model context protocol': 'Model Context Protocol (MCP)',
  mcp: 'Model Context Protocol (MCP)',
};

export const NOISY_TECH_SET = new Set([
  'fs',
  'path',
  'crypto',
  'os',
  'stream',
  'events',
  'util',
  'buffer',
  'globals',
  'cache manager',
  'cache manager redis store',
  'cache-manager',
  'class transformer',
  'class validator',
  'class-transformer',
  'class-validator',
  'reflect metadata',
  'reflect-metadata',
  'ts node',
  'ts loader',
  'ts-node',
  'ts-loader',
  'source map support',
  'source-map-support',
  'schematics',
  'throttler',
  'platform express',
  'platform-express',
  'swagger ui express',
  'swagger-ui-express',
  'eslint',
  'eslintrc',
  'prettier',
  'typescript eslint',
  'nodemon',
  'jest dom',
  'jest environment jsdom',
  'user event',
  'swr',
  'testing',
  'helper',
  'helpers',
  'adapter',
  'store',
  'npm',
  'yarn',
  'pnpm',
  'joi',
  'cheerio',
  'dotenv',
  'rimraf',
  'concurrently',
  'cross-env',
  'babel',
  'webpack',
  'rollup',
  'supertest',
]);

/**
 * Normalizes a raw technology slug/key for dictionary lookup.
 *
 * @param {string} raw
 * @returns {string}
 */
export function normalizeTechnologySlug(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalizes a technology identifier into its canonical, ATS-optimized display label.
 *
 * Requirements:
 * - Uses authoritative taxonomy when known (e.g. `nestjs` -> `NestJS`).
 * - For unknown/new technologies (Req 26), renders safely without code changes:
 *   - Preserves existing intentional camelCase/PascalCase (e.g. `MyCustomLib` -> `MyCustomLib`).
 *   - Uppercases acronyms (e.g. `jwt` -> `JWT`, `sdk` -> `SDK`).
 *   - Title-cases lowercase words cleanly.
 *
 * @param {string} rawName
 * @returns {string}
 */
export function normalizeTechnologyName(rawName) {
  if (!rawName || typeof rawName !== 'string') return '';
  const trimmed = rawName.trim();
  if (!trimmed) return '';

  const lower = trimmed.toLowerCase();
  const slug = normalizeTechnologySlug(trimmed);

  // 1. Check canonical taxonomy
  if (CANONICAL_TECH_MAP[lower]) return CANONICAL_TECH_MAP[lower];
  if (CANONICAL_TECH_MAP[slug]) return CANONICAL_TECH_MAP[slug];

  // 2. Safe generic fallback for unknown / new technologies (Req 26)
  // If the input already contains intentional mixed casing (e.g. "FastifyPlugin", "DeepSeek", "MyLib"), preserve it
  const hasUpper = /[A-Z]/.test(trimmed);
  const hasLower = /[a-z]/.test(trimmed);
  if (hasUpper && hasLower) {
    // Already thoughtfully cased by user or library
    return trimmed;
  }

  // If all uppercase and short (likely an acronym like "CLI", "SDK", "API")
  if (hasUpper && !hasLower && trimmed.length <= 6) {
    return trimmed;
  }

  // If all lowercase, title-case words cleanly
  return trimmed
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => {
      if (word.length <= 3 && /^[a-z]+$/i.test(word)) {
        // Short acronyms (e.g. rbac, api, sdk) default to uppercase
        const knownShortAcronyms = new Set(['api', 'sdk', 'cli', 'orm', 'ui', 'ux', 'db', 'jwt', 'mcp']);
        if (knownShortAcronyms.has(word.toLowerCase())) return word.toUpperCase();
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

/**
 * Determines whether a technology is build-time or framework-internal noise.
 *
 * @param {string} rawName
 * @returns {boolean}
 */
export function isNoisyTechnology(rawName) {
  if (!rawName || typeof rawName !== 'string') return true;
  const lower = rawName.trim().toLowerCase();
  const slug = normalizeTechnologySlug(rawName);

  if (NOISY_TECH_SET.has(lower) || NOISY_TECH_SET.has(slug)) return true;

  if (
    /^(cache[- ]?manager|class[- ]?(transformer|validator)|reflect[- ]?metadata|ts[- ]?(node|loader)|source[- ]?map|schematics|throttler|platform[- ]?express|swagger[- ]?ui|jest[- ]?(dom|environment)|user[- ]?event)/i.test(
      lower
    )
  ) {
    return true;
  }

  if (['fs', 'path', 'crypto', 'os', 'stream', 'events', 'util', 'buffer'].includes(lower)) {
    return true;
  }

  return false;
}

/**
 * Cleans and canonicalizes a collection of project/resume technologies.
 * Deduplicates canonical tokens and limits output to maxCount.
 *
 * @param {Array<string>} technologies
 * @param {number} [maxCount=6]
 * @returns {Array<string>}
 */
export function formatTechnologyStack(technologies, maxCount = 6) {
  if (!Array.isArray(technologies)) return [];
  const result = [];
  const seen = new Set();

  for (const raw of technologies) {
    if (isNoisyTechnology(raw)) continue;
    const canonical = normalizeTechnologyName(raw);
    if (!canonical) continue;

    const token = canonical.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (seen.has(token)) continue;
    seen.add(token);
    result.push(canonical);

    if (result.length >= maxCount) break;
  }

  return result;
}

/**
 * Centralized LaTeX special character escaping.
 * Ensures arbitrary technology names, titles, and text render safely in LaTeX.
 *
 * @param {string} text
 * @returns {string}
 */
export function escapeLaTeX(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/&/g, '\\&')
    .replace(/%/g, '\\%')
    .replace(/\$/g, '\\$')
    .replace(/#/g, '\\#')
    .replace(/_/g, '\\_')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}');
}
