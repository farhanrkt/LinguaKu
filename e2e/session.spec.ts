import { expect, test, type Page } from '@playwright/test';
import { answerOne, firstRun, seedDueCardsAtLevel, waitForOfflineReady } from './helpers.ts';

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


/**
 * One click is one answer, and the reason it needs a test is invariant 1.
 *
 * `recordReview` is the only writer of FSRS state and it appends to
 * `ReviewLog`, which is append-only at the Dexie hook — updates, overwrites and
 * deletes all throw, and a full reset drops the database. So a duplicate review
 * row cannot be cleaned up afterwards: it stays in the substrate §9 computes the
 * honest retention rate from, forever. Every handler in the session is `async`
 * and none of them was latched, so a learner tapping "Oke, paham" twice — which
 * is what people do on a slow phone when nothing happens immediately — wrote two
 * rows and advanced FSRS twice for one item.
 */
test('spamming the confirm button writes one review, not several', async ({ page }) => {
  await firstRun(page);
  await page.getByTestId('practise').click();
  await expect(page.getByTestId('session-progress')).toBeVisible({ timeout: 20_000 });

  const confirm = page.getByTestId('exposure-confirm');
  await expect(confirm).toBeVisible({ timeout: 20_000 });

  // Eight clicks with no waiting between them, dispatched straight at the
  // element: this is the race, not a polite user journey.
  await page.evaluate(() => {
    const button = document.querySelector<HTMLButtonElement>('[data-testid="exposure-confirm"]');
    for (let index = 0; index < 8; index++) button?.click();
  });

  await expect(page.getByTestId('session-progress')).toBeVisible();
  // Let anything that was going to be written finish being written.
  await page.waitForTimeout(1_500);

  expect(await countRows(page, 'reviewLogs'), 'one confirmation produced more than one review row')
    .toBe(1);
});

/**
 * SPEC §2.3 L0 is errorless exposure — the learner is not being tested, so
 * there is nothing to grade and nothing to reveal. It used to submit the
 * headword as its own answer, grade it "correct", and print "Benar!" over a
 * card that had asked nothing, costing a second tap to dismiss.
 */
test('an exposure card advances on one tap, with no verdict', async ({ page }) => {
  await firstRun(page);
  await page.getByTestId('practise').click();
  await expect(page.getByTestId('session-progress')).toBeVisible({ timeout: 20_000 });

  const confirm = page.getByTestId('exposure-confirm');
  await expect(confirm).toBeVisible({ timeout: 20_000 });
  const before = await page.getByTestId('session-progress').textContent();

  await confirm.click();

  // The session moved, and never claimed the learner got anything right.
  await expect(page.getByTestId('session-progress')).not.toHaveText(before ?? '', {
    timeout: 10_000,
  });
  await expect(page.getByTestId('feedback')).toBeHidden();
});

/**
 * D59: a gloss is reference, never an answer key — and coverage is 30% of
 * English words and 4% of Japanese, so *absent* is the ordinary case. Both
 * branches have to say something. The session used to render neither: the gloss
 * was fetched only for L0, and where there was none the space was simply blank.
 */
test('every card says what the word means, or says it has no entry', async ({ page }) => {
  await firstRun(page);
  await page.getByTestId('practise').click();
  await expect(page.getByTestId('session-progress')).toBeVisible({ timeout: 20_000 });

  const shown = page.getByTestId('task-gloss').or(page.getByTestId('task-no-gloss'));
  await expect(shown.first()).toBeVisible({ timeout: 20_000 });
});

/**
 * The other half of the same bug, by a slower route.
 *
 * The feedback renders in the footer while the card stays on screen above it,
 * so every control that produced the answer is still there and still live once
 * the verdict appears. The in-flight latch does not help — these two clicks are
 * not racing, they are seconds apart — and the second one wrote another
 * permanent `ReviewLog` row for a card the learner had already answered.
 */
test('answering again while the verdict is up does not write a second review', async ({ page }) => {
  await firstRun(page);
  // L1 is recognition: options, and every one of them stays on screen and
  // clickable while the feedback shows underneath.
  await seedDueCardsAtLevel(page, 1, 8);
  await page.getByTestId('practise').click();
  await expect(page.getByTestId('session-progress')).toBeVisible({ timeout: 20_000 });

  const options = page.locator('button[aria-pressed]');
  for (let step = 0; step < 12; step++) {
    if (await options.first().isVisible().catch(() => false)) break;
    const confirm = page.getByTestId('exposure-confirm');
    if (!(await confirm.isVisible().catch(() => false))) break;
    await confirm.click();
    await page.waitForTimeout(400);
  }
  await expect(options.first()).toBeVisible({ timeout: 20_000 });

  const before = await countRows(page, 'reviewLogs');
  await options.first().click();
  await expect(page.getByTestId('feedback')).toBeVisible();

  // The verdict is up. Every option is still there — click them all again.
  const count = await options.count();
  for (let index = 0; index < count; index++) {
    await options.nth(index).click({ force: true }).catch(() => undefined);
  }
  await page.waitForTimeout(1_000);

  expect(await countRows(page, 'reviewLogs'), 'an answered card accepted another answer').toBe(
    before + 1,
  );
});

const countRows = (page: Page, table: string): Promise<number> =>
  page.evaluate(
    (table) =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open('linguaku');
        open.onerror = () => reject(new Error(String(open.error)));
        open.onsuccess = () => {
          const request = open.result.transaction(table).objectStore(table).count();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(new Error(String(request.error)));
        };
      }),
    table,
  );
