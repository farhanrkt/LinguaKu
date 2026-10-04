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
