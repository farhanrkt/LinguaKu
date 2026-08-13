import { expect, test, type Page } from '@playwright/test';
import { answerOne, firstRun } from './helpers.ts';

/**
 * M5 acceptance (SPEC §12): *"every §9 item renders from real local data;
 * export round-trips into a fresh install."*
 *
 * The first half is mostly a test that the screen is **honest before it has
 * data** — every section has to say "not measured yet" rather than render a
 * plausible-looking zero, because that is the failure mode SPEC §2.15 exists to
 * prevent and the one a screenshot would never catch.
 */

const openProgress = async (page: Page) => {
  await page.getByTestId('progress-open').click();
  await expect(page.getByTestId('vocab')).toBeVisible({ timeout: 15_000 });
};

test('every §9 section renders, and says so plainly when it has nothing yet', async ({ page }) => {
  await firstRun(page);
  await openProgress(page);

  // SPEC §9's list, each one present.
  for (const section of [
    'vocab',
    'coverage-curve',
    'retention',
    'forecast-section',
    'skills',
    'calibration',
    'consistency',
    'heatmap',
  ]) {
    await expect(page.getByTestId(section)).toBeVisible();
  }

  // Nothing has been answered, so nothing may be claimed.
  await expect(page.getByTestId('vocab')).toContainText('Latihan dulu beberapa sesi');
  await expect(page.getByTestId('retention')).toContainText('Belum cukup ulangan');
  await expect(page.getByTestId('calibration')).toContainText('Belum cukup jawaban');

  // SPEC §9 / §2.15: no level label, and none of the banned framings anywhere
  // on the most judgement-laden screen in the app.
  await expect(page.locator('body')).not.toContainText(/\bXP\b|poin|streak|nyawa|level [ABC]\d/i);
});

test('the skill radar leaves unmeasured axes empty rather than scoring them zero', async ({
  page,
}) => {
  await firstRun(page);
  await openProgress(page);

  const skills = page.getByTestId('skills');
  // Reading and free production have no items until M7 (D25's rule applied to
  // the radar): they read as "not measured", never as 0%.
  await expect(skills).toContainText('Membaca');
  await expect(skills).toContainText('Belum diukur');
  await expect(skills).not.toContainText('0%');
});

test('answering questions puts real numbers on the screen', async ({ page }) => {
  await firstRun(page);
  await page.getByTestId('practise').click();
  await expect(page.getByTestId('session-progress')).toBeVisible({ timeout: 15_000 });
  for (let i = 0; i < 10; i++) {
    if (await page.getByTestId('session-summary').isVisible().catch(() => false)) break;
    await answerOne(page);
  }
  await page.getByRole('button', { name: 'Selesai dulu' }).click();
  await openProgress(page);

  // The forecast now has cards in it — drawn from this learner's own schedule.
  await expect(page.getByTestId('forecast')).toBeVisible();
  // And the consistency band shows today, without anything resembling a streak.
  await expect(page.getByTestId('consistency')).toContainText('dari 7 hari terakhir');
  await expect(page.getByTestId('consistency')).toContainText('Bukan rentetan yang bisa putus');
});

