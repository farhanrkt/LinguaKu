import { db } from '../db.ts';
import type { Habit, Timestamp } from '../types.ts';

/**
 * SPEC §2.13, the implementation-intention half.
 *
 * The `Habit` row has existed in the schema since M0 and nothing ever wrote it.
 * The finding it implements is Gollwitzer's: an intention bound to a concrete
 * cue and place — *"setiap hari setelah makan malam, saya latihan di kamar"* —
 * is acted on far more often than an unbound one, and the specificity is what
 * does the work. The notification is a prompt for the plan; the plan is the
 * mechanism.
 *
 * One habit per profile. A second cue is not a second habit, it is a diluted
 * one, and §2.14 is explicit that this app does not push the learner harder.
 */

export interface SaveHabitInput {
  profileId: string;
  cue: string;
  place: string;
  /** Local wall-clock time, `HH:mm`. */
  notificationTime: string;
  enabled: boolean;
}

export const getHabit = async (profileId: string): Promise<Habit | null> =>
  (await db.habits.where('profileId').equals(profileId).first()) ?? null;

export const saveHabit = async (input: SaveHabitInput): Promise<Habit> => {
  const existing = await getHabit(input.profileId);
  const habit: Habit = {
    id: existing?.id ?? crypto.randomUUID(),
    profileId: input.profileId,
    cue: input.cue.trim(),
    place: input.place.trim(),
    notificationTime: input.notificationTime,
    enabled: input.enabled ? 1 : 0,
  };
  await db.habits.put(habit);
  return habit;
};

export const setHabitEnabled = async (profileId: string, enabled: boolean): Promise<void> => {
  const habit = await getHabit(profileId);
  if (!habit) return;
  await db.habits.update(habit.id, { enabled: enabled ? 1 : 0 });
};

/**
 * When the learner last finished any work, used by the in-app cue so it never
 * surfaces for someone who has already practised today.
 *
 * Sessions rather than review logs: a session the learner opened and abandoned
 * without answering is not practice, and `startedAt` would count it as such.
 */
export const lastPractisedAt = async (profileId: string): Promise<Timestamp | null> => {
  const sessions = await db.sessions.where('profileId').equals(profileId).toArray();
  const finished = sessions
    .map((session) => session.endedAt)
    .filter((at): at is Timestamp => at !== null);
  return finished.length > 0 ? Math.max(...finished) : null;
};
