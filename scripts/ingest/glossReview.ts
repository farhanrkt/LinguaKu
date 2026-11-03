/**
 * Glosses settled by review, replacing what the Wiktionary extraction found.
 *
 * id.wiktionary lists a pronoun's noun sense first, so the learner meeting
 * *she* was told "perempuan, betina" — *betina* is the word for a female
 * animal — and *he* "pria, jantan". The pronoun sense was there, second. *I*
 * carried the slang "gue", which is not how the app speaks (D110). Each entry
 * here keeps Wiktionary's own sense where it was right and drops what was not.
 */
export const GLOSS_REVIEW: Readonly<Record<string, readonly string[]>> = {
  'en:lex:he': ['dia, ia (laki-laki)'],
  'en:lex:she': ['dia, ia (perempuan)'],
  'en:lex:i': ['saya, aku'],
  'en:lex:male': ['laki-laki, pria, jantan'],
};
