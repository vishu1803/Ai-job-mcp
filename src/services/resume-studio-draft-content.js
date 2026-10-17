import crypto from 'node:crypto';
import { normalizeResumeSourceSections } from '../utils/resume-source-normalizer.js';
import { canonicalPackageJson } from '../domain/job/application-package-identity.js';
import { encryptSecret, decryptSecret, MAX_PLAINTEXT_BYTES } from '../security/encryption.js';
import { AppError, ValidationError, InternalServerError } from '../errors/index.js';
import {
  StudioDraftContentSchema,
  StudioDraftSelectionSchema,
} from '../domain/career/resume-studio-draft.schemas.js';

export const MAX_STUDIO_PAYLOAD_BYTES = 4 * 1024 * 1024;
export const hashStudioContent = (value) =>
  crypto.createHash('sha256').update(canonicalPackageJson(value)).digest('hex');

/** Reuse existing AES-GCM/key rotation support without expanding its secret-size
 * limit or writing nontransactional document blobs for mutable drafts. */
export function encryptStudioPayload(value) {
  const bytes = Buffer.from(canonicalPackageJson(value));
  if (bytes.length > MAX_STUDIO_PAYLOAD_BYTES)
    throw new AppError('Draft exceeds encrypted storage limit', 413, 'DRAFT_TOO_LARGE');
  const chunks = [];
  for (let index = 0; index < bytes.length; index += MAX_PLAINTEXT_BYTES) {
    chunks.push(encryptSecret(bytes.subarray(index, index + MAX_PLAINTEXT_BYTES)));
  }
  return JSON.stringify({ format: 'studio-draft-encrypted/v1', chunks });
}

export function decryptStudioPayload(value) {
  try {
    if (typeof value !== 'string' || value.length > MAX_STUDIO_PAYLOAD_BYTES * 2) throw new Error();
    const envelope = JSON.parse(value);
    if (
      envelope.format !== 'studio-draft-encrypted/v1' ||
      !Array.isArray(envelope.chunks) ||
      !envelope.chunks.length ||
      envelope.chunks.length > Math.ceil(MAX_STUDIO_PAYLOAD_BYTES / MAX_PLAINTEXT_BYTES)
    )
      throw new Error();
    const chunks = envelope.chunks.map((chunk) => {
      const bytes = decryptSecret(chunk, { encoding: 'buffer' });
      if (bytes.length > MAX_PLAINTEXT_BYTES) throw new Error();
      return bytes;
    });
    const bytes = Buffer.concat(chunks);
    if (bytes.length > MAX_STUDIO_PAYLOAD_BYTES) throw new Error();
    return JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new InternalServerError('Draft integrity verification failed', 'DRAFT_INTEGRITY_FAILED');
  }
}

function strings(values) {
  if (values == null) return [];
  if (!Array.isArray(values)) throw new ValidationError('Invalid master text array');
  return values.map((item) => {
    const value = typeof item === 'string' ? item : item?.text;
    if (typeof value !== 'string') throw new ValidationError('Invalid master text entry');
    return value;
  });
}

/** Copy reviewed facts without calling generators that rewrite/prune content.
 * Raw source fields are retained separately in the encrypted master snapshot. */
export function normalizeStudioMaster(source, documentId) {
  const sections = normalizeResumeSourceSections(source);
  const identity = source.identity || {};
  const displayName = identity.name || identity.displayName || source.displayName || source.name;
  const headline = identity.headline || source.headline;
  const email = identity.email || source.email;
  const phone = identity.phone || source.phone;
  const location = identity.location || source.location;
  const nullable = (value) => (value == null || value === '' ? null : value);

  const links = [];
  const seenUrls = new Set();
  const addLink = (label, url) => {
    if (!url || typeof url !== 'string') return;
    const trimmed = url.trim();
    if (!trimmed || seenUrls.has(trimmed.toLowerCase())) return;
    seenUrls.add(trimmed.toLowerCase());
    links.push({ label: String(label || 'LINK').toUpperCase(), url: trimmed });
  };

  for (const key of ['github', 'linkedin', 'leetcode']) {
    if (identity[key]) addLink(key.toUpperCase(), identity[key]);
  }
  for (const url of identity.portfolioUrls || []) addLink('PORTFOLIO', url);

  const rawCandidateLinks = identity.links || source.links || [];
  if (Array.isArray(rawCandidateLinks)) {
    for (const l of rawCandidateLinks) {
      if (l && l.url) addLink(l.label || l.platform || 'LINK', l.url);
    }
  }

  const rawSkills = Array.isArray(source.skills)
    ? source.skills
    : Array.isArray(source.skills?.categories)
      ? source.skills.categories.flatMap((cat) => cat.skills || [])
      : [];

  const summaryText =
    typeof source.summary === 'string' ? source.summary : (source.summary?.text ?? '');

  const content = {
    documentId,
    schemaVersion: 'studio-draft/1.0.0',
    candidateIdentity: {
      displayName: nullable(displayName),
      headline: nullable(headline),
      email: nullable(email),
      phone: nullable(phone),
      location: nullable(location),
      links,
    },
    summary: { text: summaryText, provenanceStatus: 'CLAIMED' },
    ...sections,
    projects: (source.projects || []).map((project, index) => ({
      id: project.id || project.projectId || `${documentId}:project:${index}`,
      name: project.name || project.title || project.displayName || project.canonicalName,
      description: project.description ?? project.summary ?? null,
      technologies: strings(project.technologies),
      bullets: strings(project.bullets),
      urls: project.urls || [project.repositoryUrl, project.liveUrl].filter(Boolean),
      provenanceStatus: 'CLAIMED',
      sourceFields: structuredClone(project),
    })),
    skills: rawSkills.map((skill, index) => ({
      id:
        typeof skill === 'object'
          ? skill.id || skill.slug || `${documentId}:skill:${index}`
          : `${documentId}:skill:${index}`,
      name: typeof skill === 'string' ? skill : skill.name,
      provenanceStatus: 'CLAIMED',
      sourceFields: typeof skill === 'string' ? { name: skill } : structuredClone(skill),
    })),
  };
  const parsed = StudioDraftContentSchema.safeParse(content);
  if (!parsed.success)
    throw new ValidationError(
      'Master snapshot has invalid structured fields',
      parsed.error.issues.map(({ path, message }) => ({ path, message }))
    );
  return parsed.data;
}

