import { expect, test, type Page } from '@playwright/test';
import { firstRun } from './helpers.ts';

/**
 * SPEC §4.3 applies everywhere Japanese is drawn, not only to a practice card.
 *
 * v1.23.0 wired the session to the ladder and left the reader showing bare
 * kanji, so a learner who moved the control on the home screen saw it take
 * effect in one screen and not the other — a setting labelled "Tulisan Jepang"
 * with an undocumented scope.
 *
 * The tap is the part worth gating hardest: the surface changes with the rung
 * and the dictionary lookup behind it must not.
 */

/** Waits for the Japanese lexeme shard the feed is built from. */
const waitForJapaneseContent = async (page: Page) =>
  expect
    .poll(
      () =>
        page.evaluate(
          () =>
            new Promise<string[]>((resolve) => {
              const open = indexedDB.open('linguaku');
              open.onsuccess = () => {
                const request = open.result
                  .transaction(['contentShards'])
                  .objectStore('contentShards')
                  .getAll();
                request.onsuccess = () =>
                  resolve(
                    (request.result as Array<{ path: string; lang: string }>)
                      .filter((row) => row.lang === 'ja')
                      .map((row) => row.path),
                  );
                request.onerror = () => resolve([]);
              };
              open.onerror = () => resolve([]);
            }),
        ),
      { timeout: 60_000 },
    )
    .toEqual(expect.arrayContaining([expect.stringContaining('lexemes.b1')]));

/**
 * Well-established cards on the commonest Japanese lexemes, so the feed has
 * sentences the learner can actually read (§2.4's coverage floor), plus
 * optionally a kanji card strong enough for §10's furigana to fade.
 */
const seedJapanese = async (page: Page, fadedKanji: string | null) =>
  page.evaluate(
    ({ now, fadedKanji }) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('linguaku');
        open.onerror = () => reject(new Error(String(open.error)));
        open.onsuccess = () => {
          const database = open.result;
          const read = database.transaction(['items', 'profiles']);
          const items = read.objectStore('items').getAll();
          const profiles = read.objectStore('profiles').getAll();
          read.onerror = () => reject(new Error(String(read.error)));
          read.oncomplete = () => {
            const profileId = (profiles.result[0] as { id: string }).id;
            const known = (
              items.result as Array<{ id: string; kind: string; lang: string; band: number }>
            ).filter((row) => row.lang === 'ja' && row.kind === 'lexeme');

            const strong = (itemId: string) => ({
              id: `${profileId}::${itemId}`,
              profileId,
              itemId,
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

            const write = database.transaction('cards', 'readwrite');
            const cards = write.objectStore('cards');
            for (const item of known) cards.put(strong(item.id));
            // 60 days clears FURIGANA_FADE_STABILITY_DAYS (21) comfortably.
            if (fadedKanji !== null) cards.put(strong(`ja:kanji:${fadedKanji}`));
            write.onerror = () => reject(new Error(String(write.error)));
            write.oncomplete = () => resolve();
          };
        };
      }),
    { now: Date.now(), fadedKanji },
  );

const openJapaneseReader = async (page: Page, fadedKanji: string | null) => {
  await firstRun(page);
  await page.getByRole('button', { name: /Bahasa Jepang/ }).click();
  await expect(page.getByTestId('learning-label')).toHaveText(/Jepang/);
  await waitForJapaneseContent(page);
  await seedJapanese(page, fadedKanji);
  await page.reload();
  await expect(page.getByTestId('practise')).toBeEnabled({ timeout: 30_000 });
  await page.getByTestId('reader-open').click();

  // §5.4's download announcement, where it appears (D80).
  const pay = page.getByTestId('reader-data-download');
  if (await pay.isVisible().catch(() => false)) await pay.click();
  await expect(page.getByTestId('reader-feed')).toBeVisible({ timeout: 30_000 });
};

/** The rendered word, and whatever reading sits above it. */
const firstRubyWord = (page: Page) =>
  page.evaluate(() => {
    const words = [...document.querySelectorAll('[data-testid="reader-token"]')];
    const withRuby = words.find((word) => word.querySelector('rt') !== null);
    const rt = withRuby?.querySelector('rt');
    return {
      total: words.length,
      withRuby: words.filter((word) => word.querySelector('rt') !== null).length,
      // `rt` text is excluded: the base is what the token reads as.
      base: withRuby ? (withRuby.textContent ?? '').replace(rt?.textContent ?? '', '') : null,
      ruby: rt?.textContent ?? null,
    };
  });

test('the reader is written at the rung the learner chose', async ({ page }) => {
  test.setTimeout(120_000);
  await openJapaneseReader(page, null);

  // Kanji is not the default; set it explicitly so this does not depend on
  // what `defaultScriptMode` happens to be.
  await page.getByRole('button', { name: /Kembali/ }).click();
  await page.getByTestId('script-mode').locator('button[aria-pressed]').nth(2).click();
  await page.getByTestId('reader-open').click();
  await expect(page.getByTestId('reader-feed')).toBeVisible({ timeout: 30_000 });

  const kanji = await firstRubyWord(page);
  expect(kanji.total).toBeGreaterThan(0);
  // Some token in the feed carries a reading above it. A feed of pure kana
  // would make this vacuous, so the count is asserted rather than a boolean.
  expect(kanji.withRuby).toBeGreaterThan(0);
  expect(kanji.ruby).toBeTruthy();

  // Kana replaces the kanji outright; there is nothing left to annotate.
  await page.getByRole('button', { name: /Kembali/ }).click();
  await page.getByTestId('script-mode').locator('button[aria-pressed]').nth(1).click();
  await page.getByTestId('reader-open').click();
  await expect(page.getByTestId('reader-feed')).toBeVisible({ timeout: 30_000 });
  expect((await firstRubyWord(page)).withRuby).toBe(0);
});

/** The visible text of each word in the feed, in order. */
const wordTexts = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="reader-token"]')].map((word) => {
      const rt = word.querySelector('rt');
      return (word.textContent ?? '').replace(rt?.textContent ?? '', '');
    }),
  );

const setRung = async (page: Page, rung: 0 | 1 | 2) => {
  await page.getByRole('button', { name: /Kembali/ }).click();
  await page.getByTestId('script-mode').locator('button[aria-pressed]').nth(rung).click();
  await page.getByTestId('reader-open').click();
  await expect(page.getByTestId('reader-feed')).toBeVisible({ timeout: 30_000 });
};

test('a tap still means the word the sentence contains, not the one on screen', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openJapaneseReader(page, null);

  // The feed is seeded from the day, so the same sentences appear at both
  // rungs within a run and the two lists line up index for index.
  await setRung(page, 2);
  const asKanji = await wordTexts(page);
  await setRung(page, 1);
  const asKana = await wordTexts(page);
  expect(asKana).toHaveLength(asKanji.length);

  // A token the kana rung actually rewrote. Without one this test proves
  // nothing, so it is an assertion rather than a filter.
  const rewritten = asKanji.findIndex((word, index) => word !== asKana[index]);
  expect(rewritten).toBeGreaterThanOrEqual(0);

  await page.getByTestId('reader-token').nth(rewritten).click();
  await expect(page.getByTestId('word-panel')).toBeVisible();
  // `mine` renders only where `db.items.get` found the word. If the tap had
  // carried the kana surface instead of the token, the lookup would have
  // missed and the panel would open with no way to mine from it.
  await expect(page.getByTestId('mine')).toBeVisible();
});
