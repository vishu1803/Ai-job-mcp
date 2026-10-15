/** Three-way resolution against the last acknowledged server snapshot. */
export const selectionKeys = ['experienceIds', 'projectIds', 'bulletIds', 'skillIds'];

export function sameIds(left = [], right = []) {
  const a = new Set(left),
    b = new Set(right);
  return a.size === b.size && [...a].every((id) => b.has(id));
}

export function nodeText(content, path) {
  // Current employment uses the canonical null date plus isCurrent flag.
  // Compare both as a single visible field so a concurrent status change conflicts.
  if (path[0] === 'experience' && path[2] === 'endDate') {
    const role = content.experience?.[path[1]];
    if (role?.isCurrent && role.endDate === null) return 'Present';
  }
  return path.reduce((value, key) => value?.[key], content) ?? '';
}

export function compareDrafts(base, server, edits, localSelection) {
  const fieldConflicts = [],
    safeMerges = [];
  const serverNodes = new Map(server.nodes.map((node) => [node.nodeId, node]));
  for (const [nodeId, edit] of edits) {
    const original = base.nodes.find((node) => node.nodeId === nodeId);
    const current = serverNodes.get(nodeId);
    const baseText = original ? nodeText(base.structuredResume, original.path) : '';
    const serverText = current ? nodeText(server.structuredResume, current.path) : '';
    if (
      !current ||
      JSON.stringify(current.path) !== JSON.stringify(original?.path) ||
      (serverText !== baseText && serverText !== edit.text)
    ) {
      fieldConflicts.push({
        nodeId,
        path: original?.path || [],
        baseText,
        serverText,
        localText: edit.text,
        selectedChoice: null,
        missing: !current,
      });
    }
  }
  for (const node of server.nodes.filter((node) => node.editable)) {
    if (
      !edits.has(node.nodeId) &&
      nodeText(server.structuredResume, node.path) !== nodeText(base.structuredResume, node.path)
    )
      safeMerges.push({
        nodeId: node.nodeId,
        path: node.path,
        serverText: nodeText(server.structuredResume, node.path),
      });
  }
  const selection = {};
  for (const key of selectionKeys) {
    const before = new Set(base.selection[key]),
      local = new Set(localSelection[key]);
    const merged = new Set(server.selection[key]);
    for (const id of before) if (!local.has(id)) merged.delete(id);
    for (const id of local) if (!before.has(id)) merged.add(id);
    selection[key] = [...merged];
  }
  return { fieldConflicts, safeMerges, selection };
}
