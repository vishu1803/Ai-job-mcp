# ARCH-012: Skill Normalizer & Taxonomy Engine Architecture

**Document ID**: `ARCH-012`  
**Related ADR**: `ADR-032` (`docs/decisions.md`)  
**Status**: `APPROVED`  
**Phase**: Phase 5 (P5-002A)  
**Author**: Antigravity DeepMind Team  
**Date**: 2026-08-22  

---

## 1. Executive Summary & Objective

The **Skill Normalizer & Taxonomy Engine** is the platform's foundational canonicalization system for technical skills, languages, frameworks, databases, cloud platforms, tools, architectures, and concepts. 

In real-world software engineering contexts, technical qualifications and tools are expressed with hundreds of divergent synonym variations, package identifiers, runtime notations, casing styles, and abbreviations (e.g., `Postgres`, `PostgreSQL`, `postgres-db`, `pg`, `psycopg2`, `asyncpg`, `libpq`). Without a robust, deterministic taxonomy engine:
1. Candidate code evidence extracted from manifests (e.g., `pg`, `psycopg2-binary`) fails to match Job Description requirements asking for `PostgreSQL`.
2. Redundant, duplicate skill identities pollute candidate profiles and dilute confidence rollup calculations.
3. Search and ATS scoring mechanisms miss candidate competencies due to string mismatch.
4. Framework competencies (e.g., `Next.js`, `FastAPI`) fail to credit implicit underlying language capabilities (e.g., `JavaScript`, `Python`).

```
+---------------------------------------------------------------------------------------------------+
|                                      RAW TECHNICAL INPUT                                          |
|  Manifests / AST Imports / Job Descriptions / User Resumes / GitHub Topics / Package Identifiers  |
|  (e.g., "Postgres", "React.js", "@fastify/jwt", "google.golang.org/grpc", "CustomSuperTool2026")  |
+-------------------------------------------------+-------------------------------------------------+
                                                  |
                                                  v
+---------------------------------------------------------------------------------------------------+
|                         DETERMINISTIC NORMALIZATION PIPELINE (7 STAGES)                           |
|  1. Input Sanitization & Bounds (<= 100 chars, control character stripping)                      |
|  2. Unicode Normalization (NFKC) & Case-Folding (lowercase)                                       |
|  3. Punctuation, Scope & Suffix Stripping (@scope/, .js, .py, go/pkg/...)                         |
|  4. Direct Canonical Registry & Name Index Lookup                                                 |
|  5. Multi-Variation Alias Index Lookup (50+ Curated Aliases)                                      |
|  6. Context & Word Boundary Disambiguation (e.g., "Go" vs "go to", "Spring" vs season)           |
|  7. Relationship & Hierarchy Resolution (BUILT_ON, ECOSYSTEM_OF, IMPLEMENTS)                     |
+-------------------------------------------------+-------------------------------------------------+
                                                  |
                         +------------------------+------------------------+
                         |                                                 |
                   [Match Found]                                    [No Match Found]
                         |                                                 |
                         v                                                 v
+---------------------------------------------------+   +-------------------------------------------+
|             CANONICAL TAXONOMY ENTITY             |   |         UNKNOWN TERM HANDLER              |
|  - canonicalSlug (e.g. "postgresql", "react")     |   |  - Safe Slugification (kebab-case)        |
|  - canonicalName (e.g. "PostgreSQL", "React")     |   |  - Default Category: TOOL                 |
|  - category (LANGUAGE, FRAMEWORK, DATABASE, etc.) |   |  - Flagged: requiresReview = true         |
|  - relationships (BUILT_ON: javascript, etc.)     |   |  - Optional LLM Disambiguation Gate       |
|  - normalizationConfidence (0.95 - 1.0)           |   |  - Telemetry: unknown_term_observed       |
+---------------------------------------------------+   +-------------------------------------------+
```

---

## 2. Canonical Identity & Constraints

Every technical skill in the Antigravity ecosystem possesses a single, immutable canonical identity.

### 2.1 Canonical Attributes
| Field | Type | Validation Constraint | Description | Example |
| :--- | :--- | :--- | :--- | :--- |
| `canonicalSlug` | `string` | `^[a-z0-9]+(?:-[a-z0-9]+)*$` | Immutable, URL-safe, lowercase kebab-case slug. Max 128 chars. | `postgresql`, `react`, `node-js`, `c-sharp`, `fastapi` |
| `canonicalName` | `string` | `1 <= length <= 100` | Official display name with proper casing and branding. | `PostgreSQL`, `React`, `Node.js`, `C#`, `FastAPI` |
| `category` | `enum` | 1 of 7 approved categories | High-level taxonomy classification. | `DATABASE`, `FRAMEWORK`, `LANGUAGE`, etc. |
| `description` | `string?` | Optional, max 500 chars | Concise summary of the technology. | `Open-source object-relational database system.` |

