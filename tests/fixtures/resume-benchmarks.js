/**
 * @file Resume Benchmarks & Regression Fixture Corpus
 *
 * Defines realistic test fixtures for:
 * 1. Backend Engineer — early career
 * 2. Full-Stack Engineer — early career
 * 3. Frontend Engineer — early career
 * 4. Backend Engineer — mid-level
 * 5. Data Engineer
 * 6. ML Engineer
 * 7. Critical Regression Fixture reproducing the failure mode of redundant/shallow bullets
 *    with unused high-value candidate evidence.
 */

export const benchmarkBackendEarlyCareer = Object.freeze({
  id: 'cand-backend-early',
  name: 'Alex Rivera',
  email: 'alex.rivera@example-dev.org',
  phone: '+1 (555) 234-5678',
  location: 'Seattle, WA',
  website: 'https://alexrivera.dev',
  github: 'https://github.com/alexrivera-dev',
  linkedin: 'https://linkedin.com/in/alexrivera-swe',
  skills: [
    'Go', 'Python', 'Node.js', 'PostgreSQL', 'Redis', 'Docker', 'Kubernetes',
    'gRPC', 'RESTful APIs', 'Git', 'Linux', 'Microservices'
  ],
  education: [
    {
      institution: 'University of Washington',
      degree: 'Bachelor of Science in Computer Science',
      graduationDate: '2023-06',
      gpa: '3.82',
    },
  ],
  experience: [
    {
      id: 'exp-1',
      company: 'CloudScale Systems',
      title: 'Associate Backend Engineer',
      startDate: '2023-07',
      endDate: '2024-08',
      isCurrent: true,
      location: 'Seattle, WA',
      bullets: [
        'Implemented asynchronous message processing queues using Redis Streams, handling 15,000 events/sec.',
        'Refactored legacy REST microservices into Go-based gRPC services, decreasing p99 latency from 180ms to 35ms.',
        'Automated Docker image builds and vulnerability scans in GitHub Actions CI pipelines.',
      ],
      technologies: ['Go', 'Redis', 'Docker', 'gRPC', 'PostgreSQL'],
    },
  ],
  projects: [
    {
      id: 'proj-dist-kv',
      name: 'Distributed Key-Value Store',
      displayName: 'Distributed Key-Value Store',
      repositoryUrl: 'https://github.com/alexrivera-dev/distributed-kv',
      technologies: ['Go', 'Raft', 'gRPC', 'Docker'],
      bullets: [
        'Architected a distributed key-value database in Go using the Raft consensus algorithm for leader election and log replication.',
        'Implemented write-ahead logging (WAL) and memory-mapped SSTables to guarantee durable point-in-time state recovery.',
        'Benchmarked consensus performance under network partition scenarios using Chaos Mesh and Docker Compose.',
      ],
      highlights: [
        'Supports consistent snapshotting and log compaction.',
      ],
    },
    {
      id: 'proj-rate-limiter',
      name: 'Token-Bucket Rate Limiter Gateway',
      displayName: 'Token-Bucket Rate Limiter Gateway',
      repositoryUrl: 'https://github.com/alexrivera-dev/token-bucket-gateway',
      technologies: ['Go', 'Redis', 'HTTP/2'],
      bullets: [
        'Built an edge reverse proxy implementing distributed token-bucket rate limiting via atomic Redis Lua scripts.',
        'Integrated Prometheus metrics middleware tracking request error rates and per-client quota consumption.',
      ],
    },
  ],
  dsa: {
    hasSection: true,
    profileUrl: 'https://leetcode.com/u/alexrivera_dev',
    bullets: [
      'Solved 350+ algorithmic challenges focusing on graph traversal, dynamic programming, and concurrency primitives.',
    ],
  },
});

