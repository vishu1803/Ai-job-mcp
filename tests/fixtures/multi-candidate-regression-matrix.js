/**
 * @file Multi-Candidate Regression Matrix Fixtures (Candidates A-F).
 *
 * Synthetic, isolated candidate fixtures for verifying dynamic resume generation,
 * clean URL display, font floor retention, 1-page A4 geometry, and tenant isolation.
 * No real user data, private tokens, or external network dependencies.
 */

export function createCandidateAFixture() {
  return {
    candidateId: 'cand-a-junior-backend-001',
    tenantId: 'tenant-alpha-001',
    displayName: 'Aarav Patel',
    headline: 'Junior Backend Developer',
    email: 'aarav.patel@pateltech.test',
    phone: '+1 415 555 0123',
    location: 'San Francisco, CA',
    links: [
      { label: 'GitHub', url: 'https://github.com/aarav-patel-dev', platform: 'GITHUB' },
      { label: 'LinkedIn', url: 'https://linkedin.com/in/aarav-patel-dev', platform: 'LINKEDIN' },
    ],
    summary:
      'Backend software developer specializing in Node.js, Express, and PostgreSQL microservices. Built scalable background worker pipelines and documented RESTful API endpoints with integration test coverage.',
    skills: {
      categories: [
        {
          categoryName: 'Languages',
          skills: ['JavaScript', 'TypeScript', 'SQL'],
        },
        {
          categoryName: 'Backend & APIs',
          skills: ['Node.js', 'Express.js', 'REST APIs'],
        },
        {
          categoryName: 'Databases & Caching',
          skills: ['PostgreSQL', 'Redis', 'Prisma ORM'],
        },
        {
          categoryName: 'Developer Tools',
          skills: ['Git', 'Docker', 'Jest'],
        },
      ],
    },
    experience: [
      {
        id: 'exp-a-1',
        title: 'Backend Engineering Intern',
        company: 'CloudScale Technologies',
        employmentType: 'INTERNSHIP',
        location: 'San Francisco, CA',
        startDate: '2024-05',
        endDate: '2024-08',
        isCurrent: false,
        summary: 'Developed REST API services and optimized relational database queries.',
        bullets: [
          'Engineered Node.js API endpoints for user authentication with JWT token rotation.',
          'Optimized PostgreSQL database queries and added indexing for transaction logs.',
          'Wrote automated Jest integration tests achieving 88% test coverage across API routes.',
        ],
      },
    ],
    projects: [
      {
        id: 'proj-a-1',
        displayName: 'Distributed Task Queue',
        name: 'Distributed Task Queue',
        description: 'Asynchronous job processing system with Redis and Node.js.',
        technologies: ['Node.js', 'TypeScript', 'Redis', 'PostgreSQL'],
        urls: ['https://github.com/aarav-patel-dev/distributed-task-queue'],
        repositoryUrl: 'https://github.com/aarav-patel-dev/distributed-task-queue',
        bullets: [
          'Built reliable job queue worker in Node.js with Redis stream consumer groups.',
          'Implemented exponential backoff retry logic and dead-letter queue handling.',
          'Added PostgreSQL audit logging for state transitions across 50,000 processed jobs.',
        ],
      },
      {
        id: 'proj-a-2',
        displayName: 'REST API Gateway',
        name: 'REST API Gateway',
        description: 'Lightweight API gateway with rate limiting and caching.',
        technologies: ['TypeScript', 'Express.js', 'Redis'],
        urls: ['https://github.com/aarav-patel-dev/api-gateway'],
        repositoryUrl: 'https://github.com/aarav-patel-dev/api-gateway',
        bullets: [
          'Implemented token bucket rate limiter in Redis mitigating traffic bursts.',
          'Configured reverse proxy routing and centralized response headers for client apps.',
        ],
      },
    ],
    education: [
      {
        id: 'edu-a-1',
        institution: 'University of California, Davis',
        degree: 'Bachelor of Science',
        fieldOfStudy: 'Computer Science',
        location: 'Davis, CA',
        startDate: '2020-09',
        endDate: '2024-06',
        grade: '3.7 GPA',
        coursework: ['Data Structures', 'Database Systems', 'Operating Systems', 'Algorithms'],
      },
    ],
    optionalSections: {
      languages: [
        { language: 'English', proficiency: 'PROFESSIONAL' },
        { language: 'Gujarati', proficiency: 'NATIVE' },
      ],
    },
  };
}

