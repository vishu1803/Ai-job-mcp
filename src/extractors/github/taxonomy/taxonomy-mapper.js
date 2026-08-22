/**
 * @file Canonical Skill Taxonomy & Normalization Engine (P4-003)
 *
 * Normalizes multi-ecosystem package dependencies, module imports, and configuration
 * artifacts to canonical global skill slugs, official display names, and approved categories.
 *
 * Strictly adheres to the 7 approved SkillCategoryEnum values:
 * - LANGUAGE
 * - FRAMEWORK
 * - DATABASE
 * - CLOUD_DEVOPS
 * - TOOL
 * - ARCHITECTURE
 * - CONCEPT
 */

export class TaxonomyMapper {
  /**
   * Explicit mapping catalog from raw ecosystem identifiers to canonical skill taxonomy.
   * Internal dictionary uses Object.create(null) to prevent prototype pollution.
   */
  static TAXONOMY_CATALOG = Object.freeze(
    Object.assign(Object.create(null), {
      // -----------------------------------------------------------------------
      // Web Frameworks & Libraries
      // -----------------------------------------------------------------------
      fastify: { slug: 'fastify', name: 'Fastify', category: 'FRAMEWORK' },
      '@fastify/cors': { slug: 'fastify', name: 'Fastify', category: 'FRAMEWORK' },
      '@fastify/cookie': { slug: 'fastify', name: 'Fastify', category: 'FRAMEWORK' },
      '@fastify/jwt': { slug: 'fastify', name: 'Fastify', category: 'FRAMEWORK' },
      '@fastify/swagger': { slug: 'fastify', name: 'Fastify', category: 'FRAMEWORK' },
      express: { slug: 'express', name: 'Express.js', category: 'FRAMEWORK' },
      react: { slug: 'react', name: 'React', category: 'FRAMEWORK' },
      'react-dom': { slug: 'react', name: 'React', category: 'FRAMEWORK' },
      'react-router': { slug: 'react', name: 'React', category: 'FRAMEWORK' },
      'react-router-dom': { slug: 'react', name: 'React', category: 'FRAMEWORK' },
      next: { slug: 'next-js', name: 'Next.js', category: 'FRAMEWORK' },
      'next.js': { slug: 'next-js', name: 'Next.js', category: 'FRAMEWORK' },
      vue: { slug: 'vue', name: 'Vue.js', category: 'FRAMEWORK' },
      nuxt: { slug: 'nuxt-js', name: 'Nuxt.js', category: 'FRAMEWORK' },
      angular: { slug: 'angular', name: 'Angular', category: 'FRAMEWORK' },
      '@angular/core': { slug: 'angular', name: 'Angular', category: 'FRAMEWORK' },
      svelte: { slug: 'svelte', name: 'Svelte', category: 'FRAMEWORK' },
      '@sveltejs/kit': { slug: 'svelte', name: 'Svelte', category: 'FRAMEWORK' },
      nestjs: { slug: 'nestjs', name: 'NestJS', category: 'FRAMEWORK' },
      '@nestjs/core': { slug: 'nestjs', name: 'NestJS', category: 'FRAMEWORK' },
      tailwindcss: { slug: 'tailwindcss', name: 'Tailwind CSS', category: 'FRAMEWORK' },
      'tailwind css': { slug: 'tailwindcss', name: 'Tailwind CSS', category: 'FRAMEWORK' },
      tailwind: { slug: 'tailwindcss', name: 'Tailwind CSS', category: 'FRAMEWORK' },
      reactjs: { slug: 'react', name: 'React', category: 'FRAMEWORK' },
      'react.js': { slug: 'react', name: 'React', category: 'FRAMEWORK' },
      vuejs: { slug: 'vue', name: 'Vue.js', category: 'FRAMEWORK' },
      'vue.js': { slug: 'vue', name: 'Vue.js', category: 'FRAMEWORK' },
      fastapi: { slug: 'fastapi', name: 'FastAPI', category: 'FRAMEWORK' },
      django: { slug: 'django', name: 'Django', category: 'FRAMEWORK' },
      flask: { slug: 'flask', name: 'Flask', category: 'FRAMEWORK' },
      gin: { slug: 'gin', name: 'Gin', category: 'FRAMEWORK' },
      'github.com/gin-gonic/gin': { slug: 'gin', name: 'Gin', category: 'FRAMEWORK' },
      fiber: { slug: 'fiber', name: 'Fiber', category: 'FRAMEWORK' },
      'github.com/gofiber/fiber': { slug: 'fiber', name: 'Fiber', category: 'FRAMEWORK' },
      'github.com/gofiber/fiber/v2': { slug: 'fiber', name: 'Fiber', category: 'FRAMEWORK' },
      tokio: { slug: 'tokio', name: 'Tokio', category: 'FRAMEWORK' },
      'actix-web': { slug: 'actix-web', name: 'Actix Web', category: 'FRAMEWORK' },
      axum: { slug: 'axum', name: 'Axum', category: 'FRAMEWORK' },
      'google.golang.org/grpc': { slug: 'grpc', name: 'gRPC', category: 'FRAMEWORK' },

      // -----------------------------------------------------------------------
      // Databases, Drivers & ORMs
      // -----------------------------------------------------------------------
      postgresql: { slug: 'postgresql', name: 'PostgreSQL', category: 'DATABASE' },
      pg: { slug: 'postgresql', name: 'PostgreSQL', category: 'DATABASE' },
      'pg-promise': { slug: 'postgresql', name: 'PostgreSQL', category: 'DATABASE' },
      'pg-pool': { slug: 'postgresql', name: 'PostgreSQL', category: 'DATABASE' },
      postgres: { slug: 'postgresql', name: 'PostgreSQL', category: 'DATABASE' },
      psycopg2: { slug: 'postgresql', name: 'PostgreSQL', category: 'DATABASE' },
      'psycopg2-binary': { slug: 'postgresql', name: 'PostgreSQL', category: 'DATABASE' },
      asyncpg: { slug: 'postgresql', name: 'PostgreSQL', category: 'DATABASE' },
      pq: { slug: 'postgresql', name: 'PostgreSQL', category: 'DATABASE' },
      'github.com/lib/pq': { slug: 'postgresql', name: 'PostgreSQL', category: 'DATABASE' },
      'drizzle-orm': { slug: 'drizzle-orm', name: 'Drizzle ORM', category: 'DATABASE' },
      'drizzle-kit': { slug: 'drizzle-orm', name: 'Drizzle ORM', category: 'DATABASE' },
      prisma: { slug: 'prisma', name: 'Prisma', category: 'DATABASE' },
      '@prisma/client': { slug: 'prisma', name: 'Prisma', category: 'DATABASE' },
      typeorm: { slug: 'typeorm', name: 'TypeORM', category: 'DATABASE' },
      mongoose: { slug: 'mongodb', name: 'MongoDB', category: 'DATABASE' },
      mongodb: { slug: 'mongodb', name: 'MongoDB', category: 'DATABASE' },
      pymongo: { slug: 'mongodb', name: 'MongoDB', category: 'DATABASE' },
      redis: { slug: 'redis', name: 'Redis', category: 'DATABASE' },
      ioredis: { slug: 'redis', name: 'Redis', category: 'DATABASE' },
      sqlalchemy: { slug: 'sqlalchemy', name: 'SQLAlchemy', category: 'DATABASE' },
      'gorm.io/gorm': { slug: 'gorm', name: 'GORM', category: 'DATABASE' },
      'github.com/jinzhu/gorm': { slug: 'gorm', name: 'GORM', category: 'DATABASE' },
      sqlx: { slug: 'sqlx', name: 'SQLx', category: 'DATABASE' },
      diesel: { slug: 'diesel', name: 'Diesel', category: 'DATABASE' },
      mysql: { slug: 'mysql', name: 'MySQL', category: 'DATABASE' },
      mysql2: { slug: 'mysql', name: 'MySQL', category: 'DATABASE' },
      sqlite3: { slug: 'sqlite', name: 'SQLite', category: 'DATABASE' },
      better_sqlite3: { slug: 'sqlite', name: 'SQLite', category: 'DATABASE' },
      rusqlite: { slug: 'sqlite', name: 'SQLite', category: 'DATABASE' },

      // -----------------------------------------------------------------------
      // Programming Languages & Core Runtimes
      // -----------------------------------------------------------------------
      typescript: { slug: 'typescript', name: 'TypeScript', category: 'LANGUAGE' },
      javascript: { slug: 'javascript', name: 'JavaScript', category: 'LANGUAGE' },
      python: { slug: 'python', name: 'Python', category: 'LANGUAGE' },
      golang: { slug: 'go', name: 'Go', category: 'LANGUAGE' },
      go: { slug: 'go', name: 'Go', category: 'LANGUAGE' },
      rust: { slug: 'rust', name: 'Rust', category: 'LANGUAGE' },
      nodejs: { slug: 'node-js', name: 'Node.js', category: 'LANGUAGE' },
      node: { slug: 'node-js', name: 'Node.js', category: 'LANGUAGE' },
      java: { slug: 'java', name: 'Java', category: 'LANGUAGE' },
      kotlin: { slug: 'kotlin', name: 'Kotlin', category: 'LANGUAGE' },
      csharp: { slug: 'c-sharp', name: 'C#', category: 'LANGUAGE' },
      'c#': { slug: 'c-sharp', name: 'C#', category: 'LANGUAGE' },
      cpp: { slug: 'cpp', name: 'C++', category: 'LANGUAGE' },
      'c++': { slug: 'cpp', name: 'C++', category: 'LANGUAGE' },
      grpc: { slug: 'grpc', name: 'gRPC', category: 'FRAMEWORK' },

      // -----------------------------------------------------------------------
      // Cloud, DevOps & Infrastructure
      // -----------------------------------------------------------------------
      docker: { slug: 'docker', name: 'Docker', category: 'CLOUD_DEVOPS' },
      'docker-compose': {
        slug: 'docker-compose',
        name: 'Docker Compose',
        category: 'CLOUD_DEVOPS',
      },
      'github-actions': {
        slug: 'github-actions',
        name: 'GitHub Actions',
        category: 'CLOUD_DEVOPS',
      },
      'gitlab-ci': { slug: 'gitlab-ci', name: 'GitLab CI', category: 'CLOUD_DEVOPS' },
      kubernetes: { slug: 'kubernetes', name: 'Kubernetes', category: 'CLOUD_DEVOPS' },
      k8s: { slug: 'kubernetes', name: 'Kubernetes', category: 'CLOUD_DEVOPS' },
      terraform: { slug: 'terraform', name: 'Terraform', category: 'CLOUD_DEVOPS' },
      aws: { slug: 'aws', name: 'AWS', category: 'CLOUD_DEVOPS' },
      'aws-sdk': { slug: 'aws', name: 'AWS', category: 'CLOUD_DEVOPS' },
      '@aws-sdk/client-s3': { slug: 'aws', name: 'AWS', category: 'CLOUD_DEVOPS' },
      boto3: { slug: 'aws', name: 'AWS', category: 'CLOUD_DEVOPS' },
      gcp: { slug: 'gcp', name: 'Google Cloud Platform', category: 'CLOUD_DEVOPS' },
      azure: { slug: 'azure', name: 'Microsoft Azure', category: 'CLOUD_DEVOPS' },

      // -----------------------------------------------------------------------
      // Tools, Testing, Utilities & AI/ML
      // -----------------------------------------------------------------------
      zod: { slug: 'zod', name: 'Zod', category: 'TOOL' },
      pydantic: { slug: 'pydantic', name: 'Pydantic', category: 'TOOL' },
      vitest: { slug: 'vitest', name: 'Vitest', category: 'TOOL' },
      jest: { slug: 'jest', name: 'Jest', category: 'TOOL' },
      pytest: { slug: 'pytest', name: 'Pytest', category: 'TOOL' },
      serde: { slug: 'serde', name: 'Serde', category: 'TOOL' },
      serde_json: { slug: 'serde', name: 'Serde', category: 'TOOL' },
      torch: { slug: 'pytorch', name: 'PyTorch', category: 'FRAMEWORK' },
      pytorch: { slug: 'pytorch', name: 'PyTorch', category: 'FRAMEWORK' },
      tensorflow: { slug: 'tensorflow', name: 'TensorFlow', category: 'FRAMEWORK' },
      pandas: { slug: 'pandas', name: 'Pandas', category: 'TOOL' },
      numpy: { slug: 'numpy', name: 'NumPy', category: 'TOOL' },
      scikit_learn: { slug: 'scikit-learn', name: 'Scikit-Learn', category: 'TOOL' },
      'scikit-learn': { slug: 'scikit-learn', name: 'Scikit-Learn', category: 'TOOL' },
      graphql: { slug: 'graphql', name: 'GraphQL', category: 'CONCEPT' },
      oauth: { slug: 'oauth', name: 'OAuth 2.0', category: 'CONCEPT' },
      security: { slug: 'application-security', name: 'Application Security', category: 'CONCEPT' },
    })
  );

