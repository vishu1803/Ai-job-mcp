/**
 * Arbitrary model prose is not verifiable merely because it cites genuine facts.
 * Only an exact server-authored rendering can pass the linguistic adapter boundary.
 * This is an allowlist by identity, not a keyword/locale/content-classification filter.
 * Untrusted rewrites fall back without changing claims, ownership or trust metadata.
 */
export function retainAuthoritativeNarrative(proposedText, serverText) {
  return typeof proposedText === 'string' && proposedText === serverText
    ? proposedText
    : serverText;
}

const currentArtifacts = new WeakMap();
/** Non-serializable server generation authority; shaped metadata cannot confer it. */
export function registerCurrentNarrativeArtifact(artifact) {
  currentArtifacts.set(artifact, JSON.stringify(artifact));
  return artifact;
}
export function isCurrentNarrativeArtifact(artifact) {
  return !!artifact && currentArtifacts.get(artifact) === JSON.stringify(artifact);
}
