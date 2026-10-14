import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isValidReturnTo } from '../../src/security/oauth-state.js';

test('Studio login can return to the exact route with a draft query', () => {
  assert.equal(isValidReturnTo('/resume-studio'), true);
  assert.equal(
    isValidReturnTo('/resume-studio?draftId=15f4965d-bbf2-4b40-8ac1-1f0c5f1e5550'),
    true
  );
});
test('adding Studio does not authorize external or lookalike redirects', () => {
  for (const target of [
    'https://attacker.test/resume-studio',
    '//attacker.test/resume-studio',
    '/\\attacker.test/resume-studio',
    '/resume-studio-evil',
    '/resume-studio/admin',
    '/resume-studio\r\nHost: attacker.test',
  ]) {
    assert.equal(isValidReturnTo(target), false);
  }
});
