import { expect, test, type Page } from '@playwright/test';
import { answerOne, firstRun, waitForOfflineReady } from './helpers.ts';

/**
 * M2 acceptance (SPEC §12):
 *  - a 4-minute session runs end to end, offline;
 *  - kill-and-resume loses nothing;
 *  - icon-tap to first answerable question ≤ 3s on a warm cache (§5.4).
 */

test('a session runs end to end with the network cut', async ({ page, context }) => {
  await firstRun(page);
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
  await firstRun(page);
  await page.getByTestId('practise').click();
  await expect(page.getByTestId('session-progress')).toBeVisible({ timeout: 15_000 });

  for (let i = 0; i < 2; i++) await answerOne(page);
  await expect(page.getByTestId('session-progress')).toHaveText(/3 dari \d+/);

  // Two answers, two records. Which table they land in depends on whether the
  // composer put a contrastive drill in the first two slots — a drill has no
  // FSRS card, so it is recorded apart from the review log (SPEC §3.3). What is
  // under test is that nothing is lost, not where it was filed.
  const answeredBefore = await countAnswers(page);
  expect(answeredBefore).toBe(2);

  // As abrupt as a phone killing the tab.
  await page.reload();

  // Generous, because this is a cold boot: Dexie opens, the profile is read and
  // the resumable session is found. How *fast* that happens is coldstart.spec's
  // job; what is under test here is that nothing was lost.
  await expect(page.getByTestId('practise')).toHaveText('Lanjutkan latihan', {
    timeout: 15_000,
  });
  await page.getByTestId('practise').click();
  await expect(page.getByTestId('session-progress')).toHaveText(/3 dari \d+/, { timeout: 15_000 });
  expect(await countAnswers(page)).toBe(answeredBefore);
});

test('finishing a session reports what got stronger, not points', async ({ page }) => {
  // This test walks an entire 4-minute session — around thirty questions, each
  // with a feedback step — so it is legitimately longer than the default budget.
  test.setTimeout(180_000);

  await firstRun(page);
  await page.getByTestId('practise').click();
  await expect(page.getByTestId('session-progress')).toBeVisible({ timeout: 15_000 });

  const total = Number(
    /\d+ dari (\d+)/.exec((await page.getByTestId('session-progress').textContent()) ?? '')?.[1] ??
      '0',
  );
  expect(total).toBeGreaterThan(0);

  // Answer until the session says it is done, rather than exactly `total` times.
  // An item the builder cannot make (a missing anchor) is skipped, so the queue
  // length is an upper bound on the number of questions, not the count.
  for (let i = 0; i <= total; i++) {
    if (await page.getByTestId('session-summary').isVisible().catch(() => false)) break;
    await answerOne(page);
  }

  const summary = page.getByTestId('session-summary');
  await expect(summary).toBeVisible();
  // SPEC §2.15 / docs/ETHICS.md: no XP, points, streaks or gems anywhere.
  await expect(page.locator('body')).not.toContainText(/\bXP\b|poin|streak|nyawa/i);
});

/** Every answer the learner has given: review logs plus drill attempts. */
const countAnswers = (page: Page): Promise<number> =>
  page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open('linguaku');
        open.onerror = () => reject(new Error(String(open.error)));
        open.onsuccess = () => {
          const stores = ['reviewLogs', 'drillAttempts'];
          const transaction = open.result.transaction(stores);
          let total = 0;
          let pending = stores.length;
          for (const store of stores) {
            const request = transaction.objectStore(store).count();
            request.onsuccess = () => {
              total += request.result;
              if (--pending === 0) resolve(total);
            };
            request.onerror = () => reject(new Error(String(request.error)));
          }
        };
      }),
  );

/**
 * SPEC §2.14: *"learner picks topic clusters"*, and §2.10: frequency order
 * *"modulated by learner-selected topic goals"*.
 *
 * The control has to be reachable, honest about what it does, and costless to
 * leave alone — a preference that reads as a syllabus would be the opposite of
 * the autonomy it is there for.
 */
test('topics are offered, and choosing none costs nothing', async ({ page }) => {
  await firstRun(page);
  await page.getByTestId('settings-open').click();

  const list = page.getByTestId('topic-list');
  await expect(list).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Belum ada yang dipilih/)).toBeVisible();

  await list.locator('button[aria-pressed]').first().click();
  await expect(page.getByText(/Bisa diubah atau dikosongkan kapan saja/)).toBeVisible();

  // Wait for the write to land before reloading. The toggle updates the screen
  // optimistically and persists in the background, so a reload fired
  // immediately after the tap can beat the write — which is a race in the test,
  // not in the app, but it would look identical to a lost preference.
  await expect
    .poll(
      () =>
        page.evaluate(
          async () =>
            await new Promise<string>((resolve) => {
              const open = indexedDB.open('linguaku');
              open.onsuccess = () => {
                const query = open.result
                  .transaction('profiles')
                  .objectStore('profiles')
                  .getAll();
                query.onsuccess = () =>
                  resolve(JSON.stringify((query.result[0] as { topics?: string[] })?.topics ?? []));
              };
            }),
        ),
      { timeout: 10_000 },
    )
    .not.toBe('[]');

  // And it survives a cold start, because it is a profile field, not state.
  await page.reload();
  await page.getByTestId('settings-open').click();
  // The list is fetched, so wait for it rather than racing the render.
  await expect(page.getByTestId('topic-list')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('topic-list').locator('button[aria-pressed="true"]')).toHaveCount(
    1,
    { timeout: 15_000 },
  );

  // Nothing is gated on it: the session still starts either way.
  await page.getByRole('button', { name: 'Selesai' }).click();
  await page.getByTestId('practise').click();
  await expect(page.getByTestId('session-progress')).toBeVisible({ timeout: 20_000 });
});
