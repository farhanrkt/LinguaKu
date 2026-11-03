import { expect, test, type Page } from '@playwright/test';
import { answerOne, firstRun, openScriptLadder, switchLanguage } from './helpers.ts';

/**
 * D111, the learner's rule: *"every japanese characters shown must also include
 * the romaji, and word meaning, if there is two kanji the kanji can be clicked
 * to show what word by word meaning and the combined meaning is."*
 *
 * Tested at the kanji rung, because that is where the most Japanese is on
 * screen — the romaji rung draws most of it in Latin already, which would make
 * every assertion here pass for the wrong reason.
 */

const JAPANESE = /[぀-ヿ一-鿿]/u;
const KANJI = /[一-鿿]/gu;

const toKanjiRung = async (page: Page): Promise<void> => {
  const ladder = await openScriptLadder(page);
  await ladder.locator('button[aria-pressed]').nth(2).click();
  await page.getByRole('button', { name: 'Selesai' }).click();
  await expect(page.getByTestId('practise')).toBeVisible({ timeout: 20_000 });
};

/** Seeds strong cards on every Japanese lexeme, so the reader has a feed. */
const seedJapaneseVocabulary = async (page: Page): Promise<void> => {
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            new Promise<number>((resolve) => {
              const open = indexedDB.open('linguaku');
              open.onsuccess = () => {
                const request = open.result.transaction(['items']).objectStore('items').getAll();
                request.onsuccess = () =>
                  resolve(
                    (request.result as Array<{ lang: string; kind: string }>).filter(
                      (row) => row.lang === 'ja' && row.kind === 'lexeme',
                    ).length,
                  );
                request.onerror = () => resolve(0);
              };
              open.onerror = () => resolve(0);
            }),
        ),
      { timeout: 60_000 },
    )
    .toBeGreaterThan(400);
  await page.evaluate(
    (now) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('linguaku');
        open.onerror = () => reject(new Error(String(open.error)));
        open.onsuccess = () => {
          const database = open.result;
          const read = database.transaction(['items', 'profiles']);
          const items = read.objectStore('items').getAll();
          const profiles = read.objectStore('profiles').getAll();
          read.oncomplete = () => {
            const profileId = (profiles.result[0] as { id: string }).id;
            const write = database.transaction('cards', 'readwrite');
            const cards = write.objectStore('cards');
            for (const item of items.result as Array<{ id: string; kind: string; lang: string }>) {
              if (item.lang !== 'ja' || item.kind !== 'lexeme') continue;
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
        };
      }),
    Date.now(),
  );
  await page.reload();
  await expect(page.getByTestId('practise')).toBeEnabled({ timeout: 30_000 });
};

test('every reader sentence has its romaji, and a compound opens to each kanji', async ({ page }) => {
  test.setTimeout(150_000);
  await firstRun(page);
  await switchLanguage(page, /Bahasa Jepang/);
  await seedJapaneseVocabulary(page);
  await toKanjiRung(page);

  await page.getByTestId('reader-open').click();
  const pay = page.getByTestId('reader-data-download');
  if (await pay.isVisible().catch(() => false)) await pay.click();
  const feed = page.getByTestId('reader-feed');
  await expect(feed).toBeVisible({ timeout: 30_000 });

  // One romaji line per sentence, and none of it Japanese.
  const sentences = feed.locator('li');
  const count = await sentences.count();
  expect(count).toBeGreaterThan(0);
  await expect(feed.getByTestId('romaji-line')).toHaveCount(count);
  for (const line of await feed.getByTestId('romaji-line').allTextContents()) {
    expect(line.trim().length).toBeGreaterThan(0);
    expect(line).not.toMatch(JAPANESE);
  }

  // A word of two or more kanji. Without one the rest proves nothing, so it is
  // an assertion rather than a filter.
  const words = await page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="reader-token"]')].map((word) => {
      const rt = word.querySelector('rt');
      return (word.textContent ?? '').replace(rt?.textContent ?? '', '');
    }),
  );
  const compound = words.findIndex((word) => (word.match(KANJI) ?? []).length >= 2);
  expect(compound).toBeGreaterThanOrEqual(0);

  await page.getByTestId('reader-token').nth(compound).click();
  const panel = page.getByTestId('word-panel');
  await expect(panel).toBeVisible();
  await expect(panel.getByTestId('word-romaji')).not.toHaveText(JAPANESE);
  // Each character on its own, under the combined meaning.
  const characters = (words[compound]!.match(KANJI) ?? []).filter(
    (character, index, all) => all.indexOf(character) === index,
  );
  await expect(panel.getByTestId('word-kanji').locator('li')).toHaveCount(characters.length);
  await expect(panel.getByText('Arti gabungan')).toBeVisible();
});

test('a Japanese practice card carries romaji wherever it shows Japanese', async ({ page }) => {
  test.setTimeout(150_000);
  await firstRun(page);
  await switchLanguage(page, /Bahasa Jepang/);
  await toKanjiRung(page);
  await page.getByTestId('practise').click();
  await expect(page.getByTestId('session-progress')).toBeVisible({ timeout: 30_000 });

  // Walk the session until a word is introduced in a sentence (L0).
  let found = false;
  for (let step = 0; step < 30 && !found; step++) {
    if (await page.getByTestId('session-summary').isVisible().catch(() => false)) break;
    const sentence = page.getByTestId('task-sentence');
    if ((await sentence.isVisible().catch(() => false)) && JAPANESE.test((await sentence.textContent()) ?? '')) {
      found = true;
      break;
    }
    await answerOne(page);
  }
  expect(found).toBe(true);

  // The sentence has its romaji line, and the word being taught its romaji.
  await expect(page.getByTestId('romaji-line').first()).toBeVisible();
  await expect(page.getByTestId('romaji-line').first()).not.toHaveText(JAPANESE);
  const headword = (await page.getByTestId('task-headword').textContent()) ?? '';
  if (JAPANESE.test(headword)) {
    await expect(page.getByTestId('task-headword-romaji')).toBeVisible();
  }

  // Any word in the sentence opens to its reading, romaji and meaning.
  await page.getByTestId('sentence-word').first().click();
  const sheet = page.getByTestId('word-sheet');
  await expect(sheet).toBeVisible();
  await expect(sheet.getByTestId('word-romaji')).not.toHaveText(JAPANESE);
  await expect(sheet.getByTestId('word-meaning').or(sheet.getByTestId('word-meaning-none'))).toBeVisible();
  await sheet.getByTestId('word-sheet-close').click();
  await expect(sheet).toHaveCount(0);
});
