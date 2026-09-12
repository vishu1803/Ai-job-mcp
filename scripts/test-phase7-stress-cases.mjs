import { LatexDocumentGenerator } from '../src/services/latex-document-generator.service.js';
import { LatexCompilerService } from '../src/services/latex-compiler.service.js';
import { ResumeParserService } from '../src/services/resume-parser.service.js';
import { buildStructuredResumeDocument } from '../src/services/structured-resume.service.js';

const compiler = new LatexCompilerService();
const parser = new ResumeParserService();
const generator = new LatexDocumentGenerator();

const stressCases = [
  // 1. Fresher + many short projects
  {
    name: '1. Fresher + many short projects',
    candidate: {
      displayName: 'Alex Morgan',
      email: 'alex.morgan@test.com',
      headline: 'Software Engineer',
      skills: [{ name: 'Python', provenanceStatus: 'VERIFIED' }, { name: 'JavaScript', provenanceStatus: 'VERIFIED' }],
      experience: [],
      projects: [
        { id: 'p1', name: 'Micro-Service A', technologies: ['Go'], bullets: ['Built lightweight telemetry HTTP endpoint.'] },
        { id: 'p2', name: 'Micro-Service B', technologies: ['Rust'], bullets: ['Built asynchronous event dispatcher.'] },
        { id: 'p3', name: 'Micro-Service C', technologies: ['Node.js'], bullets: ['Built real-time websocket gateway.'] },
        { id: 'p4', name: 'Micro-Service D', technologies: ['Python'], bullets: ['Built automated batch data pipeline.'] },
      ],
      education: [{ institution: 'State University', degree: 'B.S. in Computer Science', startDate: '2020', endDate: '2024' }],
    },
    job: { title: 'Software Engineer', company: 'Tech Corp', description: 'Go, Rust, Node.js, Python microservices' },
  },

  // 2. Fresher + 2 very long projects
  {
    name: '2. Fresher + 2 very long projects',
    candidate: {
      displayName: 'Jordan Lee',
      email: 'jordan.lee@test.com',
      headline: 'Software Engineer',
      skills: [{ name: 'C++', provenanceStatus: 'VERIFIED' }, { name: 'Rust', provenanceStatus: 'VERIFIED' }, { name: 'Linux', provenanceStatus: 'VERIFIED' }],
      experience: [],
      projects: [
        {
          id: 'p1',
          name: 'Distributed Telemetry Infrastructure System',
          technologies: ['Rust', 'Raft', 'gRPC', 'Prometheus', 'Docker'],
          bullets: [
            'Engineered a highly resilient distributed consensus coordinator implementing Raft leader election and atomic log replication across cluster nodes.',
            'Architected asynchronous zero-copy network streaming pipelines leveraging tokio and custom framing protocols to minimize memory overhead.',
            'Implemented automated chaos testing suites with network partition simulation and crash-recovery verification protocols.'
          ]
        },
        {
          id: 'p2',
          name: 'High-Performance Graph Analytics Database Engine',
          technologies: ['C++', 'CUDA', 'OpenMP', 'CMake', 'Linux'],
          bullets: [
            'Designed concurrent lock-free adjacency list data structures supporting million-edge graph traversal operations with sub-millisecond latency.',
            'Parallelized breadth-first search and PageRank ranking kernels using OpenMP multi-threading and vectorized memory alignments.',
            'Constructed continuous benchmarking harnesses comparing memory cache hit rates across varying graph density distributions.'
          ]
        },
      ],
      education: [{ institution: 'Polytechnic Institute', degree: 'B.S. in Computer Engineering', startDate: '2020', endDate: '2024' }],
    },
    job: { title: 'Systems Engineer', company: 'Scale Corp', description: 'High performance systems, Rust, C++' },
  },

  // 3. One experience + several projects
  {
    name: '3. One experience + several projects',
    candidate: {
      displayName: 'Taylor Smith',
      email: 'taylor.smith@test.com',
      headline: 'Full-Stack Developer',
      skills: [{ name: 'TypeScript', provenanceStatus: 'VERIFIED' }, { name: 'React', provenanceStatus: 'VERIFIED' }, { name: 'Node.js', provenanceStatus: 'VERIFIED' }],
      experience: [
        {
          title: 'Software Developer Intern',
          company: 'Acme Cloud Inc.',
          startDate: '2024-05',
          endDate: '2024-08',
          bullets: [
            'Engineered customer onboarding workflows using TypeScript and React.',
            'Optimized RESTful backend endpoints in Node.js, reducing response latency by 35%.',
            'Implemented automated CI/CD pipeline tests in GitHub Actions.'
          ]
        }
      ],
      projects: [
        { id: 'p1', name: 'Collaborative Editor', technologies: ['TypeScript', 'React', 'WebSockets'], bullets: ['Built collaborative document editor with operational transformation.'] },
        { id: 'p2', name: 'Cloud Storage Gateway', technologies: ['Go', 'S3', 'Docker'], bullets: ['Architected multipart file upload proxy with checksum validation.'] },
        { id: 'p3', name: 'Metrics Visualizer', technologies: ['React', 'D3.js'], bullets: ['Developed interactive timeseries dashboard for cloud infrastructure.'] },
      ],
      education: [{ institution: 'Tech University', degree: 'B.S. in Software Engineering', startDate: '2021', endDate: '2025' }],
    },
    job: { title: 'Full Stack Engineer', company: 'Cloud Apps', description: 'Full stack development with TypeScript, React, and Node.js' },
  },

  // 4. Multiple experience entries (heavy experience)
  {
    name: '4. Multiple experience entries (heavy experience)',
    candidate: {
      displayName: 'Samira Khan',
      email: 'samira.khan@test.com',
      headline: 'Senior Backend Engineer',
      skills: [{ name: 'Java', provenanceStatus: 'VERIFIED' }, { name: 'Spring Boot', provenanceStatus: 'VERIFIED' }, { name: 'PostgreSQL', provenanceStatus: 'VERIFIED' }, { name: 'Kafka', provenanceStatus: 'VERIFIED' }],
      experience: [
        {
          title: 'Senior Software Engineer',
          company: 'FinTech Platform Corp',
          startDate: '2022-01',
          endDate: 'Present',
          isCurrent: true,
          bullets: [
            'Led migration of core settlement pipeline to event-driven Kafka architecture, processing over 10M events daily.',
            'Designed idempotent payment ledger APIs with distributed transaction isolation in PostgreSQL.',
            'Mentored junior engineers and instituted rigorous pull request review standards.'
          ]
        },
        {
          title: 'Backend Engineer',
          company: 'E-Commerce Global',
          startDate: '2019-06',
          endDate: '2021-12',
          bullets: [
            'Engineered microservices using Spring Boot and Hibernate handling inventory catalog synchronization.',
            'Decreased database query latency by tuning indexing and introducing Redis read caches.'
          ]
        }
      ],
      projects: [
        { id: 'p1', name: 'Distributed Lock Manager', technologies: ['Java', 'Redis'], bullets: ['Implemented Redlock consensus algorithm for distributed resource arbitration.'] },
        { id: 'p2', name: 'API Rate Limiting Proxy', technologies: ['Go', 'Docker'], bullets: ['Constructed token bucket rate limiter with sliding window enforcement.'] },
      ],
      education: [{ institution: 'Metropolitan University', degree: 'B.S. in Computer Science', startDate: '2015', endDate: '2019' }],
    },
    job: { title: 'Senior Backend Engineer', company: 'Global Payments', description: 'Distributed systems, Java, Spring Boot, Kafka, PostgreSQL' },
  },

  // 5. Long summary
  {
    name: '5. Long summary',
    candidate: {
      displayName: 'Carlos Rodriguez',
      email: 'carlos.rodriguez@test.com',
      headline: 'Platform & Infrastructure Engineer',
      summary: 'Platform Engineer with extensive hands-on experience designing cloud infrastructure and automated deployment pipelines. Built resilient Kubernetes clusters and service mesh architectures with Istio and Envoy. Committed to infrastructure as code, deterministic deployment repeatability, and zero-downtime rolling release strategies across multi-region environments.',
      skills: [{ name: 'Kubernetes', provenanceStatus: 'VERIFIED' }, { name: 'Terraform', provenanceStatus: 'VERIFIED' }, { name: 'Go', provenanceStatus: 'VERIFIED' }],
      experience: [
        {
          title: 'DevOps Intern',
          company: 'Cloud Scale Inc.',
          startDate: '2024-01',
          endDate: '2024-06',
          bullets: ['Automated Terraform module deployments across AWS environments.', 'Configured Prometheus monitoring and Grafana alerts for microservice pods.']
        }
      ],
      projects: [
        { id: 'p1', name: 'Infrastructure Orchestrator', technologies: ['Go', 'Kubernetes'], bullets: ['Built custom Kubernetes operator for stateful application management.'] },
        { id: 'p2', name: 'GitOps Pipeline Controller', technologies: ['Terraform', 'GitHub Actions'], bullets: ['Engineered automated drift detection and declarative infrastructure reconciliation.'] }
      ],
      education: [{ institution: 'State University', degree: 'B.S. in Computer Science', startDate: '2020', endDate: '2024' }],
    },
    job: { title: 'DevOps Engineer', company: 'Platform Solutions', description: 'Kubernetes, Terraform, AWS, Go' },
  },

  // 6. Many skills
  {
    name: '6. Many skills',
    candidate: {
      displayName: 'Elena Petrova',
      email: 'elena.petrova@test.com',
      headline: 'Full-Stack Developer',
      skills: [
        { name: 'TypeScript', category: 'LANGUAGES', provenanceStatus: 'VERIFIED' },
        { name: 'Python', category: 'LANGUAGES', provenanceStatus: 'VERIFIED' },
        { name: 'Go', category: 'LANGUAGES', provenanceStatus: 'VERIFIED' },
        { name: 'Rust', category: 'LANGUAGES', provenanceStatus: 'VERIFIED' },
        { name: 'React', category: 'FRAMEWORKS', provenanceStatus: 'VERIFIED' },
        { name: 'Next.js', category: 'FRAMEWORKS', provenanceStatus: 'VERIFIED' },
        { name: 'FastAPI', category: 'FRAMEWORKS', provenanceStatus: 'VERIFIED' },
        { name: 'NestJS', category: 'FRAMEWORKS', provenanceStatus: 'VERIFIED' },
        { name: 'PostgreSQL', category: 'DATABASES', provenanceStatus: 'VERIFIED' },
        { name: 'Redis', category: 'DATABASES', provenanceStatus: 'VERIFIED' },
        { name: 'MongoDB', category: 'DATABASES', provenanceStatus: 'VERIFIED' },
        { name: 'Docker', category: 'DEVOPS', provenanceStatus: 'VERIFIED' },
        { name: 'Kubernetes', category: 'DEVOPS', provenanceStatus: 'VERIFIED' },
        { name: 'AWS', category: 'DEVOPS', provenanceStatus: 'VERIFIED' },
      ],
      experience: [
        {
          title: 'Full Stack Engineer',
          company: 'Venture Labs',
          startDate: '2023-08',
          endDate: 'Present',
          isCurrent: true,
          bullets: ['Built full-stack React and NestJS web applications.', 'Implemented PostgreSQL data models and Prisma migrations.']
        }
      ],
      projects: [
        { id: 'p1', name: 'Task Flow Engine', technologies: ['TypeScript', 'React', 'NestJS', 'PostgreSQL'], bullets: ['Architected workflow engine with real-time state synchronization.'] },
        { id: 'p2', name: 'Telemetry Hub', technologies: ['Python', 'FastAPI', 'Redis', 'Docker'], bullets: ['Constructed telemetry ingestion pipeline handling metric aggregates.'] }
      ],
      education: [{ institution: 'National University', degree: 'B.S. in Computer Science', startDate: '2019', endDate: '2023' }],
    },
    job: { title: 'Full Stack Engineer', company: 'Startup Co', description: 'Full stack TypeScript, React, Next.js, Node.js, PostgreSQL' },
  },

  // 7. Long project names
  {
    name: '7. Long project names',
    candidate: {
      displayName: 'Marcus Aurelius',
      email: 'marcus.aurelius@test.com',
      headline: 'Distributed Systems Architect',
      skills: [{ name: 'C++', provenanceStatus: 'VERIFIED' }, { name: 'Rust', provenanceStatus: 'VERIFIED' }, { name: 'Distributed Systems', provenanceStatus: 'VERIFIED' }],
      experience: [],
      projects: [
        {
          id: 'p1',
          name: 'Next-Generation Ultra-High Throughput Distributed Consensus & Transactional Engine',
          technologies: ['C++', 'Raft', 'RDMA'],
          bullets: ['Engineered microsecond-latency consensus engine across kernel-bypass network fabrics.']
        },
        {
          id: 'p2',
          name: 'Asynchronous Fault-Tolerant Multi-Tenant Memory-Mapped Stream Processing Coordinator',
          technologies: ['Rust', 'Zero-Copy', 'Linux'],
          bullets: ['Designed persistent circular ring buffers for continuous high-rate event telemetry.']
        },
        {
          id: 'p3',
          name: 'Declarative Cloud-Native Container Orchestration & Dynamic Scheduling Controller',
          technologies: ['Go', 'Kubernetes API'],
          bullets: ['Constructed custom scheduling algorithm optimizing server node hardware utilization.']
        }
      ],
      education: [{ institution: 'Imperial College', degree: 'B.S. in Computer Systems', startDate: '2020', endDate: '2024' }],
    },
    job: { title: 'Distributed Systems Engineer', company: 'HyperScale', description: 'Distributed consensus, C++, Rust' },
  },

  // 8. Long technology stacks
  {
    name: '8. Long technology stacks',
    candidate: {
      displayName: 'Priya Sharma',
      email: 'priya.sharma@test.com',
      headline: 'Backend Platform Engineer',
      skills: [{ name: 'Java', provenanceStatus: 'VERIFIED' }, { name: 'Spring Boot', provenanceStatus: 'VERIFIED' }],
      experience: [
        {
          title: 'Backend Intern',
          company: 'Tech Enterprise',
          startDate: '2024-01',
          endDate: '2024-06',
          bullets: ['Developed microservice endpoints with Spring Boot.', 'Maintained unit test coverage with JUnit and Mockito.']
        }
      ],
      projects: [
        {
          id: 'p1',
          name: 'Enterprise Commerce Gateway',
          technologies: ['Java 21', 'Spring Boot 3', 'PostgreSQL 16', 'Apache Kafka', 'Redis Cluster', 'Docker Compose'],
          bullets: ['Implemented distributed order processing service with asynchronous payment reconciliation.']
        },
        {
          id: 'p2',
          name: 'Analytics Pipeline System',
          technologies: ['Python 3.12', 'FastAPI Framework', 'ClickHouse Database', 'Apache Arrow', 'Kubernetes Clusters'],
          bullets: ['Constructed real-time analytical event aggregator processing streaming transactions.']
        }
      ],
      education: [{ institution: 'Indian Institute of Technology', degree: 'B.Tech in Computer Science', startDate: '2020', endDate: '2024' }],
    },
    job: { title: 'Backend Engineer', company: 'Enterprise Platforms', description: 'Java, Spring Boot, Kafka, PostgreSQL, Redis' },
  },

  // 9. Unicode candidate and project names
  {
    name: '9. Unicode candidate and project names',
    candidate: {
      displayName: 'René François Côté',
      email: 'rene.cote@test.com',
      headline: 'Ingénieur Logiciel & Backend',
      skills: [{ name: 'Python', provenanceStatus: 'VERIFIED' }, { name: 'Go', provenanceStatus: 'VERIFIED' }],
      experience: [
        {
          title: 'Développeur Logiciel Stagiaire',
          company: 'Société Numérique & Cie',
          location: 'Montréal, QC',
          startDate: '2024-01',
          endDate: '2024-05',
          bullets: ['Développement d’APIs REST haute performance en Go.', 'Optimisation des requêtes PostgreSQL pour le traitement des données massives.']
        }
      ],
      projects: [
        {
          id: 'p1',
          name: 'Plateforme Décentralisée d’Échange de Données',
          technologies: ['Go', 'PostgreSQL', 'Docker'],
          bullets: ['Conception et mise en œuvre d’un système distribué résistant aux pannes réseau.']
        },
        {
          id: 'p2',
          name: 'Générateur de Rapports Électroniques Automatisés',
          technologies: ['Python', 'FastAPI'],
          bullets: ['Automatisation complète de l’ingestion et de l’analyse de données financières.']
        }
      ],
      education: [{ institution: 'Université de Montréal', degree: 'Baccalauréat en Informatique', startDate: '2020', endDate: '2024' }],
    },
    job: { title: 'Software Engineer', company: 'Global Solutions', description: 'Go, Python, PostgreSQL, REST APIs' },
  },
];