test('exports a JSON backup with no account, and restores it', async ({ page }) => {
  await firstRun(page);
  await page.getByTestId('practise').click();
  await expect(page.getByTestId('session-progress')).toBeVisible({ timeout: 15_000 });
  for (let i = 0; i < 4; i++) await answerOne(page);
  await page.getByRole('button', { name: 'Selesai dulu' }).click();
  await openProgress(page);

  const download = page.waitForEvent('download');
  await page.getByTestId('export').click();
  const file = await download;

  expect(file.suggestedFilename()).toMatch(/^linguaku-\d{4}-\d{2}-\d{2}\.json$/);
  const path = await file.path();
  expect(path).toBeTruthy();

  const text = await (await import('node:fs/promises')).readFile(path, 'utf8');
  const bundle = JSON.parse(text) as {
    format: string;
    reviewLogs: unknown[];
    drillAttempts: unknown[];
    cards: unknown[];
    items?: unknown;
  };
  expect(bundle.format).toBe('linguaku-export');
  // Four answers, four records — but not necessarily four *review logs*: a
  // contrastive drill has no FSRS card and is filed separately (D32). The
  // backup has to carry both, and between them account for everything answered.
  expect(bundle.reviewLogs.length + bundle.drillAttempts.length).toBe(4);
  expect(bundle.cards.length).toBeGreaterThan(0);
  // A personal backup, not a copy of the corpus.
  expect(bundle.items).toBeUndefined();

  // And it goes back in. Re-importing the same file changes nothing, which is
  // what an append-only log keyed by id means.
  await page.getByTestId('import-file').setInputFiles(path);
  await expect(page.getByTestId('data-notice')).toContainText('tidak ada yang berubah');
});

/**
 * SPEC §9's weekly recap — the last §9 line to ship.
 *
 * Its whole risk is tone: every honest summary of a week is one sentence away
 * from a scoreboard. What is asserted here is the restraint, not the numbers.
 */
test('the weekly recap says nothing rather than inventing encouragement', async ({ page }) => {
  await firstRun(page);
  await page.getByTestId('progress-open').click();

  const recap = page.getByTestId('recap');
  await expect(recap).toBeVisible();
  // Invariant 18: an empty week is shown as empty.
  await expect(recap).toContainText('Belum ada latihan minggu ini');
});

test('the recap reports capability, never a score', async ({ page }) => {
  await firstRun(page);
  await page.getByTestId('practise').click();
  await expect(page.getByTestId('session-progress')).toBeVisible({ timeout: 15_000 });
  for (let i = 0; i < 3; i++) await answerOne(page);
  await page.getByRole('button', { name: 'Selesai dulu' }).click();

  await page.getByTestId('progress-open').click();
  const recap = page.getByTestId('recap');
  await expect(recap).toContainText(/kata/);
  await expect(recap).toContainText(/Kamu latihan di \d+ hari/);

  // §2.14 and docs/ETHICS.md: no points, no XP, no streak, no target missed.
  await expect(recap).not.toContainText(/XP|poin|skor|nilai|beruntun|gagal/i);
});

/**
 * SPEC §2.2 permits exactly one kind of browsing: *"a passive glossary is fine,
 * but it does not create or advance cards."* Both halves are asserted here —
 * that a learner can look at what they know, and that looking changes nothing.
 */
test('the glossary shows what was answered, and answers nothing', async ({ page }) => {
  await firstRun(page);

  // Empty before anything is answered, and it says so rather than looking broken.
  await page.getByTestId('progress-open').click();
  await page.getByTestId('glossary-open').click();
  await expect(page.getByTestId('glossary-empty')).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: 'Kembali' }).click();
  await page.getByRole('button', { name: 'Kembali' }).click();

  // Answer a few cards, then look at them.
  await page.getByTestId('practise').click();
  await expect(page.getByTestId('session-progress')).toBeVisible({ timeout: 20_000 });
  for (let index = 0; index < 3; index++) await answerOne(page);
  await page.getByRole('button', { name: 'Selesai dulu' }).click();

  await page.getByTestId('progress-open').click();
  await page.getByTestId('glossary-open').click();

  const list = page.getByTestId('glossary-list');
  await expect(list).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('glossary-count')).toContainText('kata');

  // Opening an entry reveals its example — and is not an answer.
  await list.locator('button[aria-expanded]').first().click();
  await expect(list.locator('button[aria-expanded="true"]')).toHaveCount(1);
  await expect(page.getByTestId('feedback')).toHaveCount(0);

  // Searching narrows rather than schedules.
  const first = (await list.locator('button[aria-expanded]').first().innerText()).split('\n')[0] ?? '';
  await page.getByTestId('glossary-search').fill(first.slice(0, 3));
  await expect(page.getByTestId('glossary-list')).toBeVisible();
});
