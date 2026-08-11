import { coverageOf, lexemeIdFor, COVERAGE_FLOOR } from './coverage.ts';
import { tokenizeLatin } from './tokenize.ts';

/**
 * SCIENCE: comprehensible input, and the reason SPEC §8 calls the reader "the
 * retention engine" — extensive reading at high known-token coverage is where
 * vocabulary is consolidated rather than merely introduced. See §2.4.
 *
 * The selector's job is to keep the learner in the band where reading is
 * *reading* and not decoding: enough known words to follow the sentence, one or
 * two unknown ones to learn from.
 *
 * ## A feed of sentences, not a passage — and why
 *
 * SPEC §8 asks for a graded reader. What we can honestly build is a graded
 * *feed*: Tatoeba is a corpus of independent sentence pairs, not documents, so
 * there is no continuous text to grade. Stringing unrelated sentences together
 * and calling it a passage would look like a reader and read like nonsense —
 * worse than a feed, because it would break the one thing extensive reading
 * depends on, which is that the text means something.
 *
 * A real passage corpus needs Simple English Wikipedia, which is still an
 * uncleared licence candidate (R3). The selector below is written so that the
 * day it clears, only the source changes.
 */

/** SPEC §2.4: how many unknown words a sentence may carry and still be readable. */
export const MAX_UNKNOWN_PER_SENTENCE = 2;

/**
 * Below this many tokens the coverage floor is not a usable test, and decision
 * D28 already worked out why: coverage on an n-token text is quantized to 1/n,
 * so a six-word sentence with one unknown word scores 0.833 and fails an 0.85
 * floor — while being exactly the sentence a learner should be reading.
 *
 * So the unknown-*count* rule is primary, which is i+1 in its literal form, and
 * the coverage floor applies only to text long enough for it to mean something.
 * Two unknown words can first clear 0.85 at fourteen tokens.
 */
export const COVERAGE_MIN_TOKENS = 14;

/**
 * A two-word fragment is not reading, whatever its coverage says. Tatoeba is
 * full of them ("Hi.", "Really?"), and they would otherwise sail through the
 * unknown-count rule while teaching nothing about reading.
 */
export const MIN_READABLE_TOKENS = 4;

/**
 * The absolute floor, at any length: the learner must know most of the sentence.
 * Where the running-text floor cannot apply (short text, D28), this rules out
 * the case the count rule alone misses — "the quokka devours pastry" is two
 * unknown words out of four, which passes "at most two unknown" on a
 * technicality and is half a sentence the learner cannot read.
 */
export const MIN_KNOWN_SHARE = 0.6;

export interface ReadableSentence {
  id: string;
  text: string;
  tokens?: string[];
  tr: { id: string; text: string };
}

export interface ReaderItem<T extends ReadableSentence> {
  sentence: T;
  coverage: number;
  /** Lexeme ids in this sentence the learner does not yet know. */
  unknown: string[];
}

export interface SelectReadingInput<T extends ReadableSentence> {
  pool: readonly T[];
  known: ReadonlySet<string>;
  lang: string;
  limit: number;
  /** Deterministic tie-break, so the same day gives the same feed. */
  seed: number;
}

/**
 * Tokens of a sentence, using the pipeline's own tokenization where it exists.
 *
 * Japanese ships `tokens` from build-time morphological analysis (D10); English
 * is split here with the same tokenizer the pipeline used, so coverage cannot
 * drift between what was measured and what is shown.
 */
export const tokensOf = (sentence: ReadableSentence): string[] =>
  sentence.tokens ?? tokenizeLatin(sentence.text);

/**
 * Picks the next stretch of reading.
 *
 * Ordered by *how much it teaches* rather than by how easy it is: among
 * sentences the learner can actually read, the ones carrying an unknown word
 * come first, because a sentence with nothing new in it is entertainment rather
 * than input. Sentences below the comprehension floor are dropped entirely —
 * that is the difference between reading and decoding.
 */
export const selectReading = <T extends ReadableSentence>(
  input: SelectReadingInput<T>,
): ReaderItem<T>[] => {
  const scored: ReaderItem<T>[] = [];

  for (const sentence of input.pool) {
    const tokens = tokensOf(sentence);
    if (tokens.length === 0) continue;

    const report = coverageOf(sentence.text, input.known, input.lang);
    const unknown = sentence.tokens
      ? [...new Set(tokens.map((token) => lexemeIdFor(input.lang, token)))].filter(
          (id) => !input.known.has(id),
        )
      : report.unknown;

    if (tokens.length < MIN_READABLE_TOKENS) continue;
    // i+1's literal form first — at most a couple of new words.
    if (unknown.length > MAX_UNKNOWN_PER_SENTENCE) continue;
    // Most of it must be known, at any length.
    if (report.coverage < MIN_KNOWN_SHARE) continue;
    // The running-text floor, where the text is long enough to have one (D28).
    if (tokens.length >= COVERAGE_MIN_TOKENS && report.coverage < COVERAGE_FLOOR) continue;

    scored.push({ sentence, coverage: report.coverage, unknown });
  }

  return scored
    .sort((a, b) => {
      // Something to learn first — but never at the cost of readability.
      const teaches = (item: ReaderItem<T>) => (item.unknown.length > 0 ? 0 : 1);
      if (teaches(a) !== teaches(b)) return teaches(a) - teaches(b);
      if (a.coverage !== b.coverage) return b.coverage - a.coverage;
      return hash(a.sentence.id, input.seed) - hash(b.sentence.id, input.seed);
    })
    .slice(0, input.limit);
};

/** Stable per-seed shuffle, so a feed is reproducible but not identical daily. */
const hash = (id: string, seed: number): number => {
  let value = seed >>> 0;
  for (let index = 0; index < id.length; index++) {
    value = (Math.imul(value ^ id.charCodeAt(index), 0x01000193) >>> 0) % 1_000_003;
  }
  return value;
};