export function createCandidateBFixture() {
  return {
    candidateId: 'cand-b-experienced-fullstack-002',
    tenantId: 'tenant-beta-002',
    displayName: 'Elena Rostova',
    headline: 'Senior Full-Stack Engineer',
    email: 'elena.rostova@techsolutions.test',
    phone: '+1 206 555 0199',
    location: 'Seattle, WA',
    links: [
      { label: 'LinkedIn', url: 'https://linkedin.com/in/elena-rostova-eng', platform: 'LINKEDIN' },
      { label: 'GitHub', url: 'https://github.com/elena-rostova', platform: 'GITHUB' },
      { label: 'Portfolio', url: 'https://elena-rostova.dev', platform: 'PORTFOLIO' },
    ],
    summary:
      'Senior Full-Stack Engineer with 8+ years architecting high-throughput cloud applications and distributed web platforms. Proven record reducing infrastructure costs by 35% and mentoring engineering teams.',
    skills: {
      categories: [
        {
          categoryName: 'Languages',
          skills: ['TypeScript', 'JavaScript', 'Go', 'Python', 'SQL'],
        },
        {
          categoryName: 'Frontend & Architecture',
          skills: ['React', 'Next.js', 'Vue.js', 'Tailwind CSS', 'Redux Toolkit'],
        },
        {
          categoryName: 'Backend & Microservices',
          skills: ['Node.js', 'NestJS', 'GraphQL', 'gRPC', 'Kafka'],
        },
        {
          categoryName: 'Databases & Cloud',
          skills: ['PostgreSQL', 'MongoDB', 'Redis', 'AWS', 'Terraform'],
        },
      ],
    },
    experience: [
      {
        id: 'exp-b-1',
        title: 'Lead Full-Stack Engineer',
        company: 'Vanguard Systems',
        employmentType: 'FULL_TIME',
        location: 'Seattle, WA',
        startDate: '2021-04',
        endDate: null,
        isCurrent: true,
        bullets: [
          'Architected customer-facing React and Next.js portal serving 1.2M monthly active users.',
          'Migrated legacy monolithic services to Go microservices, reducing p99 latency from 450ms to 85ms.',
          'Engineered distributed Kafka event pipeline processing 15M transaction events daily.',
        ],
      },
      {
        id: 'exp-b-2',
        title: 'Senior Software Engineer',
        company: 'Pacific Digital Labs',
        employmentType: 'FULL_TIME',
        location: 'Bellevue, WA',
        startDate: '2018-02',
        endDate: '2021-03',
        isCurrent: false,
        bullets: [
          'Developed real-time analytics dashboard with React, WebSockets, and Redis pub/sub.',
          'Reduced AWS compute costs by 35% through containerization and auto-scaling group optimizations.',
        ],
      },
      {
        id: 'exp-b-3',
        title: 'Software Developer',
        company: 'Cascade Web Dynamics',
        employmentType: 'FULL_TIME',
        location: 'Seattle, WA',
        startDate: '2016-06',
        endDate: '2018-01',
        isCurrent: false,
        bullets: [
          'Built responsive frontend components and documented RESTful APIs in Node.js and Express.',
        ],
      },
    ],
    projects: [
      {
        id: 'proj-b-1',
        displayName: 'Enterprise Design System',
        name: 'Enterprise Design System',
        description: 'Accessible component library published to npm.',
        technologies: ['React', 'TypeScript', 'Storybook', 'Tailwind CSS'],
        urls: ['https://github.com/elena-rostova/enterprise-design-system'],
        repositoryUrl: 'https://github.com/elena-rostova/enterprise-design-system',
        bullets: [
          'Authored 45 WCAG 2.1 AA compliant UI components used across 12 product teams.',
          'Implemented automated visual regression testing pipeline with Chromatic and Jest.',
        ],
      },
      {
        id: 'proj-b-2',
        displayName: 'Real-Time Telemetry Pipeline',
        name: 'Real-Time Telemetry Pipeline',
        description: 'Event-driven streaming telemetry system in Go and Kafka.',
        technologies: ['Go', 'Kafka', 'PostgreSQL', 'Docker'],
        urls: ['https://github.com/elena-rostova/realtime-telemetry'],
        repositoryUrl: 'https://github.com/elena-rostova/realtime-telemetry',
        bullets: [
          'Engineered streaming metric ingest service in Go handling 25,000 events/second.',
          'Integrated PostgreSQL TimescaleDB for time-series aggregation and Grafana visualization.',
        ],
      },
    ],
    education: [
      {
        id: 'edu-b-1',
        institution: 'University of Washington',
        degree: 'Bachelor of Science',
        fieldOfStudy: 'Computer Science & Software Engineering',
        location: 'Seattle, WA',
        startDate: '2012-09',
        endDate: '2016-06',
      },
    ],
    optionalSections: {
      languages: [
        { language: 'English', proficiency: 'NATIVE' },
        { language: 'Russian', proficiency: 'NATIVE' },
      ],
    },
  };
}

