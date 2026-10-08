import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// Mock the provider boundary, not the extractor's integrity checks. Every tree
// blob and response hash is calculated from the actual fixture bytes.
export function pinGitHubFixture(connector) {
  const commitSha = 'c'.repeat(40);
  const blob = (content) =>
    createHash('sha1')
      .update(`blob ${Buffer.byteLength(content)}\0`)
      .update(content)
      .digest('hex');
  return {
    ...connector,
    async getRepository(_context, _credentials, repository) {
      return { id: 101, fullName: repository, defaultBranch: 'main' };
    },
    async getBranchHeadSha() {
      return { commitSha };
    },
    async getRepositoryTree(context, credentials, repository, options) {
      assert.equal(options.treeSha, commitSha);
      const result = await connector.getRepositoryTree(context, credentials, repository, options);
      const entries = await Promise.all(
        (result.entries || result.tree).map(async (entry) => {
          if (entry.type !== 'blob') return entry;
          const file = await connector.getFileContent(
            context,
            credentials,
            repository,
            entry.path,
            { ref: commitSha }
          );
          return { ...entry, sha: blob(file.content) };
        })
      );
      return { ...result, entries };
    },
    async getFileContent(context, credentials, repository, path, options) {
      assert.equal(options.ref, commitSha);
      const result = await connector.getFileContent(
        context,
        credentials,
        repository,
        path,
        options
      );
      return { ...result, sha: blob(result.content) };
    },
  };
}
