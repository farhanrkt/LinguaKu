import { expect, test, type Page } from '@playwright/test';
import { firstRun } from './helpers.ts';

/**
 * SPEC §4.3's ladder is *romaji → kana → kanji*, and the first screen offers
 * Japanese as *"Mulai dari nol, dari hiragana"*.
 *
 * Until v1.32.0 the app shipped 1,748 kanji as learnable items and **fifteen**
 * single-kana lexemes — all of them particles, not the alphabet — and the only
 * hiragana instruction anywhere was two multiple-choice trivia questions. A
 * complete beginner was dropped at `kana` script mode and handed sentences in a
 * writing system nothing had taught them.
 *
 * This is the gate on the promise: pick Japanese, start practising, meet the
 * alphabet.
 */
const waitForJapanese = (page: Page) =>
  expect
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
                      (row) => row.lang === 'ja' && row.kind === 'kana',
                    ).length,
                  );
                request.onerror = () => resolve(0);
              };
              open.onerror = () => resolve(0);
            }),
        ),
      { timeout: 60_000 },
    )
    .toBe(208);

test('a day-one Japanese learner is taught the alphabet', async ({ page }) => {
  test.setTimeout(120_000);
  await firstRun(page);
  await page.getByRole('button', { name: /Bahasa Jepang/ }).click();
  await expect(page.getByTestId('learning-label')).toHaveText(/Jepang/);

  // 104 hiragana + 104 katakana, derived from the syllabary rather than a shard.
  await waitForJapanese(page);

  await page.getByTestId('practise').click();
  await expect(page.getByTestId('session-progress')).toBeVisible({ timeout: 30_000 });

  // The very first thing a beginner meets is a character, with its sound.
  await expect(page.getByTestId('kana-character')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('kana-character')).toHaveText('あ');
  await expect(page.getByTestId('kana-romaji')).toHaveText('a');

  // And it says which of the two scripts it is, and how the other one writes it.
  await expect(page.locator('body')).toContainText('Hiragana');
  await expect(page.locator('body')).toContainText('ア');

  // It is a real card: answering it advances the session.
  await page.getByTestId('kana-confirm').click();
  await expect(page.getByTestId('session-progress')).toHaveText(/2 dari \d+/);
});

test('kana shares the session with words rather than blocking them', async ({ page }) => {
  test.setTimeout(120_000);
  await firstRun(page);
  await page.getByRole('button', { name: /Bahasa Jepang/ }).click();
  await waitForJapanese(page);

  await page.getByTestId('practise').click();
  await expect(page.getByTestId('session-progress')).toBeVisible({ timeout: 30_000 });

  // Read the plan rather than walking it: the claim is about what the composer
  // put in the session, and a UI walk would be testing the card views instead.
  const queue = await page.evaluate(
    () =>
      new Promise<string[]>((resolve) => {
        const open = indexedDB.open('linguaku');
        open.onsuccess = () => {
          const request = open.result.transaction(['sessions']).objectStore('sessions').getAll();
          request.onsuccess = () => {
            const rows = request.result as Array<{ itemIds: string[]; startedAt: number }>;
            const latest = rows.sort((a, b) => b.startedAt - a.startedAt)[0];
            resolve(latest?.itemIds ?? []);
          };
          request.onerror = () => resolve([]);
        };
        open.onerror = () => resolve([]);
      }),
  );

  expect(queue.length).toBeGreaterThan(0);
  const kana = queue.filter((id) => id.startsWith('ja:kana:'));
  // Half the new-item budget, not all of it. Taking every slot would be three
  // weeks of alphabet before the first real word — the fixed lesson order §1
  // names as a non-goal. Taking none is what the app did before.
  expect(kana.length, 'the session should teach characters').toBeGreaterThan(0);
  expect(
    queue.length - kana.length,
    'and share the budget with the rest of the session',
  ).toBeGreaterThan(0);
});

/**
 * The user's report, verbatim: *"there is fixing sentence in hiragana, how can a
 * complete beginner do that even though the skill level is really from 0."*
 *
 * They could not. §2.9's drills are written in Japanese and the composer chose
 * them by Elo difficulty alone, with no check that the learner could read the
 * script — so a first session offered `きのうのえいがは おもしろいでした。` and
 * asked for a correction from someone who had not been taught one character.
 *
 * Getting that wrong teaches them the app is unfair, not adjective conjugation.
 */
test('a beginner is never asked to fix a sentence they cannot read', async ({ page }) => {
  test.setTimeout(120_000);
  await firstRun(page);
  await page.getByRole('button', { name: /Bahasa Jepang/ }).click();
  await waitForJapanese(page);

  await page.getByTestId('practise').click();
  await expect(page.getByTestId('session-progress')).toBeVisible({ timeout: 30_000 });

  // Read the plan rather than the screen: the claim is about what the composer
  // was willing to schedule, and every drill in it has to clear the gate.
  const drills = await page.evaluate(
    () =>
      new Promise<string[]>((resolve) => {
        const open = indexedDB.open('linguaku');
        open.onsuccess = () => {
          const request = open.result.transaction(['sessions']).objectStore('sessions').getAll();
          request.onsuccess = () => {
            const rows = request.result as Array<{ itemIds: string[]; startedAt: number }>;
            const latest = rows.sort((a, b) => b.startedAt - a.startedAt)[0];
            // Every id in the queue; which are drills is decided below, by
            // looking them up in the pack. An earlier version filtered on a
            // `drill:` prefix that does not exist, so it checked nothing.
            resolve(latest?.itemIds ?? []);
          };
          request.onerror = () => resolve([]);
        };
        open.onerror = () => resolve([]);
      }),
  );

  // Nothing Japanese is readable on day one, so any drill that survives must be
  // answerable without reading Japanese at all — the Indonesian multiple
  // choices about script and word order, which are exactly where a beginner
  // should start.
  const unreadable = await page.evaluate(
    (ids) =>
      fetch('/content/ja/contrastive.json')
        .then((response) => response.json() as Promise<{ categories: Array<{ drills: Array<{ id: string; prompt: string; options?: string[]; answer: string }> }> }>)
        .then((pack) => {
          const byId = new Map(
            pack.categories.flatMap((category) => category.drills.map((drill) => [drill.id, drill])),
          );
          const japanese = /[ぁ-ゟ゠-ヿ一-鿿]/;
          return ids
            .map((id) => byId.get(id))
            .filter((drill) => drill !== undefined)
            .filter((drill) =>
              japanese.test([drill.prompt, ...(drill.options ?? []), drill.answer].join('')),
            )
            .map((drill) => drill.id);
        }),
    drills,
  );

  expect(unreadable, 'no drill should need Japanese a beginner has not been taught').toEqual([]);
});
