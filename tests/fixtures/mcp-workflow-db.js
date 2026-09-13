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
      limit() {
        return Promise.resolve(rowsFor(table, joins).slice(0, 1));
      },
      then(resolve, reject) {
        return Promise.resolve(rowsFor(table, joins)).then(resolve, reject);
      },
    };
    return query;
  };

  return {
    select: () => ({
      from: (table) => createQuery(table),
    }),
  };
}
