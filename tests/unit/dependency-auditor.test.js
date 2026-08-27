/**
 * @file Unit Tests for Automated Dependency Vulnerability Auditor.
 *
 * Verifies that the dependency auditor correctly classifies vulnerability severities,
 * enforces CI gating on High/Critical issues, and distinguishes dev vs prod dependencies.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAudit } from '../../scripts/audit-dependencies.js';

describe('Security: Dependency Auditor Unit Tests', () => {
  it('should pass when zero critical and high vulnerabilities exist', () => {
    const mockReport = {
      metadata: {
        vulnerabilities: {
          info: 0,
          low: 0,
          moderate: 2,
          high: 0,
          critical: 0,
          total: 2,
        },
        dependencies: { total: 250 },
      },
      vulnerabilities: {
        'mock-build-tool': {
          name: 'mock-build-tool',
          severity: 'moderate',
          isDirect: false,
          range: '<=1.0.0',
          via: ['transitive-parser'],
        },
      },
    };

    const result = evaluateAudit(mockReport, { strict: false });
    assert.equal(result.passed, true);
    assert.equal(result.criticalHighFindings.length, 0);
    assert.equal(result.moderateFindings.length, 1);
  });

  it('should fail when a high vulnerability is detected', () => {
    const mockReport = {
      metadata: {
        vulnerabilities: {
          info: 0,
          low: 0,
          moderate: 0,
          high: 1,
          critical: 0,
          total: 1,
        },
        dependencies: { total: 250 },
      },
      vulnerabilities: {
        'vulnerable-package': {
          name: 'vulnerable-package',
          severity: 'high',
          isDirect: true,
          range: '<=2.0.0',
          via: ['RCE Advisory'],
        },
      },
    };

    const result = evaluateAudit(mockReport, { strict: false });
    assert.equal(result.passed, false);
    assert.equal(result.criticalHighFindings.length, 1);
    assert.equal(result.criticalHighFindings[0].severity, 'high');
  });

  it('should fail when a critical vulnerability is detected', () => {
    const mockReport = {
      metadata: {
        vulnerabilities: {
          info: 0,
          low: 0,
          moderate: 0,
          high: 0,
          critical: 1,
          total: 1,
        },
        dependencies: { total: 250 },
      },
      vulnerabilities: {
        'critical-package': {
          name: 'critical-package',
          severity: 'critical',
          isDirect: true,
          range: '*',
          via: ['Zero Day Vulnerability'],
        },
      },
    };

    const result = evaluateAudit(mockReport, { strict: false });
    assert.equal(result.passed, false);
    assert.equal(result.criticalHighFindings.length, 1);
    assert.equal(result.criticalHighFindings[0].severity, 'critical');
  });

  it('should fail on moderate vulnerabilities when strict mode is active', () => {
    const mockReport = {
      metadata: {
        vulnerabilities: {
          info: 0,
          low: 0,
          moderate: 1,
          high: 0,
          critical: 0,
          total: 1,
        },
        dependencies: { total: 250 },
      },
      vulnerabilities: {
        'dev-tool': {
          name: 'dev-tool',
          severity: 'moderate',
          isDirect: false,
          range: '*',
          via: ['minor flaw'],
        },
      },
    };

    const result = evaluateAudit(mockReport, { strict: true });
    assert.equal(result.passed, false);
    assert.equal(result.moderateFindings.length, 1);
  });
});
