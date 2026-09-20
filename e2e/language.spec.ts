import { expect, test } from '@playwright/test';
import { answerOne, firstRun, leaveSession } from './helpers.ts';

/**
 * Switching the target language switches everything that hangs off it.
 *
 * `targets[0]` is the language being taught — content, item queue, drills,
 * ability estimate and speech probe all read it — so the home screen's language
 * control has to move it, and the state derived from it has to be recomputed.
 *
 * Reported from the live v1.0.0 build: choosing the other language while a
 * session was open resumed the *old* language's session, and the first-time
 * skill check never appeared for the newly chosen language.
 */

test('choosing the other language switches what is being taught', async ({ page }) => {
  await firstRun(page);
  await expect(page.getByTestId('learning-label')).toHaveText(/Inggris/);

  await page.getByRole('button', { name: /Bahasa Jepang/ }).click();

  await expect(page.getByTestId('learning-label')).toHaveText(/Jepang/);
  await expect(page.getByTestId('learning-label')).not.toHaveText(/Inggris/);
});

test('an unfinished session does not follow the learner into the other language', async ({
  page,
}) => {
  await firstRun(page);
  await page.getByTestId('practise').click();
  await expect(page.getByTestId('session-progress')).toBeVisible({ timeout: 15_000 });
  await answerOne(page);
  await leaveSession(page);

  // The English session is now open and resumable.
  await expect(page.getByTestId('practise')).toHaveText(/Lanjutkan latihan/);

  await page.getByRole('button', { name: /Bahasa Jepang/ }).click();

  // Japanese has no session of its own, so the button offers a fresh one rather
  // than continuing an English queue under a Japanese heading.
  await expect(page.getByTestId('practise')).not.toHaveText(/Lanjutkan latihan/);

  // ...and switching back finds the English session exactly where it was left.
  await page.getByRole('button', { name: /Bahasa Inggris/ }).click();
  await expect(page.getByTestId('practise')).toHaveText(/Lanjutkan latihan/);
});

test('the skill check is offered again for a language that has never been placed', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Bahasa Inggris/ }).click();
  await page.getByRole('button', { name: '4 menit' }).click();
  await page.getByRole('button', { name: 'Mulai', exact: true }).click();

  // Take the English placement rather than skipping it.
  await page.getByTestId('placement-start').click({ timeout: 20_000 });
  for (let i = 0; i < 30; i++) {
    if (await page.getByTestId('placement-result').isVisible().catch(() => false)) break;
    await page.getByTestId('placement-dont-know').click();
  }
  await page.getByRole('button', { name: 'Mulai latihan' }).click();

  // English is placed, so the offer is gone.
  await expect(page.getByTestId('placement-offer')).toHaveCount(0);

  // Japanese has never been placed. Hiding the offer here would leave a
  // first-time Japanese learner with no way to be placed at all (D25).
  await page.getByRole('button', { name: /Bahasa Jepang/ }).click();
  await expect(page.getByTestId('placement-offer')).toBeVisible();
});
