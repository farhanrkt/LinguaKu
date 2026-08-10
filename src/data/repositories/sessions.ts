import Dexie from 'dexie';
import { db } from '../db.ts';
import { dueCards } from './reviews.ts';
import { retrievability } from '../../core/scheduler.ts';
import { composeSession, type Candidate } from '../../core/sessionComposer.ts';
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

/** New items introduced per session before placement (M3) refines the cap. */
const NEW_ITEM_POOL = 40;

export const findResumable = async (profileId: string): Promise<Session | null> => {
  const sessions = await db.sessions
    .where('[profileId+startedAt]')
    .between([profileId, Dexie.minKey], [profileId, Dexie.maxKey])
    .reverse()
    .toArray();
  return sessions.find((session) => session.completed === 0) ?? null;
};

/**
 * Items the learner has never answered, easiest first. A card only exists once
 * an item has been answered (SPEC §2.2), so "no card" *is* "not yet started".
 */
const newCandidates = async (profile: Profile, limit: number): Promise<Candidate[]> => {
  const lang = profile.targets[0] ?? 'en';
  const items = await db.items.where('[lang+kind]').equals([lang, 'lexeme']).sortBy('freqRank');

  const candidates: Candidate[] = [];
  for (const item of items) {
    if (candidates.length >= limit) break;
    if (item.anchorSentenceIds.length === 0) continue; // SPEC §2.5
    const existing = await db.cards.where('[profileId+itemId]').equals([profile.id, item.id]).count();
    if (existing > 0) continue;
    candidates.push({
      id: item.id,
      itemId: item.id,
      cardId: null,
      slice: 'new',
      ladderLevel: 0,
      clusterId: `b${item.band}`,
      retrievability: 0,
      lapses: 0,
    });
  }
  return candidates;
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

export const startSession = async (profile: Profile, now: Timestamp): Promise<Session> => {
  const [due, fresh] = await Promise.all([
    dueCandidates(profile, now),
    newCandidates(profile, NEW_ITEM_POOL),
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
  return session;
};

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