### 2.2 Invariant Rules
1. **Uniqueness**: A technology has exactly **ONE** canonical slug. Multiple slugs for the same technology (e.g., having both `postgres` and `postgresql`) are strictly forbidden.
2. **Slug Immutability**: Once a canonical slug is established, it cannot be deleted or mutated without an explicit deprecation mapping.
3. **Identity Decoupling**: Database primary keys are RFC 4122 UUID v4 (`skills.id`). The `slug` is a unique natural key (`uniqueIndex('skills_slug_unique')`).

---

## 3. Technology Categories (The 7 Approved Domains)

The taxonomy adheres strictly to the 7 approved categories defined in `skillCategoryEnum` (`src/db/schema.js`). No additional categories are introduced without formal ADR justification.

```
                                  +-----------------------+
                                  |   SKILL CATEGORIES    |
                                  +-----------+-----------+
                                              |
        +------------------+------------------+------------------+------------------+
        |                  |                  |                  |                  |
        v                  v                  v                  v                  v
  +------------+     +-----------+      +------------+     +--------------+   +------------+
  |  LANGUAGE  |     | FRAMEWORK |      |  DATABASE  |     | CLOUD_DEVOPS |   |    TOOL    |
  | TypeScript |     |   React   |      | PostgreSQL |     |    Docker    |   |    Zod     |
  |   Python   |     |  Fastify  |      |   Redis    |     |  Kubernetes  |   |   Vitest   |
  |    Rust    |     |  Django   |      |  MongoDB   |     |     AWS      |   | Terraform  |
  +------------+     +-----------+      +------------+     +--------------+   +------------+
                           |                                        |
                           +-------------------+--------------------+
                                               |
                                    +----------+----------+
                                    |                     |
                                    v                     v
                             +--------------+      +-------------+
                             | ARCHITECTURE |      |   CONCEPT   |
                             | Microservices|      |    OAuth    |
                             | Event-Driven |      |   AppSec    |
                             |   REST API   |      | CI/CD Pplns |
                             +--------------+      +-------------+
```

### 3.1 Category Definitions
1. **`LANGUAGE`**: General-purpose and domain-specific programming languages and core execution runtimes (e.g., `typescript`, `javascript`, `python`, `go`, `rust`, `java`, `kotlin`, `c-sharp`, `cpp`, `node-js`).
2. **`FRAMEWORK`**: Application frameworks, UI libraries, ORMs, and web/networking SDKs (e.g., `fastify`, `express`, `react`, `next-js`, `vue`, `angular`, `svelte`, `nestjs`, `tailwindcss`, `fastapi`, `django`, `flask`, `gin`, `fiber`, `tokio`, `actix-web`, `grpc`, `pytorch`, `tensorflow`).
3. **`DATABASE`**: Relational, document, key-value, graph, and vector database engines, drivers, and query builders (e.g., `postgresql`, `mysql`, `sqlite`, `mongodb`, `redis`, `prisma`, `drizzle-orm`, `typeorm`, `sqlalchemy`, `gorm`, `sqlx`, `diesel`).
4. **`CLOUD_DEVOPS`**: Cloud platforms, container runtimes, orchestrators, CI/CD systems, and infrastructure-as-code tools (e.g., `docker`, `docker-compose`, `kubernetes`, `aws`, `gcp`, `azure`, `terraform`, `github-actions`, `gitlab-ci`).
5. **`TOOL`**: Developer tools, linters, test runners, validation libraries, serialization utilities, and auxiliary packages (e.g., `zod`, `pydantic`, `vitest`, `jest`, `pytest`, `eslint`, `prettier`, `serde`, `pandas`, `numpy`, `scikit-learn`).
6. **`ARCHITECTURE`**: System architectural paradigms and structural patterns (e.g., `microservices`, `event-driven-architecture`, `serverless`, `monolith`, `rest-api`, `graphql-architecture`, `domain-driven-design`).
7. **`CONCEPT`**: Foundational computer science and software engineering principles (e.g., `application-security`, `oauth`, `authentication-authorization`, `data-structures-algorithms`, `database-indexing`, `distributed-consensus`).

---

## 4. Relationship Graph & Hierarchy

To model the software engineering ecosystem accurately without falling into the trap of rigid, oversimplified object-oriented inheritance, the engine defines four explicit, typed relationship edges.

