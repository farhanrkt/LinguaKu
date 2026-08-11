import Dexie, { type Table } from 'dexie';
import type {
  Ability,
  Card,
  CategoryScore,
  DrillAttempt,
  DeferredItem,
  Habit,
  MinedItem,
  Item,
  Mnemonic,
  Profile,
  ReviewLog,
  Sentence,
  Session,
  ContentShard,
} from './types.ts';

export const DB_NAME = 'linguaku';

/**
 * The local store is the source of truth (SPEC §5.1). Sync, if it ever ships,
 * is a delta log on top of this — never the other way round.
 *
 * Index notes:
 *  - `cards.[profileId+suspended+dueAt]` is the session composer's hot path:
 *    "cards for this profile, not suspended, due before now" (SPEC §7.2).
 *  - `reviewLogs.[profileId+reviewedAt]` backs retention, forecast and
 *    calibration analytics (SPEC §9) without a table scan.
 *  - `items.*interferenceTags` is a multi-entry index so the contrastive
 *    engine can pull drills by category (SPEC §3.3).
 */
export class LinguaKuDb extends Dexie {
  profiles!: Table<Profile, string>;
  abilities!: Table<Ability, [string, string, string]>;
  items!: Table<Item, string>;
  sentences!: Table<Sentence, string>;
  cards!: Table<Card, string>;
  reviewLogs!: Table<ReviewLog, string>;
  categoryScores!: Table<CategoryScore, [string, string, string]>;
  sessions!: Table<Session, string>;
  mnemonics!: Table<Mnemonic, [string, string]>;
  habits!: Table<Habit, string>;
  contentShards!: Table<ContentShard, string>;
  drillAttempts!: Table<DrillAttempt, string>;
  minedItems!: Table<MinedItem, [string, string]>;
  deferredItems!: Table<DeferredItem, [string, string]>;

  constructor(name: string = DB_NAME) {
    super(name);

    // Every schema change from here on ships a new version() block plus a
    // round-trip migration test (SPEC §6 invariants).
    this.version(1).stores({
      profiles: 'id, createdAt',
      abilities: '[profileId+lang+dimension], profileId, updatedAt',
      items: 'id, [lang+band], [lang+kind], freqRank, *interferenceTags',
      sentences: 'id, [lang+difficulty], translationId',
      cards: 'id, itemId, profileId, [profileId+itemId], [profileId+suspended+dueAt]',
      reviewLogs: 'id, cardId, [profileId+reviewedAt], reviewedAt',
      categoryScores: '[profileId+lang+categoryId], profileId, elo',
      sessions: 'id, [profileId+startedAt], completed',
      mnemonics: '[profileId+itemId], itemId',
      habits: 'id, profileId',
    });

    // v2 (M2): the runtime content loader needs to know which generated shards
    // are already imported, and at which hash. Additive only — no data
    // migration, because no existing row changes shape.
    this.version(2).stores({
      contentShards: 'path, lang',
      // Items gain a band index so the composer can pull new items for a band
      // without scanning, and sentences an index on their lexeme references.
      items: 'id, [lang+band], [lang+kind], freqRank, *interferenceTags, *anchorSentenceIds',
      // `[lang+band]` backs SPEC §2.3's "distractors from the same frequency
      // band"; the multi-entry index answers "which sentences use this lexeme".
      sentences: 'id, [lang+band], [lang+difficulty], translationId, *coverageMeta.lexemeIds',
    });

    // v3 (M4): the contrastive engine reports accuracy per category, not just
    // an Elo rating, so `CategoryScore` gains a `correct` tally. Existing rows
    // are backfilled with 0 — honest, because a row written before this version
    // never recorded the distinction and inventing one would put fabricated
    // numbers on the heatmap.
    this.version(3)
      .stores({
        categoryScores: '[profileId+lang+categoryId], profileId, elo, [profileId+lang]',
        // Drill answers live apart from `reviewLogs` on purpose: a drill has no
        // FSRS card, so mixing them would put unscheduled items into the
        // retention rate SPEC §9 reports.
        drillAttempts: 'id, profileId, [profileId+answeredAt], drillId, categoryId',
      })
      .upgrade((transaction) =>
        transaction
          .table<CategoryScore>('categoryScores')
          .toCollection()
          .modify((score) => {
            score.correct ??= 0;
          }),
      );

    // v4 (M7): the reader's one-tap mining (SPEC §8). Additive — a mined item
    // is an intention to learn a word, held until the composer introduces it,
    // and no existing row changes shape.
    this.version(4).stores({
      minedItems: '[profileId+itemId], profileId, [profileId+minedAt]',
    });

    // v5 (v2.0.0): SPEC §2.14's "belum perlu". Additive, and deliberately its
    // own table rather than a flag on `Card` — a learner may decline a word
    // they have never answered, which has no card to carry a flag.
    this.version(5).stores({
      deferredItems: '[profileId+itemId], profileId, [profileId+until]',
    });

    // `Card.dueAt` mirrors `Card.fsrs.dueAt` so the composer can use a
    // compound index (IndexedDB cannot index a nested path inside a compound
    // key). The mirror is derived here rather than at call sites so it cannot
    // drift, whatever writes the card.
    this.cards.hook('creating', (_pk, card) => {
      card.dueAt = card.fsrs.dueAt;
    });
    this.cards.hook('updating', (modifications, _pk, card) => {
      const mods = modifications as Partial<Card> & Record<string, unknown>;
      if (mods.fsrs !== undefined) return { dueAt: mods.fsrs.dueAt };
      if ('fsrs.dueAt' in mods) return { dueAt: mods['fsrs.dueAt'] };
      if (mods.dueAt !== undefined && mods.dueAt !== card.fsrs.dueAt) {
        return { dueAt: card.fsrs.dueAt };
      }
      return undefined;
    });

    // SPEC §6 invariant: ReviewLog is append-only. It is the substrate for
    // FSRS parameter optimization (§2.1) and for the honest retention numbers
    // in §9 — a mutated log silently corrupts both, so the store refuses.
    this.reviewLogs.hook('updating', () => {
      throw new AppendOnlyViolation('reviewLogs is append-only: update rejected');
    });
    this.reviewLogs.hook('deleting', () => {
      throw new AppendOnlyViolation('reviewLogs is append-only: delete rejected');
    });
  }
}

export class AppendOnlyViolation extends Error {
  override readonly name = 'AppendOnlyViolation';
}

export const db = new LinguaKuDb();
