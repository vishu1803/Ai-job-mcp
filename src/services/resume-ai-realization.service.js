import { getPromptPolicy } from '../clients/ai/prompt-policies/index.js';
import { buildResumeAiContext } from './ai-context-sanitizer.service.js';
import { validateClaimEvidenceGrounding } from './resume-claim-validation.service.js';
import {
  toEvidenceReference,
  areBulletsSemanticallyRedundant,
} from './resume-composition-primitives.js';
import {
  FORBIDDEN_UNBACKED_SUMMARY_TERMS,
  hasEvidenceForPhrase,
} from './structured-resume.service.js';

// Writing may change; material qualifications must remain in the cited source.
// Canonicalize common grammatical inflections and conservative writing equivalents.
const equivalent = new Map([
  ['built', 'implement'],
  ['developed', 'implement'],
  ['implemented', 'implement'],
  ['created', 'create'],
  ['wrote', 'write'],
  ['authored', 'write'],
  ['using', 'use'],
  ['uses', 'use'],
  ['utilized', 'use'],
  ['designed', 'design'],
  ['tested', 'test'],
  ['testing', 'test'],
  ['tests', 'test'],
  ['added', 'add'],
  ['integrated', 'integrate'],
  ['integration', 'integrate'],
  ['maintained', 'maintain'],
  ['documented', 'document'],
  ['endpoints', 'endpoint'],
  ['interfaces', 'interface'],
  ['databases', 'database'],
  ['migrations', 'migration'],
  ['applications', 'application'],
  ['apis', 'api'],
  ['validation', 'validate'],
  ['validated', 'validate'],
  ['validating', 'validate'],
]);
const grammar = new Set(
  (
    'a an the and or with for in on at of to from by as through across while that which is are was were be been being ' +
    'has have had do does did will would shall should can could may might must includes include including use using uses used ' +
    'such each all both any other into onto upon within between among over under above below after before during about against ' +
    'along alongside together toward towards beyond via per around throughout also well even still already just now then here there thus therefore however although though so ' +
    'whereby wherein whose whether either neither instead despite regardless whereas furthermore moreover namely particularly specifically ' +
    'its their our his her my this these that those up down out off like than since until'
  ).split(/\s+/)
);

