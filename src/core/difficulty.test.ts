import { describe, expect, it } from 'vitest';
import { scoreSentence } from './difficulty.ts';
import { UNKNOWN_RANK } from './frequency.ts';
import { tokenizeLatin } from './tokenize.ts';

/** A tiny toy corpus: rank equals position in this list. */
const CORPUS = ['the', 'cat', 'sat', 'on', 'a', 'mat', 'and', 'that', 'was', 'nice'];
const ranks = new Map(CORPUS.map((token, index) => [token, index + 1] as const));
const rankOf = (token: string): number | undefined => ranks.get(token);

const score = (text: string) => scoreSentence(tokenizeLatin(text), rankOf, text);

describe('scoreSentence', () => {
  it('bands by lexical demand, not by the composite score', () => {
    // Every token is in band 1, so a long sentence of easy words stays band 1.
    const long = score('the cat sat on a mat and the cat sat on a mat and that was nice');
    expect(long.band).toBe(1);
    expect(long.difficulty).toBeGreaterThan(score('the cat sat').difficulty);
  });

  it('treats an unseen word as maximally demanding', () => {
    const result = score('the cat sat on a defenestrated mat');
    expect(result.maxRank).toBe(UNKNOWN_RANK);
    expect(result.band).toBe(6);
  });

  it('does not let one rare word dominate a long easy sentence', () => {
    // p90 ignores the single outlier once there are enough easy tokens, which
    // is the whole reason banding uses p90 rather than max.
    const withOutlier = score(
      'the cat sat on a mat and the cat sat on a mat and that defenestrated',
    );
    expect(withOutlier.maxRank).toBe(UNKNOWN_RANK);
    expect(withOutlier.band).toBeLessThan(6);
  });

  it('counts clause boundaries from punctuation and markers', () => {
    expect(score('the cat sat').clauseCount).toBe(0);
    expect(score('the cat sat, and that was nice').clauseCount).toBe(3); // comma + and + that
  });

  it('scores a longer sentence above a shorter one with the same vocabulary', () => {
    expect(score('the cat sat on a mat').difficulty).toBeGreaterThan(score('the cat').difficulty);
  });

  it('keeps difficulty inside 0..1', () => {
    for (const text of ['the', 'the cat sat on a mat and that was nice', 'zzz qqq wwww']) {
      const { difficulty } = score(text);
      expect(difficulty).toBeGreaterThanOrEqual(0);
      expect(difficulty).toBeLessThanOrEqual(1);
    }
  });

  it('handles a sentence with no tokens at all', () => {
    const result = score('!!!');
    expect(result.tokenCount).toBe(0);
    expect(result.band).toBe(6);
  });

  it('is deterministic', () => {
    expect(score('the cat sat on a mat')).toEqual(score('the cat sat on a mat'));
  });
});
