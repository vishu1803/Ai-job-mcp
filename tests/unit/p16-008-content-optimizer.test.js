import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import {
  extractSubstantiveFactTokens,
  calculateFactSemanticOverlap,
  countDistinctCanonicalFacts,
  canonicalizeProject,
  mergeCandidateOwnedProjectContent,
  reconcileCandidateProjects,
} from '../../src/services/candidate-artifact-content.service.js';
import { PdfGeometryAnalyzer } from '../../src/services/pdf-geometry-analyzer.service.js';
import {
  ResumeContentOptimizer,
  OPTIMIZER_MAX_ITERATIONS,
} from '../../src/services/resume-content-optimizer.service.js';

describe('P16-008: Bounded Content-Utilization Optimizer & Physical PDF Quality', () => {
  // ─────────────────────────────────────────────────────────────────────────
  // 1. Distinct Canonical Fact Counting (Semantic Overlap >= 0.60)
  // ─────────────────────────────────────────────────────────────────────────
  describe('1. Distinct Canonical Fact Counting', () => {
    test('extractSubstantiveFactTokens extracts lowercase tokens excluding stop words and numbers', () => {
      const tokens = extractSubstantiveFactTokens('Built distributed worker pool in Node.js and Redis with 4 nodes.');
      assert.ok(tokens.has('distributed'));
      assert.ok(tokens.has('worker'));
      assert.ok(tokens.has('pool'));
      assert.ok(tokens.has('node.js'));
      assert.ok(tokens.has('redis'));
      // Stop words and pure numbers should be filtered out
      assert.ok(!tokens.has('in'));
      assert.ok(!tokens.has('and'));
      assert.ok(!tokens.has('with'));
      assert.ok(!tokens.has('built'));
      assert.ok(!tokens.has('4'));
    });

    test('calculateFactSemanticOverlap detects near-duplicate descriptions with Jaccard >= 0.60', () => {
      const fact1 = 'Built distributed worker pool in Node.js and Redis.';
      const fact2 = 'Implemented fault-tolerant distributed worker pool with Node.js and Redis.';
      const overlap = calculateFactSemanticOverlap(fact1, fact2);
      assert.ok(overlap >= 0.60, `Expected overlap >= 0.60, got ${overlap}`);

      const distinctFact = 'Integrated Stripe webhook handling for customer subscription billing.';
      const distinctOverlap = calculateFactSemanticOverlap(fact1, distinctFact);
      assert.ok(distinctOverlap < 0.20, `Expected low overlap for distinct fact, got ${distinctOverlap}`);
    });

    test('countDistinctCanonicalFacts groups semantically duplicate descriptions into 1 fact', () => {
      const candidateItems = [
        'Built distributed worker pool in Node.js and Redis.',
        'Implemented fault-tolerant distributed worker pool with Node.js and Redis.', // Duplicate of #1
        'Integrated Stripe webhook handling for customer subscription billing.', // Distinct #2
        'Streamed multi-part files directly to S3-compatible object store.', // Distinct #3
        'Streamed large multi-part files directly to S3 object store.', // Duplicate of #3
      ];

      const distinctCount = countDistinctCanonicalFacts(candidateItems, 0.60);
      assert.equal(distinctCount, 3, `Expected 3 distinct facts, got ${distinctCount}`);
    });

    test('countDistinctCanonicalFacts handles empty, null, and single-item inputs gracefully', () => {
      assert.equal(countDistinctCanonicalFacts([]), 0);
      assert.equal(countDistinctCanonicalFacts(null), 0);
      assert.equal(countDistinctCanonicalFacts(['']), 0);
      assert.equal(countDistinctCanonicalFacts(['Single factual claim']), 1);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 2. Source-Order Invariant Reconciliation & Canonical Comparison
  // ─────────────────────────────────────────────────────────────────────────
  describe('2. Source-Order Invariant Project Reconciliation', () => {
    test('canonicalizeProject normalizes and sorts all array fields deterministically', () => {
      const proj1 = {
        name: 'Distributed Queue',
        slug: 'distributed-queue',
        bullets: ['B bullet', 'A bullet'],
        technologies: ['Redis', 'Node.js', 'Docker'],
        highlights: ['Z highlight', 'M highlight'],
      };
      const canonical = canonicalizeProject(proj1);

      assert.deepEqual(canonical.bullets, ['A bullet', 'B bullet']);
      assert.deepEqual(canonical.technologies, ['Docker', 'Node.js', 'Redis']);
      assert.deepEqual(canonical.highlights, ['M highlight', 'Z highlight']);
    });

    test('reconciled projects produce deepStrictEqual canonical outputs regardless of merge order', () => {
      const projA = {
        name: 'Cloud Storage Proxy',
        bullets: ['Built S3-compatible chunked upload endpoint in Python.'],
        highlights: ['Implemented AES-256 client-side payload encryption.'],
        technologies: ['Python', 'FastAPI'],
      };
      const projB = {
        name: 'Cloud Storage Proxy',
        features: ['Streamed multi-part files directly to object store.'],
        technologies: ['FastAPI', 'Python', 'AWS S3'],
        description: 'High-throughput object storage proxy service.',
      };

      const target1 = { ...projA, bullets: [...projA.bullets], highlights: [...projA.highlights], technologies: [...projA.technologies] };
      mergeCandidateOwnedProjectContent(target1, projB);

      const target2 = { ...projB, features: [...projB.features], technologies: [...projB.technologies] };
      mergeCandidateOwnedProjectContent(target2, projA);

      const canonical1 = canonicalizeProject(target1);
      const canonical2 = canonicalizeProject(target2);

      // Complete deep equality of canonicalized representations
      assert.deepStrictEqual(canonical1, canonical2);
    });

    test('reconcileCandidateProjects returns deterministically ordered array regardless of input arrays order', () => {
      const projX = { name: 'Alpha Project', bullets: ['Built Alpha in Rust.'] };
      const projY = { name: 'Beta Project', bullets: ['Built Beta in Go.'] };

      const reconciled1 = reconcileCandidateProjects({
        resumeDataProjects: [projX],
        profileProjects: [projY],
      });

      const reconciled2 = reconcileCandidateProjects({
        resumeDataProjects: [projY],
        profileProjects: [projX],
      });

      assert.equal(reconciled1.length, 2);
      assert.equal(reconciled2.length, 2);
      // Both must be deterministically sorted by name/slug
      assert.equal(reconciled1[0].name, reconciled2[0].name);
      assert.equal(reconciled1[1].name, reconciled2[1].name);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 3. Physical PDF Geometry Analyzer & Acceptance Metrics
  // ─────────────────────────────────────────────────────────────────────────
  describe('3. Physical PDF Geometry Analyzer & Acceptance Metrics', () => {
    test('measurePdfBottom correctly computes bottom whitespace and page occupancy ratio', () => {
      const analyzer = new PdfGeometryAnalyzer();

      // Test with empty/invalid buffer fallback
      const emptyResult = analyzer.measurePdfBottom(Buffer.alloc(10));
      assert.equal(emptyResult.lowestY, 792);
      assert.equal(emptyResult.pageOccupancyRatio, 0);

      // Test mock PDF stream with standard coordinates
      // 792 pt height, margin 39.6 pt, lowest text at Y = 160 pt
      // usable height = 792 - 79.2 = 712.8 pt
      // bottom whitespace = 160 - 39.6 = 120.4 pt
      // occupancy = (712.8 - 120.4) / 712.8 = 83.1%
      const streamContent = 'BT\n1 0 0 1 72 700 Tm\n(Test Header) Tj\n0 -540 Td\n(Lowest Rendered Line) Tj\nET';
      const compressed = zlib.deflateSync(Buffer.from(streamContent));
      const mockPdf = Buffer.concat([
        Buffer.from('%PDF-1.5\n1 0 obj\n<< /Length ' + compressed.length + ' >>\nstream\n'),
        compressed,
        Buffer.from('\nendstream\nendobj\n%%EOF'),
      ]);

      const result = analyzer.measurePdfBottom(mockPdf);
      assert.ok(result.lowestY <= 170, `Expected lowestY around 160, got ${result.lowestY}`);
      assert.ok(result.bottomWhitespacePt > 0);
      assert.ok(result.pageOccupancyRatio >= 0.70 && result.pageOccupancyRatio <= 0.95);
    });

    test('computeAcceptanceMetrics returns all 10 required acceptance properties', () => {
      const analyzer = new PdfGeometryAnalyzer();
      const mockStructuredResume = {
        summary: {
          text: 'Passionate software engineer building resilient backend microservices and distributed data pipelines. Proven experience with Go, Kubernetes, and event-driven architectures. Dedicated to clean architecture and verifiable systems.',
        },
        projects: [
          {
            name: 'Task Scheduler',
            bullets: [
              { text: 'Built distributed scheduler in Go and Redis handling 50k events per second.' },
              { text: 'Implemented Raft consensus protocol ensuring high availability across nodes.' },
            ],
            highlights: ['Designed fault-tolerant leader election.'],
          },
          {
            name: 'API Gateway',
            bullets: [
              { text: 'Engineered high-throughput reverse proxy in Rust with zero-copy stream processing.' },
            ],
          },
        ],
        experience: [
          {
            company: 'Tech Corp',
            bullets: ['Led migration of monolith to Kubernetes.'],
          },
        ],
        problemSolving: {
          hasSection: true,
          bullets: ['Solved 450+ LeetCode problems covering trees, graphs, and dynamic programming.'],
        },
      };

      const mockPdf = Buffer.from('%PDF-1.5\n/Count 1\n%%EOF');
      const metrics = analyzer.computeAcceptanceMetrics({
        pdfBuffer: mockPdf,
        structuredResume: mockStructuredResume,
      });

      // Verify all 10 acceptance metric properties
      assert.equal(metrics.pageCount, 1);
      assert.equal(metrics.isSinglePage, true);
      assert.ok(metrics.summary.chars > 150);
      assert.equal(metrics.summary.sentenceCount, 3);
      assert.equal(metrics.projects.count, 2);
      assert.equal(metrics.projects.totalBullets, 3);
      assert.equal(metrics.experience.bulletsCount, 1);
      assert.equal(metrics.dsa.rendered, true);
      assert.ok(metrics.factUtilization.distinctFactsAvailable >= 3);
      assert.ok(metrics.factUtilization.utilizationRatio > 0);
      assert.ok(typeof metrics.geometry.bottomWhitespacePt === 'number');
      assert.ok(typeof metrics.geometry.pageOccupancyRatio === 'number');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // 4. Bounded Content-Utilization Optimizer Service
  // ─────────────────────────────────────────────────────────────────────────
  describe('4. Bounded Content-Utilization Optimizer Service', () => {
    test('optimizer terminates within maximum 5 deterministic iterations', async () => {
      let callCount = 0;
      const mockCompiler = {
        compileLatexToPdf: async () => {
          callCount++;
          // Simulate 1-page result with generous bottom whitespace
          return { pdfBuffer: Buffer.from('%PDF-1.5\n/Count 1\n%%EOF') };
        },
      };

      const mockGenerator = {
        generateTailoredResumeLatex: () => ({ texContent: '\\documentclass{article}\\begin{document}Resume\\end{document}' }),
      };

      const optimizer = new ResumeContentOptimizer({
        latexCompiler: mockCompiler,
        latexGenerator: mockGenerator,
      });

      const candidateProfile = {
        candidate: { displayName: 'Alice Candidate', canonicalEmail: 'alice@domain.org' },
        projects: [
          {
            name: 'Project Alpha',
            bullets: ['Bullet 1', 'Bullet 2', 'Bullet 3'],
          },
        ],
        skills: [{ name: 'JavaScript' }],
      };

      const jobPosting = { title: 'Software Engineer', requirements: ['JavaScript'] };

      const result = await optimizer.optimize({
        candidateProfile,
        jobPosting,
        options: { maxIterations: 5 },
      });

      assert.ok(result.iterationsRun <= OPTIMIZER_MAX_ITERATIONS, `Exceeded max iterations: ${result.iterationsRun}`);
      assert.ok(callCount <= OPTIMIZER_MAX_ITERATIONS, `Compiler called ${callCount} times`);
      assert.ok(result.iterationHistory.length <= OPTIMIZER_MAX_ITERATIONS);
      assert.equal(result.success, true);
    });

    test('optimizer rolls back immediately when an iteration overflows to page 2', async () => {
      let iteration = 0;
      const mockCompiler = {
        compileLatexToPdf: async () => {
          iteration++;
          // Iteration 1 is 1 page; Iteration 2 overflows to 2 pages
          if (iteration === 1) {
            return { pdfBuffer: Buffer.from('%PDF-1.5\n/Count 1\n%%EOF') };
          }
          return { pdfBuffer: Buffer.from('%PDF-1.5\n/Count 2\n%%EOF') };
        },
      };

      const mockAnalyzer = new PdfGeometryAnalyzer();
      // Mock measurePdfBottom: iteration 1 is sparse (120pt whitespace)
      mockAnalyzer.measurePdfBottom = () => ({ lowestY: 160, bottomWhitespacePt: 120, pageOccupancyRatio: 0.83 });
      mockAnalyzer._detectPageCount = (buf) => (buf.toString().includes('/Count 2') ? 2 : 1);

      const mockGenerator = {
        generateTailoredResumeLatex: () => ({ texContent: '\\documentclass{article}\\begin{document}Resume\\end{document}' }),
      };

      const optimizer = new ResumeContentOptimizer({
        latexCompiler: mockCompiler,
        latexGenerator: mockGenerator,
        geometryAnalyzer: mockAnalyzer,
      });

      const candidateProfile = {
        candidate: { displayName: 'Bob Candidate', canonicalEmail: 'bob@domain.org' },
        projects: [
          {
            id: 'proj-1',
            name: 'Project One',
            technologies: ['Go'],
            bullets: [
              'Architected resilient distributed microservices backend in Go using gRPC and Protocol Buffers.',
              'Engineered high-throughput concurrent worker pools with bounded channels and sync.WaitGroup.',
              'Profiled memory allocations and CPU utilization using pprof to minimize garbage collection pauses.',
              'Implemented Raft distributed consensus protocol ensuring high availability across cluster nodes.',
            ],
          },
        ],
        skills: [{ name: 'Go' }],
      };

      const jobPosting = {
        title: 'Backend Engineer',
        requirements: ['Go'],
        projectRankings: [
          {
            projectId: 'proj-1',
            projectName: 'Project One',
            relevanceScore: 95,
            matchedRequirements: ['Go'],
            relevanceBand: 'HIGH',
          },
        ],
      };

      const result = await optimizer.optimize({
        candidateProfile,
        jobPosting,
        options: { maxIterations: 5 },
      });

      // Must have executed 2 iterations (1 good, 1 overflow rollback) and stopped!
      assert.equal(result.iterationsRun, 2);
      assert.equal(result.success, true);
      assert.equal(result.geometry.bottomWhitespacePt, 120);
      assert.ok(result.iterationHistory[1].action.includes('ROLLBACK_OVERFLOW'));
    });

    test('optimizer NEVER invents facts and strictly selects candidate-owned content', async () => {
      const mockCompiler = {
        compileLatexToPdf: async () => ({ pdfBuffer: Buffer.from('%PDF-1.5\n/Count 1\n%%EOF') }),
      };
      const mockGenerator = {
        generateTailoredResumeLatex: () => ({ texContent: '\\documentclass{article}\\begin{document}Resume\\end{document}' }),
      };

      const optimizer = new ResumeContentOptimizer({
        latexCompiler: mockCompiler,
        latexGenerator: mockGenerator,
      });

      const authenticBullet1 = 'Architected event-driven microservices using Apache Kafka and PostgreSQL.';
      const authenticBullet2 = 'Implemented partition consumer pools with fault-tolerant checkpointing.';
      const candidateProfile = {
        candidate: { displayName: 'Carol Candidate', canonicalEmail: 'carol@domain.org' },
        projects: [
          {
            id: 'proj-kafka',
            name: 'Kafka Engine',
            technologies: ['Kafka', 'PostgreSQL'],
            bullets: [authenticBullet1, authenticBullet2],
          },
        ],
        skills: [{ name: 'Kafka' }],
      };

      const jobPosting = {
        title: 'Streaming Engineer',
        requirements: ['Kafka'],
        projectRankings: [
          {
            projectId: 'proj-kafka',
            projectName: 'Kafka Engine',
            relevanceScore: 92,
            matchedRequirements: ['Kafka'],
            relevanceBand: 'HIGH',
          },
        ],
      };

      const result = await optimizer.optimize({
        candidateProfile,
        jobPosting,
      });

      const renderedBullets = (result.structuredResume.projects[0]?.bullets || []).map((b) => b.text || b);
      assert.ok(renderedBullets.length > 0);
      // All rendered bullets must match authentic source facts
      for (const b of renderedBullets) {
        assert.ok(
          b.includes('Kafka') ||
            b.includes('event-driven') ||
            b.includes('PostgreSQL') ||
            b.includes('partition consumer') ||
            b.includes('checkpointing'),
          `Rendered unexpected bullet text: "${b}"`
        );
      }
    });
  });
});
