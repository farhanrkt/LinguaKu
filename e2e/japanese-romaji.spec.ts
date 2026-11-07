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

/**
 * Every Japanese text node on screen, with nothing that says it in romaji —
 * inline after it, in the same option, tile or list row, or in a romaji line
 * nearby. The two places the reading *is* the question are excused: a kana
 * recall card and a kanji reading card (D111).
 */
const bareJapanese = (page: Page) =>
  page.evaluate(() => {
    const RUN = /[぀-ヿ㐀-鿿\u{20000}-\u{2ffff}々〆ー]+/gu;
    const SOUNDLESS = /^[っッー、。？！・〜「」]+$/u;
    const ROMAJI_IDS = [
      'romaji-line', 'task-headword-romaji', 'feedback-romaji', 'word-romaji', 'kanji-said',
      'placement-romaji', 'glossary-romaji', 'kana-romaji', 'word-base',
    ];
    const shown = (el: Element): boolean => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
    };
    const latin = (text: string): boolean =>
      /[a-z]/u.test(text.replace(/[぀-ヿ㐀-鿿\u{20000}-\u{2ffff}]/gu, ''));
    const recall = document.querySelector('[data-testid="kana-input"]') !== null;
    const readingQuestion = document.querySelector('[data-testid="kanji-reading-input"]') !== null;
    const bare: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const text = node.textContent ?? '';
      const runs = [...text.matchAll(RUN)].filter((match) => !SOUNDLESS.test(match[0]));
      const el = node.parentElement;
      if (runs.length === 0 || !el || !shown(el) || el.closest('rt')) continue;
      if (recall && el.closest('[data-testid="kana-character"]')) continue;
      if (readingQuestion && el.closest('[data-testid="kanji-literal"]')) continue;
      // Said inline: every run has romaji after it in the same text.
      if (runs.every((match) => /(\(|dibaca\s*“?)\s*[a-zA-Z]/u.test(text.slice((match.index ?? 0) + match[0].length)))) continue;
      // Said in the same option, tile or row, or right beside it.
      const holder = el.closest('button, label, li');
      if (holder && latin((holder as HTMLElement).innerText)) continue;
      if (el.parentElement && /\(\s*[a-z]/u.test(el.parentElement.innerText)) continue;
      // Said by a romaji line close by.
      let scope: Element | null = el;
      let near = false;
      for (let depth = 0; depth < 4 && scope && !near; depth++, scope = scope.parentElement) {
        const host = scope;
        near = ROMAJI_IDS.some((id) => {
          const found = host.querySelector(`[data-testid="${id}"]`);
          return found !== null && shown(found);
        });
      }
      if (near) continue;
      const tagged = el.closest('[data-testid]')?.getAttribute('data-testid') ?? 'untagged';
      bare.push(`${tagged}: ${text.trim().slice(0, 60)}`);
    }
    return bare;
  });