export function createCandidateCFixture() {
  return {
    candidateId: 'cand-c-data-cloud-003',
    tenantId: 'tenant-gamma-003',
    displayName: 'Lucas Moreau',
    headline: 'Data & Cloud Infrastructure Engineer',
    email: 'lucas.moreau@datalabs.test',
    phone: '+33 1 42 68 55 00',
    location: 'Paris, France',
    links: [
      {
        label: 'GitLab',
        url: 'https://gitlab.com/lucas-moreau-infra/stream-pipeline',
        platform: 'OTHER',
      },
      { label: 'Portfolio', url: 'https://cloud-engineer.tech/portfolio', platform: 'PORTFOLIO' },
    ],
    summary:
      'Data platform engineer with deep expertise in Apache Spark, Terraform, and Snowflake. Built petabyte-scale lakehouse infrastructure and resilient CI/CD pipelines across AWS and GCP environments.',
    skills: {
      categories: [
        {
          categoryName: 'Data & Analytics',
          skills: ['Apache Spark', 'Snowflake', 'dbt', 'Airflow', 'Kafka'],
        },
        {
          categoryName: 'Cloud & Infrastructure',
          skills: ['AWS', 'GCP', 'Terraform', 'Kubernetes', 'Docker'],
        },
        {
          categoryName: 'Languages',
          skills: ['Python', 'SQL', 'Go', 'Bash'],
        },
      ],
    },
    experience: [
      {
        id: 'exp-c-1',
        title: 'Senior Data Platform Engineer',
        company: 'Hexagon Data Solutions',
        employmentType: 'FULL_TIME',
        location: 'Paris, France',
        startDate: '2022-03',
        endDate: null,
        isCurrent: true,
        bullets: [
          'Engineered automated dbt and Snowflake data transform pipelines for 4TB daily ingestion.',
          'Provisioned multi-region AWS EKS clusters and managed infrastructure as code via Terraform.',
          'Reduced daily batch ETL runtime from 4.5 hours down to 45 minutes with Apache Spark tuning.',
        ],
      },
      {
        id: 'exp-c-2',
        title: 'Cloud Infrastructure Engineer',
        company: 'Novatech Analytics',
        employmentType: 'FULL_TIME',
        location: 'Lyon, France',
        startDate: '2019-09',
        endDate: '2022-02',
        isCurrent: false,
        bullets: [
          'Designed CI/CD delivery pipelines in GitLab CI and containerized microservices with Docker.',
          'Maintained 99.99% infrastructure availability across production Kubernetes clusters.',
        ],
      },
    ],
    projects: [
      {
        id: 'proj-c-1',
        displayName: 'Streaming Log Lakehouse',
        name: 'Streaming Log Lakehouse',
        description: 'Serverless streaming log ingestion into Apache Iceberg.',
        technologies: ['Python', 'Apache Spark', 'Terraform', 'AWS'],
        urls: ['https://gitlab.com/lucas-moreau-infra/stream-pipeline'],
        repositoryUrl: 'https://gitlab.com/lucas-moreau-infra/stream-pipeline',
        bullets: [
          'Provisioned serverless AWS MSK Kafka cluster and Spark Structured Streaming jobs via Terraform.',
          'Implemented schema enforcement and automated compaction on Apache Iceberg tables.',
        ],
      },
      {
        id: 'proj-c-2',
        displayName: 'Multi-Cloud Terraform Modules',
        name: 'Multi-Cloud Terraform Modules',
        description: 'Open-source reusable Terraform modules for compliant cloud environments.',
        technologies: ['Terraform', 'Go', 'GCP', 'AWS'],
        urls: ['https://gitlab.com/lucas-moreau-infra/terraform-modules'],
        repositoryUrl: 'https://gitlab.com/lucas-moreau-infra/terraform-modules',
        bullets: [
          'Created modular VPC, IAM, and KMS encryption blueprints tested with Terratest in Go.',
          'Automated security compliance verification with Trivy and Checkov security scanning.',
        ],
      },
    ],
    education: [
      {
        id: 'edu-c-1',
        institution: 'Technical University of Munich',
        degree: 'Master of Science',
        fieldOfStudy: 'Data Engineering & Cloud Computing',
        location: 'Munich, Germany',
        startDate: '2017-10',
        endDate: '2019-07',
        grade: '1.2 (Sehr gut)',
      },
    ],
    optionalSections: {
      languages: [
        { language: 'French', proficiency: 'NATIVE' },
        { language: 'English', proficiency: 'PROFESSIONAL' },
        { language: 'German', proficiency: 'INTERMEDIATE' },
      ],
    },
  };
}

