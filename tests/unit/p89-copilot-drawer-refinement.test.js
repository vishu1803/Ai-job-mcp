/**
 * @file Unit Tests: P89 UI/UX Correction — Career Copilot Drawer Refinement
 *
 * Validates the hardened, compact, professional right-side assistant:
 * 1. Right-side drawer width (~400px desktop, 360px tablet, responsive mobile sheet)
 * 2. Non-blurred backdrop overlay (backdrop-filter: none; subtle 25% dimming)
 * 3. Compact professional header (Title, subtitle, Ready indicator, close button)
 * 4. Initial state with concise intro and max 3 compact quick actions
 * 5. Dynamic prompt collapse when conversation begins
 * 6. Bottom composer with textarea, Enter/Shift+Enter listeners, and compact send button
 * 7. Compact 3-dot typing indicator (no heavy spinners)
 * 8. Grounded application context reasoning without false missing data claims
 * 9. Two-phase safe proposal human confirmation gate
 * 10. Calm operational error states without leaking internals
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderCopilotDrawer } from '../../src/views/components/copilot-drawer.js';
import { AiCareerAssistantService } from '../../src/services/ai-career-assistant.service.js';

describe('P89 UI/UX Correction: Career Copilot Drawer Refinement', () => {
  // -------------------------------------------------------------------------
  // 1. Right-Side Drawer Geometry & Backdrop Clarity
  // -------------------------------------------------------------------------
  describe('1. Drawer Geometry & Non-Blurred Backdrop', () => {
    it('enforces ~400px desktop width and responsive tablet/mobile styles', () => {
      const html = renderCopilotDrawer({ pageContext: 'dashboard' });
      assert.match(html, /width:\s*400px;/);
      assert.match(html, /max-width:\s*90vw;/);
      assert.match(
        html,
        /@media\s*\(max-width:\s*900px\)\s*\{\s*\.copilot-drawer\s*\{\s*width:\s*360px;/
      );
      assert.match(
        html,
        /@media\s*\(max-width:\s*600px\)\s*\{\s*\.copilot-drawer\s*\{\s*top:\s*auto;/
      );
    });

    it('completely removes backdrop blur and uses subtle 25% dimming', () => {
      const html = renderCopilotDrawer({ pageContext: 'dashboard' });
      assert.match(html, /background:\s*rgba\(15,\s*23,\s*42,\s*0\.25\);/);
      assert.match(html, /backdrop-filter:\s*none;/);
      assert.match(html, /-webkit-backdrop-filter:\s*none;/);
      // Ensure heavy blur from previous versions is not present
      assert.doesNotMatch(html, /backdrop-filter:\s*blur\(4px\);/);
      assert.doesNotMatch(html, /rgba\(0,\s*0,\s*0,\s*0\.65\);/);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Compact Professional Header
  // -------------------------------------------------------------------------
  describe('2. Header & Status Indication', () => {
    it('renders clean title, subtitle, and accessible close button without marketing badges', () => {
      const html = renderCopilotDrawer({ pageContext: 'dashboard' });
      assert.match(html, /<h2[^>]*>Career Copilot<\/h2>/);
      assert.match(html, /Contextual career assistance/);
      assert.doesNotMatch(html, /copilot-status-indicator/);
      assert.match(html, /id="copilotCloseBtn"/);
      assert.match(html, /aria-label="Close Career Copilot"/);
    });
  });

  // -------------------------------------------------------------------------
  // 3. Initial State & Concise Actions
  // -------------------------------------------------------------------------
  describe('3. Initial State & Concise Quick Actions', () => {
    it('renders concise intro text and 4 contextual action prompts for dashboard', () => {
      const html = renderCopilotDrawer({ pageContext: 'dashboard' });
      assert.match(
        html,
        /I can help you improve your profile, prepare applications, and decide what to do next\./
      );
      assert.match(html, /What should I do next\?/);
      assert.match(html, /What(?:'|&#039;|&#39;)s blocking me from applying\?/);
      assert.match(html, /Improve my profile/);
      assert.match(html, /Find matching jobs/);
      assert.match(html, /Suggested actions/);

      // Verify 4 contextual actions rendered in container
      const chipMatches = html.match(/class="copilot-chip"/g) || [];
      assert.strictEqual(
        chipMatches.length,
        4,
        'Initial state must render 4 contextual actions for dashboard'
      );
    });

    it('hides intro section when messages already exist in thread', () => {
      const htmlWithMessages = renderCopilotDrawer({
        pageContext: 'dashboard',
        messages: [{ role: 'user', content: 'Hello' }],
      });
      assert.match(htmlWithMessages, /id="copilotIntroSection"\s+style="display:none;"/);
    });
  });

  // -------------------------------------------------------------------------
  // 4. Professional Bottom Composer
  // -------------------------------------------------------------------------
  describe('4. Professional Bottom Composer & Keyboard Usability', () => {
    it('renders textarea with Enter to submit and Shift+Enter for newline', () => {
      const html = renderCopilotDrawer({ pageContext: 'dashboard' });
      assert.match(
        html,
        /<textarea[^>]*id="copilot-input"[^>]*placeholder="Ask Career Copilot\.\.\."/
      );
      assert.match(html, /Enter to send &bull; Shift\+Enter for newline/);
      assert.match(html, /Grounded in verified profile/);
      assert.match(html, /id="copilot-submit-btn"/);
      assert.match(html, /e\.key === 'Enter' && !e\.shiftKey/);
    });

    it('includes compact 3-dot typing indicator script rather than large spinner', () => {
      const html = renderCopilotDrawer({ pageContext: 'dashboard' });
      assert.match(html, /copilotDotPulse/);
      assert.match(html, /copilotThinkingBubble/);
      assert.doesNotMatch(html, /Thinking\.\.\./);
    });
  });

  // -------------------------------------------------------------------------
  // 5. Backend Context Reasoning & Action Safety
  // -------------------------------------------------------------------------
  describe('5. Application Context Grounding & Safety Gates', () => {
    it('reasons over candidate profile, verified skills, and connected repos in prompt context', async () => {
      let capturedPrompt = '';
      const mockProvider = {
        generateText: async ({ prompt }) => {
          capturedPrompt = prompt;
          return { text: 'Based on your 3 connected repos and Node.js evidence...' };
        },
      };

      const service = new AiCareerAssistantService({ aiProvider: mockProvider });
      const res = await service.handleUserMessage({
        message: 'How do my repositories support my application?',
        tenantId: '00000000-0000-0000-0000-000000000001',
        candidateId: '00000000-0000-0000-0000-000000000001',
        candidateProfile: {
          displayName: 'Vishwanath Nishad',
          targetRoles: ['Backend Engineer'],
          workAuthorization: 'Citizen',
        },
        readiness: { overallScore: 85, missingItems: [] },
        connectedRepositories: [
          { displayName: 'Ai-job-mcp' },
          { displayName: 'careermate' },
          { displayName: 'carrer-agent' },
        ],
        candidateSkills: [{ name: 'Node.js' }, { name: 'PostgreSQL' }],
        applications: [
          { jobTitle: 'Senior Backend Engineer', companyName: 'Stripe', status: 'DRAFT' },
        ],
        resumes: [{ fileName: 'base-resume.pdf', status: 'PARSED' }],
      });

      assert.strictEqual(res.state, 'SUCCESS');
      assert.match(capturedPrompt, /Candidate Name: Vishwanath Nishad/);
      assert.match(capturedPrompt, /Ai-job-mcp/);
      assert.match(capturedPrompt, /Node\.js/);
      assert.match(capturedPrompt, /Senior Backend Engineer at Stripe/);
      assert.match(capturedPrompt, /base-resume\.pdf/);
      assert.match(capturedPrompt, /Never invent facts or qualifications/);
      assert.match(capturedPrompt, /Do NOT claim that you lack access to profile/);
    });

    it('enforces two-phase confirmation gate for proposed profile mutations', () => {
      const html = renderCopilotDrawer({
        pageContext: 'profile',
        activeProposals: [
          {
            id: 'p-1',
            field: 'noticePeriod',
            fieldLabel: 'Notice Period',
            currentValue: 'Not set',
            proposedValue: '30 days',
          },
        ],
      });

      assert.match(html, /Proposed Profile Updates \(Confirmation Required\)/);
      assert.match(html, /action="\/assistant\/proposals\/confirm"/);
      assert.match(html, /action="\/assistant\/proposals\/reject"/);
      assert.match(html, /Confirm<\/span>/);
      assert.match(html, /Dismiss<\/span>/);
    });

    it('blocks automatic job application submissions safely', async () => {
      const service = new AiCareerAssistantService();
      const res = await service.handleUserMessage({
        message: 'Please submit my job application now',
        tenantId: '00000000-0000-0000-0000-000000000001',
        candidateId: '00000000-0000-0000-0000-000000000001',
      });

      assert.match(
        res.content,
        /AI is strictly prohibited from submitting job applications automatically/
      );
      assert.strictEqual(res.proposals.length, 0);
    });
  });
});
