import { db } from '../db.ts';
import { bandForAbility, priorFor, type AbilityEstimate } from '../../core/placement.ts';
import type { FrequencyBand } from '../../core/frequency.ts';
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
  if (stored) return { theta: stored.theta, standardError: stored.standardError };
  // Per language (D3): Japanese starts at band 1, English mid-frequency.
  const prior = priorFor(lang);
  return { theta: prior.mean, standardError: prior.sd };
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

// ------------------------------------------------------------ the frontier

/** The last band with words in it: band 6 is ranks past 8,000, and has none. */
export const LAST_WORD_BAND: FrequencyBand = 5;

/** Share of a band the learner must have started before the next one opens. */
const BAND_FINISHED = 0.9;

/**
 * The band new words come from — one answer for the composer, the content
 * import, the reader and the learning path.
 *
 * They used to disagree. Placement could say "tingkat 6" while only bands 1–3
 * were ever imported, so a learner who claimed to know 2,000 words was taught
 * ranks 1,001–1,005; the path said "Tahap 1 — kamu di sini" while sessions
 * taught stage 3; and nothing ever opened band 4 — 65% of English and 71% of
 * Japanese lexemes could not be reached at all. The ability estimate sets the
 * frontier, capped at the last band with words, and it climbs past a band the
 * learner has (nearly) finished.
 */
export const learnerFrontier = async (
  profileId: string,
  lang: TargetLang,
): Promise<FrequencyBand> => {
  const estimated = bandForAbility((await vocabularyAbility(profileId, lang)).theta);
  let frontier = Math.min(estimated, LAST_WORD_BAND) as FrequencyBand;
  if (frontier >= LAST_WORD_BAND) return frontier;

  const [items, cards] = await Promise.all([
    db.items.where('[lang+kind]').equals([lang, 'lexeme']).toArray(),
    db.cards.where('profileId').equals(profileId).toArray(),
  ]);
  const started = new Set(cards.map((card) => card.itemId));
  while (frontier < LAST_WORD_BAND) {
    const inBand = items.filter((item) => item.band === frontier);
    // Not imported yet: nothing to judge, so the frontier stays where it is
    // and `learnerBands` imports it.
    if (inBand.length === 0) break;
    const share = inBand.filter((item) => started.has(item.id)).length / inBand.length;
    if (share < BAND_FINISHED) break;
    frontier = (frontier + 1) as FrequencyBand;
  }
  return frontier;
};

/** Every band up to the frontier, and never fewer than the starter three. */
export const learnerBands = async (
  profileId: string,
  lang: TargetLang,
): Promise<FrequencyBand[]> => {
  const frontier = await learnerFrontier(profileId, lang);
  const top = Math.max(3, frontier);
  return Array.from({ length: top }, (_, index) => (index + 1) as FrequencyBand);
};