/** Due cards at every rung, with the script known so drills unlock (D108). */
const seedEveryRung = (page: Page) =>
  page.evaluate(
    (now) =>
      new Promise<void>((resolve, reject) => {
        const specs = [
          { kind: 'kana', level: 1, count: 2, due: true },
          { kind: 'kanji', level: 1, count: 2, due: true },
          { kind: 'kanji', level: 2, count: 2, due: true },
          { kind: 'lexeme', level: 1, count: 3, due: true },
          { kind: 'lexeme', level: 2, count: 3, due: true },
          { kind: 'lexeme', level: 3, count: 2, due: true },
          { kind: 'lexeme', level: 5, count: 2, due: true },
          { kind: 'lexeme', level: 6, count: 2, due: true },
          { kind: 'chunk', level: 1, count: 2, due: true },
          { kind: 'kana', level: 3, count: 400, due: false },
          { kind: 'kanji', level: 3, count: 3000, due: false },
          { kind: 'lexeme', level: 3, count: 600, due: false },
        ];
        const open = indexedDB.open('linguaku');
        open.onerror = () => reject(new Error(String(open.error)));
        open.onsuccess = () => {
          const db = open.result;
          const read = db.transaction(['items', 'profiles']);
          const items = read.objectStore('items').getAll();
          const profiles = read.objectStore('profiles').getAll();
          read.oncomplete = () => {
            const profileId = (profiles.result[0] as { id: string }).id;
            const all = (items.result as Array<{ id: string; kind: string; lang: string; freqRank: number }>)
              .filter((item) => item.lang === 'ja')
              .sort((a, b) => a.freqRank - b.freqRank);
            const used = new Set<string>();
            const write = db.transaction(['cards', 'sessions'], 'readwrite');
            for (const spec of specs) {
              for (const item of all.filter((row) => row.kind === spec.kind && !used.has(row.id)).slice(0, spec.count)) {
                used.add(item.id);
                const dueAt = spec.due ? now - 60_000 : now + 30 * 86_400_000;
                write.objectStore('cards').put({
                  id: `${profileId}::${item.id}`,
                  profileId,
                  itemId: item.id,
                  ladderLevel: spec.level,
                  dueAt,
                  suspended: 0,
                  fsrs: {
                    dueAt, stability: spec.due ? 3 : 60, difficulty: 5, elapsedDays: 2, scheduledDays: 2,
                    learningSteps: 0, reps: 4, lapses: 0, state: 2, lastReviewAt: now - 2 * 86_400_000,
                  },
                });
              }
            }
            write.objectStore('sessions').clear();
            write.oncomplete = () => resolve();
            write.onerror = () => reject(new Error(String(write.error)));
          };
        };
      }),
    Date.now(),
  );

test('no Japanese text is shown without its romaji, on any card or verdict', async ({ page }) => {
  test.setTimeout(240_000);
  await firstRun(page);
  await switchLanguage(page, /Bahasa Jepang/);
  await seedJapaneseVocabulary(page);
  await seedEveryRung(page);
  await page.reload();
  await expect(page.getByTestId('practise')).toBeEnabled({ timeout: 30_000 });
  await toKanjiRung(page);

  const bare = new Set<string>();
  const check = async (where: string) => {
    for (const entry of await bareJapanese(page)) bare.add(`${where} → ${entry}`);
  };

  await check('home');
  await page.getByTestId('practise').click();
  const progress = page.getByTestId('session-progress');
  await expect(progress).toBeVisible({ timeout: 30_000 });
  for (let step = 0; step < 40; step++) {
    if (await page.getByTestId('session-summary').isVisible().catch(() => false)) break;
    await check(`card ${step}`);
    const before = await progress.textContent().catch(() => null);
    const confirm = page.getByRole('button', { name: 'Saya mengerti' });
    if (await confirm.isVisible().catch(() => false)) {
      await confirm.click();
    } else {
      if (await page.getByTestId('build-prompt').isVisible().catch(() => false)) {
        for (let tap = 0; tap < 24; tap++) {
          const tile = page.getByTestId('build-tile').first();
          if (!(await tile.isVisible().catch(() => false))) break;
          await tile.click();
        }
        await page.getByTestId('build-submit').click();
      } else if (await page.getByRole('textbox').first().isVisible().catch(() => false)) {
        await page.getByRole('textbox').first().fill('x');
        await page.getByRole('button', { name: /^(Jawab|Yakin|Kirim)$/ }).first().click();
        const anyway = page.getByRole('button', { name: 'Tetap kirim' });
        if (await anyway.isVisible().catch(() => false)) await anyway.click();
      } else {
        await page.locator('button[aria-pressed]').first().click();
      }
      await expect(page.getByTestId('feedback')).toBeVisible({ timeout: 15_000 });
      await check(`verdict ${step}`);
      await page.getByTestId('next').click();
    }
    await expect(async () => {
      if (await page.getByTestId('session-summary').isVisible().catch(() => false)) return;
      const now = await progress.textContent({ timeout: 1_000 }).catch(() => null);
      expect(now !== null && now !== before).toBe(true);
    }).toPass({ timeout: 15_000 });
  }

  expect([...bare], [...bare].join('\n')).toEqual([]);
});
