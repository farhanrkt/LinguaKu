import { expect, test } from '@playwright/test';
import { firstRun } from './helpers.ts';

/**
 * SPEC §2.13 — the implementation intention and its reminder.
 *
 * The `Habit` row existed in the schema from M0 and nothing ever wrote it; this
 * is the milestone that makes §2.13 real rather than scheduled. What these
 * tests hold is the part that is easy to get wrong: the plan is the learner's
 * own words, skipping costs nothing, and the app never claims a reminder it
 * cannot deliver.
 */

test('the habit plan is offered, never enforced', async ({ page }) => {
  await firstRun(page);
  await page.getByTestId('habit-open').click();

  await expect(page.getByTestId('habit-sentence')).toBeVisible();
  await page.getByTestId('habit-skip').click();

  // Skipping returns to a fully working home screen with nothing withheld.
  await expect(page.getByTestId('practise')).toBeEnabled();
});

test('the learner writes the plan in their own words, and it persists', async ({ page }) => {
  await firstRun(page);
  await page.getByTestId('habit-open').click();

  await page.getByTestId('habit-cue').fill('makan malam');
  await page.getByTestId('habit-place').fill('kamar');
  await page.getByTestId('habit-time').fill('20:00');
  await page.getByTestId('habit-save').click();

  await expect(page.getByTestId('practise')).toBeEnabled();

  // Reopening shows what they wrote rather than an empty form.
  await page.getByTestId('habit-open').click();
  await expect(page.getByTestId('habit-cue')).toHaveValue('makan malam');
  await expect(page.getByTestId('habit-place')).toHaveValue('kamar');
  await expect(page.getByTestId('habit-time')).toHaveValue('20:00');

  // And it survives a cold start, because it is a row, not component state.
  await page.reload();
  await expect(page.getByTestId('practise')).toBeEnabled();
  await page.getByTestId('habit-open').click();
  await expect(page.getByTestId('habit-cue')).toHaveValue('makan malam');
});

test('cannot be saved half-written', async ({ page }) => {
  await firstRun(page);
  await page.getByTestId('habit-open').click();

  // An intention with a cue and no place is not an implementation intention.
  await expect(page.getByTestId('habit-save')).toBeDisabled();
  await page.getByTestId('habit-cue').fill('makan malam');
  await expect(page.getByTestId('habit-save')).toBeDisabled();
  await page.getByTestId('habit-place').fill('kamar');
  await expect(page.getByTestId('habit-save')).toBeEnabled();
});

/**
 * SPEC §2.6's rule, applied to notifications: name the capability rather than
 * implying more than the device has. Chromium in CI has no `TimestampTrigger`,
 * so the screen must say the reminder is in-app only — never promise one that
 * fires with the app closed.
 */
test('says plainly what this device can actually do', async ({ page }) => {
  await firstRun(page);
  await page.getByTestId('habit-open').click();

  const support = page.getByTestId('habit-support');
  await expect(support).toBeVisible();
  await expect(support).toContainText(/aplikasinya tertutup|tidak punya pengingat/);
});

test('the in-app cue appears once the time has passed, and never accuses', async ({ page }) => {
  await firstRun(page);
  await page.getByTestId('habit-open').click();

  // A cue time already past today, so the next open is due.
  await page.getByTestId('habit-cue').fill('sarapan');
  await page.getByTestId('habit-place').fill('dapur');
  await page.getByTestId('habit-time').fill('00:01');
  await page.getByTestId('habit-save').click();
  // Wait for the save to land us back on home before reloading — otherwise the
  // reload races the write and the habit is never persisted.
  await expect(page.getByTestId('habit-open')).toBeVisible();

  await page.reload();
  await expect(page.getByTestId('practise')).toBeEnabled();

  const banner = page.getByTestId('habit-cue-banner');
  await expect(banner).toBeVisible();
  // Their words, back to them — and an invitation, not a reprimand.
  await expect(banner).toContainText('sarapan');
  await expect(page.locator('body')).not.toContainText(/gagal|jangan|harus/i);

  // And it can always be waved off.
  await page.getByTestId('habit-cue-dismiss').click();
  await expect(page.getByTestId('habit-cue-dismiss')).toHaveCount(0);
});
