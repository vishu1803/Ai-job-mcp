import {
  candidateSkills,
  candidates,
  jobApplications,
  projects,
  skills,
  users,
} from '../../src/db/schema.js';

/**
 * Creates the narrow data-access fixture required by the canonical application workflow.
 * It models the workflow's joins and tenant-scoped candidate data without replacing
 * any semantic resume selection service.
 *
 * @param {object} options
 * @param {object} options.candidate
 * @param {Array<object>} [options.skills]
 * @param {Array<object>} [options.projects]
 * @param {Array<object>} [options.jobApplications]
 * @returns {object}
 */
export function createMcpWorkflowDbFixture({
  candidate,
  skills: candidateSkillRows = [],
  projects: projectRows = [],
  jobApplications: applicationRows = [],
}) {
  const rowsFor = (table, joins) => {
    if (table === candidates) {
      return [
        {
          ...candidate,
          id: candidate.id,
          tenantId: candidate.tenantId,
          userId: candidate.userId,
          candidate,
          userEmail: candidate.email || candidate.canonicalEmail || null,
        },
      ];
    }

    if (table === candidateSkills && joins.some((join) => join.table === skills)) {
      return candidateSkillRows.map((row) => ({
        cs: {
          id: row.id || row.skillId,
          skillId: row.skillId,
          category: row.category || 'TOOL',
          confidenceScore: row.confidenceScore ?? 1.0,
          provenanceStatus: row.provenanceStatus || 'CLAIMED',
          evidenceCount: row.evidenceCount ?? (row.evidenceId ? 1 : 0),
          primaryEvidenceId: row.evidenceId || row.primaryEvidenceId || null,
        },
        skillSlug:
          row.slug ||
          row.skillSlug ||
          (row.name || row.skillName || '').toLowerCase().replace(/\s+/g, '-'),
        skillName: row.name || row.skillName,
        provenanceStatus: row.provenanceStatus || 'CLAIMED',
        evidenceId: row.evidenceId || row.primaryEvidenceId || null,
      }));
    }

    if (table === projects) return projectRows;
    if (table === jobApplications) return applicationRows;
    if (table === users) return [{ email: candidate.email || candidate.canonicalEmail || null }];
    return [];
  };

  const createQuery = (table, joins = []) => {
    let limitVal;
    let offsetVal;
    const query = {
      leftJoin(joinTable) {
        joins.push({ table: joinTable, type: 'left' });
        return query;
      },
      innerJoin(joinTable) {
        joins.push({ table: joinTable, type: 'inner' });
        return query;
      },
      where() {
        return query;
      },
      orderBy() {
        return query;
      },
      offset(n) {
        offsetVal = n;
        return query;
      },
      limit(n) {
        limitVal = n;
        return query;
      },
      then(resolve, reject) {
        const rows = rowsFor(table, joins);
        const start = offsetVal || 0;
        const end = limitVal !== undefined ? start + limitVal : undefined;
        return Promise.resolve(rows.slice(start, end)).then(resolve, reject);
      },
    };
    return query;
  };

  return {
    select: (fields) => {
      const isCount = fields && (fields.total !== undefined || fields.count !== undefined);
      return {
        from: (table) => {
          if (isCount) {
            const countResult = [
              { total: candidateSkillRows.length, count: candidateSkillRows.length },
            ];
            const countQuery = {
              leftJoin: () => countQuery,
              innerJoin: () => countQuery,
              where: () => countQuery,
              limit: () => Promise.resolve(countResult),
              then: (resolve, reject) => Promise.resolve(countResult).then(resolve, reject),
            };
            return countQuery;
          }
          return createQuery(table);
        },
      };
    },
  };
}
