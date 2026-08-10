import { db } from '../../data/db.ts';
import { makeCloze, type Cloze } from '../../core/cloze.ts';
import { mulberry32, shuffle } from '../../core/rng.ts';
import { cardIdFor } from '../../data/repositories/reviews.ts';
import type { FrequencyBand } from '../../core/frequency.ts';
import type { TargetLang } from '../../data/types.ts';
import { anchorPool, getAnchor, type AnchorSentence } from '../../data/content.ts';
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

export type TaskKind = 'exposure' | 'recognition' | 'cloze-supported' | 'cloze-unaided';

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
  /** What a typed answer is graded against. */
  answer: string;
  /** SPEC §2.12: confidence is asked before the reveal on recall rungs. */
  asksConfidence: boolean;
}

const kindForLevel = (level: LadderLevel): TaskKind => {
  switch (level) {
    case 0:
      return 'exposure';
    case 1:
      return 'recognition';
    case 2:
      return 'cloze-supported';
    default:
      return 'cloze-unaided';
  }
};

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

export const buildTask = async (
  profileId: string,
  itemId: string,
  seed: number,
): Promise<Task | null> => {
  const item = await db.items.get(itemId);
  if (!item) return null;

  const card = await db.cards.get(cardIdFor(profileId, itemId));
  const level = card?.ladderLevel ?? 0;

  // Anchors are ordered easiest-first by the pipeline; rotate through them so a
  // leech is re-taught with a different sentence rather than the same one
  // (SPEC §7.2).
  const anchorIndex = (card?.fsrs.lapses ?? 0) % Math.max(1, item.anchorSentenceIds.length);
  const sentence = await getAnchor(item.lang, item.band, item.anchorSentenceIds[anchorIndex] ?? '');
  if (!sentence) return null;

  const cloze = makeCloze(sentence.text, item.headword);
  // A cloze rung with no blank to make is unanswerable — fall back a rung
  // rather than show a sentence with nothing missing.
  const kind = kindForLevel(level);
  const effective: TaskKind =
    (kind === 'cloze-supported' || kind === 'cloze-unaided') && !cloze ? 'recognition' : kind;

  const base = {
    itemId,
    cardId: cardIdFor(profileId, itemId),
    headword: item.headword,
    ladderLevel: level,
    sentence: { id: sentence.id, text: sentence.text },
    translation: sentence.tr.text,
  };

  if (effective === 'recognition') {
    const distractors = await pickDistractors(sentence, item.lang, item.band, seed);
    return {
      ...base,
      kind: 'recognition',
      options: shuffle([sentence.tr.text, ...distractors], mulberry32(seed + 1)),
      answer: sentence.tr.text,
      asksConfidence: false,
    };
  }

  if (effective === 'exposure') {
    return { ...base, kind: 'exposure', answer: item.headword, asksConfidence: false };
  }

  return {
    ...base,
    kind: effective,
    ...(cloze ? { cloze } : {}),
    answer: cloze?.answer ?? item.headword,
    asksConfidence: true,
  };
};
