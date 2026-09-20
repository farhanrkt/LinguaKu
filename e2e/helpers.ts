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

/**
 * Answers whatever is on screen and advances past the feedback.
 *
 * A session queue holds two kinds of entry since M4 — lexeme cards and
 * contrastive drills (SPEC §3.3) — so the helper has to recognize both.
 * Correctness is never what these tests are checking; getting through the
 * session is.
 */
export const answerOne = async (page: Page): Promise<void> => {
  const progress = page.getByTestId('session-progress');
  const before = await progress.textContent();

  const confirm = page.getByRole('button', { name: 'Oke, paham' });
  const input = page.getByRole('textbox');
  const drillSubmit = page.getByRole('button', { name: 'Jawab' });

  if (await confirm.isVisible().catch(() => false)) {
    // L0 is errorless exposure: confirming *is* the response, there is nothing
    // to reveal, and it advances on that one tap. It used to grade the headword
    // against itself, announce "Benar!", and wait for a second tap.
    await confirm.click();
    await expect(async () => {
      if (await page.getByTestId('session-summary').isVisible().catch(() => false)) return;
      const now = await progress.textContent({ timeout: 1_000 }).catch(() => null);
      expect(now !== null && now !== before).toBe(true);
    }).toPass({ timeout: 15_000, intervals: [50, 100, 200] });
    return;
  }

  if (await input.isVisible().catch(() => false)) {
    await input.fill('jawaban');
    // A drill submits with "Jawab"; a cloze or dictation submits with the
    // confidence tap (SPEC §2.12), which is also the submit button.
    if (await drillSubmit.isVisible().catch(() => false)) {
      await drillSubmit.click();
    } else {
      await page.getByRole('button', { name: 'Yakin', exact: true }).click();
    }
  } else {
    // Multiple choice, whether a recognition card or a drill: any option
    // submits. `aria-pressed` is what an OptionCard is, and nothing else.
    await page.locator('button[aria-pressed]').first().click();
  }

  await expect(page.getByTestId('feedback')).toBeVisible();
  await page.getByTestId('next').click();

  // Wait for the counter to move before touching anything again. Probing which
  // control is on screen while the next card is still being built reads the old
  // one, which is how this helper used to race the app.
  await expect(async () => {
    if (await page.getByTestId('session-summary').isVisible().catch(() => false)) return;
    // Short, catching read: on the last item the counter disappears for good as
    // the summary takes over, and a blocking `textContent()` would sit inside
    // this predicate waiting for an element that is never coming back.
    const now = await progress.textContent({ timeout: 1_000 }).catch(() => null);
    expect(now !== null && now !== before).toBe(true);
  }).toPass({ timeout: 15_000, intervals: [50, 100, 200] });
};

/** Waits for the service worker to control the page and finish precaching. */
export const waitForOfflineReady = async (page: Page): Promise<void> => {
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, {
    timeout: 30_000,
  });
  await expect(page.getByTestId('offline-status')).toHaveText('Siap dipakai offline');
};

/**
 * Opens something that lives behind the settings screen.
 *
 * Everything that is not practice moved one tap deeper when the home screen
 * had grown seven links between the learner and the practise button (SPEC §10).
 * Tests go the way a learner does rather than reaching past the UI.
 */
export const openFromSettings = async (page: Page, testId: string): Promise<void> => {
  await page.getByTestId('settings-open').click();
  await page.getByTestId(testId).click();
};

/**
 * Gives the learner a vocabulary, by writing cards straight into IndexedDB.
 *
 * Answering a few items in the UI is not enough and should not be: a sentence
 * needs most of its words known before it is readable at all, which is hundreds
 * of words, and the earlier test asserts the reader says so honestly until then.
 * What is under test here is the reader, not the months of practice in front of
 * it, so the state is seeded rather than earned.
 */
