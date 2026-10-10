import { and, eq } from 'drizzle-orm';
import { candidates, resourceConnections, resources } from '../db/schema.js';
import {
  AuthorizationError,
  ConflictError,
  DependencyError,
  ValidationError,
} from '../errors/index.js';
import { connectorRegistry } from '../connectors/registry/connector-registry.js';
import { GitHubInstallationService } from './github-installation.service.js';
import { writeAuditRecord } from '../db/repositories/connection.repository.js';

const numericId = (value) =>
  /^[1-9]\d*$/.test(String(value || '')) && Number.isSafeInteger(Number(value));
export function githubRepositoryId(resource) {
  if (numericId(resource.externalResourceId)) return String(resource.externalResourceId);
  const legacyId = resource.metadata?.numericId || resource.metadata?.repositoryId;
  return numericId(legacyId) ? String(legacyId) : null;
}

// Selection is a resource lifecycle operation, not extraction or profile genesis.
export class GitHubRepositorySelectionService {
  constructor({
    db,
    registry = connectorRegistry,
    installationService = new GitHubInstallationService({ db }),
  }) {
    this.db = db;
    this.registry = registry;
    this.installationService = installationService;
  }

  async listAvailable(context, connection) {
    if (
      !context.userId ||
      connection.tenantId !== context.tenantId ||
      connection.userId !== context.userId ||
      connection.status !== 'ACTIVE' ||
      !numericId(connection.installationId) ||
      connection.metadata?.authorityPolicy !== 'personal-owner-or-org-owner-v1'
    ) {
      throw new AuthorizationError('A current, owned GitHub App connection is required');
    }
    const verified = await this.installationService.verifyGitHubInstallation(
      connection.installationId
    );
    if (String(verified.account.id) !== connection.externalAccountId) {
      throw new AuthorizationError(
        'GitHub installation account changed; reconnect before selecting repositories'
      );
    }
    if (!this.registry.has('GITHUB_APP'))
      throw new DependencyError('GitHub repository listing is unavailable');
    const connector = this.registry.get('GITHUB_APP');
    const result = [],
      cursors = new Set();
    let cursor = null;
    for (let page = 0; page < 100; page++) {
      let response;
      try {
        response = await connector.listResources(
          {
            ...context,
            connectionId: connection.id,
            installationId: connection.installationId,
            connectionStatus: connection.status,
          },
          { installationId: connection.installationId },
          { limit: 100, cursor, bypassCache: true }
        );
      } catch {
        throw new DependencyError(
          'GitHub repository access could not be verified; selection was not changed'
        );
      }
      if (
        !Array.isArray(response?.items) ||
        response.items.some(
          (repo) =>
            !numericId(repo.id) || typeof repo.fullName !== 'string' || !repo.fullName.includes('/')
        )
      ) {
        throw new DependencyError('GitHub returned an invalid repository listing');
      }
      result.push(...response.items);
      if (!response.hasMore) {
        if (response.totalCount !== undefined && response.totalCount !== result.length)
          throw new DependencyError('GitHub repository listing changed; retry selection');
        if (new Set(result.map((repo) => String(repo.id))).size !== result.length)
          throw new DependencyError('GitHub returned duplicate repository identities');
        return result;
      }
      if (!response.nextCursor || cursors.has(response.nextCursor))
        throw new DependencyError('GitHub repository pagination could not be completed');
      cursors.add(response.nextCursor);
      cursor = response.nextCursor;
    }
    throw new DependencyError('GitHub repository pagination exceeded its limit');
  }

