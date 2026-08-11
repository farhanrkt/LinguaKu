import { db } from '../../data/db.ts';
import { makeCloze, type Cloze } from '../../core/cloze.ts';
import { mulberry32, shuffle } from '../../core/rng.ts';
import { cardIdFor } from '../../data/repositories/reviews.ts';
import type { FrequencyBand } from '../../core/frequency.ts';
import type { TargetLang } from '../../data/types.ts';
import { anchorPool, getAnchor, type AnchorSentence } from '../../data/content.ts';
import { selectGraded } from '../../core/coverage.ts';
import { tokenizeLatin } from '../../core/tokenize.ts';
import { presentableLevel, TEXT_ONLY_MAX_LEVEL } from '../../core/ladder.ts';
import { getMnemonic } from '../../data/repositories/mnemonics.ts';
import { baselineMnemonic } from './mnemonic.ts';
import type { LadderLevel } from '../../data/types.ts';

/**
 * Turns an item into something a learner can answer at its current rung.
 *
 * **Deviation from SPEC §2.3, and why.** The ladder specifies L2 as
 * "target → meaning, typed". Grading that needs an Indonesian gloss to compare
 * against, and no gloss source is licence-cleared yet (risk R3). The available
 * alternative — grading a typed translation against the one Indonesian sentence
 * we ship — would mark perfectly good paraphrases wrong, which is exactly the
 * unfairness the grader exists to prevent.
 *
 * So M2 splits contextual production into two rungs by *support* rather than
 * by task: L2 is a cloze with the Indonesian translation visible, L3 the same
 * cloze without it. That is a real difficulty gradient, it uses only data we
 * have, and it reverts to the spec's shape the moment glosses land.
 */

export type TaskKind =
  | 'exposure'
  | 'recognition'
  | 'cloze-supported'
  | 'cloze-unaided'
  | 'dictation'
  | 'kanji'
  | 'production'
  | 'free';

export interface Task {
  itemId: string;
  cardId: string;
  headword: string;
  ladderLevel: LadderLevel;
  kind: TaskKind;
  sentence: { id: string; text: string };
  translation: string;
  /** Recognition only: the correct translation plus distractors, shuffled. */
  options?: string[];
  /** Cloze rungs only. */
  cloze?: Cloze;
  /** Kanji cards only (SPEC §2.11). */
  kanji?: KanjiFace;
  /** What a typed answer is graded against. */
  answer: string;
  /** SPEC §2.12: confidence is asked before the reveal on recall rungs. */
  asksConfidence: boolean;
  /**
   * The rung this task actually presents, which is the card's level clamped to
   * `ladderCeiling(hasAudio)`. `recordReview` applies the same clamp, so the
   * review log records the rung the learner really answered at.
   */
  ceiling: LadderLevel;
}

const kindForLevel = (level: LadderLevel): TaskKind => {
  switch (level) {
    case 0:
      return 'exposure';
    case 1:
      return 'recognition';
    case 2:
      return 'cloze-supported';
    case 3:
      return 'cloze-unaided';
    case 4:
      return 'dictation';
    case 5:
      // SPEC §2.3 L5: ID → target, produced. The learner writes the word from
      // the Indonesian alone — no frame, no options, nothing to recognize.
      return 'production';
    default:
      // L6: use it in a sentence about your own life.
      return 'free';
  }
};

/**
 * Longest sentence a learner is asked to write back from hearing it once.
 *
 * Past this, dictation stops measuring phonological form and starts measuring
 * working memory — which is a different construct and not one SPEC §2.3 asked
 * for. An item whose anchors are all longer than this simply has no L4 material,
 * and is held at L3 by the same mechanism that withholds it for missing audio.
 */
export const DICTATION_MAX_TOKENS = 10;

/** What a kanji card shows (SPEC §2.11). */
export interface KanjiFace {
  literal: string;
  /** The component breakdown, e.g. 校 → 木 + 交 (decision D41). */
  components: string[];
  reading: string | null;
  /** The learner's own mnemonic if they wrote one, otherwise the baseline. */
  mnemonic: string;
  mnemonicIsMine: boolean;
}

const DISTRACTORS = 3;

/**
 * SPEC §2.3: distractors come from the same frequency band, so a learner
 * cannot pick the answer by noticing that three options are obviously harder.
 */
const pickDistractors = async (
  sentence: AnchorSentence,
  lang: TargetLang,
  band: FrequencyBand,
  seed: number,
): Promise<string[]> => {
  const pool = await anchorPool(lang, band);
  const candidates = pool.filter(
    (candidate) => candidate.tr.id !== sentence.tr.id && candidate.tr.text.length > 0,
  );
  return shuffle(candidates, mulberry32(seed))
    .slice(0, DISTRACTORS)
    .map((candidate) => candidate.tr.text);
};

export interface BuildTaskOptions {
  /** Lexeme ids the learner currently knows, for the i+1 anchor choice (SPEC §2.4). */
  known?: ReadonlySet<string>;
  /**
   * SPEC §2.6: whether this sentence can be presented as audio — a pre-cached
   * clip or a working TTS voice. Defaults to "no", which withholds L4 rather
   * than assuming an engine we have not probed.
   */
  hasAudioFor?: (sentenceId: string) => boolean;
}

