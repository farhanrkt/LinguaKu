import { db } from './db.ts';
import type {
  Ability,
  Card,
  CategoryScore,
  DrillAttempt,
  Habit,
  Mnemonic,
  Profile,
  ReviewLog,
  Session,
} from './types.ts';

/**
 * SPEC §9: *"Export everything as JSON. The learner owns their data. No account
 * required to export."*
 *
 * What "everything" means here is everything the learner *made* — the profile,
 * the schedule, every review they have ever answered, their drill history, their
 * mnemonics. What it excludes is generated content: the lexeme shards are
 * downloaded, identical for everyone, and re-fetched on demand, so shipping four
 * megabytes of Tatoeba inside a personal backup would make the file unusable to
 * carry around and would not preserve anything that could be lost.
 *
 * The acceptance test is a round trip into a *fresh install* (SPEC §12 M5), so
 * import has to be able to build a working profile from nothing.
 */

export const EXPORT_VERSION = 1;

export interface ExportBundle {
  format: 'linguaku-export';
  version: number;
  exportedAt: number;
  /** Which profile this is, so an import knows what it is restoring. */
  profileId: string;
  profile: Profile;
  abilities: Ability[];
  cards: Card[];
  reviewLogs: ReviewLog[];
  categoryScores: CategoryScore[];
  drillAttempts: DrillAttempt[];
  sessions: Session[];
  mnemonics: Mnemonic[];
  habits: Habit[];
}

export const exportProfile = async (
  profileId: string,
  now: number,
): Promise<ExportBundle> => {
  const profile = await db.profiles.get(profileId);
  if (!profile) throw new Error(`no such profile: ${profileId}`);

  const [abilities, cards, reviewLogs, categoryScores, drillAttempts, sessions, mnemonics, habits] =
    await Promise.all([
      db.abilities.where('profileId').equals(profileId).toArray(),
      db.cards.where('profileId').equals(profileId).toArray(),
      db.reviewLogs.where('profileId').equals(profileId).toArray(),
      db.categoryScores.where('profileId').equals(profileId).toArray(),
      db.drillAttempts.where('profileId').equals(profileId).toArray(),
      db.sessions.where('[profileId+startedAt]').between([profileId, -Infinity], [profileId, Infinity]).toArray(),
      db.mnemonics.filter((row) => row.profileId === profileId).toArray(),
      db.habits.where('profileId').equals(profileId).toArray(),
    ]);

  return {
    format: 'linguaku-export',
    version: EXPORT_VERSION,
    exportedAt: now,
    profileId,
    profile,
    abilities,
    cards,
    reviewLogs,
    categoryScores,
    drillAttempts,
    sessions,
    mnemonics,
    habits,
  };
};

export class ImportError extends Error {
  override readonly name = 'ImportError';
}

const isBundle = (value: unknown): value is ExportBundle => {
  if (typeof value !== 'object' || value === null) return false;
  const bundle = value as Partial<ExportBundle>;
  return (
    bundle.format === 'linguaku-export' &&
    typeof bundle.version === 'number' &&
    typeof bundle.profile === 'object' &&
    bundle.profile !== null &&
    Array.isArray(bundle.reviewLogs) &&
    Array.isArray(bundle.cards)
  );
};

export const parseBundle = (text: string): ExportBundle => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ImportError('not valid JSON');
  }
  if (!isBundle(parsed)) throw new ImportError('not a LinguaKu export');
  if (parsed.version > EXPORT_VERSION) {
    throw new ImportError(
      `export is version ${parsed.version}; this app understands up to ${EXPORT_VERSION}`,
    );
  }
  return parsed;
};

export interface ImportResult {
  profileId: string;
  cards: number;
  /** Logs actually added — a re-import of the same bundle adds none. */
  reviewLogs: number;
  drillAttempts: number;
}

