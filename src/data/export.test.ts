import { beforeEach, describe, expect, it } from 'vitest';
import { db, DB_NAME } from './db.ts';
import {
  exportFilename,
  exportProfile,
  importProfile,
  ImportError,
  parseBundle,
} from './export.ts';
import { createProfile } from './repositories/profiles.ts';
import { recordReview } from './repositories/reviews.ts';
import { recordDrillAnswer } from './repositories/contrastive.ts';
import { saveAbility } from './repositories/abilities.ts';
import { getMnemonic, saveMnemonic } from './repositories/mnemonics.ts';

/**
 * M5 acceptance (SPEC §12): *"export round-trips into a fresh install."*
 *
 * "Fresh install" is the load-bearing phrase. It is not enough for the bundle to
 * contain the right rows; a learner who lost their phone has an empty database
 * and a file, and everything they built has to come back out of it.
 */

const NOW = Date.UTC(2026, 7, 11, 9, 0, 0);
const DAY = 86_400_000;

/** A learner with a real history: reviews, a drill, an ability, a mnemonic. */
const buildHistory = async () => {
  const profile = await createProfile({ targets: ['en'], dailyMinutes: 8, now: NOW });

  for (let i = 0; i < 12; i++) {
    await recordReview({
      profileId: profile.id,
      itemId: `en:lex:w${i % 4}`,
      grade: i % 5 === 0 ? 1 : 3,
      confidence: i % 2 === 0 ? 'yakin' : 'ragu',
      latencyMs: 1_500 + i,
      answerRaw: `w${i % 4}`,
      correct: i % 5 !== 0,
      now: NOW + i * DAY,
      ...(i % 5 === 0 ? { interferenceHit: ['PRONOUN_GENDER'] } : {}),
    });
  }

  await recordDrillAnswer({
    profileId: profile.id,
    lang: 'en',
    drillId: 'ARTICLES-1',
    categoryId: 'ARTICLES',
    correct: false,
    answerRaw: 'a',
    latencyMs: 3_000,
    now: NOW + 20 * DAY,
  });

  await saveAbility(profile.id, 'en', 'vocab', { theta: 0.4, standardError: 0.29 }, NOW);
  await db.mnemonics.put({
    profileId: profile.id,
    itemId: 'en:lex:w1',
    text: 'ingat: w1 seperti wahyu',
    authoredByUser: 1,
    updatedAt: NOW,
  });
  await db.habits.put({
    id: 'h1',
    profileId: profile.id,
    cue: 'sarapan',
    place: 'meja makan',
    notificationTime: '07:30',
    enabled: 1,
  });

  return profile;
};

/** Drops the database the way a new device would have it: not there at all. */
const freshInstall = async () => {
  db.close();
  await db.delete();
  await db.open();
};

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('exportProfile', () => {
  it('carries everything the learner made', async () => {
    const profile = await buildHistory();
    const bundle = await exportProfile(profile.id, NOW);

    expect(bundle.format).toBe('linguaku-export');
    expect(bundle.profile.id).toBe(profile.id);
    expect(bundle.reviewLogs).toHaveLength(12);
    expect(bundle.cards.length).toBeGreaterThan(0);
    expect(bundle.drillAttempts).toHaveLength(1);
    expect(bundle.categoryScores.length).toBeGreaterThan(0);
    expect(bundle.abilities).toHaveLength(1);
    expect(bundle.mnemonics).toHaveLength(1);
    expect(bundle.habits).toHaveLength(1);
  });

  it('leaves generated content out of a personal backup', async () => {
    const profile = await buildHistory();
    const bundle = await exportProfile(profile.id, NOW) as unknown as Record<string, unknown>;
    // Shards are identical for everyone and re-downloadable; four megabytes of
    // Tatoeba inside a backup would preserve nothing and cost the learner data.
    expect(bundle['items']).toBeUndefined();
    expect(bundle['sentences']).toBeUndefined();
    expect(bundle['contentShards']).toBeUndefined();
  });

  it('scopes strictly to one profile', async () => {
    const mine = await buildHistory();
    const theirs = await createProfile({ targets: ['ja'], dailyMinutes: 4, now: NOW });
    await recordReview({
      profileId: theirs.id,
      itemId: 'en:lex:other',
      grade: 3,
      confidence: null,
      latencyMs: 900,
      answerRaw: 'x',
      correct: true,
      now: NOW,
    });

    const bundle = await exportProfile(mine.id, NOW);
    expect(bundle.reviewLogs.every((log) => log.profileId === mine.id)).toBe(true);
    expect(bundle.cards.every((card) => card.profileId === mine.id)).toBe(true);
  });

  it('refuses to export a profile that is not there', async () => {
    await expect(exportProfile('nobody', NOW)).rejects.toThrow();
  });

  it('names the file so a folder of them sorts by date', () => {
    expect(exportFilename(NOW)).toBe('linguaku-2026-08-11.json');
  });
});

