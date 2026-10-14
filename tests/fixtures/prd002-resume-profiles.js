/** PRD-002 synthetic candidates: no private data, network or database dependency. */
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const skill = (name, category = 'LANGUAGE', provenanceStatus = 'USER_PROVIDED') => ({
  name,
  slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  category,
  provenanceStatus,
  truthCategory: provenanceStatus,
  isUserClaim: provenanceStatus === 'USER_PROVIDED',
});
const education = (n = 1) => ({
  id: `education-${n}`,
  institution: `Synthetic University ${n}`,
  degree: n === 1 ? 'BSc' : 'MSc',
  fieldOfStudy: 'Computer Science',
  startDate: n === 1 ? '2018-09' : '2022-09',
  endDate: n === 1 ? '2022-06' : '2024-06',
});
const project = (n, name, technologies, bullets, description = '') => ({
  id: uuid(100 + n),
  name,
  displayName: name,
  description,
  technologies,
  url: `https://portfolio.example.test/project-${n}`,
  repositoryUrl: `https://github.com/synthetic-fixture/project-${n}`,
  bullets,
  provenanceStatus: 'USER_PROVIDED',
});
const apiProject = project(
  1,
  'Library API',
  ['JavaScript', 'Node.js', 'PostgreSQL'],
  [
    'Implemented book search and lending endpoints in Node.js.',
    'Added PostgreSQL migrations for books and lending records.',
    'Wrote integration tests for checkout validation and error responses.',
  ],
  'An API for a student library lending workflow.'
);
const webProject = project(
  2,
  'Community Events',
  ['TypeScript', 'React'],
  [
    'Created React forms for event registration and accessibility preferences.',
    'Implemented TypeScript validation for event dates and participant details.',
    'Documented keyboard navigation and tested form error messages.',
  ],
  'A community event registration interface.'
);
const experience = (n, title = 'Software Engineer') => ({
  id: `experience-${n}`,
  title,
  company: `Synthetic Software Company ${n}`,
  startDate: `${2024 - n}-01`,
  endDate: `${2025 - n}-01`,
  location: 'Remote',
  highlights: [
    'Implemented API validation and documented error responses.',
    'Added regression tests for authentication and database transactions.',
    'Reviewed deployment checklists and investigated reported application errors.',
  ],
});
const jobPosting = {
  title: 'Backend Developer',
  description: 'Build Node.js APIs with PostgreSQL and integration tests. Document API behavior.',
  requirements: ['Node.js', 'PostgreSQL', 'API validation', 'integration tests'],
};
const base = (n, changes = {}) => ({
  id: uuid(n),
  tenantId: uuid(900),
  displayName: `Synthetic Candidate ${n}`,
  canonicalEmail: `candidate-${n}@example.test`,
  phone: '+1 202 555 0100',
  location: 'Remote',
  links: [{ label: 'Portfolio', url: `https://portfolio.example.test/candidate-${n}` }],
  skills: [],
  projects: [],
  experience: [],
  education: [],
  certifications: [],
  ...changes,
});

