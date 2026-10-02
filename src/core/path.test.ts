import { describe, expect, it } from 'vitest';
import { buildPath, type StageInput } from './path.ts';

/** The real English shape, from `assets/content/en/manifest.json`. */
const english: StageInput[] = [
  { band: 1, total: 481, share: 0.703, secured: 0 },
  { band: 2, total: 481, share: 0.066, secured: 0 },
  { band: 3, total: 872, share: 0.051, secured: 0 },
  { band: 4, total: 1643, share: 0.038, secured: 0 },
  { band: 5, total: 1768, share: 0.015, secured: 0 },
];

const withSecured = (counts: number[]): StageInput[] =>
  english.map((stage, index) => ({ ...stage, secured: counts[index] ?? 0 }));

describe('buildPath', () => {
  it('puts a brand-new learner at the first stage', () => {
    const path = buildPath(english);
    expect(path.current?.band).toBe(1);
    expect(path.stages.map((s) => s.state)).toEqual(['current', 'ahead', 'ahead', 'ahead', 'ahead']);
    expect(path.reach).toBe(0);
  });

  it('counts a part-finished stage towards reach, not down to the last finished one', () => {
    // The point of the whole figure: someone three-quarters through band 1 has
    // not covered 0% of English, and saying so would make a true number read
    // as a lie.
    const path = buildPath(withSecured([361, 0, 0, 0, 0]));
    expect(path.current?.band).toBe(1);
    expect(path.reach).toBeCloseTo(0.703 * (361 / 481), 4);
    expect(path.reach).toBeGreaterThan(0.5);
  });

  it('moves to the next stage once one is finished', () => {
    const path = buildPath(withSecured([481, 100, 0, 0, 0]));
    expect(path.stages[0]?.state).toBe('done');
    expect(path.current?.band).toBe(2);
    // Band 1 finished means 70.3% of everyday tokens, which is the headline the
    // whole path exists to be able to say truthfully.
    expect(path.reach).toBeGreaterThan(0.703);
  });

  it('publishes what finishing each stage is worth, cumulatively', () => {
    const path = buildPath(english);
    expect(path.stages[0]?.cumulativeShare).toBeCloseTo(0.703, 4);
    expect(path.stages[1]?.cumulativeShare).toBeCloseTo(0.769, 4);
    // The teachable ceiling — the app cannot promise beyond what it ships.
    expect(path.stages[4]?.cumulativeShare).toBeCloseTo(0.873, 3);
  });

  it('has no current stage once everything is secured', () => {
    const path = buildPath(withSecured([481, 481, 872, 1643, 1768]));
    expect(path.current).toBeNull();
    expect(path.stages.every((s) => s.state === 'done')).toBe(true);
    expect(path.securedTotal).toBe(path.wordTotal);
  });

  it('never reports more secured than a stage holds', () => {
    // A restored export, or a band that shrank between releases.
    const path = buildPath(withSecured([900, 0, 0, 0, 0]));
    expect(path.stages[0]?.secured).toBe(481);
    expect(path.stages[0]?.progress).toBe(1);
  });

  it('skips an empty band rather than stranding the learner on it', () => {
    // Japanese ships no band 6 lexemes. A stage with nothing in it cannot be
    // the one you are working on.
    const path = buildPath([
      { band: 1, total: 0, share: 0, secured: 0 },
      { band: 2, total: 100, share: 0.5, secured: 10 },
    ]);
    expect(path.current?.band).toBe(2);
    expect(path.stages[0]?.state).toBe('ahead');
  });

  it('orders by band whatever order it is given', () => {
    const path = buildPath([...english].reverse());
    expect(path.stages.map((s) => s.band)).toEqual([1, 2, 3, 4, 5]);
  });
});
