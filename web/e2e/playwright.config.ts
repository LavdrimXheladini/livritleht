import { defineConfig, devices } from '@playwright/test';

// Tests run against a production build on its own port: no first-compile races from the
// dev server, and no clash with a `pnpm dev:web` already running on :3000.
const PORT = 3100;
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL, trace: 'on-first-retry' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `pnpm --filter @ranktrip/web build && pnpm --filter @ranktrip/web exec next start -p ${PORT}`,
        url: baseURL,
        reuseExistingServer: false,
        timeout: 300_000,
        // Offline and deterministic: address search + routes from fixtures (lib/geo/provider.ts) and
        // the labelled sample prices instead of the live quote function (lib/route-quote.ts).
        env: { GEO_PROVIDER: 'fixture', QUOTE_SOURCE: 'sample' },
      },
});
