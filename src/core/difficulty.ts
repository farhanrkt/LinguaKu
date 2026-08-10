import { bandForRank, UNKNOWN_RANK, type FrequencyBand } from './frequency.ts';

/**
 * Content difficulty scoring and banding (SPEC §7.6, inputs from §5.3).
 *
 * Two things worth being explicit about, because the numbers here look more
 * authoritative than they are:
 *
 * 1. **Banding is by lexical demand alone**, not by the composite score. A
 *    sentence sits in the band of its 90th-percentile token rank, which means
 *    "the harder words in this sentence live in band N" — a claim we can
 *    defend. The composite `difficulty` only *orders* sentences within a band.
 *    Mapping a composite onto CEFR-shaped labels would be exactly the
 *    fake precision SPEC §2.15 bans.
 * 2. **`clauseCount` is a proxy for syntactic depth**, not a parse. Shipping a
 *    parser to score 25k sentences is not free, and the proxy correlates well
 *    enough for ordering. It is labelled as a proxy everywhere it surfaces.
 */

/** SPEC §5.3 asks for max token rank; p90 does the real work. See `scoreSentence`. */
export interface SentenceDifficulty {
  /** Composite 0..1, for ordering *within* a band. Not a level claim. */
  difficulty: number;
  band: FrequencyBand;
  tokenCount: number;
  maxRank: number;
  p90Rank: number;
  /** Proxy for syntactic depth — clause boundaries, not a parse. */
  clauseCount: number;
}

/**
 * Subordinators and coordinators that reliably introduce a clause. Kept short
 * and high-precision on purpose: a long list catches more clauses but also
 * more false positives (`that` as a determiner, `since` as a preposition).
 */
const CLAUSE_MARKERS = new Set([
  'that',
  'which',
  'who',
  'whom',
  'whose',
  'because',
  'although',
  'though',
  'if',
  'unless',
  'when',
  'while',
  'since',
  'after',
  'before',
  'until',
  'whether',
  'so',
  'but',
  'and',
]);

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** log-scaled, because rank 100 → 200 matters far more than 8000 → 8100. */
const rankDemand = (rank: number): number => clamp01(Math.log(rank + 1) / Math.log(50_000));

const percentileRank = (sortedRanks: readonly number[], percentile: number): number => {
  if (sortedRanks.length === 0) return UNKNOWN_RANK;
  const index = Math.min(
    sortedRanks.length - 1,
    Math.max(0, Math.ceil(percentile * sortedRanks.length) - 1),
  );
  return sortedRanks[index]!;
};

/** Weights are a calibration choice, not a finding. Tuned to order sensibly. */
const WEIGHTS = { p90: 0.5, max: 0.2, length: 0.2, clauses: 0.1 } as const;

/** Beyond ~25 tokens, extra length stops adding much difficulty for a learner. */
const LENGTH_SATURATION = 25;
const CLAUSE_SATURATION = 3;

export const scoreSentence = (
  tokens: readonly string[],
  rankOf: (token: string) => number | undefined,
  rawText = '',
): SentenceDifficulty => {
  const ranks = tokens.map((token) => rankOf(token) ?? UNKNOWN_RANK);
  const sorted = [...ranks].sort((a, b) => a - b);

  const maxRank = sorted.length > 0 ? sorted[sorted.length - 1]! : UNKNOWN_RANK;
  const p90Rank = percentileRank(sorted, 0.9);

  const punctuationClauses = (rawText.match(/[,;:]/g) ?? []).length;
  const markerClauses = tokens.filter((token) => CLAUSE_MARKERS.has(token)).length;
  const clauseCount = punctuationClauses + markerClauses;

  const difficulty = clamp01(
    WEIGHTS.p90 * rankDemand(p90Rank) +
      WEIGHTS.max * rankDemand(maxRank) +
      WEIGHTS.length * clamp01(tokens.length / LENGTH_SATURATION) +
      WEIGHTS.clauses * clamp01(clauseCount / CLAUSE_SATURATION),
  );

  return {
    difficulty: Number(difficulty.toFixed(4)),
    band: bandForRank(p90Rank),
    tokenCount: tokens.length,
    maxRank,
    p90Rank,
    clauseCount,
  };
};
