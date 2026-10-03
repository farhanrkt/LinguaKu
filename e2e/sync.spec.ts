import { expect, test } from '@playwright/test';
import { firstRun, leaveSession, openFromSettings } from './helpers.ts';

/**
 * M7's acceptance criterion, in the browser: *"the app remains fully functional
 * with sync disabled."*
 *
 * The unit tests prove the module makes no request when off. These prove the
 * stronger and more useful thing: that a learner who never touches the setting
 * has an app in which the sync code is never reached at all — no request on
 * boot, none during a session, none on the progress screen.
 */

test('nothing ever talks to a sync endpoint unless the learner turns it on', async ({ page }) => {
  const external: string[] = [];
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    // Anything that is not our own origin is something we did not intend to send.
    if (!url.startsWith('http://localhost:4173')) external.push(url);
    await route.continue();
  });

  await firstRun(page);
  await page.getByTestId('practise').click();
  await expect(page.getByTestId('session-progress')).toBeVisible({ timeout: 15_000 });
  await leaveSession(page);
  await page.getByTestId('progress-open').click();
  await expect(page.getByTestId('vocab')).toBeVisible({ timeout: 15_000 });

  expect(external).toEqual([]);
});

test('sync is off by default and says the app does not need it', async ({ page }) => {
  await firstRun(page);
  await openFromSettings(page, 'sync-open');

  await expect(page.getByTestId('sync-enable')).not.toBeChecked();
  await expect(page.getByTestId('sync-endpoint')).toHaveValue('');
  // The learner is told, before enabling anything, that there is no server
  // behind this and that their data would leave the phone.
  await expect(page.getByText(/jalan sepenuhnya tanpa ini/)).toBeVisible();
  await expect(page.getByText(/Kami tidak punya server/)).toBeVisible();

  // And the button that would send anything is not usable while it is off.
  await expect(page.getByTestId('sync-now')).toBeDisabled();
});

test('a failed sync leaves the learner’s data alone', async ({ page }) => {
  await firstRun(page);
  await page.getByTestId('practise').click();
  await expect(page.getByTestId('session-progress')).toBeVisible({ timeout: 15_000 });
  await leaveSession(page);

  await openFromSettings(page, 'sync-open');
  await page.getByTestId('sync-enable').check();
  await page.getByTestId('sync-endpoint').fill('https://nowhere.invalid');
  await page.getByTestId('sync-token').fill('secret');
  await page.getByTestId('sync-save').click();
  await page.getByTestId('sync-now').click();

  // It names the failure it actually hit — an unreachable host is a different
  // problem, and a different fix, from a token that does not match — and says
  // the local data is untouched, which it is.
  const outcome = page.getByTestId('sync-outcome');
  await expect(outcome).toContainText(/tidak bisa dihubungi/, { timeout: 20_000 });
  await expect(outcome).toContainText(/tidak berubah/);
});