describe('round trip into a fresh install (M5 acceptance)', () => {
  it('restores every row, byte for byte, through JSON', async () => {
    const profile = await buildHistory();
    const before = await exportProfile(profile.id, NOW);
    // Through a string, as a real backup would be: this is what catches a Date
    // or a Map that only looks like it survives (D5).
    const text = JSON.stringify(before);

    await freshInstall();
    expect(await db.reviewLogs.count()).toBe(0);

    const result = await importProfile(parseBundle(text));
    expect(result.profileId).toBe(profile.id);
    expect(result.reviewLogs).toBe(12);

    const after = await exportProfile(profile.id, NOW);
    expect(after.profile).toEqual(before.profile);
    expect(after.cards).toEqual(before.cards);
    expect(after.reviewLogs).toEqual(before.reviewLogs);
    expect(after.categoryScores).toEqual(before.categoryScores);
    expect(after.drillAttempts).toEqual(before.drillAttempts);
    expect(after.abilities).toEqual(before.abilities);
    expect(after.mnemonics).toEqual(before.mnemonics);
    expect(after.habits).toEqual(before.habits);
  });

  it('leaves the restored profile usable, not just present', async () => {
    const profile = await buildHistory();
    const text = JSON.stringify(await exportProfile(profile.id, NOW));

    await freshInstall();
    await importProfile(parseBundle(text));

    // The schedule still works: a card can be reviewed and the log appended.
    await recordReview({
      profileId: profile.id,
      itemId: 'en:lex:w0',
      grade: 3,
      confidence: 'yakin',
      latencyMs: 800,
      answerRaw: 'w0',
      correct: true,
      now: NOW + 60 * DAY,
    });
    expect(await db.reviewLogs.count()).toBe(13);
  });

  it('keeps `dueAt` in step with the FSRS state it was imported with', async () => {
    // The derived mirror is maintained by a Dexie hook (D8), and an import that
    // wrote rows without triggering it would leave the composer querying a
    // stale index.
    const profile = await buildHistory();
    const text = JSON.stringify(await exportProfile(profile.id, NOW));

    await freshInstall();
    await importProfile(parseBundle(text));

    for (const card of await db.cards.toArray()) {
      expect(card.dueAt).toBe(card.fsrs.dueAt);
    }
  });

  it('is a no-op when the same file is imported twice', async () => {
    const profile = await buildHistory();
    const bundle = await exportProfile(profile.id, NOW);

    const first = await importProfile(bundle);
    const second = await importProfile(bundle);

    // Twice imported, once present. Appending would double a learner's history
    // and quietly corrupt every retention number computed from it.
    expect(await db.reviewLogs.count()).toBe(12);
    expect(await db.drillAttempts.count()).toBe(1);
    // And the second import says honestly that it added nothing.
    expect(first.reviewLogs).toBe(0);
    expect(second.reviewLogs).toBe(0);
  });

  it('unions two histories rather than losing one', async () => {
    // The append-only log keyed by UUID means a restore can only ever *add*
    // reviews. Losing history to a restore is the failure this rules out.
    const profile = await buildHistory();
    const backup = await exportProfile(profile.id, NOW);

    await recordReview({
      profileId: profile.id,
      itemId: 'en:lex:since-the-backup',
      grade: 3,
      confidence: null,
      latencyMs: 700,
      answerRaw: 'x',
      correct: true,
      now: NOW + 90 * DAY,
    });
    expect(await db.reviewLogs.count()).toBe(13);

    await importProfile(backup);
    // The restore did not delete the review answered after the backup was taken.
    expect(await db.reviewLogs.count()).toBe(13);
  });
});

