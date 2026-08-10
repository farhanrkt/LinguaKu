import { describe, expect, it } from 'vitest';
import { isLexemeCandidate, tokenizeLatin } from './tokenize.ts';

describe('tokenizeLatin', () => {
  it('lowercases and drops punctuation', () => {
    expect(tokenizeLatin('The cat sat down.')).toEqual(['the', 'cat', 'sat', 'down']);
  });

  it('keeps contractions whole', () => {
    expect(tokenizeLatin("I don't know o'clock")).toEqual(['i', "don't", 'know', "o'clock"]);
  });

  it('normalises a typographic apostrophe to the plain one', () => {
    expect(tokenizeLatin('I don’t know')).toEqual(tokenizeLatin("I don't know"));
  });

  it('drops a trailing possessive apostrophe rather than keeping it', () => {
    expect(tokenizeLatin("the dogs' bowls")).toEqual(['the', 'dogs', 'bowls']);
  });

  it('splits hyphenated compounds into their parts', () => {
    expect(tokenizeLatin('a well-known face')).toEqual(['a', 'well', 'known', 'face']);
  });

  it('keeps digit-suffixed words whole', () => {
    expect(tokenizeLatin('the 1990s')).toEqual(['the', '1990s']);
  });

  it('handles Indonesian diacritics and reduplication', () => {
    expect(tokenizeLatin('Buku-buku itu, saya sudah baca.')).toEqual([
      'buku',
      'buku',
      'itu',
      'saya',
      'sudah',
      'baca',
    ]);
  });

  it('returns nothing for text with no words', () => {
    expect(tokenizeLatin('!!! ... ???')).toEqual([]);
  });
});

describe('isLexemeCandidate', () => {
  it('accepts words', () => {
    expect(isLexemeCandidate('cat')).toBe(true);
    expect(isLexemeCandidate("don't")).toBe(true);
  });

  it('rejects bare numbers, which are tokens but not vocabulary', () => {
    expect(isLexemeCandidate('12')).toBe(false);
  });
});
