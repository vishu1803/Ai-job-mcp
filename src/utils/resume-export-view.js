import { StructuredResumeDocumentSchema } from '../domain/career/resume.schemas.js';
import { formatResumeSourceEntry } from './resume-source-normalizer.js';
import { OPTIONAL_RESUME_SECTIONS } from '../domain/career/resume-source-fields.js';

// Called only after the export service's ownership and current-narrative gates.
// The saved identity wins over a later mutable profile. This is a presentation
// projection, never a new authoritative document or approval snapshot.
export function resumeExportView(artifact) {
  if (!artifact.structuredResume) return null;
  const document = StructuredResumeDocumentSchema.parse(artifact.structuredResume);
  const identity = document.candidateIdentity;
  return {
    resume: {
      ...artifact,
      headline: identity.headline,
      summary: document.summary?.text || '',
      skills: document.skills.categories.map((category) => ({
        name: category.categoryName,
        skills: category.skills.map((skill) => ({ ...skill, status: skill.provenanceStatus })),
      })),
      experience: document.experience,
      education: document.education,
      certifications: document.certifications,
      projects: document.projects,
      optionalSections: document.optionalSections,
    },
    candidateProfile: {
      displayName: identity.displayName,
      headline: identity.headline,
      canonicalEmail: identity.email,
      canonicalPhone: identity.phone,
      location: identity.location,
      links: identity.links,
    },
  };
}

export function resumeDateRange(entry) {
  return [entry.startDate, entry.isCurrent ? 'Present' : entry.endDate].filter(Boolean).join(' - ');
}

export function resumeLocation(value) {
  if (typeof value === 'string') return value;
  return [value?.city, value?.region, value?.countryCode].filter(Boolean).join(', ');
}

export function educationDetails(entry) {
  return [
    entry.fieldOfStudy,
    resumeDateRange(entry),
    entry.isCurrent && entry.endDate ? `Expected completion: ${entry.endDate}` : null,
    entry.location,
    entry.grade ? `Grade: ${entry.grade}` : null,
    entry.coursework?.length ? `Coursework: ${entry.coursework.join(', ')}` : null,
    ...(entry.honors || []),
    ...(entry.bullets || []).map((bullet) => (typeof bullet === 'string' ? bullet : bullet.text)),
  ].filter(Boolean);
}

export function extraResumeSections(resume, includeUnverified) {
  const sections = [{ title: 'Certifications', entries: resume.certifications || [] }];
  for (const [key, title] of Object.entries(OPTIONAL_RESUME_SECTIONS)) {
    sections.push({
      title: title.replaceAll('_', ' '),
      entries: resume.optionalSections?.[key] || resume[key] || [],
    });
  }
  return sections
    .map(({ title, entries }) => ({
      title,
      entries: entries
        .filter((entry) => includeUnverified || entry.provenanceStatus !== 'CLAIMED')
        .map(formatResumeSourceEntry)
        .filter(Boolean),
    }))
    .filter((section) => section.entries.length);
}
