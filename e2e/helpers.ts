import { expect, type Page } from '@playwright/test';

/**
 * Completes first run and lands on the home screen.
 *
 * Placement is offered immediately after the language choice (SPEC §4.2), so
 * every test that wants the home screen has to decline it — which is itself a
 * small check that declining works.
 */
export const firstRun = async (page: Page): Promise<void> => {
  await page.goto('/');
  await page.getByRole('button', { name: /Bahasa Inggris/ }).click();
  await page.getByRole('button', { name: '4 menit' }).click();
  await page.getByRole('button', { name: 'Mulai', exact: true }).click();

  await page.getByTestId('placement-skip').click({ timeout: 20_000 });
  await expect(page.getByTestId('practise')).toBeEnabled();
};

/**
 * Answers whatever is on screen and advances past the feedback.
 *
 * A session queue holds two kinds of entry since M4 — lexeme cards and
 * contrastive drills (SPEC §3.3) — so the helper has to recognize both.
 * Correctness is never what these tests are checking; getting through the
 * session is.
 */
export const answerOne = async (page: Page): Promise<void> => {
  const progress = page.getByTestId('session-progress');
  const before = await progress.textContent();

  const confirm = page.getByRole('button', { name: 'Oke, paham' });
  const input = page.getByRole('textbox');
  const drillSubmit = page.getByRole('button', { name: 'Jawab' });

  if (await confirm.isVisible().catch(() => false)) {
    await confirm.click();
  } else if (await input.isVisible().catch(() => false)) {
    await input.fill('jawaban');
    // A drill submits with "Jawab"; a cloze or dictation submits with the
    // confidence tap (SPEC §2.12), which is also the submit button.
    if (await drillSubmit.isVisible().catch(() => false)) {
      await drillSubmit.click();
    } else {
      await page.getByRole('button', { name: 'Yakin', exact: true }).click();
    }
  } else {
    // Multiple choice, whether a recognition card or a drill: any option
    // submits. `aria-pressed` is what an OptionCard is, and nothing else.
    await page.locator('button[aria-pressed]').first().click();
  }

  await expect(page.getByTestId('feedback')).toBeVisible();
  await page.getByTestId('next').click();

  // Wait for the counter to move before touching anything again. Probing which
  // control is on screen while the next card is still being built reads the old
  // one, which is how this helper used to race the app.
  await expect(async () => {
    if (await page.getByTestId('session-summary').isVisible().catch(() => false)) return;
    // Short, catching read: on the last item the counter disappears for good as
    // the summary takes over, and a blocking `textContent()` would sit inside
    // this predicate waiting for an element that is never coming back.
    const now = await progress.textContent({ timeout: 1_000 }).catch(() => null);
    expect(now !== null && now !== before).toBe(true);
  }).toPass({ timeout: 15_000, intervals: [50, 100, 200] });
};

/** Waits for the service worker to control the page and finish precaching. */
export const waitForOfflineReady = async (page: Page): Promise<void> => {
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, {
    timeout: 30_000,
  });
  await expect(page.getByTestId('offline-status')).toHaveText('Siap dipakai offline');
};
