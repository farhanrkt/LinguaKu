import { db } from '../db.ts';
import type { DailyMinutes, Profile, ScriptMode, TargetLang } from '../types.ts';

/**
 * SPEC §10: no signup. An anonymous local profile is created on first launch;
 * an account is only ever an optional upgrade for sync.
 */

export const newProfileId = (): string => crypto.randomUUID();

export const defaultScriptMode = (targets: TargetLang[]): ScriptMode =>
  // SPEC §4.3: Japanese starts at kana, not romaji — romaji is deprecated the
  // moment kana is fluent, so we never make it the default entry point.
  targets.includes('ja') ? 'kana' : 'kanji';

export interface CreateProfileInput {
  targets: TargetLang[];
  dailyMinutes: DailyMinutes;
  now: number;
}

export const createProfile = async (input: CreateProfileInput): Promise<Profile> => {
  const profile: Profile = {
    id: newProfileId(),
    uiLang: 'id',
    targets: input.targets,
    dailyMinutes: input.dailyMinutes,
    scriptMode: defaultScriptMode(input.targets),
    createdAt: input.now,
  };
  await db.profiles.add(profile);
  return profile;
};

/** The active profile, or `null` before first launch has completed. */
export const getCurrentProfile = async (): Promise<Profile | null> => {
  const profiles = await db.profiles.orderBy('createdAt').toArray();
  return profiles[0] ?? null;
};

export const updateProfile = async (
  id: string,
  changes: Partial<Pick<Profile, 'targets' | 'dailyMinutes' | 'scriptMode'>>,
): Promise<void> => {
  await db.profiles.update(id, changes);
};
