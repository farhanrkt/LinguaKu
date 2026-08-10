import { expect, test, type Page } from '@playwright/test';

/**
 * SPEC §4.2: placement is ≤90 seconds, ≤25 items, and **skippable**. The
 * skippable part is the one worth an end-to-end test — a placement that has
 * quietly become mandatory is an onboarding wall (§10), and that is easy to
 * regress without noticing.
 */

const firstRun = async (page: Page) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Bahasa Inggris/ }).click();
  await page.getByRole('button', { name: '4 menit' }).click();
  await page.getByRole('button', { name: 'Mulai', exact: true }).click();
};

test('is offered right after first run, not before it', async ({ page }) => {
  await page.goto('/');
  // The language choice comes first; nothing gates it.
  await expect(page.getByTestId('placement-start')).toHaveCount(0);

  await firstRun(page);
  await expect(page.getByTestId('placement-start')).toBeVisible({ timeout: 15_000 });
});

test('can be skipped, and skipping costs nothing', async ({ page }) => {
  await firstRun(page);
  await page.getByTestId('placement-skip').click();

  await expect(page.getByRole('heading', { name: 'Halo!' })).toBeVisible();
  await page.getByTestId('practise').click();
  await expect(page.getByTestId('session-progress')).toBeVisible({ timeout: 20_000 });
});

test('stays offered on the home screen until it is taken', async ({ page }) => {
  await firstRun(page);
  await page.getByTestId('placement-skip').click();
  await expect(page.getByTestId('placement-offer')).toBeVisible();

  await page.reload();
  await expect(page.getByTestId('placement-offer')).toBeVisible();
});

test('runs adaptively and reports a band, never a bare level', async ({ page }) => {
  await firstRun(page);
  await page.getByTestId('placement-start').click();

  let answered = 0;
  const started = Date.now();
  while (answered < 30) {
    if (await page.getByTestId('placement-result').isVisible().catch(() => false)) break;
    await expect(page.getByTestId('placement-word')).toBeVisible({ timeout: 10_000 });
    // Claim to know everything: the extreme that a naive estimator diverges on.
    await page.getByTestId('placement-know').click();
    answered++;
  }

  await expect(page.getByTestId('placement-result')).toBeVisible();
  expect(answered, 'placement must respect the 25-item cap').toBeLessThanOrEqual(25);
  expect(Date.now() - started).toBeLessThan(90_000);

  // SPEC §2.15: an estimate, framed as an estimate.
  await expect(page.locator('body')).toContainText(/perkiraan/i);
  // And having claimed every pseudoword, the app should say so.
  await expect(page.locator('body')).toContainText(/bukan bahasa Inggris/i);
});

test('a taken placement stops being offered', async ({ page }) => {
  await firstRun(page);
  await page.getByTestId('placement-start').click();

  for (let i = 0; i < 30; i++) {
    if (await page.getByTestId('placement-result').isVisible().catch(() => false)) break;
    await page.getByTestId('placement-dont-know').click();
  }
  await page.getByRole('button', { name: 'Mulai latihan' }).click();

  await expect(page.getByRole('heading', { name: 'Halo!' })).toBeVisible();
  await expect(page.getByTestId('placement-offer')).toHaveCount(0);
});
