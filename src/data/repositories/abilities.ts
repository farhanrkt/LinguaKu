import { db } from '../db.ts';
import { PRIOR_MEAN, PRIOR_SD, type AbilityEstimate } from '../../core/placement.ts';
import type { Ability, AbilityDimension, TargetLang, Timestamp } from '../types.ts';

/**
 * SPEC §4.2: three abilities are estimated **separately** and never collapsed
 * into one number.
 *
 * M3 measures `vocab` only. Listening cannot be estimated until audio is known
 * to work on the device (risk R1), and grammar has no items until the
 * contrastive engine lands in M4. Storing a fabricated estimate for either
 * would be worse than storing none: SPEC §2.15 bans fake precision, and a
 * dimension with no row is legible as "not measured yet", which is the truth.
 */

export const saveAbility = async (
  profileId: string,
  lang: TargetLang,
  dimension: AbilityDimension,
  estimate: AbilityEstimate,
  now: Timestamp,
): Promise<void> => {
  const ability: Ability = {
    profileId,
    lang,
    dimension,
    theta: estimate.theta,
    standardError: estimate.standardError,
    updatedAt: now,
  };
  await db.abilities.put(ability);
};

export const getAbility = async (
  profileId: string,
  lang: TargetLang,
  dimension: AbilityDimension,
): Promise<Ability | null> => (await db.abilities.get([profileId, lang, dimension])) ?? null;

/**
 * The learner's vocabulary ability, or the prior if placement was skipped.
 *
 * Returning the prior rather than null is what lets every caller stay ignorant
 * of whether placement happened: a skipped placement is simply a learner about
 * whom we know only what the prior says (SPEC §4.2).
 */
export const vocabularyAbility = async (
  profileId: string,
  lang: TargetLang,
): Promise<AbilityEstimate> => {
  const stored = await getAbility(profileId, lang, 'vocab');
  return stored
    ? { theta: stored.theta, standardError: stored.standardError }
    : { theta: PRIOR_MEAN, standardError: PRIOR_SD };
};

export const hasBeenPlaced = async (profileId: string, lang: TargetLang): Promise<boolean> =>
  (await getAbility(profileId, lang, 'vocab')) !== null;
