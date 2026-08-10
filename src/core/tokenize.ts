/**
 * SCIENCE: coverage at i+1 is computed over tokens, not characters — see
 * SPEC §2.4. The same tokenizer must run at build time (frequency counting,
 * difficulty scoring) and at runtime (coverage of a text the learner opens),
 * or the two disagree and coverage silently drifts.
 *
 * Latin-script only: English, and Indonesian, which is space-delimited and
 * needs no morphological analysis for our purposes. Japanese is tokenized at
 * build time by a morphological analyser (SPEC §5.1, decision D10) and its
 * tokens ship precomputed on `Sentence.tokens`.
 */

/**
 * A word is a run of letters/digits, optionally followed by apostrophe groups
 * so contractions and possessive-free forms stay whole: `don't`, `o'clock`,
 * `1990s`. A trailing apostrophe (`dogs'`) is dropped rather than kept.
 * Hyphenated compounds split into their parts, which is what frequency
 * counting wants.
 */
const WORD = /[\p{L}\p{N}]+(?:['’]\p{L}+)*/gu;

/** Original casing kept — the lexeme inventory needs it to spot proper nouns. */
export const tokenizeLatinPreservingCase = (text: string): string[] =>
  text.normalize('NFC').replace(/’/g, "'").match(WORD) ?? [];

export const tokenizeLatin = (text: string): string[] =>
  tokenizeLatinPreservingCase(text).map((token) => token.toLowerCase());

/**
 * Pure numbers are real tokens for coverage purposes — a learner reading "12"
 * is not blocked by it — but they are not vocabulary, so they never become
 * items.
 */
export const isLexemeCandidate = (token: string): boolean => /^\p{L}/u.test(token);
