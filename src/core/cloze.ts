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
