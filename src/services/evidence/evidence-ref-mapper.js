/**
 * @file Evidence Reference & Node Formatters (P4-004)
 *
 * Implements provider-neutral mapping for lightweight EvidenceRef domain objects
 * and structured EvidenceNode representations for APIs and MCP tools.
 */

export class EvidenceRefMapper {
  /**
   * Maps a database evidence row to a lightweight EvidenceRef representation.
   *
   * @param {object} item - Database row from evidence_items table.
   * @param {string} [provenanceStatus='INFERRED'] - Inferred or verified provenance status.
   * @returns {object} Lightweight EvidenceRef object.
   */
  static toEvidenceRef(item, provenanceStatus = 'INFERRED') {
    if (!item) return null;

    const sourceLocation = item.sourceLocation || {};

    return {
      evidenceId: item.id || item.evidenceId,
      evidenceType: item.evidenceType,
      sourceProvider: item.sourceProvider,
      resourceId: item.resourceId,
      filePath: sourceLocation.filePath || '',
      commitSha: sourceLocation.commitSha || 'HEAD',
      lineRange: sourceLocation.lineRange || null,
      confidenceScore: typeof item.confidenceScore === 'number' ? item.confidenceScore : 1.0,
      provenanceStatus,
      detectedAt: item.detectedAt ? new Date(item.detectedAt).toISOString() : null,
    };
  }

  /**
   * Maps a database evidence row to a detailed EvidenceNode representation.
   *
   * @param {object} item - Database row from evidence_items table.
   * @returns {object} Detailed EvidenceNode object.
   */
  static toEvidenceNode(item) {
    if (!item) return null;

    return {
      id: item.id || item.evidenceId,
      evidenceId: item.id || item.evidenceId,
      tenantId: item.tenantId,
      candidateId: item.candidateId,
      resourceId: item.resourceId,
      projectId: item.projectId || null,
      skillId: item.skillId || null,
      skillSlug: item.skillSlug || null,
      skillName: item.skillName || null,
      evidenceType: item.evidenceType,
      sourceProvider: item.sourceProvider,
      sourceLocation: item.sourceLocation || {},
      excerpt: item.excerpt || null,
      confidenceScore: typeof item.confidenceScore === 'number' ? item.confidenceScore : 1.0,
      detectedAt: item.detectedAt ? new Date(item.detectedAt).toISOString() : null,
      createdAt: item.createdAt ? new Date(item.createdAt).toISOString() : null,
      metadata: item.metadata || {},
    };
  }
}
