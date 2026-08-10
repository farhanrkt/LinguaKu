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
   * CEFR (`A1`…`C2`) or JLPT (`N5`…`N1`) tag — SPEC §4.1. Optional, and absent
   * for everything M1 ships: no licence-cleared CEFR-aligned wordlist exists
   * yet, and deriving a CEFR label from corpus frequency would be precisely
   * the fake precision SPEC §2.15 bans. `band` is the honest signal until a
   * real alignment is available.
   */
  levelTag?: string;
  /** SPEC §2.11: kanji components, e.g. 校 → ['木', '交']. */
  componentsOf?: string[];
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
  updatedAt: Timestamp;
}

export interface Session {
  id: string;
  profileId: string;
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
