import { FREQUENCY_BANDS, type FrequencyBand } from './frequency.ts';

/**
 * SCIENCE: vocabulary size and text coverage — SPEC §9 and §2.10.
 *
 * Two numbers the learner sees, and they are different in kind:
 *
 *  - **How many words you know.** Not a count of cards; a population estimate,
 *    because a learner knows words we have never shown them. It therefore comes
 *    with an interval, and SPEC §9 requires that interval to be shown.
 *  - **How much of a page you understand.** Token-weighted coverage, which is
 *    the number that actually predicts comprehension (§2.4). It is *not*
 *    proportional to the first one: band 1 is 481 words and 70% of all tokens.
 *
 * ## Why the interval is asymmetric, and why that is the honest shape
 *
 * The sample is not random. New items come from the learner's frontier band,
 * nearest the frontier first (D27), so within a band they have met the commoner
 * words and not the rarer ones — extrapolating a band's known-rate from that
 * sample runs optimistic. And a band they have never been shown at all tells us
 * nothing whatsoever.
 *
 * So rather than dress a biased sample up as a symmetric ±, the interval is
 * built from what each part of the evidence actually supports:
 *
 *  - the **floor** is the count of words they have demonstrably retained. No
 *    inference, no interval — they answered these.
 *  - the **estimate** extrapolates each band we have a real sample from, using
 *    a Wilson score interval rather than the normal approximation, which falls
 *    apart at the small counts and near-1 rates this app produces.
 *  - the **ceiling** adds the bands we have never sampled *in full*, because
 *    "we have not tested you on 3,400 words" is exactly as wide as our ignorance.
 *
 * A learner three sessions in gets a very wide band, and that is the correct
 * answer. SPEC §2.15 bans fake precision; a tight interval here would be it.
 */

/** Below this many seen items, a band's known-rate is noise. */
export const MIN_BAND_SAMPLE = 8;

/** 95%. */
const Z = 1.96;

export interface BandEvidence {
  band: FrequencyBand;
  /** Lexemes shipped in this band. */
  total: number;
  /** Lexemes the learner has answered at least once. */
  seen: number;
  /** Of those, how many are known right now (retrievability > 0.6). */
  known: number;
  /** Share of all corpus tokens this band accounts for. */
  share: number;
}

export interface BandRate {
  band: FrequencyBand;
  /** Known / seen, or null when the sample is too thin to report. */
  rate: number | null;
  seen: number;
  known: number;
  total: number;
  /** How much of the band we have actually sampled, 0..1. */
  sampled: number;
}

/**
 * Wilson score interval — the small-sample-safe one.
 *
 * The normal approximation is wrong in exactly the two places this app lives:
 * small n (a learner who has seen nine words in band 4) and p̂ near 1 (a learner
 * who got all of them right), where it happily produces bounds above 1.
 */
export const wilsonInterval = (
  successes: number,
  trials: number,
): { low: number; high: number } => {
  if (trials <= 0) return { low: 0, high: 1 };
  const p = successes / trials;
  const denominator = 1 + (Z * Z) / trials;
  const centre = (p + (Z * Z) / (2 * trials)) / denominator;
  const spread =
    (Z / denominator) * Math.sqrt((p * (1 - p)) / trials + (Z * Z) / (4 * trials * trials));
  return { low: Math.max(0, centre - spread), high: Math.min(1, centre + spread) };
};

export const bandRates = (evidence: readonly BandEvidence[]): BandRate[] =>
  evidence.map((band) => ({
    band: band.band,
    rate: band.seen >= MIN_BAND_SAMPLE ? band.known / band.seen : null,
    seen: band.seen,
    known: band.known,
    total: band.total,
    sampled: band.total > 0 ? band.seen / band.total : 0,
  }));

export interface VocabularyEstimate {
  /** Words demonstrably retained. A count, not an inference. */
  floor: number;
  /** Point estimate over the bands we have a sample from. */
  estimate: number;
  low: number;
  high: number;
  /** True when at least one band has a usable sample. */
  measured: boolean;
  /** Bands with no usable sample — the source of the upper band's width. */
  unsampledBands: FrequencyBand[];
}

export const estimateVocabulary = (evidence: readonly BandEvidence[]): VocabularyEstimate => {
  const floor = evidence.reduce((sum, band) => sum + band.known, 0);

  let estimate = 0;
  let low = 0;
  let high = 0;
  const unsampledBands: FrequencyBand[] = [];

  for (const band of evidence) {
    if (band.total === 0) continue;
    if (band.seen < MIN_BAND_SAMPLE) {
      // Not "zero known" — unknown. It widens the top of the range by the whole
      // band and contributes nothing to the point estimate.
      unsampledBands.push(band.band);
      high += band.total;
      low += band.known;
      continue;
    }
    const { low: rateLow, high: rateHigh } = wilsonInterval(band.known, band.seen);
    estimate += (band.known / band.seen) * band.total;
    low += rateLow * band.total;
    high += rateHigh * band.total;
  }

  return {
    floor,
    estimate: Math.round(estimate),
    // The floor is a fact; no inference may put the lower bound beneath it.
    low: Math.round(Math.max(low, floor)),
    high: Math.round(Math.max(high, floor)),
    measured: evidence.some((band) => band.seen >= MIN_BAND_SAMPLE),
    unsampledBands,
  };
};

// ------------------------------------------------------------ text coverage

export interface CoverageEstimate {
  /** Share of corpus tokens the learner is estimated to know, 0..1. */
  share: number;
  /** Share covered by words they have demonstrably retained. */
  measuredShare: number;
  /**
   * The ceiling: everything we teach. A learner who mastered every shipped word
   * still would not reach 1 — proper nouns are filtered from the inventory (D14)
   * and band 6 is not shipped, and both still appear in real sentences.
   */
  teachableShare: number;
}

/**
 * SPEC §9's headline: *"kamu mengenali ~2.400 kata — cukup untuk memahami
 * sekitar 86% kata…"*.
 *
 * Exact rather than extrapolated from someone else's frequency list, because the
 * ranks were derived from the corpus we teach from (D13). The percentage is over
 * *that* corpus, and the copy says so — "everyday conversation" would be a claim
 * about a language, and this is a measurement of a text collection.
 */
export const estimateCoverage = (
  evidence: readonly BandEvidence[],
  /** Token share of everything shipped, from the content manifest. */
  teachableShare: number,
  /** Token share of the words demonstrably retained. */
  knownShare: number,
): CoverageEstimate => {
  let share = 0;
  for (const band of evidence) {
    if (band.seen < MIN_BAND_SAMPLE || band.total === 0) continue;
    share += (band.known / band.seen) * band.share;
  }
  return {
    // Never claim less than what they have actually demonstrated.
    share: Math.min(teachableShare, Math.max(share, knownShare)),
    measuredShare: knownShare,
    teachableShare,
  };
};

/** Band sizes, for a curve that shows the whole scale rather than only what is seen. */
export const bandBounds = (band: FrequencyBand): { minRank: number; maxRank: number } => {
  const found = FREQUENCY_BANDS.find((entry) => entry.band === band);
  return found ?? { minRank: 0, maxRank: 0 };
};
