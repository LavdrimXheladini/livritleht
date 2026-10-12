import { readFileSync } from 'node:fs';

import { test, type Page, type Route } from '@playwright/test';

// Screenshots of the phone apps, taken in their browser preview (Expo web) — one app per run:
// `pnpm e2e:apps` runs both in turn (run-apps.mjs). Offline and still: the server functions answer
// from a saved real quote (fixtures/), and the apps' motion is reduced.

const PORTS = { customer: 8081, mover: 8082 } as const;
export type AppName = keyof typeof PORTS;

const quote = readFileSync(new URL('../../fixtures/quote-prishtina-prizren.json', import.meta.url), 'utf8');

/** The saved quote: per class, every mover's offer for a crew of 2 (the apps' default). */
export const savedQuote = JSON.parse(quote) as {
  classes: { vehicleClass: string; offers: { companyName: string; quote: { currency: string; moverPrice: number } }[] }[];
};
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };

/** Skips the file unless this app's preview is the one running; returns its address. */
export function appUrl(app: AppName): string {
  test.skip(process.env.E2E_APP !== app, `runs with E2E_APP=${app} (pnpm e2e:apps)`);
  return `http://localhost:${PORTS[app]}/`;
}

/** `quote` answers with the saved Prishtina → Prizren quote (test movers, 83.2 km); `places` finds nothing. */
export async function serveFixtures(page: Page) {
  const answer = (body: string) => (route: Route) =>
    route.request().method() === 'OPTIONS'
      ? route.fulfill({ status: 204, headers: cors })
      : route.fulfill({ contentType: 'application/json', headers: cors, body });
  await page.route('**/functions/v1/quote', answer(quote));
  await page.route('**/functions/v1/places', answer('{"suggestions":[]}'));
}

/** Makes the screen as tall as the page, so one screenshot shows all of it (the app scrolls inside the screen). */
export async function fitScreenToPage(page: Page) {
  const height = await page.evaluate(() => Math.max(...[...document.querySelectorAll('div')].map((el) => el.scrollHeight)));
  await page.setViewportSize({ width: page.viewportSize()!.width, height: Math.min(height, 4000) });
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}
