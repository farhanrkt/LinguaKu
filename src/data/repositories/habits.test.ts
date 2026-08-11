import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db.ts';
import { getHabit, lastPractisedAt, saveHabit, setHabitEnabled } from './habits.ts';
import type { Session } from '../types.ts';

const NOW = Date.UTC(2026, 7, 11, 9, 0, 0);

const session = (id: string, endedAt: number | null): Session => ({
  id,
  profileId: 'p1',
  lang: 'en',
  startedAt: NOW,
  endedAt,
  plannedMinutes: 4,
  itemIds: ['en:lex:x'],
  completed: endedAt === null ? 0 : 1,
  resumeCursor: 1,
});

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('saveHabit (SPEC §2.13)', () => {
  it('records the implementation intention', async () => {
    const habit = await saveHabit({
      profileId: 'p1',
      cue: 'makan malam',
      place: 'kamar',
      notificationTime: '20:00',
      enabled: true,
    });
    expect(habit).toMatchObject({ cue: 'makan malam', place: 'kamar', enabled: 1 });
    expect(await getHabit('p1')).toMatchObject({ id: habit.id });
  });

  it('keeps one habit per profile rather than accumulating cues', async () => {
    const first = await saveHabit({
      profileId: 'p1',
      cue: 'sarapan',
      place: 'dapur',
      notificationTime: '07:00',
      enabled: true,
    });
    const second = await saveHabit({
      profileId: 'p1',
      cue: 'makan malam',
      place: 'kamar',
      notificationTime: '20:00',
      enabled: true,
    });
    // §2.14: a second cue is a diluted habit, not a second one.
    expect(second.id).toBe(first.id);
    expect(await db.habits.count()).toBe(1);
  });

  it('trims the learner’s text so a stray space is not stored as a cue', async () => {
    const habit = await saveHabit({
      profileId: 'p1',
      cue: '  makan malam  ',
      place: '  kamar ',
      notificationTime: '20:00',
      enabled: true,
    });
    expect(habit.cue).toBe('makan malam');
    expect(habit.place).toBe('kamar');
  });

  it('can be switched off without losing what the learner wrote', async () => {
    await saveHabit({
      profileId: 'p1',
      cue: 'makan malam',
      place: 'kamar',
      notificationTime: '20:00',
      enabled: true,
    });
    await setHabitEnabled('p1', false);
    expect(await getHabit('p1')).toMatchObject({ enabled: 0, cue: 'makan malam' });
  });

  it('returns null for a profile that never set one', async () => {
    expect(await getHabit('nobody')).toBeNull();
  });
});

describe('lastPractisedAt', () => {
  it('is null before anything is finished', async () => {
    expect(await lastPractisedAt('p1')).toBeNull();
  });

  /**
   * An abandoned session is not practice. Counting `startedAt` would let
   * opening the app and closing it suppress the cue — which would quietly turn
   * the habit prompt off for exactly the learner it exists for.
   */
  it('ignores a session that was opened and abandoned', async () => {
    await db.sessions.add(session('s1', null));
    expect(await lastPractisedAt('p1')).toBeNull();
  });

  it('reports the most recent finish', async () => {
    await db.sessions.add(session('s1', NOW));
    await db.sessions.add(session('s2', NOW + 3_600_000));
    await db.sessions.add(session('s3', null));
    expect(await lastPractisedAt('p1')).toBe(NOW + 3_600_000);
  });
});