  async select({ context, candidateId, connectionId, repositoryIds, existingOnly = false }) {
    if (!Array.isArray(repositoryIds) || repositoryIds.some((id) => !numericId(id)))
      throw new ValidationError('Select repositories by their numeric GitHub IDs');
    const selectedIds = new Set(repositoryIds.map(String));
    return this.db.transaction(async (tx) => {
      // Serialize selection/reconnect/disconnect for this connection. Never choose a foreign owner.
      const [connection] = await tx
        .select()
        .from(resourceConnections)
        .where(
          and(
            eq(resourceConnections.id, connectionId),
            eq(resourceConnections.tenantId, context.tenantId),
            eq(resourceConnections.userId, context.userId)
          )
        )
        .for('update');
      const [candidate] = await tx
        .select()
        .from(candidates)
        .where(
          and(
            eq(candidates.id, candidateId),
            eq(candidates.tenantId, context.tenantId),
            eq(candidates.userId, context.userId)
          )
        );
      if (!connection || !candidate)
        throw new AuthorizationError(
          'GitHub connection or candidate is outside the current owner scope'
        );
      const available = await this.listAvailable(context, connection);
      const byId = new Map(available.map((repo) => [String(repo.id), repo]));
      if ([...selectedIds].some((id) => !byId.has(id)))
        throw new ValidationError(
          'A selected repository is no longer accessible to this installation',
          'REPOSITORY_ACCESS_CHANGED'
        );
      const stored = await tx
        .select()
        .from(resources)
        .where(and(eq(resources.tenantId, context.tenantId), eq(resources.provider, 'GITHUB_APP')))
        .orderBy(resources.id)
        .for('update');
      const matched = new Map();
      for (const row of stored) {
        const id = githubRepositoryId(row);
        if (!id || !selectedIds.has(id)) continue;
        if (row.candidateId !== candidateId || row.connectionId !== connectionId)
          throw new ConflictError(
            'Repository is already associated with another candidate or connection'
          );
        if (matched.has(id))
          throw new ConflictError(
            'Ambiguous historical repository identity; review existing records'
          );
        matched.set(id, row);
      }
      const changes = [];
      for (const id of selectedIds) {
        const repo = byId.get(id),
          row = matched.get(id);
        if (
          !row &&
          (existingOnly ||
            stored.some((old) => !githubRepositoryId(old) && old.name === repo.fullName))
        )
          throw new ConflictError(
            'Historical repository requires verified immutable identity before relinking'
          );
        const values = {
          externalResourceId: id,
          name: repo.fullName,
          displayName: repo.fullName,
          url: repo.url || `https://github.com/${repo.fullName}`,
          isPrivate: Boolean(repo.isPrivate),
          status: 'ACTIVE',
        };
        if (row) {
          if (Object.entries(values).some(([key, value]) => row[key] !== value)) {
            await tx
              .update(resources)
              .set({ ...values, updatedAt: new Date() })
              .where(
                and(
                  eq(resources.id, row.id),
                  eq(resources.tenantId, context.tenantId),
                  eq(resources.candidateId, candidateId),
                  eq(resources.connectionId, connectionId)
                )
              );
            changes.push({
              resourceId: row.id,
              repositoryId: id,
              before: row.status,
              after: 'ACTIVE',
            });
          }
        } else {
          const [created] = await tx
            .insert(resources)
            .values({
              ...values,
              tenantId: context.tenantId,
              candidateId,
              connectionId,
              provider: 'GITHUB_APP',
              resourceType: 'REPOSITORY',
            })
            .returning();
          changes.push({ resourceId: created.id, repositoryId: id, before: null, after: 'ACTIVE' });
        }
      }
      for (const row of stored) {
        if (
          row.candidateId === candidateId &&
          row.connectionId === connectionId &&
          row.status === 'ACTIVE' &&
          !selectedIds.has(githubRepositoryId(row))
        ) {
          await tx
            .update(resources)
            .set({ status: 'DISCONNECTED', updatedAt: new Date() })
            .where(
              and(
                eq(resources.id, row.id),
                eq(resources.tenantId, context.tenantId),
                eq(resources.candidateId, candidateId),
                eq(resources.connectionId, connectionId)
              )
            );
          changes.push({
            resourceId: row.id,
            repositoryId: githubRepositoryId(row),
            before: 'ACTIVE',
            after: 'DISCONNECTED',
          });
        }
      }
      if (changes.length)
        await writeAuditRecord(tx, {
          ...context,
          eventType: 'github.repositories_selected',
          resourceId: connectionId,
          details: { candidateId, installationId: connection.installationId, changes },
        });
      return { success: true, count: selectedIds.size, changes };
    });
  }
}
