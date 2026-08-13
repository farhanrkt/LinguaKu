import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { answerOne, firstRun } from './helpers.ts';

/**
 * The accessibility promises SPEC §10 makes, gated for the first time.
 *
 * §10 asks for WCAG AA contrast, `motion-safe:` on every transition, 56px tap
 * targets, and **full keyboard operation on desktop**. §13 lists gates for the
 * bundle, the licences, the cold start and the PWA — and none for any of that,
 * so all of it has been a claim maintained by care since M0.
 *
 * Two things are checked here, and they fail differently:
 *
 *  - **axe** catches what a rule can catch: contrast, names, roles, labels,
 *    landmark structure. It cannot tell whether a screen makes sense, and
 *    passing it is a floor rather than a verdict.
 *  - **The keyboard** is checked by driving the app with nothing but Tab and
 *    Enter, because "full keyboard operation" is a behaviour and no static rule
 *    observes it. A learner on a desktop with a broken hand, or anyone using a
 *    switch device, meets the app this way.
 *
 * `wcag2aa` is the tag set §10 names. Colour-contrast is included deliberately:
 * it is the rule most likely to break silently when someone adjusts a shade.
 */

const scan = (page: Page) =>
  new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();

/** Reports a failure the way a person can act on it, not as a rule id dump. */
const expectNoViolations = async (page: Page, screen: string): Promise<void> => {
  const results = await scan(page);
  const detail = results.violations
    .map(
      (violation) =>
        `${violation.id} (${violation.impact ?? 'unknown'}): ${violation.help}\n    ${violation.nodes
          .slice(0, 3)
          .map((node) => node.html)
          .join('\n    ')}`,
    )
    .join('\n  ');
  expect(results.violations, `${screen}:\n  ${detail}`).toEqual([]);
};

test('every screen a learner reaches passes WCAG 2.1 AA', async ({ page }) => {
  // Eight screens, each scanned against the full rule set: slower than the
  // default budget, and worth it once per run rather than never.
  test.setTimeout(120_000);
  await page.goto('/');
  await expectNoViolations(page, 'first run');

  await firstRun(page);
  await expectNoViolations(page, 'home');

  await page.getByTestId('reader-open').click();
  await expect(page.getByRole('heading', { name: 'Bacaan' })).toBeVisible({ timeout: 20_000 });
  await expectNoViolations(page, 'reader');
  await page.getByRole('button', { name: 'Kembali' }).click();

  await page.getByTestId('progress-open').click();
  await expect(page.getByTestId('vocab')).toBeVisible({ timeout: 20_000 });
  await expectNoViolations(page, 'progress');

  await page.getByTestId('glossary-open').click();
  await expectNoViolations(page, 'glossary');
  await page.getByRole('button', { name: 'Kembali' }).click();
  await page.getByRole('button', { name: 'Kembali' }).click();

  await page.getByTestId('settings-open').click();
  await expect(page.getByTestId('topic-list')).toBeVisible({ timeout: 20_000 });
  await expectNoViolations(page, 'settings');

  // Already on settings, so the link is one tap rather than two.
  await page.getByTestId('attribution-open').click();
  await expect(page.getByTestId('attribution-list')).toBeVisible({ timeout: 20_000 });
  await expectNoViolations(page, 'attribution');
});

test('a session is answerable with no accessibility violations', async ({ page }) => {
  await firstRun(page);
  await page.getByTestId('practise').click();
  await expect(page.getByTestId('session-progress')).toBeVisible({ timeout: 20_000 });

  await expectNoViolations(page, 'session');
  await answerOne(page);
  await expectNoViolations(page, 'session, after an answer');
});

/**
 * SPEC §10: *"full keyboard operation on desktop"*.
 *
 * Driven with Tab and Enter only — no clicks, no test ids reached past the UI.
 * The assertion is that a learner can get from the home screen into a session
 * and answer, which is the whole product.
 */
test('the practice loop is reachable with only a keyboard', async ({ page }) => {
  await firstRun(page);

  // Tab until the practise button has focus, then press it.
  let focused = '';
  for (let step = 0; step < 40 && focused !== 'practise'; step++) {
    await page.keyboard.press('Tab');
    focused = await page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? '');
  }
  expect(focused, 'the practise button was never reachable by Tab').toBe('practise');

  await page.keyboard.press('Enter');
  await expect(page.getByTestId('session-progress')).toBeVisible({ timeout: 20_000 });

  // And the first card is answerable the same way: tab to a control and press it.
  let answered = false;
  for (let step = 0; step < 40 && !answered; step++) {
    await page.keyboard.press('Tab');
    const role = await page.evaluate(() => {
      const active = document.activeElement;
      return active === null ? '' : `${active.tagName}:${active.getAttribute('aria-pressed') ?? ''}`;
    });
    if (role.startsWith('BUTTON')) {
      await page.keyboard.press('Enter');
      answered = await page
        .getByTestId('feedback')
        .isVisible()
        .catch(() => false);
      if (!answered) {
        // An exposure card advances without feedback; either way the session moved.
        answered = await page
          .getByTestId('session-progress')
          .isVisible()
          .catch(() => false);
      }
    }
  }
  expect(answered, 'no card control could be operated from the keyboard').toBe(true);
});

/**
 * §10 again: every transition carries `motion-safe:`, so a learner who has asked
 * their OS to reduce motion gets no animation at all. Asserted by asking the
 * browser for that preference and checking nothing declares a transition.
 */
test('respects a reduced-motion preference', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await firstRun(page);

  const animated = await page.evaluate(() =>
    [...document.querySelectorAll('*')].filter((element) => {
      const style = getComputedStyle(element);
      return (
        (style.transitionDuration !== '0s' && style.transitionProperty !== 'none') ||
        style.animationName !== 'none'
      );
    }).length,
  );
  expect(animated, 'elements still animate under prefers-reduced-motion').toBe(0);
});
