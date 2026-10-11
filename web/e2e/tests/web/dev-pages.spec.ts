import { expect, test } from '@playwright/test';

// E2E runs against a production build: internal design-review pages must not be reachable.
test('the UI kit gallery is not available in production', async ({ page }) => {
  const response = await page.goto('/en/dev/ui-kit');
  expect(response?.status()).toBe(404);
});