export const resumeQualityProfiles = [
  { key: 'empty', label: 'Empty candidate profile', profile: base(1), jobPosting },
  {
    key: 'fresher',
    label: 'Software engineering fresher',
    profile: base(2, {
      headline: 'Computer Science Graduate',
      summary: 'Computer science graduate with academic work in API development and testing.',
      skills: [skill('JavaScript'), skill('Node.js', 'FRAMEWORK'), skill('PostgreSQL', 'DATABASE')],
      education: [education()],
      projects: [apiProject],
    }),
    jobPosting,
  },
  {
    key: 'student',
    label: 'Student with several GitHub projects',
    profile: base(3, {
      headline: 'Computer Science Student',
      education: [{ ...education(), startDate: '2023-09', endDate: undefined, isCurrent: true }],
      skills: [skill('JavaScript'), skill('TypeScript'), skill('React', 'FRAMEWORK')],
      projects: [apiProject, webProject],
    }),
    jobPosting,
  },
  {
    key: 'backend',
    label: 'Backend developer',
    profile: base(4, {
      headline: 'Backend Developer',
      experience: [experience(1, 'Backend Developer')],
      education: [education()],
      skills: [skill('Node.js', 'FRAMEWORK'), skill('PostgreSQL', 'DATABASE'), skill('JavaScript')],
      projects: [apiProject],
    }),
    jobPosting,
  },
  {
    key: 'fullstack',
    label: 'Full-stack engineer',
    profile: base(5, {
      headline: 'Full-stack Engineer',
      experience: [experience(1, 'Full-stack Engineer')],
      skills: [skill('TypeScript'), skill('React', 'FRAMEWORK'), skill('Node.js', 'FRAMEWORK')],
      education: [education()],
      projects: [apiProject, webProject],
    }),
    jobPosting: {
      ...jobPosting,
      title: 'Full-stack Engineer',
      description: 'Build React interfaces and Node.js APIs with TypeScript.',
    },
  },
  {
    key: 'experienced',
    label: 'Experienced software engineer',
    profile: base(6, {
      headline: 'Software Engineer',
      experience: [experience(1), experience(2), experience(3)],
      education: [education()],
      skills: [skill('JavaScript'), skill('PostgreSQL', 'DATABASE'), skill('Git', 'TOOL')],
      projects: [apiProject],
    }),
    jobPosting,
  },
  {
    key: 'career-changer',
    label: 'Career changer',
    profile: base(7, {
      headline: 'Operations Specialist',
      experience: [
        {
          ...experience(1, 'Operations Specialist'),
          highlights: [
            'Documented supplier workflows and maintained order records.',
            'Prepared customer support guides and coordinated issue follow-up.',
          ],
        },
      ],
      skills: [skill('JavaScript'), skill('Documentation', 'TOOL')],
      projects: [apiProject],
    }),
    jobPosting,
  },
  {
    key: 'credentials',
    label: 'Substantial education and certifications',
    profile: base(8, {
      headline: 'Research Candidate',
      education: [education(2), education(1)],
      certifications: Array.from({ length: 10 }, (_, n) => ({
        id: `credential-${n + 1}`,
        name: `Synthetic Professional Credential ${n + 1}`,
        issuingOrganization: `Synthetic Credential Board ${n + 1}`,
        issueDate: '2024-05',
        credentialUrl: `https://issuer.example.test/credential-${n + 1}`,
      })),
      publications: [
        {
          id: 'publication-1',
          title: 'Accessible API Documentation',
          publisher: 'Synthetic Computing Journal',
          date: '2024',
          summary: 'Compared documentation formats for accessible interfaces.',
        },
      ],
      projects: [apiProject],
    }),
    jobPosting,
  },
  {
    key: 'project-heavy',
    label: 'Many skills, long projects and Unicode',
    profile: base(9, {
      displayName: 'Zoë 林',
      headline: 'Software Developer',
      skills: [
        skill('JavaScript'),
        skill('TypeScript'),
        skill('React', 'FRAMEWORK'),
        skill('Node.js', 'FRAMEWORK'),
        skill('PostgreSQL', 'DATABASE'),
        skill('Kubernetes', 'TOOL', 'MISSING_EVIDENCE'),
      ],
      projects: Array.from({ length: 9 }, (_, n) =>
        project(
          n + 3,
          `Synthetic Workflow ${n + 1}`,
          ['JavaScript', 'PostgreSQL'],
          [
            'Implemented searchable workflow records with validated form inputs and accessible error messages.',
            'Created database migrations and integration tests for record creation, editing and transaction rollback.',
            'Documented installation steps, API usage and the boundaries of the supported local workflow.',
          ],
          'A documented workflow application with searchable records, form validation, transaction handling and accessible text-based interfaces.'
        )
      ),
      education: [education()],
      languages: [
        { language: 'English', proficiency: 'PROFESSIONAL' },
        { language: 'Hindi', proficiency: 'NATIVE' },
      ],
    }),
    jobPosting,
  },
  {
    key: 'long-history',
    label: 'Long work history',
    profile: base(10, {
      headline: 'Software Engineer',
      experience: Array.from({ length: 15 }, (_, n) => experience(n + 1)),
      education: [education()],
      skills: [skill('JavaScript'), skill('PostgreSQL', 'DATABASE')],
      projects: [apiProject],
    }),
    jobPosting,
  },
];

export const resumeQualityProfileByKey = Object.fromEntries(
  resumeQualityProfiles.map((entry) => [entry.key, entry])
);