```
       [Next.js]
           | (BUILT_ON)
           v
        [React]
           | (BUILT_ON)
           v
     [JavaScript] <----+ (BUILT_ON)
                       |
                  [Fastify]
```

### 4.1 Relationship Edge Types
1. **`BUILT_ON`**: The framework or library executes on top of or requires proficiency in a specific runtime or programming language.
   - `react` $\xrightarrow{\text{BUILT_ON}}$ `javascript`
   - `next-js` $\xrightarrow{\text{BUILT_ON}}$ `react`
   - `fastify` $\xrightarrow{\text{BUILT_ON}}$ `javascript` / `node-js`
   - `fastapi` $\xrightarrow{\text{BUILT_ON}}$ `python`
   - `django` $\xrightarrow{\text{BUILT_ON}}$ `python`
   - `gin` $\xrightarrow{\text{BUILT_ON}}$ `go`
   - `tokio` $\xrightarrow{\text{BUILT_ON}}$ `rust`
   - `actix-web` $\xrightarrow{\text{BUILT_ON}}$ `rust`
2. **`ECOSYSTEM_OF`**: The utility, client library, driver, or service is an integral component of a broader platform or database ecosystem.
   - `boto3` $\xrightarrow{\text{ECOSYSTEM_OF}}$ `aws`
   - `@aws-sdk/client-s3` $\xrightarrow{\text{ECOSYSTEM_OF}}$ `aws`
   - `ioredis` $\xrightarrow{\text{ECOSYSTEM_OF}}$ `redis`
   - `psycopg2` $\xrightarrow{\text{ECOSYSTEM_OF}}$ `postgresql`
   - `drizzle-orm` $\xrightarrow{\text{ECOSYSTEM_OF}}$ `postgresql`
   - `prisma` $\xrightarrow{\text{ECOSYSTEM_OF}}$ `database`
3. **`IMPLEMENTS`**: The concrete engine, tool, or protocol implements an abstract architectural pattern or standard concept.
   - `postgresql` $\xrightarrow{\text{IMPLEMENTS}}$ `relational-database` / `sql`
   - `grpc` $\xrightarrow{\text{IMPLEMENTS}}$ `microservices` / `rpc`
   - `fastify` $\xrightarrow{\text{IMPLEMENTS}}$ `rest-api`
   - `oauth-service` $\xrightarrow{\text{IMPLEMENTS}}$ `oauth`
   - `kafka` $\xrightarrow{\text{IMPLEMENTS}}$ `event-driven-architecture`
4. **`PARENT_OF`**: Abstract taxonomy categorization hierarchy.
   - `relational-database` $\xrightarrow{\text{PARENT_OF}}$ `postgresql`
   - `sql` $\xrightarrow{\text{PARENT_OF}}$ `relational-database`

### 4.2 Non-Inheritance Rationale
A framework (e.g. React) is **not** an "instance of" JavaScript; it is a UI framework *built on* JavaScript. Treating relationships as explicit directed edges prevents false transitive assumptions (e.g., claiming a React developer is automatically a Node.js backend architect) while still enabling intelligent credit propagation (e.g., verifying 3 years of React commits contributes to JavaScript runtime competency).

---

## 5. Alias Model & Synonym Normalization

Aliases map real-world package names, ecosystem identifiers, repository topics, and resume text to canonical skills.

### 5.1 Multi-Variation Alias Catalog (50+ Verified Technologies)