export const benchmarkFullStackEarlyCareer = Object.freeze({
  id: 'cand-fullstack-early',
  name: 'Maya Chen',
  email: 'maya.chen@example-dev.org',
  phone: '+1 (555) 345-6789',
  location: 'San Francisco, CA',
  github: 'https://github.com/mayachen-dev',
  linkedin: 'https://linkedin.com/in/mayachen-dev',
  skills: [
    'TypeScript', 'React', 'Next.js', 'Node.js', 'Express.js', 'PostgreSQL',
    'Prisma ORM', 'Tailwind CSS', 'Docker', 'GraphQL', 'Jest'
  ],
  education: [
    {
      institution: 'UC Berkeley',
      degree: 'B.A. in Computer Science',
      graduationDate: '2023-05',
    },
  ],
  experience: [
    {
      id: 'exp-fullstack',
      company: 'Veloce Labs',
      title: 'Full Stack Software Engineer Intern',
      startDate: '2022-06',
      endDate: '2022-09',
      isCurrent: false,
      location: 'San Francisco, CA',
      bullets: [
        'Built dynamic customer billing dashboard in React and Tailwind CSS with real-time Stripe webhook integrations.',
        'Engineered PostgreSQL database migrations and schema definitions with Prisma ORM.',
      ],
      technologies: ['React', 'TypeScript', 'Prisma ORM', 'PostgreSQL'],
    },
  ],
  projects: [
    {
      id: 'proj-collab-docs',
      name: 'Real-Time Collaborative Editor',
      displayName: 'Real-Time Collaborative Editor',
      repositoryUrl: 'https://github.com/mayachen-dev/collab-editor',
      liveUrl: 'https://collab-editor.mayachen.dev',
      technologies: ['TypeScript', 'Next.js', 'WebSockets', 'PostgreSQL'],
      bullets: [
        'Engineered a real-time multiplayer markdown editor utilizing Conflict-free Replicated Data Types (CRDTs) over WebSockets.',
        'Implemented server-side document rendering and session caching via Next.js and Redis.',
      ],
    },
  ],
  dsa: {
    hasSection: true,
    profileUrl: 'https://leetcode.com/u/mayachen_algo',
  },
});

export const benchmarkFrontendEarlyCareer = Object.freeze({
  id: 'cand-frontend-early',
  name: 'Liam Vance',
  email: 'liam.vance@example-dev.org',
  phone: '+1 (555) 456-7890',
  location: 'New York, NY',
  github: 'https://github.com/liamvance-dev',
  linkedin: 'https://linkedin.com/in/liamvance-ui',
  skills: [
    'JavaScript', 'TypeScript', 'React', 'Redux Toolkit', 'Tailwind CSS',
    'HTML5', 'CSS3', 'WebSockets', 'Vite', 'Vitest'
  ],
  education: [
    {
      institution: 'New York University',
      degree: 'B.S. in Information Systems',
      graduationDate: '2024-01',
    },
  ],
  experience: [],
  projects: [
    {
      id: 'proj-trading-ui',
      name: 'Crypto Analytics Dashboard',
      displayName: 'Crypto Analytics Dashboard',
      repositoryUrl: 'https://github.com/liamvance-dev/crypto-analytics-ui',
      liveUrl: 'https://crypto-ui.liamvance.dev',
      technologies: ['React', 'TypeScript', 'Tailwind CSS', 'WebSockets', 'Redux Toolkit'],
      bullets: [
        'Designed high-throughput candlestick chart visualizations rendering 60 FPS live orderbook updates via WebSockets.',
        'Optimized client-side memory footprint using virtualized windowed lists and memoized selectors in Redux Toolkit.',
      ],
    },
  ],
});

export const benchmarkBackendMidLevel = Object.freeze({
  id: 'cand-backend-mid',
  name: 'Marcus Brody',
  email: 'marcus.brody@example-dev.org',
  phone: '+1 (555) 567-8901',
  location: 'Austin, TX',
  github: 'https://github.com/mbrody-eng',
  linkedin: 'https://linkedin.com/in/marcusbrody',
  skills: [
    'Rust', 'Go', 'Python', 'Kafka', 'PostgreSQL', 'Docker', 'Kubernetes',
    'Terraform', 'AWS', 'gRPC', 'Distributed Systems'
  ],
  education: [
    {
      institution: 'UT Austin',
      degree: 'B.S. in Electrical and Computer Engineering',
      graduationDate: '2020-05',
    },
  ],
  experience: [
    {
      id: 'exp-mid-1',
      company: 'Datastream Inc.',
      title: 'Senior Backend Engineer',
      startDate: '2022-03',
      endDate: '2024-09',
      isCurrent: true,
      location: 'Austin, TX',
      bullets: [
        'Architected real-time event pipeline consuming 2M msgs/sec from Kafka clusters into partitioned TimescaleDB tables.',
        'Spearheaded Kubernetes cluster autoscaling policies, reducing monthly EC2 infrastructure spend by 22%.',
        'Implemented zero-downtime database failover automation with Raft-orchestrated control plane.',
      ],
      technologies: ['Go', 'Kafka', 'Kubernetes', 'PostgreSQL', 'AWS'],
    },
    {
      id: 'exp-mid-2',
      company: 'Apex Networks',
      title: 'Software Engineer',
      startDate: '2020-06',
      endDate: '2022-02',
      isCurrent: false,
      location: 'Austin, TX',
      bullets: [
        'Engineered network telemetry collectors in Rust with zero heap-allocations during packet parsing hot paths.',
        'Maintained automated CI test matrices across Linux kernel versions.',
      ],
      technologies: ['Rust', 'Linux', 'Docker'],
    },
  ],
  projects: [
    {
      id: 'proj-raft-engine',
      name: 'High-Throughput Raft Log Engine',
      displayName: 'High-Throughput Raft Log Engine',
      repositoryUrl: 'https://github.com/mbrody-eng/raft-storage-engine',
      technologies: ['Rust', 'Linux', 'gRPC'],
      bullets: [
        'Engineered a deterministic Raft log store in Rust utilizing io_uring for sub-millisecond asynchronous disk writes.',
        'Validated state machine safety across simulated crash faults with Jepsen test suites.',
      ],
    },
  ],
});

