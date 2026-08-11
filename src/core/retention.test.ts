import { describe, expect, it } from 'vitest';
import {
  measureCalibration,
  measureConsistency,
  measureRetention,
  MIN_CALIBRATION_ANSWERS,
  MIN_REVIEWS_TO_JUDGE,
  RETUNE_MAX,
  RETUNE_MIN,
  RETUNE_STEP,
  retuneTarget,
  TARGET_RETENTION,
  type CalibrationInput,
  type FsrsState,
  type RetentionInput,
} from './retention.ts';
import type { Confidence } from '../data/types.ts';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 7, 11, 9, 0, 0);

/** `count` reviews of which `hits` were recalled, all at a scheduled interval. */
const reviews = (count: number, hits: number, state: FsrsState = 2): RetentionInput[] =>
  Array.from({ length: count }, (_, index) => ({
    stateBefore: state,
    rating: index < hits ? 3 : 1,
    reviewedAt: NOW - index * 1_000,
  }));

describe('measureRetention (SPEC §9)', () => {
  it('says nothing until there are enough scheduled reviews to say it with', () => {
    const report = measureRetention(reviews(MIN_REVIEWS_TO_JUDGE - 1, 30));
    expect(report.measured).toBe(false);
    expect(report.verdict).toBe('unknown');
  });

  it('counts only cards that were actually left alone for an interval', () => {
    // Learning-state answers are not a test of whether the interval was right,
    // and counting them would push the number towards 100% and make a badly
    // tuned scheduler look perfect.
    const report = measureRetention([...reviews(60, 54, 2), ...reviews(200, 200, 1)]);
    expect(report.reviews).toBe(60);
    expect(report.rate).toBeCloseTo(0.9);
  });

  it('calls a learner on target when the interval contains it', () => {
    const report = measureRetention(reviews(200, 180));
    expect(report.rate).toBeCloseTo(TARGET_RETENTION);
    expect(report.verdict).toBe('on-target');
  });

  it('calls it below target only when the evidence rules the target out', () => {
    const report = measureRetention(reviews(300, 180));
    expect(report.verdict).toBe('below');
    expect(report.high).toBeLessThan(TARGET_RETENTION);
  });

  it('does not cry wolf on a point estimate the interval still covers', () => {
    // 51 of 60 is 85% — off the target on its face, and nowhere near enough
    // evidence to claim the scheduler is mistuned.
    const report = measureRetention(reviews(60, 51));
    expect(report.rate).toBeCloseTo(0.85);
    expect(report.verdict).toBe('on-target');
  });

  it('notices intervals that are too short as well as too long', () => {
    const report = measureRetention(reviews(300, 297));
    expect(report.verdict).toBe('above');
  });

  it('treats Hard as a success, exactly as FSRS does', () => {
    const hard: RetentionInput[] = Array.from({ length: 60 }, () => ({
      stateBefore: 2,
      rating: 2,
      reviewedAt: NOW,
    }));
    expect(measureRetention(hard).rate).toBe(1);
  });
});

describe('measureCalibration (SPEC §2.12)', () => {
  const taps = (
    confidence: Confidence,
    count: number,
    hits: number,
  ): CalibrationInput[] =>
    Array.from({ length: count }, (_, index) => ({
      confidence,
      rating: index < hits ? 3 : 1,
    }));

  /** Rungs that never ask for a confidence tap (SPEC §2.12). */
  const untapped = (count: number): CalibrationInput[] =>
    Array.from({ length: count }, () => ({ confidence: null, rating: 3 }));

  it('waits for enough of both taps before comparing them', () => {
    const report = measureCalibration([
      ...taps('yakin', 100, 95),
      ...taps('ragu', MIN_CALIBRATION_ANSWERS - 1, 3),
    ]);
    expect(report.measured).toBe(false);
    expect(report.discrimination).toBeNull();
  });

  it('reports a learner whose judgement is worth something', () => {
    const report = measureCalibration([...taps('yakin', 100, 95), ...taps('ragu', 100, 40)]);
    expect(report.measured).toBe(true);
    expect(report.discrimination).toBeCloseTo(0.55);
    expect(report.discriminating).toBe(true);
  });

  it('does not flatter a learner whose confidence tells us nothing', () => {
    const report = measureCalibration([...taps('yakin', 100, 70), ...taps('ragu', 100, 68)]);
    // Two points that close are one distribution, not two.
    expect(report.discriminating).toBe(false);
  });

  it('ignores answers that were never asked for a confidence tap', () => {
    const report = measureCalibration([
      ...taps('yakin', 20, 18),
      ...taps('ragu', 20, 8),
      ...untapped(500),
    ]);
    expect(report.buckets[0]?.answers).toBe(20);
    expect(report.buckets[1]?.answers).toBe(20);
  });
});

describe('measureConsistency (SPEC §2.14 — a band, not a streak)', () => {
  const on = (daysAgo: readonly number[]) => daysAgo.map((d) => NOW - d * DAY);

  it('counts distinct days inside the window', () => {
    expect(measureConsistency(on([0, 1, 3, 6]), NOW).days).toBe(4);
  });

  it('counts a day once however much was done in it', () => {
    expect(measureConsistency([NOW, NOW - 1_000, NOW - 2_000], NOW).days).toBe(1);
  });

  it('forgets what falls out of the window, rather than punishing it', () => {
    // The healing property: a gap ages out instead of resetting anything.
    expect(measureConsistency(on([8, 9, 30]), NOW).days).toBe(0);
  });

  it('recovers as soon as the learner comes back', () => {
    const lapsed = measureConsistency(on([5, 6]), NOW);
    const returned = measureConsistency(on([0, 5, 6]), NOW);
    expect(returned.days).toBeGreaterThan(lapsed.days);
    // And nothing anywhere reports a break, because there is nothing to break.
    expect(returned.share).toBeCloseTo(3 / 7);
  });
});

describe('retuneTarget (SPEC §9 — "offer to retune")', () => {
  it('shortens intervals for a learner who is forgetting too much', () => {
    // Below target means the intervals ran past what this learner retains, so
    // the target the scheduler aims at goes up.
    expect(retuneTarget(0.9, 'below')).toBeCloseTo(0.93);
  });

  it('lengthens them for a learner who barely forgets anything', () => {
    // Above target is not a compliment to be left alone — it means they are
    // doing more reviews than they need, and this hands the time back.
    expect(retuneTarget(0.9, 'above')).toBeCloseTo(0.87);
  });

  it('does nothing at all when the evidence says nothing', () => {
    expect(retuneTarget(0.9, 'on-target')).toBe(0.9);
    expect(retuneTarget(0.9, 'unknown')).toBe(0.9);
  });

  it('stays inside bounds however many times it is applied', () => {
    let low = 0.9;
    let high = 0.9;
    for (let i = 0; i < 20; i++) {
      low = retuneTarget(low, 'above');
      high = retuneTarget(high, 'below');
    }
    expect(low).toBeGreaterThanOrEqual(RETUNE_MIN);
    expect(high).toBeLessThanOrEqual(RETUNE_MAX);
  });

  it('moves in steps, not to a computed optimum', () => {
    // Deliberate: a real per-user fit needs the FSRS optimizer and far more
    // history (SPEC §2.1). One step per look at the evidence is what this can
    // honestly claim.
    expect(Math.abs(retuneTarget(0.9, 'below') - 0.9)).toBeCloseTo(RETUNE_STEP);
  });
});