export function createCandidateDFixture() {
  return {
    candidateId: 'cand-d-career-changer-004',
    tenantId: 'tenant-delta-004',
    displayName: 'Marcus Thorne',
    headline: 'Software Developer',
    email: 'marcus.thorne@careerchange.test',
    phone: '+1 312 555 0177',
    location: 'Chicago, IL',
    links: [
      { label: 'GitHub', url: 'https://github.com/marcus-thorne-dev', platform: 'GITHUB' },
      { label: 'LinkedIn', url: 'https://linkedin.com/in/marcus-thorne', platform: 'LINKEDIN' },
    ],
    summary:
      'Detail-oriented software developer transitioning from logistics operations. Practical experience building JavaScript and Python automation tools, REST APIs, and database-backed web applications.',
    skills: {
      categories: [
        {
          categoryName: 'Languages',
          skills: ['Python', 'JavaScript', 'SQL', 'HTML5/CSS3'],
        },
        {
          categoryName: 'Web & Frameworks',
          skills: ['Django', 'Flask', 'Node.js', 'React'],
        },
        {
          categoryName: 'Tools & Databases',
          skills: ['PostgreSQL', 'SQLite', 'Git', 'Linux'],
        },
      ],
    },
    projects: [
      {
        id: 'proj-d-1',
        displayName: 'Warehouse Inventory Tracker',
        name: 'Warehouse Inventory Tracker',
        description: 'Web application for stock management and shipment verification.',
        technologies: ['Python', 'Django', 'PostgreSQL', 'JavaScript'],
        urls: ['https://github.com/marcus-thorne-dev/inventory-tracker'],
        repositoryUrl: 'https://github.com/marcus-thorne-dev/inventory-tracker',
        bullets: [
          'Engineered Django application with PostgreSQL database schema tracking 8,000 inventory SKUs.',
          'Implemented barcode lookup REST API reducing warehouse item check-in duration.',
          'Wrote unit tests verifying transactional integrity during simultaneous inventory adjustments.',
        ],
      },
      {
        id: 'proj-d-2',
        displayName: 'Customer Order Analytics CLI',
        name: 'Customer Order Analytics CLI',
        description: 'Command-line reporting tool for order data reconciliation.',
        technologies: ['Python', 'SQL', 'Click'],
        urls: ['https://github.com/marcus-thorne-dev/order-analytics-cli'],
        repositoryUrl: 'https://github.com/marcus-thorne-dev/order-analytics-cli',
        bullets: [
          'Created CLI tool parsing CSV order exports and generating automated revenue summaries.',
          'Integrated SQL queries to identify billing anomalies across multi-state shipping zones.',
        ],
      },
    ],
    experience: [
      {
        id: 'exp-d-1',
        title: 'Operations & Logistics Manager',
        company: 'Midwest Freight Logistics',
        employmentType: 'FULL_TIME',
        location: 'Chicago, IL',
        startDate: '2019-01',
        endDate: '2024-02',
        isCurrent: false,
        bullets: [
          'Managed regional supply chain operations and daily delivery routes for 35 commercial vehicles.',
          'Standardized digital audit records and coordinated cross-functional warehouse safety protocols.',
        ],
      },
    ],
    education: [
      {
        id: 'edu-d-1',
        institution: 'University of Illinois Urbana-Champaign',
        degree: 'Bachelor of Arts',
        fieldOfStudy: 'Economics',
        location: 'Urbana, IL',
        startDate: '2014-08',
        endDate: '2018-05',
      },
    ],
  };
}

