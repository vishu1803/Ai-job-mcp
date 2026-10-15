import { studioMasterFacts } from './resume-studio-master.js';
/** Candidate-authored synthetic records only; these are not provider evaluations. */
export function studioPersonas() {
  const mid = structuredClone(studioMasterFacts),
    junior = structuredClone(mid),
    experienced = structuredClone(mid);
  junior.experience = [];
  junior.certifications = [];
  junior.publications = [];
  junior.summary =
    'Computer science graduate who builds accessible React interfaces and documents PostgreSQL queries.';
  experienced.summary =
    'Developer with fifteen years of candidate-reported experience maintaining application interfaces and database systems.';
  experienced.experience = Array.from({ length: 3 }, (_, index) => ({
    ...structuredClone(mid.experience[0]),
    id: 'senior-role-' + index,
    title: ['Principal Developer', 'Senior Developer', 'Developer'][index],
    company: ['North Systems', 'Central Software', 'South Products'][index],
    startDate: ['2021', '2016', '2011'][index],
    endDate: [null, '2021', '2016'][index],
    isCurrent: index === 0,
    bullets: [
      'Implemented React component interfaces for internal operations workflows.',
      'Documented PostgreSQL query behavior and maintained database migration scripts.',
      'Reviewed application changes and maintained integration tests for release verification.',
    ],
  }));
  return { junior, 'mid-level': mid, experienced };
}
