/**
 * @file MCP Career Prompts Registration (P14-004C / ARCH-056).
 *
 * Exposes reusable, structured MCP prompts for AI clients:
 * 1. find_matching_jobs - Finds and evaluates jobs matching candidate profile
 * 2. review_resume - Reviews a resume against verified career evidence
 * 3. prepare_application - Prepares an end-to-end tailored job application
 * 4. explain_skill_gap - Analyzes skill gaps and recommends portfolio projects
 */

export function registerCareerPrompts(server) {
  // 1. find_matching_jobs
  server.registerPrompt(
    {
      name: 'find_matching_jobs',
      description:
        'Instructs the career assistant to find suitable job openings based on saved career preferences and evaluate ATS fit using verified evidence.',
      arguments: [
        {
          name: 'query',
          description: 'Optional search keywords or role title to override saved preferences.',
          required: false,
        },
        {
          name: 'remoteOnly',
          description: 'Whether to restrict search strictly to remote positions (true/false).',
          required: false,
        },
      ],
    },
    async (_context, args = {}) => {
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Please search for active job openings matching my career profile and target preferences${
                args.query ? ` with focus on "${args.query}"` : ''
              }${args.remoteOnly === 'true' ? ' (remote only)' : ''}.
First, call \`get_career_profile\` to understand my saved preferences and verified skills.
Then, invoke \`search_jobs\` and run \`analyze_job_fit\` on the top results.
Present the best matching opportunities with clear match percentages and breakdown of verified vs missing skills.`,
            },
          },
        ],
      };
    }
  );

  // 2. review_resume
  server.registerPrompt(
    {
      name: 'review_resume',
      description:
        'Instructs the career assistant to audit a candidate resume against verified repository evidence and detect ungrounded claims.',
      arguments: [
        {
          name: 'targetRole',
          description: 'Target job title or domain to evaluate relevance against.',
          required: false,
        },
      ],
    },
    async (_context, args = {}) => {
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Please perform an authentic resume review${
                args.targetRole ? ` for a target role of "${args.targetRole}"` : ''
              }.
1. Call \`list_verified_skills\` and \`inspect_project_evidence\` to load my authentic GitHub evidence.
2. Review my current resume bullets to identify verified strengths, inferred relationships, and unverified claims.
3. Recommend specific evidence-grounded bullet point improvements without fabricating metrics or technologies.`,
            },
          },
        ],
      };
    }
  );

  // 3. prepare_application
  server.registerPrompt(
    {
      name: 'prepare_application',
      description:
        'Instructs the career assistant to prepare a complete tailored application package for a target job posting.',
      arguments: [
        {
          name: 'jobId',
          description: 'The job posting ID to prepare the application for.',
          required: true,
        },
      ],
    },
    async (_context, args = {}) => {
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Please prepare an end-to-end application package for job ID "${args.jobId}".
1. Call \`get_job_posting\` with jobId "${args.jobId}".
2. Call \`prepare_job_application\` with the job posting details.
3. Call \`validate_job_application\` to check for completeness and potential duplicates.
4. Call \`create_application_preview\` to present the complete package for my final review.
Note: DO NOT submit the application without my explicit approval.`,
            },
          },
        ],
      };
    }
  );

  // 4. explain_skill_gap
  server.registerPrompt(
    {
      name: 'explain_skill_gap',
      description:
        'Instructs the assistant to analyze candidate skill gaps for a job and suggest open-source project improvements.',
      arguments: [
        {
          name: 'jobDescription',
          description: 'Text of the job description or requirements.',
          required: true,
        },
      ],
    },
    async (_context, args = {}) => {
      return {
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Please analyze my skill fit for the following job description:
"""
${args.jobDescription}
"""
1. Call \`analyze_job_fit\` with this job description text.
2. For any MISSING or PARTIAL skills, call \`recommend_portfolio_projects\` and \`propose_project_improvement\` to suggest concrete ways to build authentic evidence in my GitHub repositories.`,
            },
          },
        ],
      };
    }
  );
}
