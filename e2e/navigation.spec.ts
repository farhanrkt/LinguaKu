import { expect, test } from '@playwright/test';
import { answerOne, firstRun } from './helpers.ts';

/**
 * The back gesture is how this audience leaves a screen on Android. The app
 * never touched the History API, so Back from Settings, Progress, the reader
 * or a session left the app entirely.
 */
test('Back returns to the screen a learner came from', async ({ page }) => {
  await firstRun(page);
  await page.getByTestId('settings-open').click();
  await expect(page.getByTestId('offline-status')).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId('practise')).toBeVisible();

  await page.getByTestId('progress-open').click();
  await page.getByTestId('glossary-open').click();
  await expect(page.getByTestId('glossary-search')).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId('learning-path')).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId('practise')).toBeVisible();
});

test('Back from a session keeps every answer and offers to resume', async ({ page }) => {
  await firstRun(page);
  await page.getByTestId('practise').click();
  await expect(page.getByTestId('session-progress')).toBeVisible({ timeout: 15_000 });
  await answerOne(page);
  await page.goBack();
  await expect(page.getByTestId('practise')).toHaveText(/Lanjutkan/, { timeout: 15_000 });
});