```javascript
export const TAXONOMY_CATALOG = Object.freeze(
  Object.assign(Object.create(null), {
    // -------------------------------------------------------------------------
    // Databases & ORMs
    // -------------------------------------------------------------------------
    postgresql: { slug: 'postgresql', name: 'PostgreSQL', category: 'DATABASE' },
    postgres: { slug: 'postgresql', name: 'PostgreSQL', category: 'DATABASE' },
    pg: { slug: 'postgresql', name: 'PostgreSQL', category: 'DATABASE' },
    'postgres-db': { slug: 'postgresql', name: 'PostgreSQL', category: 'DATABASE' },
    'postgresql-db': { slug: 'postgresql', name: 'PostgreSQL', category: 'DATABASE' },
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
    mongodb: { slug: 'mongodb', name: 'MongoDB', category: 'DATABASE' },
    mongo: { slug: 'mongodb', name: 'MongoDB', category: 'DATABASE' },
    mongoose: { slug: 'mongodb', name: 'MongoDB', category: 'DATABASE' },
    pymongo: { slug: 'mongodb', name: 'MongoDB', category: 'DATABASE' },
    redis: { slug: 'redis', name: 'Redis', category: 'DATABASE' },
    ioredis: { slug: 'redis', name: 'Redis', category: 'DATABASE' },
    mysql: { slug: 'mysql', name: 'MySQL', category: 'DATABASE' },
    mysql2: { slug: 'mysql', name: 'MySQL', category: 'DATABASE' },
    sqlite: { slug: 'sqlite', name: 'SQLite', category: 'DATABASE' },
    sqlite3: { slug: 'sqlite', name: 'SQLite', category: 'DATABASE' },
    better_sqlite3: { slug: 'sqlite', name: 'SQLite', category: 'DATABASE' },

    // -------------------------------------------------------------------------
    // Web Frameworks & Libraries
    // -------------------------------------------------------------------------
    react: { slug: 'react', name: 'React', category: 'FRAMEWORK' },
    reactjs: { slug: 'react', name: 'React', category: 'FRAMEWORK' },
    'react.js': { slug: 'react', name: 'React', category: 'FRAMEWORK' },
    'react-dom': { slug: 'react', name: 'React', category: 'FRAMEWORK' },
    'next-js': { slug: 'next-js', name: 'Next.js', category: 'FRAMEWORK' },
    nextjs: { slug: 'next-js', name: 'Next.js', category: 'FRAMEWORK' },
    next: { slug: 'next-js', name: 'Next.js', category: 'FRAMEWORK' },
    'next.js': { slug: 'next-js', name: 'Next.js', category: 'FRAMEWORK' },
    fastify: { slug: 'fastify', name: 'Fastify', category: 'FRAMEWORK' },
    '@fastify/cors': { slug: 'fastify', name: 'Fastify', category: 'FRAMEWORK' },
    '@fastify/jwt': { slug: 'fastify', name: 'Fastify', category: 'FRAMEWORK' },
    express: { slug: 'express', name: 'Express.js', category: 'FRAMEWORK' },
    'express.js': { slug: 'express', name: 'Express.js', category: 'FRAMEWORK' },
    expressjs: { slug: 'express', name: 'Express.js', category: 'FRAMEWORK' },
    vue: { slug: 'vue', name: 'Vue.js', category: 'FRAMEWORK' },
    vuejs: { slug: 'vue', name: 'Vue.js', category: 'FRAMEWORK' },
    'vue.js': { slug: 'vue', name: 'Vue.js', category: 'FRAMEWORK' },
    angular: { slug: 'angular', name: 'Angular', category: 'FRAMEWORK' },
    '@angular/core': { slug: 'angular', name: 'Angular', category: 'FRAMEWORK' },
    svelte: { slug: 'svelte', name: 'Svelte', category: 'FRAMEWORK' },
    '@sveltejs/kit': { slug: 'svelte', name: 'Svelte', category: 'FRAMEWORK' },
    nestjs: { slug: 'nestjs', name: 'NestJS', category: 'FRAMEWORK' },
    '@nestjs/core': { slug: 'nestjs', name: 'NestJS', category: 'FRAMEWORK' },
    tailwindcss: { slug: 'tailwindcss', name: 'Tailwind CSS', category: 'FRAMEWORK' },
    'tailwind css': { slug: 'tailwindcss', name: 'Tailwind CSS', category: 'FRAMEWORK' },
    tailwind: { slug: 'tailwindcss', name: 'Tailwind CSS', category: 'FRAMEWORK' },
    fastapi: { slug: 'fastapi', name: 'FastAPI', category: 'FRAMEWORK' },
    django: { slug: 'django', name: 'Django', category: 'FRAMEWORK' },
    flask: { slug: 'flask', name: 'Flask', category: 'FRAMEWORK' },
    gin: { slug: 'gin', name: 'Gin', category: 'FRAMEWORK' },
    'github.com/gin-gonic/gin': { slug: 'gin', name: 'Gin', category: 'FRAMEWORK' },
    tokio: { slug: 'tokio', name: 'Tokio', category: 'FRAMEWORK' },
    'actix-web': { slug: 'actix-web', name: 'Actix Web', category: 'FRAMEWORK' },
    axum: { slug: 'axum', name: 'Axum', category: 'FRAMEWORK' },
    grpc: { slug: 'grpc', name: 'gRPC', category: 'FRAMEWORK' },
    'google.golang.org/grpc': { slug: 'grpc', name: 'gRPC', category: 'FRAMEWORK' },

    // -------------------------------------------------------------------------
    // Programming Languages & Core Runtimes
    // -------------------------------------------------------------------------
    typescript: { slug: 'typescript', name: 'TypeScript', category: 'LANGUAGE' },
    ts: { slug: 'typescript', name: 'TypeScript', category: 'LANGUAGE' },
    javascript: { slug: 'javascript', name: 'JavaScript', category: 'LANGUAGE' },
    js: { slug: 'javascript', name: 'JavaScript', category: 'LANGUAGE' },
    python: { slug: 'python', name: 'Python', category: 'LANGUAGE' },
    py: { slug: 'python', name: 'Python', category: 'LANGUAGE' },
    python3: { slug: 'python', name: 'Python', category: 'LANGUAGE' },
    go: { slug: 'go', name: 'Go', category: 'LANGUAGE' },
    golang: { slug: 'go', name: 'Go', category: 'LANGUAGE' },
    rust: { slug: 'rust', name: 'Rust', category: 'LANGUAGE' },
    'node-js': { slug: 'node-js', name: 'Node.js', category: 'LANGUAGE' },
    node: { slug: 'node-js', name: 'Node.js', category: 'LANGUAGE' },
    nodejs: { slug: 'node-js', name: 'Node.js', category: 'LANGUAGE' },
    'node.js': { slug: 'node-js', name: 'Node.js', category: 'LANGUAGE' },
    java: { slug: 'java', name: 'Java', category: 'LANGUAGE' },
    kotlin: { slug: 'kotlin', name: 'Kotlin', category: 'LANGUAGE' },
    'c-sharp': { slug: 'c-sharp', name: 'C#', category: 'LANGUAGE' },
    csharp: { slug: 'c-sharp', name: 'C#', category: 'LANGUAGE' },
    'c#': { slug: 'c-sharp', name: 'C#', category: 'LANGUAGE' },
    cpp: { slug: 'cpp', name: 'C++', category: 'LANGUAGE' },
    'c++': { slug: 'cpp', name: 'C++', category: 'LANGUAGE' },

    // -------------------------------------------------------------------------
    // Cloud, Infrastructure & DevOps
    // -------------------------------------------------------------------------
    docker: { slug: 'docker', name: 'Docker', category: 'CLOUD_DEVOPS' },
    'docker-compose': { slug: 'docker-compose', name: 'Docker Compose', category: 'CLOUD_DEVOPS' },
    kubernetes: { slug: 'kubernetes', name: 'Kubernetes', category: 'CLOUD_DEVOPS' },
    k8s: { slug: 'kubernetes', name: 'Kubernetes', category: 'CLOUD_DEVOPS' },
    terraform: { slug: 'terraform', name: 'Terraform', category: 'CLOUD_DEVOPS' },
    aws: { slug: 'aws', name: 'AWS', category: 'CLOUD_DEVOPS' },
    'amazon web services': { slug: 'aws', name: 'AWS', category: 'CLOUD_DEVOPS' },
    'aws-sdk': { slug: 'aws', name: 'AWS', category: 'CLOUD_DEVOPS' },
    boto3: { slug: 'aws', name: 'AWS', category: 'CLOUD_DEVOPS' },
    gcp: { slug: 'gcp', name: 'Google Cloud Platform', category: 'CLOUD_DEVOPS' },
    'google cloud': { slug: 'gcp', name: 'Google Cloud Platform', category: 'CLOUD_DEVOPS' },
    azure: { slug: 'azure', name: 'Microsoft Azure', category: 'CLOUD_DEVOPS' },
    'github-actions': { slug: 'github-actions', name: 'GitHub Actions', category: 'CLOUD_DEVOPS' },
    'gitlab-ci': { slug: 'gitlab-ci', name: 'GitLab CI', category: 'CLOUD_DEVOPS' },

    // -------------------------------------------------------------------------
    // AI, ML & Testing Tools
    // -------------------------------------------------------------------------
    pytorch: { slug: 'pytorch', name: 'PyTorch', category: 'FRAMEWORK' },
    torch: { slug: 'pytorch', name: 'PyTorch', category: 'FRAMEWORK' },
    tensorflow: { slug: 'tensorflow', name: 'TensorFlow', category: 'FRAMEWORK' },
    zod: { slug: 'zod', name: 'Zod', category: 'TOOL' },
    pydantic: { slug: 'pydantic', name: 'Pydantic', category: 'TOOL' },
    vitest: { slug: 'vitest', name: 'Vitest', category: 'TOOL' },
    jest: { slug: 'jest', name: 'Jest', category: 'TOOL' },
    pytest: { slug: 'pytest', name: 'Pytest', category: 'TOOL' },
    serde: { slug: 'serde', name: 'Serde', category: 'TOOL' },
    graphql: { slug: 'graphql', name: 'GraphQL', category: 'CONCEPT' },
    oauth: { slug: 'oauth', name: 'OAuth 2.0', category: 'CONCEPT' },
    'application-security': { slug: 'application-security', name: 'Application Security', category: 'CONCEPT' },
  })
);
```

