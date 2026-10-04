import { db } from '../db.ts';
import type { DailyMinutes, Profile, ScriptMode, TargetLang } from '../types.ts';

/**
 * SPEC §10: no signup. An anonymous local profile is created on first launch;
 * an account is only ever an optional upgrade for sync.
 */

export const newProfileId = (): string => crypto.randomUUID();

/**
 * SPEC §4.3's ladder is *romaji → kana → kanji*, and romaji is the rung you
 * **leave** once kana is fluent — not one the app skips.
 *
 * This used to return `kana` for Japanese, with a comment claiming §4.3 said so:
 * *"romaji is deprecated the moment kana is fluent, so we never make it the
 * default entry point."* That reverses its own source. A beginner who has not
 * been taught a single character was started on the rung above the one they
 * were on, and then shown sentences they could not read — which is exactly what
 * a user reported.
 *
 * Now they start where §4.3 starts them, and the syllabary is taught from the
 * first session (v1.32.0) so the rung is one they can actually leave.
 */
export const defaultScriptMode = (targets: TargetLang[]): ScriptMode =>
  targets.includes('ja') ? 'romaji' : 'kanji';

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
 * SPEC §4.3: Japanese starts at romaji. `scriptMode` was computed once, at profile
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
): ScriptMode => (lang === 'ja' && !previousTargets.includes('ja') ? 'romaji' : current);

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
      | 'dataSaver'
    >
  >,
): Promise<void> => {
  await db.profiles.update(id, changes);
};
