import { describe, expect, it } from 'vitest';
import { isLikelyProperNoun, MIN_EVIDENCE } from './properNoun.ts';

describe('isLikelyProperNoun', () => {
  it('flags a name that stays capitalized mid-sentence', () => {
    // Tatoeba's Tom: seen mid-sentence constantly, lower-cased essentially never.
    expect(isLikelyProperNoun('tom', { nonInitial: 30_000, nonInitialLowercase: 12 })).toBe(true);
    expect(isLikelyProperNoun('boston', { nonInitial: 1_200, nonInitialLowercase: 40 })).toBe(true);
  });

  it('keeps an ordinary word that goes back to lower case mid-sentence', () => {
    expect(isLikelyProperNoun('it', { nonInitial: 90_000, nonInitialLowercase: 89_000 })).toBe(
      false,
    );
  });

  it('keeps words that are only ever capitalized because they open sentences', () => {
    // `where's` and `oh` are nearly always sentence-initial, so mid-sentence
    // evidence is thin — the very case that a naive casing test gets wrong.
    expect(isLikelyProperNoun('where’s', { nonInitial: 4, nonInitialLowercase: 0 })).toBe(false);
    expect(isLikelyProperNoun('oh', { nonInitial: MIN_EVIDENCE - 1, nonInitialLowercase: 0 })).toBe(
      false,
    );
  });

  it('keeps "I" and its contractions, capitalized though they are', () => {
    for (const token of ['i', "i'm", "i've", "i'll", "i'd"]) {
      expect(isLikelyProperNoun(token, { nonInitial: 50_000, nonInitialLowercase: 0 })).toBe(false);
    }
  });

  it('keeps weekdays, months and the languages the app teaches', () => {
    expect(isLikelyProperNoun('monday', { nonInitial: 900, nonInitialLowercase: 3 })).toBe(false);
    expect(isLikelyProperNoun('august', { nonInitial: 400, nonInitialLowercase: 1 })).toBe(false);
    expect(isLikelyProperNoun('japanese', { nonInitial: 5_000, nonInitialLowercase: 20 })).toBe(
      false,
    );
  });

  it('keeps conventionally capitalized abbreviations', () => {
    expect(isLikelyProperNoun('tv', { nonInitial: 2_000, nonInitialLowercase: 5 })).toBe(false);
    expect(isLikelyProperNoun('mr', { nonInitial: 800, nonInitialLowercase: 0 })).toBe(false);
  });

  it('keeps a token it has barely seen rather than guessing', () => {
    expect(isLikelyProperNoun('whatever', { nonInitial: 0, nonInitialLowercase: 0 })).toBe(false);
  });
});
