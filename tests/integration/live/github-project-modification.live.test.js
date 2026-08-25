/**
 * @file Live GitHub Project Modification Sandbox Integration Test (Task P9-003)
 *
 * Runs under live testing when real GitHub App credentials or PAT are configured.
 * Verifies live branch creation, commit creation, Draft PR creation, and cleanup.
 *
 * Safe Sandbox Invariants:
 * 1. Target repository: strictly user's designated repository (e.g. vishu1803/Ai-job-mcp)
 * 2. Target branch: strictly isolated feat/career-hub-live-* branch
 * 3. Draft PR: strictly draft: true with clear [Sandbox / Test] notice
 * 4. Cleanup: closes PR and deletes feature branch after verification
 * 5. Skips gracefully if live credentials are not present in environment.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { GitHubAppConnector } from '../../../src/connectors/github/github-connector.js';
import { GitHubAppAuthManager } from '../../../src/connectors/github/auth.js';
import { GitHubTokenCache } from '../../../src/connectors/github/token-cache.js';
import { createConnectorContext } from '../../../src/connectors/base/context.js';

dotenv.config();
const envLocalPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath, override: true });
}

const hasLiveGitHubCredentials = Boolean(
  process.env.GITHUB_APP_ID &&
  process.env.GITHUB_APP_PRIVATE_KEY &&
  process.env.GITHUB_APP_INSTALLATION_ID
);

describe('Live GitHub Project Modification Sandbox (P9-003)', () => {
  it('performs end-to-end live write sandbox verification against repository if credentials present', async (t) => {
    if (!hasLiveGitHubCredentials) {
      t.skip(
        'Skipping live GitHub write test: GITHUB_APP_* credentials not configured in environment'
      );
      return;
    }

    const tenantId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    const connectionId = crypto.randomUUID();
    const targetRepo = process.env.GITHUB_TEST_REPOSITORY || 'vishu1803/Ai-job-mcp';
    const targetBranch = `feat/career-hub-live-${Date.now()}`;
    const baseBranch = 'main';

    const tokenCache = new GitHubTokenCache();
    const authManager = new GitHubAppAuthManager({
      appId: process.env.GITHUB_APP_ID,
      privateKey: process.env.GITHUB_APP_PRIVATE_KEY,
      cache: tokenCache,
    });

    const connector = new GitHubAppConnector({ authManager });
    const context = createConnectorContext({
      tenantId,
      userId,
      connectionId,
      provider: 'GITHUB_APP',
      authType: 'APP_INSTALLATION',
    });

    const credentials = {
      installationId: process.env.GITHUB_APP_INSTALLATION_ID,
    };

    let createdBranch = null;
    let createdPrNumber = null;

    try {
      // 1. Get Live Base HEAD
      const baseHead = await connector.getBranchHeadSha(
        context,
        credentials,
        targetRepo,
        baseBranch
      );
      assert.ok(baseHead.commitSha, 'Must resolve base HEAD commit');

      // 2. Create Tree
      const tree = await connector.createGitTree(context, credentials, targetRepo, {
        baseTreeSha: baseHead.commitSha,
        treeEntries: [
          {
            path: 'docs/test-sandbox-evidence.md',
            mode: '100644',
            type: 'blob',
            content: `# Automated Live Write Sandbox Verification\n\nVerified at ${new Date().toISOString()}\n`,
          },
        ],
      });
      assert.ok(tree.treeSha, 'Must return tree SHA');

      // 3. Create Commit
      const commit = await connector.createGitCommit(context, credentials, targetRepo, {
        message: `feat(sandbox): automated live write verification [skip ci]\n\nCo-authored-by: Antigravity Career Hub <bot@careerhub.antigravity.dev>`,
        treeSha: tree.treeSha,
        parentCommitShas: [baseHead.commitSha],
      });
      assert.ok(commit.commitSha, 'Must return commit SHA');

      // 4. Create Ref
      const refRes = await connector.createGitRef(context, credentials, targetRepo, {
        ref: targetBranch,
        commitSha: commit.commitSha,
      });
      createdBranch = targetBranch;
      assert.ok(refRes.ref, 'Must create branch ref');

      // 5. Create Draft PR
      const pr = await connector.createDraftPullRequest(context, credentials, targetRepo, {
        title: `[Career Hub Sandbox] Automated Live Test ${Date.now()}`,
        head: targetBranch,
        base: baseBranch,
        body: `## [Career Hub Sandbox Test]\n\nThis is an automated live sandbox verification PR created by Antigravity Career Hub.\n\nBranch: \`${targetBranch}\``,
      });
      createdPrNumber = pr.prNumber;
      assert.ok(pr.prNumber > 0, 'Must create Draft PR');
      assert.equal(pr.draft, true, 'PR must be in draft state');
    } finally {
      // Cleanup: Close PR and delete branch
      if (createdPrNumber) {
        await connector
          .closePullRequest(context, credentials, targetRepo, createdPrNumber)
          .catch(() => {});
      }
      if (createdBranch) {
        await connector
          .deleteGitRef(context, credentials, targetRepo, createdBranch)
          .catch(() => {});
      }
    }
  });
});
