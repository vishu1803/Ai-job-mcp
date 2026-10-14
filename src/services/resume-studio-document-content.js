import { formatNormalizedDateRange } from './latex-document-generator.service.js';
import { formatResumeSourceEntry } from '../utils/resume-source-normalizer.js';

/** Projection only: include explicit selections, preserve all other source sections. */
export function studioDocumentContent(draft) {
  const content = structuredClone(draft.structuredResume),
    nodes = draft.nodes;
  const selected = (kind, path, key) =>
    nodes.some(
      (n) =>
        n.kind === kind &&
        JSON.stringify(n.path) === JSON.stringify(path) &&
        draft.selection[key].includes(n.nodeId)
    );
  for (const [section, kind, key] of [
    ['experience', 'EXPERIENCE', 'experienceIds'],
    ['projects', 'PROJECT', 'projectIds'],
  ]) {
    content[section] = content[section].flatMap((entry, index) => {
      if (!selected(kind, [section, index], key)) return [];
      entry.bullets = entry.bullets.filter((_, bullet) =>
        selected('BULLET', [section, index, 'bullets', bullet], 'bulletIds')
      );
      return [entry];
    });
  }
  content.skills = content.skills.filter((_, index) =>
    selected('SKILL', ['skills', index], 'skillIds')
  );
  const blocks = [],
    expected = [],
    links = [];
  const add = (text, style = 'Normal', verify = true) => {
    if (text) {
      blocks.push({ text, style });
      if (verify) expected.push(text);
    }
  };
  const heading = (text) => add(text, 'Heading1', false);
  const date = (e) =>
    formatNormalizedDateRange(e.startDate, e.isCurrent ? 'Present' : e.endDate).replace(
      / -- /g,
      ' — '
    );
  const identity = content.candidateIdentity;
  add(identity.displayName, 'Title');
  add(identity.headline);
  add(
    [identity.phone, identity.location, identity.email].filter(Boolean).join(' | '),
    'Normal',
    false
  );
  expected.push(...[identity.phone, identity.location, identity.email].filter(Boolean));
  for (const link of identity.links) {
    add(link.url, 'Normal', false);
    expected.push(link.url.replace(/^https?:\/\/(?:www\.)?/i, '').replace(/\/$/, ''));
    links.push(link.url);
  }
  if (content.summary.text) {
    heading('Professional Summary');
    add(content.summary.text);
  }
  if (content.experience.length) {
    heading('Professional Experience');
    for (const e of content.experience) {
      add([e.title, e.company].filter(Boolean).join(' — '), 'Heading2');
      add(date(e));
      add(e.location);
      add(e.employmentType);
      if (e.technologies?.length) add('Technologies: ' + e.technologies.join(', '));
      for (const text of new Set([e.summary, e.description].filter(Boolean))) add(text);
      e.bullets.forEach((text) => add(text, 'Bullet'));
    }
  }
  if (content.projects.length) {
    heading('Technical Projects');
    for (const p of content.projects) {
      add(p.name, 'Heading2');
      links.push(...p.urls);
      add(p.description);
      if (p.technologies.length) add(p.technologies.join(', '));
      p.bullets.forEach((text) => add(text, 'Bullet'));
      p.urls.forEach((url) => add(url, 'Normal', false));
    }
  }
  if (content.skills.length) {
    heading('Technical Skills');
    add(content.skills.map((s) => s.name).join(', '));
  }
  if (content.education.length) {
    heading('Education');
    for (const e of content.education) {
      add(
        (e.degree || '') +
          (e.fieldOfStudy && !e.degree?.toLowerCase().includes(e.fieldOfStudy.toLowerCase())
            ? ' in ' + e.fieldOfStudy
            : ''),
        'Heading2'
      );
      add(date(e));
      add(e.institution);
      if (e.coursework?.length) add('Relevant Coursework: ' + e.coursework.join(', '));
      if (e.isCurrent && e.endDate)
        add('Expected completion: ' + formatNormalizedDateRange(e.endDate, ''));
      add(e.location);
      if (e.grade) add('Grade: ' + e.grade);
      e.honors?.forEach((text) => add(text));
      e.bullets?.forEach((text) => add(text, 'Bullet'));
    }
  }
  if (content.certifications.length) {
    heading('Certifications');
    for (const e of content.certifications) {
      add(
        [
          e.name,
          e.issuingOrganization,
          e.issueDate ? 'Issued: ' + formatNormalizedDateRange(e.issueDate, '') : '',
          e.expirationDate ? 'Expires: ' + formatNormalizedDateRange(e.expirationDate, '') : '',
          e.credentialId ? 'ID: ' + e.credentialId : '',
          e.notes,
          e.credentialUrl,
        ]
          .filter(Boolean)
          .join(' | '),
        'Bullet'
      );
      if (e.credentialUrl) links.push(e.credentialUrl);
    }
  }
  const titles = {
    coursework: 'Relevant Coursework',
    publications: 'Publications',
    achievements: 'Achievements',
    additionalSkills: 'Additional Skills',
    awards: 'Awards',
    languages: 'Languages',
    volunteerExperience: 'Volunteer Experience',
    leadership: 'Leadership',
    customSections: 'Additional Information',
  };
  for (const [key, entries] of Object.entries(content.optionalSections || {}))
    if (entries.length) {
      heading(titles[key] || key);
      for (const entry of entries) {
        const parts =
          typeof entry === 'string'
            ? [entry]
            : [
                entry.title,
                entry.name,
                entry.language,
                entry.proficiency,
                entry.organization,
                entry.category,
                entry.issuer,
                entry.publisher,
                entry.authors?.join(', '),
                entry.date ? formatNormalizedDateRange(entry.date, '') : '',
                formatNormalizedDateRange(
                  entry.startDate,
                  entry.isCurrent ? 'Present' : entry.endDate
                ),
                entry.location,
                entry.description,
                entry.summary,
                ...(entry.bullets || []),
                ...(entry.items || []),
                entry.url,
              ];
        add(
          [...new Set(parts.filter(Boolean))].join(' | ') || formatResumeSourceEntry(entry),
          'Bullet'
        );
        if (entry.url) links.push(entry.url);
      }
    }
  const render = {
    ...content,
    schemaVersion: 'studio-render/1.0.0',
    targetRole: '',
    sectionOrder: ['SUMMARY', 'EXPERIENCE', 'PROJECTS', 'SKILLS', 'EDUCATION', 'CERTIFICATIONS'],
    skills: { categories: [{ categoryName: 'Skills', skills: content.skills }] },
    projects: content.projects.map((p) => ({
      ...p,
      displayName: p.name,
      repositoryUrl: p.urls[0] || null,
      liveUrl: p.urls[1] || null,
    })),
  };
  const mapNodes = draft.nodes
    .filter((n) => n.editable && ['BULLET', 'SUMMARY'].includes(n.kind))
    .flatMap((node) => {
      if (node.kind === 'BULLET') {
        const parent = draft.nodes.find((n) => n.nodeId === node.parentId);
        if (
          !draft.selection.bulletIds.includes(node.nodeId) ||
          !draft.selection[parent.kind === 'PROJECT' ? 'projectIds' : 'experienceIds'].includes(
            parent.nodeId
          )
        )
          return [];
      }
      const text = node.path.reduce((v, k) => v?.[k], draft.structuredResume);
      return text ? [{ nodeId: node.nodeId, text }] : [];
    });
  return { content, render, blocks, expected, links, mapNodes };
}
