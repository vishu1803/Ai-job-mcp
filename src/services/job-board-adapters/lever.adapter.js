/**
 * @file Lever Public Job Postings API Adapter
 *
 * Fetches real job listings from Lever's public Postings API.
 * No authentication required for read operations.
 *
 * API: GET https://api.lever.co/v0/postings/{site}?mode=json
 * Docs: https://github.com/lever/postings-api
 */

/* globals AbortController */
import { logger as defaultLogger } from '../../utils/logger.js';

/**
 * Maps Lever commitment values to Career Hub employment types.
 *
 * @param {string} commitment Lever commitment value
 * @returns {string} Normalized employment type
 */
function mapEmploymentType(commitment) {
  if (!commitment) return 'FULL_TIME';
  const lower = commitment.toLowerCase();
  if (lower.includes('intern')) return 'INTERNSHIP';
  if (lower.includes('part')) return 'PART_TIME';
  if (lower.includes('contract') || lower.includes('freelance')) return 'CONTRACT';
  if (lower.includes('full')) return 'FULL_TIME';
  return 'FULL_TIME';
}

/**
 * Maps Lever workplaceType to Career Hub workplace type.
 *
 * @param {string} leverWorkplaceType Lever workplace type
 * @returns {string} Normalized workplace type
 */
function mapWorkplaceType(leverWorkplaceType) {
  if (!leverWorkplaceType || leverWorkplaceType === 'unspecified') return 'ONSITE';
  const lower = leverWorkplaceType.toLowerCase();
  if (lower === 'remote') return 'REMOTE';
  if (lower === 'hybrid') return 'HYBRID';
  return 'ONSITE';
}

/**
 * Normalizes a Lever posting into the Career Hub normalized format.
 *
 * @param {object} posting Raw Lever posting object
 * @param {string} site Lever site name
 * @returns {object} Normalized job posting
 */
