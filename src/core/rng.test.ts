import { describe, expect, it } from 'vitest';
import { mulberry32, shuffle } from './rng.ts';

describe('mulberry32', () => {
  it('repeats exactly for the same seed', () => {
    const draw = (seed: number) => Array.from({ length: 20 }, mulberry32(seed));
    expect(draw(1234)).toEqual(draw(1234));
  });

  it('differs between seeds', () => {
    expect(Array.from({ length: 10 }, mulberry32(1))).not.toEqual(
      Array.from({ length: 10 }, mulberry32(2)),
    );
  });

  it('stays inside [0, 1)', () => {
    const rng = mulberry32(99);
    for (let i = 0; i < 5_000; i++) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('is roughly uniform, so shuffles are not quietly biased', () => {
    const rng = mulberry32(7);
    const buckets = new Array<number>(10).fill(0);
    for (let i = 0; i < 100_000; i++) buckets[Math.floor(rng() * 10)]!++;
    for (const count of buckets) expect(count).toBeGreaterThan(9_000);
  });
});

describe('shuffle', () => {
  it('keeps every element exactly once', () => {
    const items = Array.from({ length: 50 }, (_, index) => index);
    expect([...shuffle(items, mulberry32(3))].sort((a, b) => a - b)).toEqual(items);
  });

  it('does not mutate the input', () => {
    const items = [1, 2, 3, 4, 5];
    shuffle(items, mulberry32(1));
    expect(items).toEqual([1, 2, 3, 4, 5]);
  });

  it('is deterministic for a seed', () => {
    const items = Array.from({ length: 30 }, (_, index) => index);
    expect(shuffle(items, mulberry32(11))).toEqual(shuffle(items, mulberry32(11)));
  });
});
