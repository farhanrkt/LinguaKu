import { expect, test } from '@playwright/test';
import { answerOne, firstRun, waitForOfflineReady } from './helpers.ts';

/**
 * M0 acceptance: the app installs as a PWA and loads offline.
 * Milestones from M2 extend this file with the session/resume half of the
 * SPEC §13 smoke path.
 */

test('first run creates a local profile without an account', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Mau mulai dari bahasa apa?' })).toBeVisible();
  // No signup, no email, no password anywhere in the flow (SPEC §10).
  await expect(page.locator('input[type="email"], input[type="password"]')).toHaveCount(0);

  await page.getByRole('button', { name: /Bahasa Inggris/ }).click();
  await page.getByRole('button', { name: '4 menit' }).click();
  await page.getByRole('button', { name: 'Mulai', exact: true }).click();

  await page.getByTestId('placement-skip').click({ timeout: 20_000 });
  await expect(page.getByRole('heading', { name: 'Halo!' })).toBeVisible();
});

test('the profile survives a reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Bahasa Jepang/ }).click();
  await page.getByRole('button', { name: 'Mulai', exact: true }).click();
  await page.getByTestId('placement-skip').click({ timeout: 20_000 });
  await expect(page.getByText(/Kamu sedang belajar/)).toContainText('Jepang');

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Halo!' })).toBeVisible();
  await expect(page.getByText(/Kamu sedang belajar/)).toContainText('Jepang');
});

test('the app registers a service worker and loads with the network cut', async ({
  page,
  context,
}) => {
  await firstRun(page);


  // Wait for the worker to control the page and finish precaching.
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, {
    timeout: 30_000,
  });
  await expect(page.getByTestId('offline-status')).toHaveText('Siap dipakai offline');

  await context.setOffline(true);
  await page.reload();

  await expect(page.getByRole('heading', { name: 'Halo!' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Kamu sedang belajar/)).toContainText('Inggris');
});

/**
 * SPEC §5.4 promises the app is *"fully functional offline after first load"*,
 * and until v1.29.1 the gate above proved only that the **shell** loads: the
 * home screen renders from the precached JS and CSS whether or not a single
 * content shard survived.
 *
 * That matters because the shards are the fragile half. Thirty are precached
 * and revision-managed; thirty-four live in a runtime cache whose entry cap
 * once sat one fetch below the shard count, a failure that *"looks like content
 * that mysteriously will not open on a plane"* (invariant 34). R11's fix to the
 * caching strategy is a service-worker change whose failure mode is silently
 * breaking exactly this, and a test that stops at the home screen would not
 * notice.
 *
 * So: cut the network and answer a question. A session needs the lexeme shard,
 * the anchor shard and the gloss shard for its band — nothing renders without
 * all three.
 */
test('a whole question can be answered with the network cut', async ({ page, context }) => {
  await firstRun(page);
  await waitForOfflineReady(page);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('practise')).toBeEnabled({ timeout: 20_000 });

  // Composing a session reads the items imported from the lexeme shard...
  await page.getByTestId('practise').click();
  await expect(page.getByTestId('session-progress')).toBeVisible({ timeout: 20_000 });

  // ...and the card carries a real sentence, which only the anchor shard has.
  const headword = await page.getByTestId('task-headword').textContent();
  expect(headword?.trim().length ?? 0).toBeGreaterThan(0);

  await answerOne(page);
  await expect(page.getByTestId('session-progress')).toHaveText(/2 dari \d+/);
});