  /**
   * Normalizes a raw package, dependency, or tool identifier to canonical skill metadata.
   *
   * @param {string} rawIdentifier - Raw package name, import path, or tool keyword.
   * @param {string} [categoryHint='TOOL'] - Fallback category if unmapped.
   * @returns {{ slug: string, name: string, category: 'LANGUAGE' | 'FRAMEWORK' | 'DATABASE' | 'CLOUD_DEVOPS' | 'TOOL' | 'ARCHITECTURE' | 'CONCEPT' }}
   */
  static normalize(rawIdentifier, categoryHint = 'TOOL') {
    if (!rawIdentifier || typeof rawIdentifier !== 'string') {
      return {
        slug: 'unknown-tool',
        name: 'Unknown Tool',
        category: 'TOOL',
      };
    }

    const cleaned = rawIdentifier.trim().toLowerCase();

    // 1. Direct Catalog Match
    if (TaxonomyMapper.TAXONOMY_CATALOG[cleaned]) {
      return { ...TaxonomyMapper.TAXONOMY_CATALOG[cleaned] };
    }

    // 2. Stripped Scope Match (@org/package -> package)
    if (cleaned.startsWith('@') && cleaned.includes('/')) {
      const bareName = cleaned.split('/')[1];
      if (TaxonomyMapper.TAXONOMY_CATALOG[bareName]) {
        return { ...TaxonomyMapper.TAXONOMY_CATALOG[bareName] };
      }
    }

    // 3. Fallback: Safe slug generation for uncataloged tools
    const safeSlug = cleaned
      .replace(/^@[a-z0-9_-]+\//, '') // strip npm scope
      .replace(/[^a-z0-9-]/g, '-') // replace non-alphanumeric with hyphen
      .replace(/-+/g, '-') // collapse repeated hyphens
      .replace(/^-|-$/g, '') // trim leading/trailing hyphens
      .slice(0, 50);

    const fallbackSlug = safeSlug || 'unknown-tool';
    const fallbackName = fallbackSlug
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

    const validCategories = new Set([
      'LANGUAGE',
      'FRAMEWORK',
      'DATABASE',
      'CLOUD_DEVOPS',
      'TOOL',
      'ARCHITECTURE',
      'CONCEPT',
    ]);

    const category = validCategories.has(categoryHint) ? categoryHint : 'TOOL';

    return {
      slug: fallbackSlug,
      name: fallbackName,
      category,
    };
  }
}
