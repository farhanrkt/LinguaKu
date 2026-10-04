import { isKana, romajiToKana, toHiragana } from './kana.ts';
import type { Grade, TargetLang } from '../data/types.ts';

/**
 * SCIENCE: the generation effect — producing an answer beats recognizing one,
 * but only if production is not punished for spelling. See SPEC §2.7 / §7.5.
 *
 * The rule this file exists to enforce: **a near-miss is shown as a near-miss**,
 * never marked flatly wrong. A learner who typed "becuase" retrieved the word;
 * telling them they failed teaches them that the app is unfair, not that they
 * misspelled something.
 *
 * Romaji↔kana equivalence is the third pass, and it is here for a concrete
 * reason rather than completeness: `KanaInput` ships a **katakana toggle**, so
 * the app hands a learner a button that writes ネコ, and SPEC §4.3 puts a new
 * Japanese learner at `kana` script mode by default — below the kanji the
 * headwords are written in. Without this pass the app marks its own output
 * wrong.
 */

export type AnswerOutcome = 'correct' | 'near-miss' | 'wrong';

export type GradeReason =
  /** Identical once normalized. */
  | 'exact'
  /** Differed only in case, punctuation or spacing. */
  | 'formatting'
  /** Matched once contractions were expanded ("I'm" vs "I am"). */
  | 'contraction'
  /** The same word in another script: katakana, half-width kana, or romaji. */
  | 'script'
  /** Within the typo tolerance for an answer this long. */
  | 'typo'
  /** Not the same answer. */
  | 'mismatch'
  /** Nothing was typed. */
  | 'empty';

export interface GradeResult {
  outcome: AnswerOutcome;
  reason: GradeReason;
  /** Edit distance to the closest accepted answer. */
  distance: number;
  /** How much edit distance this answer's length buys. */
  tolerance: number;
  /** Which accepted answer it came closest to, for the feedback line. */
  matched: string | null;
}

// --------------------------------------------------------------- normalizing

const PUNCTUATION = /[.,!?;:"“”()[\]{}<>…—–\-_/\\|@#$%^&*+=~`]/g;

/** Case, punctuation and spacing are not what is being tested. */
export const normalizeAnswer = (text: string): string =>
  text
    .normalize('NFC')
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(PUNCTUATION, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * English contractions, both directions. Indonesian has none of these, so an
 * Indonesian-L1 learner switching between "I'm" and "I am" is demonstrating
 * comprehension, not making an error.
 */
const CONTRACTIONS: ReadonlyArray<readonly [contracted: string, expanded: string]> = [
  ["i'm", 'i am'],
  ["i've", 'i have'],
  ["i'll", 'i will'],
  ["i'd", 'i would'],
  ["you're", 'you are'],
  ["you've", 'you have'],
  ["you'll", 'you will'],
  ["he's", 'he is'],
  ["she's", 'she is'],
  ["it's", 'it is'],
  ["we're", 'we are'],
  ["we've", 'we have'],
  ["they're", 'they are'],
  ["they've", 'they have'],
  ["that's", 'that is'],
  ["there's", 'there is'],
  ["what's", 'what is'],
  ["where's", 'where is'],
  ["who's", 'who is'],
  ["let's", 'let us'],
  ["don't", 'do not'],
  ["doesn't", 'does not'],
  ["didn't", 'did not'],
  ["isn't", 'is not'],
  ["aren't", 'are not'],
  ["wasn't", 'was not'],
  ["weren't", 'were not'],
  ["can't", 'cannot'],
  ["couldn't", 'could not'],
  ["won't", 'will not'],
  ["wouldn't", 'would not'],
  ["shouldn't", 'should not'],
  ["haven't", 'have not'],
  ["hasn't", 'has not'],
  ["hadn't", 'had not'],
];

/** Collapses both spellings onto one form so either is accepted. */
export const expandContractions = (normalized: string): string => {
  let result = ` ${normalized} `;
  for (const [contracted, expanded] of CONTRACTIONS) {
    result = result.split(` ${contracted} `).join(` ${expanded} `);
  }
  // `cannot` and `can not` are the same word in two pieces.
  result = result.split(' can not ').join(' cannot ');
  return result.trim();
};

// ------------------------------------------------------------------ distance

/**
 * Damerau-Levenshtein (optimal string alignment): insertions, deletions,
 * substitutions, **and adjacent transpositions**.
 *
 * The transposition case is not a nicety. Swapping two adjacent letters is the
 * commonest typing slip there is, and plain Levenshtein charges 2 for it — so
 * "becuase" for "because" would score as a different word and a learner who
 * knew the answer would be told they were wrong.
 */
export const editDistance = (a: string, b: string): number => {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Three rows: two back, one back, current — the two-back row is what makes
  // a transposition cost 1 instead of 2.
  let twoBack: number[] = [];
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(previous[j - 1]! + cost, previous[j]! + 1, current[j - 1]! + 1);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, twoBack[j - 2]! + 1);
      }
      current[j] = value;
    }
    twoBack = previous;
    previous = current;
  }
  return previous[b.length]!;
};

// ------------------------------------------------------------ kana / romaji

/**
 * SPEC §2.7's *"optional kana/romaji equivalence"*.
 *
 * `NFKC` first, because half-width katakana (ﾈｺ) is a real IME output and lives
 * in its own Unicode block; then katakana → hiragana, so one script is
 * compared against one script. Hiragana is the target because that is how
 * `lexemes.b*.json` ships readings.
 */
