import { authenticate, authorize, createVerifyCsrf } from '../middleware/auth.middleware.js';
import { ResumeStudioAnalysisService } from '../services/resume-studio-analysis.service.js';
import { ResumeStudioDraftService } from '../services/resume-studio-draft.service.js';
import { ResumeStudioProposalService } from '../services/resume-studio-proposal.service.js';
import { AppError } from '../errors/index.js';
import { errorHandler } from '../plugins/error-handler.js';
import { ResumeStudioHistoryService } from '../services/resume-studio-history.service.js';
import { ResumeStudioDocumentService } from '../services/resume-studio-document.service.js';
import { extractClientIp } from '../utils/extract-client-ip.js';
import { ResumeStudioDiagnosticsService } from '../services/resume-studio-diagnostics.service.js';

export default async function resumeStudioRoutes(fastify, opts = {}) {
  // The shared user-facing catalog does not map 422. Keep proposal refusals
  // actionable in this API scope without editing shared PRD error/UI code.
  fastify.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError && error.statusCode === 422) {
      return reply
        .header('cache-control', 'no-store')
        .code(422)
        .send({
          success: false,
          data: null,
          error: {
            code: error.code,
            state: 'VALIDATION_FAILED',
            title: 'Resume needs review',
            message: error.message,
            details: null,
            supportId: request.id,
            requestId: request.id,
            recoveryAction: { type: 'edit', label: 'Continue editing the draft', href: null },
          },
        });
    }
    return errorHandler(error, request, reply);
  });
  const service = opts.analysisService || new ResumeStudioAnalysisService({ database: fastify.db });
  const drafts = new ResumeStudioDraftService({ database: fastify.db });
  const proposals = new ResumeStudioProposalService({
    database: fastify.db,
    aiProvider: opts.aiProvider,
  });
  const history = new ResumeStudioHistoryService({ database: fastify.db });
  const documents = new ResumeStudioDocumentService({ database: fastify.db });
  const diagnostics = new ResumeStudioDiagnosticsService({ database: fastify.db });
  fastify.post(
    '/analyze',
    {
      bodyLimit: 1024 * 1024,
      preHandler: [
        authenticate,
        authorize('OWNER', 'MEMBER', 'READONLY'),
        createVerifyCsrf({ requireOrigin: true, requireToken: true }),
      ],
    },
    async (request, reply) => {
      const data = await service.analyze(request.auth, request.body);
      return reply.header('cache-control', 'no-store').code(200).send({ success: true, data });
    }
  );
  const writeHandlers = [
    authenticate,
    authorize('OWNER', 'MEMBER'),
    createVerifyCsrf({ requireOrigin: true, requireToken: true }),
  ];
  fastify.post(
    '/drafts',
    { bodyLimit: 1024 * 1024, preHandler: writeHandlers },
    async (request, reply) => {
      const data = await drafts.create(request.auth, request.body);
      return reply
        .header('cache-control', 'no-store')
        .header('location', `/api/v1/resume-studio/drafts/${data.id}`)
        .code(201)
        .send({ success: true, data });
    }
  );
  fastify.get(
    '/drafts/:id',
    { preHandler: [authenticate, authorize('OWNER', 'MEMBER', 'READONLY')] },
    async (request, reply) => {
      const data = await drafts.get(request.auth, request.params.id);
      return reply.header('cache-control', 'no-store').send({ success: true, data });
    }
  );
  fastify.patch(
    '/drafts/:id',
    { bodyLimit: 1024 * 1024, preHandler: writeHandlers },
    async (request, reply) => {
      const data = await drafts.update(request.auth, request.params.id, request.body);
      return reply.header('cache-control', 'no-store').send({ success: true, data });
    }
  );
  fastify.post(
    '/drafts/:id/proposals',
    { bodyLimit: 16384, preHandler: writeHandlers },
    async (request, reply) => {
      const data = await proposals.generate(request.auth, request.params.id, request.body);
      return reply.header('cache-control', 'no-store').code(201).send({ success: true, data });
    }
  );
  fastify.get(
    '/drafts/:id/proposals/:proposalId',
    { preHandler: [authenticate, authorize('OWNER', 'MEMBER', 'READONLY')] },
    async (request, reply) => {
      const data = await proposals.get(request.auth, request.params.id, request.params.proposalId);
      return reply.header('cache-control', 'no-store').send({ success: true, data });
    }
  );
  fastify.post(
    '/drafts/:id/proposals/:proposalId/decision',
    { bodyLimit: 16384, preHandler: writeHandlers },
    async (request, reply) => {
      const data = await proposals.decide(
        request.auth,
        request.params.id,
        request.params.proposalId,
        request.body
      );
      return reply.header('cache-control', 'no-store').send({ success: true, data });
    }
  );
  const readHandlers = [authenticate, authorize('OWNER', 'MEMBER', 'READONLY')];
  fastify.get('/drafts/:id/diagnostics', { preHandler: readHandlers }, async (request, reply) =>
    reply
      .header('cache-control', 'no-store')
      .send({ success: true, data: await diagnostics.get(request.auth, request.params.id) })
  );
  fastify.get('/drafts/:id/proposals', { preHandler: readHandlers }, async (request, reply) =>
    reply
      .header('cache-control', 'no-store')
      .send({ success: true, data: await proposals.list(request.auth, request.params.id) })
  );
  fastify.get('/drafts/:id/document', { preHandler: readHandlers }, async (request, reply) =>
    reply
      .header('cache-control', 'no-store')
      .send({ success: true, data: await documents.latest(request.auth, request.params.id) })
  );
  fastify.get('/drafts/:id/history', { preHandler: readHandlers }, async (request, reply) =>
    reply
      .header('cache-control', 'no-store')
      .send({ success: true, data: await history.list(request.auth, request.params.id) })
  );
  fastify.get(
    '/drafts/:id/history/:revision',
    { preHandler: readHandlers },
    async (request, reply) =>
      reply.header('cache-control', 'no-store').send({
        success: true,
        data: await history.get(request.auth, request.params.id, Number(request.params.revision)),
      })
  );
  fastify.post(
    '/drafts/:id/restore',
    { bodyLimit: 16384, preHandler: writeHandlers },
    async (request, reply) =>
      reply.header('cache-control', 'no-store').send({
        success: true,
        data: await history.restore(request.auth, request.params.id, request.body),
      })
  );
  fastify.post(
    '/drafts/:id/preview',
    { bodyLimit: 16384, preHandler: writeHandlers },
    async (request, reply) =>
      reply.header('cache-control', 'no-store').send({
        success: true,
        data: await documents.preview(request.auth, request.params.id, request.body),
      })
  );
  fastify.get(
    '/drafts/:id/documents/:documentId/:format',
    { preHandler: readHandlers },
    async (request, reply) => {
      const result = await documents.previewBytes(
        request.auth,
        request.params.id,
        request.params.documentId,
        request.params.format
      );
      return reply
        .header('cache-control', 'no-store')
        .header('content-disposition', 'inline; filename="resume.' + request.params.format + '"')
        .type(result.type)
        .send(result.bytes);
    }
  );
  fastify.post(
    '/drafts/:id/export',
    { bodyLimit: 16384, preHandler: writeHandlers },
    async (request, reply) => {
      const result = await documents.export(request.auth, request.params.id, request.body);
      return reply
        .header('cache-control', 'no-store')
        .header('content-disposition', 'attachment; filename="' + result.filename + '"')
        .type(result.type)
        .send(result.bytes);
    }
  );
  fastify.post(
    '/drafts/:id/approval',
    { bodyLimit: 16384, preHandler: writeHandlers },
    async (request, reply) =>
      reply.header('cache-control', 'no-store').send({
        success: true,
        data: await documents.approve(request.auth, request.params.id, request.body, {
          ip: extractClientIp(request),
          userAgent: request.headers['user-agent'],
        }),
      })
  );
}
