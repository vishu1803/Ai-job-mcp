import {
  formatNormalizedDateRange,
  formatEmploymentMetadata,
  formatInstitutionLocation,
} from './latex-document-generator.service.js';
import { formatResumeSourceEntry } from '../utils/resume-source-normalizer.js';
import {
  displayUrlForLink,
  isValidProfileUrl,
  normalizeHyperlinkDestination,
  cleanResumeFacingTechnologies,
} from './candidate-artifact-content.service.js';

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
  const add = (text, style = 'Normal', verify = true, extra = {}) => {
    if (text) {
      blocks.push({ text, style, ...extra });
      if (verify) expected.push(text);
    }
  };
  const groups = [];
  const heading = (text) => {
    groups.push({ title: text, blockStart: blocks.length, expectedStart: expected.length });
    add(text, 'Heading1', false);
  };
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
  const validLinks = (identity.links || []).filter((l) => l && l.url && isValidProfileUrl(l.url));
  const seenLinks = new Set();
  const linkItems = [];
  for (const link of validLinks) {
    const rawUrl = String(link.url).trim();
    const cleanDisplay = displayUrlForLink(rawUrl);
    if (!cleanDisplay) continue;
    const normKey = cleanDisplay.toLowerCase();
    if (seenLinks.has(normKey)) continue;
    seenLinks.add(normKey);
    expected.push(cleanDisplay);
    links.push(normalizeHyperlinkDestination(rawUrl));
    linkItems.push({ text: cleanDisplay, url: normalizeHyperlinkDestination(rawUrl) });
  }

  if (linkItems.length > 0) {
    const totalChars = linkItems.reduce((s, l) => s + l.text.length, 0);
    const separatorsWidthPt = Math.max(0, linkItems.length - 1) * 10;
    const estimatedWidth = totalChars * 4.16 + separatorsWidthPt;
    if (estimatedWidth <= 520 || linkItems.length <= 4) {
      const rowText = linkItems.map((l) => l.text).join(' | ');
      add(rowText, 'Normal', false, { hyperlinks: linkItems });
    } else {
      const mid = Math.ceil(linkItems.length / 2);
      const r1 = linkItems.slice(0, mid);
      const r2 = linkItems.slice(mid);
      add(r1.map((l) => l.text).join(' | '), 'Normal', false, { hyperlinks: r1 });
      add(r2.map((l) => l.text).join(' | '), 'Normal', false, { hyperlinks: r2 });
    }
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
      add(formatEmploymentMetadata(e.location, e.employmentType));
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
      const cleanTechs = cleanResumeFacingTechnologies(p.technologies);
      if (cleanTechs.length) add(cleanTechs.join(', '));
      p.bullets.forEach((text) => add(text, 'Bullet'));
      p.urls.forEach((url) => add(url, 'Normal', false));
    }
  }
  if (content.skills.length) {
    heading('Technical Skills');
    if (content.sectionOrder) {
      const categories = new Map();
      for (const skill of content.skills) {
        const key = skill.sourceFields.categoryName || 'Skills';
        if (!categories.has(key)) categories.set(key, []);
        categories.get(key).push(skill.name);
      }
      for (const [category, names] of categories) add(category + ': ' + names.join(', '));
    } else add(content.skills.map((s) => s.name).join(', '));
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
      add(formatInstitutionLocation(e.institution, e.location));
      if (e.coursework?.length) add('Relevant Coursework: ' + e.coursework.join(', '));
      if (e.isCurrent && e.endDate)
        add('Expected completion: ' + formatNormalizedDateRange(e.endDate, ''));
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
  for (const [key, entries] of Object.entries(content.optionalSections || {})) {
    if (entries.length) {
      heading(titles[key] || key);
      if (key === 'languages') {
        const langEntries = entries
          .map((entry) => {
            if (typeof entry === 'string') return entry;
            const name = entry.language || entry.name || '';
            const prof = entry.proficiency
              ? ` (${entry.proficiency.charAt(0).toUpperCase() + entry.proficiency.slice(1).toLowerCase()})`
              : '';
            return name ? `${name}${prof}` : null;
          })
          .filter(Boolean);
        if (langEntries.length) {
          add(langEntries.join(', '));
        }
      } else {
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
    }
  }
  if (content.dsa?.hasSection) {
    heading('Problem Solving');
    content.dsa.bullets.forEach((bullet) =>
      add(typeof bullet === 'string' ? bullet : bullet.text, 'Bullet')
    );
    if (content.dsa.profileUrl) {
      links.push(content.dsa.profileUrl);
      add(content.dsa.profileUrl, 'Normal', false);
    }
  }
  if (content.sectionOrder && groups.length) {
    const sectionKeys = {
      'Professional Summary': 'SUMMARY',
      'Technical Skills': 'SKILLS',
      'Technical Projects': 'PROJECTS',
      'Professional Experience': 'EXPERIENCE',
      Education: 'EDUCATION',
      Certifications: 'CERTIFICATIONS',
      'Problem Solving': 'DSA',
      ...Object.fromEntries(
        Object.entries(titles).map(([key, title]) => [
          title,
          key.replace(/([a-z])([A-Z])/g, '$1_$2').toUpperCase(),
        ])
      ),
    };
    sectionKeys['Volunteer Experience'] = 'VOLUNTEER';
    const slices = groups.map((group, index) => ({
      ...group,
      blocks: blocks.slice(group.blockStart, groups[index + 1]?.blockStart),
      expected: expected.slice(group.expectedStart, groups[index + 1]?.expectedStart),
    }));
    const rank = (group) => {
      const value = content.sectionOrder.indexOf(sectionKeys[group.title]);
      return value < 0 ? content.sectionOrder.length : value;
    };
    slices.sort((a, b) => rank(a) - rank(b));
    const headerBlocks = blocks.slice(0, groups[0].blockStart),
      headerExpected = expected.slice(0, groups[0].expectedStart);
    blocks.splice(0, blocks.length, ...headerBlocks, ...slices.flatMap((group) => group.blocks));
    expected.splice(
      0,
      expected.length,
      ...headerExpected,
      ...slices.flatMap((group) => group.expected)
    );
  }
  const render = {
    ...content,
    schemaVersion: 'studio-render/1.0.0',
    targetRole: content.targetRole || '',
    sectionOrder: content.sectionOrder || [
      'SUMMARY',
      'EXPERIENCE',
      'PROJECTS',
      'SKILLS',
      'EDUCATION',
      'CERTIFICATIONS',
    ],
    skills: {
      categories: [
        ...content.skills
          .reduce((categories, skill) => {
            const name = content.sectionOrder
              ? skill.sourceFields.categoryName || 'Skills'
              : 'Skills';
            if (!categories.has(name)) categories.set(name, { categoryName: name, skills: [] });
            categories.get(name).skills.push(skill);
            return categories;
          }, new Map())
          .values(),
      ],
    },
    projects: content.projects.map((p) => ({
      ...p.sourceFields,
      ...p,
      displayName: p.name,
      repositoryUrl: content.sectionOrder
        ? p.sourceFields.repositoryUrl || null
        : p.urls[0] || null,
      liveUrl: content.sectionOrder ? p.sourceFields.liveUrl || null : p.urls[1] || null,
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
