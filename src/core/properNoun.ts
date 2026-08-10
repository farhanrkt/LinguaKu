/**
 * Proper-noun detection for the lexeme inventory.
 *
 * Why this exists: frequency is derived from Tatoeba's own corpus (decision
 * D13), and Tatoeba is saturated with the placeholder names Tom and Mary —
 * `tom` comes out as the **third most frequent English token**, ahead of `a`.
 * Those ranks are honest corpus statistics and stay untouched, because
 * coverage (§2.4) genuinely has to account for a learner meeting "Tom" in a
 * sentence. But teaching `tom` as band-1 vocabulary would be absurd, so proper
 * nouns are filtered out of the *lexeme inventory* specifically.
 *
 * Detection is by casing, not by a tagger — but only using occurrences that
 * are **not sentence-initial**. Sentence-initial capitalisation says nothing:
 * by that measure `where's` and `oh` look exactly like `boston`. Mid-sentence
 * is where the two separate, because an ordinary word goes back to lower case
 * there and a name does not.
 */

export interface CaseStats {
  /** Occurrences that were not the first token of a sentence. */
  nonInitial: number;
  /** Of those, how many were written entirely in lower case. */
  nonInitialLowercase: number;
}

/**
 * Words that are always capitalized yet are ordinary vocabulary. Deliberately
 * short — every entry is a judgement call, and the cost of a missing entry is
 * one absent word while the cost of a wrong filter is a person's name taught
 * as vocabulary.
 *
 * Contractions of "I" (`i'm`, `i've`, `i'll`, `i'd`) are covered by rule
 * rather than by listing, since they inherit their capital from the pronoun.
 */
export const ALWAYS_CAPITALIZED_VOCABULARY: ReadonlySet<string> = new Set([
  'i',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
  // The three languages this app is about; learners meet them constantly.
  'english',
  'japanese',
  'indonesian',
  // Capitalized by convention rather than because they name anything.
  'ok',
  'tv',
  'mr',
  'mrs',
  'ms',
  'dr',
]);

/** Below this share of lower-case mid-sentence uses, treat the token as a name. */
export const LOWERCASE_THRESHOLD = 0.05;

/**
 * Fewer mid-sentence sightings than this and we have no real evidence either
 * way, so the token is kept. Filtering on thin evidence loses real words;
 * keeping a rare name costs one bad item.
 */
export const MIN_EVIDENCE = 20;

export const isLikelyProperNoun = (token: string, stats: CaseStats): boolean => {
  if (ALWAYS_CAPITALIZED_VOCABULARY.has(token) || token.startsWith("i'")) return false;
  if (stats.nonInitial < MIN_EVIDENCE) return false;
  return stats.nonInitialLowercase / stats.nonInitial < LOWERCASE_THRESHOLD;
};
