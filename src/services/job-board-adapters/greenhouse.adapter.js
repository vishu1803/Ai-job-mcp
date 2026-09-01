/**
 * @file Greenhouse Public Job Board API Adapter
 *
 * Fetches real job listings from Greenhouse's public Job Board API.
 * No authentication required for read operations.
 *
 * API: GET https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs?content=true
 * Docs: https://docs.greenhouse.io/job-board.html
 */

import { logger as defaultLogger } from '../../utils/logger.js';

/**
 * Normalizes a Greenhouse job posting into the Career Hub normalized format.
 *
 * @param {object} ghJob Raw Greenhouse job object
 * @param {string} boardToken Greenhouse board token
 * @returns {object} Normalized job posting
 */
function normalizeGreenhouseJob(ghJob, boardToken) {
  const locationName = ghJob.location?.name || 'Unknown';
  const offices = ghJob.offices || [];
  const departments = ghJob.departments || [];

  // Extract skills from content (basic keyword extraction)
  const contentText = (ghJob.content || '').replace(/<[^>]*>/g, ' ');
  const skills = extractSkillsFromText(contentText);

  // Determine workplace type from location
  const workplaceType = inferWorkplaceType(locationName, contentText);

  return {
    id: `gh-${boardToken}-${ghJob.id}`,
    source: 'GREENHOUSE',
    company: formatBoardName(boardToken),
    title: ghJob.title || 'Untitled Position',
    location: locationName,
    workplaceType,
    employmentType: 'FULL_TIME', // Greenhouse doesn't expose this directly
    description: contentText.trim().slice(0, 2000),
    responsibilities: extractListItems(contentText, 'responsibilities'),
    requirements: extractListItems(contentText, 'requirements'),
    skills,
    // Greenhouse pay ranges require pay_transparency param; omit when unavailable
    salary: undefined,
    applicationUrl:
      ghJob.absolute_url || `https://boards.greenhouse.io/${boardToken}/jobs/${ghJob.id}`,
    sourceUrl: `https://boards.greenhouse.io/${boardToken}`,
    postedAt: ghJob.updated_at || new Date().toISOString(),
    retrievedAt: new Date().toISOString(),
    _raw: {
      id: ghJob.id,
      internalJobId: ghJob.internal_job_id,
      boardToken,
      departments: departments.map((d) => d.name),
      offices: offices.map((o) => o.name),
    },
  };
}

/**
 * Extracts skill keywords from job description text.
 *
 * @param {string} text Job description text
 * @returns {string[]} Extracted skills
 */
function extractSkillsFromText(text) {
  const TECH_SKILLS = [
    'JavaScript',
    'TypeScript',
    'Python',
    'Java',
    'Go',
    'Golang',
    'Rust',
    'C++',
    'C#',
    'Ruby',
    'PHP',
    'Swift',
    'Kotlin',
    'Scala',
    'Elixir',
    'Clojure',
    'React',
    'Vue',
    'Angular',
    'Next.js',
    'Nuxt',
    'Svelte',
    'Node.js',
    'Express',
    'Fastify',
    'Django',
    'Flask',
    'FastAPI',
    'Spring',
    'Rails',
    'PostgreSQL',
    'MySQL',
    'MongoDB',
    'Redis',
    'Elasticsearch',
    'DynamoDB',
    'Cassandra',
    'Docker',
    'Kubernetes',
    'AWS',
    'GCP',
    'Azure',
    'Terraform',
    'Pulumi',
    'GraphQL',
    'REST',
    'gRPC',
    'Kafka',
    'RabbitMQ',
    'Celery',
    'Git',
    'CI/CD',
    'Jenkins',
    'GitHub Actions',
    'GitLab CI',
    'Machine Learning',
    'Deep Learning',
    'NLP',
    'Computer Vision',
    'LLM',
    'AI',
    'HTML',
    'CSS',
    'SASS',
    'TailwindCSS',
    'Bootstrap',
    'SQL',
    'NoSQL',
    'Data Modeling',
    'ETL',
    'Linux',
    'Networking',
    'Security',
    'OAuth',
    'JWT',
    'Microservices',
    'Serverless',
    'Event-Driven',
    'CQRS',
    'DDD',
    'Agile',
    'Scrum',
    'Kanban',
  ];

  const lowerText = text.toLowerCase();
  const found = TECH_SKILLS.filter((skill) => {
    // Escape all regex special chars, then wrap with word boundaries for longer skills
    const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = skill.length > 3 ? `\\b${escaped}\\b` : escaped;
    try {
      return new RegExp(pattern, 'i').test(lowerText);
    } catch {
      return lowerText.includes(skill.toLowerCase());
    }
  });

  return [...new Set(found)].slice(0, 15);
}