function normalizeLeverPosting(posting, site) {
  const categories = posting.categories || {};
  const locationName = categories.location || 'Unknown';
  const team = categories.team || '';
  const department = categories.department || '';
  const commitment = categories.commitment || '';

  // Extract skills from description text
  const descriptionPlain = posting.descriptionPlain || posting.openingPlain || '';
  const skills = extractSkillsFromText(descriptionPlain);

  // Build description from available fields
  const description = posting.descriptionPlain || posting.openingPlain || '';

  return {
    id: `lever-${site}-${posting.id}`,
    source: 'LEVER',
    company: formatSiteName(site),
    title: posting.text || 'Untitled Position',
    location: locationName,
    workplaceType: mapWorkplaceType(posting.workplaceType),
    employmentType: mapEmploymentType(commitment),
    description: description.trim().slice(0, 2000),
    responsibilities: extractSections(posting.lists, 'responsibilities'),
    requirements: extractSections(posting.lists, 'requirements'),
    skills,
    salary: posting.salaryRange
      ? {
          min: posting.salaryRange.min || null,
          max: posting.salaryRange.max || null,
          currency: posting.salaryRange.currency || 'USD',
          period: mapSalaryPeriod(posting.salaryRange.interval),
        }
      : null,
    applicationUrl: posting.applyUrl || posting.hostedUrl || `https://jobs.lever.co/${site}/${posting.id}`,
    sourceUrl: posting.hostedUrl || `https://jobs.lever.co/${site}`,
    postedAt: posting.createdAt
      ? new Date(posting.createdAt).toISOString()
      : new Date().toISOString(),
    retrievedAt: new Date().toISOString(),
    _raw: {
      id: posting.id,
      site,
      team,
      department,
      commitment,
      country: posting.country,
      lists: posting.lists,
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
    'JavaScript', 'TypeScript', 'Python', 'Java', 'Go', 'Golang', 'Rust', 'C++', 'C#',
    'Ruby', 'PHP', 'Swift', 'Kotlin', 'Scala', 'Elixir', 'Clojure',
    'React', 'Vue', 'Angular', 'Next.js', 'Nuxt', 'Svelte',
    'Node.js', 'Express', 'Fastify', 'Django', 'Flask', 'FastAPI', 'Spring', 'Rails',
    'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Elasticsearch', 'DynamoDB', 'Cassandra',
    'Docker', 'Kubernetes', 'AWS', 'GCP', 'Azure', 'Terraform', 'Pulumi',
    'GraphQL', 'REST', 'gRPC', 'Kafka', 'RabbitMQ', 'Celery',
    'Git', 'CI/CD', 'Jenkins', 'GitHub Actions', 'GitLab CI',
    'Machine Learning', 'Deep Learning', 'NLP', 'Computer Vision', 'LLM', 'AI',
    'HTML', 'CSS', 'SASS', 'TailwindCSS', 'Bootstrap',
    'SQL', 'NoSQL', 'Data Modeling', 'ETL',
    'Linux', 'Networking', 'Security', 'OAuth', 'JWT',
    'Microservices', 'Serverless', 'Event-Driven', 'CQRS', 'DDD',
    'Agile', 'Scrum', 'Kanban',
  ];

  const lowerText = text.toLowerCase();
  const found = TECH_SKILLS.filter((skill) => {
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
 * Extracts list items from Lever posting lists matching a keyword.
 *
 * @param {Array<object>} lists Lever posting lists
 * @param {string} keyword Keyword to match
 * @returns {string[]} Extracted items
 */
function extractSections(lists, keyword) {
  if (!Array.isArray(lists)) return [];
  const items = [];
  for (const list of lists) {
    const name = (list.text || '').toLowerCase();
    if (name.includes(keyword)) {
      const content = list.content || '';
      const liPattern = /<li[^>]*>(.*?)<\/li>/gi;
      let match;
      while ((match = liPattern.exec(content)) !== null) {
        const text = match[1].replace(/<[^>]*>/g, '').trim();
        if (text.length > 5) items.push(text);
      }
    }
  }
  return items.slice(0, 10);
}

/**
 * Maps Lever salary interval to Career Hub period.
 *
 * @param {string} interval Lever interval
 * @returns {string} Career Hub period
 */
function mapSalaryPeriod(interval) {
  if (!interval) return 'YEARLY';
  const lower = interval.toLowerCase();
  if (lower === 'hourly') return 'HOURLY';
  if (lower === 'monthly') return 'MONTHLY';
  return 'YEARLY';
}

/**
 * Formats a Lever site name into a readable company name.
 *
 * @param {string} site Lever site name
 * @returns {string} Formatted company name
 */
function formatSiteName(site) {
  return site
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Lever Public Job Postings Adapter.
 *
 * @param {object} options
 * @param {string} options.site Lever site name (e.g., "leverdemo", "stripe")
 * @param {number} [options.limit=100] Max postings to fetch
 * @param {number} [options.timeoutMs=10000] Request timeout in milliseconds
 * @param {object} [options.logger] Logger instance
 */
export class LeverAdapter {
  constructor({ site, limit = 100, timeoutMs = 10000, logger = defaultLogger }) {
    this.site = site;
    this.limit = limit;
    this.timeoutMs = timeoutMs;
    this.logger = logger;
    this.baseUrl = 'https://api.lever.co/v0/postings';
  }

  /**
   * Fetches all published postings from the Lever site.
   *
   * @returns {Promise<Array<object>>} Array of normalized job postings
   */
  async fetchJobs() {
    const url = `${this.baseUrl}/${this.site}?mode=json&limit=${this.limit}`;

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
          { site: this.site, status: response.status },
          'Lever API returned non-OK status'
        );
        return [];
      }

      const postings = await response.json();

      if (!Array.isArray(postings)) {
        this.logger.warn({ site: this.site }, 'Lever API returned non-array response');
        return [];
      }

      this.logger.info(
        { site: this.site, count: postings.length },
        'Fetched postings from Lever site'
      );

      return postings.map((posting) => normalizeLeverPosting(posting, this.site));
    } catch (err) {
      if (err.name === 'AbortError') {
        this.logger.warn(
          { site: this.site, timeoutMs: this.timeoutMs },
          'Lever API request timed out'
        );
      } else {
        this.logger.error(
          { site: this.site, err: err.message },
          'Failed to fetch postings from Lever'
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
      provider: 'LEVER',
      site: this.site,
      baseUrl: this.baseUrl,
    };
  }
}