console.log('Running Phase 7 Layout Stress Tests across 9 Scenarios...');

for (const sc of stressCases) {
  const doc = buildStructuredResumeDocument({
    candidateProfile: sc.candidate,
    jobPosting: sc.job,
  });

  const appPackage = {
    candidateId: 'test-cand',
    candidateName: doc.candidateIdentity?.displayName || 'Candidate',
    candidateEmail: doc.candidateIdentity?.email,
    candidatePhone: doc.candidateIdentity?.phone,
    targetJob: sc.job,
    packageHash: 'stress-pkg',
    structuredResume: doc,
    tailoringPlan: doc.tailoringPlan,
    tailoredResume: { structuredResume: doc, contentHash: 'stress-hash' }
  };

  const latexResult = generator.generateTailoredResumeLatex({
    applicationPackage: appPackage,
    candidateProfile: sc.candidate,
  });

  const pdfResult = await compiler.compileLatexToPdf({
    texContent: latexResult.texContent,
    jobName: sc.name.replace(/[^a-z0-9]/gi, '_').toLowerCase(),
  });

  const extracted = parser.extractRawText({ buffer: pdfResult.pdfBuffer, format: 'PDF' });
  const pageMatches = [...extracted.matchAll(/--- Page (\d+) ---/g)];
  const pageCount = pageMatches.length || 1;

  console.log(`- ${sc.name}: ${pageCount === 1 ? 'PASS (1 page)' : `FAIL (${pageCount} pages)`}`);
  if (pageCount !== 1) {
    console.log(`  LaTeX lines: ${latexResult.texContent.split('\n').length}`);
  }
}
