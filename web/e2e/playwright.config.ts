import { defineConfig, devices } from '@playwright/test';

// Tests run against a production build on its own port: no first-compile races from the
// dev server, and no clash with a `pnpm dev:web` already running on :3000.
const PORT = 3100;
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;
/** `customer` / `mover`: the phone apps' screenshot tests run against that app's browser preview. */
const app = process.env.E2E_APP;
const APP_PORTS: Record<string, number> = { customer: 8081, mover: 8082 };

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL, trace: 'on-first-retry' },
  // Screenshots are compared at CSS pixels, without motion, caret or blinking; a tiny tolerance
  // absorbs anti-aliasing noise. Baselines are per operating system (`-win32`, `-linux`).
  expect: { toHaveScreenshot: { animations: 'disabled', caret: 'hide', scale: 'css', maxDiffPixelRatio: 0.002 } },
  projects: [
    // `pnpm e2e`: website behaviour + API tests.
    { name: 'chromium', testIgnore: ['**/visual/**', '**/apps/**'], use: { ...devices['Desktop Chrome'] } },
    // `pnpm e2e:visual`: screenshots of the website, still and offline.
    { name: 'visual', testMatch: '**/visual/**/*.spec.ts', use: { ...devices['Desktop Chrome'], reducedMotion: 'reduce' } },
    // `pnpm e2e:apps`: screenshots of the phone apps' browser preview, one app per run (E2E_APP).
    {
      name: 'apps',
      testMatch: '**/apps/**/*.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        reducedMotion: 'reduce',
      },
    },
  ],
  webServer: app
    ? {
        // The app's browser preview; CI=1 keeps Expo from watching files or asking questions.
        command: `pnpm --filter @movershub/${app} web`,
        url: `http://localhost:${APP_PORTS[app]}`,
        reuseExistingServer: true,
        timeout: 300_000,
        env: { CI: '1', BROWSER: 'none' },
      }
    : process.env.E2E_BASE_URL
      ? undefined
      : {
          command: `pnpm --filter @movershub/web build && pnpm --filter @movershub/web exec next start -p ${PORT}`,
          url: baseURL,
          reuseExistingServer: false,
          timeout: 300_000,
          // Offline and deterministic: address search + routes from fixtures (lib/geo/provider.ts) and
          // the labelled sample prices instead of the live quote function (lib/route-quote.ts).
          env: { GEO_PROVIDER: 'fixture', QUOTE_SOURCE: 'sample' },
        },
});
