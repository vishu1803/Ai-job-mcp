import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { getPoolMetrics } from '../../src/db/index.js';
import { JobDiscoveryService } from '../../src/services/job-discovery.service.js';
import { invalidateProfileCache } from '../../src/services/candidate-profile.service.js';
import { GENERIC_NOISE_TERMS } from '../../src/domain/career/skill-taxonomy.js';

describe('Phase 62: Performance, UI Responsiveness & Runtime Hardening Regression Suite', () => {
  it('1. Database pool instrumentation exposes active, idle, and waiting metrics', () => {
    const metrics = getPoolMetrics();
    assert.ok(typeof metrics.total === 'number', 'total must be a number');
    assert.ok(typeof metrics.idle === 'number', 'idle must be a number');
    assert.ok(typeof metrics.waiting === 'number', 'waiting must be a number');
    assert.ok(metrics.total >= 0);
    assert.ok(metrics.idle >= 0);
    assert.ok(metrics.waiting >= 0);
  });

  it('2. Static assets are extracted to /public/ and contain production bundles', () => {
    const publicDir = path.resolve(process.cwd(), 'public');
    assert.ok(fs.existsSync(publicDir), 'public directory must exist');

    const appCss = path.join(publicDir, 'css', 'app.css');
    const appJs = path.join(publicDir, 'js', 'app.js');
    const copilotCss = path.join(publicDir, 'css', 'copilot.css');
    const copilotJs = path.join(publicDir, 'js', 'copilot.js');

    assert.ok(fs.existsSync(appCss), 'public/css/app.css must exist');
    assert.ok(fs.existsSync(appJs), 'public/js/app.js must exist');
    assert.ok(fs.existsSync(copilotCss), 'public/css/copilot.css must exist');
    assert.ok(fs.existsSync(copilotJs), 'public/js/copilot.js must exist');

    assert.ok(
      fs.statSync(appCss).size > 10000,
      'app.css should contain extracted global CSS (>10KB)'
    );
    assert.ok(fs.statSync(appJs).size > 5000, 'app.js should contain extracted global JS (>5KB)');
    assert.ok(
      fs.statSync(copilotCss).size > 1000,
      'copilot.css should contain copilot styles (>1KB)'
    );
    assert.ok(
      fs.statSync(copilotJs).size > 10000,
      'copilot.js should contain copilot controller (>10KB)'
    );
  });

  it('3. Job discovery strictly enforces truthfulness: no synthetic jobs in production without opt-in', async () => {
    const originalEnv = process.env.NODE_ENV;
    const originalOptIn = process.env.ALLOW_SYNTHETIC_JOBS;

    try {
      // In production mode, synthetic fallback must be completely rejected (fail-closed, 0 fake jobs)
      process.env.NODE_ENV = 'production';
      process.env.ALLOW_SYNTHETIC_JOBS = 'false';

      const jobService = new JobDiscoveryService();
      const prodRes = await jobService.searchJobs({ query: 'engineer' });
      assert.ok(Array.isArray(prodRes.jobs));
      assert.ok(
        prodRes.jobs.every((j) => !j.isSynthetic),
        'Zero synthetic jobs may ever be returned in production'
      );

      // In development mode, opt-in flag ALLOW_SYNTHETIC_JOBS=true enables synthetic development dataset
      process.env.NODE_ENV = 'development';
      process.env.ALLOW_SYNTHETIC_JOBS = 'true';

      const devJobService = new JobDiscoveryService();
      const devRes = await devJobService.searchJobs({ query: 'engineer' });
      assert.ok(Array.isArray(devRes.jobs));
      const syntheticJobs = devRes.jobs.filter((j) => j.isSynthetic);
      assert.ok(syntheticJobs.length > 0, 'Synthetic jobs should be present in dev when opted in');
      assert.ok(
        syntheticJobs.every((j) => j.company.includes('[Dev Demo]')),
        'Dev synthetic jobs must be clearly labeled with [Dev Demo]'
      );

      // In development mode without opt-in flag, synthetic jobs must NOT appear
      process.env.ALLOW_SYNTHETIC_JOBS = 'false';
      const noOptJobService = new JobDiscoveryService();
      const noOptRes = await noOptJobService.searchJobs({ query: 'engineer' });
      const noOptSynthetic = noOptRes.jobs.filter((j) => j.isSynthetic);
      assert.equal(
        noOptSynthetic.length,
        0,
        'Dev mode without ALLOW_SYNTHETIC_JOBS=true must not return synthetic jobs'
      );
    } finally {
      process.env.NODE_ENV = originalEnv;
      process.env.ALLOW_SYNTHETIC_JOBS = originalOptIn;
    }
  });

  it('4. Skill taxonomy suppresses generic runtime builtins and noise terms', () => {
    const requiredSuppressed = [
      'crypto',
      'path',
      'fs',
      'stream',
      'socket-io',
      'platform-express',
      'cache-manager',
      'playwright',
      'cheerio',
      'joi',
      'rxjs',
    ];
    for (const term of requiredSuppressed) {
      assert.ok(
        GENERIC_NOISE_TERMS.has(term),
        `GENERIC_NOISE_TERMS must suppress ${term} from polluting taxonomy telemetry`
      );
    }
  });

  it('5. Profile cache invalidation hook is exported and safe to call', () => {
    assert.doesNotThrow(() => {
      invalidateProfileCache('tenant-1', 'candidate-1');
      invalidateProfileCache('*', '*');
    });
  });

  it('6. Global navigation progress bar is present in app.css and app.js', () => {
    const appCss = fs.readFileSync(path.resolve(process.cwd(), 'public/css/app.css'), 'utf8');
    const appJs = fs.readFileSync(path.resolve(process.cwd(), 'public/js/app.js'), 'utf8');

    assert.ok(appCss.includes('#nav-progress-bar'), 'app.css must style #nav-progress-bar');
    assert.ok(appJs.includes('nav-progress-bar'), 'app.js must manage #nav-progress-bar animation');
  });
});
