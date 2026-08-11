import { expect, test, type Page } from '@playwright/test';
import { answerOne, firstRun } from './helpers.ts';

/**
 * M4 acceptance (SPEC §12): wrong answers on tagged items produce an Indonesian
 * explanation, and the heatmap renders from real logs.
 *
 * "From real logs" is the part worth testing end to end — the screen must be
 * built from what this learner actually did on this device, which means the
 * empty state has to be honest before any drills are answered, and the numbers
 * have to appear only after they are.
 */

/** Answers whichever control the drill presents — MCQ options or a typed box. */
const answerDrill = async (page: Page): Promise<void> => {
  const input = page.getByRole('textbox');
  if (await input.isVisible().catch(() => false)) {
    await input.fill('jawaban');
    await page.getByRole('button', { name: 'Jawab' }).click();
  } else {
    await page.locator('button[aria-pressed]').first().click();
  }
};

/** Works through the session until a contrastive drill comes up. */
const advanceToDrill = async (page: Page, maxItems = 40): Promise<boolean> => {
  for (let i = 0; i < maxItems; i++) {
    if (await page.getByTestId('drill-prompt').isVisible().catch(() => false)) return true;
    if (await page.getByTestId('session-summary').isVisible().catch(() => false)) return false;
    await answerOne(page);
  }
  return false;
};

test('the heatmap starts honest: nothing measured, and it says so', async ({ page }) => {
  await firstRun(page);
  await page.getByTestId('progress-open').click();

  await expect(page.getByTestId('heatmap')).toBeVisible({ timeout: 15_000 });

  // SPEC §2.15: a learner who has answered nothing must not be shown scores.
  // Every category reads "not enough data yet" rather than a middling number,
  // and none is flagged as a weakness.
  const rows = page.getByTestId('heatmap').locator('li');
  expect(await rows.count()).toBeGreaterThanOrEqual(20);
  await expect(rows.first()).toContainText('Belum cukup data');
  await expect(page.getByTestId('heatmap-weakest')).toHaveCount(0);

  // And no banned framing anywhere on the most judgement-laden screen we have.
  await expect(page.locator('body')).not.toContainText(/\bXP\b|poin|streak|nyawa|gagal/i);
});

test('a drill explains itself in Indonesian, right or wrong', async ({ page }) => {
  await firstRun(page);
  await page.getByTestId('practise').click();
  await expect(page.getByTestId('session-progress')).toBeVisible({ timeout: 15_000 });

  // SPEC §7.2 reserves ~5% of every session for a contrastive drill, and a
  // learner with no measured categories has nothing but unexplored ones — so a
  // first session must contain at least one.
  expect(await advanceToDrill(page)).toBe(true);

  await answerDrill(page);

  // SPEC §2.9: the note names the Indonesian pattern, then the English one,
  // then shows a minimal pair.
  const note = page.getByTestId('contrastive-note');
  await expect(note).toBeVisible();
  await expect(note).toContainText('Di bahasa Indonesia');
  await expect(note).toContainText('Di bahasa Inggris');
  await expect(note).toContainText('Bandingkan');
});

test('answering drills is what puts numbers on the heatmap', async ({ page }) => {
  await firstRun(page);
  await page.getByTestId('practise').click();
  await expect(page.getByTestId('session-progress')).toBeVisible({ timeout: 15_000 });

  expect(await advanceToDrill(page)).toBe(true);
  await answerDrill(page);
  await expect(page.getByTestId('contrastive-note')).toBeVisible();
  await page.getByTestId('next').click();

  // Leave mid-session; the drill answer is already recorded.
  await page.getByRole('button', { name: 'Selesai dulu' }).click();
  await page.getByTestId('progress-open').click();

  await expect(page.getByTestId('heatmap')).toBeVisible({ timeout: 15_000 });
  // One answer is on record — and it is still not enough to claim a weakness,
  // which is the point (SPEC §2.15).
  await expect(page.getByText(/latihan pola tercatat/)).toBeVisible();
  await expect(page.getByTestId('heatmap-weakest')).toHaveCount(0);
});