/**
 * Infers workplace type from location and content text.
 *
 * @param {string} location Location string
 * @param {string} content Job content
 * @returns {string} Workplace type
 */
function inferWorkplaceType(location, content) {
  const combined = `${location} ${content}`.toLowerCase();
  if (
    combined.includes('remote') &&
    !combined.includes('on-site') &&
    !combined.includes('onsite')
  ) {
    return 'REMOTE';
  }
  if (combined.includes('hybrid')) {
    return 'HYBRID';
  }
  return 'ON_SITE';
}

/**
 * Extracts list items from HTML content near a keyword.
 *
 * @param {string} content HTML content
 * @param {string} keyword Section keyword
 * @returns {string[]} Extracted items
 */
function extractListItems(content, _keyword) {
  const items = [];
  const liPattern = /<li[^>]*>(.*?)<\/li>/gi;
  let match;
  while ((match = liPattern.exec(content)) !== null) {
    const text = match[1].replace(/<[^>]*>/g, '').trim();
    if (text.length > 5) items.push(text);
  }
  return items.slice(0, 10);
}

/**
 * Formats a board token into a readable company name.
 * e.g., "stripe" → "Stripe", "github" → "GitHub"
 *
 * @param {string} boardToken Greenhouse board token
 * @returns {string} Formatted company name
 */
function formatBoardName(boardToken) {
  return boardToken
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Greenhouse Public Job Board Adapter.
 *
 * @param {object} options
 * @param {string} options.boardToken Greenhouse board token (e.g., "stripe", "github")
 * @param {boolean} [options.includeContent=true] Whether to fetch full job content
 * @param {number} [options.timeoutMs=10000] Request timeout in milliseconds
 * @param {object} [options.logger] Logger instance
 */
export class GreenhouseAdapter {
  constructor({ boardToken, includeContent = true, timeoutMs = 10000, logger = defaultLogger }) {
    this.boardToken = boardToken;
    this.includeContent = includeContent;
    this.timeoutMs = timeoutMs;
    this.logger = logger;
    this.baseUrl = 'https://boards-api.greenhouse.io/v1';
  }

  /**
   * Fetches all published jobs from the Greenhouse board.
   *
   * @returns {Promise<Array<object>>} Array of normalized job postings
   */
  async fetchJobs() {
    const url = `${this.baseUrl}/boards/${this.boardToken}/jobs?content=${this.includeContent}`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'CareerHub-JobDiscovery/1.0',
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        this.logger.warn(
          { boardToken: this.boardToken, status: response.status },
          'Greenhouse API returned non-OK status'
        );
        return [];
      }

      const data = await response.json();
      const jobs = data.jobs || [];

      this.logger.info(
        { boardToken: this.boardToken, count: jobs.length },
        'Fetched jobs from Greenhouse board'
      );

      return jobs.map((job) => normalizeGreenhouseJob(job, this.boardToken));
    } catch (err) {
      if (err.name === 'AbortError') {
        this.logger.warn(
          { boardToken: this.boardToken, timeoutMs: this.timeoutMs },
          'Greenhouse API request timed out'
        );
      } else {
        this.logger.error(
          { boardToken: this.boardToken, err: err.message },
          'Failed to fetch jobs from Greenhouse'
        );
      }
      return [];
    }
  }

  /**
   * Returns adapter metadata.
   */
  getMeta() {
    return {
      provider: 'GREENHOUSE',
      boardToken: this.boardToken,
      baseUrl: this.baseUrl,
    };
  }
}
