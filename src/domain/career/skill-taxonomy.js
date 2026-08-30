/**
 * @file Canonical Skill Normalizer & Taxonomy Engine (P5-002)
 *
 * Provides high-performance, deterministic canonicalization of technical skills,
 * languages, frameworks, databases, cloud platforms, tools, architectures, and concepts.
 * Implements 50+ technology aliases, explicit relationship graph modeling (BUILT_ON,
 * ECOSYSTEM_OF, IMPLEMENTS, PARENT_OF), context-aware keyword disambiguation,
 * safe unknown tool slugification, and strict LLM boundary protection.
 */

import { logger } from '../../utils/logger.js';
import { SafeSlugSchema } from '../candidate/candidate.schemas.js';

/**
 * Maximum permitted raw input string length for skill normalizer.
 */
export const MAX_SKILL_INPUT_LENGTH = 100;

/**
 * Seven canonical skill categories approved by ADR-027 and ARCH-012.
 */
export const SKILL_CATEGORIES = Object.freeze([
  'LANGUAGE',
  'FRAMEWORK',
  'DATABASE',
  'CLOUD_DEVOPS',
  'TOOL',
  'ARCHITECTURE',
  'CONCEPT',
]);

/**
 * Canonical Technology Definitions with Curated Multi-Variation Aliases and Relationships.
 * Keyed by immutable canonical slug (^[a-z0-9]+(?:-[a-z0-9]+)*$).
 */