export const foldKana = (text: string): string => toHiragana(text.normalize('NFKC'));

const hasKana = (text: string): boolean => [...text].some(isKana);

/** Only Latin letters and the spacing normalizeAnswer already collapsed. */
const LATIN_ONLY = /^[a-z' ]+$/;

/**
 * Whether two normalized answers are the same word in different scripts.
 *
 * Gated on kana being involved at all, because the romaji route must never
 * touch English: `romajiToKana('bank')` is ばんk, and comparing *that* could
 * only ever make grading worse. `final` is true — this is a settled answer,
 * not a half-typed one, so a trailing `n` is ん.
 */
const sameWordDifferentScript = (answer: string, expected: string): boolean => {
  if (!hasKana(expected)) return false;
  const want = foldKana(expected);
  if (foldKana(answer) === want) return true;
  return LATIN_ONLY.test(answer) && foldKana(romajiToKana(answer, true)) === want;
};

/**
 * Every form a typed answer may legitimately take.
 *
 * `KanaInput` is a kana keyboard: `romajiToKana` plus a kana palette, with no
 * kanji conversion step. 71.9% of the Japanese lexemes this app ships have
 * kanji in the headword (4,963 of 6,904, measured over `lexemes.b1`–`b5`), and
 * 97.1% of those carry a hiragana reading — so for most of the vocabulary the
 * reading is the *only* form a learner without a system IME can produce, and
 * grading against the kanji alone marks a correct answer wrong.
 *
 * SPEC §4.3 settles whether that is a concession or the point: a new Japanese
 * learner starts at `kana` script mode, and kanji is the rung above. Asking for
 * 私 while teaching わたし grades a rung the learner has not reached.
 *
 * The kanji stays first, because it is the form the verdict shows: the learner
 * types the reading and is then shown the word.
 */
export const acceptedAnswers = (input: {
  lang: TargetLang;
  answer: string;
  reading?: string | null;
}): readonly string[] => {
  const reading = input.reading?.trim() ?? '';
  if (input.lang !== 'ja' || reading.length === 0) return [input.answer];
  if (foldKana(reading) === foldKana(input.answer)) return [input.answer];
  return [input.answer, reading];
};

/**
 * Tolerance scales with length (SPEC §2.7): one slip in a long word is a typo,
 * whereas one letter wrong in a three-letter word is a different word. Capped,
 * because past a point "close enough" stops being close enough.
 */
export const toleranceFor = (expected: string): number =>
  Math.min(3, Math.floor(expected.length / 6));

// -------------------------------------------------------------------- grading

export const gradeAnswer = (
  raw: string,
  accepted: string | readonly string[],
): GradeResult => {
  const candidates = (typeof accepted === 'string' ? [accepted] : accepted).filter(
    (answer) => answer.trim().length > 0,
  );
  const answer = normalizeAnswer(raw);

  if (answer.length === 0) {
    return {
      outcome: 'wrong',
      reason: 'empty',
      distance: Number.POSITIVE_INFINITY,
      tolerance: 0,
      matched: null,
    };
  }

  let best: GradeResult | null = null;

  for (const candidate of candidates) {
    const expected = normalizeAnswer(candidate);
    const tolerance = toleranceFor(expected);

    let result: GradeResult;
    if (answer === expected) {
      result = {
        outcome: 'correct',
        // Only formatting stood between the raw input and the answer.
        reason: raw.trim() === candidate.trim() ? 'exact' : 'formatting',
        distance: 0,
        tolerance,
        matched: candidate,
      };
    } else if (expandContractions(answer) === expandContractions(expected)) {
      result = { outcome: 'correct', reason: 'contraction', distance: 0, tolerance, matched: candidate };
    } else if (sameWordDifferentScript(answer, expected)) {
      result = { outcome: 'correct', reason: 'script', distance: 0, tolerance, matched: candidate };
    } else {
      // Where kana is involved, the distance is measured on one script. タベマス
      // against たべます is not five mistakes, and reading it as five would
      // push a near-miss out of tolerance on the strength of the script alone.
      const kana = hasKana(expected) || hasKana(answer);
      const distance = kana
        ? editDistance(foldKana(answer), foldKana(expected))
        : editDistance(answer, expected);
      result = {
        outcome: distance <= tolerance ? 'near-miss' : 'wrong',
        reason: distance <= tolerance ? 'typo' : 'mismatch',
        distance,
        tolerance,
        matched: candidate,
      };
    }

    if (best === null || result.distance < best.distance) best = result;
    if (best.outcome === 'correct') break;
  }

  return (
    best ?? {
      outcome: 'wrong',
      reason: 'mismatch',
      distance: Number.POSITIVE_INFINITY,
      tolerance: 0,
      matched: null,
    }
  );
};

/**
 * Outcome → FSRS rating.
 *
 * Note what is *absent*: nothing ever produces Easy. Easy is a claim about how
 * effortless the retrieval felt, and the only honest source for that would be
 * the learner saying so. SPEC §2.12 forbids deriving it from the confidence tap,
 * and deriving it from response latency would be an invented mechanic. Until
 * there is a real signal, a correct answer is Good.
 */
export const gradeForOutcome = (outcome: AnswerOutcome): Grade => {
  switch (outcome) {
    case 'correct':
      return 3;
    case 'near-miss':
      return 2;
    case 'wrong':
      return 1;
  }
};
