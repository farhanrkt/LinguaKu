import { normalizeAnswer } from './grader.ts';

/**
 * SCIENCE: elaborative, contrastive feedback — SPEC §2.9. *"Where the error
 * matches a known Indonesian-L1 interference pattern (§3), show the contrastive
 * note in Indonesian: what the L1 pattern is, why the target language differs,
 * and one minimal pair."*
 *
 * This module answers the "where the error matches" half: given what the learner
 * typed and what was expected, which §3.1 categories does this specific mistake
 * look like? The explanations themselves are authored content and live in
 * data/contrastive/en.yaml — nothing learner-facing is hardcoded here.
 *
 * ## What it deliberately does not do
 *
 * It does not guess. Every rule below fires on a *specific* pair of forms —
 * `he` for `she`, `go` for `goes`, `book` for `books` — and returns nothing when
 * the answer is simply a different word. A wrong tag is worse than no tag: it
 * would show the learner an explanation of a mistake they did not make, and it
 * would move an Elo rating (SPEC §3.3) on evidence that is not there.
 *
 * It also only looks at wrong answers on *cloze* rungs, where the expected
 * answer is one word and the learner's answer is one word. Omission errors —
 * the dropped copula, the missing article — are invisible in a cloze, because
 * the blank forces the learner to write something. Those are what the authored
 * error-correction drills are for.
 */

/** §3.1 category ids this detector can produce. */
export type InterferenceCategory =
  | 'PRONOUN_GENDER'
  | 'AGREEMENT_3SG'
  | 'TENSE_ASPECT'
  | 'COPULA_BE'
  | 'ARTICLES'
  | 'PLURAL_S'
  | 'PREPOSITIONS'
  | 'MODAL_BISA';

export interface InterferenceInput {
  /** Exactly what the learner typed. */
  raw: string;
  /** The answer they were graded against. */
  expected: string;
  /**
   * The sentence text before the blank, when there is one.
   *
   * It is here to settle one specific ambiguity, and it earns its place: `book`
   * for `books` and `go` for `goes` are the *same* string alternation, and
   * without a part-of-speech tag — which M1's frequency-only pipeline does not
   * produce — the only thing separating "missing plural -s" from "missing
   * agreement -s" is what stands in front of the blank.
   */
  before?: string;
}

const pair = (a: string, b: string) => [a, b] as const;

/**
 * SPEC §3.1 calls this the highest-frequency error, and the reason is structural
 * rather than careless: Indonesian *dia* covers he, she, him and her, so the
 * distinction the learner is being asked to make does not exist in their L1.
 */
const GENDER_PAIRS: ReadonlyArray<readonly [string, string]> = [
  pair('he', 'she'),
  pair('him', 'her'),
  pair('his', 'her'),
  pair('his', 'hers'),
  pair('himself', 'herself'),
];

/** Irregular 3sg forms, where adding -s is not what happens. */
const THIRD_SINGULAR: ReadonlyArray<readonly [base: string, third: string]> = [
  pair('be', 'is'),
  pair('are', 'is'),
  pair('have', 'has'),
  pair('do', 'does'),
  pair('go', 'goes'),
];

/** Irregular pasts, base → past. Indonesian marks time lexically, so these go missing. */
const IRREGULAR_PAST: ReadonlyArray<readonly [base: string, past: string]> = [
  pair('go', 'went'),
  pair('eat', 'ate'),
  pair('see', 'saw'),
  pair('have', 'had'),
  pair('take', 'took'),
  pair('come', 'came'),
  pair('give', 'gave'),
  pair('make', 'made'),
  pair('say', 'said'),
  pair('get', 'got'),
  pair('know', 'knew'),
  pair('think', 'thought'),
  pair('buy', 'bought'),
  pair('bring', 'brought'),
  pair('write', 'wrote'),
  pair('read', 'read'),
  pair('run', 'ran'),
  pair('sit', 'sat'),
  pair('drink', 'drank'),
  pair('speak', 'spoke'),
  pair('leave', 'left'),
  pair('meet', 'met'),
  pair('find', 'found'),
  pair('tell', 'told'),
  pair('is', 'was'),
  pair('are', 'were'),
  pair('am', 'was'),
];

const COPULA = new Set(['am', 'is', 'are', 'was', 'were', 'be', 'been', 'being']);
const ARTICLES = new Set(['a', 'an', 'the']);
const MODALS = new Set(['can', 'could', 'may', 'might', 'able']);

/**
 * §3.1: di/ke/dari map many-to-many onto English prepositions, so choosing the
 * wrong one is a mapping failure rather than ignorance of the word.
 */
const PREPOSITIONS = new Set([
  'in', 'on', 'at', 'to', 'from', 'into', 'onto', 'for', 'with', 'by',
  'about', 'over', 'under', 'between', 'through', 'during', 'until', 'of',
]);

/** Plural of a regular noun. Deliberately narrow: no attempt at foot/feet. */
const pluralOf = (singular: string): string | null => {
  if (/(?:s|x|z|ch|sh)$/.test(singular)) return `${singular}es`;
  if (/[^aeiou]y$/.test(singular)) return `${singular.slice(0, -1)}ies`;
  if (/[a-z]$/.test(singular)) return `${singular}s`;
  return null;
};

/** Third-person singular of a regular verb — the same morphology as the plural. */
const thirdSingularOf = (base: string): string | null => pluralOf(base);