---

## 6. Deterministic Normalization Pipeline

The normalization engine operates in 7 strictly ordered, deterministic stages.

```
RAW STRING: "  @fastify/jwt (v8.0.1)  "
  |
  +--> [Stage 1: Sanitize & Bounds] --------> "@fastify/jwt (v8.0.1)"
  |
  +--> [Stage 2: Unicode & Case] -----------> "@fastify/jwt (v8.0.1)" (NFKC lowercase)
  |
  +--> [Stage 3: Scope & Suffix Strip] -----> "fastify" / "@fastify/jwt"
  |
  +--> [Stage 4: Direct Exact Match] -------> Matched "@fastify/jwt" in Catalog
  |
  +--> [Stage 5: Alias Map Resolution] ------> slug: "fastify", name: "Fastify", category: "FRAMEWORK"
  |
  +--> [Stage 6: Context Disambiguation] ---> Confirmed (no collisions)
  |
  +--> [Stage 7: Relationship Resolution] --> relationships: { builtOn: ["javascript", "node-js"] }
```

### 6.1 Pipeline Stages
1. **Stage 1: Input Sanitization & Bounds**:
   - Rejects inputs exceeding 100 characters.
   - Strips non-printable control characters `[\u0000-\u001F\u007F]`.
2. **Stage 2: Unicode NFKC & Case Normalization**:
   - Normalizes full-width characters and ligatures via `String.prototype.normalize('NFKC')`.
   - Converts to lowercase: `.toLowerCase()`.
