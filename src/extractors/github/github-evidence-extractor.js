/**
 * @file GitHub Evidence Extractor Service (P4-003)
 *
 * Converts repository data gathered through GitHubAppConnector into structured,
 * sanitized, tenant-scoped EvidenceItem records and candidate skill rollups.
 *
 * Strict Invariants:
 * - Zero code execution (no eval, no VM, no external CLI tool execution)
 * - Safe static declarative manifest parsing across Node, Python, Go, Rust
 * - Safe import scanning on entrypoint source files
 * - Mandatory secret scrubbing on excerpts (<= 1024 characters)
 * - SHA-256 deterministic fingerprint deduplication
 * - Mathematical candidate skill rollup scoring
 * - Strict multi-tenant isolation and transactional persistence
 */

import { eq, and, sql } from 'drizzle-orm';
import { createHash, randomUUID } from 'node:crypto';
import { db } from '../../db/index.js';
import {
  candidates,
  candidateIdentities,
  resources,
  skills,
  candidateSkills,
  evidenceItems,
  resourceConnections,
} from '../../db/schema.js';
import { NotFoundError, ValidationError } from '../../errors/index.js';
import { logger } from '../../utils/logger.js';
import { SecretScrubber } from './security/secret-scrubber.js';
import { TaxonomyMapper } from './taxonomy/taxonomy-mapper.js';
import { NodeManifestParser } from './manifest-parsers/node-manifest-parser.js';
import { PythonManifestParser } from './manifest-parsers/python-manifest-parser.js';
import { GoManifestParser } from './manifest-parsers/go-manifest-parser.js';
import { RustManifestParser } from './manifest-parsers/rust-manifest-parser.js';
import { ImportScanner } from './code-scanners/import-scanner.js';
import { computeEvidenceFingerprint } from './fingerprint.js';
import { SkillRollupCalculator } from './skill-rollup.js';
import { EVIDENCE_POLICY_VERSION } from '../../services/evidence/verification-policy.js';

export class GitHubEvidenceExtractorService {
  constructor() {
    this.nodeParser = new NodeManifestParser();
    this.pythonParser = new PythonManifestParser();
    this.goParser = new GoManifestParser();
    this.rustParser = new RustManifestParser();
    this.manifestParsers = [this.nodeParser, this.pythonParser, this.goParser, this.rustParser];
  }

