import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import {
  createLogger,
  createChildLogger,
  getLoggerConfig,
  DEFAULT_CENSOR,
  REDACTION_PATHS,
  SENSITIVE_KEYS,
} from '../../src/utils/logger.js';
import { buildApp } from '../../src/app.js';

/**
 * Helper to capture logs emitted to a stream as parsed JSON objects.
 *
 * @returns {{ stream: Writable, getLogs: () => Array<object>, getRaw: () => string }}
 */
function createLogCapture() {
  const chunks = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(chunk.toString());
      callback();
    },
  });

  return {
    stream,
    getRaw() {
      return chunks.join('');
    },
    getLogs() {
      return chunks
        .join('')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    },
  };
}

describe('Structured Logger & Security Redaction (P1-002)', () => {
  test('1. Logger initializes with expected configuration and defaults', () => {
    const config = getLoggerConfig();
    assert.ok(config);
    assert.ok(config.redact);
    assert.equal(config.redact.censor, DEFAULT_CENSOR);
    assert.ok(Array.isArray(config.redact.paths));
    assert.ok(config.redact.paths.length > 0);
    assert.ok(config.serializers);
    assert.equal(typeof config.serializers.err, 'function');
    assert.equal(typeof config.serializers.req, 'function');
    assert.equal(typeof config.serializers.res, 'function');
  });

  test('2. Structured output emits valid JSON with standard metadata', () => {
    const capture = createLogCapture();
    const testLogger = createLogger({ level: 'info' }, capture.stream);

    testLogger.info({ event: 'server_boot', component: 'test' }, 'Service initialized');

    const logs = capture.getLogs();
    assert.equal(logs.length, 1);
    const log = logs[0];
    assert.equal(log.level, 30);
    assert.equal(log.msg, 'Service initialized');
    assert.equal(log.event, 'server_boot');
    assert.equal(log.component, 'test');
    assert.ok(log.time);
    assert.ok(log.pid);
    assert.ok(log.hostname);
  });

  test('3. Top-level sensitive tokens and credentials are redacted', () => {
    const capture = createLogCapture();
    const testLogger = createLogger({ level: 'info' }, capture.stream);

    testLogger.info(
      {
        token: 'fake_secret_token_12345',
        accessToken: 'fake_access_token_99999',
        refreshToken: 'fake_refresh_token_88888',
        password: 'fake_user_password_secret',
        secret: 'fake_app_secret_value',
        apiKey: 'fake_api_key_abcdef',
        privateKey: '-----BEGIN RSA PRIVATE KEY-----\nFAKE_KEY\n-----END RSA PRIVATE KEY-----',
        installationToken: 'ghs_fake_installation_token',
        githubToken: 'ghp_fake_github_token',
        sessionSecret: 'fake_session_secret_passphrase',
        encryptionKey: 'fake_master_encryption_key_hex',
        masterKey: 'fake_master_key_value',
        mcpToken: 'mcp_live_fake_mcp_bearer_token',
        webhookSecret: 'fake_webhook_hmac_secret',
        safeProperty: 'visible_public_value',
      },
      'User authentication attempt'
    );

    const logs = capture.getLogs();
    assert.equal(logs.length, 1);
    const log = logs[0];

    assert.equal(log.token, DEFAULT_CENSOR);
    assert.equal(log.accessToken, DEFAULT_CENSOR);
    assert.equal(log.refreshToken, DEFAULT_CENSOR);
    assert.equal(log.password, DEFAULT_CENSOR);
    assert.equal(log.secret, DEFAULT_CENSOR);
    assert.equal(log.apiKey, DEFAULT_CENSOR);
    assert.equal(log.privateKey, DEFAULT_CENSOR);
    assert.equal(log.installationToken, DEFAULT_CENSOR);
    assert.equal(log.githubToken, DEFAULT_CENSOR);
    assert.equal(log.sessionSecret, DEFAULT_CENSOR);
    assert.equal(log.encryptionKey, DEFAULT_CENSOR);
    assert.equal(log.masterKey, DEFAULT_CENSOR);
    assert.equal(log.mcpToken, DEFAULT_CENSOR);
    assert.equal(log.webhookSecret, DEFAULT_CENSOR);
    assert.equal(log.safeProperty, 'visible_public_value');

    // Assert raw log string does not contain any leaked secret
    const raw = capture.getRaw();
    assert.equal(raw.includes('fake_secret_token'), false);
    assert.equal(raw.includes('fake_user_password'), false);
    assert.equal(raw.includes('fake_app_secret'), false);
    assert.equal(raw.includes('ghs_fake_installation'), false);
  });

  test('4. Nested and deeply nested sensitive fields are redacted', () => {
    const capture = createLogCapture();
    const testLogger = createLogger({ level: 'info' }, capture.stream);

    testLogger.info(
      {
        tenantId: 'tenant_abc_123',
        auth: {
          token: 'fake_nested_token_value',
          clientSecret: 'fake_oauth_client_secret',
          nestedConfig: {
            apiKey: 'fake_nested_api_key_secret',
            password: 'fake_deeply_nested_password',
          },
          credentials: {
            sensitiveDetail: 'fake_secret_in_credentials',
          },
        },
        payload: {
          safeKey: 'safe_data_field',
        },
      },
      'Nested credentials processed'
    );

    const logs = capture.getLogs();
    assert.equal(logs.length, 1);
    const log = logs[0];

    assert.equal(log.tenantId, 'tenant_abc_123');
    assert.equal(log.auth.token, DEFAULT_CENSOR);
    assert.equal(log.auth.clientSecret, DEFAULT_CENSOR);
    assert.equal(log.auth.nestedConfig.apiKey, DEFAULT_CENSOR);
    assert.equal(log.auth.nestedConfig.password, DEFAULT_CENSOR);
    assert.equal(log.auth.credentials, DEFAULT_CENSOR);
    assert.equal(log.payload.safeKey, 'safe_data_field');

    const raw = capture.getRaw();
    assert.equal(raw.includes('fake_nested_token_value'), false);
    assert.equal(raw.includes('fake_oauth_client_secret'), false);
    assert.equal(raw.includes('fake_nested_api_key_secret'), false);
    assert.equal(raw.includes('fake_deeply_nested_password'), false);
    assert.equal(raw.includes('fake_secret_in_credentials'), false);
  });

  test('5. HTTP Authorization and custom secret headers are redacted', () => {
    const capture = createLogCapture();
    const testLogger = createLogger({ level: 'info' }, capture.stream);

    testLogger.info(
      {
        headers: {
          authorization: 'Bearer fake_bearer_token_xyz987',
          cookie: 'session_id=fake_cookie_session_value; Path=/',
          'set-cookie': 'token=fake_set_cookie_token',
          'x-api-key': 'fake_header_api_key_val',
          'x-hub-signature-256': 'sha256=fake_hmac_signature_hex',
          'user-agent': 'Mozilla/5.0 TestAgent',
          accept: 'application/json',
        },
      },
      'Inbound HTTP headers'
    );

    const logs = capture.getLogs();
    assert.equal(logs.length, 1);
    const log = logs[0];

    assert.equal(log.headers.authorization, DEFAULT_CENSOR);
    assert.equal(log.headers.cookie, DEFAULT_CENSOR);
    assert.equal(log.headers['set-cookie'], DEFAULT_CENSOR);
    assert.equal(log.headers['x-api-key'], DEFAULT_CENSOR);
    assert.equal(log.headers['x-hub-signature-256'], DEFAULT_CENSOR);
    assert.equal(log.headers['user-agent'], 'Mozilla/5.0 TestAgent');
    assert.equal(log.headers.accept, 'application/json');

    const raw = capture.getRaw();
    assert.equal(raw.includes('fake_bearer_token_xyz987'), false);
    assert.equal(raw.includes('fake_cookie_session_value'), false);
    assert.equal(raw.includes('fake_hmac_signature_hex'), false);
  });

  test('6. PII and sensitive candidate content fields are redacted', () => {
    const capture = createLogCapture();
    const testLogger = createLogger({ level: 'info' }, capture.stream);

    testLogger.info(
      {
        candidateId: 'cand_789',
        email: 'private_candidate_email@example.com',
        phone: '+1-555-0199-secret',
        ssn: '123-45-6789',
        resume: 'Full resume text with private personal history...',
        sourceCode: 'const privateProprietaryAlgorithm = () => secret;',
        codeSnippet: 'SELECT * FROM secrets;',
        safeSummary: 'Backend engineer with 5 years experience',
      },
      'Candidate profile indexed'
    );

    const logs = capture.getLogs();
    assert.equal(logs.length, 1);
    const log = logs[0];

    assert.equal(log.candidateId, 'cand_789');
    assert.equal(log.email, DEFAULT_CENSOR);
    assert.equal(log.phone, DEFAULT_CENSOR);
    assert.equal(log.ssn, DEFAULT_CENSOR);
    assert.equal(log.resume, DEFAULT_CENSOR);
    assert.equal(log.sourceCode, DEFAULT_CENSOR);
    assert.equal(log.codeSnippet, DEFAULT_CENSOR);
    assert.equal(log.safeSummary, 'Backend engineer with 5 years experience');

    const raw = capture.getRaw();
    assert.equal(raw.includes('private_candidate_email@example.com'), false);
    assert.equal(raw.includes('+1-555-0199-secret'), false);
  });

  test('7. Error serialization safely records type, message, stack, and redacts attached secret properties', () => {
    const capture = createLogCapture();
    const testLogger = createLogger({ level: 'error' }, capture.stream);

    const baseError = new Error('Database query timed out');
    const authError = new Error('Connector GitHub authentication failed', { cause: baseError });
    /** @type {any} */ (authError).token = 'fake_github_installation_token_on_err';
    /** @type {any} */ (authError).apiKey = 'fake_api_key_on_err';
    /** @type {any} */ (authError).tenantId = 'tenant_safe_id_456';
    /** @type {any} */ (authError).code = 'ERR_CONNECTOR_AUTH';

    testLogger.error(
      { err: authError, tenantId: 'tenant_safe_id_456' },
      'Connector operation failed'
    );

    const logs = capture.getLogs();
    assert.equal(logs.length, 1);
    const log = logs[0];

    assert.equal(log.level, 50);
    assert.equal(log.tenantId, 'tenant_safe_id_456');
    assert.ok(log.err);
    assert.equal(log.err.type, 'Error');
    assert.ok(log.err.message.includes('Connector GitHub authentication failed'));
    assert.equal(log.err.code, 'ERR_CONNECTOR_AUTH');
    assert.equal(log.err.tenantId, 'tenant_safe_id_456');
    assert.equal(log.err.token, DEFAULT_CENSOR);
    assert.equal(log.err.apiKey, DEFAULT_CENSOR);
    assert.ok(log.err.stack);

    const raw = capture.getRaw();
    assert.equal(raw.includes('fake_github_installation_token_on_err'), false);
    assert.equal(raw.includes('fake_api_key_on_err'), false);
  });

  test('8. Child logger inherits parent redaction and binds contextual identifiers', () => {
    const capture = createLogCapture();
    const rootLogger = createLogger({ level: 'info' }, capture.stream);
    const childLogger = createChildLogger(
      { service: 'github-connector', tenantId: 'tenant_999' },
      rootLogger
    );

    childLogger.info(
      { repoId: 'repo_123', token: 'fake_child_token_secret' },
      'Repository indexed'
    );

    const logs = capture.getLogs();
    assert.equal(logs.length, 1);
    const log = logs[0];

    assert.equal(log.service, 'github-connector');
    assert.equal(log.tenantId, 'tenant_999');
    assert.equal(log.repoId, 'repo_123');
    assert.equal(log.token, DEFAULT_CENSOR);

    const raw = capture.getRaw();
    assert.equal(raw.includes('fake_child_token_secret'), false);
  });

  test('9. Fastify integration injects request ID correlation and redacts sensitive headers', async () => {
    const capture = createLogCapture();
    const appLogger = createLogger({ level: 'info' }, capture.stream);
    const app = buildApp({ loggerInstance: appLogger });

    app.get('/test-correlation', async (request) => {
      request.log.info({ userId: 'user_test_1' }, 'Processing correlated request');
      return { success: true, requestId: request.id };
    });

    const response = await app.inject({
      method: 'GET',
      url: '/test-correlation',
      headers: {
        authorization: 'Bearer fake_injected_bearer_token',
        cookie: 'session_auth=fake_session_val',
        'x-request-id': 'req-custom-correlation-id-007',
      },
    });

    assert.equal(response.statusCode, 200);
    const payload = JSON.parse(response.payload);
    assert.equal(payload.success, true);
    assert.equal(payload.requestId, 'req-custom-correlation-id-007');

    const logs = capture.getLogs();
    assert.ok(logs.length >= 1);

    // Verify correlation ID is attached to the route handler log
    const handlerLog = logs.find((l) => l.msg === 'Processing correlated request');
    assert.ok(handlerLog);
    assert.equal(handlerLog.reqId, 'req-custom-correlation-id-007');
    assert.equal(handlerLog.userId, 'user_test_1');

    // Verify secret tokens never leak in any Fastify log lines
    const raw = capture.getRaw();
    assert.equal(raw.includes('fake_injected_bearer_token'), false);
    assert.equal(raw.includes('fake_session_val'), false);

    await app.close();
  });

  test('10. Sensitive keys list and redaction paths contain all mandatory security tokens', () => {
    const mandatoryKeys = [
      'authorization',
      'cookie',
      'token',
      'accessToken',
      'refreshToken',
      'apiKey',
      'secret',
      'clientSecret',
      'privateKey',
      'sessionSecret',
      'encryptionKey',
      'masterKey',
      'password',
      'webhookSecret',
      'mcpToken',
    ];

    for (const key of mandatoryKeys) {
      assert.ok(
        SENSITIVE_KEYS.includes(key),
        `Expected SENSITIVE_KEYS to include mandatory key: ${key}`
      );
      assert.ok(
        REDACTION_PATHS.includes(key),
        `Expected REDACTION_PATHS to include top-level key: ${key}`
      );
      assert.ok(
        REDACTION_PATHS.includes(`*.${key}`),
        `Expected REDACTION_PATHS to include wildcard key: *.${key}`
      );
    }
  });
});
