import { db } from '../db.ts';
import { fetchManifest, type ContentManifest } from '../content.ts';
import { knownItemIds } from '../../core/coverage.ts';
import { retrievability } from '../../core/scheduler.ts';
import { FORECAST_DAYS, forecastLoad, type ForecastDay } from '../../core/forecast.ts';
import {
  bandRates,
  estimateCoverage,
  estimateVocabulary,
  type BandEvidence,
  type BandRate,
  type CoverageEstimate,
  type VocabularyEstimate,
} from '../../core/vocabulary.ts';
import {
  measureCalibration,
  measureConsistency,
  measureRetention,
  TARGET_RETENTION,
  type CalibrationReport,
  type ConsistencyReport,
  type RetentionReport,
} from '../../core/retention.ts';
import { categoryStandings } from './contrastive.ts';
import { vocabularyAbility } from './abilities.ts';
import { rankForAbility } from '../../core/placement.ts';
import { isMastered } from '../../core/ladder.ts';
import type { FrequencyBand } from '../../core/frequency.ts';
import type { Profile, TargetLang, Timestamp } from '../types.ts';

/**
 * Assembles every SPEC §9 figure from local state. Nothing here estimates
 * anything the learner has not generated — the acceptance criterion for M5 is
 * that every item on the progress screen renders from **real local data**.
 *
 * The whole file is a read. It writes nothing, and it must stay that way: a
 * progress screen with a side effect would mean looking at your own numbers
 * changed them.
 */

// ------------------------------------------------------------------ radar

/** SPEC §9's radar axes. */
export type Skill = 'vocab' | 'grammar' | 'listening' | 'reading' | 'production';

export interface SkillPoint {
  skill: Skill;
  /** 0..1, or null when the skill has never been measured. */
  score: number | null;
  /** What the score is derived from, so the UI can say. */
  basis: string;
  answers: number;
}

// ---------------------------------------------------------------- the whole

export interface ProgressReport {
  vocabulary: VocabularyEstimate;
  coverage: CoverageEstimate;
  bands: BandRate[];
  retention: RetentionReport;
  calibration: CalibrationReport;
  consistency: ConsistencyReport;
  forecast: ForecastDay[];
  skills: SkillPoint[];
  mastered: number;
  totalReviews: number;
  /** Frequency rank the placement estimate puts the learner at, if it ran. */
  placedAtRank: number | null;
}

const bandsOf = (manifest: ContentManifest | null): Map<FrequencyBand, number> =>
  new Map((manifest?.coverage?.bandShare ?? []).map((entry) => [entry.band, entry.share]));