export const CANONICAL_SKILLS = Object.freeze({
  // ===========================================================================
  // 1. Programming Languages & Core Execution Runtimes (LANGUAGE)
  // ===========================================================================
  typescript: {
    slug: 'typescript',
    name: 'TypeScript',
    category: 'LANGUAGE',
    description: 'Typed superset of JavaScript that compiles to plain JavaScript.',
    aliases: ['typescript', 'ts', 'tsx', 'tsc'],
    relationships: {
      builtOn: ['javascript'],
      ecosystemOf: ['node-js'],
      implements: ['static-typing'],
      parentOf: [],
    },
  },
  javascript: {
    slug: 'javascript',
    name: 'JavaScript',
    category: 'LANGUAGE',
    description: 'High-level, interpreted scripting language conforming to ECMAScript.',
    aliases: ['javascript', 'js', 'jsx', 'es6', 'es2020', 'es2022', 'ecmascript', 'vanilla-js'],
    relationships: {
      builtOn: [],
      ecosystemOf: ['web-platform'],
      implements: ['dynamic-typing'],
      parentOf: ['typescript'],
    },
  },
  python: {
    slug: 'python',
    name: 'Python',
    category: 'LANGUAGE',
    description: 'Interpreted, high-level, general-purpose programming language.',
    aliases: ['python', 'py', 'python3', 'py3', 'cpython', 'pypy'],
    relationships: {
      builtOn: [],
      ecosystemOf: [],
      implements: ['dynamic-typing', 'object-oriented-programming'],
      parentOf: [],
    },
  },
  go: {
    slug: 'go',
    name: 'Go',
    category: 'LANGUAGE',
    description: 'Statically typed, compiled programming language designed at Google.',
    aliases: ['go', 'golang', 'go-lang', 'golang-lang'],
    relationships: {
      builtOn: [],
      ecosystemOf: [],
      implements: ['concurrency', 'static-typing', 'compiled-language'],
      parentOf: [],
    },
  },
  rust: {
    slug: 'rust',
    name: 'Rust',
    category: 'LANGUAGE',
    description: 'Systems programming language focusing on safety, speed, and concurrency.',
    aliases: ['rust', 'rustlang', 'rust-lang', 'cargo'],
    relationships: {
      builtOn: [],
      ecosystemOf: [],
      implements: ['memory-safety', 'concurrency', 'compiled-language', 'systems-programming'],
      parentOf: [],
    },
  },
  'node-js': {
    slug: 'node-js',
    name: 'Node.js',
    category: 'LANGUAGE',
    description: 'Asynchronous event-driven JavaScript runtime built on Chrome V8 engine.',
    aliases: ['node-js', 'node', 'nodejs', 'node.js', 'v8-node', 'node-runtime'],
    relationships: {
      builtOn: ['javascript'],
      ecosystemOf: ['v8'],
      implements: ['event-driven-architecture', 'asynchronous-io'],
      parentOf: [],
    },
  },
  java: {
    slug: 'java',
    name: 'Java',
    category: 'LANGUAGE',
    description: 'Object-oriented, class-based high-level programming language.',
    aliases: ['java', 'java8', 'java11', 'java17', 'java21', 'jdk', 'jvm'],
    relationships: {
      builtOn: [],
      ecosystemOf: ['jvm'],
      implements: ['object-oriented-programming', 'static-typing'],
      parentOf: [],
    },
  },
  kotlin: {
    slug: 'kotlin',
    name: 'Kotlin',
    category: 'LANGUAGE',
    description: 'Cross-platform, statically typed, general-purpose language with type inference.',
    aliases: ['kotlin', 'kt', 'kts'],
    relationships: {
      builtOn: ['java'],
      ecosystemOf: ['jvm', 'android'],
      implements: ['static-typing', 'functional-programming'],
      parentOf: [],
    },
  },
  'c-sharp': {
    slug: 'c-sharp',
    name: 'C#',
    category: 'LANGUAGE',
    description:
      'Modern, object-oriented, and type-safe programming language developed by Microsoft.',
    aliases: ['c-sharp', 'csharp', 'c#', 'dotnet-csharp', 'cs'],
    relationships: {
      builtOn: [],
      ecosystemOf: ['dotnet'],
      implements: ['object-oriented-programming', 'static-typing'],
      parentOf: [],
    },
  },
  cpp: {
    slug: 'cpp',
    name: 'C++',
    category: 'LANGUAGE',
    description: 'General-purpose programming language created as an extension of the C language.',
    aliases: ['cpp', 'c++', 'cplusplus', 'c-plus-plus', 'cpp11', 'cpp17', 'cpp20'],
    relationships: {
      builtOn: ['c'],
      ecosystemOf: [],
      implements: ['systems-programming', 'compiled-language', 'object-oriented-programming'],
      parentOf: [],
    },
  },
  c: {
    slug: 'c',
    name: 'C',
    category: 'LANGUAGE',
    description: 'General-purpose procedural computer programming language.',
    aliases: ['c', 'c-lang', 'clang'],
    relationships: {
      builtOn: [],
      ecosystemOf: [],
      implements: ['systems-programming', 'compiled-language'],
      parentOf: ['cpp'],
    },
  },
  html: {
    slug: 'html',
    name: 'HTML',
    category: 'LANGUAGE',
    description:
      'Standard markup language for documents designed to be displayed in a web browser.',
    aliases: ['html', 'html5'],
    relationships: {
      builtOn: [],
      ecosystemOf: ['web-platform'],
      implements: [],
      parentOf: [],
    },
  },
  css: {
    slug: 'css',
    name: 'CSS',
    category: 'LANGUAGE',
    description:
      'Style sheet language used for specifying presentation of a document written in HTML.',
    aliases: ['css', 'css3'],
    relationships: {
      builtOn: [],
      ecosystemOf: ['web-platform'],
      implements: [],
      parentOf: ['tailwindcss'],
    },
  },

  // ===========================================================================
  // 2. Application Frameworks & Web SDKs (FRAMEWORK)
  // ===========================================================================
  react: {
    slug: 'react',
    name: 'React',
    category: 'FRAMEWORK',
    description: 'Declarative component-based JavaScript library for building user interfaces.',
    aliases: ['react', 'reactjs', 'react.js', 'react-dom', 'react-core'],
    relationships: {
      builtOn: ['javascript'],
      ecosystemOf: ['web-platform'],
      implements: ['component-architecture', 'reactive-programming'],
      parentOf: ['next-js'],
    },
  },
  'next-js': {
    slug: 'next-js',
    name: 'Next.js',
    category: 'FRAMEWORK',
    description: 'React framework enabling server-side rendering and static web applications.',
    aliases: ['next-js', 'next', 'nextjs', 'next.js', 'next-framework'],
    relationships: {
      builtOn: ['react', 'javascript', 'node-js'],
      ecosystemOf: ['react', 'vercel'],
      implements: ['server-side-rendering', 'static-site-generation'],
      parentOf: [],
    },
  },
  fastify: {
    slug: 'fastify',
    name: 'Fastify',
    category: 'FRAMEWORK',
    description: 'Fast and low overhead web framework for Node.js.',
    aliases: [
      'fastify',
      '@fastify/cors',
      '@fastify/cookie',
      '@fastify/jwt',
      '@fastify/swagger',
      'fastify-framework',
    ],
    relationships: {
      builtOn: ['javascript', 'node-js'],
      ecosystemOf: ['node-js'],
      implements: ['rest-api', 'http-services'],
      parentOf: [],
    },
  },
  express: {
    slug: 'express',
    name: 'Express.js',
    category: 'FRAMEWORK',
    description: 'Fast, unopinionated, minimalist web framework for Node.js.',
    aliases: ['express', 'expressjs', 'express.js', 'express-framework'],
    relationships: {
      builtOn: ['javascript', 'node-js'],
      ecosystemOf: ['node-js'],
      implements: ['rest-api', 'http-services'],
      parentOf: [],
    },
  },
  vue: {
    slug: 'vue',
    name: 'Vue.js',
    category: 'FRAMEWORK',
    description: 'Progressive JavaScript framework for building user interfaces.',
    aliases: ['vue', 'vuejs', 'vue.js', 'vue3', 'vue2', '@vue/core'],
    relationships: {
      builtOn: ['javascript'],
      ecosystemOf: ['web-platform'],
      implements: ['component-architecture', 'reactive-programming'],
      parentOf: [],
    },
  },
  angular: {
    slug: 'angular',
    name: 'Angular',
    category: 'FRAMEWORK',
    description: 'TypeScript-based open-source web application framework led by Google.',
    aliases: ['angular', '@angular/core', '@angular/common', 'angularjs', 'angular2'],
    relationships: {
      builtOn: ['typescript', 'javascript'],
      ecosystemOf: ['web-platform'],
      implements: ['component-architecture', 'dependency-injection'],
      parentOf: [],
    },
  },
  svelte: {
    slug: 'svelte',
    name: 'Svelte',
    category: 'FRAMEWORK',
    description: 'Cybernetically enhanced web apps compile-time UI framework.',
    aliases: ['svelte', '@sveltejs/kit', 'sveltejs', 'svelte-kit'],
    relationships: {
      builtOn: ['javascript'],
      ecosystemOf: ['web-platform'],
      implements: ['component-architecture', 'reactive-programming'],
      parentOf: [],
    },
  },
  nestjs: {
    slug: 'nestjs',
    name: 'NestJS',
    category: 'FRAMEWORK',
    description:
      'Progressive Node.js framework for building efficient and scalable server-side apps.',
    aliases: ['nestjs', '@nestjs/core', '@nestjs/common', 'nest.js', 'nest-framework'],
    relationships: {
      builtOn: ['typescript', 'node-js'],
      ecosystemOf: ['node-js'],
      implements: ['microservices', 'rest-api', 'dependency-injection'],
      parentOf: [],
    },
  },
  tailwindcss: {
    slug: 'tailwindcss',
    name: 'Tailwind CSS',
    category: 'FRAMEWORK',
    description: 'Utility-first CSS framework for rapid custom user interface development.',
    aliases: ['tailwindcss', 'tailwind', 'tailwind-css', 'tailwind css'],
    relationships: {
      builtOn: ['css'],
      ecosystemOf: ['web-platform'],
      implements: ['responsive-design'],
      parentOf: [],
    },
  },
  fastapi: {
    slug: 'fastapi',
    name: 'FastAPI',
    category: 'FRAMEWORK',
    description:
      'Modern, fast web framework for building APIs with Python 3.8+ based on type hints.',
    aliases: ['fastapi', 'fast-api', 'fast api', 'fastapi-framework'],
    relationships: {
      builtOn: ['python'],
      ecosystemOf: ['python'],
      implements: ['rest-api', 'asynchronous-io', 'openapi'],
      parentOf: [],
    },
  },
  django: {
    slug: 'django',
    name: 'Django',
    category: 'FRAMEWORK',
    description:
      'High-level Python web framework that encourages rapid development and clean design.',
    aliases: ['django', 'django-rest-framework', 'djangorestframework', 'drf'],
    relationships: {
      builtOn: ['python'],
      ecosystemOf: ['python'],
      implements: ['model-view-controller', 'rest-api'],
      parentOf: [],
    },
  },
  flask: {
    slug: 'flask',
    name: 'Flask',
    category: 'FRAMEWORK',
    description: 'Micro web framework written in Python based on Werkzeug and Jinja.',
    aliases: ['flask', 'flask-framework', 'flask-restful'],
    relationships: {
      builtOn: ['python'],
      ecosystemOf: ['python'],
      implements: ['rest-api', 'http-services'],
      parentOf: [],
    },
  },
  gin: {
    slug: 'gin',
    name: 'Gin',
    category: 'FRAMEWORK',
    description: 'High-performance HTTP web framework written in Go.',
    aliases: ['gin', 'gin-gonic', 'github.com/gin-gonic/gin', 'gin-framework'],
    relationships: {
      builtOn: ['go'],
      ecosystemOf: ['go'],
      implements: ['rest-api', 'http-services'],
      parentOf: [],
    },
  },
  fiber: {
    slug: 'fiber',
    name: 'Fiber',
    category: 'FRAMEWORK',
    description: 'Express-inspired web framework written in Go built atop Fasthttp.',
    aliases: ['fiber', 'gofiber', 'github.com/gofiber/fiber', 'github.com/gofiber/fiber/v2'],
    relationships: {
      builtOn: ['go'],
      ecosystemOf: ['go'],
      implements: ['rest-api', 'http-services'],
      parentOf: [],
    },
  },
  tokio: {
    slug: 'tokio',
    name: 'Tokio',
    category: 'FRAMEWORK',
    description:
      'Event-driven, non-blocking I/O platform for writing asynchronous Rust applications.',
    aliases: ['tokio', 'tokio-rs', 'tokio-runtime'],
    relationships: {
      builtOn: ['rust'],
      ecosystemOf: ['rust'],
      implements: ['asynchronous-io', 'concurrency'],
      parentOf: [],
    },
  },
  'actix-web': {
    slug: 'actix-web',
    name: 'Actix Web',
    category: 'FRAMEWORK',
    description: 'Powerful, pragmatic, and extremely fast web framework for Rust.',
    aliases: ['actix-web', 'actix', 'actixweb', 'actix-framework'],
    relationships: {
      builtOn: ['rust'],
      ecosystemOf: ['rust'],
      implements: ['rest-api', 'asynchronous-io'],
      parentOf: [],
    },
  },
  axum: {
    slug: 'axum',
    name: 'Axum',
    category: 'FRAMEWORK',
    description: 'Web application framework that focuses on ergonomics and modularity for Rust.',
    aliases: ['axum', 'tokio-axum', 'axum-framework'],
    relationships: {
      builtOn: ['rust', 'tokio'],
      ecosystemOf: ['rust'],
      implements: ['rest-api', 'asynchronous-io'],
      parentOf: [],
    },
  },
  grpc: {
    slug: 'grpc',
    name: 'gRPC',
    category: 'FRAMEWORK',
    description: 'High performance, open source universal Remote Procedure Call (RPC) framework.',
    aliases: ['grpc', 'google.golang.org/grpc', '@grpc/grpc-js', 'grpc-gateway'],
    relationships: {
      builtOn: [],
      ecosystemOf: ['google-cloud'],
      implements: ['microservices', 'rpc', 'protobuf'],
      parentOf: [],
    },
  },
  spring: {
    slug: 'spring',
    name: 'Spring Framework',
    category: 'FRAMEWORK',
    description: 'Application framework and inversion of control container for the Java platform.',
    aliases: ['spring', 'spring-boot', 'springboot', 'spring-framework', '@springframework'],
    relationships: {
      builtOn: ['java'],
      ecosystemOf: ['jvm'],
      implements: ['dependency-injection', 'rest-api', 'microservices'],
      parentOf: [],
    },
  },
  pytorch: {
    slug: 'pytorch',
    name: 'PyTorch',
    category: 'FRAMEWORK',
    description: 'Optimized tensor library for deep learning using GPUs and CPUs.',
    aliases: ['pytorch', 'torch', 'torchvision', 'torchaudio'],
    relationships: {
      builtOn: ['python', 'cpp'],
      ecosystemOf: ['python'],
      implements: ['deep-learning', 'neural-networks', 'gpu-acceleration'],
      parentOf: [],
    },
  },
  tensorflow: {
    slug: 'tensorflow',
    name: 'TensorFlow',
    category: 'FRAMEWORK',
    description: 'End-to-end open source platform for machine learning developed by Google.',
    aliases: ['tensorflow', 'tf', 'keras', 'tensorflow-gpu'],
    relationships: {
      builtOn: ['python', 'cpp'],
      ecosystemOf: ['python'],
      implements: ['machine-learning', 'deep-learning'],
      parentOf: [],
    },
  },
  dotnet: {
    slug: 'dotnet',
    name: '.NET',
    category: 'FRAMEWORK',
    description:
      'Free, open-source, cross-platform software development framework for building applications.',
    aliases: ['dotnet', '.net', 'dot-net', 'dotnet-core', 'aspnet', 'aspnetcore'],
    relationships: {
      builtOn: ['c-sharp'],
      ecosystemOf: [],
      implements: ['object-oriented-programming'],
      parentOf: [],
    },
  },

  // ===========================================================================
  // 3. Databases, ORMs & Caching Engines (DATABASE)
  // ===========================================================================
  postgresql: {
    slug: 'postgresql',
    name: 'PostgreSQL',
    category: 'DATABASE',
    description: 'Powerful, open source object-relational database system.',
    aliases: [
      'postgresql',
      'postgres',
      'pg',
      'postgres-db',
      'postgresql-db',
      'psycopg2',
      'psycopg2-binary',
      'asyncpg',
      'pg-promise',
      'pg-pool',
      'pq',
      'github.com/lib/pq',
    ],
    relationships: {
      builtOn: ['c'],
      ecosystemOf: ['relational-database'],
      implements: ['relational-database', 'sql', 'acid-compliance'],
      parentOf: [],
    },
  },
  'drizzle-orm': {
    slug: 'drizzle-orm',
    name: 'Drizzle ORM',
    category: 'DATABASE',
    description: 'TypeScript ORM that lets you write SQL with full type safety.',
    aliases: ['drizzle-orm', 'drizzle', 'drizzle-kit'],
    relationships: {
      builtOn: ['typescript', 'node-js'],
      ecosystemOf: ['postgresql', 'mysql', 'sqlite'],
      implements: ['orm', 'sql', 'type-safety'],
      parentOf: [],
    },
  },
  prisma: {
    slug: 'prisma',
    name: 'Prisma',
    category: 'DATABASE',
    description: 'Next-generation ORM for Node.js and TypeScript.',
    aliases: ['prisma', '@prisma/client', 'prisma-client', 'prisma-orm'],
    relationships: {
      builtOn: ['typescript', 'rust'],
      ecosystemOf: ['database'],
      implements: ['orm', 'sql', 'database-migrations'],
      parentOf: [],
    },
  },
  typeorm: {
    slug: 'typeorm',
    name: 'TypeORM',
    category: 'DATABASE',
    description: 'ORM that can run in NodeJS, Browser, Cordova, PhoneGap, Ionic, and Electron.',
    aliases: ['typeorm', 'type-orm'],
    relationships: {
      builtOn: ['typescript', 'node-js'],
      ecosystemOf: ['database'],
      implements: ['orm', 'sql'],
      parentOf: [],
    },
  },
  mongodb: {
    slug: 'mongodb',
    name: 'MongoDB',
    category: 'DATABASE',
    description: 'Source-available cross-platform document-oriented database program.',
    aliases: ['mongodb', 'mongo', 'mongoose', 'pymongo', 'mongo-client'],
    relationships: {
      builtOn: ['cpp'],
      ecosystemOf: ['nosql-database'],
      implements: ['nosql-database', 'document-database'],
      parentOf: [],
    },
  },
  redis: {
    slug: 'redis',
    name: 'Redis',
    category: 'DATABASE',
    description:
      'In-memory data structure store used as a database, cache, streaming engine, and message broker.',
    aliases: ['redis', 'ioredis', 'redis-server', 'redis-cli'],
    relationships: {
      builtOn: ['c'],
      ecosystemOf: [],
      implements: ['in-memory-database', 'caching', 'pub-sub'],
      parentOf: [],
    },
  },
  kafka: {
    slug: 'kafka',
    name: 'Apache Kafka',
    category: 'DATABASE',
    description: 'Distributed event streaming platform used for high-performance data pipelines.',
    aliases: ['kafka', 'apache-kafka', 'kafka-client'],
    relationships: {
      builtOn: ['java'],
      ecosystemOf: [],
      implements: ['event-driven-architecture', 'pub-sub'],
      parentOf: [],
    },
  },
  mysql: {
    slug: 'mysql',
    name: 'MySQL',
    category: 'DATABASE',
    description: 'Open-source relational database management system.',
    aliases: ['mysql', 'mysql2', 'mysql-server', 'mysqld'],
    relationships: {
      builtOn: ['cpp', 'c'],
      ecosystemOf: ['relational-database'],
      implements: ['relational-database', 'sql'],
      parentOf: [],
    },
  },
  sqlite: {
    slug: 'sqlite',
    name: 'SQLite',
    category: 'DATABASE',
    description:
      'C-language library that implements a small, fast, self-contained SQL database engine.',
    aliases: ['sqlite', 'sqlite3', 'better_sqlite3', 'better-sqlite3', 'rusqlite'],
    relationships: {
      builtOn: ['c'],
      ecosystemOf: ['relational-database'],
      implements: ['relational-database', 'embedded-database', 'sql'],
      parentOf: [],
    },
  },
  sqlalchemy: {
    slug: 'sqlalchemy',
    name: 'SQLAlchemy',
    category: 'DATABASE',
    description:
      'Python SQL toolkit and Object Relational Mapper giving application developers full power of SQL.',
    aliases: ['sqlalchemy', 'flask-sqlalchemy'],
    relationships: {
      builtOn: ['python'],
      ecosystemOf: ['python', 'relational-database'],
      implements: ['orm', 'sql'],
      parentOf: [],
    },
  },
  gorm: {
    slug: 'gorm',
    name: 'GORM',
    category: 'DATABASE',
    description: 'The fantastic ORM library for Golang.',
    aliases: ['gorm', 'gorm.io/gorm', 'github.com/jinzhu/gorm'],
    relationships: {
      builtOn: ['go'],
      ecosystemOf: ['go', 'relational-database'],
      implements: ['orm', 'sql'],
      parentOf: [],
    },
  },
  sqlx: {
    slug: 'sqlx',
    name: 'SQLx',
    category: 'DATABASE',
    description: 'Async, pure Rust SQL crate featuring compile-time checked queries.',
    aliases: ['sqlx', 'sqlx-core'],
    relationships: {
      builtOn: ['rust'],
      ecosystemOf: ['rust', 'relational-database'],
      implements: ['sql', 'asynchronous-io'],
      parentOf: [],
    },
  },
  diesel: {
    slug: 'diesel',
    name: 'Diesel',
    category: 'DATABASE',
    description: 'Safe, extensible ORM and Query Builder for Rust.',
    aliases: ['diesel', 'diesel-rs', 'diesel_cli'],
    relationships: {
      builtOn: ['rust'],
      ecosystemOf: ['rust', 'relational-database'],
      implements: ['orm', 'sql'],
      parentOf: [],
    },
  },

  // ===========================================================================
  // 4. Cloud, DevOps & Infrastructure (CLOUD_DEVOPS)
  // ===========================================================================
  docker: {
    slug: 'docker',
    name: 'Docker',
    category: 'CLOUD_DEVOPS',
    description:
      'Set of platform as a service products that use OS-level virtualization to deliver software.',
    aliases: ['docker', 'docker-engine', 'moby', 'dockerfile', 'dockerd'],
    relationships: {
      builtOn: ['go'],
      ecosystemOf: ['containers'],
      implements: ['containerization'],
      parentOf: ['docker-compose'],
    },
  },
  'docker-compose': {
    slug: 'docker-compose',
    name: 'Docker Compose',
    category: 'CLOUD_DEVOPS',
    description: 'Tool for defining and running multi-container Docker applications.',
    aliases: ['docker-compose', 'compose', 'docker-compose-v2'],
    relationships: {
      builtOn: ['docker', 'go'],
      ecosystemOf: ['docker'],
      implements: ['container-orchestration'],
      parentOf: [],
    },
  },
  kubernetes: {
    slug: 'kubernetes',
    name: 'Kubernetes',
    category: 'CLOUD_DEVOPS',
    description:
      'Open-source system for automating deployment, scaling, and management of containerized apps.',
    aliases: ['kubernetes', 'k8s', 'kubectl', 'k8s-cluster', 'kubelet'],
    relationships: {
      builtOn: ['go'],
      ecosystemOf: ['cloud-native'],
      implements: ['container-orchestration', 'distributed-systems'],
      parentOf: [],
    },
  },
  terraform: {
    slug: 'terraform',
    name: 'Terraform',
    category: 'CLOUD_DEVOPS',
    description: 'Infrastructure as code software tool created by HashiCorp.',
    aliases: ['terraform', 'tf', 'hcl', 'terraform-cli'],
    relationships: {
      builtOn: ['go'],
      ecosystemOf: ['hashicorp'],
      implements: ['infrastructure-as-code'],
      parentOf: [],
    },
  },
  aws: {
    slug: 'aws',
    name: 'AWS',
    category: 'CLOUD_DEVOPS',
    description: 'Comprehensive, evolving cloud computing platform provided by Amazon.',
    aliases: [
      'aws',
      'amazon web services',
      'aws-sdk',
      '@aws-sdk/client-s3',
      'boto3',
      'aws-cli',
      'aws-cloud',
    ],
    relationships: {
      builtOn: [],
      ecosystemOf: ['cloud-computing'],
      implements: ['cloud-computing', 'serverless'],
      parentOf: [],
    },
  },
  gcp: {
    slug: 'gcp',
    name: 'Google Cloud Platform',
    category: 'CLOUD_DEVOPS',
    description:
      'Suite of cloud computing services that runs on the same infrastructure Google uses internally.',
    aliases: ['gcp', 'google cloud', 'google-cloud', 'google-cloud-platform', 'gcloud'],
    relationships: {
      builtOn: [],
      ecosystemOf: ['cloud-computing'],
      implements: ['cloud-computing'],
      parentOf: [],
    },
  },
  azure: {
    slug: 'azure',
    name: 'Microsoft Azure',
    category: 'CLOUD_DEVOPS',
    description: 'Cloud computing platform operated by Microsoft for application management.',
    aliases: ['azure', 'microsoft azure', 'ms-azure', 'azure-cloud'],
    relationships: {
      builtOn: [],
      ecosystemOf: ['cloud-computing'],
      implements: ['cloud-computing'],
      parentOf: [],
    },
  },
  'github-actions': {
    slug: 'github-actions',
    name: 'GitHub Actions',
    category: 'CLOUD_DEVOPS',
    description:
      'Continuous integration and continuous delivery (CI/CD) platform integrated into GitHub.',
    aliases: ['github-actions', 'gh-actions', 'gha', 'github-workflows'],
    relationships: {
      builtOn: [],
      ecosystemOf: ['github'],
      implements: ['ci-cd', 'automation'],
      parentOf: [],
    },
  },
  'gitlab-ci': {
    slug: 'gitlab-ci',
    name: 'GitLab CI',
    category: 'CLOUD_DEVOPS',
    description: 'Integrated continuous integration and delivery system provided by GitLab.',
    aliases: ['gitlab-ci', 'gitlab-ci-cd', 'gitlab-pipelines'],
    relationships: {
      builtOn: [],
      ecosystemOf: ['gitlab'],
      implements: ['ci-cd', 'automation'],
      parentOf: [],
    },
  },
  android: {
    slug: 'android',
    name: 'Android',
    category: 'CLOUD_DEVOPS',
    description: 'Mobile operating system based on a modified version of the Linux kernel.',
    aliases: ['android', 'android-os', 'android-sdk'],
    relationships: {
      builtOn: ['java', 'kotlin'],
      ecosystemOf: [],
      implements: [],
      parentOf: [],
    },
  },
  vercel: {
    slug: 'vercel',
    name: 'Vercel',
    category: 'CLOUD_DEVOPS',
    description: 'Cloud platform for static sites and Serverless Functions.',
    aliases: ['vercel', 'vercel-cloud'],
    relationships: {
      builtOn: [],
      ecosystemOf: ['cloud-computing'],
      implements: ['serverless'],
      parentOf: [],
    },
  },
  'google-cloud': {
    slug: 'google-cloud',
    name: 'Google Cloud Ecosystem',
    category: 'CLOUD_DEVOPS',
    description: 'Google cloud architecture and developer services ecosystem.',
    aliases: ['google-cloud-eco', 'gcp-ecosystem'],
    relationships: {
      builtOn: [],
      ecosystemOf: ['cloud-computing'],
      implements: [],
      parentOf: ['gcp'],
    },
  },
  github: {
    slug: 'github',
    name: 'GitHub',
    category: 'CLOUD_DEVOPS',
    description:
      'Developer platform that allows developers to create, store, manage and share their code.',
    aliases: ['github', 'github-platform'],
    relationships: {
      builtOn: [],
      ecosystemOf: [],
      implements: ['ci-cd'],
      parentOf: ['github-actions'],
    },
  },
  gitlab: {
    slug: 'gitlab',
    name: 'GitLab',
    category: 'CLOUD_DEVOPS',
    description: 'Web-based DevOps lifecycle tool that provides a Git-repository manager.',
    aliases: ['gitlab', 'gitlab-platform'],
    relationships: {
      builtOn: [],
      ecosystemOf: [],
      implements: ['ci-cd'],
      parentOf: ['gitlab-ci'],
    },
  },
  containers: {
    slug: 'containers',
    name: 'Container Infrastructure',
    category: 'CLOUD_DEVOPS',
    description:
      'Packages of software that contain all of the necessary elements to run in any environment.',
    aliases: ['containers', 'container-ecosystem'],
    relationships: {
      builtOn: [],
      ecosystemOf: [],
      implements: ['containerization'],
      parentOf: ['docker', 'kubernetes'],
    },
  },
  'cloud-native': {
    slug: 'cloud-native',
    name: 'Cloud Native Computing',
    category: 'CLOUD_DEVOPS',
    description:
      'Approach in software development that utilizes cloud computing to build and run scalable applications.',
    aliases: ['cloud-native', 'cncf'],
    relationships: {
      builtOn: [],
      ecosystemOf: ['cloud-computing'],
      implements: [],
      parentOf: ['kubernetes'],
    },
  },

  // ===========================================================================
  // 5. Developer Tools, Testing, Serialization & ML Utilities (TOOL)
  // ===========================================================================
  zod: {
    slug: 'zod',
    name: 'Zod',
    category: 'TOOL',
    description:
      'TypeScript-first schema declaration and validation library with static type inference.',
    aliases: ['zod', 'zod-schema'],
    relationships: {
      builtOn: ['typescript'],
      ecosystemOf: ['typescript'],
      implements: ['schema-validation', 'type-inference'],
      parentOf: [],
    },
  },
  pydantic: {
    slug: 'pydantic',
    name: 'Pydantic',
    category: 'TOOL',
    description: 'Data validation and settings management using Python type annotations.',
    aliases: ['pydantic', 'pydantic-v2'],
    relationships: {
      builtOn: ['python', 'rust'],
      ecosystemOf: ['python'],
      implements: ['schema-validation', 'type-inference'],
      parentOf: [],
    },
  },
  vitest: {
    slug: 'vitest',
    name: 'Vitest',
    category: 'TOOL',
    description: 'Next generation testing framework powered by Vite.',
    aliases: ['vitest', 'vite-test'],
    relationships: {
      builtOn: ['typescript', 'javascript'],
      ecosystemOf: ['vite'],
      implements: ['unit-testing', 'test-runner'],
      parentOf: [],
    },
  },
  jest: {
    slug: 'jest',
    name: 'Jest',
    category: 'TOOL',
    description: 'Delightful JavaScript testing framework with a focus on simplicity.',
    aliases: ['jest', 'jestjs', 'ts-jest'],
    relationships: {
      builtOn: ['javascript', 'node-js'],
      ecosystemOf: ['javascript'],
      implements: ['unit-testing', 'test-runner'],
      parentOf: [],
    },
  },
  pytest: {
    slug: 'pytest',
    name: 'Pytest',
    category: 'TOOL',
    description: 'Mature full-featured Python testing tool that helps you write better programs.',
    aliases: ['pytest', 'py-test', 'pytest-cov'],
    relationships: {
      builtOn: ['python'],
      ecosystemOf: ['python'],
      implements: ['unit-testing', 'test-runner'],
      parentOf: [],
    },
  },
  serde: {
    slug: 'serde',
    name: 'Serde',
    category: 'TOOL',
    description:
      'Generic framework for serializing and deserializing Rust data structures efficiently.',
    aliases: ['serde', 'serde_json', 'serde-derive'],
    relationships: {
      builtOn: ['rust'],
      ecosystemOf: ['rust'],
      implements: ['serialization', 'deserialization'],
      parentOf: [],
    },
  },
  pandas: {
    slug: 'pandas',
    name: 'Pandas',
    category: 'TOOL',
    description:
      'Fast, powerful, flexible and easy to use open source data analysis and manipulation tool.',
    aliases: ['pandas', 'pd'],
    relationships: {
      builtOn: ['python', 'c'],
      ecosystemOf: ['python'],
      implements: ['data-analysis', 'data-structures'],
      parentOf: [],
    },
  },
  numpy: {
    slug: 'numpy',
    name: 'NumPy',
    category: 'TOOL',
    description: 'Fundamental package for scientific computing with Python.',
    aliases: ['numpy', 'np'],
    relationships: {
      builtOn: ['python', 'c'],
      ecosystemOf: ['python'],
      implements: ['scientific-computing', 'linear-algebra'],
      parentOf: [],
    },
  },
  'scikit-learn': {
    slug: 'scikit-learn',
    name: 'Scikit-Learn',
    category: 'TOOL',
    description: 'Simple and efficient tools for predictive data analysis in Python.',
    aliases: ['scikit-learn', 'scikit_learn', 'sklearn'],
    relationships: {
      builtOn: ['python', 'numpy'],
      ecosystemOf: ['python'],
      implements: ['machine-learning', 'data-science'],
      parentOf: [],
    },
  },
  protobuf: {
    slug: 'protobuf',
    name: 'Protocol Buffers',
    category: 'TOOL',
    description: 'Google open-source data serialization format.',
    aliases: ['protobuf', 'protocol-buffers', 'proto3'],
    relationships: {
      builtOn: [],
      ecosystemOf: [],
      implements: ['serialization'],
      parentOf: [],
    },
  },
  'test-runner': {
    slug: 'test-runner',
    name: 'Test Runner',
    category: 'TOOL',
    description: 'Tool or library that executes tests and reports results.',
    aliases: ['test-runner', 'test-framework'],
    relationships: {
      builtOn: [],
      ecosystemOf: [],
      implements: [],
      parentOf: ['vitest', 'jest', 'pytest'],
    },
  },
  v8: {
    slug: 'v8',
    name: 'V8 JavaScript Engine',
    category: 'TOOL',
    description:
      'Open-source high-performance JavaScript and WebAssembly engine developed by Google.',
    aliases: ['v8', 'v8-engine'],
    relationships: {
      builtOn: ['cpp'],
      ecosystemOf: [],
      implements: [],
      parentOf: [],
    },
  },
  jvm: {
    slug: 'jvm',
    name: 'Java Virtual Machine',
    category: 'TOOL',
    description: 'Virtual machine that enables a computer to run Java programs.',
    aliases: ['jvm', 'java-virtual-machine'],
    relationships: {
      builtOn: [],
      ecosystemOf: [],
      implements: [],
      parentOf: [],
    },
  },
  vite: {
    slug: 'vite',
    name: 'Vite',
    category: 'TOOL',
    description: 'Frontend tooling that provides a faster and leaner development experience.',
    aliases: ['vite', 'vitejs'],
    relationships: {
      builtOn: ['javascript', 'node-js'],
      ecosystemOf: ['web-platform'],
      implements: [],
      parentOf: ['vitest'],
    },
  },
  hashicorp: {
    slug: 'hashicorp',
    name: 'HashiCorp Ecosystem',
    category: 'TOOL',
    description: 'Suite of tools for automation of infrastructure on any cloud.',
    aliases: ['hashicorp', 'hashicorp-tools'],
    relationships: {
      builtOn: [],
      ecosystemOf: [],
      implements: ['infrastructure-as-code'],
      parentOf: ['terraform'],
    },
  },
  mcp: {
    slug: 'mcp',
    name: 'Model Context Protocol',
    category: 'TOOL',
    description:
      'Open standard protocol for secure, contextual connectivity between AI models and external tools.',
    aliases: [
      'mcp',
      'model-context-protocol',
      'modelcontextprotocol',
      '@modelcontextprotocol/server',
      '@modelcontextprotocol/core',
      '@modelcontextprotocol/sdk',
    ],
    relationships: {
      builtOn: ['node-js', 'typescript'],
      ecosystemOf: [],
      implements: ['agent-tooling', 'json-rpc'],
      parentOf: [],
    },
  },
  gemini: {
    slug: 'gemini',
    name: 'Google Gemini',
    category: 'TOOL',
    description: "Google's family of multimodal generative AI models and GenAI SDKs.",
    aliases: [
      'gemini',
      'google-gemini',
      'gemini-ai',
      'google-genai',
      '@google/genai',
      '@google/generative-ai',
    ],
    relationships: {
      builtOn: [],
      ecosystemOf: ['google-cloud'],
      implements: ['large-language-models', 'generative-ai'],
      parentOf: [],
    },
  },

  // ===========================================================================
  // 6. Architecture & System Paradigms (ARCHITECTURE)
  // ===========================================================================
  microservices: {
    slug: 'microservices',
    name: 'Microservices',
    category: 'ARCHITECTURE',
    description: 'Architectural style that structures an application as a collection of services.',
    aliases: ['microservices', 'microservice-architecture', 'micro-services'],
    relationships: {
      builtOn: [],
      ecosystemOf: [],
      implements: ['distributed-systems'],
      parentOf: [],
    },
  },
  'event-driven-architecture': {
    slug: 'event-driven-architecture',
    name: 'Event-Driven Architecture',
    category: 'ARCHITECTURE',
    description:
      'Software architecture paradigm promoting the production, detection, and consumption of events.',
    aliases: ['event-driven-architecture', 'eda', 'event-driven', 'event-sourcing'],
    relationships: {
      builtOn: [],
      ecosystemOf: [],
      implements: ['asynchronous-architecture'],
      parentOf: [],
    },
  },
  'rest-api': {
    slug: 'rest-api',
    name: 'RESTful API',
    category: 'ARCHITECTURE',
    description:
      'Representational State Transfer architectural style for distributed hypermedia systems.',
    aliases: ['rest-api', 'rest', 'restful', 'restful-api', 'rest-services'],
    relationships: {
      builtOn: [],
      ecosystemOf: ['http'],
      implements: ['api-architecture'],
      parentOf: [],
    },
  },
  'relational-database': {
    slug: 'relational-database',
    name: 'Relational Database',
    category: 'ARCHITECTURE',
    description: 'Database based on the relational model of data organizing into tables.',
    aliases: ['relational-database', 'rdbms', 'relational-db'],
    relationships: {
      builtOn: [],
      ecosystemOf: ['database'],
      implements: ['acid-compliance'],
      parentOf: ['postgresql', 'mysql', 'sqlite'],
    },
  },
  'component-architecture': {
    slug: 'component-architecture',
    name: 'Component Architecture',
    category: 'ARCHITECTURE',
    description:
      'Modular UI design where interfaces are broken down into independent, reusable components.',
    aliases: ['component-architecture', 'component-based-ui'],
    relationships: {
      builtOn: [],
      ecosystemOf: [],
      implements: [],
      parentOf: [],
    },
  },
  'server-side-rendering': {
    slug: 'server-side-rendering',
    name: 'Server-Side Rendering',
    category: 'ARCHITECTURE',
    description: 'Technique for rendering client-side single-page applications on the server.',
    aliases: ['server-side-rendering', 'ssr'],
    relationships: {
      builtOn: [],
      ecosystemOf: [],
      implements: [],
      parentOf: [],
    },
  },
  'static-site-generation': {
    slug: 'static-site-generation',
    name: 'Static Site Generation',
    category: 'ARCHITECTURE',
    description: 'Compiling and rendering a website or app at build time.',
    aliases: ['static-site-generation', 'ssg'],
    relationships: {
      builtOn: [],
      ecosystemOf: [],
      implements: [],
      parentOf: [],
    },
  },
  'model-view-controller': {
    slug: 'model-view-controller',
    name: 'Model-View-Controller',
    category: 'ARCHITECTURE',
    description: 'Software architectural pattern commonly used for developing user interfaces.',
    aliases: ['model-view-controller', 'mvc'],
    relationships: {
      builtOn: [],
      ecosystemOf: [],
      implements: [],
      parentOf: [],
    },
  },
  rpc: {
    slug: 'rpc',
    name: 'Remote Procedure Call',
    category: 'ARCHITECTURE',
    description: 'Communication protocol for requesting a service from another computer.',
    aliases: ['rpc', 'remote-procedure-call'],
    relationships: {
      builtOn: [],
      ecosystemOf: [],
      implements: ['api-architecture'],
      parentOf: ['grpc'],
    },
  },
  'dependency-injection': {
    slug: 'dependency-injection',
    name: 'Dependency Injection',
    category: 'ARCHITECTURE',
    description:
      'Software design pattern implementing Inversion of Control for resolving dependencies.',
    aliases: ['dependency-injection', 'ioc', 'inversion-of-control'],
    relationships: {
      builtOn: [],
      ecosystemOf: [],
      implements: [],
      parentOf: [],
    },
  },
  'nosql-database': {
    slug: 'nosql-database',
    name: 'NoSQL Database',
    category: 'ARCHITECTURE',
    description:
      'Database providing mechanism for storage and retrieval of data modeled non-relationally.',
    aliases: ['nosql-database', 'nosql'],
    relationships: {
      builtOn: [],
      ecosystemOf: ['database'],
      implements: [],
      parentOf: ['mongodb', 'redis'],
    },
  },
  'document-database': {
    slug: 'document-database',
    name: 'Document Database',
    category: 'ARCHITECTURE',
    description:
      'Type of nonrelational database designed to store and query data as JSON-like documents.',
    aliases: ['document-database', 'document-store'],
    relationships: {
      builtOn: [],
      ecosystemOf: [],
      implements: ['nosql-database'],
      parentOf: ['mongodb'],
    },
  },
  'in-memory-database': {
    slug: 'in-memory-database',
    name: 'In-Memory Database',
    category: 'ARCHITECTURE',
    description: 'Database management system that relies on main memory for computer data storage.',
    aliases: ['in-memory-database', 'in-memory-db'],
    relationships: {
      builtOn: [],
      ecosystemOf: [],
      implements: ['nosql-database'],
      parentOf: ['redis'],
    },
  },
  'embedded-database': {
    slug: 'embedded-database',
    name: 'Embedded Database',
    category: 'ARCHITECTURE',
    description: 'Database management system tightly integrated with an application software.',
    aliases: ['embedded-database', 'embedded-db'],
    relationships: {
      builtOn: [],
      ecosystemOf: [],
      implements: [],
      parentOf: ['sqlite'],
    },
  },
  'pub-sub': {
    slug: 'pub-sub',
    name: 'Publish-Subscribe',
    category: 'ARCHITECTURE',
    description: 'Messaging pattern where senders do not program messages directly to receivers.',
    aliases: ['pub-sub', 'publish-subscribe'],
    relationships: {
      builtOn: [],
      ecosystemOf: [],
      implements: ['event-driven-architecture'],
      parentOf: [],
    },
  },
  containerization: {
    slug: 'containerization',
    name: 'Containerization',
    category: 'ARCHITECTURE',
    description:
      'OS-level virtualization method for deploying and running distributed applications.',
    aliases: ['containerization', 'containers-tech'],
    relationships: {
      builtOn: [],
      ecosystemOf: [],
      implements: [],
      parentOf: ['docker'],
    },
  },
  'container-orchestration': {
    slug: 'container-orchestration',
    name: 'Container Orchestration',
    category: 'ARCHITECTURE',
    description: 'Automating the operational effort required to run containerized workloads.',
    aliases: ['container-orchestration', 'orchestration'],
    relationships: {
      builtOn: [],
      ecosystemOf: [],
      implements: [],
      parentOf: ['kubernetes', 'docker-compose'],
    },
  },
  'infrastructure-as-code': {
    slug: 'infrastructure-as-code',
    name: 'Infrastructure as Code',
    category: 'ARCHITECTURE',
    description:
      'Managing and provisioning computer data centers through machine-readable definition files.',
    aliases: ['infrastructure-as-code', 'iac'],
    relationships: {
      builtOn: [],
      ecosystemOf: [],
      implements: [],
      parentOf: ['terraform'],
    },
  },
  'cloud-computing': {
    slug: 'cloud-computing',
    name: 'Cloud Computing',
    category: 'ARCHITECTURE',
    description: 'On-demand availability of computer system resources and cloud infrastructure.',
    aliases: ['cloud-computing', 'cloud-infrastructure'],
    relationships: {
      builtOn: [],
      ecosystemOf: [],
      implements: [],
      parentOf: ['aws', 'gcp', 'azure'],
    },
  },
  serverless: {
    slug: 'serverless',
    name: 'Serverless Computing',
    category: 'ARCHITECTURE',
    description:
      'Cloud computing execution model where provider dynamically manages machine resources.',
    aliases: ['serverless', 'faas'],
    relationships: {
      builtOn: [],
      ecosystemOf: ['cloud-computing'],
      implements: ['cloud-computing'],
      parentOf: [],
    },
  },
  'ci-cd': {
    slug: 'ci-cd',
    name: 'CI/CD',
    category: 'ARCHITECTURE',
    description: 'Combined practices of continuous integration and continuous delivery.',
    aliases: ['ci-cd', 'cicd', 'continuous-integration', 'continuous-delivery'],
    relationships: {
      builtOn: [],
      ecosystemOf: [],
      implements: [],
      parentOf: ['github-actions', 'gitlab-ci'],
    },
  },
  'distributed-systems': {
    slug: 'distributed-systems',
    name: 'Distributed Systems',
    category: 'ARCHITECTURE',
    description: 'System whose components are located on different networked computers.',
    aliases: ['distributed-systems', 'distributed-computing'],
    relationships: {
      builtOn: [],
      ecosystemOf: [],
      implements: [],
      parentOf: ['microservices'],
    },
  },
  'asynchronous-architecture': {
    slug: 'asynchronous-architecture',
    name: 'Asynchronous Architecture',
    category: 'ARCHITECTURE',
    description: 'Architecture that decouples execution threads to handle concurrent workloads.',
    aliases: ['asynchronous-architecture', 'async-arch'],
    relationships: {
      builtOn: [],
      ecosystemOf: [],
      implements: [],
      parentOf: ['event-driven-architecture'],
    },
  },
  'api-architecture': {
    slug: 'api-architecture',
    name: 'API Architecture',
    category: 'ARCHITECTURE',
    description: 'Design and architectural patterns for application programming interfaces.',
    aliases: ['api-architecture', 'api-design'],
    relationships: {
      builtOn: [],
      ecosystemOf: [],
      implements: [],
      parentOf: ['rest-api', 'graphql', 'grpc'],
    },
  },
  'http-services': {
    slug: 'http-services',
    name: 'HTTP Services',
    category: 'ARCHITECTURE',
    description: 'Web services and servers operating over HTTP/HTTPS protocols.',
    aliases: ['http-services', 'http-server'],
    relationships: {
      builtOn: [],
      ecosystemOf: ['http'],
      implements: ['api-architecture'],
      parentOf: [],
    },
  },
  database: {
    slug: 'database',
    name: 'Database Management',
    category: 'ARCHITECTURE',
    description: 'Organized collection of data or a data management system.',
    aliases: ['database', 'databases', 'data-store'],
    relationships: {
      builtOn: [],
      ecosystemOf: [],
      implements: [],
      parentOf: ['relational-database', 'nosql-database'],
    },
  },

  // ===========================================================================
  // 7. Foundational Concepts & Security Standards (CONCEPT)
  // ===========================================================================
  graphql: {
    slug: 'graphql',
    name: 'GraphQL',
    category: 'CONCEPT',
    description: 'Query language for APIs and runtime for fulfilling queries with existing data.',
    aliases: ['graphql', 'gql', 'apollo-graphql'],
    relationships: {
      builtOn: [],
      ecosystemOf: ['web-platform'],
      implements: ['api-architecture'],
      parentOf: [],
    },
  },
  oauth: {
    slug: 'oauth',
    name: 'OAuth 2.0',
    category: 'CONCEPT',
    description: 'Open standard for access delegation commonly used for Internet authorization.',
    aliases: ['oauth', 'oauth2', 'oauth-2-0', 'oauth2.1', 'pkce'],
    relationships: {
      builtOn: [],
      ecosystemOf: ['security'],
      implements: ['authorization', 'identity-federation'],
      parentOf: [],
    },
  },
  'application-security': {
    slug: 'application-security',
    name: 'Application Security',
    category: 'CONCEPT',
    description:
      'Discipline of making software applications more secure against threats and attacks.',
    aliases: ['application-security', 'appsec', 'security', 'infosec', 'cybersecurity'],
    relationships: {
      builtOn: [],
      ecosystemOf: ['security'],
      implements: [],
      parentOf: ['oauth'],
    },
  },
  sql: {
    slug: 'sql',
    name: 'SQL',
    category: 'CONCEPT',
    description:
      'Domain-specific language used in programming and designed for managing data in RDBMS.',
    aliases: ['sql', 'structured-query-language', 'ansi-sql'],
    relationships: {
      builtOn: [],
      ecosystemOf: ['database'],
      implements: ['relational-database'],
      parentOf: ['postgresql', 'mysql', 'sqlite'],
    },
  },
  'static-typing': {
    slug: 'static-typing',
    name: 'Static Typing',
    category: 'CONCEPT',
    description: 'Type checking performed at compile-time rather than run-time.',
    aliases: ['static-typing', 'statically-typed'],
    relationships: {
      builtOn: [],
      ecosystemOf: [],
      implements: [],
      parentOf: [],
    },
  },
  'dynamic-typing': {
    slug: 'dynamic-typing',
    name: 'Dynamic Typing',
    category: 'CONCEPT',
    description: 'Type checking performed at runtime.',
    aliases: ['dynamic-typing', 'dynamically-typed'],
    relationships: {
      builtOn: [],
      ecosystemOf: [],
      implements: [],
      parentOf: [],
    },
  },
  'object-oriented-programming': {
    slug: 'object-oriented-programming',
    name: 'Object-Oriented Programming',
    category: 'CONCEPT',
    description: 'Programming paradigm based on concept of objects containing data and code.',
    aliases: ['object-oriented-programming', 'oop'],
    relationships: {
      builtOn: [],
      ecosystemOf: [],
      implements: [],
      parentOf: [],
    },
  },
  'functional-programming': {
    slug: 'functional-programming',
    name: 'Functional Programming',
    category: 'CONCEPT',
    description: 'Programming paradigm where programs are constructed by composing pure functions.',
    aliases: ['functional-programming', 'fp'],
    relationships: {
      builtOn: [],
      ecosystemOf: [],
      implements: [],
      parentOf: [],
    },
  },
  concurrency: {
    slug: 'concurrency',
    name: 'Concurrency',
    category: 'CONCEPT',
    description: 'Ability of different parts or units of a program to be executed out-of-order.',
    aliases: ['concurrency', 'multithreading', 'async-concurrency'],
    relationships: {
      builtOn: [],
      ecosystemOf: [],
      implements: [],
      parentOf: [],
    },
  },
  'memory-safety': {
    slug: 'memory-safety',
    name: 'Memory Safety',
    category: 'CONCEPT',
    description: 'State of software protected from memory access bugs and vulnerabilities.',
    aliases: ['memory-safety', 'memory-safe'],
    relationships: {
      builtOn: [],
      ecosystemOf: [],
      implements: [],
      parentOf: [],
    },
  },
  'systems-programming': {
    slug: 'systems-programming',
    name: 'Systems Programming',
    category: 'CONCEPT',
    description: 'Activity of programming computer system software.',
    aliases: ['systems-programming', 'systems-dev'],
    relationships: {
      builtOn: [],
      ecosystemOf: [],
      implements: [],
      parentOf: [],
    },
  },
  'compiled-language': {
    slug: 'compiled-language',
    name: 'Compiled Language',
    category: 'CONCEPT',
    description: 'Programming language whose implementations are typically compilers.',
    aliases: ['compiled-language', 'native-compilation'],
    relationships: {
      builtOn: [],
      ecosystemOf: [],
      implements: [],
      parentOf: [],
    },
  },
  'asynchronous-io': {
    slug: 'asynchronous-io',
    name: 'Asynchronous I/O',
    category: 'CONCEPT',
    description:
      'Form of input/output processing permitting other processing to continue before finish.',
    aliases: ['asynchronous-io', 'async-io', 'non-blocking-io'],
    relationships: {
      builtOn: [],
      ecosystemOf: [],
      implements: [],
      parentOf: [],
    },
  },
  'reactive-programming': {
    slug: 'reactive-programming',
    name: 'Reactive Programming',
    category: 'CONCEPT',
    description:
      'Declarative programming paradigm concerned with data streams and change propagation.',
    aliases: ['reactive-programming', 'reactive'],
    relationships: {
      builtOn: [],
      ecosystemOf: [],
      implements: [],
      parentOf: [],
    },
  },
  'responsive-design': {
    slug: 'responsive-design',
    name: 'Responsive Web Design',
    category: 'CONCEPT',
    description: 'Approach to web design making web pages render well on a variety of devices.',
    aliases: ['responsive-design', 'responsive-ui'],
    relationships: {
      builtOn: [],
      ecosystemOf: [],
      implements: [],
      parentOf: [],
    },
  },
  openapi: {
    slug: 'openapi',
    name: 'OpenAPI / Swagger',
    category: 'CONCEPT',
    description: 'Specification for machine-readable interface files for describing REST APIs.',
    aliases: ['openapi', 'swagger', 'openapi-spec'],
    relationships: {
      builtOn: [],
      ecosystemOf: [],
      implements: ['api-architecture'],
      parentOf: [],
    },
  },
  'deep-learning': {
    slug: 'deep-learning',
    name: 'Deep Learning',
    category: 'CONCEPT',
    description: 'Family of machine learning methods based on artificial neural networks.',
    aliases: ['deep-learning', 'dl'],
    relationships: {
      builtOn: [],
      ecosystemOf: [],
      implements: ['machine-learning'],
      parentOf: [],
    },
  },
  'neural-networks': {
    slug: 'neural-networks',
    name: 'Neural Networks',
    category: 'CONCEPT',
    description: 'Computing systems inspired by biological neural networks.',
    aliases: ['neural-networks', 'ann', 'deep-neural-networks'],
    relationships: {
      builtOn: [],
      ecosystemOf: [],
      implements: ['deep-learning'],
      parentOf: [],
    },
  },
  'gpu-acceleration': {
    slug: 'gpu-acceleration',
    name: 'GPU Acceleration',
    category: 'CONCEPT',
    description: 'Use of a GPU together with CPU to accelerate computing applications.',
    aliases: ['gpu-acceleration', 'cuda', 'gpu-computing'],
    relationships: {
      builtOn: [],
      ecosystemOf: [],
      implements: [],
      parentOf: [],
    },
  },
  'machine-learning': {
    slug: 'machine-learning',
    name: 'Machine Learning',
    category: 'CONCEPT',
    description:
      'Algorithms and models that computer systems use to perform tasks without explicit instructions.',
    aliases: ['machine-learning', 'ml'],
    relationships: {
      builtOn: [],
      ecosystemOf: [],
      implements: [],
      parentOf: ['deep-learning'],
    },
  },
  'acid-compliance': {
    slug: 'acid-compliance',
    name: 'ACID Compliance',
    category: 'CONCEPT',
    description:
      'Properties of database transactions intended to guarantee validity despite errors.',
    aliases: ['acid-compliance', 'acid-transactions', 'acid'],
    relationships: {
      builtOn: [],
      ecosystemOf: [],
      implements: [],
      parentOf: [],
    },
  },
  orm: {
    slug: 'orm',
    name: 'Object-Relational Mapping',
    category: 'CONCEPT',
    description:
      'Converting data between incompatible type systems using object-oriented languages.',
    aliases: ['orm', 'object-relational-mapping'],
    relationships: {
      builtOn: [],
      ecosystemOf: [],
      implements: [],
      parentOf: ['drizzle-orm', 'prisma', 'typeorm', 'sqlalchemy', 'gorm', 'diesel'],
    },
  },
  caching: {
    slug: 'caching',
    name: 'Caching',
    category: 'CONCEPT',
    description: 'Storing data so that future requests can be served faster.',
    aliases: ['caching', 'cache', 'cache-management'],
    relationships: {
      builtOn: [],
      ecosystemOf: [],
      implements: [],
      parentOf: [],
    },
  },
  'type-safety': {
    slug: 'type-safety',
    name: 'Type Safety',
    category: 'CONCEPT',
    description: 'Extent to which a language prevents type errors.',
    aliases: ['type-safety', 'type-safe'],
    relationships: {
      builtOn: [],
      ecosystemOf: [],
      implements: [],
      parentOf: [],
    },
  },
  'database-migrations': {
    slug: 'database-migrations',
    name: 'Database Migrations',
    category: 'CONCEPT',
    description: 'Management of incremental, reversible changes to database schemas.',
    aliases: ['database-migrations', 'schema-migrations'],
    relationships: {
      builtOn: [],
      ecosystemOf: [],
      implements: [],
      parentOf: [],
    },
  },
  automation: {
    slug: 'automation',
    name: 'Automation',
    category: 'CONCEPT',
    description: 'Technologies to produce and deliver services with minimal human intervention.',
    aliases: ['automation', 'workflow-automation'],
    relationships: {
      builtOn: [],
      ecosystemOf: [],
      implements: [],
      parentOf: [],
    },
  },
  'schema-validation': {
    slug: 'schema-validation',
    name: 'Schema Validation',
    category: 'CONCEPT',
    description:
      'Validating structured data against formal schema definitions at runtime boundaries.',
    aliases: ['schema-validation', 'runtime-validation'],
    relationships: {
      builtOn: [],
      ecosystemOf: [],
      implements: [],
      parentOf: ['zod', 'pydantic'],
    },
  },
  'type-inference': {
    slug: 'type-inference',
    name: 'Type Inference',
    category: 'CONCEPT',
    description: 'Automatic detection of the data type of an expression in a programming language.',
    aliases: ['type-inference', 'inferred-types'],
    relationships: {
      builtOn: [],
      ecosystemOf: [],
      implements: [],
      parentOf: [],
    },
  },
  'unit-testing': {
    slug: 'unit-testing',
    name: 'Unit Testing',
    category: 'CONCEPT',
    description: 'Software testing method by which individual units of source code are tested.',
    aliases: ['unit-testing', 'unit-tests'],
    relationships: {
      builtOn: [],
      ecosystemOf: [],
      implements: [],
      parentOf: [],
    },
  },
  serialization: {
    slug: 'serialization',
    name: 'Serialization',
    category: 'CONCEPT',
    description: 'Translating data structures into a format that can be stored or transmitted.',
    aliases: ['serialization', 'marshalling'],
    relationships: {
      builtOn: [],
      ecosystemOf: [],
      implements: [],
      parentOf: ['serde'],
    },
  },
  deserialization: {
    slug: 'deserialization',
    name: 'Deserialization',
    category: 'CONCEPT',
    description: 'Extracting data structures from a series of bytes.',
    aliases: ['deserialization', 'unmarshalling'],
    relationships: {
      builtOn: [],
      ecosystemOf: [],
      implements: [],
      parentOf: [],
    },
  },
  'data-analysis': {
    slug: 'data-analysis',
    name: 'Data Analysis',
    category: 'CONCEPT',
    description:
      'Inspecting, cleansing, transforming, and modeling data to discover useful information.',
    aliases: ['data-analysis', 'data-analytics'],
    relationships: {
      builtOn: [],
      ecosystemOf: [],
      implements: [],
      parentOf: ['pandas'],
    },
  },
  'data-structures': {
    slug: 'data-structures',
    name: 'Data Structures',
    category: 'CONCEPT',
    description: 'Data organization, management, and storage format that enables efficient access.',
    aliases: ['data-structures', 'dsa'],
    relationships: {
      builtOn: [],
      ecosystemOf: [],
      implements: [],
      parentOf: [],
    },
  },
  'scientific-computing': {
    slug: 'scientific-computing',
    name: 'Scientific Computing',
    category: 'CONCEPT',
    description: 'Developing numerical methods to solve scientific problems.',
    aliases: ['scientific-computing', 'numerical-computing'],
    relationships: {
      builtOn: [],
      ecosystemOf: [],
      implements: [],
      parentOf: ['numpy'],
    },
  },
  'linear-algebra': {
    slug: 'linear-algebra',
    name: 'Linear Algebra',
    category: 'CONCEPT',
    description: 'Branch of mathematics concerning linear equations and matrices.',
    aliases: ['linear-algebra', 'matrix-math'],
    relationships: {
      builtOn: [],
      ecosystemOf: [],
      implements: [],
      parentOf: [],
    },
  },
  'data-science': {
    slug: 'data-science',
    name: 'Data Science',
    category: 'CONCEPT',
    description:
      'Interdisciplinary field extracting knowledge from structured and unstructured data.',
    aliases: ['data-science', 'ds'],
    relationships: {
      builtOn: [],
      ecosystemOf: [],
      implements: [],
      parentOf: ['scikit-learn'],
    },
  },
  authorization: {
    slug: 'authorization',
    name: 'Authorization',
    category: 'CONCEPT',
    description: 'Function of specifying access rights/privileges to resources.',
    aliases: ['authorization', 'authz', 'rbac', 'abac'],
    relationships: {
      builtOn: [],
      ecosystemOf: ['security'],
      implements: ['application-security'],
      parentOf: ['oauth'],
    },
  },
  'identity-federation': {
    slug: 'identity-federation',
    name: 'Identity Federation',
    category: 'CONCEPT',
    description: 'Linking a person identity across multiple identity management systems.',
    aliases: ['identity-federation', 'federated-identity', 'sso'],
    relationships: {
      builtOn: [],
      ecosystemOf: [],
      implements: ['authorization'],
      parentOf: [],
    },
  },
  cybersecurity: {
    slug: 'cybersecurity',
    name: 'Cybersecurity',
    category: 'CONCEPT',
    description: 'Practice of protecting systems, networks, and programs from digital attacks.',
    aliases: ['cybersecurity', 'info-security'],
    relationships: {
      builtOn: [],
      ecosystemOf: [],
      implements: [],
      parentOf: ['application-security'],
    },
  },
  'web-platform': {
    slug: 'web-platform',
    name: 'Web Platform',
    category: 'CONCEPT',
    description: 'Collection of technologies and standards that make up the World Wide Web.',
    aliases: ['web-platform', 'web-standards'],
    relationships: {
      builtOn: [],
      ecosystemOf: [],
      implements: [],
      parentOf: [],
    },
  },
  http: {
    slug: 'http',
    name: 'HTTP / HTTPS Protocols',
    category: 'CONCEPT',
    description:
      'Hypertext Transfer Protocol is an application layer protocol for data transmission.',
    aliases: ['http', 'https', 'http2', 'http3'],
    relationships: {
      builtOn: [],
      ecosystemOf: ['web-platform'],
      implements: [],
      parentOf: [],
    },
  },
  security: {
    slug: 'security',
    name: 'Information Security',
    category: 'CONCEPT',
    description: 'Practice of protecting information by mitigating information risks.',
    aliases: ['security-domain', 'infosec-domain'],
    relationships: {
      builtOn: [],
      ecosystemOf: [],
      implements: [],
      parentOf: ['application-security', 'oauth'],
    },
  },
  'agent-tooling': {
    slug: 'agent-tooling',
    name: 'AI Agent Tooling',
    category: 'CONCEPT',
    description:
      'Tool integration, function calling, and structured protocol interfaces for autonomous AI agents.',
    aliases: ['agent-tooling', 'ai-agent-tools', 'function-calling', 'agent-tools'],
    relationships: {
      builtOn: [],
      ecosystemOf: [],
      implements: [],
      parentOf: ['mcp'],
    },
  },
  'json-rpc': {
    slug: 'json-rpc',
    name: 'JSON-RPC Protocol',
    category: 'CONCEPT',
    description: 'Remote procedure call protocol encoded in JSON.',
    aliases: ['json-rpc', 'json-rpc-2.0', 'jsonrpc'],
    relationships: {
      builtOn: [],
      ecosystemOf: [],
      implements: ['rpc'],
      parentOf: [],
    },
  },
  'large-language-models': {
    slug: 'large-language-models',
    name: 'Large Language Models',
    category: 'CONCEPT',
    description:
      'Advanced deep learning models trained on vast amounts of text data for language processing.',
    aliases: ['large-language-models', 'llm', 'llms', 'large-language-model'],
    relationships: {
      builtOn: [],
      ecosystemOf: [],
      implements: ['deep-learning', 'machine-learning'],
      parentOf: [],
    },
  },
  'generative-ai': {
    slug: 'generative-ai',
    name: 'Generative AI',
    category: 'CONCEPT',
    description:
      'Artificial intelligence techniques capable of generating text, images, or other media.',
    aliases: ['generative-ai', 'gen-ai', 'generative-artificial-intelligence'],
    relationships: {
      builtOn: [],
      ecosystemOf: [],
      implements: ['machine-learning'],
      parentOf: ['large-language-models'],
    },
  },
});

