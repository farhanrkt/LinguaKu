import { expect, test } from '@playwright/test';
import { firstRun } from './helpers.ts';

/**
 * SPEC §4.3: *"script mode for Japanese (romaji → kana → kanji, with romaji
 * actively deprecated after kana fluency)"*.
 *
 * `Profile.scriptMode` has existed since M6. It was written at first run,
 * defaulted to `kana` for Japanese, and flipped when the learner added Japanese
 * — and **read by nothing and changeable by nobody**. `furiganaFor`, the whole
 * ladder plus §10's per-kanji fade, was called by no screen at all.
 *
 * This is the half that is deterministic enough to gate: the control exists,
 * it is Japanese-only, and it starts on the rung §4.3 says to start on.
 */

test('the Japanese script ladder is offered, and starts where §4.3 says', async ({ page }) => {
  await firstRun(page);

  // English has no ladder to climb, so there is nothing to offer.
  await expect(page.getByTestId('learning-label')).toHaveText(/Inggris/);
  await expect(page.getByTestId('script-mode')).toHaveCount(0);

  await page.getByRole('button', { name: /Bahasa Jepang/ }).click();
  await expect(page.getByTestId('learning-label')).toHaveText(/Jepang/);

  const ladder = page.getByTestId('script-mode');
  await expect(ladder).toBeVisible();

  // All three rungs, in the order they are climbed.
  const rungs = ladder.locator('button[aria-pressed]');
  await expect(rungs).toHaveCount(3);
  await expect(rungs.nth(0)).toContainText('Romaji');
  await expect(rungs.nth(1)).toContainText('Kana');
  await expect(rungs.nth(2)).toContainText('Kanji');

  // `defaultScriptMode` starts a Japanese learner at kana.
  await expect(rungs.nth(1)).toHaveAttribute('aria-pressed', 'true');
  await expect(rungs.nth(0)).toHaveAttribute('aria-pressed', 'false');

  // And it moves, which is the part that did not exist.
  await rungs.nth(2).click();
  await expect(rungs.nth(2)).toHaveAttribute('aria-pressed', 'true');

  // Wait for the write, not for the render: `handleChange` updates React state
  // first and persists after, so reloading on the rendered state alone races
  // the database and would make this test flaky rather than wrong.
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            new Promise<string>((resolve) => {
              const open = indexedDB.open('linguaku');
              open.onsuccess = () => {
                const request = open.result
                  .transaction(['profiles'])
                  .objectStore('profiles')
                  .getAll();
                request.onsuccess = () =>
                  resolve(
                    (request.result as Array<{ scriptMode: string }>)[0]?.scriptMode ?? 'none',
                  );
                request.onerror = () => resolve('none');
              };
              open.onerror = () => resolve('none');
            }),
        ),
      { timeout: 10_000 },
    )
    .toBe('kanji');

  await page.reload();
  await expect(page.getByTestId('script-mode').locator('button[aria-pressed]').nth(2)).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('the ladder goes away with the language it belongs to', async ({ page }) => {
  await firstRun(page);
  await page.getByRole('button', { name: /Bahasa Jepang/ }).click();
  await expect(page.getByTestId('script-mode')).toBeVisible();

  await page.getByRole('button', { name: /Bahasa Inggris/ }).click();
  await expect(page.getByTestId('script-mode')).toHaveCount(0);
});