export const buildProgressReport = async (
  profile: Profile,
  now: Timestamp,
): Promise<ProgressReport> => {
  const lang: TargetLang = profile.targets[0] ?? 'en';

  const manifest = await fetchManifest(lang).catch(() => null);
  const shareByBand = bandsOf(manifest);
  const teachableShare = manifest?.coverage?.teachableShare ?? 0;

  const [items, cards, logs] = await Promise.all([
    db.items.where('[lang+kind]').equals([lang, 'lexeme']).toArray(),
    db.cards.where('profileId').equals(profile.id).toArray(),
    db.reviewLogs
      .where('[profileId+reviewedAt]')
      .between([profile.id, 0], [profile.id, Number.MAX_SAFE_INTEGER])
      .toArray(),
  ]);

  const known = knownItemIds(cards, now);
  const cardByItem = new Map(cards.map((card) => [card.itemId, card]));

  // ------------------------------------------------------- band evidence
  const evidence = new Map<FrequencyBand, BandEvidence>();
  let knownShare = 0;
  for (const item of items) {
    const band = item.band;
    const entry =
      evidence.get(band) ??
      ({
        band,
        total: 0,
        seen: 0,
        known: 0,
        share: shareByBand.get(band) ?? 0,
      } satisfies BandEvidence);
    entry.total++;
    if (cardByItem.has(item.id)) entry.seen++;
    if (known.has(item.id)) {
      entry.known++;
      knownShare += item.share ?? 0;
    }
    evidence.set(band, entry);
  }
  const bandEvidence = [...evidence.values()].sort((a, b) => a.band - b.band);

  // ------------------------------------------------------------- skills
  const standings = await categoryStandings(
    profile.id,
    lang,
    // Only categories the learner has actually met; the heatmap lists the rest.
    (await db.categoryScores.where('[profileId+lang]').equals([profile.id, lang]).toArray()).map(
      (row) => row.categoryId,
    ),
  );
  const grammarAnswers = standings.reduce((sum, standing) => sum + standing.attempts, 0);
  const grammarCorrect = standings.reduce((sum, standing) => sum + standing.correct, 0);

  const listeningLogs = logs.filter((log) => log.ladderLevel >= 4);
  const vocabAnswers = logs.filter((log) => log.ladderLevel <= 3);

  const rate = (correct: number, total: number): number | null =>
    total > 0 ? correct / total : null;

  const skills: SkillPoint[] = [
    {
      skill: 'vocab',
      score: rate(vocabAnswers.filter((log) => log.correct === 1).length, vocabAnswers.length),
      basis: 'kartu kosakata',
      answers: vocabAnswers.length,
    },
    {
      skill: 'grammar',
      score: rate(grammarCorrect, grammarAnswers),
      basis: 'latihan pola',
      answers: grammarAnswers,
    },
    {
      skill: 'listening',
      score: rate(listeningLogs.filter((log) => log.correct === 1).length, listeningLogs.length),
      basis: 'dikte',
      answers: listeningLogs.length,
    },
    // SPEC §9 names five axes. Two of them have no items at all yet — the reader
    // is M7 and free production is M7 — and decision D25's rule applies: a
    // missing measurement reads as "not measured", a fabricated one reads as a
    // measurement. So they render as gaps rather than as zeroes.
    { skill: 'reading', score: null, basis: 'bacaan bertingkat (M7)', answers: 0 },
    { skill: 'production', score: null, basis: 'produksi bebas (M7)', answers: 0 },
  ];

  const ability = await vocabularyAbility(profile.id, lang);
  const placed = await db.abilities.get([profile.id, lang, 'vocab']);

  return {
    vocabulary: estimateVocabulary(bandEvidence),
    coverage: estimateCoverage(bandEvidence, teachableShare, knownShare),
    bands: bandRates(bandEvidence),
    retention: measureRetention(
      logs.map((log) => ({
        stateBefore: log.stateBefore.state,
        rating: log.rating,
        reviewedAt: log.reviewedAt,
      })),
      profile.requestRetention ?? TARGET_RETENTION,
    ),
    calibration: measureCalibration(
      logs.map((log) => ({ confidence: log.confidence, rating: log.rating })),
    ),
    consistency: measureConsistency(
      logs.map((log) => log.reviewedAt),
      now,
    ),
    forecast: forecastLoad(cards, now, FORECAST_DAYS),
    skills,
    mastered: cards.filter((card) =>
      isMastered(card.ladderLevel, card.fsrs.stability),
    ).length,
    totalReviews: logs.length,
    placedAtRank: placed ? rankForAbility(ability.theta) : null,
  };
};

/** Cards whose retrievability has fallen furthest — "what is slipping". */
export const slippingSoon = async (
  profileId: string,
  now: Timestamp,
  limit = 5,
): Promise<Array<{ itemId: string; headword: string; retrievability: number }>> => {
  const cards = await db.cards.where('profileId').equals(profileId).toArray();
  const ranked = cards
    .map((card) => ({ card, r: retrievability(card.fsrs, now) }))
    .filter((entry) => entry.r < 1)
    .sort((a, b) => a.r - b.r)
    .slice(0, limit);

  const items = await db.items.bulkGet(ranked.map((entry) => entry.card.itemId));
  return ranked.flatMap((entry, index) => {
    const item = items[index];
    return item
      ? [{ itemId: item.id, headword: item.headword, retrievability: entry.r }]
      : [];
  });
};
