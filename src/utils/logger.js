import pino from 'pino';
import { config } from '../config/env.js';

/**
 * Default censor placeholder for redacted sensitive values.
 */
export const DEFAULT_CENSOR = '[REDACTED]';

/**
 * List of sensitive key names to redact across top-level and nested properties.
 */
export const SENSITIVE_KEYS = [
  'authorization',
  'Authorization',
  'cookie',
  'Cookie',
  'set-cookie',
  'token',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'apiKey',
  'api_key',
  'secret',
  'clientSecret',
  'client_secret',
  'secretKey',
  'secret_key',
  'privateKey',
  'private_key',
  'keyPem',
  'pem',
  'installationToken',
  'installation_token',
  'githubToken',
  'github_token',
  'sessionSecret',
  'session_secret',
  'sessionToken',
  'session_token',
  'encryptionKey',
  'encryption_key',
  'masterKey',
  'master_key',
  'mcpToken',
  'mcp_token',
  'bearer',
  'webhookSecret',
  'webhook_secret',
  'databaseUrl',
  'database_url',
  'dbUrl',
  'db_url',
  'connectionString',
  'connection_string',
  'authCode',
  'auth_code',
  'authorizationCode',
  'authorization_code',
  'oauthCode',
  'oauth_code',
  'password',
  'pass',
  'credentials',
  'email',
  'phone',
  'ssn',
  'resume',
  'cv',
  'sourceCode',
  'codeSnippet',
  'plaintext',
  'rawSecret',
  'raw_secret',
  'decryptedSecret',
];

/**
 * Comprehensive list of redaction paths for Pino fast-redact.
 * Includes top-level, 1-level wildcard, 2-level wildcard, and HTTP header paths.
 */
export const REDACTION_PATHS = [
  ...SENSITIVE_KEYS,
  ...SENSITIVE_KEYS.map((key) => `*.${key}`),
  ...SENSITIVE_KEYS.map((key) => `*.*.${key}`),
  'headers.authorization',
  'headers.cookie',
  'headers["set-cookie"]',
  'headers["x-api-key"]',
  'headers["x-hub-signature-256"]',
  'headers["x-hub-signature"]',
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["set-cookie"]',
  'req.headers["x-api-key"]',
  'req.headers["x-hub-signature-256"]',
  'req.headers["x-hub-signature"]',
];

/**
 * Serializes an HTTP incoming request safely without leaking sensitive headers or raw bodies.
 *
 * @param {object} req Incoming request object
 * @returns {object} Sanitized request metadata
 */
export function safeRequestSerializer(req) {
  if (!req) return req;
  return {
    id: req.id,
    method: req.method,
    url: req.url,
    routeUrl: req.routeUrl,
    hostname: req.hostname,
    remoteAddress: req.ip || req.socket?.remoteAddress,
  };
}

/**
 * Serializes an HTTP response safely.
 *
 * @param {object} res Response object
 * @returns {object} Sanitized response metadata
 */
export function safeResponseSerializer(res) {
  if (!res) return res;
  return {
    statusCode: res.statusCode,
  };
}

/**
 * Generates the standard Pino logger options object.
 *
 * @param {object} [overrides={}] Custom configuration overrides
 * @returns {import('pino').LoggerOptions} Pino logger configuration
 */
export function getLoggerConfig(overrides = {}) {
  const isTest = config.NODE_ENV === 'test';
  const defaultLevel = isTest ? 'silent' : config.LOG_LEVEL;

  return {
    level: overrides.level || defaultLevel,
    redact: {
      paths: REDACTION_PATHS,
      censor: DEFAULT_CENSOR,
      ...overrides.redact,
    },
    serializers: {
      err: pino.stdSerializers.err,
      req: safeRequestSerializer,
      res: safeResponseSerializer,
      ...overrides.serializers,
    },
    ...overrides,
  };
}

/**
 * Factory function to create a new configured Pino logger instance.
 *
 * @param {object} [options={}] Configuration options
 * @param {import('pino').DestinationStream} [destination] Optional output stream
 * @returns {import('pino').Logger} Configured Pino logger instance
 */
export function createLogger(options = {}, destination) {
  const pinoConfig = getLoggerConfig(options);
  return destination ? pino(pinoConfig, destination) : pino(pinoConfig);
}

/**
 * Centralized root logger instance for the application.
 */
export const logger = createLogger();

/**
 * Creates a child logger with bound contextual metadata (e.g. service, tenantId, userId).
 *
 * @param {object} bindings Key-value pairs to bind to the child logger
 * @param {import('pino').Logger} [parentLogger=logger] Parent logger instance
 * @returns {import('pino').Logger} Context-bound child logger
 */
export function createChildLogger(bindings, parentLogger = logger) {
  return parentLogger.child(bindings);
}
