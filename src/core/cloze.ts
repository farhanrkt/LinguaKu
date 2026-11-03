/**
 * SCIENCE: contextual retrieval — producing a word inside a sentence you
 * already understand exercises the form *and* its usage, which a bare word
 * pair cannot. See SPEC §2.3 (L3) and §2.5.
 */

export interface Cloze {
  before: string;
  /** The word removed, in its original surface form. */
  answer: string;
  after: string;
  /** Japanese only: which pipeline token was removed (`makeTokenCloze`). */
  tokenIndex?: number;
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Removes the first standalone occurrence of `headword` from `text`.
 *
 * Boundaries are letter/digit-aware rather than `\b`, so an apostrophe inside
 * a contraction does not count as a boundary: blanking "let" out of "let's"
 * would leave the learner an unanswerable fragment. Returns null when the word
 * is not present as a whole word, so callers can fall back to another task
 * rather than render a sentence with no blank in it.
 */
export const makeCloze = (text: string, headword: string): Cloze | null => {
  if (headword.length === 0) return null;

  // Apostrophe variants are the same character for matching purposes, and the
  // substitution is length-preserving so offsets stay valid against `text`.
  const haystack = text.replace(/[’‘]/g, "'");
  const needle = escapeRegExp(headword.replace(/[’‘]/g, "'"));

  const match = new RegExp(`(?<![\\p{L}\\p{N}'])${needle}(?![\\p{L}\\p{N}'])`, 'iu').exec(haystack);
  if (!match) return null;

  return {
    before: text.slice(0, match.index),
    answer: text.slice(match.index, match.index + match[0].length),
    after: text.slice(match.index + match[0].length),
  };
};

/**
 * A cloze over pipeline tokens, for Japanese.
 *
 * `makeCloze`'s word boundaries are letters, and Japanese runs its letters
 * together — so a headword inside a sentence is never "standalone", and Japanese
 * cards fell back to multiple choice at the cloze rungs. The build-time tokens
 * (D10) are the boundaries Japanese actually has. `tokenIndex` lets the view
 * draw the rest of the sentence in the learner's script with the blank in
 * place, rather than in whatever script the corpus happens to use.
 */
export const makeTokenCloze = (tokens: readonly string[], headword: string): Cloze | null => {
  const index = tokens.findIndex((token) => token === headword);
  if (index < 0) return null;
  return {
    before: tokens.slice(0, index).join(''),
    answer: tokens[index]!,
    after: tokens.slice(index + 1).join(''),
    tokenIndex: index,
  };
};

const WORD = /[\p{L}\p{N}]/u;

/**
 * How much of the sentence is left to go on once the word is removed.
 *
 * "Yesterday?" with *yesterday* blanked leaves "___ ?" — a question with no
 * answer — and 641 of 8,576 English anchor pairs left one word or none. Below
 * `MIN_CLOZE_CONTEXT` a cloze is not contextual recall, it is a guess.
 */
export const clozeContext = (cloze: Cloze, tokens?: readonly string[]): number =>
  tokens !== undefined && cloze.tokenIndex !== undefined
    ? tokens.filter((token, index) => index !== cloze.tokenIndex && WORD.test(token)).length
    : `${cloze.before} ${cloze.after}`.split(/[\s]+/).filter((word) => WORD.test(word)).length;

export const MIN_CLOZE_CONTEXT = 2;

/**
 * The first letter and the length of the missing word: "s__" for *she*.
 *
 * SCIENCE: cued recall. Without it a short sentence often admits several right
 * answers — "___ said that?" takes *he* as well as *she*, and "We ___
 * everything." takes *buy* as well as *bought* — and the app marked the other
 * right answer wrong, then explained an Indonesian-L1 error the learner had not
 * made (PRONOUN_GENDER, TENSE_ASPECT). The first letter settles which word is
 * meant without giving the form away.
 */
export const clozeHint = (answer: string): string => {
  const characters = [...answer];
  return characters.map((character, index) => (index === 0 || !WORD.test(character) ? character : '_')).join('');
};
