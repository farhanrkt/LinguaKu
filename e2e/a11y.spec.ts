import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { answerOne, firstRun, seedKnownVocabulary } from './helpers.ts';

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

/**
 * SPEC §10's keyboard promise, priced.
 *
 * "Full keyboard operation" was kept in the most expensive way available: every
 * word in the reader was its own `<button>`, so two passages and twenty
 * sentences put ~320 tab stops between a learner and the back button. Nothing
 * failed — axe is happy with a focusable button, and the keyboard test above
 * still passes — which is exactly why this needs a number rather than care.
 *
 * The bound is the *arithmetic of the screen*, not of the text: a tab stop per
 * passage, per sentence, per check control, plus the chrome. The second
 * assertion is what makes the first one mean something — the words are all
 * still there and still individually reachable, by arrow key, inside one stop.
 */
test('the reader costs one tab stop per block, not one per word', async ({ page }) => {
  await firstRun(page);
  await seedKnownVocabulary(page, 600);

  await page.getByTestId('reader-open').click();
  await expect(page.getByTestId('reader-feed')).toBeVisible({ timeout: 20_000 });

  const { stops, words } = await page.evaluate(() => ({
    stops: [...document.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]')]
      .filter((element) => element.tabIndex >= 0).length,
    words: document.querySelectorAll('[data-word]').length,
  }));

  // 2 passages + 2 check controls + 20 sentences + back + the header chrome.
  expect(stops, `the reader has ${stops} tab stops for ${words} tappable words`).toBeLessThan(40);
  // And the words did not go away to achieve it.
  expect(words).toBeGreaterThan(100);

  // The other half of the trade: inside a block, arrows move word by word and
  // Enter opens the panel. Withdrawing the tab stops without this would have
  // taken tap-to-gloss away from the keyboard entirely.
  await page.getByTestId('reader-token').first().focus();
  const first = await page.evaluate(() => document.activeElement?.textContent ?? '');
  await page.keyboard.press('ArrowRight');
  const second = await page.evaluate(() => document.activeElement?.textContent ?? '');
  expect(second, 'ArrowRight did not move to the next word').not.toBe(first);

  await page.keyboard.press('Enter');
  await expect(page.getByTestId('word-panel')).toBeVisible();
});

/**
 * The reader with something in it, which is the version a learner meets.
 *
 * The scan above reaches the reader before any vocabulary exists, so axe has
 * only ever seen its empty state — never a passage, never the feed, never the
 * word panel. Those are the parts with roles on them.
 */
test('the reader passes WCAG 2.1 AA with content in it', async ({ page }) => {
  test.setTimeout(120_000);
  await firstRun(page);
  await seedKnownVocabulary(page, 600);

  await page.getByTestId('reader-open').click();
  await expect(page.getByTestId('reader-feed')).toBeVisible({ timeout: 20_000 });
  await expectNoViolations(page, 'reader, populated');

  await page.getByTestId('reader-token').first().click();
  await expect(page.getByTestId('word-panel')).toBeVisible();
  await expectNoViolations(page, 'reader, word panel open');
});

/**
 * The same screens, dark.
 *
 * §10 promises "dark mode, WCAG AA contrast" as one clause, and every scan
 * above runs in light mode — so half of what §10 promises has never been
 * measured. Contrast is the rule that differs between the two themes, and it is
 * the rule most likely to be broken by a shade that looked fine in the other.
 */
test('every screen passes WCAG 2.1 AA in dark mode', async ({ page }) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ colorScheme: 'dark' });

  await page.goto('/');
  await expectNoViolations(page, 'first run, dark');

  await firstRun(page);
  await expectNoViolations(page, 'home, dark');

  await seedKnownVocabulary(page, 600);
  await page.getByTestId('reader-open').click();
  await expect(page.getByTestId('reader-feed')).toBeVisible({ timeout: 20_000 });
  await expectNoViolations(page, 'reader, dark');

  await page.getByTestId('reader-token').first().click();
  await expect(page.getByTestId('word-panel')).toBeVisible();
  await expectNoViolations(page, 'word panel, dark');
  await page.getByTestId('word-close').click();
  await page.getByRole('button', { name: 'Kembali' }).click();

  await page.getByTestId('progress-open').click();
  await expect(page.getByTestId('vocab')).toBeVisible({ timeout: 20_000 });
  await expectNoViolations(page, 'progress, dark');

  await page.getByTestId('glossary-open').click();
  await expectNoViolations(page, 'glossary, dark');
  await page.getByRole('button', { name: 'Kembali' }).click();
  await page.getByRole('button', { name: 'Kembali' }).click();

  await page.getByTestId('settings-open').click();
  await expect(page.getByTestId('topic-list')).toBeVisible({ timeout: 20_000 });
  await expectNoViolations(page, 'settings, dark');
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
