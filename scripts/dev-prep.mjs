#!/usr/bin/env node
// Runs before every web/mobile dev server or build so stale caches never break a start.
//
//   node ../../scripts/dev-prep.mjs web-dev             → then `next dev`
//   node ../../scripts/dev-prep.mjs web-build           → then `next build`
//   node ../../scripts/dev-prep.mjs expo [expo args…]   → starts `expo start` itself
//
// 1. Regenerates packages/ui/theme.css from tokens.json (so web CSS never lags the tokens).
// 2. Fingerprints the inputs that bundler caches depend on (lockfile, tokens, configs).
//    If the fingerprint changed since the last run, the cache is cleared:
//    web-dev → .next/dev, web-build → .next/cache (Turbopack keeps failed lookups across
//    restarts; dev and build are tracked separately so a build never wipes a running dev server),
//    expo → `--clear` (Metro/NativeWind cache compiled CSS + resolutions).
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildThemeCss } from '../packages/ui/src/theme-css.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const app = process.cwd();
const [mode, ...rest] = process.argv.slice(2);

// 0. The two most common setup slips get a clear message instead of a failure further on.
const [major = 0, minor = 0] = process.versions.node.split('.').map(Number);
if (!((major === 22 && minor >= 13) || (major === 24 && minor >= 3) || major >= 25)) {
  console.error(
    [
      '',
      `[dev-prep] MoversHub needs Node.js 22.13+, 24.3+ or newer — this computer has ${process.version}.`,
      '           Install Node.js 24 LTS from https://nodejs.org, open a new terminal and try again (README "Run it locally").',
      '',
    ].join('\n'),
  );
  process.exit(1);
}
if (!existsSync(join(root, 'node_modules/.modules.yaml'))) {
  console.error(
    [
      '',
      "[dev-prep] The packages are not installed (or were installed with npm, which can't link this project).",
      '           Run `pnpm install` in the project folder first (README "Run it locally").',
      '',
    ].join('\n'),
  );
  process.exit(1);
}
const MODES = ['web-dev', 'web-build', 'expo'];
if (!MODES.includes(mode)) {
  console.error(`usage: dev-prep.mjs <${MODES.join('|')}> [expo args…]`);
  process.exit(1);
}

// 1. theme.css — in this process (plain JavaScript, so any supported Node runs it, and an error shows
//    in full). Written only when it changed, so file watchers aren't woken for nothing.
const themeFile = join(root, 'packages/ui/theme.css');
const theme = buildThemeCss(JSON.parse(readFileSync(join(root, 'packages/ui/tokens.json'), 'utf8')));
if (!existsSync(themeFile) || readFileSync(themeFile, 'utf8') !== theme) writeFileSync(themeFile, theme);

// 1b. Web: MapLibre runs in a Web Worker that the bundler doesn't emit. Serve the installed
//     version's worker as a static file (public/vendor, git-ignored) — see components/landing/route-map.tsx.
if (mode !== 'expo') {
  const requireFromApp = createRequire(join(app, 'package.json'));
  const worker = requireFromApp.resolve('maplibre-gl/dist/maplibre-gl-worker.mjs');
  mkdirSync(join(app, 'public/vendor'), { recursive: true });
  copyFileSync(worker, join(app, 'public/vendor/maplibre-gl-worker.mjs'));
}

// 2. fingerprint
const inputs = [
  'pnpm-lock.yaml',
  'packages/ui/tokens.json',
  'packages/ui/tailwind-preset.js',
].map((p) => join(root, p));
const web = mode !== 'expo';
const appFiles = web
  ? ['package.json', 'next.config.ts', 'tsconfig.json']
  : ['package.json', 'tailwind.config.js', 'babel.config.js', 'metro.config.js', 'app.json', 'app.config.js'];
inputs.push(...appFiles.map((p) => join(app, p)));

const hash = createHash('sha256');
for (const file of inputs) hash.update(file).update(existsSync(file) ? readFileSync(file) : '');
const fingerprint = hash.digest('hex');

// Kept outside .next/.expo (which builds may clean). A fresh install wipes node_modules → one clean start.
const stampDir = join(app, 'node_modules/.cache/movershub-dev-prep');
const stamp = join(stampDir, `.dev-prep-${mode}`);
const stale = !existsSync(stamp) || readFileSync(stamp, 'utf8') !== fingerprint;

if (stale && web) {
  rmSync(join(app, mode === 'web-dev' ? '.next/dev' : '.next/cache'), { recursive: true, force: true });
  console.log(`[dev-prep] dependencies or tokens changed — cleared Next.js ${mode === 'web-dev' ? 'dev' : 'build'} cache`);
}
mkdirSync(stampDir, { recursive: true });
writeFileSync(stamp, fingerprint);

if (mode === 'expo') {
  const args = ['start', ...rest];
  if (stale && !args.includes('--clear')) {
    args.push('--clear');
    console.log('[dev-prep] dependencies or tokens changed — starting Metro with a clean cache');
  }
  const expoCli = createRequire(join(app, 'package.json')).resolve('expo/bin/cli');
  const child = spawn(process.execPath, [expoCli, ...args], { stdio: 'inherit' });
  child.on('exit', (code) => process.exit(code ?? 0));
}
