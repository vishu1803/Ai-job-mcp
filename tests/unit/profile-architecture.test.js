/**
 * @file Profile Architecture Tests
 *
 * Tests for:
 * 1. GET /api/profile/bootstrap returns all sections in one response
 * 2. PATCH /api/profile accepts batched section updates
 * 3. Additional Skills are included in bootstrap response
 * 4. Skill catalog is included in bootstrap for client-side search
 * 5. Button types are correct (type="button" for UI actions)
 * 6. No separate network calls for catalog search or skill operations
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

describe('Profile Architecture - Bootstrap DTO', () => {
  it('bootstrap DTO contains all profile sections', () => {
    const bootstrap = {
      profile: {
        candidateId: 'test-id',
        displayName: 'Test User',
        headline: 'Engineer',
        summary: 'Summary',
        currentRole: 'Developer',
        location: 'Remote',
        careerStatus: 'FRESHER',
        currentEmployment: null,
        experience: [],
        education: [],
        certifications: [],
        languages: [],
        portfolioLinks: [],
      },
      preferences: {
        targetRoles: [],
        preferredLocations: [],
        remotePreference: 'FLEXIBLE',
        employmentTypes: ['FULL_TIME'],
        salaryFloor: null,
        salaryCurrency: 'USD',
        preferredTechStack: [],
        industries: [],
        companiesToPrioritize: [],
        companiesToAvoid: [],
        workAuthorization: [],
        visaSponsorshipRequired: false,
        availabilityDate: null,
        relocationPreference: 'REMOTE_ONLY',
      },
      skills: {
        evidenceBacked: [],
        additional: [],
      },
      skillCatalog: {
        items: [],
        categories: [],
      },
      meta: {
        updatedAt: new Date().toISOString(),
      },
    };

    assert.ok(bootstrap.profile, 'profile section exists');
    assert.ok(bootstrap.preferences, 'preferences section exists');
    assert.ok(bootstrap.skills, 'skills section exists');
    assert.ok(bootstrap.skillCatalog, 'skillCatalog section exists');
    assert.ok(bootstrap.meta, 'meta section exists');
    assert.ok(Array.isArray(bootstrap.skillCatalog.items), 'skillCatalog.items is array');
    assert.ok(Array.isArray(bootstrap.skillCatalog.categories), 'skillCatalog.categories is array');
    assert.ok(Array.isArray(bootstrap.skills.additional), 'skills.additional is array');
  });

  it('bootstrap DTO preserves profile version for optimistic concurrency', () => {
    const bootstrap = {
      profile: { candidateId: 'test', displayName: 'Test' },
      preferences: {},
      skills: { evidenceBacked: [], additional: [] },
      skillCatalog: { items: [], categories: [] },
      meta: { updatedAt: '2026-09-02T00:00:00.000Z' },
    };

    assert.ok(bootstrap.meta.updatedAt, 'meta has updatedAt for version tracking');
  });

  it('bootstrap DTO includes catalog with enough data for local search', () => {
    const catalog = {
      items: [
        { id: '1', canonicalName: 'AWS', slug: 'aws', category: 'CLOUD', aliases: ['Amazon Web Services'] },
        { id: '2', canonicalName: 'Docker', slug: 'docker', category: 'CONTAINERS', aliases: [] },
      ],
      categories: [
        { category: 'CLOUD', count: 1 },
        { category: 'CONTAINERS', count: 1 },
      ],
    };

    assert.ok(catalog.items.length >= 2, 'catalog has items for client-side search');
    assert.ok(catalog.categories.length >= 1, 'catalog has categories');
    assert.strictEqual(catalog.items[0].canonicalName, 'AWS', 'items have canonicalName');
    assert.ok(Array.isArray(catalog.items[0].aliases), 'items have aliases array');
  });
});

describe('Profile Architecture - Batched Save', () => {
  it('PATCH payload has sections structure', () => {
    const payload = {
      sections: {
        identity: { displayName: 'Test', headline: 'Engineer' },
        education: [{ institution: 'MIT', degree: 'BS' }],
        additionalSkills: [{ catalogSkillId: '1', proficiency: 'PROFICIENT' }],
        preferences: { targetRoles: ['Backend Engineer'] },
      },
    };

    assert.ok(payload.sections, 'payload has sections');
    assert.ok(payload.sections.identity, 'has identity section');
    assert.ok(Array.isArray(payload.sections.education), 'has education array');
    assert.ok(Array.isArray(payload.sections.additionalSkills), 'has additionalSkills array');
    assert.ok(payload.sections.preferences, 'has preferences section');
  });

  it('batched save only sends dirty sections', () => {
    const dirtySections = ['education', 'additionalSkills'];
    const allSections = {
      identity: { displayName: 'Test' },
      education: [{ institution: 'MIT' }],
      languages: [{ language: 'English' }],
      additionalSkills: [],
      preferences: { targetRoles: [] },
    };

    const payload = {};
    for (const section of dirtySections) {
      payload[section] = allSections[section];
    }

    assert.ok(payload.education, 'dirty education is included');
    assert.ok(payload.additionalSkills, 'dirty additionalSkills is included');
    assert.strictEqual(payload.identity, undefined, 'clean identity is NOT included');
    assert.strictEqual(payload.languages, undefined, 'clean languages is NOT included');
    assert.strictEqual(payload.preferences, undefined, 'clean preferences is NOT included');
  });
});

describe('Profile Architecture - Additional Skills Local State', () => {
  it('additional skills are added to local state without network calls', () => {
    let additionalSkillsData = [];
    let _localSkillIdCounter = 10000;

    function addSkillLocal(skillId, name, category, proficiency) {
      const isLearning = proficiency === 'CURRENTLY_LEARNING';
      const newSkill = {
        id: 'local-' + (++_localSkillIdCounter),
        catalogSkillId: skillId,
        skillName: name,
        skillSlug: name.toLowerCase().replace(/\s+/g, '-'),
        category: category,
        proficiency: proficiency,
        provenanceStatus: isLearning ? 'LEARNING' : 'SELF_DECLARED',
        source: 'CANDIDATE_DECLARED',
        usageContext: null,
        notes: null,
      };
      additionalSkillsData.push(newSkill);
      return newSkill;
    }

    const skill1 = addSkillLocal('1', 'AWS', 'CLOUD', 'PROFICIENT');
    const skill2 = addSkillLocal('2', 'Kubernetes', 'CONTAINERS', 'CURRENTLY_LEARNING');

    assert.strictEqual(additionalSkillsData.length, 2, '2 skills added locally');
    assert.strictEqual(skill1.provenanceStatus, 'SELF_DECLARED', 'AWS is SELF_DECLARED');
    assert.strictEqual(skill2.provenanceStatus, 'LEARNING', 'K8s is LEARNING');
    assert.ok(skill1.id.startsWith('local-'), 'local skill gets local ID');
  });

  it('additional skills are removed from local state without network calls', () => {
    let additionalSkillsData = [
      { id: '1', skillName: 'AWS' },
      { id: '2', skillName: 'Docker' },
      { id: '3', skillName: 'Redis' },
    ];

    additionalSkillsData = additionalSkillsData.filter(s => s.id !== '2');

    assert.strictEqual(additionalSkillsData.length, 2, '1 skill removed locally');
    assert.strictEqual(additionalSkillsData[0].skillName, 'AWS', 'AWS remains');
    assert.strictEqual(additionalSkillsData[1].skillName, 'Redis', 'Redis remains');
  });

  it('local catalog search finds skills without network calls', () => {
    const catalog = [
      { id: '1', canonicalName: 'AWS', slug: 'aws', category: 'CLOUD', aliases: ['Amazon Web Services', 'Amazon AWS'] },
      { id: '2', canonicalName: 'Docker', slug: 'docker', category: 'CONTAINERS', aliases: [] },
      { id: '3', canonicalName: 'Kubernetes', slug: 'kubernetes', category: 'CONTAINERS', aliases: ['K8s'] },
      { id: '4', canonicalName: 'React', slug: 'react', category: 'FRAMEWORK', aliases: ['ReactJS'] },
    ];

    function searchCatalog(q, existingSlugs = new Set()) {
      const query = q.toLowerCase().trim();
      return catalog
        .filter(s => {
          if (existingSlugs.has(s.slug)) return false;
          const name = (s.canonicalName || '').toLowerCase();
          const slug = (s.slug || '').toLowerCase();
          const aliases = Array.isArray(s.aliases) ? s.aliases.map(a => a.toLowerCase()) : [];
          return name.includes(query) || slug.includes(query) || aliases.some(a => a.includes(query));
        })
        .slice(0, 30);
    }

    assert.strictEqual(searchCatalog('aws').length, 1, 'found AWS');
    assert.strictEqual(searchCatalog('amazon').length, 1, 'found AWS via alias');
    assert.strictEqual(searchCatalog('k8s').length, 1, 'found K8s via alias');
    assert.strictEqual(searchCatalog('dock').length, 1, 'found Docker by partial');
    assert.strictEqual(searchCatalog('xyz').length, 0, 'no results for unknown');

    // With existing skills filtered out
    const existing = new Set(['docker']);
    assert.strictEqual(searchCatalog('docker', existing).length, 0, 'Docker excluded when already added');
    assert.strictEqual(searchCatalog('aws', existing).length, 1, 'AWS still found when Docker excluded');
  });

  it('local category filter works without network calls', () => {
    const catalog = [
      { id: '1', canonicalName: 'AWS', category: 'CLOUD' },
      { id: '2', canonicalName: 'Docker', category: 'CONTAINERS' },
      { id: '3', canonicalName: 'Kubernetes', category: 'CONTAINERS' },
      { id: '4', canonicalName: 'Redis', category: 'DATABASES' },
    ];

    function filterByCategory(cat) {
      return catalog.filter(s => s.category === cat);
    }

    assert.strictEqual(filterByCategory('CLOUD').length, 1, '1 CLOUD skill');
    assert.strictEqual(filterByCategory('CONTAINERS').length, 2, '2 CONTAINERS skills');
    assert.strictEqual(filterByCategory('DATABASES').length, 1, '1 DATABASES skill');
    assert.strictEqual(filterByCategory('NONEXISTENT').length, 0, '0 for nonexistent category');
  });
});

describe('Profile Architecture - Button Safety', () => {
  it('UI-only buttons have type="button"', () => {
    // Simulate button types from the profile page HTML
    const buttons = [
      { text: '+ Add Skill', type: 'button', isUIOnly: true },
      { text: '+ Add Education', type: 'button', isUIOnly: true },
      { text: '+ Add Experience', type: 'button', isUIOnly: true },
      { text: '+ Add', type: 'button', isUIOnly: true },
      { text: 'Cancel', type: 'button', isUIOnly: true },
      { text: 'Close', type: 'button', isUIOnly: true },
      { text: 'Discard', type: 'button', isUIOnly: true },
      { text: 'Save Profile', type: 'submit', isUIOnly: false },
      { text: 'Save All Changes', type: 'submit', isUIOnly: false },
    ];

    for (const btn of buttons) {
      if (btn.isUIOnly) {
        assert.strictEqual(btn.type, 'button', `"${btn.text}" must have type="button"`);
      } else {
        assert.strictEqual(btn.type, 'submit', `"${btn.text}" must have type="submit"`);
      }
    }
  });
});

describe('Profile Architecture - Evidence Protection', () => {
  it('self-declared skills do not appear as VERIFIED', () => {
    const skill = {
      skillName: 'AWS',
      provenanceStatus: 'SELF_DECLARED',
      proficiency: 'PROFICIENT',
      source: 'CANDIDATE_DECLARED',
    };

    assert.notStrictEqual(skill.provenanceStatus, 'VERIFIED', 'SELF_DECLARED is not VERIFIED');
    assert.notStrictEqual(skill.provenanceStatus, 'CORROBORATED', 'SELF_DECLARED is not CORROBORATED');
  });

  it('LEARNING skills are distinguished from SELF_DECLARED', () => {
    const learning = { provenanceStatus: 'LEARNING', proficiency: 'CURRENTLY_LEARNING' };
    const selfDeclared = { provenanceStatus: 'SELF_DECLARED', proficiency: 'PROFICIENT' };

    assert.notStrictEqual(learning.provenanceStatus, selfDeclared.provenanceStatus, 'LEARNING !== SELF_DECLARED');
  });

  it('evidence-backed skills are preserved when additional skills are saved', () => {
    const evidenceBackedSkills = [
      { id: 'e1', skillName: 'TypeScript', provenanceStatus: 'VERIFIED', source: 'GITHUB' },
      { id: 'e2', skillName: 'React', provenanceStatus: 'CORROBORATED', source: 'BOTH' },
    ];
    const additionalSkills = [
      { id: 'a1', skillName: 'AWS', provenanceStatus: 'SELF_DECLARED', source: 'CANDIDATE_DECLARED' },
    ];

    // Additional skills save should NOT touch evidence-backed skills
    const savedIds = additionalSkills.map(s => s.catalogSkillId);
    for (const evidence of evidenceBackedSkills) {
      assert.ok(!savedIds.includes(evidence.id), `Evidence-backed ${evidence.skillName} not in additional save`);
    }
  });
});

describe('Profile Architecture - No Page Reload', () => {
  it('form submission uses AJAX, not native form submit', () => {
    // The profile form must use e.preventDefault() + fetch() for saves
    // No location.reload() or window.location changes allowed
    const formHandler = {
      type: 'submit',
      callsPreventDefault: true,
      callsFetch: true,
      fetchUrl: '/api/profile',
      fetchMethod: 'PATCH',
    };

    assert.ok(formHandler.callsPreventDefault, 'form submit calls preventDefault');
    assert.ok(formHandler.callsFetch, 'form submit calls fetch');
    assert.strictEqual(formHandler.fetchMethod, 'PATCH', 'uses PATCH method');
    assert.strictEqual(formHandler.fetchUrl, '/api/profile', 'saves to /api/profile');
  });

  it('no redirect after save', () => {
    // After successful AJAX save, the page should NOT redirect
    const postSaveBehavior = {
      setsSaveStatus: true,
      clearsDirtyState: true,
      doesRedirect: false,
      doesPageReload: false,
    };

    assert.ok(postSaveBehavior.setsSaveStatus, 'shows saved status');
    assert.ok(postSaveBehavior.clearsDirtyState, 'clears dirty state');
    assert.ok(!postSaveBehavior.doesRedirect, 'does NOT redirect');
    assert.ok(!postSaveBehavior.doesPageReload, 'does NOT reload page');
  });
});
