import { expect, test } from '@playwright/test';
import { firstRun, openFromSettings } from './helpers.ts';

/**
 * Risk R1's device matrix is manual by nature — but the *screen* that collects
 * it is not, and a screen that cannot reach a verdict on a headless browser
 * with no speech engine would be useless on exactly the phone it is for.
 *
 * Chromium under Playwright has no TTS engine, so this run is the silent-device
 * case: the probes must finish, say so plainly, and produce a report that can
 * be pasted into docs/DECISIONS.md.
 */
test('the device report reaches a verdict on a device with no voices', async ({ page }) => {
  await firstRun(page);

  await openFromSettings(page, 'diagnostics-open');
  await page.getByTestId('diagnostics-run').click();

  // Both languages get their own answer. One verdict for the app would let an
  // English voice vouch for Japanese, which is the v1.0.1 bug (D29).
  await expect(page.getByTestId('diagnostics-voice-en')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('diagnostics-voice-ja')).toBeVisible();

  // Nothing was rescued, because nothing here can speak.
  await expect(page.getByTestId('diagnostics-adopted-en')).toHaveCount(0);

  const report = await page.getByTestId('diagnostics-report').inputValue();
  expect(report.startsWith('|')).toBe(true);
  expect(report).toContain('probe deadline used');
  // The report is about the device, never about the learner: no answers, no
  // history, nothing that could identify a person beyond the user agent.
  expect(report).not.toContain('profile');
});

test('a silent device still says so on the home screen after the check', async ({ page }) => {
  await firstRun(page);
  await openFromSettings(page, 'diagnostics-open');
  await page.getByTestId('diagnostics-run').click();
  await expect(page.getByTestId('diagnostics-voice-en')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('diagnostics-back').click();
  // Back lands on settings, one tap from home rather than past it.
  await page.getByRole('button', { name: 'Selesai' }).click();

  // SPEC §2.6: withheld and named, never faked.
  await expect(page.getByTestId('audio-status')).toContainText('belum bisa mengeluarkan suara');
});