/**
 * Restores a bundle. **The log merges; everything else is overwritten.**
 *
 * That split is not a convenience, it is SPEC §6's invariant read literally:
 * *"all writes are idempotent and keyed so sync is last-write-wins per card with
 * the log as tiebreaker."*
 *
 *  - `ReviewLog` and `DrillAttempt` are **append-only** and keyed by UUID, so an
 *    import adds the rows it does not already have and touches nothing else.
 *    Importing the same file twice is therefore a no-op, and importing a second
 *    device's backup unions the two histories — which is what an append-only log
 *    with unique keys means. Deleting them to "replace" was the first thing this
 *    function tried, and the Dexie hook rejected it; the hook was right.
 *  - Cards, abilities, scores and sessions are **current state**, so the bundle
 *    wins. Interleaving two schedules for one card after the fact is not
 *    something we can do correctly, and pretending otherwise would corrupt the
 *    schedule silently.
 *
 * The consequence worth stating: a restore never destroys review history. The
 * only way to lose it is a full reset, which drops the database.
 */
export const importProfile = async (bundle: ExportBundle): Promise<ImportResult> => {
  const profileId = bundle.profile.id;
  let addedLogs = 0;
  let addedAttempts = 0;

  await db.transaction(
    'rw',
    [
      db.profiles,
      db.abilities,
      db.cards,
      db.reviewLogs,
      db.categoryScores,
      db.drillAttempts,
      db.sessions,
      db.mnemonics,
      db.habits,
    ],
    async () => {
      await db.profiles.put(bundle.profile);
      await db.abilities.bulkPut(bundle.abilities ?? []);
      await db.cards.bulkPut(bundle.cards ?? []);
      await db.categoryScores.bulkPut(bundle.categoryScores ?? []);
      await db.sessions.bulkPut(bundle.sessions ?? []);
      await db.habits.bulkPut(bundle.habits ?? []);

      // Mnemonics are last-write-wins **by timestamp**, not "the bundle wins".
      // SPEC §2.11 requires user-authored mnemonics to persist, and the finding
      // behind it is that a learner's own mnemonic works better than any we
      // ship — so restoring last month's backup must not silently undo the
      // version they rewrote yesterday. This is the one table where the
      // incoming row can lose.
      const mnemonics = bundle.mnemonics ?? [];
      const current = await db.mnemonics.bulkGet(
        mnemonics.map((row) => [row.profileId, row.itemId] as [string, string]),
      );
      const newer = mnemonics.filter((row, index) => {
        const existing = current[index];
        return !existing || row.updatedAt > existing.updatedAt;
      });
      if (newer.length > 0) await db.mnemonics.bulkPut(newer);

      const logs = bundle.reviewLogs ?? [];
      const knownLogs = new Set(
        (await db.reviewLogs.bulkGet(logs.map((log) => log.id)))
          .filter((row) => row !== undefined)
          .map((row) => row.id),
      );
      const newLogs = logs.filter((log) => !knownLogs.has(log.id));
      if (newLogs.length > 0) await db.reviewLogs.bulkAdd(newLogs);
      addedLogs = newLogs.length;

      const attempts = bundle.drillAttempts ?? [];
      const knownAttempts = new Set(
        (await db.drillAttempts.bulkGet(attempts.map((attempt) => attempt.id)))
          .filter((row) => row !== undefined)
          .map((row) => row.id),
      );
      const newAttempts = attempts.filter((attempt) => !knownAttempts.has(attempt.id));
      if (newAttempts.length > 0) await db.drillAttempts.bulkAdd(newAttempts);
      addedAttempts = newAttempts.length;
    },
  );

  return {
    profileId,
    cards: bundle.cards?.length ?? 0,
    reviewLogs: addedLogs,
    drillAttempts: addedAttempts,
  };
};

/** Stable, human-readable, and sorted by date when a folder is listed. */
export const exportFilename = (now: number): string =>
  `linguaku-${new Date(now).toISOString().slice(0, 10)}.json`;
