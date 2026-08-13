import { expect, test } from '@playwright/test';
import { firstRun } from './helpers.ts';

/**
 * SPEC §5.2 and the EDRDG licence. This screen is a **licence condition**: an
 * application using JMdict, KANJIDIC2 or KRADFILE must acknowledge the usage and
 * source in its UI or documentation. So it gets a test, and the test asserts the
 * things the licence actually requires rather than that a page renders.
 */

test('the attribution screen satisfies the licence conditions', async ({ page }) => {
  await firstRun(page);
  await page.getByTestId('attribution-open').click();

  const list = page.getByTestId('attribution-list');
  await expect(list).toBeVisible({ timeout: 15_000 });

  // Every dataset the build actually ships, named.
  for (const name of ['Tatoeba', 'JMdict', 'KANJIDIC2', 'KRADFILE', 'IPAdic']) {
    await expect(list).toContainText(name);
  }

  // The licence itself, linked — CC BY-SA 4.0 for the EDRDG data, and the
  // share-alike obligation stated rather than implied.
  await expect(list).toContainText('CC BY-SA 4.0');
  await expect(list).toContainText('CC BY 2.0 FR');
  await expect(list).toContainText('berbagi-serupa');
  await expect(list.getByRole('link', { name: 'CC BY-SA 4.0' }).first()).toHaveAttribute(
    'href',
    /edrdg\.org/,
  );

  // Licences drift, so the date we read them is part of the claim (§5.2).
  await expect(list).toContainText('2026-08-1');
});

test('does not attribute datasets the build does not use', async ({ page }) => {
  await firstRun(page);
  await page.getByTestId('attribution-open').click();
  const list = page.getByTestId('attribution-list');
  await expect(list).toBeVisible({ timeout: 15_000 });

  // `candidates` in data/licenses.json are explicitly *not cleared*, and nothing
  // derived from them is in the build. Listing them would claim a provenance the
  // app does not have — the opposite failure to omitting one it does.
  await expect(list).not.toContainText('wordfreq');
  await expect(list).not.toContainText('LibriVox');

  // JMnedict was in `datasets` from M6 to v1.5.0 for a proper-name feature that
  // was never built, so this screen named a source the build did not use — the
  // exact failure this test exists to catch, missed because nothing checked the
  // list against what actually ships. `check-licenses.mjs` now fails on a
  // declared dataset that no asset references, and this holds the UI end.
  await expect(list).not.toContainText('JMnedict');
});
