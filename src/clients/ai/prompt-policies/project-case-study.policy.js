/**
 * @file Project Case Study & Architecture Deep-Dive Prompt Policy (ARCH-026 / ARCH-019)
 *
 * Specializes prompt rules for synthesizing engineering case studies, architectural
 * trade-off explanations, and technical interview talking points strictly grounded
 * in verified project evidence and code manifests.
 */

import { BasePromptPolicy } from './base-policy.js';

export class ProjectCaseStudyPolicy extends BasePromptPolicy {
  constructor() {
    super({
      policyId: 'PROJECT_CASE_STUDY',
      policyVersion: '1.0.0',
      taskDescription:
        'Transform verified project evidence and code structures into technical engineering case studies and interview narratives without fabricating architectures, users, or metrics.',
      contextLimits: {
        maxCandidateFacts: 40,
        maxEvidenceItems: 35,
        maxJobRequirements: 20,
        maxRepoExcerpts: 15,
        maxJobTextLength: 10000,
      },
    });
  }

  getTaskSpecificConstraints() {
    return `=== PROJECT CASE STUDY SPECIFIC CONSTRAINTS ===
1. PERMITTED ACTIONS:
   - Detail the architectural patterns, technical trade-offs, and design choices supported by verified code evidence and manifests.
   - Formulate engineering interview talking points regarding challenging implementation problems evidenced in the project.
   - Describe system workflows based strictly on verified dependencies, schemas, and source code files.

2. STRICTLY PROHIBITED ACTIONS:
   - NEVER invent production traffic numbers, active user counts, throughput figures, or latency metrics not found in verified evidence.
   - NEVER invent unverified cloud infrastructure, microservice architectures, or third-party integrations.
   - NEVER claim solo authorship or inflated ownership over collaborative or forked repositories unless substantiated by commit evidence.
   - NEVER fabricate business revenue or commercial outcomes.

3. EVIDENCE MAPPING:
   - Every architectural assertion must tie back to real files or dependencies listed in <verified_evidence> or <passive_repository_data>.`;
  }
}