export const buildTask = async (
  profileId: string,
  itemId: string,
  seed: number,
  options: BuildTaskOptions = {},
): Promise<Task | null> => {
  const item = await db.items.get(itemId);
  if (!item) return null;

  const card = await db.cards.get(cardIdFor(profileId, itemId));
  const level = card?.ladderLevel ?? 0;
  const hasAudioFor = options.hasAudioFor ?? (() => false);

  // SPEC §2.11: a kanji is taught by its components and readings, not through an
  // example sentence, so it never goes down the anchor path below — and §2.5's
  // "every lexeme needs a sentence" rule is about lexemes, not characters.
  if (item.kind === 'kanji') {
    const mine = await getMnemonic(profileId, itemId);
    return {
      itemId,
      cardId: cardIdFor(profileId, itemId),
      headword: item.headword,
      ladderLevel: Math.min(level, TEXT_ONLY_MAX_LEVEL) as LadderLevel,
      ceiling: TEXT_ONLY_MAX_LEVEL,
      kind: 'kanji',
      sentence: { id: item.id, text: item.headword },
      translation: '',
      answer: item.headword,
      asksConfidence: false,
      kanji: {
        literal: item.headword,
        components: item.componentsOf ?? [],
        reading: item.reading ?? null,
        mnemonic: mine?.text ?? baselineMnemonic(item.headword, item.componentsOf ?? []),
        mnemonicIsMine: mine !== null,
      },
    };
  }

  // Which example sentence teaches this word is an i+1 decision (SPEC §2.4):
  // among the anchors, pick the one whose coverage best fits what this learner
  // already knows, rather than always the globally easiest.
  const anchors = (
    await Promise.all(
      item.anchorSentenceIds.map((id) => getAnchor(item.lang, item.band, id)),
    )
  ).filter((anchor): anchor is AnchorSentence => anchor !== null);
  if (anchors.length === 0) return null;

  const base = {
    itemId,
    cardId: cardIdFor(profileId, itemId),
    headword: item.headword,
  };

  // L4 first, because it is the only rung with a precondition. A dictation card
  // needs a sentence that can be *heard* and is short enough to write back; if
  // no anchor qualifies, the item is not L4-eligible and its ceiling drops to
  // L3 — SPEC §2.6's exclusion, applied per item rather than app-wide.
  if (level >= 4) {
    const audible = anchors.find(
      (anchor) =>
        hasAudioFor(anchor.id) && tokenizeLatin(anchor.text).length <= DICTATION_MAX_TOKENS,
    );
    if (audible) {
      return {
        ...base,
        ladderLevel: 4,
        ceiling: 4,
        kind: 'dictation',
        sentence: { id: audible.id, text: audible.text },
        translation: audible.tr.text,
        answer: audible.text,
        asksConfidence: true,
      };
    }
  }

  // A dictation card on a silent device is presented (and logged) one rung down.
  const effectiveLevel = presentableLevel(level, false);

  const lapses = card?.fsrs.lapses ?? 0;
  let sentence: AnchorSentence;
  if (lapses > 0) {
    // SPEC §7.2: a leech is re-taught with a *fresh* sentence, never the same
    // one again — so rotation wins over the coverage fit here.
    sentence = anchors[lapses % anchors.length]!;
  } else {
    sentence =
      selectGraded(anchors, options.known ?? new Set(), item.lang)?.item ?? anchors[0]!;
  }

  const cloze = makeCloze(sentence.text, item.headword);
  // A cloze rung with no blank to make is unanswerable — fall back a rung
  // rather than show a sentence with nothing missing.
  const kind = kindForLevel(effectiveLevel);
  const effective: TaskKind =
    (kind === 'cloze-supported' || kind === 'cloze-unaided') && !cloze ? 'recognition' : kind;

  const withSentence = {
    ...base,
    ladderLevel: effectiveLevel,
    ceiling: TEXT_ONLY_MAX_LEVEL,
    sentence: { id: sentence.id, text: sentence.text },
    translation: sentence.tr.text,
  };

  // SPEC §2.3 L5/L6 — the production rungs. Both grade against the headword
  // itself: L5 because that *is* the answer, L6 because the only thing about a
  // free sentence we can honestly check is whether the learner used the word.
  if (effective === 'production' || effective === 'free') {
    return {
      ...withSentence,
      kind: effective,
      answer: item.headword,
      asksConfidence: effective === 'production',
    };
  }

  if (effective === 'recognition') {
    const distractors = await pickDistractors(sentence, item.lang, item.band, seed);
    return {
      ...withSentence,
      kind: 'recognition',
      options: shuffle([sentence.tr.text, ...distractors], mulberry32(seed + 1)),
      answer: sentence.tr.text,
      asksConfidence: false,
    };
  }

  if (effective === 'exposure') {
    return { ...withSentence, kind: 'exposure', answer: item.headword, asksConfidence: false };
  }

  return {
    ...withSentence,
    kind: effective,
    ...(cloze ? { cloze } : {}),
    answer: cloze?.answer ?? item.headword,
    asksConfidence: true,
  };
};
