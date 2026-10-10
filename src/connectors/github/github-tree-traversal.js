import { createHash } from 'node:crypto';
import { incomplete } from './github-sync-budget.js';

const SHA = /^[a-f0-9]{40}$/;
const excludedDirectories = new Set([
  '.git',
  'node_modules',
  'vendor',
  'dist',
  'build',
  'coverage',
  '.next',
  '.venv',
  'venv',
  '__pycache__',
  'target',
]);

function entries(response, expectedSha, recursive) {
  if (
    !response ||
    !SHA.test(response.sha || '') ||
    (expectedSha && response.sha !== expectedSha) ||
    !Array.isArray(response.tree) ||
    typeof response.truncated !== 'boolean'
  )
    throw incomplete('MALFORMED_OR_CHANGED_TREE');
  const seen = new Set();
  for (const e of response.tree) {
    const parts = typeof e?.path === 'string' ? e.path.split('/') : [];
    const modeValid =
      (e?.type === 'tree' && e.mode === '040000') ||
      (e?.type === 'blob' && ['100644', '100755', '120000'].includes(e.mode)) ||
      (e?.type === 'commit' && e.mode === '160000');
    if (
      !parts.length ||
      parts.some((p) => !p || p === '.' || p === '..' || /[\0\\]/.test(p)) ||
      (!recursive && parts.length !== 1) ||
      !SHA.test(e.sha || '') ||
      !modeValid ||
      seen.has(e.path) ||
      (e.size !== undefined && (!Number.isSafeInteger(e.size) || e.size < 0))
    )
      throw incomplete('MALFORMED_TREE_ENTRY');
    seen.add(e.path);
  }
  return response.tree;
}

// Git's tree object ordering uses a trailing slash for directories, and raw SHA bytes.
function assertTreeHash(items, expectedSha) {
  const sorted = [...items].sort((a, b) =>
    Buffer.compare(
      Buffer.from(a.path + (a.type === 'tree' ? '/' : '')),
      Buffer.from(b.path + (b.type === 'tree' ? '/' : ''))
    )
  );
  const body = Buffer.concat(
    sorted.flatMap((e) => [
      Buffer.from(`${e.mode === '040000' ? '40000' : e.mode} ${e.path}\0`),
      Buffer.from(e.sha, 'hex'),
    ])
  );
  const actual = createHash('sha1').update(`tree ${body.length}\0`).update(body).digest('hex');
  if (actual !== expectedSha) throw incomplete('TREE_INTEGRITY_MISMATCH');
}

function assertRecursiveHashes(raw, rootSha) {
  const directories = new Map([['', { sha: rootSha, children: [] }]]);
  for (const e of raw) if (e.type === 'tree') directories.set(e.path, { sha: e.sha, children: [] });
  for (const e of raw) {
    const parts = e.path.split('/');
    const parent = directories.get(parts.slice(0, -1).join('/'));
    if (!parent) throw incomplete('MISSING_SUBTREE');
    parent.children.push({ ...e, path: parts.at(-1) });
  }
  for (const directory of directories.values()) assertTreeHash(directory.children, directory.sha);
}

export async function traverseGitTree({ request, identity, commitPinned, budget, isBinary }) {
  budget.assertActive();
  let rootSha;
  if (commitPinned) {
    const commit = await request(`/git/commits/${identity}`);
    if (commit?.sha !== identity || !SHA.test(commit?.tree?.sha || ''))
      throw incomplete('COMMIT_TREE_BINDING_INVALID');
    rootSha = commit.tree.sha;
  }
  const recursive = await request(
    `/git/trees/${rootSha || encodeURIComponent(identity)}?recursive=1`
  );
  const raw = entries(recursive, rootSha, true);
  rootSha = recursive.sha;
  let files = 0;
  let directories = 0;
  const result = [];
  const exclusions = new Set();
  const accept = (e) => {
    budget.assertActive();
    const parts = e.path.split('/');
    const excludedAt = parts.findIndex(
      (part, i) => excludedDirectories.has(part) && (i < parts.length - 1 || e.type === 'tree')
    );
    if (excludedAt >= 0) {
      exclusions.add(parts.slice(0, excludedAt + 1).join('/'));
      return false;
    }
    if (parts.length > budget.limits.maxDepth) throw incomplete('DEPTH_LIMIT');
    if (e.type === 'tree') {
      if (++directories > budget.limits.maxDirectories) throw incomplete('DIRECTORY_LIMIT');
    } else if (++files > budget.limits.maxFiles) throw incomplete('FILE_COUNT_LIMIT');
    if (e.type === 'commit' || e.mode === '120000' || (e.type === 'blob' && isBinary(e.path))) {
      exclusions.add(e.path);
      return false;
    }
    result.push({ ...e, depth: parts.length });
    return true;
  };
  if (!recursive.truncated) {
    assertRecursiveHashes(raw, rootSha);
    for (const e of raw) accept(e);
  } else {
    // Discard the partial recursive listing. Rebuild from complete immutable direct trees.
    const queue = [{ sha: rootSha, prefix: '' }];
    for (let cursor = 0; cursor < queue.length;) {
      const batch = queue.slice(cursor, cursor + budget.limits.concurrency);
      cursor += batch.length;
      const responses = await Promise.all(batch.map((node) => request(`/git/trees/${node.sha}`)));
      for (let index = 0; index < batch.length; index++) {
        const node = batch[index];
        const response = responses[index];
        const children = entries(response, node.sha, false);
        if (response.truncated) throw incomplete('DIRECT_SUBTREE_TRUNCATED');
        assertTreeHash(children, node.sha);
        for (const child of children) {
          const e = { ...child, path: node.prefix + child.path };
          if (accept(e) && e.type === 'tree') queue.push({ sha: e.sha, prefix: `${e.path}/` });
        }
      }
    }
  }
  result.sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)));
  return {
    sha: rootSha,
    commitSha: commitPinned ? identity : null,
    entries: result,
    totalEntries: result.length,
    truncated: false,
    complete: true,
    recoveredTruncation: recursive.truncated,
    scope: 'SOURCE_TREE_WITH_EXPLICIT_EXCLUSIONS',
    excludedPaths: [...exclusions].sort(),
    files,
    directories,
  };
}