3. **Stage 3: Punctuation, Scope & Suffix Stripping**:
   - Strips version constraints (e.g., `^18.2.0`, `@latest`, `(v2.1)`).
   - Extracts base package names from scoped packages (e.g., `@fastify/cors` $\rightarrow$ `cors` or `@fastify/cors`).
   - Strips common repository host prefixes (e.g., `github.com/gin-gonic/gin` $\rightarrow$ `gin`).
4. **Stage 4: Direct Exact / Catalog Lookup**:
   - Checks normalized string against `TAXONOMY_CATALOG` in $O(1)$ time.
5. **Stage 5: Multi-Variation Alias Index Lookup**:
   - Searches alias reverse-index for synonyms (e.g. `postgres-db` $\rightarrow$ `postgresql`).
6. **Stage 6: Context & Word Boundary Disambiguation**:
   - Executes semantic rules for short or collision-prone keywords (`Go`, `Rust`, `Spring`, `C`, `R`).
7. **Stage 7: Canonical Entity & Relationship Assembly**:
   - Returns immutable canonical result:
     ```javascript
     {
       slug: 'postgresql',
       name: 'PostgreSQL',
       category: 'DATABASE',
       relationships: {
         implements: ['relational-database', 'sql'],
         ecosystemOf: null,
         builtOn: null,
       },
       normalizationConfidence: 1.0,
       isCustom: false,
     }
     ```

---

## 7. Ambiguity Handling & Context Disambiguation

Short names and homoglyphs present significant false-positive risks during free-text parsing.

| Keyword | Potential Ambiguity | Disambiguation Rules | Resolution |
| :--- | :--- | :--- | :--- |
| **`Go`** | English verb ("go to", "go build") | Matched only when: (1) casing is exact `Go` / `Golang`, (2) preceded by tech terms ("backend in Go", "Go developer"), (3) present in `go.mod` manifest, or (4) file extension `.go`. Bare lowercase `go` in prose is ignored. | `go` (`LANGUAGE`) |
| **`Rust`** | Metal corrosion, oxide | Matched in programming context, `Cargo.toml`, or uppercase `Rust`. | `rust` (`LANGUAGE`) |
| **`Spring`** | Season, mechanical spring | Matched when preceded/followed by `boot`, `framework`, `java`, or `@springframework`. | `spring` (`FRAMEWORK`) |
| **`C`** | English letter, grade | Matched only when written as `C language`, `C programming`, `.c` file, or accompanied by `gcc`/`clang`. | `c` (`LANGUAGE`) |
| **`R`** | English letter | Matched only in `R language`, `R statistical`, `CRAN`, or `.r` files. | `r` (`LANGUAGE`) |
| **`AWS`** | Common acronym | Matched in cloud infrastructure context or `@aws-sdk`. | `aws` (`CLOUD_DEVOPS`) |

---

## 8. Unknown Technologies & Safe Slugification