export function createCandidateEFixture() {
  return {
    candidateId: 'cand-e-minimal-profile-005',
    tenantId: 'tenant-epsilon-005',
    displayName: 'Devon Vance',
    headline: 'Software Engineer',
    email: 'devon.vance@minimalist.test',
    phone: null,
    location: null,
    links: [{ label: 'Portfolio', url: 'https://minimalist-coder.io', platform: 'PORTFOLIO' }],
    summary:
      'Software engineer focused on clean, maintainable systems programming and database performance optimization.',
    skills: {
      categories: [
        {
          categoryName: 'Core Technologies',
          skills: ['Go', 'C++', 'PostgreSQL', 'Linux'],
        },
      ],
    },
    experience: [
      {
        id: 'exp-e-1',
        title: 'Software Developer',
        company: 'Core Systems Lab',
        employmentType: 'FULL_TIME',
        location: 'Remote',
        startDate: '2023-01',
        endDate: null,
        isCurrent: true,
        bullets: [
          'Maintained high-throughput data structures and investigated memory allocation bottlenecks.',
          'Wrote test suites for internal concurrency primitives and network socket handlers.',
        ],
      },
    ],
    projects: [
      {
        id: 'proj-e-1',
        displayName: 'Embedded Key-Value Store',
        name: 'Embedded Key-Value Store',
        description: 'LSM-tree based key-value storage engine.',
        technologies: ['Go', 'Linux'],
        urls: ['https://minimalist-coder.io/projects/kv-store'],
        repositoryUrl: null,
        bullets: [
          'Implemented append-only write-ahead log and memtable flush synchronization in Go.',
          'Benchmarked read throughput achieving 120,000 operations per second under concurrent load.',
        ],
      },
    ],
    education: [
      {
        id: 'edu-e-1',
        institution: 'State University',
        degree: 'Bachelor of Science',
        fieldOfStudy: 'Computer Science',
        location: 'Boston, MA',
        startDate: '2018-09',
        endDate: '2022-05',
      },
    ],
  };
}

