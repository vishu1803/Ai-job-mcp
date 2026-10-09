// Controlled subprocess boundary for actual CLI tests. Never loaded by production scripts.
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';

const response = JSON.parse(process.env.TEST_AUDIT_RESPONSE);
childProcess.execSync = (_command, options) => {
  if (!options.timeout || options.maxBuffer !== 10 * 1024 * 1024) {
    throw new Error('Missing subprocess bounds');
  }
  if (response.native === 'timeout') {
    return childProcess.execFileSync(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
      ...options,
      timeout: 50,
      killSignal: 'SIGKILL',
    });
  }
  if (response.native === 'missing') {
    return childProcess.execFileSync('issue13-nonexistent-npm-71d5538b', [], options);
  }
  if (response.status === 0 && !response.code && !response.signal) return response.stdout;
  throw Object.assign(new Error('Controlled failure; sensitive diagnostics must not escape'), {
    status: response.status,
    stdout: response.stdout,
    stderr: response.stderr,
    code: response.code,
    signal: response.signal,
  });
};
syncBuiltinESMExports();
