import { expect, test } from '@playwright/test';
import { firstRun } from './helpers.ts';

/**
 * M0 acceptance: the app installs as a PWA and loads offline.
 * Milestones from M2 extend this file with the session/resume half of the
 * SPEC §13 smoke path.
 */

test('first run creates a local profile without an account', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Mau belajar bahasa apa?' })).toBeVisible();
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

  await expect(page.getByRole('heading', { name: 'Halo!' })).toBeVisible();
  await expect(page.getByText(/Kamu sedang belajar/)).toContainText('Inggris');
});
