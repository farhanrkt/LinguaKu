import Dexie from 'dexie';
import { db } from '../db.ts';
import { dueCards } from './reviews.ts';
import { retrievability } from '../../core/scheduler.ts';
import { composeSession, type Candidate } from '../../core/sessionComposer.ts';
import {
  dailyCapacityFor,
  forecastLoad,
  newItemAllowance,
  type ThrottleResult,
} from '../../core/forecast.ts';
import { bandForAbility } from '../../core/placement.ts';
import { vocabularyAbility } from './abilities.ts';
import type { FrequencyBand } from '../../core/frequency.ts';
import type { Profile, Session, Timestamp } from '../types.ts';

/**
 * SPEC §2.13: sessions are interruption-safe. The cursor is persisted after
 * every single answer, so killing the app mid-session and reopening resumes at
 * the exact next item with no lost review logs.
 *
 * The queue is stored as item ids rather than card ids because a new item has
 * no card until it is first answered — and because item ids stay valid even if
 * the card is created, promoted or demoted mid-session.
 */

/** New items a session would introduce if the learner carried no review debt. */
const BASE_NEW_ITEMS = 40;

export const findResumable = async (profileId: string): Promise<Session | null> => {
  const sessions = await db.sessions
    .where('[profileId+startedAt]')
    .between([profileId, Dexie.minKey], [profileId, Dexie.maxKey])
    .reverse()
    .toArray();
  return sessions.find((session) => session.completed === 0) ?? null;
};

/**
 * Items the learner has never answered. A card only exists once an item has
 * been answered (SPEC §2.2), so "no card" *is* "not yet started".
 *
 * SPEC §4.3: which band new items come from is level-gated. Items at or below
 * the learner's frontier band come first — a learner placed in band 3 should
 * not be marched through the 500 commonest words they already know — with
 * anything above the frontier held back entirely.
 */
const newCandidates = async (
  profile: Profile,
  limit: number,
  frontier: FrequencyBand,
): Promise<Candidate[]> => {
  if (limit <= 0) return [];
  const lang = profile.targets[0] ?? 'en';

  const items = await db.items.where('[lang+kind]').equals([lang, 'lexeme']).sortBy('freqRank');
  const started = new Set(
    (await db.cards.where('profileId').equals(profile.id).toArray()).map((card) => card.itemId),
  );

  const eligible = items.filter(
    (item) =>
      item.band <= frontier && item.anchorSentenceIds.length > 0 && !started.has(item.id),
  );

  // Nearest the frontier first: that is where the learning actually is.
  eligible.sort((a, b) => b.band - a.band || a.freqRank - b.freqRank);

  return eligible.slice(0, limit).map((item) => ({
    id: item.id,
    itemId: item.id,
    cardId: null,
    slice: 'new' as const,
    ladderLevel: 0 as const,
    clusterId: `b${item.band}`,
    retrievability: 0,
    lapses: 0,
  }));
};

const dueCandidates = async (profile: Profile, now: Timestamp): Promise<Candidate[]> => {
  const cards = await dueCards(profile.id, now);
  const items = await db.items.bulkGet(cards.map((card) => card.itemId));

  return cards.flatMap((card, index) => {
    const item = items[index];
    if (!item) return [];
    return [
      {
        id: card.id,
        itemId: card.itemId,
        cardId: card.id,
        slice: 'review' as const,
        ladderLevel: card.ladderLevel,
        clusterId: `b${item.band}`,
        retrievability: retrievability(card.fsrs, now),
        lapses: card.fsrs.lapses,
      },
    ];
  });
};

export interface SessionPlan {
  session: Session;
  /** What the throttle decided, so the UI can explain a quiet day honestly. */
  throttle: ThrottleResult;
  frontier: FrequencyBand;
}

export const planSession = async (profile: Profile, now: Timestamp): Promise<SessionPlan> => {
  const lang = profile.targets[0] ?? 'en';
  const ability = await vocabularyAbility(profile.id, lang);
  const frontier = bandForAbility(ability.theta);

  // SPEC §7.2: the new-item cap adapts to review debt automatically. A learner
  // should never have to work out for themselves that they are drowning.
  const allCards = await db.cards.where('profileId').equals(profile.id).toArray();
  const throttle = newItemAllowance({
    forecast: forecastLoad(allCards, now),
    dailyCapacity: dailyCapacityFor(profile.dailyMinutes),
    baseNewItems: BASE_NEW_ITEMS,
  });

  const [due, fresh] = await Promise.all([
    dueCandidates(profile, now),
    newCandidates(profile, throttle.allowed, frontier),
  ]);

  const composed = composeSession({
    budgetMinutes: profile.dailyMinutes,
    // The day is the seed: one stable session per day, fresh ordering tomorrow.
    seed: Math.floor(now / 86_400_000),
    due,
    fresh,
  });

  const session: Session = {
    id: crypto.randomUUID(),
    profileId: profile.id,
    startedAt: now,
    endedAt: null,
    plannedMinutes: profile.dailyMinutes,
    itemIds: composed.entries.map((entry) => entry.itemId),
    completed: 0,
    resumeCursor: 0,
  };
  await db.sessions.add(session);
  return { session, throttle, frontier };
};

export const startSession = async (profile: Profile, now: Timestamp): Promise<Session> =>
  (await planSession(profile, now)).session;

/**
 * Persisted after every answer. Awaiting this before showing the next item is
 * what makes a mid-session kill lossless.
 */
export const advanceCursor = async (sessionId: string, cursor: number): Promise<void> => {
  await db.sessions.update(sessionId, { resumeCursor: cursor });
};

export const completeSession = async (sessionId: string, now: Timestamp): Promise<void> => {
  await db.sessions.update(sessionId, { completed: 1, endedAt: now });
};

/** SPEC §2.14: the learner can always stop. An abandoned session just stays open. */
export const sessionProgress = (session: Session): { done: number; total: number } => ({
  done: Math.min(session.resumeCursor, session.itemIds.length),
  total: session.itemIds.length,
});
