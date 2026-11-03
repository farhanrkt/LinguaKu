import { editDistance, foldKana, gradeAnswer, normalizeAnswer, expandContractions } from './grader.ts';

/**
 * Grading for contrastive drills (SPEC §3.3).
 *
 * SCIENCE: a drill isolates one Indonesian-L1 interference pattern, so the
 * difference between the right answer and the wrong one is usually a single
 * morpheme — the -s of "works", the -ed of "watched", a particle. The ordinary
 * grader's typo tolerance (SPEC §2.7) exists so a misspelled *word* is not
 * marked wrong; applied to a drill it swallowed exactly the error being taught.
 * Measured over the shipped packs before this existed: 20 of 97 English option
 * drills accepted a wrong option ("There a mosque near my house."), and 6 of 29
 * correction drills accepted the faulty sentence retyped unchanged. The learner
 * saw "correct" and the §3.3 heatmap moved the wrong way.
 *
 * The rules:
 *  1. An option drill is right only when the chosen option *is* the answer.
 *  2. A typed drill is right when it matches up to formatting, contractions or
 *     script (the parts of §2.7 that are never the tested difference).
 *  3. A typed near-miss counts only when it provably moved towards the answer:
 *     for a correction, closer to the answer than to the faulty prompt; for a
 *     cloze, the word's ending — where the tested morpheme lives — is intact.
 */

export interface GradableDrill {
  type: string;
  prompt: string;
  options?: readonly string[] | undefined;
  answer: string;
}

export type DrillOutcome = 'correct' | 'near-miss' | 'wrong';

export interface DrillGrade {
  outcome: DrillOutcome;
  /** What the attempt log and the category estimate record. */
  correct: boolean;
}

const comparable = (text: string): string => foldKana(expandContractions(normalizeAnswer(text)));

/** Characters at the end of a word that carry its inflection. */
const SUFFIX = 2;

export const gradeDrill = (drill: GradableDrill, raw: string): DrillGrade => {
  const given = comparable(raw);
  const expected = comparable(drill.answer);
  if (given.length === 0) return { outcome: 'wrong', correct: false };

  if (drill.options && drill.options.length > 0) {
    // The option itself, verbatim: two options may differ by one letter, by
    // script, or only by capitals — the word-stress drills mark the stressed
    // syllable in upper case ("pho-TO-graph"), so case-folding made every one
    // of their options "correct". That difference is the question.
    return raw.trim() === drill.answer.trim()
      ? { outcome: 'correct', correct: true }
      : { outcome: 'wrong', correct: false };
  }

  const base = gradeAnswer(raw, drill.answer);
  if (base.outcome === 'correct') return { outcome: 'correct', correct: true };
  if (base.outcome === 'wrong') return { outcome: 'wrong', correct: false };

  if (drill.type === 'correction') {
    // The faulty sentence is the one answer we know is wrong. A typo is only
    // forgiven if the learner fixed the error and slipped somewhere else.
    const faulty = comparable(drill.prompt);
    const towardsAnswer = editDistance(given, expected) < editDistance(given, faulty);
    return towardsAnswer
      ? { outcome: 'near-miss', correct: true }
      : { outcome: 'wrong', correct: false };
  }

  // A cloze: the morpheme under test sits at the end of the word.
  const intact =
    given.slice(-SUFFIX) === expected.slice(-SUFFIX) && given.slice(0, 1) === expected.slice(0, 1);
  return intact ? { outcome: 'near-miss', correct: true } : { outcome: 'wrong', correct: false };
};
