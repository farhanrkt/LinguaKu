/**
 * Entity types for the local-first store (SPEC §6).
 *
 * Conventions that differ from the prose in SPEC §6 are deliberate and are
 * documented in docs/DECISIONS.md (D5–D7):
 *  - timestamps are epoch milliseconds (`number`), because IndexedDB indexes
 *    them directly and they serialize losslessly for export/sync;
 *  - booleans that need an index are stored as `Flag` (0 | 1), because
 *    IndexedDB cannot index booleans;
 *  - `profileId` is carried on Card / ReviewLog / Mnemonic so export (§9) and
 *    delta sync (§5.1) can scope by profile.
 */

// The frequency band model belongs to the domain, so it lives in core and the
// storage layer borrows it — never the other way round (see CLAUDE.md).
export type { FrequencyBand } from '../core/frequency.ts';
import type { FrequencyBand } from '../core/frequency.ts';

/** IndexedDB-indexable boolean. */
export type Flag = 0 | 1;

export const flag = (value: boolean): Flag => (value ? 1 : 0);

/** Epoch milliseconds. */
export type Timestamp = number;

export type UiLang = 'id';
export type TargetLang = 'en' | 'ja';

/**
 * Languages a stored sentence can be in. Indonesian appears as the L1 side of
 * a translation pair — it is stored so `translationId` resolves, but it is
 * never itself study material, which is why it is not a `TargetLang`.
 */
export type ContentLang = TargetLang | 'id';

/** SPEC §4.3: romaji is actively deprecated once kana fluency is reached. */
export type ScriptMode = 'romaji' | 'kana' | 'kanji';

/** SPEC §2.13: microlearning defaults. */
export type DailyMinutes = 4 | 8 | 15;

export interface Profile {
  id: string;
  uiLang: UiLang;
  targets: TargetLang[];
  dailyMinutes: DailyMinutes;
  scriptMode: ScriptMode;
  createdAt: Timestamp;
  /**
   * FSRS `request_retention` for this learner (SPEC §2.1's per-user parameter
   * slot, §9's "offer to retune"). Absent means the published default — an
   * older profile needs no backfill, because absent already means "the default".
   */
  requestRetention?: number;
  /**
   * New words a day (SPEC §7.2, §2.14 autonomy). Absent means the default for
   * `dailyMinutes` — an older profile needs no backfill, because absent already
   * means "whatever suits my session length".
   *
   * Zero is a legitimate setting, not an error: reviewing what you already have
   * without adding more is how a learner digs out of a backlog.
   */
  dailyNewWords?: number;
  /**
   * SPEC §2.14 (autonomy): *"learner picks topic clusters"*, and SPEC §2.10:
   * frequency order *"modulated by learner-selected topic goals"*.
   *
   * Absent or empty means no preference, which is not the same as "none" — a
   * learner who has chosen nothing gets the frequency order they always got.
   * Choosing a topic *reorders* new items; it never restricts them, because a
   * learner who picks "food" still needs the function words that hold a
   * sentence together.
   */
  topics?: string[];
}

/** SPEC §4.2: three abilities are estimated separately, never collapsed. */
export type AbilityDimension = 'vocab' | 'listening' | 'grammar' | 'production';

export interface Ability {
  profileId: string;
  lang: TargetLang;
  dimension: AbilityDimension;
  /** Logit-scale ability estimate. */
  theta: number;
  /** SPEC §4.1: reported to the learner as an uncertainty band, never a point. */
  standardError: number;
  updatedAt: Timestamp;
}

export type ItemKind = 'lexeme' | 'sentence' | 'kanji' | 'grammar' | 'chunk';

export interface Item {
  id: string;
  lang: TargetLang;
  kind: ItemKind;
  headword: string;
  reading?: string;
  /**
   * Optional: no Indonesian gloss source is licence-cleared yet (risk R3), so
   * M1/M2 content carries none. Meaning is conveyed by `anchorSentenceIds`
   * instead, which is what SPEC §2.5 asks for anyway.
   */
  glossId?: string;
  /**
   * Example sentences this item is taught through, easiest first. Not in the
   * SPEC §6 shape, but §2.5 makes the anchor a property of the item, and *which*
   * example a learner meets first is a pedagogical choice the pipeline makes —
   * not something to rediscover by query at session time.
   */
  anchorSentenceIds: string[];
  freqRank: number;
  band: FrequencyBand;
  /**
   * Share of corpus tokens this word accounts for, from the pipeline (SPEC §9).
   * Optional: it is what turns "you know N words" into "you understand X% of
   * what you read", and only the English pipeline emits it so far.
   */
  share?: number;
  /**
   * CEFR (`A1`…`C2`) or JLPT (`N5`…`N1`) tag — SPEC §4.1. Optional, and absent
   * for everything M1 ships: no licence-cleared CEFR-aligned wordlist exists
   * yet, and deriving a CEFR label from corpus frequency would be precisely
   * the fake precision SPEC §2.15 bans. `band` is the honest signal until a
   * real alignment is available.
   */
  levelTag?: string;
  /** SPEC §2.11: kanji components, e.g. 校 → ['木', '交']. */
  componentsOf?: string[];
  /**
   * Chunks only (SPEC §2.5): the Indonesian meaning, and the L1 trap where
   * there is one.
   *
   * A lexeme's meaning comes from its anchor sentences and, where one exists,
   * the gloss shard — but a chunk is authored *with* its meaning, because the
   * whole reason it is an item is that its parts do not add up to it. Carrying
   * two short authored strings on the item is cheaper than a shard lookup for
   * ninety-six rows, and it keeps the authored content and its licence
   * together.
   */
  gloss?: string;
  chunkNote?: string;
  /**
   * Chunks only: the example sentences, carried on the item.
   *
   * A lexeme's anchors are ids resolved against `anchors.b<band>.json`, which
   * is the curated subset a band's vocabulary is taught through (D19). A chunk
   * draws its anchors from the whole corpus, so that lookup missed silently —
   * the task came back null and the session skipped the item. Carrying the
   * sentences makes the failure impossible rather than unlikely.
   */
  examples?: Array<{
    id: string;
    text: string;
    difficulty: number;
    maxRank: number;
    tr: { id: string; text: string };
    tokens?: string[];
    readings?: string[];
  }>;
  /** SPEC §3: contrastive category IDs this item exercises. */
  interferenceTags: string[];
  sourceRef: SourceRef;
}

