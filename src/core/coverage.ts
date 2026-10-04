import { isKnown } from './scheduler.ts';
import { tokenizeLatin } from './tokenize.ts';
import type { StoredFsrsState, Timestamp } from '../data/types.ts';

/**
 * SCIENCE: comprehensible input at i+1 — around 95–98% known-token coverage is
 * needed to read unassisted, so material is chosen by measured coverage rather
 * than by a level label. See SPEC §2.4 and §7.3.
 *
 * The band is deliberately a little below the unassisted-reading threshold:
 * at 100% coverage there is nothing to learn, and the point of the exercise is
 * to meet one or two unknown words inside a sentence you otherwise understand.
 */

/** SPEC §2.4: target band for a graded item. */
export const COVERAGE_TARGET_MIN = 0.92;
export const COVERAGE_TARGET_MAX = 0.98;
/** Hard floor: below this a learner is decoding, not reading. */
export const COVERAGE_FLOOR = 0.85;

export interface KnownCard {
  itemId: string;
  fsrs: StoredFsrsState;
}

/**
 * SPEC §2.4: a lexeme counts as known while its retrievability is above 0.6 —
 * i.e. the learner would probably recall it right now, not merely that they
 * once saw it.
 */
export const knownItemIds = (cards: readonly KnownCard[], now: Timestamp): Set<string> => {
  const known = new Set<string>();
  // `isKnown`, not a second copy of its body. The threshold is §2.4's, and the
  // two definitions sat in neighbouring files agreeing by coincidence — the
  // sort of agreement that survives until someone changes one of them.
  for (const card of cards) {
    if (isKnown(card.fsrs, now)) known.add(card.itemId);
  }
  return known;
};

export const lexemeIdFor = (lang: string, token: string): string => `${lang}:lex:${token}`;

/**
 * The language half of an item id — the inverse of the namespacing every item
 * id in this app carries: `en:lex:word`, `ja:kanji:水`, `en:chunk:how_are_you`.
 *
 * It exists so a *card* can be scoped to a language without loading its item.
 * Cards are keyed by `profileId::itemId` and carry no language of their own, so
 * without this the only way to know which language a due card belongs to is a
 * second round trip — which is exactly what made it easy to forget.
 *
 * Null for anything that is not namespaced. A caller filtering by language
 * should drop those rather than guess: `dueCandidates` already drops a card
 * whose item cannot be resolved, and an unparseable id is the same condition.
 */
export const langOfItemId = (itemId: string): string | null => {
  const separator = itemId.indexOf(':');
  if (separator <= 0) return null;
  return itemId.slice(0, separator);
};

export interface CoverageReport {
  coverage: number;
  totalTokens: number;
  knownTokens: number;
  /** Distinct unknown lexeme ids, so a caller can say *which* words are new. */
  unknown: string[];
}

/**
 * Coverage of a text against a learner's known-set.
 *
 * Token-weighted, not type-weighted: a sentence that repeats one unknown word
 * three times is harder than one that uses it once, and the reading-threshold
 * research this implements is stated in running-text terms.
 */
/**
 * Coverage over words the caller has already identified.
 *
 * **This is the real implementation, and `coverageOf` is the Latin-only
 * convenience in front of it.** `tokenizeLatin` finds no Japanese words: it
 * splits on punctuation and returns the runs between, so a Japanese sentence's
 * "coverage" was an artifact of where its commas fell. Measured over the
 * shipped band-1 anchors, `お誕生日おめでとうムーリエル！` scored 0.00 — one run,
 * no match — while `あの、すみません...` scored **1.00**, because `、` and `.`
 * happen to split it into two runs that are themselves lexeme ids.
 *
 * Neither number was a measurement, and every §2.4 selector ranked on them.
 * This is v1.15.1's defect in a second place: a function that takes text and
 * tokenizes it itself cannot serve a language it cannot tokenize. Taking
 * tokens is the fix in both.
 */
export const coverageOfTokens = (
  tokens: readonly string[],
  known: ReadonlySet<string>,
  lang: string,
): CoverageReport => {
  if (tokens.length === 0) {
    return { coverage: 1, totalTokens: 0, knownTokens: 0, unknown: [] };
  }

  const unknown = new Set<string>();
  let knownTokens = 0;
  for (const token of tokens) {
    const id = lexemeIdFor(lang, token);
    if (known.has(id)) knownTokens++;
    else unknown.add(id);
  }

  return {
    coverage: knownTokens / tokens.length,
    totalTokens: tokens.length,
    knownTokens,
    unknown: [...unknown],
  };
};

/**
 * Coverage over Latin-script text, which tokenizes itself.
 *
 * Correct for English and for Indonesian; a caller holding real tokens — any
 * Japanese caller — wants `coverageOfTokens` instead.
 */
export const coverageOf = (
  text: string,
  known: ReadonlySet<string>,
  lang: string,
): CoverageReport => coverageOfTokens(tokenizeLatin(text), known, lang);

export const inTargetBand = (coverage: number): boolean =>
  coverage >= COVERAGE_TARGET_MIN && coverage <= COVERAGE_TARGET_MAX;


export interface GradedCandidate {
  id: string;
  text: string;
  /**
   * The pipeline's morphological tokens, where it has them (Japanese, D10).
   * Without them this selector was measuring punctuation runs and rejecting
   * every Japanese anchor as below the floor, so §2.4's i+1 choice silently
   * fell through to "the first one" for a whole language.
   */
  tokens?: readonly string[];
}

export interface GradedSelection<T extends GradedCandidate> {
  item: T;
  report: CoverageReport;
  /** Why this one qualified — useful in tests and in the debug view. */
  reason: 'in-band' | 'one-new-word' | 'too-easy';
}

/**
 * Picks the best i+1 item for a learner.
 *
 * SPEC §2.4 acceptance: in band ≥90% of the time for passage-length text, and
 * **never** below the floor. Returning null is the honest answer when nothing
 * qualifies — a text a learner cannot read teaches them that reading is not
 * for them.
 *
 * Preference order:
 *  1. inside the coverage band, hardest first (0.93 carries more new material
 *     than 0.98, and sitting at the easy end is how progress stops);
 *  2. exactly one new word — i+1 literally, for text too short to band;
 *  3. above the band, i.e. merely easy;
 *  and never below the floor.
 */
export const selectGraded = <T extends GradedCandidate>(
  candidates: readonly T[],
  known: ReadonlySet<string>,
  lang: string,
): GradedSelection<T> | null => {
  let inBand: GradedSelection<T> | null = null;
  let oneNew: GradedSelection<T> | null = null;
  let easy: GradedSelection<T> | null = null;

  for (const item of candidates) {
    const report = coverageOfTokens(item.tokens ?? tokenizeLatin(item.text), known, lang);
    if (report.totalTokens === 0 || report.coverage < COVERAGE_FLOOR) continue;

    if (inTargetBand(report.coverage)) {
      if (inBand === null || report.coverage < inBand.report.coverage) {
        inBand = { item, report, reason: 'in-band' };
      }
      continue;
    }

    const newWords = report.totalTokens - report.knownTokens;
    if (newWords === 1) {
      // Among one-new-word candidates, more context is better.
      if (oneNew === null || report.totalTokens > oneNew.report.totalTokens) {
        oneNew = { item, report, reason: 'one-new-word' };
      }
      continue;
    }

    if (report.coverage > COVERAGE_TARGET_MAX) {
      if (easy === null || report.coverage < easy.report.coverage) {
        easy = { item, report, reason: 'too-easy' };
      }
    }
  }

  return inBand ?? oneNew ?? easy;
};
