import { describe, expect, it } from 'vitest';
import {
  bandRates,
  estimateCoverage,
  estimateVocabulary,
  MIN_BAND_SAMPLE,
  wilsonInterval,
  type BandEvidence,
} from './vocabulary.ts';
import type { FrequencyBand } from './frequency.ts';

const band = (
  b: FrequencyBand,
  total: number,
  seen: number,
  known: number,
  share = 0,
): BandEvidence => ({ band: b, total, seen, known, share });

describe('wilsonInterval', () => {
  it('never returns a bound outside 0..1, even at a perfect score', () => {
    // The normal approximation fails exactly here, and this app produces "10 out
    // of 10" constantly.
    const { low, high } = wilsonInterval(10, 10);
    expect(low).toBeGreaterThan(0);
    expect(low).toBeLessThan(1);
    expect(high).toBeLessThanOrEqual(1);
  });

  it('narrows as evidence accumulates', () => {
    const thin = wilsonInterval(8, 10);
    const thick = wilsonInterval(800, 1000);
    expect(thick.high - thick.low).toBeLessThan(thin.high - thin.low);
  });

  it('spans everything when there is no evidence at all', () => {
    expect(wilsonInterval(0, 0)).toEqual({ low: 0, high: 1 });
  });

  it('brackets the observed rate', () => {
    const { low, high } = wilsonInterval(7, 10);
    expect(low).toBeLessThan(0.7);
    expect(high).toBeGreaterThan(0.7);
  });
});

describe('estimateVocabulary (SPEC §9)', () => {
  it('reports a floor of exactly what the learner has demonstrated', () => {
    const estimate = estimateVocabulary([band(1, 500, 40, 30), band(2, 500, 20, 10)]);
    expect(estimate.floor).toBe(40);
    // The lower bound may never dip below a fact.
    expect(estimate.low).toBeGreaterThanOrEqual(estimate.floor);
  });

  it('extrapolates a sampled band to its full size', () => {
    // 40 of 50 known in a 500-word band → roughly 400 words.
    const estimate = estimateVocabulary([band(1, 500, 50, 40)]);
    expect(estimate.estimate).toBeGreaterThan(350);
    expect(estimate.estimate).toBeLessThan(450);
    expect(estimate.low).toBeLessThan(estimate.estimate);
    expect(estimate.high).toBeGreaterThan(estimate.estimate);
  });

  it('treats an unsampled band as unknown, not as zero', () => {
    const sampledOnly = estimateVocabulary([band(1, 500, 50, 40)]);
    const withUnseen = estimateVocabulary([band(1, 500, 50, 40), band(5, 4000, 0, 0)]);

    // The point estimate does not move — we learned nothing about band 5.
    expect(withUnseen.estimate).toBe(sampledOnly.estimate);
    // But the ceiling does, by the whole band: "we have not tested you on 4,000
    // words" is exactly that wide.
    expect(withUnseen.high - sampledOnly.high).toBeGreaterThanOrEqual(3_900);
    expect(withUnseen.unsampledBands).toEqual([5]);
  });

  it('refuses to extrapolate from a handful of items', () => {
    const estimate = estimateVocabulary([band(1, 500, MIN_BAND_SAMPLE - 1, 5)]);
    expect(estimate.measured).toBe(false);
    expect(estimate.estimate).toBe(0);
    // Still honest about what was demonstrated.
    expect(estimate.floor).toBe(5);
    expect(estimate.low).toBe(5);
  });

  it('gives a beginner a wide band and an experienced learner a narrow one', () => {
    const beginner = estimateVocabulary([band(1, 500, 10, 8), band(2, 500, 0, 0)]);
    const seasoned = estimateVocabulary([band(1, 500, 400, 380), band(2, 500, 400, 300)]);

    const width = (e: { low: number; high: number }) => e.high - e.low;
    expect(width(beginner)).toBeGreaterThan(width(seasoned));
  });

  it('says nothing at all for a learner with no cards', () => {
    const estimate = estimateVocabulary([band(1, 500, 0, 0), band(2, 500, 0, 0)]);
    expect(estimate.measured).toBe(false);
    expect(estimate.floor).toBe(0);
    expect(estimate.low).toBe(0);
    expect(estimate.high).toBe(1_000);
  });
});

describe('bandRates (the SPEC §2.10 coverage curve)', () => {
  it('reports a rate only where the sample supports one', () => {
    const rates = bandRates([band(1, 500, 100, 90), band(4, 2000, 3, 3)]);
    expect(rates[0]?.rate).toBeCloseTo(0.9);
    expect(rates[1]?.rate).toBeNull();
  });

  it('reports how much of each band has been sampled', () => {
    const rates = bandRates([band(1, 500, 250, 200)]);
    expect(rates[0]?.sampled).toBeCloseTo(0.5);
  });
});

describe('estimateCoverage (the SPEC §9 capability figure)', () => {
  // Real shape: band 1 is 481 words and 70% of all tokens.
  const evidence = [band(1, 481, 100, 90, 0.7028), band(2, 481, 100, 50, 0.0664)];

  it('weights by how much text a band accounts for, not by word count', () => {
    const coverage = estimateCoverage(evidence, 0.8733, 0.6);
    // 90% of band 1 alone is ~63 points of coverage; band 2 adds ~3.
    expect(coverage.share).toBeGreaterThan(0.6);
    expect(coverage.share).toBeLessThan(0.7);
  });

  it('never claims less than the learner has demonstrably retained', () => {
    const coverage = estimateCoverage(evidence, 0.8733, 0.8);
    expect(coverage.share).toBeGreaterThanOrEqual(0.8);
  });

  it('never claims more than everything we teach', () => {
    const coverage = estimateCoverage(
      [band(1, 481, 481, 481, 0.7028), band(2, 481, 481, 481, 0.0664)],
      0.75,
      0.99,
    );
    expect(coverage.share).toBeLessThanOrEqual(0.75);
  });

  it('carries the ceiling so the UI can say what the percentage is *of*', () => {
    // A learner who mastered every shipped word still would not reach 100%:
    // proper nouns are filtered out (D14) and band 6 is not shipped.
    expect(estimateCoverage(evidence, 0.8733, 0).teachableShare).toBeCloseTo(0.8733);
  });
});
