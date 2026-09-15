/**
 * @file Canonical Artifact Filename Builder & Sanitizer (Part 61).
 *
 * Enforces standardized, deterministic, and filesystem-safe artifact filenames
 * across the MCP application lifecycle, document storage, and downloads:
 * - Tailored Resume:       `<Candidate Name> - <Job Profile>.pdf`
 * - Tailored Cover Letter: `<Candidate Name> - <Job Profile> - Cover Letter.pdf`
 * - Tailored LaTeX Source: `<Candidate Name> - <Job Profile>.tex`
 * - Application Package:   `<Candidate Name> - <Job Profile> - Application Package.zip`
 */

/**
 * Sanitizes an individual component (such as candidate name or job title)
 * to be safe for inclusion in filenames across Windows, macOS, and Linux.
 *
 * @param {string} text
 * @param {string} [fallback='']
 * @returns {string}
 */
export function sanitizeFilenameComponent(text, fallback = '') {
  if (!text || typeof text !== 'string') {
    return fallback;
  }

  let cleaned = text
    // Replace null bytes and control characters
    .replace(/[\x00-\x1f\x7f]/g, ' ')
    // Remove path traversal sequences
    .replace(/\.{2,}/g, ' ')
    // Replace reserved filesystem characters across Windows / POSIX
    // Reserved: / \ : * ? " < > |
    .replace(/[\\/:*?"<>|]/g, ' ')
    // Normalize repeated whitespace
    .replace(/\s+/g, ' ')
    // Trim spaces, dots, and hyphens at boundaries
    .replace(/^[\s.\-]+|[\s.\-]+$/g, '');

  return cleaned.length > 0 ? cleaned : fallback;
}

/**
 * Builds a canonical, filesystem-safe filename for an application artifact.
 *
 * @param {object} params
 * @param {string} [params.candidateName] Canonical candidate name
 * @param {string} [params.jobTitle] Target job title or role
 * @param {string} [params.artifactType='resume'] 'resume' | 'cover-letter' | 'coverLetter' | 'resume-tex' | 'resumeTex' | 'bundle' | 'handoff-kit'
 * @param {string} [params.extension] Optional override extension (e.g. 'pdf', 'zip')
 * @returns {string}
 */
export function buildApplicationArtifactFilename({
  candidateName,
  jobTitle,
  artifactType = 'resume',
  extension = null,
} = {}) {
  const safeName = sanitizeFilenameComponent(candidateName, 'Candidate');
  const safeTitle = sanitizeFilenameComponent(jobTitle, 'Role');

  // Enforce reasonable length limits per component (max 60 chars each) to prevent OS MAX_PATH errors
  const clampedName = safeName.length > 60 ? safeName.substring(0, 60).trim() : safeName;
  const clampedTitle = safeTitle.length > 60 ? safeTitle.substring(0, 60).trim() : safeTitle;

  const base = `${clampedName} - ${clampedTitle}`;
  const normalizedType = String(artifactType || '').toLowerCase().replace(/_/g, '-');

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
