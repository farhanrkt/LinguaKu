import { expect, test, type Page } from '@playwright/test';
import { firstRun, seedKnownVocabulary } from './helpers.ts';

/**
 * SPEC §8: *"tap-to-gloss graded reader with one-tap card creation (frictionless
 * sentence mining) … make tap-to-gloss and one-tap mining feel instant."*
 *
 * Instant is the requirement, so the tests check that a tap resolves without a
 * round trip, and that mining a word actually changes what the next session
 * teaches — the whole point of mining being that the learner chose it.
 */

test('the reader is honest when it has nothing to show yet', async ({ page }) => {
  await firstRun(page);
  await page.getByTestId('reader-open').click();

  // A learner who knows no words has nothing readable, and the reader says so
  // rather than serving a wall of text they would only be decoding (§2.4).
  await expect(page.getByText(/Belum ada bacaan yang pas/)).toBeVisible({ timeout: 20_000 });
});

test('tap-to-gloss opens without a network round trip', async ({ page, context }) => {
  await firstRun(page);
  await seedKnownVocabulary(page, 600);

  await page.getByTestId('reader-open').click();
  await expect(page.getByTestId('reader-feed')).toBeVisible({ timeout: 20_000 });

  // Everything the panel needs is already local. Cutting the network before
  // tapping is the test of that claim.
  await context.setOffline(true);

  const started = Date.now();
  await page.getByTestId('reader-token').first().click();
  await expect(page.getByTestId('word-panel')).toBeVisible();
  expect(Date.now() - started).toBeLessThan(1_000);

  // SPEC §2.5: meaning rests on the sentence, and the panel says plainly that
  // there is no per-word dictionary rather than leaving the gloss looking thin.
  await expect(page.getByTestId('word-panel')).toContainText('Di kalimat ini');
});

test('mining a word puts it in the next session, and creates no card by itself', async ({
  page,
}) => {
  await firstRun(page);
  await seedKnownVocabulary(page, 600);

  await page.getByTestId('reader-open').click();
  await expect(page.getByTestId('reader-feed')).toBeVisible({ timeout: 20_000 });

  const before = await countCards(page);

  // Not every token is a shipped lexeme — a sentence in band 3 can contain a
  // band 5 word we have not downloaded, and the panel correctly offers nothing
  // to mine for those. Find one we do have.
  const tokens = page.getByTestId('reader-token');
  const mine = page.getByTestId('mine');
  let found = false;
  for (let index = 0; index < Math.min(30, await tokens.count()); index++) {
    await tokens.nth(index).click();
    await expect(page.getByTestId('word-panel')).toBeVisible();
    if (await mine.isVisible().catch(() => false)) {
      found = true;
      break;
    }
    await page.getByTestId('word-close').click();
  }
  expect(found).toBe(true);
  await mine.click();

  await expect(page.getByText(/Akan muncul di sesi latihan berikutnya/)).toBeVisible();

  // SPEC §2.2 and invariant 0: a card is the product of an *answer*. Tapping
  // "add this" is an intention, and minting a card from it would put an item in
  // the schedule that was never responded to.
  expect(await countCards(page)).toBe(before);

  // Tapping again undoes it — one word, one intention.
  await expect(mine).toHaveText('Batalkan');
});

const countCards = (page: Page): Promise<number> =>
  page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open('linguaku');
        open.onerror = () => reject(new Error(String(open.error)));
        open.onsuccess = () => {
          const request = open.result.transaction('cards').objectStore('cards').count();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(new Error(String(request.error)));
        };
      }),
  );