export function createCandidateFFixture() {
  return {
    candidateId: 'cand-f-long-urls-006',
    tenantId: 'tenant-zeta-006',
    displayName: 'Dr. Alexander Maximilian von Humboldt',
    headline: 'Lead Distributed Systems Architect',
    email: 'alexander.maximilian@systems-research.test',
    phone: '+49 30 555 01842',
    location: 'Berlin, Germany',
    links: [
      {
        label: 'LinkedIn',
        url: 'https://www.linkedin.com/in/dr-alexander-maximilian-von-humboldt-cloud-architect-2026',
        platform: 'LINKEDIN',
      },
      {
        label: 'GitHub',
        url: 'https://github.com/alexander-maximilian-systems/distributed-consensus-raft-implementation',
        platform: 'GITHUB',
      },
      {
        label: 'Portfolio',
        url: 'https://alexander-maximilian-portfolio-and-research-showcase.engineering.dev',
        platform: 'PORTFOLIO',
      },
      {
        label: 'LeetCode',
        url: 'https://leetcode.com/u/alexander_maximilian_systems/?tab=profile&view=detailed',
        platform: 'LEETCODE',
      },
    ],
    summary:
      'Principal systems architect with 12+ years designing distributed consensus algorithms, high-throughput financial engines, and fault-tolerant cloud backbones. Author of peer-reviewed papers on distributed transaction scheduling.',
    skills: {
      categories: [
        {
          categoryName: 'Systems & Languages',
          skills: ['Rust', 'Go', 'C++20', 'Distributed Consensus'],
        },
        {
          categoryName: 'Storage & Distributed',
          skills: ['Raft', 'Paxos', 'RocksDB', 'Kafka', 'PostgreSQL'],
        },
        {
          categoryName: 'Cloud & Infrastructure',
          skills: ['Kubernetes', 'Linux Kernel eBPF', 'Terraform', 'AWS'],
        },
      ],
    },
    experience: [
      {
        id: 'exp-f-1',
        title: 'Principal Systems Architect',
        company: 'Apex Distributed Financial Systems',
        employmentType: 'FULL_TIME',
        location: 'Berlin, Germany',
        startDate: '2020-01',
        endDate: null,
        isCurrent: true,
        bullets: [
          'Architected Raft consensus engine in Rust processing 250,000 distributed orders per second.',
          'Engineered eBPF network packet filter reducing inter-node packet serialization latency by 45%.',
          'Eliminated distributed deadlock vulnerability during partition recovery through formal TLA+ verification.',
        ],
      },
      {
        id: 'exp-f-2',
        title: 'Staff Infrastructure Engineer',
        company: 'Berlin Cloud Computing Labs',
        employmentType: 'FULL_TIME',
        location: 'Berlin, Germany',
        startDate: '2016-04',
        endDate: '2019-12',
        isCurrent: false,
        bullets: [
          'Engineered global cluster scheduling service orchestrating 4,000 bare-metal compute nodes.',
          'Published technical whitepapers on fault tolerance and split-brain resolution protocols.',
        ],
      },
    ],
    projects: [
      {
        id: 'proj-f-1',
        displayName: 'Formal Raft Verification Framework',
        name: 'Formal Raft Verification Framework',
        description: 'Model checker and simulation engine for Raft consensus.',
        technologies: ['Rust', 'TLA+', 'Distributed Systems'],
        urls: [
          'https://github.com/alexander-maximilian-systems/distributed-consensus-raft-implementation',
        ],
        repositoryUrl:
          'https://github.com/alexander-maximilian-systems/distributed-consensus-raft-implementation',
        bullets: [
          'Implemented state-machine safety proof verification for randomized leader election cycles.',
          'Simulated 10,000 network partitions discovering zero safety violations or split-brain states.',
        ],
      },
      {
        id: 'proj-f-2',
        displayName: 'Zero-Copy IPC Messaging Bus',
        name: 'Zero-Copy IPC Messaging Bus',
        description: 'Ultra-low-latency inter-process communication queue in C++.',
        technologies: ['C++20', 'Linux Shared Memory'],
        urls: ['https://github.com/alexander-maximilian-systems/zero-copy-ipc'],
        repositoryUrl: 'https://github.com/alexander-maximilian-systems/zero-copy-ipc',
        bullets: [
          'Designed ring-buffer messaging bus using shared memory and lock-free atomic primitives.',
          'Benchmarked round-trip latency achieving 42 nanoseconds on modern x86-64 hardware.',
        ],
      },
    ],
    education: [
      {
        id: 'edu-f-1',
        institution: 'Humboldt University of Berlin',
        degree: 'Doctor of Philosophy (Ph.D.)',
        fieldOfStudy: 'Distributed Computer Systems',
        location: 'Berlin, Germany',
        startDate: '2012-10',
        endDate: '2016-02',
        grade: 'Summa Cum Laude',
      },
    ],
    optionalSections: {
      languages: [
        { language: 'German', proficiency: 'NATIVE' },
        { language: 'English', proficiency: 'FLUENT' },
      ],
    },
  };
}

export function getSyntheticMatrixCandidates() {
  return [
    { key: 'CANDIDATE_A', label: 'Junior Backend Developer', fixture: createCandidateAFixture() },
    {
      key: 'CANDIDATE_B',
      label: 'Experienced Full-Stack Engineer',
      fixture: createCandidateBFixture(),
    },
    { key: 'CANDIDATE_C', label: 'Data/Cloud Engineer', fixture: createCandidateCFixture() },
    { key: 'CANDIDATE_D', label: 'Career Changer', fixture: createCandidateDFixture() },
    { key: 'CANDIDATE_E', label: 'Minimal Profile', fixture: createCandidateEFixture() },
    { key: 'CANDIDATE_F', label: 'Long Profile URLs', fixture: createCandidateFFixture() },
  ];
}
