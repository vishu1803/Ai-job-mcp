/**
 * @file Coherent Synthetic Candidate & Job Target Data for Resume Studio Prototype.
 * Persona: Elena Rostova (Staff Distributed Systems Engineer)
 * Target Job: Staff Distributed Systems Engineer at CloudScale Systems
 */

const SYNTHETIC_DATA = {
  candidate: {
    id: 'cand_elena_rostova',
    name: 'Elena Rostova',
    title: 'Staff Distributed Systems Engineer',
    email: 'elena.rostova@engineer.dev',
    phone: '+1 (555) 019-4829',
    location: 'Seattle, WA',
    github: 'github.com/avance-infra',
    linkedin: 'linkedin.com/in/elenarostova',
    summary: '10+ years architecting high-throughput distributed streaming engines, Raft consensus protocols, and Kubernetes infrastructure in Go and Rust. Proven track record leading core platform teams scaling Tier-0 services to 55M requests/second.',
  },

  targetJob: {
    id: 'job_cloudscale_001',
    title: 'Staff Distributed Systems Engineer',
    company: 'CloudScale Systems',
    department: 'Core Data Infrastructure',
    location: 'Remote (US) / Seattle, WA',
    salary: '$240,000 - $285,000 + Equity',
    postedDaysAgo: 3,
    requirementsSummary: 'Seeking a Staff Systems Engineer to architect next-generation distributed consensus storage, write eBPF network proxies, and lead Kubernetes operator development in Go and Rust.',
  },

  keywords: {
    matched: [
      { id: 'kw-1', term: 'Go', count: 8, evidenceId: 'ev-1' },
      { id: 'kw-2', term: 'Rust', count: 6, evidenceId: 'ev-2' },
      { id: 'kw-3', term: 'Kubernetes', count: 5, evidenceId: 'ev-3' },
      { id: 'kw-4', term: 'Raft', count: 4, evidenceId: 'ev-2' },
      { id: 'kw-5', term: 'eBPF', count: 3, evidenceId: 'ev-1' },
      { id: 'kw-6', term: 'AWS', count: 4, evidenceId: 'ev-4' },
    ],
    equivalent: [
      { id: 'kw-7', term: 'K8s', canonical: 'Kubernetes' },
      { id: 'kw-8', term: 'Postgres', canonical: 'PostgreSQL' },
    ],
    related: [
      { id: 'kw-9', term: 'Docker', relationTo: 'Kubernetes (Container Runtime)' },
      { id: 'kw-10', term: 'Kafka', relationTo: 'Distributed Streaming' },
    ],
    missing: [
      { id: 'kw-11', term: 'Distributed Tracing (OpenTelemetry)' },
      { id: 'kw-12', term: 'Envoy Gateway' },
    ],
  },

  experience: [
    {
      id: 'exp-1',
      company: 'Cloudflare',
      role: 'VP of Systems Architecture',
      location: 'San Francisco, CA (Remote)',
      period: 'Jan 2021 – Present',
      included: true,
      bullets: [
        {
          id: 'exp-1-b1',
          text: 'Architected global edge proxy processing 55 million HTTP requests per second with sub-5ms P99 latency across 310 data centers.',
          keywords: ['Go', 'Rust', 'eBPF'],
          evidenceId: 'ev-1',
          truthStatus: 'VERIFIED',
          included: true,
          proposal: {
            id: 'prop-1',
            status: 'PENDING',
            targetKeyword: 'eBPF Routing',
            originalText: 'Architected global edge proxy processing 55 million HTTP requests per second with sub-5ms P99 latency across 310 data centers.',
            proposedText: 'Engineered zero-copy eBPF socket routing engine for global edge proxy, processing 55M req/sec with sub-5ms P99 latency while reducing transit compute expenditure by $14.2M.',
            formula: 'Accomplished [eBPF socket routing] as measured by [55M req/sec and $14.2M reduction] by doing [zero-copy kernel redirection].',
            rationale: 'Substantiates direct transit cost reduction using verified eBPF commit e3f7556, matching CloudScale requirement for kernel optimization.',
            evidenceId: 'ev-1',
          },
        },
        {
          id: 'exp-1-b2',
          text: 'Led engineering division of 85 distributed systems and kernel engineers across 6 timezones, establishing automated zero-trust security pipelines.',
          keywords: ['Kubernetes', 'Go'],
          evidenceId: 'ev-3',
          truthStatus: 'VERIFIED',
          included: true,
        },
        {
          id: 'exp-1-b3',
          text: 'Reduced annual transit and infrastructure compute expenditure by $14.2M through custom zero-copy eBPF network packet routing.',
          keywords: ['eBPF', 'Rust'],
          evidenceId: 'ev-1',
          truthStatus: 'VERIFIED',
          included: true,
        },
        {
          id: 'exp-1-b4',
          text: 'Spearheaded global migration from legacy C++ proxies to memory-safe Rust services with zero customer-facing downtime.',
          keywords: ['Rust'],
          evidenceId: 'ev-2',
          truthStatus: 'VERIFIED',
          included: true,
        },
      ],
    },
    {
      id: 'exp-2',
      company: 'Stripe',
      role: 'Principal Infrastructure Engineer',
      location: 'Seattle, WA',
      period: 'Apr 2016 – Dec 2020',
      included: true,
      bullets: [
        {
          id: 'exp-2-b1',
          text: 'Designed multi-region active-active ledger persistence engine handling $350B+ in annual transactional volume with 99.999% availability.',
          keywords: ['Go', 'Raft', 'AWS'],
          evidenceId: 'ev-4',
          truthStatus: 'VERIFIED',
          included: true,
        },
        {
          id: 'exp-2-b2',
          text: 'Eliminated cross-region data drift using Raft consensus state machine replication with sub-second failover recovery.',
          keywords: ['Raft', 'Go'],
          evidenceId: 'ev-4',
          truthStatus: 'VERIFIED',
          included: true,
        },
        {
          id: 'exp-2-b3',
          text: 'Engineered automated database failover framework reducing mean time to recovery (MTTR) from 18 minutes to 4 seconds.',
          keywords: ['Kubernetes', 'AWS'],
          evidenceId: 'ev-3',
          truthStatus: 'VERIFIED',
          included: true,
        },
      ],
    },
    {
      id: 'exp-3',
      company: 'Amazon Web Services (AWS)',
      role: 'Senior Software Development Engineer (EC2 Core)',
      location: 'Seattle, WA',
      period: 'Jun 2011 – Mar 2016',
      included: true,
      bullets: [
        {
          id: 'exp-3-b1',
          text: 'Built hypervisor control plane extensions supporting the launch of the Nitro hardware virtualization architecture.',
          keywords: ['Go', 'AWS'],
          evidenceId: 'ev-5',
          truthStatus: 'CANDIDATE_CLAIM',
          included: true,
        },
        {
          id: 'exp-3-b2',
          text: 'Authored distributed telemetry system ingesting 12 TB/sec of host operational metrics with sub-second alert latency.',
          keywords: ['Go', 'AWS'],
          evidenceId: 'ev-5',
          truthStatus: 'CANDIDATE_CLAIM',
          included: true,
        },
      ],
    },
  ],

  projects: [
    {
      id: 'proj-1',
      name: 'Titan Consensus Engine',
      repo: 'avance-infra/titan-raft',
      description: 'Open-source multi-raft consensus library written in Rust achieving 450,000 IOPS benchmarked on NVMe clusters.',
      keywords: ['Rust', 'Raft'],
      evidenceId: 'ev-2',
      truthStatus: 'VERIFIED',
      relevanceScore: 96,
      included: true,
    },
    {
      id: 'proj-2',
      name: 'k8s-mesh-operator',
      repo: 'avance-infra/k8s-mesh',
      description: 'Custom Kubernetes CRD operator and eBPF daemonset providing transparent mTLS mesh routing.',
      keywords: ['Go', 'Kubernetes', 'eBPF'],
      evidenceId: 'ev-1',
      truthStatus: 'VERIFIED',
      relevanceScore: 91,
      included: true,
    },
    {
      id: 'proj-3',
      name: 'distributed-kv-raft',
      repo: 'avance-infra/kv-raft',
      description: 'Embedded key-value store with Raft replication in Go.',
      keywords: ['Go', 'Raft'],
      evidenceId: 'ev-4',
      truthStatus: 'VERIFIED',
      relevanceScore: 78,
      included: false,
    },
  ],

  skills: {
    categories: [
      {
        name: 'Distributed Systems & Languages',
        skills: ['Go', 'Rust', 'C++', 'Raft / Paxos', 'eBPF Kernel Routing'],
      },
      {
        name: 'Cloud & Infrastructure',
        skills: ['Kubernetes', 'AWS / Multi-Cloud', 'Terraform', 'Linux Internals'],
      },
    ],
  },

  education: [
    {
      degree: 'Master of Science in Computer Science',
      school: 'University of Washington',
      year: 'May 2011',
      details: 'Thesis: Asynchronous Byzantine Fault Tolerance in Geographically Distributed Clusters.',
      included: true,
    },
    {
      degree: 'Bachelor of Science in Electrical Engineering & CS',
      school: 'University of California, Berkeley',
      year: 'May 2009',
      details: 'Honors in Computer Engineering.',
      included: true,
    },
  ],

  evidenceRegistry: {
    'ev-1': {
      id: 'ev-1',
      type: 'GITHUB_COMMIT',
      repo: 'avance-infra/edge-proxy',
      commitSha: 'e3f75564cebfae9ff74051547ce476268bb843fa',
      filePath: 'src/proxy/ebpf_router.rs',
      author: 'Elena Rostova <elena@avance-infra.dev>',
      date: '2024-03-12T16:42:10Z',
      verifiedAt: '2026-10-14T09:12:00Z',
      commitMessage: 'feat(router): implement zero-copy socket steering via BPF_PROG_TYPE_SK_MSG',
      diffSnippet: `@@ -142,8 +142,16 @@ pub fn attach_bpf_sock_map(map_fd: RawFd) -> Result<()> {
-    let fallback_socket = create_legacy_stream_socket()?;
+    // Zero-copy kernel packet redirection bypasses userspace TCP buffer copying
+    let prog = bpf::Program::load_sk_msg(include_bytes!("../bpf/sock_redir.o"))?;
+    prog.attach_to_sock_map(map_fd, bpf::AttachType::SkMsgVerdict)?;
+    info!("eBPF zero-copy redirect active: saving ~42ns per packet");
     Ok(())
 }`,
    },
    'ev-2': {
      id: 'ev-2',
      type: 'GITHUB_COMMIT',
      repo: 'avance-infra/titan-raft',
      commitSha: '48895fd8ff51e4514667c673815a49e5286b48a8',
      filePath: 'src/consensus/wal.rs',
      author: 'Elena Rostova <elena@avance-infra.dev>',
      date: '2023-11-04T11:20:05Z',
      verifiedAt: '2026-10-14T09:12:00Z',
      commitMessage: 'perf(wal): achieve 450,000 IOPS with direct I/O zero-allocation circular buffer',
      diffSnippet: `@@ -88,6 +88,12 @@ impl WriteAheadLog {
+    pub fn append_batch_direct(&mut self, entries: &[LogEntry]) -> Result<u64> {
+        // Direct NVMe sector alignment avoiding OS page cache copy overhead
+        self.ring_buffer.write_aligned_direct(entries)?;
+        Ok(self.current_term)
+    }`,
    },
    'ev-3': {
      id: 'ev-3',
      type: 'GITHUB_PR',
      repo: 'avance-infra/k8s-mesh',
      prNumber: 42,
      author: 'Elena Rostova',
      title: 'feat: add automated canary rollouts with zero-trust mTLS verification',
      verifiedAt: '2026-10-14T09:12:00Z',
    },
    'ev-4': {
      id: 'ev-4',
      type: 'GITHUB_REPO',
      repo: 'stripe-internal/ledger',
      status: 'VERIFIED_ORGANIZATION_MEMBER',
      verifiedAt: '2026-10-14T09:12:00Z',
    },
    'ev-5': {
      id: 'ev-5',
      type: 'CANDIDATE_AUTHORED',
      source: 'Resume Master Import',
      status: 'CANDIDATE_CLAIM',
      note: 'Candidate-reported experience claim. Preserved without modification; no external repository link.',
    },
  },

  diagnostics: {
    atsFit: {
      score: 88,
      band: 'STRONG_MATCH',
      breakdown: {
        requirements: { score: 48, max: 50, note: '6 of 6 core required technologies verified' },
        seniority: { score: 25, max: 25, note: '10+ years exceeds 8+ year Staff threshold' },
        projects: { score: 15, max: 15, note: 'Titan Raft and k8s-mesh closely mirror CloudScale scope' },
      },
    },
    writingQuality: {
      actionVerbStrength: 88,
      verbStatus: 'EXCELLENT',
      metricCoverageCount: 7,
      totalBulletsCount: 9,
      metricsRatio: '78%',
      repetitionWarnings: [
        { verb: 'Architected', count: 3, suggestedReplacement: 'Engineered / Spearheaded' },
      ],
    },
    parseability: {
      overall: '100% ATS PARSEABLE',
      checks: [
        { name: 'Single-Column Reading Order', status: 'PASS' },
        { name: 'CMap / ToUnicode Font Mapping', status: 'PASS' },
        { name: '0.52in Safe Margins', status: 'PASS' },
        { name: 'Zero LaTeX Syntax Leakage', status: 'PASS' },
        { name: 'Bullet Boundary & Date Coherence', status: 'PASS' },
      ],
    },
    evidenceVerification: {
      verifiedClaims: 11,
      candidateReported: 3,
      unsupportedHallucinations: 0,
      confidenceScore: '96% HIGH',
    },
  },
};

if (typeof window !== 'undefined') {
  window.SYNTHETIC_DATA = SYNTHETIC_DATA;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SYNTHETIC_DATA };
}
