#!/usr/bin/env node
// `pnpm e2e:apps`: screenshot tests of the phone apps, each app's browser preview in turn — one
// Expo bundler at a time, they need a lot of memory. Extra arguments go to Playwright, e.g.
// `pnpm e2e:apps --update-snapshots` after an intended design change.

import { spawnSync } from 'node:child_process';

let failed = false;
for (const app of ['customer', 'mover']) {
  const run = spawnSync('pnpm', ['exec', 'playwright', 'test', '--project=apps', `tests/apps/${app}.spec.ts`, ...process.argv.slice(2)], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: { ...process.env, E2E_APP: app },
  });
  if (run.status !== 0) failed = true;
}
process.exit(failed ? 1 : 0);
