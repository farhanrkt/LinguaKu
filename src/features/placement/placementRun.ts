import { difficultyForRank, estimateAbility, selectNextItem, shouldStop } from '../../core/placement.ts';
import { correctForFalseAlarms, PRIOR_MEAN, PRIOR_SD } from '../../core/placement.ts';
import { mulberry32, shuffle } from '../../core/rng.ts';
import type { AbilityEstimate, PlacementResponse } from '../../core/placement.ts';

/**
 * Drives one placement run (SPEC §4.2).
 *
 * The design that makes ≤90 seconds workable: the Yes/No vocabulary check and
 * the adaptive item loop are the **same** sequence. Every real word the learner
 * judges is a 1PL response — "I know this" is the answer, its frequency rank is
 * its difficulty — and pseudowords are interleaved to measure over-claiming.
 * One interaction, one tap per item, both measurements.
 *
 * What this does **not** measure: listening and grammar. Listening needs audio
 * verified on the device (risk R1) and grammar has no items until M4. SPEC §4.2
 * says the three abilities must not be collapsed into one number, so the
 * unmeasured two are simply absent rather than guessed.
 */

export interface PlacementProbe {
  id: string;
  word: string;
  /** Real words carry a rank; pseudowords do not exist in the corpus. */
  kind: 'real' | 'pseudo';
  difficulty: number;
}

/** Roughly one pseudoword in four — enough signal without wasting the budget. */
export const PSEUDO_EVERY = 4;

export interface RealWord {
  id: string;
  headword: string;
  freqRank: number;
}

export const buildProbePool = (
  words: readonly RealWord[],
  pseudowords: readonly string[],
  seed: number,
): { real: PlacementProbe[]; pseudo: PlacementProbe[] } => {
  const rng = mulberry32(seed);
  return {
    real: words.map((word) => ({
      id: word.id,
      word: word.headword,
      kind: 'real' as const,
      difficulty: difficultyForRank(word.freqRank),
    })),
    pseudo: shuffle(pseudowords, rng).map((word) => ({
      id: `pseudo:${word}`,
      word,
      kind: 'pseudo' as const,
      // Never used — pseudowords do not inform the ability estimate.
      difficulty: Number.NaN,
    })),
  };
};

export interface PlacementState {
  asked: PlacementProbe[];
  answers: boolean[];
  startedAt: number;
}

export const emptyPlacement = (startedAt: number): PlacementState => ({
  asked: [],
  answers: [],
  startedAt,
});

const realResponses = (state: PlacementState): PlacementResponse[] =>
  state.asked.flatMap((probe, index) =>
    probe.kind === 'real' ? [{ difficulty: probe.difficulty, correct: state.answers[index]! }] : [],
  );

export const abilityFrom = (state: PlacementState): AbilityEstimate =>
  estimateAbility(realResponses(state));

export const tallyFrom = (state: PlacementState) => {
  let hits = 0;
  let realShown = 0;
  let falseAlarms = 0;
  let pseudoShown = 0;

  for (const [index, probe] of state.asked.entries()) {
    const said = state.answers[index] === true;
    if (probe.kind === 'real') {
      realShown++;
      if (said) hits++;
    } else {
      pseudoShown++;
      if (said) falseAlarms++;
    }
  }
  return { hits, realShown, falseAlarms, pseudoShown };
};

/**
 * Discounts a self-report the learner has shown they inflate.
 *
 * The mechanism is SPEC §4.2's: correct the hit rate for false alarms. The
 * *mapping* from that correction onto (θ, SE) is a calibration choice, not a
 * finding — shrink the estimate toward the prior in proportion to how much of
 * the learner's "yes" was real, and widen the uncertainty by the same factor,
 * capped at the prior. A learner who says yes to every pseudoword ends up back
 * where we started, which is exactly what we actually know about them.
 */
export const correctedAbility = (state: PlacementState): AbilityEstimate => {
  const raw = abilityFrom(state);
  const tally = tallyFrom(state);
  if (tally.pseudoShown === 0) return raw;

  const { hitRate, corrected } = correctForFalseAlarms(tally);
  if (hitRate <= 0) return raw;

  const trust = Math.min(1, Math.max(0.1, corrected / hitRate));
  return {
    theta: PRIOR_MEAN + (raw.theta - PRIOR_MEAN) * trust,
    // Never wider than the prior. Evidence can fail to narrow what we knew;
    // it cannot make us less certain than before we asked anything, and an
    // uncapped division here produced bands spanning the entire scale.
    standardError: Math.min(PRIOR_SD, raw.standardError / trust),
  };
};

export interface NextProbeInput {
  state: PlacementState;
  pool: { real: readonly PlacementProbe[]; pseudo: readonly PlacementProbe[] };
  now: number;
}

/** The next thing to show, or null when the run should end. */
export const nextProbe = (input: NextProbeInput): PlacementProbe | null => {
  const { state, pool } = input;
  const estimate = abilityFrom(state);

  if (
    shouldStop({
      answered: state.asked.length,
      elapsedMs: input.now - state.startedAt,
      standardError: estimate.standardError,
    })
  ) {
    return null;
  }

  const askedIds = new Set(state.asked.map((probe) => probe.id));

  // Every fourth slot is a pseudoword, so over-claiming is sampled evenly
  // across the run rather than clustered where it is easy to notice.
  if ((state.asked.length + 1) % PSEUDO_EVERY === 0) {
    const pseudo = pool.pseudo.find((probe) => !askedIds.has(probe.id));
    if (pseudo) return pseudo;
  }

  return selectNextItem(pool.real, estimate.theta, askedIds);
};

export const recordAnswer = (
  state: PlacementState,
  probe: PlacementProbe,
  knows: boolean,
): PlacementState => ({
  ...state,
  asked: [...state.asked, probe],
  answers: [...state.answers, knows],
});
