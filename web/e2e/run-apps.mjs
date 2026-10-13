#!/usr/bin/env node
// `pnpm e2e:apps`: screenshot tests of the phone app in its browser preview (one Expo bundler —
// it needs a lot of memory). Extra arguments go to Playwright, e.g. `pnpm e2e:apps --update-snapshots`
// after an intended design change.

import { spawnSync } from 'node:child_process';

const run = spawnSync('pnpm', ['exec', 'playwright', 'test', '--project=apps', ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, E2E_APP: '1' },
});
process.exit(run.status ?? 1);