/** Provenance for the attribution screen and the license gate (SPEC §5.2). */
export interface SourceRef {
  /** Dataset key — must exist in data/licenses.json. */
  dataset: string;
  /** Stable identifier within that dataset (e.g. a Tatoeba sentence id). */
  externalId: string;
}

export interface Sentence {
  id: string;
  lang: ContentLang;
  text: string;
  /** Japanese is tokenized at build time (SPEC §5.1), never naively split. */
  tokens: string[];
  /** Id of the Indonesian translation sentence (SPEC §2.5). */
  translationId: string;
  audioRef?: string;
  /**
   * Frequency band of the shard this sentence shipped in. Not in the SPEC §6
   * shape, but SPEC §2.3 requires multiple-choice distractors from the same
   * band, and rederiving that at query time from token ranks would be both
   * slower and less faithful than the banding the pipeline already did.
   */
  band: FrequencyBand;
  difficulty: number;
  coverageMeta: CoverageMeta;
  sourceRef: SourceRef;
}

/** Precomputed inputs to the i+1 selector (SPEC §2.4). */
export interface CoverageMeta {
  totalTokens: number;
  /** Highest frequency rank among the sentence's tokens. */
  maxFreqRank: number;
  /** Distinct lexeme item ids the sentence contains. */
  lexemeIds: string[];
}

/** SPEC §2.3: a lexeme is a ladder, not a card. */
export type LadderLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface Card {
  id: string;
  profileId: string;
  itemId: string;
  ladderLevel: LadderLevel;
  fsrs: StoredFsrsState;
  /** Mirror of `fsrs.dueAt`, maintained by the card repository, for indexing. */
  dueAt: Timestamp;
  suspended: Flag;
}

/**
 * Serialized `ts-fsrs` card state. Dates become epoch ms; the enum stays
 * numeric. Conversion lives in src/data/fsrsState.ts and is round-trip tested.
 */
export interface StoredFsrsState {
  dueAt: Timestamp;
  stability: number;
  difficulty: number;
  /** Deprecated upstream in ts-fsrs v6; retained until we move off v5. */
  elapsedDays: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  /** ts-fsrs `State`: 0 New, 1 Learning, 2 Review, 3 Relearning. */
  state: 0 | 1 | 2 | 3;
  lastReviewAt: Timestamp | null;
}

/** ts-fsrs `Rating` restricted to the grades a learner can produce. */
export type Grade = 1 | 2 | 3 | 4;

/** SPEC §2.12: one-tap judgment-of-learning signal, asked before the reveal. */
export type Confidence = 'yakin' | 'ragu';

/** SPEC §6 invariant: append-only. Enforced in src/data/db.ts. */
export interface ReviewLog {
  id: string;
  profileId: string;
  cardId: string;
  /**
   * The rung this answer was given at. Under one-card-per-item (decision R5)
   * the FSRS state is shared across rungs, so without this the ladder's effect
   * on accuracy would be unmeasurable — and promotion needs the last three
   * answers *at the current level*.
   */
  ladderLevel: LadderLevel;
  rating: Grade;
  confidence: Confidence | null;
  latencyMs: number;
  /** Exactly what the learner typed/said, for later grader forensics. */
  answerRaw: string;
  correct: Flag;
  /** Contrastive categories the wrong answer matched (SPEC §3.3). */
  interferenceHit?: string[];
  /**
   * This answer was the item's **first**, i.e. the moment the word entered the
   * learner's deck (SPEC §7.2's daily introduction cap).
   *
   * Written rather than derived: "how many new words today" would otherwise mean
   * finding each of today's items' earliest log row, which is a scan of an
   * append-only table that only grows. `recordReview` already knows — it has
   * just queried this card's history to compute promotion — so it costs nothing
   * there and everything to recompute later.
   *
   * Absent on every row written before v1.12.0, which reads correctly as "not
   * an introduction": the counter only ever asks about today.
   */
  introduction?: Flag;
  reviewedAt: Timestamp;
  scheduledDays: number;
  elapsedDays: number;
  stateBefore: StoredFsrsState;
}

