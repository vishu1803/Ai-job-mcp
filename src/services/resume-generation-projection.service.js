import { skillTrustStatus } from './evidence/verification-policy.js';
import crypto from 'node:crypto';
import { onePageResumeView, onePageResumeMarkdown } from './one-page-resume.service.js';

/** Compatibility projection only: selection and prose are the saved generation's. */
export function generatedApplicationResume(generation, candidateData = {}) {
  const view = onePageResumeView(generation.bundle.structuredResume);
  const aliases = {
    SUMMARY: 'PROFESSIONAL_SUMMARY',
    SKILLS: 'TECHNICAL_SKILLS',
    PROJECTS: 'TECHNICAL_PROJECTS',
    EXPERIENCE: 'PROFESSIONAL_EXPERIENCE',
  };
  const selectedProjects = view.projects.map((project) => ({
    ...project,
    id: project.projectId,
    name: project.displayName || project.name,
    bullets: project.bullets.map((b) => (typeof b === 'string' ? b : b.text)),
  }));
  const categorizedSkills = Object.fromEntries(
    view.skills.categories.map((category) => [
      category.categoryName,
      category.skills.map((skill) => skill.name),
    ])
  );
  const selectedSkills = view.skills.categories.flatMap((category) =>
    category.skills.map((skill) => ({ ...skill, category: category.categoryName }))
  );
  const sections = view.sectionOrder.map((key) => aliases[key] || key);
  const sectionSnapshots = Object.fromEntries(
    Object.entries({
      HEADER: { ...view.candidateIdentity },
      PROFESSIONAL_SUMMARY: { text: view.summary.text },
      TECHNICAL_SKILLS: { categories: categorizedSkills },
      TECHNICAL_PROJECTS: { records: selectedProjects },
      PROFESSIONAL_EXPERIENCE: { records: view.experience },
      EDUCATION: { records: view.education },
      CERTIFICATIONS: { records: view.certifications },
    }).filter(([key]) => sections.includes(key))
  );
  const markdownContent = onePageResumeMarkdown(generation.bundle.structuredResume);
  const keywords = candidateData.jobKeywords || new Set();
  const normalized = (text) =>
    String(text)
      .toLowerCase()
      .replace(/[^a-z0-9.#+]/g, '')
      .replace(/^[.#+]+|[.#+]+$/g, '');
  const matched = selectedSkills.filter((skill) =>
    [...keywords].some(
      (keyword) =>
        normalized(skill.name) === keyword ||
        (normalized(skill.name).length >= 4 && keyword.startsWith(normalized(skill.name)))
    )
  );
  return {
    documentId: view.documentId,
    title: `${view.candidateIdentity.displayName} — Tailored Resume`,
    markdownContent,
    contentHash: crypto.createHash('sha256').update(markdownContent).digest('hex'),
    fitScore: selectedSkills.length
      ? Math.round((matched.length / selectedSkills.length) * 100)
      : 0,
    sections,
    selectedSections: sections,
    sectionSnapshots,
    selectedProjects,
    omittedProjects: (generation.bundle.metadata.projectRanking?.projectRankings || []).filter(
      (p) => p.selectionStatus !== 'SELECTED'
    ),
    selectionAudit: generation.bundle.metadata.projectRanking?.projectRankings || [],
    categorizedSkills,
    skillAudit: [
      ...selectedSkills.map((skill) => ({
        skill: skill.name,
        provenance: skill.provenanceStatus,
        included: true,
        reason: 'Selected by saved generation',
      })),
      ...(generation.bundle.metadata.sourceProfileSnapshot?.skills || [])
        .filter(
          (skill) =>
            !selectedSkills.some((selected) => normalized(selected.name) === normalized(skill.name))
        )
        .map((skill) => {
          const rawTrust = skillTrustStatus(skill);
          return {
            skill: skill.name,
            provenance: ['SELF_DECLARED', 'USER_PROVIDED'].includes(rawTrust)
              ? 'CLAIMED'
              : rawTrust,
            included: false,
            reason: 'Not selected by saved generation; source assertion retained',
          };
        }),
    ],
    selectedSkills,
    selectedSkillSlugs: selectedSkills.map((skill) => skill.slug),
    skillCategoryOrder: Object.keys(categorizedSkills),
  };
}
