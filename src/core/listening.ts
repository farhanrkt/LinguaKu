/**
 * The listening ability, estimated from what the learner actually does.
 *
 * SPEC §4.2 requires three abilities to be estimated **separately** and never
 * collapsed into one number. Two of them have been real since M3 and M4; this
 * is the third, and it has been absent for a stated reason — decision D25: a
 * missing row reads as "not measured", a fabricated one reads as a measurement,
 * and until audio was known to work on the device there was nothing to measure.
 *
 * ## Why this does not live in placement
 *
 * §4.2 gives placement ≤90 seconds and ≤25 items, and the vocabulary loop
 * already spends them (D24). Adding listening items would either lengthen the
 * check past its budget or take items away from the estimate that gates content
 * selection. §4.2's own answer is in the same section: *"re-estimate
 * continuously; never make the learner retake anything."* So listening is
 * estimated from L4 dictation answers as they accumulate, and a learner who
 * never reaches L4 — because their device cannot speak — is simply never
 * assigned a listening ability, which is the truth about them.
 *
 * ## Why minimal-pair drills are not in this estimate
 *
 * They are listening, and they are deliberately left out. The 1PL model needs a
 * difficulty per response, and a dictation item has one — its frequency rank,
 * on the same scale placement already uses. A minimal-pair drill has no rank and
 * no difficulty on any measured scale, so including one would mean inventing a
 * number and calling the result an estimate. The drills still move the phonology
 * categories in the heatmap (§3.3), which is where their evidence belongs, and
 * the radar's listening axis reports raw accuracy over both.
 */

import { difficultyForRank, estimateAbility, type AbilityEstimate } from './placement.ts';

/**
 * Below this, there is no estimate at all.
 *
 * Five, the same floor D33 sets before a contrastive category may be called a
 * weakness. The reasoning transfers exactly: an ability estimate from two
 * answers is noise wearing a number, and SPEC §2.15 bans reporting one.
 */
export const LISTENING_MIN_ANSWERS = 5;

export interface ListeningAnswer {
  /** Frequency rank of the item that was dictated. */
  freqRank: number;
  correct: boolean;
}

/**
 * The learner's listening ability, or null when the evidence is too thin to
 * report one. Null is not a failure state — it is what the progress screen
 * renders as an honest gap (invariant 18).
 */
export const estimateListening = (
  answers: readonly ListeningAnswer[],
): AbilityEstimate | null => {
  if (answers.length < LISTENING_MIN_ANSWERS) return null;
  return estimateAbility(
    answers.map((answer) => ({
      difficulty: difficultyForRank(answer.freqRank),
      correct: answer.correct,
    })),
  );
};
