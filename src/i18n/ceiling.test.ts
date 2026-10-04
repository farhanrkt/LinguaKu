import { describe, expect, it } from 'vitest';
import { copy } from './id.ts';

/**
 * SPEC §9's capability sentence says what the percentage is *of*, and the
 * remainder is a different thing in each language.
 *
 * English stops at 87.3% because proper nouns are filtered from the inventory
 * (D14) and band 6 is not shipped — so "the rest are rare words" is true.
 * Japanese stops at 53.6% because particles and auxiliaries are not vocabulary
 * and are never taught as words. Reusing the English sentence there would have
 * replaced the figure v1.26.0 corrected with a false explanation of it.
 */
describe('the capability ceiling explains its own remainder', () => {
  it('attributes the English gap to rare words and proper nouns', () => {
    expect(copy.progress.vocab.ceiling(87, 'en')).toMatch(/nama orang|jarang/);
    expect(copy.progress.path.ceiling(87, 'en')).toMatch(/jarang/);
  });

  it('attributes the Japanese gap to grammar, which is what it is', () => {
    const vocab = copy.progress.vocab.ceiling(54, 'ja');
    expect(vocab).toMatch(/partikel/);
    // And never says the rest is rare vocabulary, which would be untrue.
    expect(vocab).not.toMatch(/jarang/);

    const path = copy.progress.path.ceiling(54, 'ja');
    expect(path).toMatch(/partikel|tata bahasa/);
    expect(path).not.toMatch(/jarang/);
  });

  it('carries the number it was given, in both languages', () => {
    expect(copy.progress.vocab.ceiling(54, 'ja')).toContain('54%');
    expect(copy.progress.vocab.ceiling(87, 'en')).toContain('87%');
  });
});

/**
 * The §3.3 heatmap was headed *"Pola bahasa Inggrismu"* — your English patterns
 * — regardless of what the learner was studying, so a Japanese profile saw that
 * sentence above は dan が, hiragana dan katakana, and あげる/くれる/もらう. The
 * data was right the whole time; only the heading lied, which is the kind of
 * thing that only shows up by opening the screen.
 */
describe('the heatmap is named for the language being learned', () => {
  it('says Japanese on a Japanese profile', () => {
    expect(copy.progress.heatmap.heading('ja')).toContain('Jepang');
    expect(copy.progress.heatmap.heading('ja')).not.toContain('Inggris');
  });

  it('still says English on an English one', () => {
    expect(copy.progress.heatmap.heading('en')).toContain('Inggris');
  });
});

/**
 * SPEC §2.14: capability, never a score — and never a zero arrived at by
 * arithmetic.
 *
 * v1.34.0 put the learner's reach on the home screen, and a learner whose words
 * cover less than one percent of running text rounded to `kira-kira 0%`. That
 * is the loss framing §2.15 bans, reached by `Math.round` rather than by
 * wording: it tells someone who has just started that their work was worth
 * nothing.
 *
 * Tested here rather than in the browser because the browser cannot reach the
 * case cheaply — the commonest three English words are already over 1% of all
 * tokens, so seeding a beginner produces a perfectly good percentage.
 */
describe('the reach line never reports zero', () => {
  it('drops the percentage below one percent, and keeps the count', () => {
    const line = copy.home.dashboard.reach(0, 3);
    expect(line).not.toContain('0%');
    expect(line).toContain('3');
  });

  it('reports the percentage once there is one worth reporting', () => {
    expect(copy.home.dashboard.reach(12, 540)).toContain('12%');
    expect(copy.home.dashboard.reach(1, 40)).toContain('1%');
  });

  it('says nothing that could be read as a loss', () => {
    for (const words of [0, 3, 40, 540]) {
      const line = copy.home.dashboard.reach(Math.min(words, 12), words);
      expect(line).not.toMatch(/\bXP\b|poin|streak|nyawa|gagal|kalah/i);
    }
  });
});