const TECHNICAL_VOCABULARY = new Set(
  (
    'build builds building built back backs backing backed deliver delivers delivering delivered support supports supporting supported ' +
    'provide provides providing provided serve serves serving served handle handles handling handled ' +
    'manage manages managing managed design designs designing designed develop develops developing developed ' +
    'implement implements implementing implemented engineer engineers engineering engineered ' +
    'architect architects architecting architected construct constructs constructing constructed ' +
    'create creates creating created produce produces producing produced write writes writing wrote written ' +
    'author authors authoring authored optimize optimizes optimizing optimized scale scales scaling scaled ' +
    'secure secures securing secured streamline streamlines streamlining streamlined integrate integrates ' +
    'integrating integrated maintain maintains maintaining maintained automate automates automating automated ' +
    'orchestrate orchestrates orchestrating orchestrated deploy deploys deploying deployed containerize ' +
    'containerizes containerizing containerized configure configures configuring configured migrate migrates ' +
    'migrating migrated benchmark benchmarks benchmarking benchmarked debug debugs debugging debugged ' +
    'test tests testing tested tune tunes tuning tuned refactor refactors refactoring refactored ' +
    'improve improves improving improved expand expands expanding expanded introduce introduces ' +
    'introducing introduced reduce reduces reducing reduced increase increases increasing increased ' +
    'decrease decreases decreasing decreased save saves saving saved analyze analyzes analyzing analyzed ' +
    'profile profiles profiling profiled monitor monitors monitoring monitored resolve resolves resolving ' +
    'resolved collaborate collaborates collaborating collaborated coordinate coordinates coordinating coordinated ' +
    'lead leads leading led specialize specializes specializing specialized focus focuses focusing focused ' +
    'execute executes executing executed program programs programming programmed structure structures ' +
    'structuring structured multi cross inter user users service services microservice microservices ' +
    'endpoint endpoints api apis rest restful http https json crud database databases db schema schemas ' +
    'query queries table tables relational orm sql nosql migration migrations workflow workflows pipeline ' +
    'pipelines platform platforms framework frameworks component components module modules interface ' +
    'interfaces layer layers architecture architectures system systems application applications app apps ' +
    'tool tools tooling code codebase codebases repository repositories repo repos data model models ' +
    'modeling modeled validation validations validator validators request requests response responses ' +
    'token tokens access control authentication auth authorization rbac role roles permission permissions ' +
    'security secure session sessions realtime real-time collaboration collaborative performance reliable ' +
    'reliability resilient resilience scalable scalability robust efficient efficiency seamless modern ' +
    'modular couple couples coupled coupling decouple decouples decoupled decoupling throughput latency coverage unit integration e2e end-to-end documentation ' +
    'docs developer developers engineering software solution solutions web client clients server servers ' +
    'cloud distributed asynchronous async synchronous sync queue queues event events event-driven cache ' +
    'caches caching cached hand hands hands-on proficient proficiency skilled skill skills experience experiences ' +
    'experienced domain stack stacks environment environments pr pull commit commits branch branches ' +
    'rule-based clean best practice practices standard standards ' +
    'feature features featuring featured include includes including included enable enables enabling enabled ' +
    'ensure ensures ensuring ensured utilize utilizes utilizing utilized leverage leverages leveraging leveraged ' +
    'facilitate facilitates facilitating facilitated contribute contributes contributing contributed contribution ' +
    'contributions team teams member members peer peers workflow workflows pipeline pipelines ' +
    'practical background foundation capability capabilities equipped equipping proficient proficiency ' +
    'familiar familiarity knowledge understanding skilled skillful competent competence solid strong ' +
    'broad comprehensive proven effective focus focused oriented driven passionate dedicated motivated adept ' +
    'demonstrate demonstrates demonstrated demonstrating incorporate incorporates incorporated incorporating ' +
    'side implementation implementations specification specifications configuration configurations ' +
    'optimization optimizations transformation transformations orchestration orchestrations ' +
    'communication communications synchronization synchronizations operation operations operational ' +
    'function functions functional functionality functionalities logic logical method methods ' +
    'methodology methodologies process processes processing pattern patterns protocol protocols ' +
    'format formats formatting routine routines flow flows state states layer layers tier tiers ' +
    'mechanism mechanisms lifecycle lifecycles strategy strategies scheme schemes paradigm paradigms construct constructs ' +
    'utility utilities helper helpers entry entries property properties attribute attributes element elements entity entities instance instances ' +
    'core primary key fundamental essential central critical vital direct directly directness ' +
    'power powers powering powered submit submits submitting submitted ' +
    'retrieval retrievals retrieve retrieves retrieving retrieved ' +
    'continuous continually continuity delivery deliver delivers delivering delivered ' +
    'govern governs governing governed governance administrative administration administer administers ' +
    'pipeline pipelines catalog catalogs browsing browse browses ' +
    'dedicated dedication manage manages managing management ' +
    'concurrency concurrent partition partitioning shard sharding replica replicas ' +
    'cache caching cached persist persists persisting persistent persistence ' +
    'response responses responsive responsiveness speed throughput ' +
    'endpoint endpoints route routes routing gateway gateways ' +
    'session sessions token tokens secret secrets credential credentials ' +
    'migration migrations schema schemas relational non-relational document ' +
    'webhook webhooks hook hooks trigger triggers event events listener listeners ' +
    'integration integrations integrate integrates integrated integrating ' +
    'establish establishes establishing established establishment ' +
    'granular granularity enforce enforces enforcing enforced enforcement ' +
    'achieve achieves achieving achieved achievement achievements ' +
    'workload workloads deployment deployments deploy deploys deploying deployed ' +
    'deliverable deliverables ' +
    'technical technically technology technologies technological expertise expert ' +
    'base based setup setups set sets setting approach approaches concept concepts principle principles insight insights ' +
    'verify verifies verified verifying verification verifications confirm confirms confirmed confirming ' +
    'document documents documented documenting documentation audit audits audited auditing ' +
    'inspect inspects inspected inspecting assess assesses assessed assessing evaluate evaluates evaluated ' +
    'evaluating measure measures measured measuring tracking track tracks tracked ' +
    'additional additionally further furthermore moreover ' +
    'identify identifies identifying identified identification ' +
    'detect detects detecting detected detection discover discovers discovering discovered isolate isolates isolating isolated ' +
    'diagnose diagnoses diagnosing diagnosed diagnostic ' +
    'business enterprise commercial organizational client internal external stakeholder ' +
    'dispatch dispatches dispatching dispatched ' +
    'automatic automatically automated publish publishes publishing published publication publications ' +
    'incoming outgoing ' +
    'rigorous rigor comprehensive iterative discipline disciplined pragmatic versatile versatility multifaceted ' +
    'cohesive proactive proactively maintainable modularity readability observability adaptability seamless ' +
    'robustly highly resiliently foundational quality assurance reusable success successfully successful succeed succeeds succeeded proficiently ' +
    'reinforced reinforce reinforces reinforcing targeted target targets targeting streamline streamlines streamlined streamlining ' +
    'accelerate accelerates accelerated accelerating safeguard safeguards safeguarded enhance enhances enhanced enhancing ' +
    'foster fosters fostering leverage leveraging leveraged orchestrate orchestrated orchestrating ' +
    'strengthen strengthens strengthened strengthening empower empowers empowered elevate elevates elevated elevating ' +
    'performant generate generates generating generated generation generator generators ' +
    'suggest suggests suggesting suggested suggestion suggestions fix fixes fixing fixed ' +
    'flag flags flagging flagged issue issues review reviews reviewing reviewed reviewer reviewers ' +
    'board boards search searches searching searched assistant assistants ' +
    'recommend recommends recommending recommended recommendation recommendations ' +
    'candidate candidates collaborative collaboration collaborations explore explores exploring explored explorer explorers ' +
    'filter filters filtering filtered prompt prompts prompting prompted metric metrics tailor tailors tailoring tailored ' +
    'dynamic complemented complement complements complementing guarantee guarantees guaranteeing guaranteed boundary boundaries algorithm algorithms submission submissions ' +
    'apply applies applied applying protect protects protected protecting protection protective allow allows allowed allowing prevent prevents prevented preventing ' +
    'maintainability extensibility extensible reusability consistent consistency accurate accuracy container containers compose ' +
    'ingest ingests ingesting ingested ingestion consume consumes consuming consumed parse parses parsing parsed emit emits emitting emitted expose exposes exposing exposed ' +
    'render renders rendering rendered display displays displaying displayed fetch fetches fetching fetched connect connects connecting connected connection connections ' +
    'interactive interactivity view views page pages form forms store stores storing stored storage index indexes indexing indexed ' +
    'fast faster rapid rapidly quick quickly smooth smoothly cleanly clear clearly strict strictly type types typed typing safe safety safely end ends ending ended ' +
    'openapi swagger graphql jwt oauth ssr ssg spa ui ux dom cli sdk ide ast llm llms'
  ).split(/[\s-]+/)
);