When an extracted technical term or package is not found in `TAXONOMY_CATALOG`:

```
Input: "CustomSuperTool2026"
  |
  v
Sanitize: "customsupertool2026"
  |
  v
Validate Regex: /^[a-z0-9]+(?:-[a-z0-9]+)*$/ -> PASS
  |
  v
Mint Output:
{
  slug: "customsupertool2026",
  name: "Customsupertool2026",
  category: "TOOL",
  isCustom: true,
  requiresReview: true,
  normalizationConfidence: 0.50
}
  |
  v
Emit Telemetry: auditLog.log('taxonomy.unknown_term_observed', { slug, rawInput })
```

### 8.1 Unknown Technology Safeguards
1. **Deterministic Slugification**: `rawTerm.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')`.
2. **Strict Regex Validation**: Must satisfy `SafeSlugSchema` (`^[a-z0-9]+(?:-[a-z0-9]+)*$`).
3. **Safe Default Category**: Assigned default category `TOOL` unless an explicit category hint was provided by a manifest parser.
4. **Flagged for Review**: Marked with `isCustom: true` and `requiresReview: true`.
5. **No Auto-Aliasing**: Unknown terms are **never** automatically assigned as aliases to existing technologies without human or deterministic approval.

---

## 9. LLM Boundary & Sandboxing Protocol

Large Language Models (LLMs) are **strictly prohibited** from serving as the primary normalizer or mutating the canonical taxonomy.

```
+---------------------------------------------------------------------------------------------------+
|                                 UNTRUSTED RAW SKILL PHRASE                                        |
|                       (e.g., "Deep experience with Postgres relational DB")                       |
+-------------------------------------------------+-------------------------------------------------+
                                                  |
                                                  v
+---------------------------------------------------------------------------------------------------+
|                                  DETERMINISTIC EXTRACTOR                                          |
|                          (Finds keyword "Postgres" -> postgresql)                                 |
+-------------------------------------------------+-------------------------------------------------+
                                                  |
                        [If Highly Ambiguous & Deterministic Fails]
                                                  |
                                                  v
+---------------------------------------------------------------------------------------------------+
|                                   LLM DISAMBIGUATION SANDBOX                                      |
|  - Prompt Fencing: <untrusted_skill_term>...</untrusted_skill_term>                               |
|  - Fixed Vocabulary: Must select from approved list of canonical slugs                           |
|  - Strictly Prohibited: No arbitrary slug creation, no scoring, no DB writes                     |
|  - Output: { proposedSlug: string, confidence: number, reasoning: string }                        |
+-------------------------------------------------+-------------------------------------------------+
                                                  |
                                                  v
+---------------------------------------------------------------------------------------------------+
|                                 DETERMINISTIC VERIFICATION GATE                                   |
|             TaxonomyMapper.TAXONOMY_CATALOG[proposedSlug] !== undefined ? ACCEPT : REJECT        |
+---------------------------------------------------------------------------------------------------+
```

---

## 10. Database & Storage Architecture

The platform uses a **Hybrid Architecture** balancing sub-millisecond execution performance with database-backed relational integrity.

```
+---------------------------------------------------------------------------------------------------+
|                                1. IN-MEMORY COMPILED CATALOG                                      |
|                       (Fastify hot path, AST import scanning, JD parsing)                         |
|   - Zero-latency O(1) lookups via Map / Object.create(null)                                       |
|   - Immutable, thread-safe, no SQL overhead                                                      |
+-------------------------------------------------+-------------------------------------------------+
                                                  |
                                                  | (Foreign Key Synchronization)
                                                  v
+---------------------------------------------------------------------------------------------------+
|                                2. POSTGRESQL CANONICAL SCHEMA                                     |
|                       (Global persistent source of truth & foreign keys)                          |
|   - Table: skills (id UUID PK, slug UNIQUE, name, category, aliases JSONB, description)          |
|   - Table: candidate_skills (tenant_id, candidate_id, skill_id FK -> skills.id)                   |
|   - Table: evidence_items (tenant_id, skill_id FK -> skills.id)                                   |
+---------------------------------------------------------------------------------------------------+
```

### 10.1 Future Dynamic Extensibility (Phase 5+ Proposal)
When user workspaces or enterprise tenants require custom organizational taxonomies, the database schema can be extended with `skill_aliases` and `skill_relationships` tables without breaking existing `skills` records:
* `skill_aliases` (`id`, `skill_id` $\rightarrow$ `skills.id`, `alias` UNIQUE, `source`).
* `skill_relationships` (`id`, `source_skill_id`, `target_skill_id`, `relationship_type` [`BUILT_ON`, `ECOSYSTEM_OF`, `IMPLEMENTS`]).