export const benchmarkDataEngineer = Object.freeze({
  id: 'cand-data-eng',
  name: 'Sara Patel',
  email: 'sara.patel@example-dev.org',
  phone: '+1 (555) 678-9012',
  location: 'Chicago, IL',
  github: 'https://github.com/sarapatel-data',
  skills: [
    'Python', 'SQL', 'Apache Spark', 'Airflow', 'Snowflake', 'dbt',
    'PostgreSQL', 'Docker', 'AWS', 'ETL'
  ],
  education: [
    {
      institution: 'University of Illinois Urbana-Champaign',
      degree: 'B.S. in Computer Engineering',
      graduationDate: '2022-05',
    },
  ],
  experience: [
    {
      id: 'exp-data',
      company: 'Logix Analytics',
      title: 'Data Engineer',
      startDate: '2022-06',
      endDate: '2024-09',
      isCurrent: true,
      location: 'Chicago, IL',
      bullets: [
        'Built automated DAGs in Apache Airflow executing daily transformation workflows across 500GB of financial records.',
        'Optimized Snowflake query execution costs by 30% through cluster clustering keys and materialized views.',
      ],
      technologies: ['Python', 'SQL', 'Airflow', 'Snowflake'],
    },
  ],
  projects: [
    {
      id: 'proj-clickstream-etl',
      name: 'Clickstream Event Lakehouse',
      displayName: 'Clickstream Event Lakehouse',
      repositoryUrl: 'https://github.com/sarapatel-data/clickstream-lakehouse',
      technologies: ['Python', 'Apache Spark', 'AWS', 'dbt'],
      bullets: [
        'Engineered scalable PySpark streaming jobs ingesting raw JSON telemetry into Delta Lake tables.',
        'Integrated automated dbt test assertions validating schema correctness and deduplicating customer sessions.',
      ],
    },
  ],
});

export const benchmarkMlEngineer = Object.freeze({
  id: 'cand-ml-eng',
  name: 'David Kim',
  email: 'david.kim@example-dev.org',
  phone: '+1 (555) 789-0123',
  location: 'Boston, MA',
  github: 'https://github.com/davidkim-ml',
  skills: [
    'Python', 'PyTorch', 'HuggingFace', 'FastAPI', 'Docker', 'Redis',
    'PostgreSQL', 'Linux', 'Vector Search'
  ],
  education: [
    {
      institution: 'MIT',
      degree: 'B.S. in Computer Science and Engineering',
      graduationDate: '2023-05',
    },
  ],
  experience: [
    {
      id: 'exp-ml',
      company: 'Cognitive Engine',
      title: 'Machine Learning Engineer',
      startDate: '2023-06',
      endDate: '2024-09',
      isCurrent: true,
      location: 'Boston, MA',
      bullets: [
        'Fine-tuned open-source transformer models with LoRA and PyTorch for domain-specific information extraction.',
        'Deployed low-latency inference services with FastAPI, TensorRT, and Triton Inference Server.',
      ],
      technologies: ['Python', 'PyTorch', 'FastAPI', 'Docker'],
    },
  ],
  projects: [
    {
      id: 'proj-semantic-search',
      name: 'Hybrid Vector & Lexical Search Engine',
      displayName: 'Hybrid Vector & Lexical Search Engine',
      repositoryUrl: 'https://github.com/davidkim-ml/hybrid-vector-search',
      technologies: ['Python', 'PyTorch', 'FastAPI', 'Redis'],
      bullets: [
        'Built an end-to-end semantic retrieval API combining BM25 keyword matching with dense HNSW vector embeddings.',
        'Implemented dynamic query re-ranking using Cross-Encoder models with sub-50ms p95 latency.',
      ],
    },
  ],
});

/**
 * Critical Regression Fixture reproducing the failure mode where:
 * - Candidate has rich canonical facts (6 facts on project 1, 4 on project 2)
 * - Candidate has real internship experience (3 facts)
 * - Candidate has meaningful DSA profile (solved 420 problems)
 * - Previous naive generator collapsed or emitted repetitive bullets like
 *   "Built a distributed telemetry platform." and ignored supported dimensions.
 */
