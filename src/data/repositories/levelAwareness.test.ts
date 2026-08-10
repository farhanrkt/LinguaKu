import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db.ts';
import { planSession } from './sessions.ts';
import { saveAbility } from './abilities.ts';
import { recordReview } from './reviews.ts';
import { difficultyForRank } from '../../core/placement.ts';
import { bandForRank, type FrequencyBand } from '../../core/frequency.ts';
import type { Profile } from '../types.ts';

/**
 * M3 acceptance (SPEC §12): simulated learners of three different levels
 * receive appropriately different content.
 */

const NOW = Date.UTC(2026, 6, 1, 9, 0, 0);
const DAY = 86_400_000;

const profileFor = (id: string): Profile => ({
  id,
  uiLang: 'id',
  targets: ['en'],
  dailyMinutes: 8,
  scriptMode: 'kanji',
  createdAt: NOW,
});

/** A corpus spanning every band, shaped like the real inventory. */
const seedCorpus = async () => {
  for (let i = 0; i < 600; i++) {
    const freqRank = 20 + i * 15; // 20 … ~9000, i.e. bands 1–6
    await db.items.add({
      id: `en:lex:w${i}`,
      lang: 'en',
      kind: 'lexeme',
      headword: `w${i}`,
      anchorSentenceIds: [`tatoeba:eng:${i}`],
      freqRank,
      band: bandForRank(freqRank),
      interferenceTags: [],
      sourceRef: { dataset: 'tatoeba', externalId: `w${i}` },
    });
  }
};

const bandsOf = async (itemIds: readonly string[]): Promise<FrequencyBand[]> => {
  const items = await db.items.bulkGet([...itemIds]);
  return items.flatMap((item) => (item ? [item.band] : []));
};

const mean = (values: readonly number[]): number =>
  values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);

beforeEach(async () => {
  await db.delete();
  await db.open();
  await seedCorpus();
});

describe('level-aware content selection (SPEC §4.3)', () => {
  it('gives three learners of different levels different material', async () => {
    const levels = [
      { id: 'beginner', knownToRank: 200 },
      { id: 'intermediate', knownToRank: 2000 },
      { id: 'advanced', knownToRank: 7500 },
    ];

    const averages: number[] = [];
    for (const level of levels) {
      const profile = profileFor(level.id);
      await db.profiles.add(profile);
      await saveAbility(
        profile.id,
        'en',
        'vocab',
        { theta: difficultyForRank(level.knownToRank), standardError: 0.3 },
        NOW,
      );

      const plan = await planSession(profile, NOW);
      const bands = await bandsOf(plan.session.itemIds);
      expect(bands.length).toBeGreaterThan(0);
      averages.push(mean(bands));
    }

    // Strictly increasing: a stronger learner meets rarer words.
    expect(averages[0]!).toBeLessThan(averages[1]!);
    expect(averages[1]!).toBeLessThan(averages[2]!);
  });

  it('never introduces words beyond the learner’s frontier', async () => {
    const profile = profileFor('beginner');
    await db.profiles.add(profile);
    await saveAbility(
      profile.id,
      'en',
      'vocab',
      { theta: difficultyForRank(200), standardError: 0.3 },
      NOW,
    );

    const plan = await planSession(profile, NOW);
    for (const band of await bandsOf(plan.session.itemIds)) {
      expect(band).toBeLessThanOrEqual(plan.frontier);
    }
  });

  it('does not march an intermediate learner through band 1 again', async () => {
    // The complaint that motivates level gating: an app that starts everyone at
    // "the, a, and" regardless of what they already know.
    const profile = profileFor('intermediate');
    await db.profiles.add(profile);
    await saveAbility(
      profile.id,
      'en',
      'vocab',
      { theta: difficultyForRank(2000), standardError: 0.3 },
      NOW,
    );

    const bands = await bandsOf((await planSession(profile, NOW)).session.itemIds);
    expect(bands.filter((band) => band === 1).length).toBeLessThan(bands.length / 2);
  });

  it('falls back to the prior when the learner skipped placement', async () => {
    const profile = profileFor('unplaced');
    await db.profiles.add(profile);

    const plan = await planSession(profile, NOW);
    // Decision D3: the default profile is an intermediate English speaker.
    expect(plan.frontier).toBe(3);
    expect(plan.session.itemIds.length).toBeGreaterThan(0);
  });
});

describe('new-item throttle (SPEC §7.2)', () => {
  const buildDebt = async (profile: Profile, count: number) => {
    for (let i = 0; i < count; i++) {
      await recordReview({
        profileId: profile.id,
        itemId: `en:lex:w${i}`,
        grade: 3,
        confidence: null,
        latencyMs: 900,
        answerRaw: 'x',
        correct: true,
        now: NOW - 30 * DAY,
      });
    }
  };

  it('introduces new items freely when the learner has no debt', async () => {
    const profile = profileFor('fresh');
    await db.profiles.add(profile);
    const plan = await planSession(profile, NOW);
    expect(plan.throttle.throttled).toBe(false);
    expect(plan.session.itemIds.length).toBeGreaterThan(0);
  });

  it('leaves a learner slightly over capacity alone', async () => {
    // 400 overdue against ~40 reviews a day is a 1.43x week: real pressure, but
    // not the runaway backlog the throttle exists to stop. Cutting new items
    // here would punish an ordinary busy week.
    const profile = profileFor('busy');
    await db.profiles.add(profile);
    await buildDebt(profile, 400);

    const plan = await planSession(profile, NOW);
    expect(plan.throttle.debtRatio).toBeGreaterThan(1);
    expect(plan.throttle.throttled).toBe(false);
  });

  it('stops adding new items when the backlog really is runaway', async () => {
    const profile = profileFor('drowning');
    await db.profiles.add(profile);
    // ~900 overdue against ~40 a day: more than three weeks of work owed today.
    await buildDebt(profile, 900);

    const plan = await planSession(profile, NOW);
    expect(plan.throttle.throttled).toBe(true);
    expect(plan.throttle.allowed).toBe(0);

    // The session is not empty — it is all reviews, which is exactly the point.
    const started = new Set(
      (await db.cards.where('profileId').equals(profile.id).toArray()).map((c) => c.itemId),
    );
    expect(plan.session.itemIds.length).toBeGreaterThan(0);
    for (const itemId of plan.session.itemIds) expect(started.has(itemId)).toBe(true);
  });

  it('clears the throttle once the backlog is worked off', async () => {
    const profile = profileFor('recovering');
    await db.profiles.add(profile);
    await buildDebt(profile, 900);
    expect((await planSession(profile, NOW)).throttle.allowed).toBe(0);

    // Push every card far into the future: what answering them all looks like.
    for (const card of await db.cards.where('profileId').equals(profile.id).toArray()) {
      await db.cards.update(card.id, { fsrs: { ...card.fsrs, dueAt: NOW + 400 * DAY } });
    }

    expect((await planSession(profile, NOW)).throttle.allowed).toBeGreaterThan(0);
  });
});