*Zero database migrations are introduced in P5-002A.*

---

## 11. Versioning, Deprecation & Evidence Compatibility

Existing candidate skills, evidence items, and job requirements must never be invalidated when the taxonomy expands.

### 11.1 Backward Compatibility Invariants
1. **UUID Stability**: The `id` of an existing canonical skill record is permanent.
2. **Evidence Preservation**: `evidence_items.skill_id` and `candidate_skills.skill_id` foreign keys remain valid when new aliases are added.
3. **Rebranding Strategy**: When a technology rebrands (e.g., `docker-compose` $\rightarrow$ `compose-v2`), the original slug remains as a legacy alias pointing to the canonical record.
4. **Soft Deprecation**:
   ```javascript
   {
     slug: 'legacy-tool',
     name: 'Legacy Tool',
     category: 'TOOL',
     status: 'DEPRECATED',
     successorSlug: 'modern-tool'
   }
   ```

---

## 12. Decoupled Confidence Model

The platform enforces strict separation between normalization confidence and candidate competency confidence.

```
+---------------------------------------------------------------------------------------------------+
|                                 PLATFORM CONFIDENCE TAXONOMY                                      |
+---------------------------------------------------------------------------------------------------+
| 1. Normalization Confidence (Taxonomy Engine)                                                     |
|    - 1.00: Exact canonical match (e.g., "postgresql" -> postgresql)                               |
|    - 0.95: Direct verified alias (e.g., "postgres" -> postgresql)                                 |
|    - 0.85: Contextual disambiguation (e.g., "Go developer" -> go)                                |
|    - 0.70: Sandboxed LLM proposal (verified against taxonomy)                                     |
|    - 0.50: Unknown slugified tool fallback (isCustom = true)                                      |
+---------------------------------------------------------------------------------------------------+
| 2. Evidence Item Confidence (GitHub Extractor)                                                    |
|    - 0.95: Manifest dependency (package.json, Cargo.toml)                                         |
|    - 0.90: AST source code import statement                                                       |
|    - 0.70: Repository topic tag or filename heuristic                                             |
+---------------------------------------------------------------------------------------------------+
| 3. Candidate Skill Rollup Confidence (Candidate Profile Service)                                  |
|    - Dynamic Bayesian rollup: f(evidenceCount, primaryEvidenceQuality, verifiedCommits)           |
+---------------------------------------------------------------------------------------------------+
| 4. Job Requirement Match Score (Career Intelligence Engine)                                       |
|    - Mathematical formula: S in [0, 100] combining required/preferred matches and evidence depth  |
+---------------------------------------------------------------------------------------------------+
```

---

## 13. Testing Strategy & Quality Assurance Plan

The implementation in `P5-002` must satisfy comprehensive test suites:

1. **Exact Canonical Lookups**: Verifies all primary slugs resolve directly.
2. **50+ Technology Synonyms**: Verifies multi-variation aliases across all 7 categories.
3. **Punctuation & Case Invariance**: Verifies `@scope/`, `v1.2.3`, `.js`, uppercase, mixed case, dashes, underscores.
4. **Framework-to-Language Graphs**: Verifies `BUILT_ON` relationships (`React` $\rightarrow$ `JavaScript`, `FastAPI` $\rightarrow$ `Python`, `Gin` $\rightarrow$ `Go`, `Tokio` $\rightarrow$ `Rust`).
5. **Collision Disambiguation**: Negative tests verifying bare words ("go", "spring", "rust") are not falsely matched without technical context.
6. **Unknown Tool Slugification**: Verifies generated slugs satisfy `SafeSlugSchema` and are flagged for review.
7. **Anti-Prompt-Injection Resistance**: Verifies adversarial inputs inside skill fields cannot trigger code execution or mutate the catalog.
8. **Multi-Tenant Isolation**: Verifies normalization produces pure data structures without tenant cross-contamination.

---

## 14. Architecture Review & Recommendation

### Recommendation
**`P5-002A APPROVED`**

The architecture specification:
1. Resolves canonical identity unambiguously (one canonical slug per technology).
2. Establishes a deterministic 7-stage normalization pipeline.
3. Defines explicit relationship graph edges (`BUILT_ON`, `ECOSYSTEM_OF`, `IMPLEMENTS`) avoiding naive inheritance.
4. Guarantees 100% backward compatibility with existing evidence and candidate profile tables.
5. Imposes strict deterministic gates on LLM interactions.
6. Introduces zero premature database migrations.
