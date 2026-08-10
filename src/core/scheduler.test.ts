import { describe, expect, it } from 'vitest';
import { Rating, State } from 'ts-fsrs';
import { emptyFsrsState } from '../data/fsrsState.ts';
import {
  applyRating,
  DEFAULT_PARAMETERS,
  GRADES,
  isKnown,
  preview,
  retrievability,
} from './scheduler.ts';
import type { Grade, StoredFsrsState } from '../data/types.ts';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 0, 1, 9, 0, 0);

describe('parameters (SPEC §2.1)', () => {
  it('requests 90% retention with fuzz and short-term steps on', () => {
    expect(DEFAULT_PARAMETERS.request_retention).toBe(0.9);
    expect(DEFAULT_PARAMETERS.enable_fuzz).toBe(true);
    expect(DEFAULT_PARAMETERS.enable_short_term).toBe(true);
  });
});

describe('determinism (SPEC §2.1 acceptance)', () => {
  it('produces identical state for identical (state, rating, timestamp)', () => {
    const state = emptyFsrsState(NOW);
    for (const grade of GRADES) {
      expect(applyRating(state, grade, NOW)).toEqual(applyRating(state, grade, NOW));
    }
  });

  it('stays deterministic deep into a review history, fuzz included', () => {
    const replay = (): StoredFsrsState => {
      let state = emptyFsrsState(NOW);
      let at = NOW;
      for (const grade of [3, 3, 4, 1, 3, 2, 3, 4] as Grade[]) {
        state = applyRating(state, grade, at).state;
        at = state.dueAt;
      }
      return state;
    };
    expect(replay()).toEqual(replay());
  });

  it('survives a storage round trip mid-history without drifting', () => {
    // The scheduler only ever sees stored state, so if serialization lost a
    // digit the whole schedule would quietly diverge.
    let direct = emptyFsrsState(NOW);
    let roundTripped = emptyFsrsState(NOW);
    let at = NOW;
    for (const grade of [3, 1, 3, 4] as Grade[]) {
      direct = applyRating(direct, grade, at).state;
      roundTripped = applyRating(JSON.parse(JSON.stringify(roundTripped)) as StoredFsrsState, grade, at).state;
      at = direct.dueAt;
    }
    expect(roundTripped).toEqual(direct);
  });
});

describe('preview', () => {
  it('offers all four outcomes without committing to any', () => {
    const state = emptyFsrsState(NOW);
    const options = preview(state, NOW);
    expect(Object.keys(options).map(Number).sort()).toEqual([1, 2, 3, 4]);
    // The card the learner is looking at is untouched.
    expect(state).toEqual(emptyFsrsState(NOW));
  });

  it('agrees with what applyRating actually does', () => {
    const state = emptyFsrsState(NOW);
    for (const grade of GRADES) {
      expect(preview(state, NOW)[grade]).toEqual(applyRating(state, grade, NOW));
    }
  });

  it('schedules Easy further out than Good, and Again soonest', () => {
    // A card with some history, so the four outcomes actually separate.
    let state = emptyFsrsState(NOW);
    let at = NOW;
    for (const grade of [3, 3, 3] as Grade[]) {
      state = applyRating(state, grade, at).state;
      at = state.dueAt;
    }
    const options = preview(state, at);
    expect(options[Rating.Again].state.dueAt).toBeLessThan(options[Rating.Good].state.dueAt);
    expect(options[Rating.Good].state.dueAt).toBeLessThanOrEqual(options[Rating.Easy].state.dueAt);
  });
});

describe('applyRating', () => {
  it('moves a new card out of State.New', () => {
    const { state } = applyRating(emptyFsrsState(NOW), 3, NOW);
    expect(state.state).not.toBe(State.New);
    expect(state.reps).toBe(1);
    expect(state.lastReviewAt).toBe(NOW);
  });

  it('counts a lapse when a learned card is failed', () => {
    let state = emptyFsrsState(NOW);
    let at = NOW;
    for (const grade of [3, 3, 3] as Grade[]) {
      state = applyRating(state, grade, at).state;
      at = state.dueAt;
    }
    expect(state.state).toBe(State.Review);
    const lapsed = applyRating(state, 1, at).state;
    expect(lapsed.lapses).toBe(state.lapses + 1);
  });

  it('commits to a future interval on the card', () => {
    const { state } = applyRating(emptyFsrsState(NOW), 4, NOW);
    expect(state.scheduledDays).toBeGreaterThan(0);
    expect(state.dueAt).toBeGreaterThan(NOW);
  });

  it('reports log intervals with revlog semantics, not the new interval', () => {
    // First ever review: nothing was scheduled beforehand, so the log says 0
    // even though the card now has a real interval. Conflating the two would
    // quietly wreck retention analysis (SPEC §9).
    const first = applyRating(emptyFsrsState(NOW), 4, NOW);
    expect(first.scheduledDays).toBe(0);
    expect(first.elapsedDays).toBe(0);
    expect(first.state.scheduledDays).toBeGreaterThan(0);

    const second = applyRating(first.state, 3, first.state.dueAt);
    expect(second.scheduledDays).toBe(first.state.scheduledDays);
    expect(second.elapsedDays).toBeGreaterThan(0);
  });
});

describe('retrievability (SPEC §2.4)', () => {
  it('is near-certain immediately after a successful review', () => {
    const { state } = applyRating(emptyFsrsState(NOW), 3, NOW);
    expect(retrievability(state, NOW)).toBeGreaterThan(0.9);
  });

  it('decays as time passes', () => {
    let state = emptyFsrsState(NOW);
    let at = NOW;
    for (const grade of [3, 3, 3] as Grade[]) {
      state = applyRating(state, grade, at).state;
      at = state.dueAt;
    }
    const soon = retrievability(state, at);
    const later = retrievability(state, at + 365 * DAY);
    expect(later).toBeLessThan(soon);
    expect(later).toBeGreaterThanOrEqual(0);
  });

  it('lands near the 0.90 request_retention target on the due date', () => {
    // Not a validation of FSRS — a regression test that our parameters and
    // timestamp handling reach the scheduler intact. See R6 in DECISIONS.md.
    let state = emptyFsrsState(NOW);
    let at = NOW;
    for (const grade of [3, 3, 3, 3] as Grade[]) {
      state = applyRating(state, grade, at).state;
      at = state.dueAt;
    }
    expect(retrievability(state, state.dueAt)).toBeGreaterThan(0.85);
    expect(retrievability(state, state.dueAt)).toBeLessThan(0.95);
  });

  it('treats a card above the known threshold as known', () => {
    const { state } = applyRating(emptyFsrsState(NOW), 3, NOW);
    expect(isKnown(state, NOW)).toBe(true);
    expect(isKnown(state, NOW + 3650 * DAY)).toBe(false);
  });
});
