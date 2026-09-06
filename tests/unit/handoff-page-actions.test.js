import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { renderHandoffPage } from '../../src/views/handoff.page.js';

describe('Handoff Kit UI Package History Actions Contract', () => {
  const mockUser = { id: 'u-1', email: 'vishu@example.com', displayName: 'Vishu' };
  const mockApplication = {
    id: 'app-12345',
    jobTitle: 'Senior Backend Engineer',
    companyName: 'Stripe',
    status: 'SAVED',
    appliedAt: null,
    metadata: { externalSubmissionState: 'HANDOFF_READY' },
  };
  const mockHandoffKit = {
    applicationId: 'app-12345',
    packageHash: 'a283b66e22b74942f3fc9f08ffb7517616032e52cdd14e087cfe2be048140476',
    targetJob: { title: 'Senior Backend Engineer', company: 'Stripe' },
    resume: { storageKey: 'res-key', filename: 'resume.pdf' },
    coverLetter: { storageKey: 'cl-key', filename: 'cl.pdf' },
    readiness: [],
  };

  const packageHistory = [
    {
      version: 2,
      lifecycleState: 'CURRENT',
      packageHash: 'a283b66e22b74942f3fc9f08ffb7517616032e52cdd14e087cfe2be048140476',
      preparedAt: new Date().toISOString(),
      source: 'PREPARE_JOB_APPLICATION',
      answers: { regenerationReason: 'Dual package test', regenerationScope: 'BOTH' },
    },
    {
      version: 1,
      lifecycleState: 'ARCHIVED',
      packageHash: 'b99c6506287e2ca5995921d053b6554131a42b552260f6e87ca43b2bead89527',
      preparedAt: new Date(Date.now() - 3600000).toISOString(),
      source: 'PREPARE_JOB_APPLICATION',
      answers: {},
    },
  ];

  test('CURRENT row renders [View] [Download] [Archive] [Regenerate] and NO Delete', () => {
    const html = renderHandoffPage({
      user: mockUser,
      application: mockApplication,
      handoffKit: mockHandoffKit,
      packageHistory,
      currentPackage: packageHistory[0],
      viewingVersion: 2,
      canDeletePackages: true,
    });

    const tableStart = html.indexOf('id="package-history-table"');
    assert.ok(tableStart !== -1, 'Table must exist');
    const tableEnd = html.indexOf('</table>', tableStart);
    const tableHtml = html.slice(tableStart, tableEnd);

    // Split rows
    const rows = tableHtml.split('</tr>').filter(r => r.includes('<tr') && r.includes('<td'));
    assert.equal(rows.length, 2, 'Should have 2 package rows');

    const currentRow = rows.find(r => r.includes('v2'));
    assert.ok(currentRow, 'Current row v2 must be present');

    // Row v2 action checks
    assert.ok(currentRow.includes('>View</a>'), 'CURRENT must have [View]');
    assert.ok(currentRow.includes('>Download</a>'), 'CURRENT must have [Download]');
    assert.ok(/Archive\s*<\/button>/.test(currentRow), 'CURRENT must have [Archive]');
    assert.ok(/Regenerate\s*<\/button>/.test(currentRow), 'CURRENT must have [Regenerate]');
    assert.ok(!/Delete\s*<\/button>/.test(currentRow), 'CURRENT must NOT have [Delete]');
    assert.ok(!currentRow.includes('/packages/2/delete'), 'CURRENT must not expose delete endpoint');
  });

  test('ARCHIVED row renders [View] [Download] [Restore] [Delete] with destructive styling', () => {
    const html = renderHandoffPage({
      user: mockUser,
      application: mockApplication,
      handoffKit: mockHandoffKit,
      packageHistory,
      currentPackage: packageHistory[0],
      viewingVersion: 2,
      canDeletePackages: true,
    });

    const tableStart = html.indexOf('id="package-history-table"');
    const tableEnd = html.indexOf('</table>', tableStart);
    const tableHtml = html.slice(tableStart, tableEnd);

    const rows = tableHtml.split('</tr>').filter(r => r.includes('<tr') && r.includes('<td'));
    const archivedRow = rows.find(r => r.includes('v1'));
    assert.ok(archivedRow, 'Archived row v1 must be present');

    // Row v1 action checks
    assert.ok(archivedRow.includes('>View</a>'), 'ARCHIVED must have [View]');
    assert.ok(archivedRow.includes('>Download</a>'), 'ARCHIVED must have [Download]');
    assert.ok(/Restore\s*<\/button>/.test(archivedRow), 'ARCHIVED must have [Restore]');
    assert.ok(/Delete\s*<\/button>/.test(archivedRow), 'ARCHIVED must have [Delete]');

    // Check destructive styling
    assert.ok(archivedRow.includes('color:#EF4444'), 'Delete button must have destructive color');
    assert.ok(
      archivedRow.includes('Permanently delete package version v1 (b99c650628) and its document snapshots?'),
      'Delete button must have confirmation prompt with version and short hash'
    );
    assert.ok(archivedRow.includes('/packages/1/delete'), 'Delete action must target correct endpoint');
  });

  test('CURRENT remains protected when viewingVersion is changed to 1', () => {
    const html = renderHandoffPage({
      user: mockUser,
      application: mockApplication,
      handoffKit: mockHandoffKit,
      packageHistory,
      currentPackage: packageHistory[0],
      viewingVersion: 1, // Viewing the archived version
      canDeletePackages: true,
    });

    const tableStart = html.indexOf('id="package-history-table"');
    const tableEnd = html.indexOf('</table>', tableStart);
    const tableHtml = html.slice(tableStart, tableEnd);

    const rows = tableHtml.split('</tr>').filter(r => r.includes('<tr') && r.includes('<td'));
    const currentRow = rows.find(r => r.includes('v2'));
    const archivedRow = rows.find(r => r.includes('v1'));

    // Even when viewing v1, v2 is CURRENT and must NOT have Delete
    assert.ok(!currentRow.includes('>Delete</button>'), 'CURRENT must NOT have Delete even when not viewing it');
    assert.ok(currentRow.includes('>View</a>'), 'CURRENT still has View');
    assert.ok(archivedRow.includes('>Delete</button>'), 'ARCHIVED still has Delete when viewing it');
    assert.ok(archivedRow.includes('>View</a>'), 'ARCHIVED still has View');
  });
});