  /**
   * Orchestrates deep repository inspection, declarative evidence extraction,
   * secret scrubbing, deduplication, and atomic persistence.
   *
   * @param {object} params
   * @param {import('../../connectors/base/context.js').ConnectorContext} params.context - Trusted request context.
   * @param {string} params.candidateId - Target candidate UUID.
   * @param {string} params.resourceId - Target repository resource UUID.
   * @param {import('../../connectors/github/github-connector.js').GitHubAppConnector} params.connector - GitHub connector instance.
   * @param {object} params.credentials - Connector credentials (e.g. { installationId }).
   * @returns {Promise<{ candidateId: string, resourceId: string, evidenceCount: number, skillsCount: number, skills: string[], durationMs: number }>}
   */
  async extractRepositoryEvidence({ context, candidateId, resourceId, connector, credentials }) {
    const startTime = Date.now();

    if (!context || !context.tenantId) {
      throw new ValidationError('Trusted connector context with tenantId is required');
    }
    if (!candidateId) {
      throw new ValidationError('candidateId is required for evidence extraction');
    }
    if (!resourceId) {
      throw new ValidationError('resourceId is required for evidence extraction');
    }
    if (!connector) {
      throw new ValidationError('GitHubAppConnector instance is required');
    }

    const tenantId = context.tenantId;

    // -------------------------------------------------------------------------
    // 1. Tenant Isolation & Resource Ownership Verification
    // -------------------------------------------------------------------------
    const [candidate] = await db
      .select()
      .from(candidates)
      .where(and(eq(candidates.id, candidateId), eq(candidates.tenantId, tenantId)));

    if (!candidate) {
      throw new NotFoundError(`Candidate not found in current tenant scope: ${candidateId}`);
    }
    if (!context.userId || candidate.userId !== context.userId) {
      throw new NotFoundError('Candidate not found in current user scope');
    }

    const [resource] = await db
      .select()
      .from(resources)
      .where(and(eq(resources.id, resourceId), eq(resources.tenantId, tenantId)));

    if (!resource) {
      throw new NotFoundError(`Resource not found in current tenant scope: ${resourceId}`);
    }
    const [connection] = await db
      .select()
      .from(resourceConnections)
      .where(
        and(
          eq(resourceConnections.id, resource.connectionId),
          eq(resourceConnections.tenantId, tenantId),
          eq(resourceConnections.userId, context.userId),
          eq(resourceConnections.status, 'ACTIVE')
        )
      );
    if (
      resource.candidateId !== candidateId ||
      resource.status !== 'ACTIVE' ||
      !connection ||
      context.connectionId !== resource.connectionId
    ) {
      throw new ValidationError('Active candidate-owned repository connection required');
    }

    if (resource.provider !== 'GITHUB_APP') {
      throw new ValidationError(
        `Extractor only supports GITHUB_APP resources (received: ${resource.provider})`
      );
    }

    // Retrieve verified candidate identities in this tenant
    const identities = await db
      .select()
      .from(candidateIdentities)
      .where(
        and(
          eq(candidateIdentities.candidateId, candidateId),
          eq(candidateIdentities.tenantId, tenantId)
        )
      );

    const verifiedGithubIds = new Set(
      identities
        .filter(
          (i) => i.verified && i.provider === 'GITHUB_APP' && /^\d+$/.test(i.externalAccountId)
        )
        .map((i) => i.externalAccountId)
    );

    logger.info(
      {
        tenantId,
        candidateId,
        resourceId,
        repoName: resource.name,
      },
      'Starting GitHub evidence extraction for candidate repository'
    );

    // -------------------------------------------------------------------------
    // 2. Fetch External Repository Data via GitHubAppConnector (Outside DB Tx)
    // -------------------------------------------------------------------------
    const externalResourceId = resource.externalResourceId;
    // Reserve a durable ingestion epoch BEFORE I/O. Starting revalidation invalidates
    // old proofs, including on a later 403/404/parser/DB failure. A stale run cannot win.
    const epoch = randomUUID();
    await db
      .update(resources)
      .set({
        metadata: sql`jsonb_set(${resources.metadata}, '{evidenceEpoch}', ${JSON.stringify(epoch)}::jsonb)`,
      })
      .where(and(eq(resources.id, resourceId), eq(resources.tenantId, tenantId)));
    const repository = await connector.getRepository(context, credentials, externalResourceId);
    if (
      !/^[1-9]\d*$/.test(String(repository?.id)) ||
      !/^[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/.test(repository?.fullName || '') ||
      (String(repository.id) !== externalResourceId && repository.fullName !== externalResourceId)
    ) {
      throw new ValidationError('Authoritative repository identity mismatch');
    }
    const head = await connector.getBranchHeadSha(
      context,
      credentials,
      externalResourceId,
      repository.defaultBranch
    );
    const commitSha = head?.commitSha;
    if (!/^[a-f0-9]{40}$/.test(commitSha || ''))
      throw new ValidationError('Immutable commit required');
    const pinnedFiles = new Map();

    // Fetch repository tree
    let treeEntries = [];
    const treeResult = await connector.getRepositoryTree(context, credentials, externalResourceId, {
      recursive: true,
      treeSha: commitSha,
    });
    treeEntries = treeResult?.entries || treeResult?.tree || [];
    if (treeResult?.truncated || !Array.isArray(treeEntries))
      throw new ValidationError('Incomplete repository tree');

    // Fetch languages
    let languages = {};
    try {
      const langResult = await connector.getLanguages(context, credentials, externalResourceId);
      languages = langResult?.languages || {};
    } catch {
      throw new ValidationError(
        'Repository language retrieval failed; evidence revalidation required',
        'SOURCE_REVALIDATION_REQUIRED'
      );
    }

    // Fetch README
    let readmeContent = '';
    try {
      const readmeResult = await connector.getReadme(context, credentials, externalResourceId);
      readmeContent = readmeResult?.content || '';
    } catch (error) {
      if (error.statusCode !== 404 && error.status !== 404) throw error;
      // An absent optional README creates no README evidence.
    }

    // Fetch recent commits
    let recentCommits = [];
    try {
      const commitsResult = await connector.getRecentCommits(
        context,
        credentials,
        externalResourceId,
        {
          limit: 10,
          sha: commitSha,
        }
      );
      recentCommits = commitsResult?.commits || [];
    } catch {
      throw new ValidationError(
        'Repository commit retrieval failed; evidence revalidation required',
        'SOURCE_REVALIDATION_REQUIRED'
      );
    }

    // Identify candidate manifests from tree (up to 10)
    const manifestTreeItems = treeEntries
      .filter((e) => e.type === 'blob')
      .filter((e) => this.manifestParsers.some((p) => p.canParse(e.path)))
      .slice(0, 10);

    // Identify scannable entrypoint files for import analysis (up to 15)
    const sourceTreeItems = treeEntries
      .filter((e) => e.type === 'blob')
      .filter((e) => ImportScanner.isScannableSourceFile(e.path))
      .slice(0, 15);

    // Fetch file contents for manifests
    const fetchedManifests = [];
    for (const item of manifestTreeItems) {
      const fileData = await connector.getFileContent(
        context,
        credentials,
        externalResourceId,
        item.path,
        { ref: commitSha }
      );
      if (fileData?.content) {
        const blobSha = createHash('sha1')
          .update(`blob ${Buffer.byteLength(fileData.content)}\0`)
          .update(fileData.content)
          .digest('hex');
        if (blobSha !== item.sha || blobSha !== fileData.sha)
          throw new ValidationError('Git blob integrity mismatch');
        pinnedFiles.set(item.path, blobSha);
        fetchedManifests.push({
          path: item.path,
          content: fileData.content,
          commitSha,
        });
      }
    }

    // Fetch file contents for entrypoint source files
    const fetchedSources = [];
    for (const item of sourceTreeItems) {
      const fileData = await connector.getFileContent(
        context,
        credentials,
        externalResourceId,
        item.path,
        { ref: commitSha }
      );
      if (fileData?.content) {
        const blobSha = createHash('sha1')
          .update(`blob ${Buffer.byteLength(fileData.content)}\0`)
          .update(fileData.content)
          .digest('hex');
        if (blobSha !== item.sha || blobSha !== fileData.sha)
          throw new ValidationError('Git blob integrity mismatch');
        pinnedFiles.set(item.path, blobSha);
        fetchedSources.push({
          path: item.path,
          content: fileData.content,
          commitSha,
        });
      }
    }

    // -------------------------------------------------------------------------
    // 3. Declarative Evidence Parsing & Normalization
    // -------------------------------------------------------------------------
    const rawEvidenceItems = [];

    // A. Parse Manifests
    for (const manifest of fetchedManifests) {
      for (const parser of this.manifestParsers) {
        if (parser.canParse(manifest.path)) {
          const parsedDeps = parser.parse(manifest.content, manifest.path);
          for (const dep of parsedDeps) {
            rawEvidenceItems.push({
              rawName: dep.name,
              categoryHint: 'TOOL',
              evidenceType: 'PACKAGE_MANIFEST_DEPENDENCY',
              sourceLocation: {
                filePath: manifest.path,
                commitSha: manifest.commitSha,
                lineRange: dep.lineRange,
              },
              rawExcerpt: dep.rawExcerpt || dep.name,
              confidenceScore: dep.confidence,
              metadata: {
                versionConstraint: dep.versionConstraint || null,
                isDev: dep.isDev || false,
                isIndirect: dep.isIndirect || false,
              },
            });
          }
          break;
        }
      }
    }

    // B. Scan Code Imports
    for (const source of fetchedSources) {
      const parsedImports = ImportScanner.scanImports(source.content, source.path);
      for (const imp of parsedImports) {
        rawEvidenceItems.push({
          rawName: imp.packageName,
          categoryHint: 'TOOL',
          evidenceType: 'CODE_IMPORT_USAGE',
          sourceLocation: {
            filePath: source.path,
            commitSha: source.commitSha,
            lineRange: imp.lineRange,
          },
          rawExcerpt: imp.rawExcerpt,
          confidenceScore: imp.confidence,
          metadata: {
            rawImport: imp.rawImport,
            extractionMethod: imp.extractionMethod,
          },
        });
      }
    }

    // C. Infrastructure & Configuration Pattern Matching (FILE_PATTERN_MATCH)
    const treePaths = new Set(treeEntries.map((e) => e.path));

    const CONFIG_PATTERNS = [
      { pattern: 'Dockerfile', slug: 'docker', confidence: 0.9, category: 'CLOUD_DEVOPS' },
      {
        pattern: 'docker-compose.yml',
        slug: 'docker-compose',
        confidence: 0.9,
        category: 'CLOUD_DEVOPS',
      },
      {
        pattern: 'compose.yaml',
        slug: 'docker-compose',
        confidence: 0.9,
        category: 'CLOUD_DEVOPS',
      },
      { pattern: 'tsconfig.json', slug: 'typescript', confidence: 0.95, category: 'LANGUAGE' },
      { pattern: 'drizzle.config.js', slug: 'drizzle-orm', confidence: 0.9, category: 'DATABASE' },
      { pattern: 'drizzle.config.ts', slug: 'drizzle-orm', confidence: 0.9, category: 'DATABASE' },
      { pattern: 'prisma/schema.prisma', slug: 'prisma', confidence: 0.9, category: 'DATABASE' },
      {
        pattern: 'tailwind.config.js',
        slug: 'tailwindcss',
        confidence: 0.9,
        category: 'FRAMEWORK',
      },
      {
        pattern: 'tailwind.config.ts',
        slug: 'tailwindcss',
        confidence: 0.9,
        category: 'FRAMEWORK',
      },
    ];

    for (const cfg of CONFIG_PATTERNS) {
      if (treePaths.has(cfg.pattern)) {
        rawEvidenceItems.push({
          rawName: cfg.slug,
          categoryHint: cfg.category,
          evidenceType: 'FILE_PATTERN_MATCH',
          sourceLocation: {
            filePath: cfg.pattern,
            commitSha: 'HEAD',
          },
          rawExcerpt: `Configuration file present: ${cfg.pattern}`,
          confidenceScore: cfg.confidence,
          metadata: { pattern: cfg.pattern },
        });
      }
    }

    // Check .github/workflows/
    const workflowFile = treeEntries.find((e) => e.path?.startsWith('.github/workflows/'));
    if (workflowFile) {
      rawEvidenceItems.push({
        rawName: 'github-actions',
        categoryHint: 'CLOUD_DEVOPS',
        evidenceType: 'FILE_PATTERN_MATCH',
        sourceLocation: {
          filePath: workflowFile.path,
          commitSha: 'HEAD',
        },
        rawExcerpt: `CI/CD workflow present: ${workflowFile.path}`,
        confidenceScore: 0.85,
        metadata: { workflowPath: workflowFile.path },
      });
    }

    // D. Programming Language Signals from Repository Metadata
    for (const [langName, bytes] of Object.entries(languages)) {
      if (typeof bytes === 'number' && bytes > 1000) {
        rawEvidenceItems.push({
          rawName: langName.toLowerCase(),
          categoryHint: 'LANGUAGE',
          evidenceType: 'FILE_PATTERN_MATCH',
          sourceLocation: {
            filePath: 'repository-languages',
            commitSha: 'HEAD',
          },
          rawExcerpt: `Language breakdown: ${langName} (${bytes} bytes)`,
          confidenceScore: 0.85,
          metadata: { languageBytes: bytes },
        });
      }
    }

    // E. Directory Structure Architectural Evidence (DIRECTORY_STRUCTURE)
    const DIR_PATTERNS = [
      {
        prefix: 'src/connectors',
        slug: 'architecture',
        name: 'Connector Pattern',
        confidence: 0.4,
      },
      {
        prefix: 'tests/integration',
        slug: 'architecture',
        name: 'Integration Testing',
        confidence: 0.4,
      },
      { prefix: 'drizzle', slug: 'drizzle-orm', name: 'Drizzle Migrations', confidence: 0.4 },
      { prefix: 'prisma', slug: 'prisma', name: 'Prisma Migrations', confidence: 0.4 },
    ];

    for (const dir of DIR_PATTERNS) {
      const matchingEntry = treeEntries.find((e) => e.path?.startsWith(dir.prefix));
      if (matchingEntry) {
        rawEvidenceItems.push({
          rawName: dir.slug,
          categoryHint: 'ARCHITECTURE',
          evidenceType: 'DIRECTORY_STRUCTURE',
          sourceLocation: {
            filePath: matchingEntry.path,
            commitSha: 'HEAD',
          },
          rawExcerpt: `Directory pattern detected: ${matchingEntry.path}`,
          confidenceScore: dir.confidence,
          metadata: { directoryPattern: dir.prefix },
        });
      }
    }

    // F. README Signals (README_SPECIFICATION, bounded confidence 0.60)
    if (readmeContent) {
      const boundedReadme = readmeContent.slice(0, 10000);
      const README_KEYWORD_PATTERNS = [
        { regex: /\b(Fastify)\b/i, slug: 'fastify', category: 'FRAMEWORK' },
        { regex: /\b(PostgreSQL|Postgres)\b/i, slug: 'postgresql', category: 'DATABASE' },
        { regex: /\b(Drizzle(?:\s+ORM)?)\b/i, slug: 'drizzle-orm', category: 'DATABASE' },
        { regex: /\b(React(?:JS)?)\b/i, slug: 'react', category: 'FRAMEWORK' },
        { regex: /\b(Docker)\b/i, slug: 'docker', category: 'CLOUD_DEVOPS' },
        { regex: /\b(Kubernetes|k8s)\b/i, slug: 'kubernetes', category: 'CLOUD_DEVOPS' },
        { regex: /\b(FastAPI)\b/i, slug: 'fastapi', category: 'FRAMEWORK' },
      ];

      for (const kw of README_KEYWORD_PATTERNS) {
        const match = boundedReadme.match(kw.regex);
        if (match) {
          // Extract sentence context around match (max 200 chars)
          const idx = match.index || 0;
          const start = Math.max(0, idx - 50);
          const end = Math.min(boundedReadme.length, idx + 150);
          const excerptSnippet = boundedReadme.slice(start, end).replace(/\r?\n/g, ' ').trim();

          rawEvidenceItems.push({
            rawName: kw.slug,
            categoryHint: kw.category,
            evidenceType: 'README_SPECIFICATION',
            sourceLocation: {
              filePath: 'README.md',
              commitSha: 'HEAD',
            },
            rawExcerpt: excerptSnippet,
            confidenceScore: 0.6,
            metadata: { keywordMatched: match[0] },
          });
        }
      }
    }

    // G. Candidate Commit Contributions (COMMIT_CONTRIBUTION, confidence 0.50)
    for (const commit of recentCommits) {
      const isCandidateAuthor = verifiedGithubIds.has(String(commit.author?.id));

      if (isCandidateAuthor && commit.message) {
        // Match conventional commit messages: feat(scope): message
        const convMatch = commit.message.match(
          /^(?:feat|fix|refactor|perf|test)\(([^)]+)\):\s*(.+)$/i
        );
        if (convMatch) {
          const scope = convMatch[1].trim().toLowerCase();
          const cleanExcerpt = commit.message.slice(0, 300);

          rawEvidenceItems.push({
            rawName: scope,
            categoryHint: 'CONCEPT',
            evidenceType: 'COMMIT_CONTRIBUTION',
            sourceLocation: {
              filePath: 'git-commit',
              commitSha: commit.sha || 'HEAD',
            },
            rawExcerpt: cleanExcerpt,
            confidenceScore: 0.5,
            metadata: {
              commitSha: commit.sha,
              commitDate: commit.date,
              githubAuthorId: String(commit.author.id),
              attributionMethod: 'GITHUB_ACCOUNT_ASSOCIATION',
            },
          });
        }
      }
    }

    // -------------------------------------------------------------------------
    // 4. Sanitize Excerpts, Normalize Skills & Compute Deterministic Fingerprints
    // -------------------------------------------------------------------------
    const processedEvidence = [];
    const skillSlugMap = new Map(); // slug -> normalized skill object

    for (const item of rawEvidenceItems) {
      // 1. Normalize Skill
      const normalizedSkill = TaxonomyMapper.normalize(item.rawName, item.categoryHint);

      // Handle child packages that map to canonical parent skills (e.g. tailwind-merge -> tailwindcss)
      if (normalizedSkill.parentMappings && normalizedSkill.parentMappings.length > 0) {
        for (const parent of normalizedSkill.parentMappings) {
          const parentNorm = TaxonomyMapper.normalize(parent.parentSlug, item.categoryHint);
          if (parentNorm.category !== 'NOISE' && parentNorm.isSkillWorthy) {
            skillSlugMap.set(parentNorm.slug, parentNorm);
            const sanitizedExcerpt = SecretScrubber.sanitizeExcerpt(item.rawExcerpt, 1024);
            const fingerprint = computeEvidenceFingerprint({
              tenantId,
              candidateId,
              resourceId,
              skillSlug: parentNorm.slug,
              evidenceType: item.evidenceType,
              filePath: item.sourceLocation.filePath,
              commitSha: item.sourceLocation.commitSha,
            });

            processedEvidence.push({
              tenantId,
              candidateId,
              resourceId,
              skillSlug: parentNorm.slug,
              evidenceType: item.evidenceType,
              sourceProvider: 'GITHUB_APP',
              sourceLocation: item.sourceLocation,
              excerpt: sanitizedExcerpt,
              confidenceScore: Math.min(item.confidenceScore, parent.confidence),
              metadata: {
                ...item.metadata,
                derivedFromPackage: item.rawName,
                isChildPackageEvidence: true,
                fingerprint,
              },
              fingerprint,
            });
          }
        }
        continue;
      }

      // Skip noise and non-worthy skills (micro-utilities, middleware, stdlib, internal modules, configs)
      if (normalizedSkill.category === 'NOISE' || !normalizedSkill.isSkillWorthy) {
        logger.debug(
          { rawName: item.rawName, slug: normalizedSkill.slug, evidenceType: item.evidenceType },
          'Skipping evidence for non-worthy skill / noise'
        );
        continue;
      }

      skillSlugMap.set(normalizedSkill.slug, normalizedSkill);

      // 2. Scrub & Bound Excerpt
      const sanitizedExcerpt = SecretScrubber.sanitizeExcerpt(item.rawExcerpt, 1024);

      // 3. Compute Fingerprint
      const fingerprint = computeEvidenceFingerprint({
        tenantId,
        candidateId,
        resourceId,
        skillSlug: normalizedSkill.slug,
        evidenceType: item.evidenceType,
        filePath: item.sourceLocation.filePath,
        commitSha: item.sourceLocation.commitSha,
      });

      processedEvidence.push({
        tenantId,
        candidateId,
        resourceId,
        skillSlug: normalizedSkill.slug,
        evidenceType: item.evidenceType,
        sourceProvider: 'GITHUB_APP',
        sourceLocation: item.sourceLocation,
        excerpt: sanitizedExcerpt,
        confidenceScore: item.confidenceScore,
        metadata: {
          ...item.metadata,
          fingerprint,
        },
        fingerprint,
      });
    }

    // -------------------------------------------------------------------------
    // 5. Database Persistence & Rollup in Atomic Transaction
    // -------------------------------------------------------------------------
    const uniqueSkills = Array.from(skillSlugMap.values());
    const persistedSkills = [];

    for (const ev of processedEvidence) {
      const loc = ev.sourceLocation;
      const isStaticReference =
        ev.evidenceType === 'CODE_IMPORT_USAGE' &&
        ev.metadata.extractionMethod === 'ACORN_AST' &&
        pinnedFiles.has(loc.filePath);
      ev.metadata.verification = {
        version: EVIDENCE_POLICY_VERSION,
        status: isStaticReference ? 'VERIFIED' : 'OBSERVED',
        scope: isStaticReference ? 'REPOSITORY_STATIC_REFERENCE' : 'REPOSITORY_OBSERVATION',
        method: isStaticReference ? 'ACORN_AST' : ev.evidenceType,
        validation: isStaticReference ? 'PINNED_TREE_AND_GIT_BLOB' : 'UNVERIFIED_SIGNAL',
        tenantId,
        candidateId,
        resourceId,
        epoch,
        repositoryId: String(repository.id),
        repository: repository.fullName,
        repositoryOwner: repository.fullName.split('/')[0],
        branchRef: head.ref || null,
        repositoryUrl: `https://github.com/${repository.fullName}`,
        commitSha: loc.commitSha,
        filePath: loc.filePath,
        lineRange: loc.lineRange || null,
        blobSha: pinnedFiles.get(loc.filePath) || null,
        observedAt: new Date().toISOString(),
        attribution: {
          status: 'UNATTRIBUTED',
          reason: 'Repository access does not establish authorship or proficiency',
        },
        fact: isStaticReference
          ? `Repository ${repository.fullName} contains a static module reference to "${ev.metadata.rawImport}" in ${loc.filePath}:${loc.lineRange.start} at ${loc.commitSha}.`
          : null,
      };
    }

    await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(resources)
        .where(eq(resources.id, resourceId))
        .for('update');
      const [activeConnection] = await tx
        .select()
        .from(resourceConnections)
        .where(eq(resourceConnections.id, resource.connectionId))
        .for('share');
      if (
        current?.metadata?.evidenceEpoch !== epoch ||
        current.status !== 'ACTIVE' ||
        current.candidateId !== candidateId ||
        current.connectionId !== resource.connectionId ||
        activeConnection?.status !== 'ACTIVE' ||
        activeConnection.userId !== context.userId
      ) {
        throw new ValidationError(
          'Repository access changed during extraction; revalidation required'
        );
      }
      // 1. Upsert / Ensure all canonical skills exist in global taxonomy
      for (const skill of uniqueSkills) {
        const [existing] = await tx.select().from(skills).where(eq(skills.slug, skill.slug));

        if (!existing) {
          const [inserted] = await tx
            .insert(skills)
            .values({
              slug: skill.slug,
              name: skill.name,
              category: skill.category,
              aliases: [skill.slug],
            })
            .returning();
          persistedSkills.push(inserted);
        } else {
          persistedSkills.push(existing);
        }
      }

      const skillIdBySlug = new Map(persistedSkills.map((s) => [s.slug, s.id]));

      // 2. Upsert Evidence Items (Idempotent by fingerprint)
      const existingEvidence = await tx
        .select()
        .from(evidenceItems)
        .where(
          and(
            eq(evidenceItems.tenantId, tenantId),
            eq(evidenceItems.candidateId, candidateId),
            eq(evidenceItems.resourceId, resourceId)
          )
        );

      const existingByFingerprint = new Map();
      for (const ev of existingEvidence) {
        if (ev.metadata?.fingerprint) {
          existingByFingerprint.set(ev.metadata.fingerprint, ev);
        }
      }

      for (const ev of processedEvidence) {
        const skillId = skillIdBySlug.get(ev.skillSlug) || null;
        const existingItem = existingByFingerprint.get(ev.fingerprint);

        if (existingItem) {
          // Update timestamp and confidence if higher
          await tx
            .update(evidenceItems)
            .set({
              confidenceScore: Math.max(existingItem.confidenceScore, ev.confidenceScore),
              detectedAt: new Date(),
              metadata: { ...existingItem.metadata, ...ev.metadata },
            })
            .where(eq(evidenceItems.id, existingItem.id));
        } else {
          // Insert new evidence node
          await tx.insert(evidenceItems).values({
            tenantId: ev.tenantId,
            candidateId: ev.candidateId,
            resourceId: ev.resourceId,
            skillId,
            evidenceType: ev.evidenceType,
            sourceProvider: ev.sourceProvider,
            sourceLocation: ev.sourceLocation,
            excerpt: ev.excerpt,
            confidenceScore: ev.confidenceScore,
            metadata: ev.metadata,
          });
        }
      }

      // 3. Compute and Upsert Candidate Skills Rollups
      // Retrieve all current evidence items for this candidate
      const allCandidateEvidence = await tx
        .select()
        .from(evidenceItems)
        .where(
          and(eq(evidenceItems.tenantId, tenantId), eq(evidenceItems.candidateId, candidateId))
        );

      // Group evidence by skillId
      const evidenceBySkillId = new Map();
      for (const item of allCandidateEvidence) {
        if (!item.skillId) continue;
        if (!evidenceBySkillId.has(item.skillId)) {
          evidenceBySkillId.set(item.skillId, []);
        }
        evidenceBySkillId.get(item.skillId).push(item);
      }

      // Upsert candidate_skills
      for (const [skillId, items] of evidenceBySkillId.entries()) {
        const skillMeta = persistedSkills.find((s) => s.id === skillId);
        if (!skillMeta) continue;

        const rollup = SkillRollupCalculator.calculateRollup(items);

        const [existingCandidateSkill] = await tx
          .select()
          .from(candidateSkills)
          .where(
            and(
              eq(candidateSkills.tenantId, tenantId),
              eq(candidateSkills.candidateId, candidateId),
              eq(candidateSkills.skillId, skillId)
            )
          );

        if (existingCandidateSkill) {
          await tx
            .update(candidateSkills)
            .set({
              category: skillMeta.category,
              provenanceStatus: rollup.provenanceStatus,
              confidenceScore: rollup.confidenceScore,
              evidenceCount: rollup.evidenceCount,
              firstObservedAt: rollup.firstObservedAt,
              lastObservedAt: rollup.lastObservedAt,
              updatedAt: new Date(),
            })
            .where(eq(candidateSkills.id, existingCandidateSkill.id));
        } else {
          await tx.insert(candidateSkills).values({
            tenantId,
            candidateId,
            skillId,
            category: skillMeta.category,
            provenanceStatus: rollup.provenanceStatus,
            confidenceScore: rollup.confidenceScore,
            evidenceCount: rollup.evidenceCount,
            firstObservedAt: rollup.firstObservedAt,
            lastObservedAt: rollup.lastObservedAt,
          });
        }
      }

      // 4. Update Resource sync timestamp
      await tx
        .update(resources)
        .set({
          lastSyncedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(resources.id, resourceId));
    });

    const durationMs = Date.now() - startTime;
    const extractedSkillSlugs = Array.from(skillSlugMap.keys());

    logger.info(
      {
        tenantId,
        candidateId,
        resourceId,
        evidenceCount: processedEvidence.length,
        skillsCount: extractedSkillSlugs.length,
        durationMs,
      },
      'Completed GitHub evidence extraction for repository'
    );

    return {
      candidateId,
      resourceId,
      evidenceCount: processedEvidence.length,
      skillsCount: extractedSkillSlugs.length,
      skills: extractedSkillSlugs,
      durationMs,
    };
  }
}
