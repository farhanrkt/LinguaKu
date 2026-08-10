import { describe, expect, it } from 'vitest';
import {
  COVERAGE_FLOOR,
  COVERAGE_TARGET_MAX,
  COVERAGE_TARGET_MIN,
  coverageOf,
  knownItemIds,
  lexemeIdFor,
  selectGraded,
} from './coverage.ts';
import { applyRating } from './scheduler.ts';
import { emptyFsrsState } from '../data/fsrsState.ts';

const NOW = Date.UTC(2026, 5, 1);
const DAY = 86_400_000;

const knowing = (...words: string[]) => new Set(words.map((word) => lexemeIdFor('en', word)));

describe('knownItemIds (SPEC §2.4)', () => {
  it('counts a freshly reviewed card as known', () => {
    const { state } = applyRating(emptyFsrsState(NOW), 3, NOW);
    expect(knownItemIds([{ itemId: 'en:lex:cat', fsrs: state }], NOW)).toContain('en:lex:cat');
  });

  it('stops counting it once retrievability has decayed past the threshold', () => {
    const { state } = applyRating(emptyFsrsState(NOW), 3, NOW);
    expect(knownItemIds([{ itemId: 'en:lex:cat', fsrs: state }], NOW + 3650 * DAY).size).toBe(0);
  });

  it('does not count a card that has never been answered', () => {
    expect(knownItemIds([{ itemId: 'en:lex:cat', fsrs: emptyFsrsState(NOW) }], NOW).size).toBe(0);
  });
});

describe('coverageOf', () => {
  it('is the share of running tokens the learner knows', () => {
    const report = coverageOf('the cat sat', knowing('the', 'cat'), 'en');
    expect(report).toMatchObject({ totalTokens: 3, knownTokens: 2 });
    expect(report.coverage).toBeCloseTo(2 / 3);
  });

  it('weights by tokens, not types — a repeated unknown word hurts more', () => {
    const known = knowing('the');
    const once = coverageOf('the cat the the', known, 'en').coverage;
    const thrice = coverageOf('the cat cat cat', known, 'en').coverage;
    expect(thrice).toBeLessThan(once);
  });

  it('names the unknown words, without repeating them', () => {
    expect(coverageOf('the cat cat sat', knowing('the'), 'en').unknown).toEqual([
      'en:lex:cat',
      'en:lex:sat',
    ]);
  });

  it('treats an empty text as fully covered rather than dividing by zero', () => {
    expect(coverageOf('!!!', new Set(), 'en')).toMatchObject({ coverage: 1, totalTokens: 0 });
  });
});

describe('selectGraded (SPEC §2.4 acceptance)', () => {
  /** A text of `total` tokens of which `unknown` are new to the learner. */
  const text = (total: number, unknown: number) =>
    [
      ...Array.from({ length: total - unknown }, () => 'known'),
      ...Array.from({ length: unknown }, (_, i) => `new${i}`),
    ].join(' ');

  const known = knowing('known');

  it('picks an item inside the target band', () => {
    const selection = selectGraded(
      [
        { id: 'too-hard', text: text(10, 3) }, // 0.70
        { id: 'in-band', text: text(20, 1) }, // 0.95
        { id: 'too-easy', text: text(20, 0) }, // 1.00
      ],
      known,
      'en',
    );
    expect(selection?.item.id).toBe('in-band');
    expect(selection?.report.coverage).toBeGreaterThanOrEqual(COVERAGE_TARGET_MIN);
    expect(selection?.report.coverage).toBeLessThanOrEqual(COVERAGE_TARGET_MAX);
  });

  it('prefers the hardest item in band, since that carries the most new material', () => {
    const selection = selectGraded(
      [
        { id: 'easier', text: text(50, 1) }, // 0.98
        { id: 'harder', text: text(15, 1) }, // 0.933
      ],
      known,
      'en',
    );
    expect(selection?.item.id).toBe('harder');
  });

  it('never returns anything below the floor', () => {
    const selection = selectGraded([{ id: 'wall', text: text(10, 5) }], known, 'en');
    expect(selection).toBeNull();
  });

  it('falls back to something easy rather than something unreadable', () => {
    const selection = selectGraded(
      [
        { id: 'wall', text: text(10, 5) }, // 0.50 — never
        { id: 'easy', text: text(20, 0) }, // 1.00 — fine
      ],
      known,
      'en',
    );
    expect(selection?.item.id).toBe('easy');
  });

  it('returns null for an empty pool rather than inventing an item', () => {
    expect(selectGraded([], known, 'en')).toBeNull();
  });

  it('lands in band for ≥90% of synthetic learners, and never below the floor', () => {
    // SPEC §2.4's acceptance criterion, on passage-length text — which is what
    // the coverage threshold it comes from is stated over.
    let inBand = 0;
    let belowFloor = 0;
    const trials = 200;

    for (let trial = 0; trial < trials; trial++) {
      const vocabulary = 20 + trial * 5;
      const learner = new Set(
        Array.from({ length: vocabulary }, (_, i) => lexemeIdFor('en', `w${i}`)),
      );
      // A pool spanning trivial to unreadable for this learner.
      const pool = Array.from({ length: 8 }, (_, unknownCount) => ({
        id: `passage-${unknownCount}`,
        text: [
          ...Array.from({ length: 40 - unknownCount }, (_, j) => `w${j % vocabulary}`),
          ...Array.from({ length: unknownCount }, (_, j) => `x${trial}_${j}`),
        ].join(' '),
      }));

      const selection = selectGraded(pool, learner, 'en');
      expect(selection).not.toBeNull();
      if (!selection) continue;
      if (selection.report.coverage < COVERAGE_FLOOR) belowFloor++;
      if (
        selection.report.coverage >= COVERAGE_TARGET_MIN &&
        selection.report.coverage <= COVERAGE_TARGET_MAX
      ) {
        inBand++;
      }
    }

    expect(belowFloor).toBe(0);
    expect(inBand / trials).toBeGreaterThanOrEqual(0.9);
  });

  it('falls back to exactly one new word when the text is too short to band', () => {
    // A 10-token sentence can only score 1.00, 0.90, 0.80 — the band is empty,
    // so i+1 has to mean its literal self: one new word.
    const selection = selectGraded(
      [
        { id: 'three-new', text: text(10, 3) },
        { id: 'one-new', text: text(10, 1) },
        { id: 'nothing-new', text: text(10, 0) },
      ],
      known,
      'en',
    );
    expect(selection?.item.id).toBe('one-new');
    expect(selection?.reason).toBe('one-new-word');
  });

  it('prefers more context among one-new-word candidates', () => {
    const selection = selectGraded(
      [
        { id: 'terse', text: text(8, 1) },
        { id: 'richer', text: text(12, 1) },
      ],
      known,
      'en',
    );
    expect(selection?.item.id).toBe('richer');
  });
});
