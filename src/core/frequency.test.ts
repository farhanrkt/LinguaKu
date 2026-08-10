import { describe, expect, it } from 'vitest';
import { bandForRank, FREQUENCY_BANDS, rankTokens } from './frequency.ts';

describe('bandForRank', () => {
  it('maps the SPEC §2.10 tier boundaries exactly', () => {
    expect(bandForRank(1)).toBe(1);
    expect(bandForRank(500)).toBe(1);
    expect(bandForRank(501)).toBe(2);
    expect(bandForRank(1000)).toBe(2);
    expect(bandForRank(1001)).toBe(3);
    expect(bandForRank(2000)).toBe(3);
    expect(bandForRank(2001)).toBe(4);
    expect(bandForRank(4000)).toBe(4);
    expect(bandForRank(4001)).toBe(5);
    expect(bandForRank(8000)).toBe(5);
    expect(bandForRank(8001)).toBe(6);
  });

  it('puts anything beyond the last tier in band 6', () => {
    expect(bandForRank(1_000_000)).toBe(6);
  });

  it('leaves no gap between tiers', () => {
    for (let i = 1; i < FREQUENCY_BANDS.length; i++) {
      expect(FREQUENCY_BANDS[i]!.minRank).toBe(FREQUENCY_BANDS[i - 1]!.maxRank + 1);
    }
  });
});

describe('rankTokens', () => {
  it('ranks most frequent first, from 1', () => {
    const ranks = rankTokens(new Map([['rare', 1], ['common', 50], ['mid', 10]]));
    expect(ranks.get('common')).toBe(1);
    expect(ranks.get('mid')).toBe(2);
    expect(ranks.get('rare')).toBe(3);
  });

  it('breaks ties alphabetically so the pipeline is reproducible', () => {
    const counts = new Map([['zebra', 7], ['apple', 7], ['mango', 7]]);
    expect([...rankTokens(counts).keys()]).toEqual(['apple', 'mango', 'zebra']);
    // Same counts inserted in a different order must produce the same ranks,
    // or content hashes churn and learners re-download unchanged shards.
    const reordered = new Map([['mango', 7], ['zebra', 7], ['apple', 7]]);
    expect([...rankTokens(reordered)]).toEqual([...rankTokens(counts)]);
  });

  it('handles an empty corpus', () => {
    expect(rankTokens(new Map()).size).toBe(0);
  });
});