export const seedKnownVocabulary = async (page: Page, count: number): Promise<void> => {
  await page.evaluate(
    ({ count, now }) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('linguaku');
        open.onerror = () => reject(new Error(String(open.error)));
        open.onsuccess = () => {
          const database = open.result;
          const read = database.transaction(['items', 'profiles']);
          const itemsRequest = read.objectStore('items').getAll();
          const profilesRequest = read.objectStore('profiles').getAll();
          read.oncomplete = () => {
            const profileId = (profilesRequest.result[0] as { id: string }).id;
            const items = (itemsRequest.result as Array<{ id: string; kind: string; freqRank: number }>)
              .filter((item) => item.kind === 'lexeme')
              .sort((a, b) => a.freqRank - b.freqRank)
              .slice(0, count);

            const write = database.transaction('cards', 'readwrite');
            const cards = write.objectStore('cards');
            for (const item of items) {
              // A well-established card: high stability, reviewed just now, so
              // retrievability is 1 and `knownItemIds` counts it (SPEC §2.4).
              cards.put({
                id: `${profileId}::${item.id}`,
                profileId,
                itemId: item.id,
                ladderLevel: 2,
                dueAt: now + 30 * 86_400_000,
                suspended: 0,
                fsrs: {
                  dueAt: now + 30 * 86_400_000,
                  stability: 60,
                  difficulty: 5,
                  elapsedDays: 0,
                  scheduledDays: 30,
                  learningSteps: 0,
                  reps: 3,
                  lapses: 0,
                  state: 2,
                  lastReviewAt: now,
                },
              });
            }
            write.oncomplete = () => resolve();
            write.onerror = () => reject(new Error(String(write.error)));
          };
          read.onerror = () => reject(new Error(String(read.error)));
        };
      }),
    { count, now: Date.now() },
  );
  await page.reload();
  await expect(page.getByTestId('practise')).toBeEnabled({ timeout: 20_000 });
};


/**
 * Puts a handful of cards at a given rung, due now.
 *
 * A fresh profile is all L0 exposure, so anything that needs a *graded* card —
 * one with a verdict, a wrong answer, a second chance to click — cannot be
 * reached by playing the session honestly. The rung selects the task (D18), so
 * this is the shortest honest way to put one on screen.
 */
export const seedDueCardsAtLevel = async (
  page: Page,
  level: number,
  count: number,
): Promise<void> => {
  await page.evaluate(
    ({ level, count, now }) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('linguaku');
        open.onerror = () => reject(new Error(String(open.error)));
        open.onsuccess = () => {
          const database = open.result;
          const read = database.transaction(['items', 'profiles']);
          const itemsRequest = read.objectStore('items').getAll();
          const profilesRequest = read.objectStore('profiles').getAll();
          read.onerror = () => reject(new Error(String(read.error)));
          read.oncomplete = () => {
            const profileId = (profilesRequest.result[0] as { id: string }).id;
            const items = (
              itemsRequest.result as Array<{ id: string; kind: string; freqRank: number }>
            )
              .filter((item) => item.kind === 'lexeme')
              .sort((a, b) => a.freqRank - b.freqRank)
              .slice(0, count);

            const write = database.transaction(['cards', 'sessions'], 'readwrite');
            const cards = write.objectStore('cards');
            for (const item of items) {
              cards.put({
                id: `${profileId}::${item.id}`,
                profileId,
                itemId: item.id,
                ladderLevel: level,
                dueAt: now - 1_000,
                suspended: 0,
                fsrs: {
                  dueAt: now - 1_000,
                  stability: 30,
                  difficulty: 5,
                  elapsedDays: 1,
                  scheduledDays: 1,
                  learningSteps: 0,
                  reps: 5,
                  lapses: 0,
                  state: 2,
                  lastReviewAt: now - 86_400_000,
                },
              });
            }
            // Drop any composed session so the next one sees these as due.
            write.objectStore('sessions').clear();
            write.oncomplete = () => resolve();
            write.onerror = () => reject(new Error(String(write.error)));
          };
        };
      }),
    { level, count, now: Date.now() },
  );
  await page.reload();
  await expect(page.getByTestId('practise')).toBeEnabled({ timeout: 20_000 });
};

/**
 * Leaves a session, whichever way it ended.
 *
 * A session runs until its queue is empty *or* until the learner stops, and
 * those exits are different controls: the summary's "Kembali" and the
 * mid-session "Selesai dulu". Tests used to reach for the second one and got
 * away with it only because a fresh session was longer than they were —
 * SPEC §7.2's daily cap makes a first session exactly one day's allowance, so
 * they now finish it.
 */
export const leaveSession = async (page: Page): Promise<void> => {
  const summary = page.getByTestId('session-summary');
  if (await summary.isVisible().catch(() => false)) {
    await page.getByRole('button', { name: 'Kembali' }).click();
    return;
  }
  await page.getByRole('button', { name: 'Selesai dulu' }).click();
};