export function createStudioNodes(content) {
  const nodes = [];
  const add = (kind, path, parentId = null, editable = false) => {
    const nodeId = crypto.randomUUID();
    nodes.push({ nodeId, kind, path, parentId, editable });
    return nodeId;
  };
  for (const field of ['displayName', 'headline', 'email', 'phone', 'location'])
    add('IDENTITY', ['candidateIdentity', field], null, true);
  add('SUMMARY', ['summary', 'text'], null, true);
  for (const [section, kind] of [
    ['experience', 'EXPERIENCE'],
    ['projects', 'PROJECT'],
  ]) {
    content[section].forEach((entry, index) => {
      const parentId = add(kind, [section, index]);
      const fields =
        section === 'experience'
          ? ['title', 'company', 'startDate', 'endDate', 'location', 'summary', 'description']
          : ['name', 'description'];
      for (const field of fields)
        if (Object.hasOwn(entry, field)) add('TEXT', [section, index, field], parentId, true);
      entry.bullets.forEach((_, bullet) =>
        add('BULLET', [section, index, 'bullets', bullet], parentId, true)
      );
    });
  }
  content.skills.forEach((_, index) => add('SKILL', ['skills', index]));
  return nodes;
}

export function defaultStudioSelection(nodes) {
  const collect = (kind) => nodes.filter((node) => node.kind === kind).map((node) => node.nodeId);
  return {
    experienceIds: collect('EXPERIENCE'),
    projectIds: collect('PROJECT').slice(0, 2),
    skillIds: collect('SKILL'),
    bulletIds: collect('BULLET'),
  };
}

export function applyStudioEdits(payload, patch, nextRevision) {
  const next = structuredClone(payload);
  const nodeMap = new Map(next.nodes.map((node) => [node.nodeId, node]));
  const seen = new Set();
  for (const edit of patch.edits || []) {
    const node = nodeMap.get(edit.nodeId);
    if (!node?.editable || seen.has(edit.nodeId))
      throw new ValidationError('Invalid or duplicate editable node ID');
    seen.add(edit.nodeId);
    let parent = next.structuredResume;
    for (const key of node.path.slice(0, -1)) parent = parent[key];
    parent[node.path.at(-1)] = edit.text;
    // Explicit candidate end-date wording controls the existing current-role flag.
    // Clearing an unknown end date does not assert that employment is ongoing.
    if (node.path[0] === 'experience' && node.path[2] === 'endDate' && edit.text?.trim()) {
      parent.isCurrent = /^(present|current|ongoing)$/i.test(edit.text.trim());
      if (parent.isCurrent) parent.endDate = null;
    }
    next.nodeProvenance[edit.nodeId] = { truthState: 'CLAIMED', editedAtRevision: nextRevision };
  }
  if (patch.selection) {
    const kinds = {
      experienceIds: 'EXPERIENCE',
      projectIds: 'PROJECT',
      skillIds: 'SKILL',
      bulletIds: 'BULLET',
    };
    for (const [field, ids] of Object.entries(patch.selection)) {
      if (ids.some((id) => nodeMap.get(id)?.kind !== kinds[field]))
        throw new ValidationError('Unknown or wrong-kind selection ID');
      next.selection[field] = [...ids];
    }
  }
  const content = StudioDraftContentSchema.safeParse(next.structuredResume);
  const selection = StudioDraftSelectionSchema.safeParse(next.selection);
  if (!content.success || !selection.success)
    throw new ValidationError('Draft edits violate structured content or selection constraints');
  next.structuredResume = content.data;
  next.selection = selection.data;
  return next;
}
