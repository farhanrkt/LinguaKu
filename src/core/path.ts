import type { FrequencyBand } from './frequency.ts';

/**
 * The learner's position on the whole scale, from the first word to the last
 * one the app can teach (SPEC §2.10, §9).
 *
 * The app has always *had* a curriculum — frequency order is one, and a strict
 * one — but it has never been visible. A learner met an endless queue of
 * questions with no way to see where it was going, which reads as unstructured
 * even though the ordering underneath is anything but.
 *
 * **What makes this honest rather than a level badge.** The milestone for each
 * stage is a *measured* figure the pipeline publishes: band 1 is 481 words and
 * those 481 words are **70.3% of all tokens** in the corpus. "Finish this stage
 * and you will recognise seven words in every ten" is a fact about the corpus,
 * not a claim about the learner's CEFR level — which invariant 9 bans outright
 * and for good reason. Nothing here unlocks, gates, or expires: §1's "not a
 * course player with fixed lesson order" stands, and a learner is free to be
 * working across several stages at once, which the composer does anyway.
 */

export interface StageInput {
  band: FrequencyBand;
  /** Lexemes the app ships in this band. */
  total: number;
  /** Share of corpus tokens this band alone accounts for, 0..1. */
  share: number;
  /** How many of this band's words the learner has secured. */
  secured: number;
}

export type StageState =
  /** Every word in it secured. */
  | 'done'
  /** Where the learner is working now — the first stage not yet finished. */
  | 'current'
  /** Not started, or barely. */
  | 'ahead';

export interface Stage extends StageInput {
  state: StageState;
  /** 0..1 within this stage. */
  progress: number;
  /** Share of everyday tokens covered once this stage is complete, 0..1. */
  cumulativeShare: number;
}

export interface LearningPath {
  stages: Stage[];
  /** The stage the learner is on, or null when every stage is complete. */
  current: Stage | null;
  /** Share of tokens the learner's secured words already cover, 0..1. */
  reach: number;
  securedTotal: number;
  wordTotal: number;
}

/**
 * `reach` is deliberately **not** the sum of completed bands' shares.
 *
 * A learner three-quarters of the way through band 1 has not covered zero
 * percent of English, and rounding them down to the last finished stage is the
 * kind of understatement that makes a true number feel like a lie. Each band's
 * share is credited in proportion to how much of it is secured, which is also
 * how `estimateCoverage` reads the same data on the progress screen — the two
 * must not disagree about the same learner.
 */
export const buildPath = (input: readonly StageInput[]): LearningPath => {
  const ordered = [...input].sort((a, b) => a.band - b.band);

  let cumulative = 0;
  let reach = 0;
  let securedTotal = 0;
  let wordTotal = 0;
  let currentFound = false;

  const stages = ordered.map((stage): Stage => {
    const total = Math.max(0, stage.total);
    const secured = Math.min(Math.max(0, stage.secured), total);
    const progress = total === 0 ? 0 : secured / total;

    cumulative += stage.share;
    reach += stage.share * progress;
    securedTotal += secured;
    wordTotal += total;

    // An empty band is nothing to stand on: it cannot be "current", because
    // there is no work in it for the learner to be doing.
    const complete = total > 0 && secured >= total;
    let state: StageState = 'ahead';
    if (complete) {
      state = 'done';
    } else if (!currentFound && total > 0) {
      state = 'current';
      currentFound = true;
    }

    return { ...stage, total, secured, progress, state, cumulativeShare: cumulative };
  });

  return {
    stages,
    current: stages.find((stage) => stage.state === 'current') ?? null,
    reach,
    securedTotal,
    wordTotal,
  };
};
