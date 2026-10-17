import { StudioDraftContentSchema } from '../domain/career/resume-studio-draft.schemas.js';
import { onePageResumeView } from './one-page-resume.service.js';

/** Representation adapter only; never selects source-master facts or calls an AI writer. */
export function generatedResumeStudioContent(generated, documentId) {
  const resume = structuredClone(onePageResumeView(generated));
  return StudioDraftContentSchema.parse({
    documentId,
    schemaVersion: 'studio-draft/1.0.0',
    targetRole: resume.targetRole,
    sectionOrder: resume.sectionOrder,
    candidateIdentity: {
      displayName: resume.candidateIdentity.displayName,
      headline: resume.candidateIdentity.headline || null,
      email: resume.candidateIdentity.email,
      phone: resume.candidateIdentity.phone || null,
      location: resume.candidateIdentity.location || null,
      links: resume.candidateIdentity.links.map(({ label, url }) => ({ label, url })),
    },
    summary: { text: resume.summary.text, provenanceStatus: 'CLAIMED' },
    experience: resume.experience,
    education: resume.education,
    certifications: resume.certifications,
    optionalSections: resume.optionalSections,
    dsa: resume.dsa
      ? {
          ...resume.dsa,
          hasSection: Boolean(resume.dsa.hasSection),
        }
      : null,
    skills: resume.skills.categories.flatMap((category) =>
      category.skills.map((skill) => ({
        id: skill.slug,
        name: skill.name,
        provenanceStatus: 'CLAIMED',
        sourceFields: { ...skill, categoryName: category.categoryName },
      }))
    ),
    projects: resume.projects.map((project) => ({
      id: project.projectId,
      name: project.displayName || project.name,
      description: project.description || null,
      technologies: project.technologies || [],
      bullets: project.bullets.map((bullet) => (typeof bullet === 'string' ? bullet : bullet.text)),
      urls: [
        ...new Set(
          [project.repositoryUrl, project.liveUrl, ...(project.urls || [])].filter(Boolean)
        ),
      ],
      provenanceStatus: 'CLAIMED',
      sourceFields: project,
    })),
  });
}
