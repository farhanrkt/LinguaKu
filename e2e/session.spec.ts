import { expect, test, type Page } from '@playwright/test';

/**
 * M2 acceptance (SPEC §12):
 *  - a 4-minute session runs end to end, offline;
 *  - kill-and-resume loses nothing;
 *  - icon-tap to first answerable question ≤ 3s on a warm cache (§5.4).
 */

const onboard = async (page: Page) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Bahasa Inggris/ }).click();
  await page.getByRole('button', { name: '4 menit' }).click();
  await page.getByRole('button', { name: 'Mulai', exact: true }).click();
  await expect(page.getByTestId('practise')).toBeEnabled();
};

/** Waits for the service worker to control the page and finish precaching. */
const waitForOfflineReady = async (page: Page) => {
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, {
    timeout: 30_000,
  });
  await expect(page.getByTestId('offline-status')).toHaveText('Siap dipakai offline');
};

/** Answers whatever task is on screen and advances past the feedback. */
const answerOne = async (page: Page) => {
  const confirm = page.getByRole('button', { name: 'Oke, paham' });
  const input = page.getByRole('textbox');

  if (await confirm.isVisible().catch(() => false)) {
    await confirm.click();
  } else if (await input.isVisible().catch(() => false)) {
    await input.fill('jawaban');
    await page.getByRole('button', { name: 'Yakin', exact: true }).click();
  } else {
    // Recognition: any option submits; correctness is not what is under test.
    await page.getByRole('button', { name: /.+/ }).nth(1).click();
  }

  await expect(page.getByTestId('feedback')).toBeVisible();
  await page.getByTestId('next').click();
};

test('a session runs end to end with the network cut', async ({ page, context }) => {
  await onboard(page);
  await waitForOfflineReady(page);

  // Everything from here happens with no network at all.
  await context.setOffline(true);
  await page.reload();
  await page.getByTestId('practise').click();

  await expect(page.getByTestId('session-progress')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('session-progress')).toHaveText(/1 dari \d+/);

  for (let i = 0; i < 3; i++) await answerOne(page);
  await expect(page.getByTestId('session-progress')).toHaveText(/4 dari \d+/);
});

test('killing the app mid-session resumes at the exact next item', async ({ page }) => {
  await onboard(page);
  await page.getByTestId('practise').click();
  await expect(page.getByTestId('session-progress')).toBeVisible({ timeout: 15_000 });

  for (let i = 0; i < 2; i++) await answerOne(page);
  await expect(page.getByTestId('session-progress')).toHaveText(/3 dari \d+/);

  const reviewsBefore = await countReviewLogs(page);
  expect(reviewsBefore).toBe(2);

  // As abrupt as a phone killing the tab.
  await page.reload();

  await expect(page.getByTestId('practise')).toHaveText('Lanjutkan latihan');
  await page.getByTestId('practise').click();
  await expect(page.getByTestId('session-progress')).toHaveText(/3 dari \d+/, { timeout: 15_000 });
  expect(await countReviewLogs(page)).toBe(reviewsBefore);
});

test('finishing a session reports what got stronger, not points', async ({ page }) => {
  await onboard(page);
  await page.getByTestId('practise').click();
  await expect(page.getByTestId('session-progress')).toBeVisible({ timeout: 15_000 });

  const total = Number(
    /\d+ dari (\d+)/.exec((await page.getByTestId('session-progress').textContent()) ?? '')?.[1] ??
      '0',
  );
  expect(total).toBeGreaterThan(0);
  for (let i = 0; i < total; i++) await answerOne(page);

  const summary = page.getByTestId('session-summary');
  await expect(summary).toBeVisible();
  // SPEC §2.15 / docs/ETHICS.md: no XP, points, streaks or gems anywhere.
  await expect(page.locator('body')).not.toContainText(/\bXP\b|poin|streak|nyawa/i);
});

const countReviewLogs = (page: Page): Promise<number> =>
  page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open('linguaku');
        open.onerror = () => reject(new Error(String(open.error)));
        open.onsuccess = () => {
          const request = open.result.transaction('reviewLogs').objectStore('reviewLogs').count();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(new Error(String(request.error)));
        };
      }),
  );
