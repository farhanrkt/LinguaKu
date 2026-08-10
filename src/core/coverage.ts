import { KNOWN_RETRIEVABILITY, retrievability } from './scheduler.ts';
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
  for (const card of cards) {
    if (retrievability(card.fsrs, now) > KNOWN_RETRIEVABILITY) known.add(card.itemId);
  }
  return known;
};

export const lexemeIdFor = (lang: string, token: string): string => `${lang}:lex:${token}`;

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
export const coverageOf = (
  text: string,
  known: ReadonlySet<string>,
  lang: string,
): CoverageReport => {
  const tokens = tokenizeLatin(text);
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

export const inTargetBand = (coverage: number): boolean =>
  coverage >= COVERAGE_TARGET_MIN && coverage <= COVERAGE_TARGET_MAX;

/**
 * Shortest text for which the target band is reachable at all.
 *
 * Coverage on an n-token text is quantized to multiples of 1/n, and the band
 * is 0.06 wide — so below ~17 tokens it can contain no achievable value, and
 * on a 10-token sentence the reachable coverages are 1.00, 0.90, 0.80: the band
 * is simply empty. SPEC §2.4's threshold is a **running-text** finding, and
 * applying it literally to single sentences would reject almost all of them.
 *
 * For shorter items the operative form of i+1 is its literal one: exactly one
 * new word inside a sentence the learner otherwise knows.
 */
export const BAND_REACHABLE_TOKENS = Math.ceil(1 / (COVERAGE_TARGET_MAX - COVERAGE_TARGET_MIN));

export interface GradedCandidate {
  id: string;
  text: string;
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
    const report = coverageOf(item.text, known, lang);
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
