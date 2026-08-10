/**
 * SCIENCE: frequency-ordered introduction — the top ~2,000 word families cover
 * the large majority of everyday text, so early effort should buy maximal
 * coverage. See SPEC §2.10.
 */

/** SPEC §2.10 tiers. */
export type FrequencyBand = 1 | 2 | 3 | 4 | 5 | 6;

export const FREQUENCY_BANDS: ReadonlyArray<{
  band: FrequencyBand;
  minRank: number;
  maxRank: number;
}> = [
  { band: 1, minRank: 1, maxRank: 500 },
  { band: 2, minRank: 501, maxRank: 1000 },
  { band: 3, minRank: 1001, maxRank: 2000 },
  { band: 4, minRank: 2001, maxRank: 4000 },
  { band: 5, minRank: 4001, maxRank: 8000 },
  { band: 6, minRank: 8001, maxRank: Number.MAX_SAFE_INTEGER },
];

export const bandForRank = (rank: number): FrequencyBand => {
  for (const { band, maxRank } of FREQUENCY_BANDS) {
    if (rank <= maxRank) return band;
  }
  return 6;
};

/**
 * Dense 1-based ranks, most frequent first. Ties break alphabetically so the
 * whole pipeline is reproducible: the same corpus must always produce the same
 * ranks, or content hashes churn and every learner re-downloads shards that
 * did not really change.
 */
export const rankTokens = (counts: ReadonlyMap<string, number>): Map<string, number> => {
  const sorted = [...counts.entries()].sort(
    ([tokenA, countA], [tokenB, countB]) => countB - countA || tokenA.localeCompare(tokenB, 'en'),
  );
  return new Map(sorted.map(([token], index) => [token, index + 1] as const));
};

/**
 * Rank assigned to a token the corpus has never seen. Well past band 6, so an
 * unknown word is treated as maximally demanding rather than as rank 0.
 */
export const UNKNOWN_RANK = 1_000_000;
