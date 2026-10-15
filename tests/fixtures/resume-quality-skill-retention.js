/** Synthetic reviewed-master/index mismatch; no private candidate records. */
export const retainedMasterSkills = Object.freeze([
  'NestJS',
  'Flask',
  'TypeScript',
  'Node.js',
  'PostgreSQL',
  'Docker',
  'Python',
]);
export const resumeSkillRetentionProfile = () => ({
  id: '00000000-0000-4000-8000-000000000001',
  tenantId: '00000000-0000-4000-8000-000000000002',
  displayName: 'Synthetic Candidate',
  canonicalEmail: 'candidate@example.test',
  skills: [
    { name: 'NestJS', provenanceStatus: 'CLAIMED' },
    { name: 'Flask', provenanceStatus: 'CLAIMED' },
    { name: 'PostgreSQL', provenanceStatus: 'INFERRED', evidenceCount: 3 },
    { name: 'Rust', provenanceStatus: 'INFERRED' },
    { name: 'Kubernetes', provenanceStatus: 'MISSING_EVIDENCE' },
  ],
  projects: [],
  experience: [],
  education: [],
  profileMetadata: {
    resumeData: {
      sourceResumeId: '00000000-0000-4000-8000-000000000003',
      sourceVersion: 1,
      skills: [...retainedMasterSkills],
    },
  },
});
export const resumeSkillRetentionJob = (variant = 'backend') => ({
  title: variant === 'backend' ? 'Backend Engineering' : 'Full-stack Developer',
  description:
    variant === 'backend'
      ? 'Build TypeScript and Node.js APIs with PostgreSQL and Docker. Maintain NestJS services and Python Flask integrations. Write request validation and transaction tests. Rust and Kubernetes are optional.'
      : 'Build customer-facing forms and maintain their TypeScript and Node.js API integrations. Work on PostgreSQL data access, NestJS and Python Flask services, and Docker development workflows. React is preferred.',
  skills: [
    ...retainedMasterSkills,
    ...(variant === 'backend' ? ['Rust', 'Kubernetes'] : ['React']),
  ],
});
