/** PRD-002: an explicit, hash-bound presentation of a complete resume.
 * Selection happens before sealing. Rendering never invents or edits facts.
 */
import { ValidationError } from '../errors/index.js';
import { formatResumeSourceEntry } from '../utils/resume-source-normalizer.js';

const textOf = (value) => (typeof value === 'string' ? value : value?.text || '');
const words = (value) =>
  new Set(
    String(value || '')
      .toLowerCase()
      .match(/[\p{L}\p{N}+#.]{3,}/gu) || []
  );
const OPTIONAL = new Set([
  'publications',
  'awards',
  'achievements',
  'volunteerExperience',
  'leadership',
  'languages',
  'coursework',
  'additionalSkills',
  'customSections',
]);
const sentences = (value) => {
  const text = String(value || ''),
    result = [];
  let start = 0;
  for (const match of text.matchAll(/[.!?]+\s+/g)) {
    const end = match.index + match[0].trimEnd().length;
    if (/\b(?:Dr|Mr|Ms|Mrs|Prof|Sr|Jr|Inc|Ltd|e\.g|i\.e|B\.Sc|M\.Sc)\.$/i.test(text.slice(0, end)))
      continue;
    result.push(text.slice(start, end).trim());
    start = match.index + match[0].length;
  }
  result.push(text.slice(start).trim());
  return result.filter(Boolean);
};

function allowedPath(path) {
  return (
    /^(projects|experience|certifications)\.\d+$/.test(path) ||
    /^(projects|experience)\.\d+\.(bullets|technologies)\.\d+$/.test(path) ||
    /^projects\.\d+\.description$/.test(path) ||
    /^skills\.categories\.\d+\.skills\.\d+$/.test(path) ||
    /^dsa\.bullets\.\d+$/.test(path) ||
    path === 'summary.text' ||
    (/^optionalSections\.[a-zA-Z]+\.\d+$/.test(path) && OPTIONAL.has(path.split('.')[1]))
  );
}

/** Apply exact approved omissions. Full canonical fields remain on the source. */
export function onePageResumeView(source) {
  if (!source?.presentation) return source;
  const contract = source.presentation;
  if (
    contract.mode !== 'ONE_PAGE' ||
    contract.paperSize !== 'A4' ||
    contract.minimumFontPt !== 10 ||
    contract.rendererVersion !== 'chrome-ats-a4-v2'
  ) {
    throw new ValidationError(
      'Unsupported one-page presentation contract; generate and review a fresh resume.',
      'ONE_PAGE_CONTRACT_INVALID'
    );
  }
  if (
    !Array.isArray(contract.sectionOrder) ||
    new Set(contract.sectionOrder).size !== contract.sectionOrder.length ||
    JSON.stringify([...contract.sectionOrder].sort()) !==
      JSON.stringify([...(source.sectionOrder || [])].sort())
  ) {
    throw new ValidationError(
      'One-page section order must retain every supported source section.',
      'ONE_PAGE_CONTRACT_INVALID'
    );
  }
  const omitted = new Set();
  for (const decision of contract.decisions || []) {
    if (
      !allowedPath(decision.path) ||
      decision.action !== 'OMITTED' ||
      !decision.reason ||
      omitted.has(decision.path)
    ) {
      throw new ValidationError(
        'Invalid or duplicate one-page selection decision.',
        'ONE_PAGE_CONTRACT_INVALID'
      );
    }
    const value = decision.path.split('.').reduce((node, key) => node?.[key], source);
    if (value === undefined)
      throw new ValidationError(
        'One-page decision references missing source data.',
        'ONE_PAGE_CONTRACT_INVALID'
      );
    omitted.add(decision.path);
  }
  const visit = (node, path = '') => {
    if (Array.isArray(node))
      return node.flatMap((value, index) => {
        const child = path ? `${path}.${index}` : String(index);
        return omitted.has(child) ? [] : [visit(value, child)];
      });
    if (node && typeof node === 'object')
      return Object.fromEntries(
        Object.entries(node).map(([key, value]) => {
          const child = path ? `${path}.${key}` : key;
          return [key, omitted.has(child) ? '' : visit(value, child)];
        })
      );
    return node;
  };
  const view = visit(source);
  view.candidateIdentity.headline =
    source.candidateIdentity.masterHeadline || `Target role: ${source.targetRole}`;
  for (const condensation of contract.condensations || []) {
    const sourceSentences = sentences(source.summary?.text);
    const indices = condensation.sentenceIndices;
    if (
      condensation.path !== 'summary.text' ||
      !indices?.length ||
      indices.length > 2 ||
      new Set(indices).size !== indices.length ||
      indices.some((index) => !Number.isInteger(index) || !sourceSentences[index]) ||
      !condensation.reason
    ) {
      throw new ValidationError(
        'Invalid source-preserving summary condensation.',
        'ONE_PAGE_CONTRACT_INVALID'
      );
    }
    view.summary.text = indices.map((index) => sourceSentences[index]).join(' ');
  }
  if (contract.sectionOrder) view.sectionOrder = [...contract.sectionOrder];
  delete view.presentation;
  return view;
}

/** Deterministic relevance/confidence selection; retain chronology within sections. */
export function planOnePagePresentation(source, job = {}, pass = 0) {
  const jobTokens = words(`${job.title || ''} ${job.description || ''}`);
  const relevance = (value) => [...words(value)].filter((t) => jobTokens.has(t)).length;
  const score = (value) =>
    relevance(
      typeof value === 'string'
        ? value
        : [
            value.title,
            value.name,
            value.displayName,
            value.description,
            textOf(value),
            ...(value.bullets || []).map(textOf),
          ].join(' ')
    ) *
      10 +
    (/^(CLAIMED|USER_PROVIDED)$/.test(value?.provenanceStatus || '') ? 2 : 0);
  const rank = (items) =>
    items
      .map((value, index) => ({ index, score: score(value) }))
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .map((item) => item.index);
  const decisions = [];
  const condensations = [];
  const omit = (path, reason) => decisions.push({ path, action: 'OMITTED', reason });
  const caps = [
    { projects: 4, roles: 6, bullets: 4, skills: 24, optional: 3 },
    { projects: 3, roles: 4, bullets: 3, skills: 18, optional: 2 },
    { projects: 2, roles: 3, bullets: 2, skills: 12, optional: 1 },
    { projects: 1, roles: 2, bullets: 1, skills: 8, optional: 0 },
  ][pass];
  if (!caps) throw new ValidationError('Invalid fitting pass.', 'ONE_PAGE_CONTRACT_INVALID');
  const fresher =
    source.tailoringPlan?.candidateArchetype === 'FRESHER' || !(source.experience || []).length;
  for (const field of ['experience', 'projects']) {
    const items = source[field] || [];
    const capacity =
      field === 'experience'
        ? caps.roles
        : fresher
          ? caps.projects
          : Math.max(1, caps.projects - 1);
    // Keep the latest authored position and deterministic relevant entries; never reorder dates.
    const latest =
      field === 'experience' && items.length
        ? items
            .map((item, index) => ({
              index,
              date: item.isCurrent ? '9999' : item.endDate || item.startDate || '',
            }))
            .sort((a, b) => b.date.localeCompare(a.date) || a.index - b.index)[0].index
        : null;
    const keep = new Set(
      [...new Set([...(latest !== null ? [latest] : []), ...rank(items)])].slice(0, capacity)
    );
    const seenProjectContent = new Set();
    items.forEach((item, index) => {
      if (!keep.has(index))
        return omit(
          `${field}.${index}`,
          'Lower job relevance under the one-page content budget; full record retained.'
        );
      if (field === 'projects') {
        const fingerprint = JSON.stringify([
          item.description || '',
          (item.bullets || [])
            .map(textOf)
            .map((t) => t.trim().toLowerCase())
            .sort(),
          [...(item.technologies || [])].sort(),
        ]);
        if (seenProjectContent.has(fingerprint))
          return omit(
            `projects.${index}`,
            'Repeated project description and accomplishments; strongest selected presentation retained, original project identity preserved.'
          );
        seenProjectContent.add(fingerprint);
      }
      const bullets = item.bullets || [];
      const selected = new Set(rank(bullets).slice(0, caps.bullets));
      const seen = new Set();
      bullets.forEach((bullet, b) => {
        const key = textOf(bullet).replace(/\s+/g, ' ').trim().toLowerCase();
        if (!key || seen.has(key) || !selected.has(b))
          omit(
            `${field}.${index}.bullets.${b}`,
            !key || seen.has(key)
              ? 'Empty or repeated bullet.'
              : 'Lower relevance under the one-page bullet budget.'
          );
        seen.add(key);
      });
      const techSelection = new Set(rank(item.technologies || []).slice(0, 6));
      (item.technologies || []).forEach((_technology, t) => {
        if (!techSelection.has(t))
          omit(
            `${field}.${index}.technologies.${t}`,
            'Lower relevance technology outside six associations; no proficiency is inferred.'
          );
      });
      if (
        field === 'projects' &&
        pass > 0 &&
        item.description &&
        bullets.some((bullet, b) => selected.has(b) && textOf(bullet).trim())
      )
        omit(
          `projects.${index}.description`,
          'Detailed description retained in the full resume; selected factual bullets provide the presentation.'
        );
    });
  }
  const skills = (source.skills?.categories || []).flatMap((category, c) =>
    (category.skills || []).map((skill, s) => ({
      skill,
      path: `skills.categories.${c}.skills.${s}`,
    }))
  );
  const seenSkills = new Set();
  const selectedSkills = new Set(
    skills
      .filter((item) =>
        ['CLAIMED', 'USER_PROVIDED', 'VERIFIED', 'CORROBORATED'].includes(
          item.skill.provenanceStatus
        )
      )
      .map((item, index) => ({
        ...item,
        index,
        score: relevance(item.skill.displayName || item.skill.name || item.skill.slug),
      }))
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, caps.skills)
      .map((item) => item.path)
  );
  for (const item of skills) {
    const key = String(
      item.skill.displayName || item.skill.name || item.skill.slug || ''
    ).toLowerCase();
    if (
      seenSkills.has(key) ||
      !selectedSkills.has(item.path) ||
      !['CLAIMED', 'USER_PROVIDED', 'VERIFIED', 'CORROBORATED'].includes(
        item.skill.provenanceStatus
      )
    )
      omit(
        item.path,
        'Duplicate, unsupported, repository-inferred or lower relevance skill; inventory is preserved. Repository associations do not establish proficiency.'
      );
    seenSkills.add(key);
  }
  for (const [section, items] of Object.entries(source.optionalSections || {})) {
    if (!OPTIONAL.has(section)) continue;
    const keep = new Set(rank(items).slice(0, caps.optional));
    items.forEach((_item, index) => {
      if (!keep.has(index))
        omit(
          `optionalSections.${section}.${index}`,
          'Optional entry outside the one-page relevance budget.'
        );
    });
  }
  const certSelection = new Set(
    rank(source.certifications || []).slice(0, Math.max(2, caps.optional))
  );
  (source.certifications || []).forEach((_entry, index) => {
    if (!certSelection.has(index))
      omit(
        `certifications.${index}`,
        'Lower relevance credential retained in the full resume; one-page credential budget.'
      );
  });
  // Summary duplication is removed explicitly; authored wording is never rewritten here.
  const summary = source.summary?.text?.trim();
  if (summary && summary.split(/\s+/).length > 65) {
    const sourceSentences = sentences(summary);
    let used = 0;
    const selected = sourceSentences
      .map((text, index) => ({ text, index, score: relevance(text) }))
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .filter((item) => {
        const count = item.text.split(/\s+/).length;
        if (used + count > 65) return false;
        used += count;
        return true;
      })
      .slice(0, 2)
      .map((item) => item.index)
      .sort((a, b) => a - b);
    if (selected.length && selected.length < sourceSentences.length)
      condensations.push({
        path: 'summary.text',
        sentenceIndices: selected,
        reason:
          'Select concise relevant complete authored sentences; full summary and wording retained in canonical data.',
      });
  }
  const displayedBullets = ['projects', 'experience'].flatMap((field) =>
    (source[field] || []).flatMap((item, index) =>
      decisions.some((d) => d.path === `${field}.${index}`)
        ? []
        : (item.bullets || []).flatMap((bullet, b) =>
            decisions.some((d) => d.path === `${field}.${index}.bullets.${b}`)
              ? []
              : [textOf(bullet).trim()]
          )
    )
  );
  const summarySentences = sentences(summary);
  const sourceBullets = ['projects', 'experience'].flatMap((field) =>
    (source[field] || []).flatMap((item) =>
      (item.bullets || []).map((bullet) => textOf(bullet).trim())
    )
  );
  const generatedAccomplishmentSummary =
    source.summary?.composedFromFactIds?.length > 0 &&
    summarySentences.length > 0 &&
    summarySentences.some((sentence) => sourceBullets.includes(sentence));
  const nonRepeated = summarySentences
    .map((text, index) => ({ text, index }))
    .filter((item) => !displayedBullets.includes(item.text))
    .map((item) => item.index);
  if (
    source.writing?.summaryStatus !== 'ACCEPTED' &&
    summary &&
    summarySentences.length &&
    (!nonRepeated.length || generatedAccomplishmentSummary)
  ) {
    condensations.length = 0;
    omit(
      'summary.text',
      generatedAccomplishmentSummary
        ? 'Generated summary repeats source accomplishments; relevant project and experience details take priority. Full source facts are retained.'
        : 'Summary repeats selected accomplishment bullets; facts remain in the displayed projects or experience.'
    );
  } else if (
    source.writing?.summaryStatus !== 'ACCEPTED' &&
    summarySentences.length > 1 &&
    nonRepeated.length < summarySentences.length &&
    nonRepeated.length <= 2
  ) {
    condensations.length = 0;
    condensations.push({
      path: 'summary.text',
      sentenceIndices: nonRepeated,
      reason:
        'Remove exact repetition of selected accomplishment bullets; full authored summary retained.',
    });
  }
  const preferred = fresher
    ? [
        'HEADER',
        'SUMMARY',
        'SKILLS',
        'PROJECTS',
        'DSA',
        'EXPERIENCE',
        'EDUCATION',
        'CERTIFICATIONS',
      ]
    : [
        'HEADER',
        'SUMMARY',
        'SKILLS',
        'EXPERIENCE',
        'PROJECTS',
        'DSA',
        'EDUCATION',
        'CERTIFICATIONS',
      ];
  const order = source.sectionOrder || [];
  const sectionOrder = [
    ...preferred.filter((key) => order.includes(key)),
    ...order.filter((key) => !preferred.includes(key)),
  ];
  return {
    mode: 'ONE_PAGE',
    paperSize: 'A4',
    minimumFontPt: 10,
    rendererVersion: 'chrome-ats-a4-v2',
    pass,
    sectionOrder,
    condensations,
    decisions,
  };
}

/** At most four actual renders. No font shrinking or post-approval content edits. */
export async function fitOnePageResume(
  source,
  job,
  { generator, compiler, applicationPackage = {} }
) {
  let lastError;
  for (let pass = 0; pass < 4; pass++) {
    const presentation = planOnePagePresentation(source, job, pass);
    const selected = { ...source, presentation };
    const pkg = {
      ...applicationPackage,
      structuredResume: selected,
      tailoredResume: { ...applicationPackage.tailoredResume, structuredResume: selected },
    };
    const generated = generator.generateTailoredResumeLatex({ applicationPackage: pkg });
    try {
      const result = await compiler.compileLatexToPdf({
        texContent: generated.texContent,
        jobName: 'one-page-fit',
        strictOnePage: true,
      });
      if (result.pageCount !== 1)
        throw new ValidationError(
          'PDF page count was not independently established.',
          'ONE_PAGE_UNVERIFIABLE'
        );
      return selected;
    } catch (error) {
      if (error.code !== 'ONE_PAGE_OVERFLOW') throw error;
      lastError = error;
    }
  }
  const error = new ValidationError(
    'A readable one-page A4 resume could not be produced. Shorten the saved summary or long entries, select fewer relevant roles/projects, or choose a supported multipage export. Full source data is preserved.',
    'ONE_PAGE_OVERFLOW'
  );
  error.statusCode = 422;
  error.details = { passes: 4, lastPageCount: lastError?.details?.pageCount || null };
  throw error;
}

/** Preview the same selected facts as the PDF; decision ledger stays outside resume prose. */
export function onePageResumeMarkdown(source) {
  const view = onePageResumeView(source);
  const sections = {
    SUMMARY: view.summary?.text ? ['## Professional Summary', view.summary.text] : [],
    SKILLS: [
      '## Skills',
      ...(view.skills?.categories || [])
        .filter((c) => c.skills?.length)
        .map(
          (c) =>
            `${c.categoryName}: ${c.skills.map((s) => s.displayName || s.name || s.slug).join(', ')}`
        ),
    ],
    EXPERIENCE: [
      '## Experience',
      ...(view.experience || []).flatMap((e) => [
        `### ${[e.title, e.company].filter(Boolean).join(' | ')}`,
        [e.startDate, e.isCurrent ? 'Present' : e.endDate].filter(Boolean).join(' - '),
        e.location,
        e.employmentType,
        e.technologies?.join(', '),
        e.summary,
        e.description,
        ...(e.bullets || []).map((b) => '- ' + textOf(b)),
      ]),
    ],
    PROJECTS: [
      '## Projects',
      ...(view.projects || []).flatMap((p) => [
        `### ${p.displayName || p.name}`,
        p.repositoryUrl,
        p.liveUrl,
        p.description,
        p.technologies?.join(', '),
        ...(p.bullets || []).map((b) => '- ' + textOf(b)),
      ]),
    ],
    EDUCATION: [
      '## Education',
      ...(view.education || []).flatMap((e) => [
        [e.degree, e.fieldOfStudy, e.institution].filter(Boolean).join(' | '),
        [e.startDate, e.isCurrent ? 'Present' : e.endDate].filter(Boolean).join(' - '),
        e.grade,
        e.location,
        ...(e.coursework || []),
        ...(e.honors || []),
        ...(e.bullets || []).map(textOf),
      ]),
    ],
    CERTIFICATIONS: [
      '## Certifications',
      ...(view.certifications || []).flatMap((e) => [
        e.name,
        e.issuingOrganization,
        e.issueDate,
        e.expirationDate,
        e.credentialId,
        e.credentialUrl,
        e.notes,
      ]),
    ],
  };
  const optionalKeys = {
    publications: 'PUBLICATIONS',
    awards: 'AWARDS',
    achievements: 'ACHIEVEMENTS',
    volunteerExperience: 'VOLUNTEER',
    leadership: 'LEADERSHIP',
    languages: 'LANGUAGES',
    coursework: 'COURSEWORK',
    additionalSkills: 'ADDITIONAL_SKILLS',
    customSections: 'CUSTOM',
  };
  for (const [key, entries] of Object.entries(view.optionalSections || {})) {
    sections[optionalKeys[key] || key.toUpperCase()] = [
      `## ${key.replace(/([A-Z])/g, ' $1')}`,
      ...entries.map(formatResumeSourceEntry),
    ];
  }
  if (view.dsa?.hasSection)
    sections.DSA = ['## Problem Solving', view.dsa.profileUrl, ...(view.dsa.bullets || [])];
  const identity = view.candidateIdentity || {};
  return [
    `# ${identity.displayName}`,
    identity.headline,
    [identity.email, identity.phone, identity.location].filter(Boolean).join(' | '),
    ...(identity.links || []).map((l) => `${l.label}: ${l.url}`),
    ...view.sectionOrder.flatMap((key) => {
      const lines = (sections[key] || []).filter(Boolean);
      return lines.length > 1 ? lines : [];
    }),
  ]
    .filter(Boolean)
    .join('\n\n');
}
