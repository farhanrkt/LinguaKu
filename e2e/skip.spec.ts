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

/**
 * Autonomy includes changing your mind (SPEC §2.14).
 *
 * The window escalates: 3 days at the first skip, 7, 21, then 60. So a mis-tap
 * on "Belum perlu kata ini" cost a learner that word for up to two months, and
 * `undeferItem` — written for exactly this, with the comment *"Undo, for a
 * learner who changes their mind"* — was called by nothing.
 */
test('a word set aside can be asked for again', async ({ page }) => {
  await firstRun(page);
  await page.getByTestId('practise').click();
  await expect(page.getByTestId('session-progress')).toBeVisible({ timeout: 15_000 });

  const declined = await page.getByTestId('task-headword').textContent();
  expect(declined).toBeTruthy();
  await page.getByTestId('session-skip').click();
  await expect(page.getByTestId('session-progress')).toHaveText(/2 dari \d+/);
  await leaveSession(page);

  await page.getByTestId('progress-open').click();
  await page.getByTestId('glossary-open').click();

  const deferred = page.getByTestId('deferred');
  await expect(deferred).toBeVisible();
  await expect(deferred).toContainText(declined!);
  // It says when it would have come back on its own, so taking it back is a
  // choice rather than a rescue.
  await expect(deferred).toContainText(/Muncul lagi/);

  await page.getByTestId('deferred-restore').first().click();
  await expect(deferred).toHaveCount(0);

  // And the deferral is gone from the composer's point of view, while the
  // record of having declined it is kept — the escalation depends on it.
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          new Promise<{ rows: number; times: number }>((resolve) => {
            const open = indexedDB.open('linguaku');
            open.onsuccess = () => {
              const request = open.result
                .transaction(['deferredItems'])
                .objectStore('deferredItems')
                .getAll();
              request.onsuccess = () => {
                const all = request.result as Array<{ until: number; times: number }>;
                resolve({
                  rows: all.filter((row) => row.until > Date.now()).length,
                  times: all[0]?.times ?? 0,
                });
              };
              request.onerror = () => resolve({ rows: -1, times: -1 });
            };
            open.onerror = () => resolve({ rows: -1, times: -1 });
          }),
      ),
    )
    .toEqual({ rows: 0, times: 1 });
});
