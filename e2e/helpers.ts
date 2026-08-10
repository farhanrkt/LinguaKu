import { expect, type Page } from '@playwright/test';

/**
 * Completes first run and lands on the home screen.
 *
 * Placement is offered immediately after the language choice (SPEC §4.2), so
 * every test that wants the home screen has to decline it — which is itself a
 * small check that declining works.
 */
export const firstRun = async (page: Page): Promise<void> => {
  await page.goto('/');
  await page.getByRole('button', { name: /Bahasa Inggris/ }).click();
  await page.getByRole('button', { name: '4 menit' }).click();
  await page.getByRole('button', { name: 'Mulai', exact: true }).click();

  await page.getByTestId('placement-skip').click({ timeout: 20_000 });
  await expect(page.getByTestId('practise')).toBeEnabled();
};

/** Waits for the service worker to control the page and finish precaching. */
export const waitForOfflineReady = async (page: Page): Promise<void> => {
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, {
    timeout: 30_000,
  });
  await expect(page.getByTestId('offline-status')).toHaveText('Siap dipakai offline');
};
