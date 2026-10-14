import { z } from 'zod';
import { StudioDraftResponseSchema } from './resume-studio-draft.schemas.js';

export const STUDIO_PROPOSAL_CONTRACT_VERSION = '1.2.0';
export const STUDIO_PROPOSAL_POLICY_VERSION = 'source-preserving-wording/v1';
const uuid = z.string().uuid();
const revision = z.number().int().min(1).max(2147483646);
const hash = z.string().regex(/^[a-f0-9]{64}$/);

export const StudioProposalParamsSchema = z.object({ id: uuid, proposalId: uuid }).strict();
export const StudioGenerateProposalSchema = z
  .object({ expectedRevision: revision, nodeId: uuid, requirementId: uuid.optional() })
  .strict();
export const StudioProposalDecisionSchema = z
  .object({ expectedRevision: revision, decision: z.enum(['ACCEPT', 'REJECT']) })
  .strict();
export const StudioProposalAiOutputSchema = z
  .object({
    proposedText: z.string().min(15).max(2000),
    factIds: z.array(z.string().regex(/^fact-\d+$/)).length(1),
    truthState: z.literal('CLAIMED'),
  })
  .strict();

export const StudioProposalResponseSchema = z
  .object({
    contractVersion: z.literal(STUDIO_PROPOSAL_CONTRACT_VERSION),
    id: uuid,
    draftId: uuid,
    candidateId: uuid,
    nodeId: uuid,
    baseRevision: revision,
    baseContentHash: hash,
    sourceSnapshotHash: hash,
    originalText: z.string().min(1).max(2000),
    proposedText: z.string().min(15).max(2000),
    rationale: z.string(),
    truthState: z.literal('CLAIMED'),
    claimLabel: z.literal('[Unverified User Claim]'),
    validationPolicyVersion: z.literal(STUDIO_PROPOSAL_POLICY_VERSION),
    jobRequirement: z
      .object({
        id: uuid,
        text: z.string(),
        category: z.string(),
        importance: z.string(),
        sourceCovered: z.boolean(),
      })
      .strict()
      .nullable(),
    evidenceLinks: z
      .array(
        z
          .object({
            type: z.literal('CANDIDATE_CLAIM'),
            identifier: z.string(),
            sourceText: z.string(),
            sourceResumeId: uuid,
            sourceVersion: z.number().int().positive(),
            draftRevision: revision,
            sourceKind: z.enum(['MASTER_SNAPSHOT', 'DRAFT_EDIT']),
            truthState: z.literal('CLAIMED'),
          })
          .strict()
      )
      .min(1),
    status: z.enum(['PENDING', 'ACCEPTED', 'REJECTED', 'STALE']),
    createdAt: z.string().datetime(),
    decidedAt: z.string().datetime().nullable(),
    decisionRevision: z.number().int().positive().nullable(),
  })
  .strict();
export const StudioProposalDecisionResponseSchema = z
  .object({
    contractVersion: z.literal(STUDIO_PROPOSAL_CONTRACT_VERSION),
    proposal: StudioProposalResponseSchema,
    draft: StudioDraftResponseSchema,
  })
  .strict();