/**
 * Compiled In-Memory Lookup Tables ($O(1)$).
 * Initialized using Object.create(null) to completely prevent prototype pollution.
 */
const CANONICAL_INDEX = Object.create(null);
const ALIAS_INDEX = Object.create(null);
const RELATIONSHIPS_INDEX = Object.create(null);

for (const [slug, skill] of Object.entries(CANONICAL_SKILLS)) {
  CANONICAL_INDEX[slug] = skill;
  RELATIONSHIPS_INDEX[slug] = skill.relationships;

  // Index the canonical slug itself
  ALIAS_INDEX[slug] = skill;

  // Index canonical display name
  const normalizedName = skill.name.toLowerCase().replace(/[^a-z0-9]/g, '');
  ALIAS_INDEX[normalizedName] = skill;

  // Index all configured aliases
  for (const alias of skill.aliases) {
    const cleanAlias = alias.trim().toLowerCase();
    ALIAS_INDEX[cleanAlias] = skill;

    // If alias contains a git/repo path, index stripped forms
    const strippedGit = cleanAlias.replace(/^(?:https?:\/\/)?(?:www\.)?github\.com\//i, '');
    if (strippedGit !== cleanAlias) {
      ALIAS_INDEX[strippedGit] = skill;
      const lastSeg = strippedGit.split('/').pop();
      if (lastSeg && !ALIAS_INDEX[lastSeg]) {
        ALIAS_INDEX[lastSeg] = skill;
      }
    }

    // Also index alphanumeric-only form for hyphen/dot invariance
    const alphaOnly = cleanAlias.replace(/[^a-z0-9]/g, '');
    if (alphaOnly && !ALIAS_INDEX[alphaOnly]) {
      ALIAS_INDEX[alphaOnly] = skill;
    }
  }
}

/**
 * Provider-Neutral Skill Normalizer & Taxonomy Engine.
 */
export class SkillTaxonomyEngine {
  /**
   * Normalizes an arbitrary raw technology name, package identifier, or keyword to canonical taxonomy metadata.
   *
   * @param {string} rawInput - Raw input string (max 100 characters).
   * @param {object} [options={}] - Normalization options.
   * @param {string} [options.categoryHint='TOOL'] - Fallback category if unmapped.
   * @param {string} [options.context=''] - Surrounding text context for disambiguation.
   * @param {object} [options.llmAdapter=null] - Optional LLM disambiguation adapter.
   * @param {string} [options.requestId=null] - Request ID for telemetry.
   * @returns {object} Structured canonical normalization result.
   */
  static normalizeSkill(rawInput, options = {}) {
    const { categoryHint = 'TOOL', context = '', requestId = null } = options;

    // Stage 1: Input Bounds & Sanitization
    if (!rawInput || typeof rawInput !== 'string') {
      return SkillTaxonomyEngine.buildUnknownResult('unknown-tool', categoryHint);
    }

    const bounded = rawInput.slice(0, MAX_SKILL_INPUT_LENGTH).trim();
    if (bounded.length === 0) {
      return SkillTaxonomyEngine.buildUnknownResult('unknown-tool', categoryHint);
    }

    // eslint-disable-next-line no-control-regex
    const sanitized = bounded.replace(/[\u0000-\u001F\u007F]/g, '');

    // Stage 2: Unicode NFKC & Case-Folding
    const normalized = sanitized.normalize('NFKC').toLowerCase();

    // Stage 3: Disambiguation for Ambiguous / Context-Sensitive Terms
    if (SkillTaxonomyEngine.isAmbiguousProseWord(normalized, context)) {
      return null;
    }

    const disambiguated = SkillTaxonomyEngine.disambiguateWithContext(normalized, context);
    if (disambiguated) {
      return SkillTaxonomyEngine.buildKnownResult(
        disambiguated.skill,
        disambiguated.confidence,
        normalized
      );
    }

    // Stage 4: Direct Unstripped Alias Match
    if (ALIAS_INDEX[normalized]) {
      const skill = ALIAS_INDEX[normalized];
      const isExactCanonical = CANONICAL_INDEX[normalized] !== undefined;
      return SkillTaxonomyEngine.buildKnownResult(skill, isExactCanonical ? 1.0 : 0.95, normalized);
    }

    // Stage 5: Scope, Prefix & Suffix Stripping
    const cleaned = normalized
      .replace(/^(?:https?:\/\/)?(?:www\.)?github\.com\//i, '')
      .replace(/^google\.golang\.org\//i, '')
      .replace(/\s*\(v[0-9.]+\)/i, '')
      .trim();

    // Stage 5a: Direct Canonical Slug Match
    if (CANONICAL_INDEX[cleaned]) {
      const skill = CANONICAL_INDEX[cleaned];
      return SkillTaxonomyEngine.buildKnownResult(skill, 1.0, cleaned);
    }

    // Stage 5b: Direct Alias Index Lookup
    if (ALIAS_INDEX[cleaned]) {
      const skill = ALIAS_INDEX[cleaned];
      return SkillTaxonomyEngine.buildKnownResult(skill, 0.95, cleaned);
    }

    // Stage 5c: Stripped npm scope match (@scope/pkg -> pkg)
    if (cleaned.startsWith('@') && cleaned.includes('/')) {
      const barePackage = cleaned.split('/')[1];
      if (ALIAS_INDEX[barePackage]) {
        const skill = ALIAS_INDEX[barePackage];
        return SkillTaxonomyEngine.buildKnownResult(skill, 0.95, cleaned);
      }
    }

    // Stage 5d: Alphanumeric-only fallback (handles dots, spaces, dashes)
    const alphaOnly = cleaned.replace(/[^a-z0-9]/g, '');
    if (alphaOnly && ALIAS_INDEX[alphaOnly]) {
      const skill = ALIAS_INDEX[alphaOnly];
      return SkillTaxonomyEngine.buildKnownResult(skill, 0.9, cleaned);
    }

    // Stage 6: Unknown Technology Handling
    const safeSlug = SkillTaxonomyEngine.generateSafeSlug(cleaned);
    const parsedCategory = SKILL_CATEGORIES.includes(categoryHint) ? categoryHint : 'TOOL';

    // Telemetry: Log unknown term observation safely
    logger.info({
      operation: 'taxonomy.unknown_term_observed',
      term: safeSlug,
      category: parsedCategory,
      requiresReview: true,
      requestId,
      msg: `Observed uncataloged technical term '${safeSlug}'`,
    });

    return {
      canonicalSlug: safeSlug,
      canonicalName: SkillTaxonomyEngine.formatDisplayName(safeSlug),
      category: parsedCategory,
      normalizationConfidence: 0.5,
      matchedAlias: null,
      isKnown: false,
      isCustom: true,
      requiresReview: true,
      relationships: {
        builtOn: [],
        ecosystemOf: [],
        implements: [],
        parentOf: [],
      },
    };
  }

  /**
   * Disambiguates short, collision-prone terms using surrounding context.
   *
   * @param {string} token - Normalized input token.
   * @param {string} context - Surrounding text.
   * @returns {{ skill: object, confidence: number } | null}
   */
  static disambiguateWithContext(token, context = '') {
    const lowerContext = context.toLowerCase();

    // 1. "Go" Disambiguation
    if (token === 'go') {
      if (lowerContext.length > 0) {
        const hasTechContext =
          /\b(?:programming|developer|language|backend|golang|code|engineer|tech|stack|service|framework|api|sdk|runtime|go\.mod|\.go)\b/i.test(
            lowerContext
          );
        if (hasTechContext) {
          return { skill: CANONICAL_SKILLS.go, confidence: 0.85 };
        }
      }
    }

    // 2. "Spring" Disambiguation
    if (token === 'spring') {
      if (lowerContext.length > 0) {
        const hasTechContext =
          /\b(?:boot|framework|java|beans|@springframework|backend|microservice|mvc|data|security|cloud)\b/i.test(
            lowerContext
          );
        if (hasTechContext) {
          return { skill: CANONICAL_SKILLS.spring, confidence: 0.85 };
        }
      }
    }

    // 3. "Rust" Disambiguation
    if (token === 'rust') {
      if (lowerContext.length > 0) {
        const hasTechContext =
          /\b(?:programming|developer|language|cargo|tokio|memory|systems|actix|axum|\.rs|compiled|crate)\b/i.test(
            lowerContext
          );
        if (hasTechContext) {
          return { skill: CANONICAL_SKILLS.rust, confidence: 0.85 };
        }
      }
    }

    return null;
  }

  /**
   * Checks whether the token represents ambiguous prose that should NOT be treated as a tech skill.
   *
   * @param {string} token - Normalized token.
   * @param {string} context - Surrounding text.
   * @returns {boolean}
   */
  static isAmbiguousProseWord(token, context = '') {
    if (!context) return false;
    const lowerContext = context.toLowerCase();
    if (token === 'go') {
      if (
        /\b(?:go\s+to|go\s+for|go\s+home|go\s+away|let's\s+go|go\s+back|go\s+out)\b/i.test(
          lowerContext
        )
      ) {
        return true;
      }
    }
    if (token === 'spring') {
      if (
        /\b(?:spring\s+season|spring\s+summer|spring\s+break|spring\s+weather|in\s+the\s+spring)\b/i.test(
          lowerContext
        )
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Formats a kebab-case slug into Title Case display name.
   *
   * @param {string} slug - Safe slug.
   * @returns {string} Formatted name.
   */
  static formatDisplayName(slug) {
    if (!slug) return 'Unknown Tool';
    return slug
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  /**
   * Generates a safe, sanitized kebab-case slug satisfying SafeSlugSchema.
   *
   * @param {string} input - Raw input.
   * @returns {string} Safe slug.
   */
  static generateSafeSlug(input) {
    const raw = input
      .toLowerCase()
      .replace(/^@[a-z0-9_-]+\//, '')
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 50);

    const candidate = raw || 'unknown-tool';
    const validation = SafeSlugSchema.safeParse(candidate);
    return validation.success ? candidate : 'unknown-tool';
  }

  /**
   * Classifies a skill name or slug into one of the comprehensive domain categories:
   * CORE_LANGUAGE, FRAMEWORK, DATABASE, PROTOCOL, PLATFORM, CLOUD, AI_ML, TOOL, LIBRARY,
   * UI_COMPONENT, UTILITY_PACKAGE, DEV_HELPER, BUILT_IN_MODULE, DEPENDENCY_SIGNAL, ARCHITECTURE, CONCEPT, OTHER
   *
   * @param {string} rawNameOrSlug
   * @param {string} [fallbackCategory='TOOL']
   * @returns {'CORE_LANGUAGE' | 'FRAMEWORK' | 'DATABASE' | 'PROTOCOL' | 'PLATFORM' | 'CLOUD' | 'AI_ML' | 'TOOL' | 'LIBRARY' | 'UI_COMPONENT' | 'UTILITY_PACKAGE' | 'DEV_HELPER' | 'BUILT_IN_MODULE' | 'DEPENDENCY_SIGNAL' | 'ARCHITECTURE' | 'CONCEPT' | 'OTHER'}
   */
  static classifyCategory(rawNameOrSlug, fallbackCategory = 'TOOL') {
    if (!rawNameOrSlug || typeof rawNameOrSlug !== 'string') return 'OTHER';
    const rawClean = rawNameOrSlug.toLowerCase().trim();
    const unbracketed = rawClean.replace(/^@[a-z0-9_-]+\//, '');
    const slug = unbracketed
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    const words = unbracketed
      .replace(/[^a-z0-9]/g, ' ')
      .trim()
      .split(/\s+/);

    // 1. Built-in runtime standard library modules (e.g. node:dns, node:perf_hooks, Node Dns)
    if (
      rawClean.startsWith('node:') ||
      rawClean.startsWith('python:') ||
      [
        'node-dns',
        'node-perf-hooks',
        'node-fs',
        'node-path',
        'node-crypto',
        'node-stream',
        'node-child-process',
        'node-util',
        'node-os',
        'node-net',
        'node-tls',
        'node-http',
        'node-https',
        'node-zlib',
        'node-events',
        'node-buffer',
        'node-url',
      ].includes(slug) ||
      (words[0] === 'node' &&
        words.length > 1 &&
        [
          'dns',
          'perf',
          'perf_hooks',
          'fs',
          'path',
          'crypto',
          'stream',
          'child_process',
          'util',
          'os',
          'net',
          'tls',
          'http',
          'https',
          'zlib',
          'events',
          'buffer',
          'url',
        ].includes(words[1]))
    ) {
      return 'BUILT_IN_MODULE';
    }

    // 2. DevTools, Linters, Plugins, Helpers, Loaders, Presets, Middleware
    if (
      slug.endsWith('-devtools') ||
      slug.endsWith('-plugin') ||
      slug.endsWith('-config') ||
      slug.endsWith('-preset') ||
      slug.endsWith('-loader') ||
      slug.endsWith('-middleware') ||
      slug.endsWith('-types') ||
      slug.startsWith('eslint-') ||
      slug.startsWith('prettier-') ||
      slug.startsWith('babel-') ||
      slug.startsWith('postcss-') ||
      slug.startsWith('stylelint-') ||
      slug.startsWith('types-') ||
      ['nodemon', 'ts-node', 'ts-node-dev', 'supertest'].includes(slug) ||
      slug.includes('devtools')
    ) {
      return 'DEV_HELPER';
    }

    // 3. UI Components, Design System Primitives, Theme Providers, Icons
    if (
      rawClean.startsWith('@radix-ui/') ||
      rawClean.startsWith('@shadcn/') ||
      rawClean.startsWith('@headlessui/') ||
      rawClean.startsWith('@chakra-ui/') ||
      rawClean.startsWith('@material-ui/') ||
      rawClean.startsWith('@mui/') ||
      [
        'react-avatar',
        'react-dialog',
        'react-dropdown-menu',
        'react-progress',
        'react-select',
        'react-slot',
        'react-tabs',
        'react-accordion',
        'react-alert-dialog',
        'react-checkbox',
        'react-day-picker',
        'react-hot-toast',
        'react-icons',
        'react-label',
        'react-navigation-menu',
        'react-popover',
        'react-scroll-area',
        'react-separator',
        'react-switch',
        'react-table',
        'react-toast',
        'react-tooltip',
        'react-dropzone',
        'react-feather',
        'react-spinners',
        'react-modal',
        'react-slider',
        'lucide-react',
        'next-themes',
        'cmdk',
        'class-variance-authority',
        'cva',
      ].includes(slug) ||
      (words[0] === 'react' &&
        words.length > 1 &&
        !['native', 'dom', 'core', 'query'].includes(words[1]))
    ) {
      return 'UI_COMPONENT';
    }

    // 4. Utility Packages, Middleware, Helpers
    const KNOWN_UTILITIES = new Set([
      'dotenv',
      'python-dotenv',
      'cors',
      'cookie-parser',
      'cookie',
      'cookies',
      'morgan',
      'compression',
      'helmet',
      'clsx',
      'tailwind-merge',
      'date-fns',
      'pydantic-settings',
      'python-multipart',
      'multipart',
      'python-jose',
      'body-parser',
      'multer',
      'bcryptjs',
      'bcrypt',
      'jsonwebtoken',
      'jwt',
      'crypto-js',
      'node-crypto',
      'email-validator',
      'validator',
      'express-rate-limit',
      'rate-limiter-flexible',
      'resolvers',
      'parser',
      'dayjs',
      'moment',
      'luxon',
      'uuid',
      'nanoid',
      'swr',
      'react-hook-form',
      'hookform',
    ]);
    if (
      KNOWN_UTILITIES.has(slug) ||
      (words[0] === 'python' &&
        words.length > 1 &&
        !['django', 'fastapi', 'flask', 'pytorch'].includes(words[1]))
    ) {
      return 'UTILITY_PACKAGE';
    }

    // 5. Check Exact Known Canonical Skills in CANONICAL_INDEX
    const canonical =
      CANONICAL_INDEX[slug] ||
      ALIAS_INDEX[slug] ||
      ALIAS_INDEX[unbracketed] ||
      ALIAS_INDEX[rawClean];
    if (canonical) {
      if (canonical.slug === 'react-query') return 'LIBRARY';
      if (canonical.slug === 'docker-compose') return 'TOOL';
      if (canonical.category === 'LANGUAGE') {
        if (['node-js', 'v8', 'jvm'].includes(canonical.slug)) return 'PLATFORM';
        return 'CORE_LANGUAGE';
      }
      if (canonical.category === 'FRAMEWORK') return 'FRAMEWORK';
      if (canonical.category === 'DATABASE') return 'DATABASE';
      if (canonical.category === 'CLOUD_DEVOPS') return 'CLOUD';
      if (['mcp', 'grpc', 'rest-api', 'rpc'].includes(canonical.slug)) return 'PROTOCOL';
      if (
        ['gemini', 'pytorch', 'tensorflow', 'scikit-learn', 'pandas', 'numpy'].includes(
          canonical.slug
        )
      ) {
        return 'AI_ML';
      }
      if (['vitest', 'jest', 'pytest', 'test-runner', 'vite', 'git'].includes(canonical.slug)) {
        return 'TOOL';
      }
      if (['zod', 'pydantic', 'serde'].includes(canonical.slug)) return 'LIBRARY';
      if (canonical.category === 'ARCHITECTURE') return 'ARCHITECTURE';
      if (canonical.category === 'CONCEPT') return 'CONCEPT';
    }

    // 6. Known Domain Libraries (e.g. Three.js, React Query, Zustand, Redux, Axios, Lodash)
    const KNOWN_LIBRARIES = new Set([
      'three',
      'three-js',
      'drei',
      'postprocessing',
      'zod',
      'pydantic',
      'axios',
      'socket-io',
      'socket-io-client',
      'redux',
      'zustand',
      'mobx',
      'framer-motion',
      'lodash',
      'ramda',
      'rxjs',
      'immutable',
      'styled-components',
      'emotion',
      'cheerio',
      'puppeteer',
      'playwright-core',
      'react-query',
      'tanstack-query',
    ]);
    if (KNOWN_LIBRARIES.has(slug)) {
      return 'LIBRARY';
    }

    // 7. Explicit Infrastructure Tools & Orchestration
    if (slug === 'docker-compose') {
      return 'TOOL';
    }

    // 8. Strict Exact Term Patterns for Core Categories (NO loose substring matching!)
    // Exact Language Matches
    if (
      /^(?:typescript|javascript|python|go|golang|rust|java|kotlin|swift|ruby|php|scala|sql|html|css|c|cpp|csharp|c-sharp|shell|bash)$/i.test(
        slug
      )
    ) {
      return 'CORE_LANGUAGE';
    }
    // Exact Framework Matches
    if (
      /^(?:fastify|express|express-js|next|next-js|react|react-native|vue|vue-js|angular|svelte|nestjs|django|fastapi|flask|spring|spring-boot|gin|fiber|actix|axum|tailwind|tailwindcss)$/i.test(
        slug
      )
    ) {
      return 'FRAMEWORK';
    }
    // Exact Database Matches
    if (
      /^(?:postgres|postgresql|mysql|sqlite|mongodb|redis|kafka|drizzle|drizzle-orm|prisma|typeorm|cassandra|dynamodb|elasticsearch|couchdb)$/i.test(
        slug
      )
    ) {
      return 'DATABASE';
    }
    // Exact Protocol Matches
    if (
      /^(?:mcp|model-context-protocol|graphql|grpc|rest|restful-api|rest-api|websocket|websockets|json-rpc|oauth|oauth-2-1|oidc)$/i.test(
        slug
      )
    ) {
      return 'PROTOCOL';
    }
    // Exact Platform Matches
    if (/^(?:node|nodejs|node-js|deno|bun|linux|v8|jvm)$/i.test(slug)) {
      return 'PLATFORM';
    }
    // Exact Cloud / Infrastructure Matches
    if (
      /^(?:docker|kubernetes|k8s|terraform|aws|gcp|azure|github-actions|gitlab-ci|vercel|nginx)$/i.test(
        slug
      )
    ) {
      return 'CLOUD';
    }
    // Exact AI / ML Matches
    if (
      /^(?:gemini|google-gemini|openai|claude|anthropic|langchain|llamaindex|pytorch|tensorflow|keras|scikit-learn|pandas|numpy)$/i.test(
        slug
      )
    ) {
      return 'AI_ML';
    }
    // Exact Major Tool Matches
    if (
      /^(?:git|vitest|jest|pytest|cypress|playwright|webpack|vite|rollup|esbuild|postman|insomnia)$/i.test(
        slug
      )
    ) {
      return 'TOOL';
    }

    if (fallbackCategory === 'LANGUAGE') return 'CORE_LANGUAGE';
    if (fallbackCategory === 'CLOUD_DEVOPS') return 'CLOUD';
    return fallbackCategory || 'TOOL';
  }

  /**
   * Classifies a skill into its presentation and confidence tier:
   * - PRIMARY: Core career-defining skills (Languages, Frameworks, Databases, Protocols, Cloud, Platforms, AI/ML, Major Tools)
   * - SIGNAL: Technology/Implementation signals (Utility libraries, UI components, middleware, dev helpers, submodules)
   *
   * @param {string} rawNameOrSlug
   * @param {string} [category]
   * @returns {'PRIMARY' | 'SIGNAL'}
   */
  static classifyTier(rawNameOrSlug, category) {
    const fineCategory = SkillTaxonomyEngine.classifyCategory(rawNameOrSlug, category);

    // All supporting/implementation categories are strictly SIGNAL
    if (
      [
        'LIBRARY',
        'UI_COMPONENT',
        'UTILITY_PACKAGE',
        'DEV_HELPER',
        'BUILT_IN_MODULE',
        'DEPENDENCY_SIGNAL',
        'CONCEPT',
        'ARCHITECTURE',
        'OTHER',
      ].includes(fineCategory)
    ) {
      return 'SIGNAL';
    }

    // Core career categories
    if (
      ['CORE_LANGUAGE', 'FRAMEWORK', 'DATABASE', 'PROTOCOL', 'PLATFORM', 'CLOUD', 'AI_ML'].includes(
        fineCategory
      )
    ) {
      // docker-compose specifically is SIGNAL tier (Docker is PRIMARY)
      const slug = (rawNameOrSlug || '')
        .toLowerCase()
        .trim()
        .replace(/^@[a-z0-9_-]+\//, '')
        .replace(/[^a-z0-9-]/g, '-');
      if (slug === 'docker-compose') {
        return 'SIGNAL';
      }
      return 'PRIMARY';
    }

    if (fineCategory === 'TOOL') {
      const slug = (rawNameOrSlug || '')
        .toLowerCase()
        .trim()
        .replace(/^@[a-z0-9_-]+\//, '')
        .replace(/[^a-z0-9-]/g, '-');
      const MAJOR_PRIMARY_TOOLS = new Set([
        'git',
        'vitest',
        'jest',
        'pytest',
        'cypress',
        'playwright',
        'webpack',
        'vite',
        'postman',
        'insomnia',
      ]);
      if (MAJOR_PRIMARY_TOOLS.has(slug)) {
        return 'PRIMARY';
      }
      return 'SIGNAL';
    }

    return 'SIGNAL';
  }

  /**
   * Returns deterministic priority rank for primary skills sorting:
   * 1. Languages
   * 2. Backend frameworks
   * 3. Frontend frameworks
   * 4. Databases
   * 5. Protocols
   * 6. Platforms
   * 7. Cloud
   * 8. AI/ML
   * 9. Major engineering tools
   *
   * @param {object} skill
   * @returns {number} Integer ranking (1-10)
   */
  static getPrimarySkillRank(skill) {
    const cat = skill.fineCategory || skill.category;
    const slug = (skill.slug || skill.name || '').toLowerCase().replace(/[^a-z0-9-]/g, '-');

    if (cat === 'CORE_LANGUAGE' || cat === 'LANGUAGE') return 1;
    if (cat === 'FRAMEWORK') {
      const BACKEND_FRAMEWORK_SLUGS = new Set([
        'fastify',
        'express',
        'express-js',
        'nestjs',
        'django',
        'fastapi',
        'flask',
        'spring',
        'spring-boot',
        'gin',
        'fiber',
        'actix',
        'axum',
      ]);
      if (BACKEND_FRAMEWORK_SLUGS.has(slug)) return 2;
      return 3; // Frontend frameworks (React, Next.js, Vue, Angular, etc.)
    }
    if (cat === 'DATABASE') return 4;
    if (cat === 'PROTOCOL') return 5;
    if (cat === 'PLATFORM') return 6;
    if (cat === 'CLOUD') return 7;
    if (cat === 'AI_ML') return 8;
    if (cat === 'TOOL') return 9;
    return 10;
  }

  /**
   * Assembles a structured result for a known canonical skill.
   */
  static buildKnownResult(skill, confidence, matchedAlias) {
    const fineCategory = SkillTaxonomyEngine.classifyCategory(skill.slug, skill.category);
    const tier = SkillTaxonomyEngine.classifyTier(skill.slug, fineCategory);
    return {
      canonicalSlug: skill.slug,
      canonicalName: skill.name,
      category: skill.category,
      fineCategory,
      tier,
      normalizationConfidence: confidence,
      matchedAlias,
      isKnown: true,
      isCustom: false,
      requiresReview: false,
      relationships: {
        builtOn: [...(skill.relationships.builtOn || [])],
        ecosystemOf: [...(skill.relationships.ecosystemOf || [])],
        implements: [...(skill.relationships.implements || [])],
        parentOf: [...(skill.relationships.parentOf || [])],
      },
    };
  }

  /**
   * Assembles a fallback result for an invalid or empty input.
   */
  static buildUnknownResult(fallbackSlug, categoryHint) {
    const validCat = SKILL_CATEGORIES.includes(categoryHint) ? categoryHint : 'TOOL';
    const fineCategory = SkillTaxonomyEngine.classifyCategory(fallbackSlug, validCat);
    const tier = SkillTaxonomyEngine.classifyTier(fallbackSlug, fineCategory);
    return {
      canonicalSlug: fallbackSlug,
      canonicalName: SkillTaxonomyEngine.formatDisplayName(fallbackSlug),
      category: validCat,
      fineCategory,
      tier,
      normalizationConfidence: 0.0,
      matchedAlias: null,
      isKnown: false,
      isCustom: true,
      requiresReview: true,
      relationships: {
        builtOn: [],
        ecosystemOf: [],
        implements: [],
        parentOf: [],
      },
    };
  }

  /**
   * Resolves canonical skill metadata by exact canonical slug.
   *
   * @param {string} slug - Canonical slug.
   * @returns {object | null} Canonical skill object or null.
   */
  static resolveCanonicalSkill(slug) {
    if (!slug || typeof slug !== 'string') return null;
    const cleanSlug = slug.trim().toLowerCase();
    const skill = CANONICAL_INDEX[cleanSlug];
    if (!skill) return null;
    return { ...skill, relationships: { ...skill.relationships } };
  }

  /**
   * Returns metadata and description for a canonical slug.
   */
  static getSkillMetadata(slug) {
    return SkillTaxonomyEngine.resolveCanonicalSkill(slug);
  }

  /**
   * Returns all registered aliases for a canonical slug.
   */
  static getAliases(slug) {
    const skill = SkillTaxonomyEngine.resolveCanonicalSkill(slug);
    return skill ? [...skill.aliases] : [];
  }

  /**
   * Returns relationship graph edges for a canonical slug.
   */
  static getRelationships(slug) {
    const skill = SkillTaxonomyEngine.resolveCanonicalSkill(slug);
    return skill ? { ...skill.relationships } : null;
  }

  /**
   * Checks if a slug is a known canonical skill.
   */
  static isKnownSkill(slug) {
    return SkillTaxonomyEngine.resolveCanonicalSkill(slug) !== null;
  }

  /**
   * Returns the entire precompiled alias catalog for backward-compatible ingestion.
   */
  static getAliasCatalog() {
    return Object.freeze({ ...ALIAS_INDEX });
  }

  /**
   * Validates the entire taxonomy graph at startup or test time.
   * Asserts that all relationship targets exist in CANONICAL_SKILLS and no dangling edges exist.
   *
   * @returns {{ isValid: boolean, totalSkills: number, totalAliases: number, totalRelationships: number }}
   */
  static validateTaxonomyGraph() {
    const totalSkills = Object.keys(CANONICAL_SKILLS).length;
    let totalAliases = 0;
    let totalRelationships = 0;

    for (const [slug, skill] of Object.entries(CANONICAL_SKILLS)) {
      // 1. Slug format assertion
      const slugValidation = SafeSlugSchema.safeParse(slug);
      if (!slugValidation.success) {
        throw new Error(`Canonical skill '${slug}' has invalid slug format`);
      }

      // 2. Category assertion
      if (!SKILL_CATEGORIES.includes(skill.category)) {
        throw new Error(`Canonical skill '${slug}' has invalid category '${skill.category}'`);
      }

      totalAliases += skill.aliases.length;

      // 3. Relationships validation (No dangling edges)
      const relTypes = ['builtOn', 'ecosystemOf', 'implements', 'parentOf'];
      for (const relType of relTypes) {
        const targets = skill.relationships[relType] || [];
        for (const targetSlug of targets) {
          totalRelationships++;
          // Target must exist in CANONICAL_SKILLS or be an approved abstraction
          if (!CANONICAL_SKILLS[targetSlug]) {
            throw new Error(
              `Dangling relationship edge: '${slug}' -> ${relType} -> '${targetSlug}' (target does not exist in taxonomy)`
            );
          }
        }
      }
    }

    return {
      isValid: true,
      totalSkills,
      totalAliases,
      totalRelationships,
    };
  }
}

/**
 * Top-level convenience exports for provider-neutral consumers.
 */
export const normalizeSkill = SkillTaxonomyEngine.normalizeSkill;
export const resolveCanonicalSkill = SkillTaxonomyEngine.resolveCanonicalSkill;
export const getSkillMetadata = SkillTaxonomyEngine.getSkillMetadata;
export const getAliases = SkillTaxonomyEngine.getAliases;
export const getRelationships = SkillTaxonomyEngine.getRelationships;
export const isKnownSkill = SkillTaxonomyEngine.isKnownSkill;
export const validateTaxonomyGraph = SkillTaxonomyEngine.validateTaxonomyGraph;
export const classifyCategory = SkillTaxonomyEngine.classifyCategory;
export const classifyTier = SkillTaxonomyEngine.classifyTier;
export const getPrimarySkillRank = SkillTaxonomyEngine.getPrimarySkillRank;
