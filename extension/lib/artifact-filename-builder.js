/**
 * @file Canonical Artifact Filename Builder & Sanitizer for Extension (Part 61).
 *
 * Enforces standardized, deterministic, and filesystem-safe artifact filenames:
 * - Tailored Resume:       `<Candidate Name> - <Job Profile>.pdf`
 * - Tailored Cover Letter: `<Candidate Name> - <Job Profile> - Cover Letter.pdf`
 * - Tailored LaTeX Source: `<Candidate Name> - <Job Profile>.tex`
 * - Application Package:   `<Candidate Name> - <Job Profile> - Application Package.zip`
 */

export function sanitizeFilenameComponent(text, fallback = '') {
  if (!text || typeof text !== 'string') {
    return fallback;
  }

  let cleaned = text
    .replace(/[\x00-\x1f\x7f]/g, ' ')
    .replace(/\.{2,}/g, ' ')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.\-]+|[\s.\-]+$/g, '');

  return cleaned.length > 0 ? cleaned : fallback;
}

export function buildApplicationArtifactFilename({
  candidateName,
  jobTitle,
  artifactType = 'resume',
  extension = null,
} = {}) {
  const safeName = sanitizeFilenameComponent(candidateName, 'Candidate');
  const safeTitle = sanitizeFilenameComponent(jobTitle, 'Role');

  const clampedName = safeName.length > 60 ? safeName.substring(0, 60).trim() : safeName;
  const clampedTitle = safeTitle.length > 60 ? safeTitle.substring(0, 60).trim() : safeTitle;

  const base = `${clampedName} - ${clampedTitle}`;
  const normalizedType = String(artifactType || '')
    .toLowerCase()
    .replace(/_/g, '-');

  let suffix = '';
  let defaultExt = 'pdf';

  switch (normalizedType) {
    case 'cover-letter':
    case 'coverletter':
      suffix = ' - Cover Letter';
      defaultExt = 'pdf';
      break;
    case 'resume-tex':
    case 'resumetex':
    case 'tex':
      suffix = '';
      defaultExt = 'tex';
      break;
    case 'bundle':
    case 'handoff-kit':
    case 'handoffkit':
    case 'zip':
      suffix = ' - Application Package';
      defaultExt = 'zip';
      break;
    case 'resume':
    default:
      suffix = '';
      defaultExt = 'pdf';
      break;
  }

  const finalExt = (extension || defaultExt).replace(/^\./, '');
  return `${base}${suffix}.${finalExt}`;
}
