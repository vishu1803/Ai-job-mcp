/**
 * @file Golden Benchmark Candidate & Job Fixtures (P18 Architecture)
 *
 * 10 authoritative benchmark fixtures covering diverse candidate archetypes,
 * domain specializations, evidence densities, and authentic source profiles.
 */

export const goldenSystemsCandidate = Object.freeze({
  id: 'cand-golden-systems-01',
  headline: 'Systems & Distributed Infrastructure Engineer',
  email: 'systems.eng@example.com',
  phone: '+1-555-0101',
  location: 'San Francisco, CA',
  skills: [
    { name: 'Go', slug: 'go', verified: true, provenanceStatus: 'VERIFIED' },
    { name: 'Raft', slug: 'raft', verified: true, provenanceStatus: 'VERIFIED' },
    { name: 'Docker', slug: 'docker', verified: true, provenanceStatus: 'VERIFIED' },
    { name: 'Linux', slug: 'linux', verified: true, provenanceStatus: 'VERIFIED' },
    { name: 'gRPC', slug: 'grpc', verified: true, provenanceStatus: 'VERIFIED' },
    { name: 'PostgreSQL', slug: 'postgresql', verified: true, provenanceStatus: 'VERIFIED' },
  ],
  projects: [
    {
      id: 'proj-distributed-kv',
      name: 'Distributed Key-Value Store',
      technologies: ['Go', 'Raft', 'gRPC', 'Docker'],
      provenanceStatus: 'VERIFIED',
      bullets: [
        'Architected distributed key-value store using Raft consensus protocol in Go.',
        'Implemented write-ahead logging (WAL) sustaining 15,000 writes/sec with 0 data loss.',
        'Containerized cluster testbed using Docker to simulate network partitions and split-brain scenarios.',
      ],
      evidence: [
        {
          id: 'ev-raft',
          type: 'IMPLEMENTATION',
          message: 'Raft consensus state machine implementation in Go',
        },
        { id: 'ev-wal', type: 'BENCHMARK', message: 'WAL benchmark results: 15,000 writes/sec' },
      ],
    },
    {
      id: 'proj-telemetry-engine',
      name: 'High-Throughput Telemetry Engine',
      technologies: ['Go', 'gRPC', 'Linux'],
      provenanceStatus: 'VERIFIED',
      bullets: [
        'Engineered streaming telemetry daemon in Go, processing 50,000 events/sec across system daemons.',
        'Optimized buffer allocation with sync.Pool, reducing garbage collection latency by 45%.',
      ],
      evidence: [
        { id: 'ev-telem', type: 'OUTCOME', message: 'Profiled buffer allocation with sync.Pool' },
      ],
    },
  ],
  experience: [
    {
      id: 'exp-systems-intern',
      company: 'Cloud Scale Networks',
      title: 'Systems Software Engineer Intern',
      startDate: '2023-05',
      endDate: '2023-08',
      bullets: [
        'Implemented eBPF packet filter for Linux networking stack in Go and C.',
        'Profiled kernel socket buffers under synthetic network saturation tests.',
      ],
    },
  ],
  education: [
    {
      id: 'edu-cs-bs',
      institution: 'University of Washington',
      degree: 'Bachelor of Science in Computer Science',
      graduationDate: '2024-05',
    },
  ],
});

export const goldenBackendJob = Object.freeze({
  id: 'job-systems-backend',
  title: 'Distributed Systems & Backend Engineer',
  company: 'Cloudflare',
  description:
    'Seeking engineer to build scalable, fault-tolerant distributed infrastructure services.',
  requirements: [
    { keyword: 'Go', importance: 'REQUIRED' },
    { keyword: 'Distributed Systems', importance: 'REQUIRED' },
    { keyword: 'Raft', importance: 'REQUIRED' },
    { keyword: 'Docker', importance: 'PREFERRED' },
    { keyword: 'gRPC', importance: 'PREFERRED' },
  ],
  skills: ['Go', 'Distributed Systems', 'Raft', 'gRPC', 'Docker', 'Linux'],
});

