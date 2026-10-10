import { createHash } from 'node:crypto';

// Independent Git object fixture builder. The REST responses use real tree/blob IDs.
export function gitObject(type, body) {
  const bytes = Buffer.from(body);
  return createHash('sha1').update(`${type} ${bytes.length}\0`).update(bytes).digest('hex');
}

export function treeFixture(files) {
  const directories = new Map([['', []]]);
  const contents = new Map();
  for (const [path, content] of Object.entries(files)) {
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++) {
      const directory = parts.slice(0, i).join('/');
      if (!directories.has(directory)) directories.set(directory, []);
    }
    const entry = {
      path: parts.at(-1),
      mode: '100644',
      type: 'blob',
      sha: gitObject('blob', content),
      size: Buffer.byteLength(content),
    };
    directories.get(parts.slice(0, -1).join('/')).push(entry);
    contents.set(path, {
      ...entry,
      path,
      content: Buffer.from(content).toString('base64'),
      encoding: 'base64',
    });
  }
  const trees = new Map();
  const shas = new Map();
  for (const directory of [...directories.keys()].sort(
    (a, b) => b.split('/').length - a.split('/').length || b.length - a.length
  )) {
    const entries = directories.get(directory);
    entries.sort((a, b) =>
      Buffer.compare(
        Buffer.from(a.path + (a.type === 'tree' ? '/' : '')),
        Buffer.from(b.path + (b.type === 'tree' ? '/' : ''))
      )
    );
    const body = Buffer.concat(
      entries.flatMap((e) => [
        Buffer.from(`${e.mode.replace(/^0/, '')} ${e.path}\0`),
        Buffer.from(e.sha, 'hex'),
      ])
    );
    const sha = gitObject('tree', body);
    shas.set(directory, sha);
    trees.set(sha, { sha, tree: entries, truncated: false });
    if (directory) {
      const parts = directory.split('/');
      directories
        .get(parts.slice(0, -1).join('/'))
        .push({ path: parts.at(-1), mode: '040000', type: 'tree', sha });
    }
  }
  const recursive = [];
  for (const [directory, entries] of directories) {
    recursive.push(
      ...entries.map((e) => ({ ...e, path: directory ? `${directory}/${e.path}` : e.path }))
    );
  }
  return {
    root: shas.get(''),
    trees,
    contents,
    recursive: { sha: shas.get(''), tree: recursive, truncated: false },
  };
}

export function largeFixture(count, name = 'file') {
  return treeFixture(
    Object.fromEntries(
      Array.from({ length: count }, (_, i) => [`${name}-${i}.js`, 'export const value = 1;\n'])
    )
  );
}