export const criticalRegressionFixture = Object.freeze({
  candidate: {
    id: 'cand-critical-regression',
    name: 'Devin Thorne',
    email: 'devin.thorne@example-dev.org',
    phone: '+1 (555) 890-1234',
    location: 'San Jose, CA',
    github: 'https://github.com/devinthorne-dev',
    linkedin: 'https://linkedin.com/in/devinthorne',
    skills: [
      'Rust', 'TypeScript', 'Go', 'PostgreSQL', 'Docker', 'Kubernetes',
      'gRPC', 'Apache Kafka', 'Linux', 'Microservices'
    ],
    education: [
      {
        institution: 'San Jose State University',
        degree: 'Bachelor of Science in Software Engineering',
        graduationDate: '2024-05',
      },
    ],
    experience: [
      {
        id: 'exp-intern',
        company: 'Apex Infrastructure',
        title: 'Software Engineering Intern',
        startDate: '2023-06',
        endDate: '2023-09',
        isCurrent: false,
        location: 'San Jose, CA',
        bullets: [
          'Engineered automated release verification pipelines in GitHub Actions, decreasing regression test cycle time by 45%.',
          'Containerized local development workflows using Docker Compose with multi-stage build optimization.',
          'Contributed bug fixes to internal Go-based CLI tooling used by 40+ engineering teammates.',
        ],
        technologies: ['Go', 'Docker', 'GitHub Actions', 'Linux'],
      },
    ],
    projects: [
      {
        id: 'proj-telemetry',
        name: 'Distributed Telemetry & Metrics Engine',
        displayName: 'Distributed Telemetry & Metrics Engine',
        repositoryUrl: 'https://github.com/devinthorne-dev/telemetry-engine',
        technologies: ['Rust', 'Kafka', 'PostgreSQL', 'gRPC', 'Prometheus'],
        bullets: [
          'Architected a distributed telemetry ingest engine in Rust capable of processing 100,000 log events per second with zero-copy deserialization.',
          'Engineered Raft-based consensus across nodes to coordinate partitioned Kafka consumer group rebalances.',
          'Implemented write-ahead logging and disk spillover buffering to prevent out-of-memory crashes during downstream database outages.',
        ],
        highlights: [
          'Integrated real-time Prometheus exporter and Grafana telemetry dashboards.',
          'Secured internode gRPC communications with mutual TLS authentication (mTLS).',
          'Benchmarked streaming throughput achieving 99.9% uptime across network partitions.',
        ],
      },
      {
        id: 'proj-rpc-gateway',
        name: 'High-Performance API Gateway',
        displayName: 'High-Performance API Gateway',
        repositoryUrl: 'https://github.com/devinthorne-dev/api-gateway',
        technologies: ['Go', 'Redis', 'Docker', 'JWT'],
        bullets: [
          'Engineered a reverse proxy gateway in Go routing incoming HTTP/REST requests to internal gRPC microservices.',
          'Implemented cryptographically signed JWT token validation with in-memory Redis session caching.',
        ],
        highlights: [
          'Automated stress testing simulating 10,000 concurrent connections with zero dropped packets.',
          'Integrated structured JSON logging with distributed OpenTelemetry trace propagation.',
        ],
      },
    ],
    dsa: {
      hasSection: true,
      profileUrl: 'https://leetcode.com/u/devinthorne_algo',
      bullets: [
        'Solved 420+ algorithmic challenges with a focus on graph algorithms, dynamic programming, and data structures (top 8% contest rating).',
      ],
    },
  },
  targetJob: {
    id: 'job-backend-systems',
    title: 'Junior Backend Systems Engineer',
    company: 'CoreGrid Systems',
    requirements: [
      { id: 'req-1', keyword: 'Rust', title: 'Systems programming with Rust or Go' },
      { id: 'req-2', keyword: 'Distributed', title: 'Understanding of distributed systems and consensus' },
      { id: 'req-3', keyword: 'Kafka', title: 'Experience with event streaming and Kafka' },
      { id: 'req-4', keyword: 'gRPC', title: 'API development with gRPC or REST' },
      { id: 'req-5', keyword: 'Docker', title: 'Containerization with Docker' },
    ],
    projectRankings: [
      {
        projectId: 'proj-telemetry',
        projectName: 'Distributed Telemetry & Metrics Engine',
        relevanceScore: 92.5,
        relevanceBand: 'HIGH',
        matchedRequirementIds: ['req-1', 'req-2', 'req-3', 'req-4'],
      },
      {
        projectId: 'proj-rpc-gateway',
        projectName: 'High-Performance API Gateway',
        relevanceScore: 78.0,
        relevanceBand: 'HIGH',
        matchedRequirementIds: ['req-4', 'req-5'],
      },
    ],
  },
});