export const goldenAiMlCandidate = Object.freeze({
  id: 'cand-golden-ai-02',
  headline: 'AI & Machine Learning Systems Engineer',
  email: 'ai.engineer@example.com',
  skills: [
    { name: 'Python', slug: 'python', verified: true, provenanceStatus: 'VERIFIED' },
    { name: 'FastAPI', slug: 'fastapi', verified: true, provenanceStatus: 'VERIFIED' },
    { name: 'PyTorch', slug: 'pytorch', verified: true, provenanceStatus: 'VERIFIED' },
    { name: 'PostgreSQL', slug: 'postgresql', verified: true, provenanceStatus: 'VERIFIED' },
    { name: 'Redis', slug: 'redis', verified: true, provenanceStatus: 'VERIFIED' },
  ],
  projects: [
    {
      id: 'proj-rag-platform',
      name: 'Contextual RAG Retrieval Engine',
      technologies: ['Python', 'FastAPI', 'PyTorch', 'Redis'],
      provenanceStatus: 'VERIFIED',
      bullets: [
        'Built retrieval-augmented generation pipeline using PyTorch embeddings and Redis vector caching.',
        'Engineered asynchronous REST APIs in FastAPI, maintaining sub-40ms semantic lookup latency.',
      ],
      evidence: [],
    },
  ],
  experience: [],
  education: [
    {
      id: 'edu-cs-ms',
      institution: 'Carnegie Mellon University',
      degree: 'Master of Science in Computational Data Science',
      graduationDate: '2024-05',
    },
  ],
});

export const goldenAiJob = Object.freeze({
  id: 'job-ai-platform',
  title: 'AI Platform Engineer',
  company: 'Vercel',
  description:
    'Seeking engineers to scale generative AI and high-throughput vector inference endpoints.',
  requirements: [
    { keyword: 'Python', importance: 'REQUIRED' },
    { keyword: 'FastAPI', importance: 'REQUIRED' },
    { keyword: 'PyTorch', importance: 'PREFERRED' },
    { keyword: 'Redis', importance: 'PREFERRED' },
  ],
  skills: ['Python', 'FastAPI', 'PyTorch', 'Redis', 'Machine Learning'],
});

export const goldenDescriptionHeavyCandidate = Object.freeze({
  id: 'cand-golden-desc-03',
  headline: 'Software Developer',
  email: 'dev@example.com',
  skills: [
    { name: 'TypeScript', slug: 'typescript', verified: true },
    { name: 'Node.js', slug: 'nodejs', verified: true },
    { name: 'PostgreSQL', slug: 'postgresql', verified: true },
  ],
  projects: [
    {
      id: 'proj-api-portal',
      name: 'API Portal',
      technologies: ['TypeScript', 'Node.js', 'PostgreSQL'],
      provenanceStatus: 'USER_PROVIDED',
      bullets: [
        'The API Portal is an administrative web dashboard for managing developer client credentials.',
        'Features include API key generation, quota rate limits, and access token verification.',
        'Architected authentication middleware in TypeScript using JWT verification and PostgreSQL storage.',
      ],
      evidence: [],
    },
  ],
  experience: [],
  education: [],
});

export const goldenSparseFresherCandidate = Object.freeze({
  id: 'cand-golden-sparse-04',
  headline: 'Junior Software Engineer',
  email: 'fresher@example.com',
  skills: [
    { name: 'Python', slug: 'python', verified: true },
    { name: 'SQL', slug: 'sql', verified: true },
  ],
  projects: [
    {
      id: 'proj-data-parser',
      name: 'CSV ETL Pipeline',
      technologies: ['Python', 'SQL'],
      provenanceStatus: 'USER_PROVIDED',
      bullets: [
        'Implemented CSV data ingestion script in Python, validating schema types and storing rows in SQLite.',
      ],
      evidence: [],
    },
  ],
  experience: [],
  education: [
    {
      id: 'edu-bsc',
      institution: 'State University',
      degree: 'B.S. in Computer Science',
      graduationDate: '2024-06',
    },
  ],
});
