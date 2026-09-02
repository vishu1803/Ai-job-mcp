/**
 * @file Greenhouse Public Job Board API Adapter
 *
 * Fetches real job listings from Greenhouse's public Job Board API.
 * No authentication required for read operations.
 *
 * API: GET https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs?content=true
 * Docs: https://docs.greenhouse.io/job-board.html
 */

import crypto from 'node:crypto';
import { logger as defaultLogger } from '../../utils/logger.js';

/**
 * Generates a deterministic canonical UUID from provider + externalJobId.
 *
 * @param {string} provider Provider name
 * @param {string} externalJobId Provider-specific ID
 * @returns {string} Canonical UUID
 */
function generateCanonicalId(provider, externalJobId) {
  const input = `${provider}:${externalJobId}`;
  const hash = crypto.createHash('sha256').update(input).digest();
  const hex = hash.subarray(0, 16).toString('hex');
  return [
    hex.substring(0, 8),
    hex.substring(8, 12),
    '4' + hex.substring(13, 16),
    '8' + hex.substring(17, 20),
    hex.substring(20, 32),
  ].join('-');
}

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

  const rawContent = ghJob.content || '';
  const contentText = cleanHtmlToPlainText(rawContent);
  const skills = extractSkillsFromText(contentText);

  // Determine workplace type from location
  const workplaceType = inferWorkplaceType(locationName, contentText);

  const externalJobId = `gh-${boardToken}-${ghJob.id}`;
  return {
    id: generateCanonicalId('GREENHOUSE', externalJobId),
    source: 'GREENHOUSE',
    provider: 'GREENHOUSE',
    externalJobId,
    company: formatBoardName(boardToken),
    title: ghJob.title || 'Untitled Position',
    location: locationName,
    workplaceType,
    employmentType: 'FULL_TIME', // Greenhouse doesn't expose this directly
    description: contentText.slice(0, 50000),
    responsibilities: extractListItemsFromHtml(rawContent, 'responsibilities'),
    requirements: extractListItemsFromHtml(rawContent, 'requirements'),
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
 * Decodes standard HTML entities.
 *
 * @param {string} str HTML string
 * @returns {string} Decoded string
 */
export function decodeHtmlEntities(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)));
}

/**
 * Cleans HTML content to readable plain text.
 *
 * @param {string} html Raw HTML
 * @returns {string} Plain text
 */
export function cleanHtmlToPlainText(html) {
  if (!html || typeof html !== 'string') return '';
  const decoded = decodeHtmlEntities(html);
  return decoded
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n/g, '\n\n')
    .trim();
}

/**
 * Extracts list items or bullet points from raw HTML near a section keyword.
 *
 * @param {string} rawHtml Raw HTML content
 * @param {'requirements'|'responsibilities'} keyword Target section type
 * @returns {string[]} Extracted list items
 */
export function extractListItemsFromHtml(rawHtml, keyword) {
  if (!rawHtml || typeof rawHtml !== 'string') return [];
  const decoded = decodeHtmlEntities(rawHtml);
  const items = [];

  const reqKeywords = [
    'requirement',
    'qualification',
    'what you bring',
    'what we look for',
    'what we are looking for',
    'what you need',
    'must have',
    'who you are',
    'skills',
    'about you',
  ];
  const respKeywords = [
    'responsibilit',
    'what you will do',
    "what you'll do",
    'the role',
    'role overview',
    'duties',
    'what you do',
    'about the role',
  ];

  const targetKeywords = keyword === 'requirements' ? reqKeywords : respKeywords;

  // 1. Try to find section header and extract subsequent <li> items or bullet points
  const sectionPattern =
    /<(?:h[1-6]|strong|b|p)[^>]*>([\s\S]*?(?:requirement|qualification|what you|responsibilit|the role|about you|about the role)[\s\S]*?)<\/(?:h[1-6]|strong|b|p)>([\s\S]*?)(?=<(?:h[1-6]|strong|b)[^>]*>[\s\S]*?(?:requirement|qualification|responsibilit|about|compensation|benefits|what we offer)|$)/gi;

  let sectionMatch;
  while ((sectionMatch = sectionPattern.exec(decoded)) !== null) {
    const headerText = cleanHtmlToPlainText(sectionMatch[1]).toLowerCase();
    const sectionBody = sectionMatch[2];

    const matchesTarget = targetKeywords.some((kw) => headerText.includes(kw));
    if (matchesTarget) {
      // Extract <li> items from sectionBody
      const liPattern = /<li[^>]*>([\s\S]*?)<\/li>/gi;
      let liMatch;
      while ((liMatch = liPattern.exec(sectionBody)) !== null) {
        const text = cleanHtmlToPlainText(liMatch[1]).trim();
        if (text.length > 5) items.push(text);
      }
      // If no <li> found, try bullet points or lines
      if (items.length === 0) {
        const lines = sectionBody.split(/\n|<br\s*\/?>/i);
        for (const line of lines) {
          const cleaned = cleanHtmlToPlainText(line)
            .replace(/^[\s•\-*\d.)]+/, '')
            .trim();
          if (cleaned.length > 15) items.push(cleaned);
        }
      }
      if (items.length > 0) return items.slice(0, 15);
    }
  }

  // 2. Fallback: extract all <li> tags from HTML
  const fallbackLiPattern = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let fallbackMatch;
  while ((fallbackMatch = fallbackLiPattern.exec(decoded)) !== null) {
    const text = cleanHtmlToPlainText(fallbackMatch[1]).trim();
    if (text.length > 5) items.push(text);
  }

  return items.slice(0, 15);
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