/** Regular past of a verb. */
const pastOf = (base: string): string | null => {
  if (base.endsWith('e')) return `${base}d`;
  if (/[^aeiou]y$/.test(base)) return `${base.slice(0, -1)}ied`;
  if (/[a-z]$/.test(base)) return `${base}ed`;
  return null;
};

const inPair = (
  pairs: ReadonlyArray<readonly [string, string]>,
  a: string,
  b: string,
): boolean => pairs.some(([left, right]) => (a === left && b === right) || (a === right && b === left));

// ------------------------------------------------- disambiguating the -s slot

/** Words that can only be followed by a verb in the third person singular. */
const THIRD_SINGULAR_SUBJECTS = new Set([
  'he', 'she', 'it', 'this', 'that', 'everyone', 'everybody', 'someone',
  'somebody', 'nobody', 'anyone', 'anybody', 'everything', 'something',
]);

/** Words that can only be followed by a noun. */
const NOUN_INTRODUCERS = new Set([
  'a', 'an', 'the', 'my', 'your', 'his', 'her', 'its', 'our', 'their',
  'this', 'that', 'these', 'those', 'some', 'any', 'many', 'few', 'several',
  'all', 'both', 'no', 'other', 'another', 'each', 'every',
  'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
]);

type Slot = 'verb' | 'noun' | 'unknown';

/**
 * What kind of word the blank wants, judged from the word immediately before it.
 *
 * Crude on purpose. It answers "verb, noun, or don't know", and `unknown` is a
 * real answer that suppresses the tag entirely — guessing here would mean
 * telling a learner they have a plural problem when they have an agreement
 * problem, and moving the wrong Elo rating on the way.
 */
export const slotBefore = (before: string | undefined): Slot => {
  if (before === undefined) return 'unknown';
  const words = normalizeAnswer(before).split(' ').filter((word) => word.length > 0);
  const last = words[words.length - 1];
  if (last === undefined) return 'unknown';
  // `this`/`that` introduce both ("this works", "this book"), so they decide
  // nothing on their own.
  const isSubject = THIRD_SINGULAR_SUBJECTS.has(last);
  const isIntroducer = NOUN_INTRODUCERS.has(last);
  if (isSubject && !isIntroducer) return 'verb';
  if (isIntroducer && !isSubject) return 'noun';
  return 'unknown';
};

/**
 * Categories this wrong answer matches. Usually zero or one; more than one is
 * possible and legitimate (`is` for `was` is both a copula and a tense error),
 * and both get shown.
 */
export const detectInterference = (input: InterferenceInput): InterferenceCategory[] => {
  const given = normalizeAnswer(input.raw);
  const expected = normalizeAnswer(input.expected);
  if (given.length === 0 || expected.length === 0 || given === expected) return [];
  // Multi-word answers are dictation or free production, not a single-form slip.
  if (given.includes(' ') || expected.includes(' ')) return [];

  const hits = new Set<InterferenceCategory>();

  if (inPair(GENDER_PAIRS, given, expected)) hits.add('PRONOUN_GENDER');

  // ------------------------------------------------- agreement versus plural
  // `go`/`goes` and `book`/`books` are the same alternation, so the slot before
  // the blank decides which category this is — and when it decides nothing,
  // neither tag is applied.
  const slot = slotBefore(input.before);
  const addsS = thirdSingularOf(given) === expected;
  const dropsS = pluralOf(expected) === given;

  // The irregulars are unambiguous whatever the context: no noun pluralizes
  // `have` into `has`.
  if (THIRD_SINGULAR.some(([base, third]) => given === base && expected === third)) {
    hits.add('AGREEMENT_3SG');
  } else if (addsS && slot === 'verb') {
    // Only the bare stem where the -s form was wanted. Writing "goes" for "go"
    // is a different mistake and this rule would mislabel it.
    hits.add('AGREEMENT_3SG');
  } else if ((addsS || dropsS) && slot === 'noun') {
    // Indonesian pluralizes by reduplication or by a quantifier, so "two book"
    // is the L1 pattern showing through rather than carelessness.
    hits.add('PLURAL_S');
  }

  // ------------------------------------------------------------------ tense
  // Both directions here: Indonesian marks time with *sudah / akan / kemarin*
  // rather than on the verb, so the error is the choice of form either way.
  if (pastOf(given) === expected || pastOf(expected) === given) hits.add('TENSE_ASPECT');
  if (inPair(IRREGULAR_PAST, given, expected)) hits.add('TENSE_ASPECT');

  // ----------------------------------------------------------------- copula
  // "Dia cantik" has no copula, so which form of *be* goes where is a rule the
  // learner has no L1 intuition for at all.
  if (COPULA.has(given) && COPULA.has(expected)) hits.add('COPULA_BE');

  // --------------------------------------------------------------- articles
  // Fires when either side is an article: a wrong article, and an article typed
  // where a word belonged, are both the a/an/the problem.
  if (ARTICLES.has(given) || ARTICLES.has(expected)) hits.add('ARTICLES');

  // ----------------------------------------------------------- prepositions
  if (PREPOSITIONS.has(given) && PREPOSITIONS.has(expected)) hits.add('PREPOSITIONS');

  // ------------------------------------------------------------------ modal
  if (MODALS.has(given) && MODALS.has(expected)) hits.add('MODAL_BISA');

  return [...hits];
};
