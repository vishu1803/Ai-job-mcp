/**
 * @file Test environment detection utility.
 *
 * Provides a reliable, zero-dependency check for whether the current process
 * is executing under the Node.js test runner or a test lifecycle script.
 */

/**
 * Detects whether the current process is executing under a test runner.
 *
 * @param {NodeJS.ProcessEnv} [env=process.env] Process environment dictionary
 * @param {string[]} [execArgv=process.execArgv] Node runtime execution arguments
 * @returns {boolean} True if running under a test context
 */
export function isTestRunner(env = process.env, execArgv = process.execArgv) {
  if (env?.NODE_TEST_CONTEXT) return true;
  if (env?.NODE_ENV === 'test') return true;
  if (
    typeof env?.npm_lifecycle_event === 'string' &&
    (env.npm_lifecycle_event === 'test' || env.npm_lifecycle_event.startsWith('test:'))
  ) {
    return true;
  }
  return (
    Array.isArray(execArgv) && execArgv.some((arg) => arg === '--test' || arg.startsWith('--test-'))
  );
}