const words = (value) =>
  String(value || '')
    .toLowerCase()
    .match(/[\p{L}\p{N}+#]+(?:\.[\p{L}\p{N}]+)*/gu) || [];
const canonical = (word) => equivalent.get(word) || word;

function isRecognizedWord(word, allowedSets) {
  const norm = canonical(word);
  for (const s of allowedSets) {
    if (s.has(norm)) return true;
  }
  // Try common English inflections (-ing, -ed, -es, -s, -ly)
  if (norm.endsWith('ing') && norm.length > 5) {
    const base = norm.slice(0, -3);
    for (const s of allowedSets) {
      if (s.has(base) || s.has(base + 'e')) return true;
    }
  }
  if (norm.endsWith('ied') && norm.length > 4) {
    const base = norm.slice(0, -3) + 'y';
    for (const s of allowedSets) {
      if (s.has(base)) return true;
    }
  }
  if (norm.endsWith('ies') && norm.length > 4) {
    const base = norm.slice(0, -3) + 'y';
    for (const s of allowedSets) {
      if (s.has(base)) return true;
    }
  }
  if (norm.endsWith('ed') && norm.length > 4) {
    const base = norm.slice(0, -2);
    for (const s of allowedSets) {
      if (s.has(base) || s.has(base + 'e')) return true;
    }
  }
  if (norm.endsWith('es') && norm.length > 4) {
    const base = norm.slice(0, -2);
    for (const s of allowedSets) {
      if (s.has(base) || s.has(base + 'e')) return true;
    }
  }
  if (norm.endsWith('s') && !norm.endsWith('ss') && norm.length > 3) {
    const base = norm.slice(0, -1);
    for (const s of allowedSets) {
      if (s.has(base)) return true;
    }
  }
  if (norm.endsWith('bly') && norm.length > 5) {
    const base = norm.slice(0, -3) + 'ble';
    for (const s of allowedSets) {
      if (s.has(base)) return true;
    }
  }
  if (norm.endsWith('ily') && norm.length > 5) {
    const base = norm.slice(0, -3) + 'y';
    for (const s of allowedSets) {
      if (s.has(base)) return true;
    }
  }
  if (norm.endsWith('ly') && norm.length > 4) {
    const base = norm.slice(0, -2);
    for (const s of allowedSets) {
      if (s.has(base) || s.has(base + 'e') || s.has(base + 'ic')) return true;
    }
  }
  if (norm.endsWith('ation') && norm.length > 6) {
    const base = norm.slice(0, -5);
    for (const s of allowedSets) {
      if (s.has(base) || s.has(base + 'e') || s.has(base + 'er')) return true;
    }
  }
  if (norm.endsWith('tion') && norm.length > 5) {
    const base = norm.slice(0, -4);
    for (const s of allowedSets) {
      if (s.has(base) || s.has(base + 'e') || s.has(base + 't')) return true;
    }
  }
  if (norm.endsWith('ment') && norm.length > 5) {
    const base = norm.slice(0, -4);
    for (const s of allowedSets) {
      if (s.has(base) || s.has(base + 'e')) return true;
    }
  }
  if (norm.endsWith('er') && norm.length > 4) {
    const base = norm.slice(0, -2);
    for (const s of allowedSets) {
      if (s.has(base) || s.has(base + 'e')) return true;
    }
  }
  return false;
}

/** Adds source vocabulary/negation checks to the existing ownership, privacy,
 * technology, metric, employment, agency and outcome validator. Fact IDs alone
 * never confer authority to invent a different sentence. */
export function validateProviderResumeClaim(claim, context) {
  const result = validateClaimEvidenceGrounding(claim, context);
  const ids = new Set(claim.composedFromFactIds || []);
  const facts = (context.factInventory || []).filter((f) => ids.has(f.factId || f.id));
  const source = facts.map((f) => f.text).join(' ');

  // Collect candidate context to allow legitimate vocabulary from candidate profile & target job
  const candidateText = [
    context.candidateProfile?.headline,
    context.candidateProfile?.summary,
    ...(context.candidateProfile?.skills || []).map((s) => (typeof s === 'string' ? s : s.name)),
    ...(context.candidateProfile?.projects || []).flatMap((p) => [
      p.name,
      p.displayName,
      p.description,
      ...(p.technologies || []),
      ...(p.bullets || []),
    ]),
    ...(context.candidateProfile?.experience || []).flatMap((e) => [
      e.title,
      e.company,
      ...(e.highlights || []),
    ]),
    ...(context.candidateProfile?.education || []).flatMap((ed) => [
      ed.institution,
      ed.degree,
      ed.fieldOfStudy,
    ]),
  ]
    .filter(Boolean)
    .join(' ');

  const jobText = [
    context.job?.title,
    context.job?.targetTitle,
    context.job?.description,
    ...(context.job?.requirements || []),
  ]
    .filter(Boolean)
    .join(' ');

  const rawProfileWords = [...words(source), ...words(candidateText), ...words(jobText)];
  const expandedProfileWords = [];
  for (const w of rawProfileWords) {
    expandedProfileWords.push(w);
    if (w.endsWith('.js') && w.length > 3) {
      expandedProfileWords.push(w.slice(0, -3));
    }
  }
  const profileWords = new Set(expandedProfileWords.map(canonical));

  // 1. Check for unbacked academic credentials / medical / doctorate fabrications
  const profileHasMedicalOrDoctorate = /doctorate|phd|\bmd\b|medical|medicine/i.test(candidateText);
  if (
    !profileHasMedicalOrDoctorate &&
    /\b(doctorate|phd|medical|medicine|physician|surgeon)\b/i.test(claim.text)
  ) {
    result.violations.push({
      code: 'UNSUPPORTED_MATERIAL_WORDING',
      message: 'Proposed wording introduces an unbacked academic or professional credential.',
    });
  }

  // 2. Check for unbacked seniority / leadership fabrications
  const profileHasSenior =
    /\b(senior|staff|principal|director|head)\b/i.test(context.candidateProfile?.headline || '') ||
    (context.candidateProfile?.experience || []).some((e) =>
      /\b(senior|staff|principal|director|head)\b/i.test(e.title || '')
    );
  if (!profileHasSenior && /\b(senior|staff|principal|director|vp|chief)\b/i.test(claim.text)) {
    result.violations.push({
      code: 'UNSUPPORTED_MATERIAL_WORDING',
      message: 'Proposed wording inflates candidate seniority beyond verified experience.',
    });
  }

  // 3. Check for unbacked tenure fabrications
  const tenureMatch = claim.text.match(/\b\d+\+?\s+years?\b/i);
  if (tenureMatch && !new RegExp(tenureMatch[0], 'i').test(source)) {
    result.violations.push({
      code: 'UNSUPPORTED_MATERIAL_WORDING',
      message: `Proposed wording claims unbacked tenure "${tenureMatch[0]}".`,
    });
  }

  // 4. Check for novel foreign wording outside allowed vocabulary, profile, job, and grammar
  const allowedSets = [grammar, TECHNICAL_VOCABULARY, profileWords];
  const novel = words(claim.text).filter((w) => !isRecognizedWord(w, allowedSets));
  if (novel.length) {
    result.violations.push({
      code: 'UNSUPPORTED_MATERIAL_WORDING',
      message: `Proposed wording introduces material information outside candidate facts: ${novel.slice(0, 3).join(', ')}`,
    });
  }

  // 5. Check for truncated metric context (e.g. "achieving a 40% reduction" without measured outcome)
  if (
    /\b(?:achieving|resulting in)\s+a\s+\d+%\s*(?:reduction|decrease|increase|improvement)\s*[.]?$/i.test(
      claim.text.trim()
    ) ||
    /\b\d+%\s*(?:reduction|decrease|increase|improvement)\s*\./i.test(claim.text)
  ) {
    result.violations.push({
      code: 'TRUNCATED_METRIC_CONTEXT',
      message:
        'Proposed wording drops the measured metric outcome or dimension from the source fact.',
    });
  }

  // 5b. Metric Retention Invariant: If a candidate source fact contains an explicit quantitative metric
  // (such as a percentage reduction, e.g. "40%"), the synthesized accomplishment claim MUST retain that metric.
  if (context.sectionOwnerType !== 'SUMMARY') {
    const sourcePercentMetrics = source.match(/\b\d+(?:\.\d+)?%/g);
    if (sourcePercentMetrics && sourcePercentMetrics.length > 0) {
      const claimPercentMetrics = claim.text.match(/\b\d+(?:\.\d+)?%/g) || [];
      const missingMetric = sourcePercentMetrics.find((m) => !claimPercentMetrics.includes(m));
      if (missingMetric) {
        result.violations.push({
          code: 'DROPPED_SUPPORTED_METRIC',
          message: `Proposed wording dropped supported quantitative metric "${missingMetric}" from candidate source fact.`,
        });
      }
    }
  }

  // 5c. Cross-section Duplication Invariant: Summary must synthesize across qualifications, not copy experience bullets
  if (context.sectionOwnerType === 'SUMMARY') {
    const experienceBullets = (context.candidateProfile?.experience || []).flatMap(
      (e) => e.highlights || e.bullets || []
    );
    for (const expBullet of experienceBullets) {
      const expText = typeof expBullet === 'string' ? expBullet : expBullet?.text || '';
      const cleanExp = expText.trim();
      if (cleanExp.length > 25 && claim.text.toLowerCase().includes(cleanExp.toLowerCase())) {
        result.violations.push({
          code: 'SUMMARY_DUPLICATES_EXPERIENCE_BULLET',
          message:
            'Professional summary must synthesize profile qualifications rather than copying experience bullets verbatim.',
        });
        break;
      }
    }

    // 5d. Unbacked buzzwords check for summary
    for (const term of FORBIDDEN_UNBACKED_SUMMARY_TERMS) {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[-_]/g, '[-_\\s]+');
      const termRegex = new RegExp(`(?:^|[^a-zA-Z0-9_])${escaped}(?:$|[^a-zA-Z0-9_])`, 'i');
      if (termRegex.test(claim.text)) {
        if (!hasEvidenceForPhrase(term, {}, { candidateProfile: context.candidateProfile })) {
          result.violations.push({
            code: 'UNSUPPORTED_MATERIAL_WORDING',
            message: `Summary contains unsupported claim/buzzword '${term}' without candidate evidence support.`,
          });
          break;
        }
      }
    }
  }

  // 5e. Duplicate project accomplishment check (Req 3)
  if (context.sectionOwnerType === 'PROJECT' && Array.isArray(context.alreadyRenderedClaims)) {
    for (const existing of context.alreadyRenderedClaims) {
      if (areBulletsSemanticallyRedundant(existing, claim)) {
        result.violations.push({
          code: 'DUPLICATE_PROJECT_ACCOMPLISHMENT',
          message:
            'Proposed wording duplicates an already realized accomplishment for this project.',
        });
        break;
      }
    }
  }

  if (
    /\b(no|not|never|without|lacks?|missing)\b/i.test(source) !==
    /\b(no|not|never|without|lacks?|missing)\b/i.test(claim.text)
  )
    result.violations.push({
      code: 'SOURCE_NEGATION_CHANGED',
      message: 'Proposed wording changes a source qualification or negation.',
    });
  if (
    facts.some(
      (f) =>
        f.renderable === false ||
        ['MISSING', 'MISSING_EVIDENCE', 'UNKNOWN', 'INFERRED'].includes(
          f.truthCategory || f.provenanceStatus
        ) ||
        (f.tenantId &&
          context.candidateProfile?.tenantId &&
          f.tenantId !== context.candidateProfile.tenantId)
    )
  )
    result.violations.push({
      code: 'UNAUTHORIZED_SOURCE_FACT',
      message: 'Source fact is not authorized for candidate writing.',
    });
  return { valid: result.violations.length === 0, violations: result.violations };
}

/** Uses the selected provider only. No implicit transfer to another provider. */
export async function realizeResumeWriting({
  provider,
  taskType,
  candidateProfile,
  job,
  selectedProjects = [],
  selectedSkills = [],
  facts = [],
  timeoutMs = 120000,
  sectionOwnerType = 'PROJECT',
}) {
  const candidateId = candidateProfile.id || candidateProfile.candidate?.id;
  const projectIds = new Set(
    selectedProjects.flatMap((p) => [p.id, p.projectId, p.name, p.displayName]).filter(Boolean)
  );
  facts = facts.filter((f) => {
    if (!f) return false;
    const owner =
      f.association?.projectId ||
      (String(f.ownerType).toUpperCase() === 'PROJECT' ? f.ownerId || f.sectionOwnerId : null);
    return (
      f &&
      f.renderable !== false &&
      (f.candidateAuthored === true || f.agencyLevel === 'CANDIDATE') &&
      (!f.candidateId || f.candidateId === candidateId) &&
      (!f.tenantId || f.tenantId === candidateProfile.tenantId) &&
      (!owner || projectIds.has(owner)) &&
      ![f.truthCategory, f.provenanceStatus, f.status].some((value) =>
        ['MISSING', 'MISSING_EVIDENCE', 'UNKNOWN', 'INFERRED'].includes(value)
      )
    );
  });
  if (!provider?.generateStructured || !facts.length) return { status: 'UNAVAILABLE', claims: [] };
  const policy = getPromptPolicy(taskType);
  const envelope = buildResumeAiContext({
    job,
    candidateProfile,
    selectedProjects,
    selectedSkills,
    factInventory: facts,
    taskType,
  });
  const maxAttempts = timeoutMs >= 30000 ? 2 : 1;
  const perAttemptMs = maxAttempts > 1 ? Math.min(45000, Math.floor(timeoutMs / 2)) : timeoutMs;
  try {
    let response;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let timer;
      const controller = new AbortController();
      try {
        response = await Promise.race([
          provider.generateStructured(
            {
              taskType,
              ...(attempt > 1 ? { modelId: 'gemini-2.5-flash' } : {}),
              prompt:
                taskType === 'RESUME_SUMMARY_SYNTHESIS'
                  ? "Write a concise, job-specific 2 to 3 sentence professional career summary synthesizing the candidate's engineering profile across their verified skills, projects, and experiences for the target role. Do NOT copy or concatenate individual project or experience bullets verbatim. Highlight core competencies, architectural patterns, and relevant technologies. Never fabricate credentials, seniority, or ungrounded metrics. Return the required JSON and cite the supplied transient fact IDs."
                  : 'Write concise, job-specific professional prose from the supplied facts. Paraphrase and combine supported contributions; never add a qualification, metric, technology, employer, seniority or outcome. When a source fact contains a quantitative metric or percentage (such as "40% reduction in page load time"), you MUST preserve that exact numerical metric and its measured dimension in the synthesized bullet. Never drop supported metrics or generalize them into vague statements. Return the required JSON and cite the supplied transient fact IDs.',
              candidateFacts: envelope.context,
              jobRequirements: envelope.context.targetJob,
              responseSchema: policy.responseSchema,
              timeoutMs: perAttemptMs,
            },
            { signal: controller.signal }
          ),
          new Promise((_, reject) => {
            timer = setTimeout(() => {
              controller.abort();
              const error = new Error('Writing timeout');
              error.code = 'WRITING_TIMEOUT';
              reject(error);
            }, perAttemptMs);
          }),
        ]);
        break;
      } catch (err) {
        if (attempt === maxAttempts) throw err;
      } finally {
        clearTimeout(timer);
      }
    }
    const parsed = policy.responseSchema.safeParse(response?.data);
    if (!parsed.success) return { status: 'REJECTED', reason: 'MALFORMED_OUTPUT', claims: [] };
    const proposed =
      taskType === 'RESUME_SUMMARY_SYNTHESIS'
        ? [
            {
              text: parsed.data.summaryText,
              factIds: parsed.data.composedFromFactIds,
              transformationType: 'REWRITE',
            },
          ]
        : parsed.data.bullets;
    const claims = [];
    for (const item of proposed) {
      if (
        item.unsupportedClaims?.length ||
        item.factIds.some((id) => !envelope.transientToCanonicalFactId.has(id))
      )
        return { status: 'REJECTED', reason: 'UNKNOWN_OR_UNSUPPORTED_FACT', claims: [] };
      const factIds = [...new Set(envelope.resolveFactIds(item.factIds))];
      const contributing = facts.filter((f) => factIds.includes(f.factId || f.id));
      const claim = {
        text: item.text,
        composedFromFactIds: factIds,
        sourceFact: contributing.map((f) => f.text),
        transformationType: item.transformationType || 'REWRITE',
        provenanceStatus: 'CLAIMED',
        evidenceRefs: contributing.map((f) =>
          toEvidenceReference({ ...f, sourceType: 'CLAIMED' }, 'CLAIMED')
        ),
        matchedRequirementIds: [],
      };
      if (taskType === 'RESUME_SUMMARY_SYNTHESIS' && claim.text.split(/\s+/).length > 65)
        return { status: 'REJECTED', reason: 'SUMMARY_WORD_BUDGET', claims: [] };
      const validation = validateProviderResumeClaim(claim, {
        candidateProfile,
        job,
        factInventory: facts,
        sectionOwnerType: taskType === 'RESUME_SUMMARY_SYNTHESIS' ? 'SUMMARY' : sectionOwnerType,
        sectionOwnerId: selectedProjects[0]?.id,
        project: selectedProjects[0],
        alreadyRenderedClaims: claims,
      });
      if (!validation.valid) {
        if (validation.violations[0]?.code === 'DUPLICATE_PROJECT_ACCOMPLISHMENT') {
          // Skip redundant bullet rather than rejecting entire project realization (Req 3)
          continue;
        }
        // Log detailed violation diagnostics for observability
        console.error('Provider claim rejected:', {
          text: claim.text,
          violations: validation.violations,
        });
        return {
          status: 'REJECTED',
          reason: validation.violations[0]?.code || 'FACTUAL_VALIDATION',
          claims: [],
        };
      }
      claims.push(claim);
    }
    return {
      status: 'ACCEPTED',
      claims,
      provider: String(response.provider || provider.id || 'configured'),
      modelId: response.modelId || undefined,
    };
  } catch (error) {
    return {
      status: 'FAILED',
      reason: error.code === 'WRITING_TIMEOUT' ? 'TIMEOUT' : 'PROVIDER_FAILURE',
      claims: [],
    };
  }
}
