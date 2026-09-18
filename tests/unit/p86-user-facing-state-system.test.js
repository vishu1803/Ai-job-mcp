/**
 * @file P86 Phase 4: Consistent User-Facing State System Test Suite
 *
 * Verifies all 12 canonical user-facing states, zero technical leakage,
 * humanized validation messages, accessible error recovery, empty screen compliance,
 * loading indicators, and HTML error page rendering.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  UserFacingStateEnum,
  RecoveryActionType,
  USER_FACING_STATE_DEFAULTS,
} from '../../src/domain/ui/user-facing-states.js';
import {
  sanitizeUserFacingError,
  sanitizeErrorMessage,
  containsTechnicalLeak,
  formatFieldLabel,
  humanizeValidationMessage,
} from '../../src/services/user-facing-error.sanitizer.js';
import { renderErrorPage } from '../../src/views/error.page.js';
import { renderProjectsPage } from '../../src/views/projects.page.js';
import { renderApplicationsPage } from '../../src/views/applications.page.js';
import { renderResumesPage } from '../../src/views/resumes.page.js';
import { renderSkillsPage } from '../../src/views/skills.page.js';
import { renderLayout } from '../../src/views/layout.js';
import {
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
} from '../../src/errors/index.js';

describe('P86 Phase 4: Consistent User-Facing State System', () => {
  // 1. Loading State
  it('1. Loading state: defines canonical defaults, skeletons, and double-submit prevention tokens', () => {
    const loadingState = USER_FACING_STATE_DEFAULTS[UserFacingStateEnum.LOADING];
    assert.ok(loadingState, 'Loading state must be defined');
    assert.equal(loadingState.isError, false);
    assert.ok(loadingState.title.includes('Loading'));

    const layoutHtml = renderLayout({
      title: 'Test Page',
      content: '<p>Content</p>',
    });

    // Verify skeleton CSS tokens exist in the layout
    assert.ok(layoutHtml.includes('skeleton-pulse'), 'Must contain skeleton-pulse animation token');
    assert.ok(layoutHtml.includes('skeleton-card'), 'Must contain skeleton-card layout token');
    assert.ok(layoutHtml.includes('skeleton-text'), 'Must contain skeleton-text layout token');

    // Verify double-submit prevention script exists in layout
    assert.ok(layoutHtml.includes('is-loading'), 'Must include is-loading button class');
    assert.ok(layoutHtml.includes('btn-spinner'), 'Must include spinner indicator token');
    assert.ok(
      layoutHtml.includes('submitBtn.disabled = true'),
      'Must contain duplicate action prevention script'
    );
  });

  // 2. Empty State
  it('2. Empty state: major screens explain what is empty, why it matters, and next actions', () => {
    const dummyUser = { id: 'usr-1', email: 'test@example.com', displayName: 'Alex Chen' };

    // Projects empty state
    const projectsHtml = renderProjectsPage({ user: dummyUser, tenant: {}, projects: [] });
    assert.ok(projectsHtml.includes('No projects added yet.'), 'Must explain what is empty');
    assert.ok(
      projectsHtml.includes("Projects help employers understand what you've built"),
      'Must explain why it matters'
    );
    assert.ok(projectsHtml.includes('+ Add Project'), 'Must include clear primary next action');

    // Applications empty state
    const appsHtml = renderApplicationsPage({ user: dummyUser, applications: [] });
    assert.ok(
      appsHtml.includes('No job applications tracked yet.'),
      'Must explain what is empty in applications'
    );
    assert.ok(
      appsHtml.includes('Tracking applications organizes your interview timeline'),
      'Must explain why tracking applications matters'
    );
    assert.ok(
      appsHtml.includes('+ Track Application'),
      'Must include track application action'
    );

    // Resumes empty state
    const resumesHtml = renderResumesPage({ user: dummyUser, resumesList: [] });
    assert.ok(
      resumesHtml.includes('No resumes uploaded yet.'),
      'Must explain what is empty in resumes'
    );
    assert.ok(
      resumesHtml.includes('Uploading your resume establishes your baseline candidate narrative'),
      'Must explain why resumes matter'
    );
    assert.ok(
      resumesHtml.includes('Upload Resume Document'),
      'Must include upload resume action button'
    );

    // Skills empty state
    const skillsHtml = renderSkillsPage({ user: dummyUser, skills: [] });
    assert.ok(
      skillsHtml.includes('No verified skills indexed yet.'),
      'Must explain what is empty in skills'
    );
    assert.ok(
      skillsHtml.includes('Skills corroborated by repository code'),
      'Must explain why skills matter'
    );
    assert.ok(
      skillsHtml.includes('Connect GitHub Repository'),
      'Must include connect repository action'
    );
  });

  // 3. Success State
  it('3. Success state: defines canonical defaults and client toast notification tokens', () => {
    const successState = USER_FACING_STATE_DEFAULTS[UserFacingStateEnum.SUCCESS];
    assert.ok(successState, 'Success state must be defined');
    assert.equal(successState.isError, false);

    const layoutHtml = renderLayout({
      title: 'Success Page',
      content: '<p>Done</p>',
    });
    assert.ok(layoutHtml.includes('portal-toast-container'), 'Must render toast container');
    assert.ok(layoutHtml.includes('portal-toast-success'), 'Must define success toast styling');
    assert.ok(layoutHtml.includes('window.UserFacingState'), 'Must expose UserFacingState client object');
  });

  // 4. Validation Error State
  it('4. Validation error state: provides field-level messages, page summary, and focus recovery without Zod leakage', () => {
    const valErr = new ValidationError('Validation failed', 'VALIDATION_ERROR', [
      { field: 'noticePeriod', message: 'notice period is required' },
      { field: 'canonicalEmail', message: 'invalid email address format' },
    ]);

    const result = sanitizeUserFacingError(valErr, { action: 'save_profile', requestId: 'req-v1' });

    assert.equal(result.state, UserFacingStateEnum.VALIDATION_ERROR);
    assert.equal(result.statusCode, 400);
    assert.equal(result.title, "We couldn't save your profile");
    assert.ok(result.message.includes('2 items that need your attention'));
    assert.equal(result.fieldErrors.length, 2);

    // Field-level assertions
    const noticeErr = result.fieldErrors.find((f) => f.field === 'noticePeriod');
    assert.ok(noticeErr);
    assert.equal(noticeErr.label, 'Notice period');
    assert.ok(noticeErr.message.toLowerCase().includes('notice period'));

    const emailErr = result.fieldErrors.find((f) => f.field === 'canonicalEmail');
    assert.ok(emailErr);
    assert.equal(emailErr.label, 'Email address');
    assert.ok(emailErr.message.includes('valid email address'));

    // Check that layout script includes highlightFieldErrors with focus
    const layoutHtml = renderLayout({ title: 'T', content: '' });
    assert.ok(layoutHtml.includes('highlightFieldErrors'), 'Layout must define highlightFieldErrors');
    assert.ok(layoutHtml.includes('validation-summary-card'), 'Layout must define validation-summary-card');
    assert.ok(layoutHtml.includes('firstField.focus()'), 'Must focus first invalid field');
  });

  // 5. Authentication Error State
  it('5. Authentication error state: reassuring session message with returnTo sign-in action', () => {
    const authErr = new AuthenticationError('Session expired');
    const result = sanitizeUserFacingError(authErr, { referer: '/profile#preferences' });

    assert.equal(result.state, UserFacingStateEnum.AUTHENTICATION_ERROR);
    assert.equal(result.statusCode, 401);
    assert.equal(result.title, 'Session expired');
    assert.ok(result.message.includes('Please sign in to securely continue'));
    assert.equal(result.recoveryAction.type, RecoveryActionType.SIGN_IN);
    assert.ok(result.recoveryAction.href.includes('/login?returnTo='));
    assert.ok(result.recoveryAction.href.includes(encodeURIComponent('/profile#preferences')));
  });

  // 6. Authorization Error State
  it('6. Authorization error state: clear permission explanation with go-back recovery', () => {
    const authzErr = new AuthorizationError('Insufficient privileges');
    const result = sanitizeUserFacingError(authzErr, { referer: '/dashboard' });

    assert.equal(result.state, UserFacingStateEnum.AUTHORIZATION_ERROR);
    assert.equal(result.statusCode, 403);
    assert.equal(result.title, 'Access restricted');
    assert.ok(result.message.includes("You don't have permission"));
    assert.equal(result.recoveryAction.type, RecoveryActionType.GO_BACK);
  });

  // 7. Not Found State
  it('7. Not found state: human-centered 404 with navigation to dashboard', () => {
    const notFoundErr = new NotFoundError('Job posting missing');
    const result = sanitizeUserFacingError(notFoundErr, { requestId: 'req-404' });

    assert.equal(result.state, UserFacingStateEnum.NOT_FOUND);
    assert.equal(result.statusCode, 404);
    assert.equal(result.title, "We couldn't find that page");
    assert.ok(result.message.includes('may have moved, been deleted, or never existed'));
    assert.equal(result.recoveryAction.label, 'Go to Dashboard');
    assert.equal(result.recoveryAction.href, '/dashboard');
  });

  // 8. Conflict State
  it('8. Conflict state: reports update conflict with review option and no silent override', () => {
    const conflictErr = new ConflictError('Concurrent edit detected');
    const result = sanitizeUserFacingError(conflictErr);

    assert.equal(result.state, UserFacingStateEnum.CONFLICT);
    assert.equal(result.statusCode, 409);
    assert.equal(result.title, 'Update conflict detected');
    assert.ok(result.message.includes('modified in another session'));
    assert.equal(result.recoveryAction.label, 'Review conflicts');
  });

  // 9. Network Failure State
  it('9. Network failure state: identifies connection issues and provides offline banner in layout', () => {
    const networkErr = new Error('fetch failed with ECONNREFUSED');
    const result = sanitizeUserFacingError(networkErr);

    assert.equal(result.state, UserFacingStateEnum.NETWORK_FAILURE);
    assert.equal(result.title, "We couldn't connect to the server");
    assert.ok(result.message.includes('Please check your internet connection'));
    assert.equal(result.recoveryAction.type, RecoveryActionType.RETRY);

    // Verify offline banner element in layout
    const layoutHtml = renderLayout({ title: 'T', content: '' });
    assert.ok(layoutHtml.includes('portalOfflineBanner'), 'Layout must include offline banner');
    assert.ok(layoutHtml.includes('updateOnlineStatus'), 'Layout must include online status listener');
  });

  // 10. Server Failure State (Reassurance & Support ID)
  it('10. Server failure state: reassures user data is not lost and provides safe support ID', () => {
    const serverErr = new Error('Fatal database connection failure at PostgresPool.connect()');
    const result = sanitizeUserFacingError(serverErr, {
      action: 'save_profile',
      requestId: 'req-prod-7890',
    });

    assert.equal(result.state, UserFacingStateEnum.SERVER_FAILURE);
    assert.equal(result.statusCode, 500);
    assert.equal(result.title, "We couldn't save your profile");
    assert.equal(
      result.message,
      "Your information hasn't been lost. Please try again in a few moments."
    );
    assert.equal(result.supportId, 'req-prod-7890');
    assert.equal(result.recoveryAction.label, 'Try again');
  });

  // 11. AI Failure State (Graceful Degradation)
  it('11. AI failure state: informs that AI is temporarily unavailable while core portal works', () => {
    const geminiErr = new Error('Google GenAI 503: Model is overloaded. Resource exhausted.');
    const result = sanitizeUserFacingError(geminiErr, { referer: '/apps/radar' });

    assert.equal(result.state, UserFacingStateEnum.AI_FAILURE);
    assert.equal(result.statusCode, 503);
    assert.equal(result.title, 'AI assistant is temporarily unavailable');
    assert.ok(
      result.message.includes('The core portal remains fully functional'),
      'Must reassure candidate that core portal is functional'
    );
    assert.equal(result.isAiFailure, true);
    assert.equal(result.recoveryAction.type, RecoveryActionType.CONTINUE_WITHOUT_AI);
    assert.equal(result.recoveryAction.label, 'Continue without AI');
  });

  // 12. Retryable Failure State
  it('12. Retryable failure state: handles rate limits and busy services with retry action', () => {
    const rateLimitErr = new RateLimitError('Too many calls');
    const result = sanitizeUserFacingError(rateLimitErr);

    assert.equal(result.state, UserFacingStateEnum.RETRYABLE_FAILURE);
    assert.equal(result.statusCode, 429);
    assert.equal(result.title, 'Too many requests');
    assert.ok(result.message.includes('pause for a moment and try again'));
    assert.equal(result.recoveryAction.label, 'Try again');
  });

  // 13. Zero Technical Leakage Audit
  it('13. Zero technical leakage: strictly strips stack traces, SQL, table names, and Zod internals', () => {
    const technicalLeakErrors = [
      'Error: at Object.<anonymous> (/var/app/src/index.js:42:15)',
      'SELECT * FROM candidates WHERE tenant_id = 100',
      'relation "candidate_resumes" does not exist',
      'duplicate key value violates unique constraint "idx_users_email"',
      'ZodError: [{"code":"invalid_type","expected":"string","received":"number"}]',
      'FastifyError [FST_ERR_CTP_INVALID_MEDIA_TYPE]: Unsupported Media Type',
      'ECONNREFUSED 127.0.0.1:5432',
      'HTTP 500 status code 500',
      'POST /api/v1/internal/admin/purge-cache failed',
    ];

    for (const rawLeak of technicalLeakErrors) {
      assert.equal(
        containsTechnicalLeak(rawLeak),
        true,
        `Pattern should detect technical leak in: ${rawLeak}`
      );
      const sanitizedMsg = sanitizeErrorMessage(rawLeak);
      assert.equal(
        containsTechnicalLeak(sanitizedMsg),
        false,
        `Sanitized string must not leak technical details: ${sanitizedMsg}`
      );
      assert.ok(
        !sanitizedMsg.includes('SELECT'),
        'Must not contain SQL keywords'
      );
      assert.ok(
        !sanitizedMsg.includes('ZodError'),
        'Must not contain internal class names'
      );
      assert.ok(
        !sanitizedMsg.includes('127.0.0.1'),
        'Must not contain IP addresses or ports'
      );
    }
  });

  // 14. Dedicated Error Page HTML Rendering
  it('14. renderErrorPage generates accessible, responsive HTML with support reference and actions', () => {
    const html = renderErrorPage({
      statusCode: 500,
      state: UserFacingStateEnum.SERVER_FAILURE,
      title: "We couldn't save your profile",
      message: "Your information hasn't been lost. Please try again.",
      supportId: 'req-support-test-999',
      recoveryAction: { label: 'Try again', href: '/profile' },
      fieldErrors: [{ field: 'headline', label: 'Headline', message: 'Headline is required.' }],
    });

    assert.ok(html.includes('save your profile'), 'Must render friendly title');
    assert.ok(
      html.includes('Your information') && html.includes('been lost'),
      'Must render reassurance message'
    );
    assert.ok(html.includes('Support Reference: req-support-test-999'), 'Must render support ID badge');
    assert.ok(html.includes('Try again'), 'Must render recovery CTA button');
    assert.ok(html.includes('role="alert"'), 'Must have accessible ARIA alert role');
    assert.ok(html.includes('Go to Dashboard'), 'Must render dashboard fallback link');
    assert.ok(html.includes('Headline is required.'), 'Must render field error item');
    assert.ok(!html.includes('DrizzleError'), 'Must not contain database internal names');
    assert.ok(!html.includes('stack'), 'Must not contain stack traces');
  });
});