describe('parseBundle', () => {
  it('rejects something that is not JSON', () => {
    expect(() => parseBundle('{oh no')).toThrow(ImportError);
  });

  it('rejects JSON that is not one of ours', () => {
    expect(() => parseBundle('{"hello":"world"}')).toThrow(ImportError);
  });

  it('refuses a bundle from a newer version rather than mangling it', () => {
    const future = JSON.stringify({
      format: 'linguaku-export',
      version: 99,
      profile: { id: 'p' },
      cards: [],
      reviewLogs: [],
    });
    expect(() => parseBundle(future)).toThrow(/version 99/);
  });

  it('accepts a bundle this version wrote', async () => {
    const profile = await buildHistory();
    const text = JSON.stringify(await exportProfile(profile.id, NOW));
    expect(parseBundle(text).profileId).toBe(profile.id);
  });
});

describe('the append-only invariant survives an import', () => {
  it('still refuses to update a log after a restore', async () => {
    const profile = await buildHistory();
    const text = JSON.stringify(await exportProfile(profile.id, NOW));
    await freshInstall();
    await importProfile(parseBundle(text));

    const [log] = await db.reviewLogs.toArray();
    expect(log).toBeDefined();
    // Import is the one place logs are deleted, and only to replace them
    // wholesale. Ordinary mutation stays impossible (invariant 1).
    await expect(db.reviewLogs.update(log!.id, { rating: 4 })).rejects.toThrow();
  });

  it('imports into a database that has never seen this profile', async () => {
    const profile = await buildHistory();
    const text = JSON.stringify(await exportProfile(profile.id, NOW));

    db.close();
    await db.delete();
    const fresh = new (await import('./db.ts')).LinguaKuDb(DB_NAME);
    await fresh.open();
    fresh.close();
    await db.open();

    await importProfile(parseBundle(text));
    expect(await db.reviewLogs.count()).toBe(12);
  });
});

/**
 * SPEC §2.11: *"user-authored mnemonics persist and survive sync"*. Sync is M7,
 * but export/import is the round trip that exists now, and the finding behind
 * the requirement — self-generated mnemonics beat given ones — is exactly why
 * losing one in a restore would matter.
 */
describe('user-authored mnemonics survive the round trip (SPEC §2.11)', () => {
  it('carries an edited mnemonic through export and back', async () => {
    const profile = await createProfile({ targets: ['ja'], dailyMinutes: 4, now: NOW });
    await saveMnemonic(profile.id, 'ja:kanji:校', '校 = pohon (木) di persimpangan (交) jalan', NOW);

    const text = JSON.stringify(await exportProfile(profile.id, NOW));
    db.close();
    await db.delete();
    await db.open();

    await importProfile(parseBundle(text));
    const restored = await getMnemonic(profile.id, 'ja:kanji:校');
    expect(restored?.text).toBe('校 = pohon (木) di persimpangan (交) jalan');
    // The flag is what makes it win over a shipped baseline, so it has to survive.
    expect(restored?.authoredByUser).toBe(1);
  });

  it('keeps the learner’s version when a bundle would overwrite it', async () => {
    const profile = await createProfile({ targets: ['ja'], dailyMinutes: 4, now: NOW });
    await saveMnemonic(profile.id, 'ja:kanji:校', 'versi lama', NOW);
    const stale = await exportProfile(profile.id, NOW);

    await saveMnemonic(profile.id, 'ja:kanji:校', 'versi baru yang lebih bagus', NOW + DAY);
    await importProfile(stale);

    // Cards and scores are current state and the bundle wins (D37) — but a
    // mnemonic the learner rewrote after the backup is the thing §2.11 says is
    // working. Restoring an older file must not silently undo it.
    const kept = await getMnemonic(profile.id, 'ja:kanji:校');
    expect(kept?.text).toBe('versi baru yang lebih bagus');
  });
});
