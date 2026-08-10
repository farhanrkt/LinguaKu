import { describe, expect, it } from 'vitest';
import { createEmptyCard, fsrs, Rating, State, type Grade } from 'ts-fsrs';
import { emptyFsrsState, fromStoredFsrsState, toStoredFsrsState } from './fsrsState.ts';

const NOW = new Date(Date.UTC(2026, 0, 1, 8, 0, 0));

describe('fsrs state serialization', () => {
  it('round-trips a brand-new card', () => {
    const card = createEmptyCard(NOW);
    expect(fromStoredFsrsState(toStoredFsrsState(card))).toEqual(card);
  });

  it('round-trips a reviewed card, including last_review', () => {
    const scheduler = fsrs({ enable_fuzz: false });
    const { card } = scheduler.next(createEmptyCard(NOW), NOW, Rating.Good);
    expect(card.last_review).toBeInstanceOf(Date);
    expect(fromStoredFsrsState(toStoredFsrsState(card))).toEqual(card);
  });

  it('survives several review generations without drift', () => {
    const scheduler = fsrs({ enable_fuzz: false });
    let card = createEmptyCard(NOW);
    let at = NOW;
    const ratings: Grade[] = [Rating.Good, Rating.Again, Rating.Hard, Rating.Easy, Rating.Good];
    for (const rating of ratings) {
      card = scheduler.next(fromStoredFsrsState(toStoredFsrsState(card)), at, rating).card;
      at = new Date(card.due);
    }
    expect(fromStoredFsrsState(toStoredFsrsState(card))).toEqual(card);
    expect(card.state).toBe(State.Review);
  });

  it('omits last_review rather than storing an epoch-zero date', () => {
    const stored = emptyFsrsState(NOW.getTime());
    expect(stored.lastReviewAt).toBeNull();
    expect('last_review' in fromStoredFsrsState(stored)).toBe(false);
  });

  it('keeps a new card due exactly at its creation time', () => {
    expect(emptyFsrsState(NOW.getTime())).toMatchObject({
      dueAt: NOW.getTime(),
      state: 0,
      reps: 0,
      lapses: 0,
    });
  });
});