/** SPEC §3.3: Elo-style ability estimate per interference category. */
export interface CategoryScore {
  profileId: string;
  lang: TargetLang;
  categoryId: string;
  elo: number;
  attempts: number;
  /**
   * How many of those attempts were right. Not in the SPEC §6 shape, but the
   * heatmap (§3.3) reports accuracy, and deriving it from the Elo rating would
   * be a reconstruction rather than a measurement — the rating is damped and
   * difficulty-weighted, so it does not carry a raw hit count.
   */
  correct: number;
  updatedAt: Timestamp;
}

/**
 * One answer to one contrastive drill (SPEC §3.3).
 *
 * Deliberately not a `ReviewLog`. A drill has no FSRS card behind it — no
 * stability, no due date, nothing to schedule — and filing drill answers among
 * the review logs would put unscheduled items into the retention rate that
 * SPEC §9 promises to report honestly.
 */
export interface DrillAttempt {
  id: string;
  profileId: string;
  lang: TargetLang;
  drillId: string;
  categoryId: string;
  correct: Flag;
  answerRaw: string;
  latencyMs: number;
  answeredAt: Timestamp;
}

/**
 * SPEC §8: one-tap sentence mining from the reader.
 *
 * Deliberately **not** a card. Invariant 0 and SPEC §2.2 say a card is created
 * by the learner's first *answer* — tapping "add this word" is an intention, not
 * a retrieval, and minting a card from it would put an item into the schedule
 * that has never been responded to. So mining records the intention, and the
 * composer introduces the word next session; the card appears when it is
 * answered, like every other card.
 */
export interface MinedItem {
  profileId: string;
  itemId: string;
  /** The sentence the learner mined it from, so it can be taught in context. */
  fromSentenceId: string;
  minedAt: Timestamp;
}

/**
 * SPEC §2.14: *"can always skip an item (belum perlu)"*.
 *
 * A skip is not an answer, so it writes no card, no FSRS state and no review
 * log — invariant 0 and §2.2 both forbid that. What it records is a request not
 * to be shown this for a while, which the composer honours for both new items
 * and cards already due.
 */
export interface DeferredItem {
  profileId: string;
  itemId: string;
  deferredAt: Timestamp;
  /** The composer skips this item until this instant. */
  until: Timestamp;
  /** How many times running it has been declined; each skip defers it longer. */
  times: number;
}

/**
 * One comprehension check on a passage the learner has just read (SPEC §9's
 * reading axis, §2.4).
 *
 * Its own table, for D32's reason exactly: a passage has no FSRS card behind
 * it — nothing scheduled, no stability — so filing these among the review logs
 * would put unscheduled items into the retention rate §9 promises to report
 * honestly, and `ReviewLog.cardId` would be a lie. Append-only, like the other
 * two attempt logs.
 */
export interface ReadingAttempt {
  id: string;
  profileId: string;
  lang: TargetLang;
  passageId: string;
  /** The lexeme that was blanked out of the text. */
  itemId: string;
  correct: Flag;
  answerRaw: string;
  /**
   * Known-token coverage of the passage at the moment it was shown. Kept
   * because a right answer on a text at 0.99 coverage and one at 0.92 are not
   * the same evidence, and the difference is unrecoverable afterwards.
   */
  coverage: number;
  answeredAt: Timestamp;
}

export interface Session {
  id: string;
  profileId: string;
  /**
   * The target language the queue was composed from. `itemIds` only ever holds
   * items of one language, so resuming a session under a different target would
   * hand the learner the other language's content while the UI claims otherwise.
   * Sessions written before v1.0.1 lack it and are simply never resumed.
   */
  lang: TargetLang;
  startedAt: Timestamp;
  endedAt: Timestamp | null;
  plannedMinutes: DailyMinutes;
  itemIds: string[];
  completed: Flag;
  /** SPEC §2.13: index into `itemIds`; persisted after every single answer. */
  resumeCursor: number;
}

/** SPEC §2.11: learner-edited mnemonics beat given ones, so they win on sync. */
export interface Mnemonic {
  profileId: string;
  itemId: string;
  text: string;
  authoredByUser: Flag;
  updatedAt: Timestamp;
}

/**
 * Import bookkeeping for a generated content shard. Keyed by path, holding the
 * hash the manifest published, so an unchanged shard is never reimported and a
 * changed one always is (SPEC §5.3 cache-busting).
 */
export interface ContentShard {
  path: string;
  lang: TargetLang;
  sha256: string;
  importedAt: Timestamp;
  sentences: number;
  items: number;
}

/** SPEC §2.13: implementation intention — "setelah <cue>, di <place>". */
export interface Habit {
  id: string;
  profileId: string;
  cue: string;
  place: string;
  /** Local wall-clock time, `HH:mm`. */
  notificationTime: string;
  enabled: Flag;
}
