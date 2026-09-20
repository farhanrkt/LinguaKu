import { expect, test, type Page } from '@playwright/test';
import { firstRun, leaveSession } from './helpers.ts';

/**
 * SPEC §2.14, autonomy: *"can always skip an item (belum perlu)"*.
 *
 * The thing worth holding here is the negative: a skip must cost the learner
 * nothing. It is not an answer, so it may not produce a card, a review log or
 * any change to the schedule — invariant 0 and §2.2 both forbid that, and a skip
 * recorded as a lapse would let autonomy damage the learner's own schedule.
 */

const countRows = (page: Page, table: string) =>
  page.evaluate(async (name) => {
    const req = indexedDB.open('linguaku');
    const db: IDBDatabase = await new Promise((resolve) => {
      req.onsuccess = () => resolve(req.result);
    });
    if (!db.objectStoreNames.contains(name)) return 0;
    return await new Promise<number>((resolve) => {
      const request = db.transaction(name, 'readonly').objectStore(name).count();
      request.onsuccess = () => resolve(request.result);
    });
  }, table);

test('every item can be declined, and declining writes no card or log', async ({ page }) => {
  await firstRun(page);
  await page.getByTestId('practise').click();
  await expect(page.getByTestId('session-progress')).toBeVisible({ timeout: 15_000 });

  await expect(page.getByTestId('session-skip')).toBeVisible();
  await page.getByTestId('session-skip').click();

  // It advanced, so the learner is not stuck on a word they declined.
  await expect(page.getByTestId('session-progress')).toHaveText(/2 dari \d+/);

  // And nothing about the memory model moved.
  expect(await countRows(page, 'cards')).toBe(0);
  expect(await countRows(page, 'reviewLogs')).toBe(0);
  expect(await countRows(page, 'deferredItems')).toBe(1);
});

test('a declined word does not come back in the next session', async ({ page }) => {
  await firstRun(page);
  await page.getByTestId('practise').click();
  await expect(page.getByTestId('session-progress')).toBeVisible({ timeout: 15_000 });

  const declined = await page.getByTestId('task-headword').textContent();
  expect(declined).toBeTruthy();

  await page.getByTestId('session-skip').click();
  await expect(page.getByTestId('session-progress')).toHaveText(/2 dari \d+/);
  await leaveSession(page);

  // A fresh session, built after the deferral was written.
  await expect(page.getByTestId('practise')).toBeVisible();
  await page.reload();
  await page.getByTestId('practise').click();
  await expect(page.getByTestId('session-progress')).toBeVisible({ timeout: 15_000 });

  await expect(page.getByTestId('task-headword')).not.toHaveText(declined!);
});
