import { ResumeStudioDraftService } from './resume-studio-draft.service.js';
import { ResumeStudioAnalysisService } from './resume-studio-analysis.service.js';
import { studioDocumentContent } from './resume-studio-document-content.js';

/** Reuse the canonical analysis engines with a read-only current draft projection. */
export class ResumeStudioDiagnosticsService {
  constructor({ database }) {
    this.db = database;
    this.drafts = new ResumeStudioDraftService({ database });
  }
  async get(context, id) {
    const draft = await this.drafts.get(context, id),
      { content } = studioDocumentContent(draft);
    const nodeId = (kind, index) =>
      draft.nodes.find((n) => n.kind === kind && n.path[1] === index)?.nodeId;
    const view = {
      candidate: {
        id: draft.candidateId,
        tenantId: context.tenantId,
        userId: context.userId,
        displayName: content.candidateIdentity.displayName,
        summary: content.summary.text,
      },
      resources: [],
      experience: content.experience,
      education: content.education,
      certifications: content.certifications,
      skills: content.skills.map((skill) => ({
        ...skill,
        id: nodeId(
          'SKILL',
          draft.structuredResume.skills.findIndex((s) => s.id === skill.id)
        ),
        truthCategory: 'CLAIMED',
        provenanceStatus: 'CLAIMED',
        verified: false,
      })),
      projects: content.projects.map((project) => ({
        ...project,
        id: nodeId(
          'PROJECT',
          draft.structuredResume.projects.findIndex((p) => p.id === project.id)
        ),
        provenanceStatus: 'CLAIMED',
        truthCategory: 'CLAIMED',
      })),
    };
    const service = new ResumeStudioAnalysisService({
      database: this.db,
      candidateProfileService: { getProfile: async () => view },
    });
    return {
      contractVersion: '1.3.0',
      draftId: draft.id,
      revision: draft.revision,
      analysis: await service.analyze(context, { jobTarget: draft.jobTarget }),
    };
  }
}
