import { db } from '../db.ts';
import { retrievability } from '../../core/scheduler.ts';
import { isMastered, LEECH_LAPSE_THRESHOLD } from '../../core/ladder.ts';
import { glossFor } from '../glosses.ts';
import { getAnchor } from '../content.ts';
import type { ItemKind, TargetLang, Timestamp } from '../types.ts';

/**
 * The glossary: everything the learner has actually met (SPEC §2.2).
 *
 * §2.2 forbids "browse the list" as a *study activity* and permits this in the
 * same breath — *"a passive glossary is fine, but it does not create or advance
 * cards"*. Both halves are load-bearing, and the second one is why this file is
 * a read and nothing else: it opens no transaction, calls no writer, and cannot
 * reach `recordReview`, which is the only function that may move FSRS state
 * (invariant 0). Looking at your own vocabulary must not schedule it.
 *
 * ## Why it exists at all
 *
 * The progress screen can say *"kamu mengenali sekitar 1.200 kata"* and has
 * never been able to show one of them. A learner has no way to see what they
 * know — which is the thing they are actually accumulating, and the only §2.14
 * competence signal the app was still describing rather than displaying.
 *
 * Only items with a card appear here, because a card is the product of an
 * answer: the list is what the learner has *met*, not what the app ships.
 */

export type GlossaryStrength =
  /** Stable enough that the ladder calls it mastered (SPEC §2.3). */
  | 'mastered'
  /** Known now: retrievability above the §2.4 known-set threshold. */
  | 'known'
  /** Met, and currently slipping — the honest middle. */
  | 'weak'
  /** Lapsed repeatedly; being re-taught with a fresh sentence (§7.2). */
  | 'leech';

export interface GlossaryEntry {
  itemId: string;
  headword: string;
  reading?: string;
  kind: ItemKind;
  band: number;
  /** Indonesian meaning where one exists — authored for chunks, else the shard. */
  gloss?: string;
  /** An example sentence and its translation, for the detail row. */
  example?: { text: string; translation: string };
  strength: GlossaryStrength;
  ladderLevel: number;
  lastReviewedAt: Timestamp | null;
  /** 0..1 — how likely they are to recall it right now. */
  recall: number;
}

/** SPEC §2.4's known-set threshold, reused so the two agree. */
const KNOWN_THRESHOLD = 0.6;

const strengthOf = (input: {
  level: number;
  stability: number;
  lapses: number;
  recall: number;
}): GlossaryStrength => {
  if (input.lapses >= LEECH_LAPSE_THRESHOLD) return 'leech';
  if (isMastered(input.level as 0 | 1 | 2 | 3 | 4 | 5 | 6, input.stability)) return 'mastered';
  return input.recall >= KNOWN_THRESHOLD ? 'known' : 'weak';
};

export interface GlossaryOptions {
  /** Substring match on the headword or its reading. Case-insensitive. */
  search?: string;
  /** Cap, because a long-running learner has thousands and a phone has one screen. */
  limit?: number;
}

/**
 * Builds the glossary, strongest first.
 *
 * Strongest first rather than newest: §2.14 frames progress as capability, and
 * the first thing a learner should see when they open this is the pile of words
 * they have actually secured — not the ones they are currently failing.
 */
export const buildGlossary = async (
  profileId: string,
  lang: TargetLang,
  now: Timestamp,
  options: GlossaryOptions = {},
): Promise<{ entries: GlossaryEntry[]; total: number }> => {
  const cards = await db.cards.where('profileId').equals(profileId).toArray();
  if (cards.length === 0) return { entries: [], total: 0 };

  const items = await db.items.bulkGet(cards.map((card) => card.itemId));
  const search = options.search?.trim().toLowerCase() ?? '';

  const rows = cards.flatMap((card, index) => {
    const item = items[index];
    if (!item || item.lang !== lang) return [];
    if (
      search.length > 0 &&
      !item.headword.toLowerCase().includes(search) &&
      !(item.reading ?? '').toLowerCase().includes(search)
    ) {
      return [];
    }

    const recall = retrievability(card.fsrs, now);
    return [
      {
        item,
        card,
        recall,
        strength: strengthOf({
          level: card.ladderLevel,
          stability: card.fsrs.stability,
          lapses: card.fsrs.lapses,
          recall,
        }),
      },
    ];
  });

  const order: Record<GlossaryStrength, number> = { mastered: 0, known: 1, weak: 2, leech: 3 };
  rows.sort(
    (a, b) =>
      order[a.strength] - order[b.strength] ||
      b.recall - a.recall ||
      a.item.freqRank - b.item.freqRank,
  );

  const shown = rows.slice(0, options.limit ?? 100);

  // Meanings and examples are fetched only for what is displayed: a learner
  // with two thousand cards should not pay for two thousand shard lookups to
  // read one screen.
  const entries = await Promise.all(
    shown.map(async ({ item, card, recall, strength }): Promise<GlossaryEntry> => {
      const gloss =
        item.gloss ?? (await glossFor(item.lang, item.band, item.id).then((senses) => senses[0]));
      const anchorId = item.anchorSentenceIds[0];
      const anchor = anchorId === undefined ? null : await getAnchor(item.lang, item.band, anchorId);

      return {
        itemId: item.id,
        headword: item.headword,
        ...(item.reading !== undefined ? { reading: item.reading } : {}),
        kind: item.kind,
        band: item.band,
        ...(gloss !== undefined ? { gloss } : {}),
        ...(anchor ? { example: { text: anchor.text, translation: anchor.tr.text } } : {}),
        strength,
        ladderLevel: card.ladderLevel,
        lastReviewedAt: card.fsrs.lastReviewAt,
        recall,
      };
    }),
  );

  return { entries, total: rows.length };
};
