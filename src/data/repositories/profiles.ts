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

/**
 * `targets[0]` is the language being taught — the content loader, the item
 * queue, the drill picker, the ability estimate and the speech probe all read
 * it. So choosing a language has to put it at the head of the list.
 *
 * Appending, which is what this replaced, left `targets[0]` alone: tapping
 * "Bahasa Jepang" changed the heading on the home screen and taught English.
 * Nothing is dropped, because a language the learner has picked before keeps
 * its ability estimate, its cards and its own resumable session.
 */
export const activateTarget = (targets: TargetLang[], lang: TargetLang): TargetLang[] => [
  lang,
  ...targets.filter((target) => target !== lang),
];

/**
 * SPEC §4.3: Japanese starts at kana. `scriptMode` was computed once, at profile
 * creation, so a learner who began in English carried `kanji` — the
 * not-applicable default for a non-Japanese profile — straight into Japanese,
 * landing an absolute beginner in unfuriganated kanji.
 *
 * The guard is *whether Japanese is new to this profile*, not the mode itself:
 * `kanji` is both the English default and the top of the script ladder, so
 * resetting on its value would demote a learner who had earned it.
 */
export const scriptModeOnSwitch = (
  previousTargets: TargetLang[],
  lang: TargetLang,
  current: ScriptMode,
): ScriptMode => (lang === 'ja' && !previousTargets.includes('ja') ? 'kana' : current);

export const updateProfile = async (
  id: string,
  changes: Partial<
    Pick<
      Profile,
      | 'targets'
      | 'dailyMinutes'
      | 'scriptMode'
      | 'requestRetention'
      | 'topics'
      | 'dailyNewWords'
    >
  >,
): Promise<void> => {
  await db.profiles.update(id, changes);
};
