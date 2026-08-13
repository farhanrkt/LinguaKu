import { db } from '../db.ts';
import { PRIOR_MEAN, PRIOR_SD, type AbilityEstimate } from '../../core/placement.ts';
import { estimateListening, type ListeningAnswer } from '../../core/listening.ts';
import { AUDIO_LEVEL } from '../../core/ladder.ts';
import type { Ability, AbilityDimension, TargetLang, Timestamp } from '../types.ts';

/**
 * SPEC §4.2: three abilities are estimated **separately** and never collapsed
 * into one number.
 *
 * `vocab` has been measured since M3, from placement and then continuously.
 * `listening` joins it here, estimated from L4 dictation answers rather than
 * from placement — see src/core/listening.ts for why that is the right place
 * for it and why minimal-pair drills are deliberately not in the estimate.
 *
 * `grammar` still has no row: the contrastive engine measures it as a per
 * category Elo (§3.3), which is a richer answer than one theta and is what the
 * heatmap reports. Storing a fabricated estimate would be worse than storing
 * none — SPEC §2.15 bans fake precision, and a dimension with no row is legible
 * as "not measured yet", which is the truth.
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

/**
 * Collects every L4 answer this learner has given in this language, in the
 * shape the 1PL estimator needs.
 *
 * The rung is read from the log rather than from the card, and that matters:
 * one card carries one FSRS state across the whole ladder (D18), so a card
 * sitting at L5 today says nothing about which of its answers were dictation.
 * `ReviewLog.ladderLevel` is the record of what was actually on screen.
 */
export const listeningEvidence = async (
  profileId: string,
  lang: TargetLang,
): Promise<ListeningAnswer[]> => {
  const logs = await db.reviewLogs
    .where('[profileId+reviewedAt]')
    .between([profileId, 0], [profileId, Number.MAX_SAFE_INTEGER])
    .toArray();
  const dictation = logs.filter((log) => log.ladderLevel === AUDIO_LEVEL);
  if (dictation.length === 0) return [];

  const cards = await db.cards.bulkGet([...new Set(dictation.map((log) => log.cardId))]);
  const itemIdByCard = new Map(cards.flatMap((card) => (card ? [[card.id, card.itemId]] : [])));
  const items = await db.items.bulkGet([...new Set([...itemIdByCard.values()])]);
  const itemById = new Map(items.flatMap((item) => (item ? [[item.id, item]] : [])));

  return dictation.flatMap((log) => {
    const itemId = itemIdByCard.get(log.cardId);
    const item = itemId === undefined ? undefined : itemById.get(itemId);
    // Another language's dictation is another language's listening ability.
    if (!item || item.lang !== lang) return [];
    return [{ freqRank: item.freqRank, correct: log.correct === 1 }];
  });
};

/**
 * Re-estimates listening from the evidence so far, and stores it if there is
 * enough. Called when a session ends — SPEC §4.2's *"re-estimate continuously;
 * never make the learner retake anything"*, read literally.
 *
 * Writes nothing when the estimate is null. That is the whole point: a learner
 * whose device cannot speak has no listening evidence, and the absence of the
 * row is what the progress screen renders as an honest gap rather than a zero.
 */
export const refreshListeningAbility = async (
  profileId: string,
  lang: TargetLang,
  now: Timestamp,
): Promise<AbilityEstimate | null> => {
  const estimate = estimateListening(await listeningEvidence(profileId, lang));
  if (estimate === null) return null;
  await saveAbility(profileId, lang, 'listening', estimate, now);
  return estimate;
};
