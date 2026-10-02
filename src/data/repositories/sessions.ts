import Dexie from 'dexie';
import { db } from '../db.ts';
import { dueCardCount, dueCards, introducedToday } from './reviews.ts';
import { retrievability } from '../../core/scheduler.ts';
import { knownItemIds, coverageOf } from '../../core/coverage.ts';
import { buildIdFor, isBuildable } from '../../core/sentenceBuild.ts';
import { recentBuildIds } from './builds.ts';
import { composeSession, type Candidate } from '../../core/sessionComposer.ts';
import {
  dailyCapacityFor,
  dailyNewWords,
  forecastLoad,
  newItemAllowance,
  type DailyNewResult,
  type ThrottleResult,
} from '../../core/forecast.ts';
import { bandForAbility } from '../../core/placement.ts';
import { DEFAULT_ITEM_DIFFICULTY, DEFAULT_RATING } from '../../core/elo.ts';
import { vocabularyAbility } from './abilities.ts';
import { allCategoryScores, recentDrillIds, weakestCategories } from './contrastive.ts';
import { minedItemIds } from './mining.ts';
import { deferredItemIds } from './deferrals.ts';
import { loadAnchors } from '../content.ts';
import { isDrillPresentable, peekContrastive } from '../contrastive.ts';
import type { FrequencyBand } from '../../core/frequency.ts';
import { peekTopics, type TopicPack } from '../topics.ts';
import type { Item, Profile, Session, TargetLang, Timestamp } from '../types.ts';

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

/**
 * Scoped to a language on purpose. A queue is built from one language's items,
 * so an unfinished English session resumed by a learner who has switched to
 * Japanese would serve English cards under a Japanese heading — and log them
 * against the Japanese ability. Sessions written before v1.0.1 carry no `lang`
 * and are never resumed; the review logs they produced are untouched.
 */
/**
 * The item kind the composer interleaves on (SPEC §2.8).
 *
 * Kanji and chunks each count as their own type, so two of either cannot land
 * back to back; everything else is a lexeme as far as spacing is concerned.
 */
const itemKindFor = (item: Item): 'lexeme' | 'kanji' | 'chunk' =>
  item.kind === 'kanji' ? 'kanji' : item.kind === 'chunk' ? 'chunk' : 'lexeme';

/**
 * The cluster §2.8 spaces on.
 *
 * A topic where the item has one, and the frequency band otherwise. The band
 * was the stand-in from M2 until topics existed, and it is still the right
 * fallback: it groups like with like, which is all the spacing rule needs. The
 * difference is that "three food words in a row" is now a thing the rule can
 * see, and it could not before.
 */
const clusterFor = (item: Item, topics: TopicPack | null): string =>
  topics?.byItem.get(item.id) ?? `b${item.band}`;

export const findResumable = async (
  profileId: string,
  lang: TargetLang,
): Promise<Session | null> => {
  const sessions = await db.sessions
    .where('[profileId+startedAt]')
    .between([profileId, Dexie.minKey], [profileId, Dexie.maxKey])
    .reverse()
    .toArray();
  return sessions.find((session) => session.completed === 0 && session.lang === lang) ?? null;
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
  deferred: Set<string>,
): Promise<Candidate[]> => {
  if (limit <= 0) return [];
  const lang = profile.targets[0] ?? 'en';

  // Kanji are items too (SPEC §2.11), and they share the frontier gate: a
  // learner is not shown rare characters before common ones.
  const items = [
    ...(await db.items.where('[lang+kind]').equals([lang, 'lexeme']).toArray()),
    ...(await db.items.where('[lang+kind]').equals([lang, 'kanji']).toArray()),
    ...(await db.items.where('[lang+kind]').equals([lang, 'chunk']).toArray()),
  ].sort((a, b) => a.freqRank - b.freqRank);
  const started = new Set(
    (await db.cards.where('profileId').equals(profile.id).toArray()).map((card) => card.itemId),
  );

  // SPEC §8: a word the learner mined in the reader jumps the queue. They met
  // it, went looking for it, and have a context for it — all of which beats
  // being next on the frequency list.
  const mined = await minedItemIds(profile.id);

  const eligible = items.filter(
    (item) =>
      // SPEC §2.14: a word the learner has declined is not offered again until
      // its window lapses — including one they mined and then thought better of.
      !deferred.has(item.id) &&
      (mined.has(item.id) || item.band <= frontier) &&
      // A lexeme needs an example sentence (SPEC §2.5); a kanji is taught by its
      // components and readings, so the rule does not apply to it.
      (item.kind === 'kanji' || item.anchorSentenceIds.length > 0) &&
      !started.has(item.id),
  );

  // SPEC §2.10: frequency order, *modulated by* the learner's chosen topics.
  // Modulated, not filtered — someone who picks "food" still needs the function
  // words that hold a sentence together, and restricting the queue to a topic
  // would starve them of exactly the words that make the topic usable.
  const topics = peekTopics(lang);
  const chosen = new Set(profile.topics ?? []);
  const inChosenTopic = (itemId: string): boolean => {
    const topic = topics?.byItem.get(itemId);
    return topic !== undefined && chosen.has(topic);
  };

  // Mined words first, then anything in a topic the learner asked for, then
  // nearest the frontier — which is where the learning is for everything they
  // did not specifically ask for.
  eligible.sort((a, b) => {
    const minedRank = (item: typeof a) => (mined.has(item.id) ? 0 : 1);
    const topicRank = (item: typeof a) => (inChosenTopic(item.id) ? 0 : 1);
    return (
      minedRank(a) - minedRank(b) ||
      topicRank(a) - topicRank(b) ||
      b.band - a.band ||
      a.freqRank - b.freqRank
    );
  });

  return eligible.slice(0, limit).map((item) => ({
    id: item.id,
    itemId: item.id,
    cardId: null,
    slice: 'new' as const,
    ladderLevel: 0 as const,
    clusterId: clusterFor(item, topics),
    retrievability: 0,
    lapses: 0,
    itemKind: itemKindFor(item),
  }));
};

/**
 * SPEC §3.3, step 3: *"the session composer injects targeted drills when a
 * category's estimate is below threshold."*
 *
 * Order is weakest category first, and within a category the drill closest to
 * the learner's current rating — the same maximum-information idea placement
 * uses, for the same reason: an item they are certain to get right or certain to
 * get wrong teaches nothing and measures nothing.
 *
 * Drills answered in the last few sessions are skipped so the weakest category
 * does not become the same two items on repeat.
 */
const drillCandidates = async (
  profile: Profile,
  limit: number,
  audioAvailable: boolean,
): Promise<Candidate[]> => {
  if (limit <= 0) return [];
  const lang = profile.targets[0] ?? 'en';

  // Non-blocking: see `peekContrastive`. A first-ever session that starts before
  // the pack has landed gets no drill, and the one after it does.
  const pack = peekContrastive(lang);
  if (pack === null || pack.categories.length === 0) return [];

  const ids = pack.categories.map((category) => category.id);
  const [priority, scores, recent] = await Promise.all([
    weakestCategories(profile.id, lang, ids),
    allCategoryScores(profile.id, lang),
    recentDrillIds(profile.id, lang),
  ]);

  const chosen: Candidate[] = [];
  for (const categoryId of priority) {
    if (chosen.length >= limit) break;
    const category = pack.byCategory.get(categoryId);
    if (!category) continue;

    const rating = scores.get(categoryId)?.rating ?? DEFAULT_RATING;
    const eligible = category.drills
      .filter((drill) => isDrillPresentable(drill, audioAvailable) && !recent.has(drill.id))
      .sort(
        (a, b) =>
          Math.abs((a.difficulty ?? DEFAULT_ITEM_DIFFICULTY) - rating) -
            Math.abs((b.difficulty ?? DEFAULT_ITEM_DIFFICULTY) - rating) ||
          a.id.localeCompare(b.id),
      );

    const drill = eligible[0];
    if (!drill) continue;
    chosen.push({
      id: drill.id,
      itemId: drill.id,
      cardId: null,
      slice: 'drill',
      ladderLevel: 0,
      // The category is the topic cluster, so SPEC §2.8's spacing rule keeps
      // two drills from the same category apart on its own.
      clusterId: `c:${categoryId}`,
      retrievability: 0,
      lapses: 0,
    });
  }
  return chosen;
};

const dueCandidates = async (
  profile: Profile,
  now: Timestamp,
  deferred: Set<string>,
): Promise<Candidate[]> => {
  // Scoped to the language being studied. `Session.lang` has recorded which
  // language a queue was composed for since v1.0.1 — because resuming a session
  // under a different target handed the learner the other language's content —
  // but the queue itself was never actually built that way: due cards came from
  // the whole profile, so a learner who had studied both could meet Japanese
  // kanji inside an English session. New items and drills were already scoped.
  const lang = profile.targets[0] ?? 'en';
  const cards = await dueCards(profile.id, now, { lang });
  const items = await db.items.bulkGet(cards.map((card) => card.itemId));
  const topics = peekTopics(lang);

  return cards.flatMap((card, index) => {
    const item = items[index];
    if (!item) return [];
    // A due card the learner declined stays due — the skip changes what is
    // *shown*, never the schedule. Nothing about its FSRS state is touched.
    if (deferred.has(item.id)) return [];
    return [
      {
        id: card.id,
        itemId: card.itemId,
        cardId: card.id,
        slice: 'review' as const,
        ladderLevel: card.ladderLevel,
        clusterId: clusterFor(item, topics),
        retrievability: retrievability(card.fsrs, now),
        lapses: card.fsrs.lapses,
        itemKind: itemKindFor(item),
      },
    ];
  });
};

/** What today actually holds, for the home screen to state before committing. */
/**
 * Rebuild-the-sentence puzzles (SPEC §3.1 `NP_WORD_ORDER`).
 *
 * Drawn from the **anchors**, not the full sentence shards: anchors are
 * precached with the starter bands, so this costs a learner nothing extra on a
 * metered connection (§5.4, D80), and they are the sentences the app already
 * teaches this band's vocabulary through.
 *
 * A sentence is only worth rebuilding if the learner can already read most of
 * it — reassembling words you do not know is a jigsaw, not a language exercise
 * — so candidates are ranked by how much of each sentence is already known and
 * the best are taken.
 */
const buildCandidates = async (
  profile: Profile,
  now: Timestamp,
  frontier: FrequencyBand,
  limit: number,
): Promise<Candidate[]> => {
  if (limit <= 0) return [];
  const lang = profile.targets[0] ?? 'en';

  const cards = await db.cards.where('profileId').equals(profile.id).toArray();
  const known = knownItemIds(cards, now);
  // Nothing to build from until the learner knows some words.
  if (known.size < MIN_KNOWN_FOR_BUILDS) return [];

  const recent = await recentBuildIds(profile.id, now - BUILD_COOLDOWN_MS);
  const bands: FrequencyBand[] =
    frontier > 1 ? [(frontier - 1) as FrequencyBand, frontier] : [frontier];

  const scored: Array<{ candidate: Candidate; coverage: number }> = [];
  for (const band of bands) {
    // Fails soft, and that is load-bearing: `loadAnchors` throws when the shard
    // is not there — offline before this band was cached, or any fetch failure
    // — and this runs inside `planSession`. An optional extra that can stop a
    // session being planned at all is worse than no extra.
    const anchors = await loadAnchors(lang, band).catch(() => null);
    if (!anchors) continue;
    for (const sentence of anchors.values()) {
      if (recent.has(sentence.id)) continue;
      if (!isBuildable(sentence.text)) continue;
      const report = coverageOf(sentence.text, known, lang);
      if (report.coverage < BUILD_MIN_COVERAGE) continue;
      scored.push({
        coverage: report.coverage,
        candidate: {
          id: buildIdFor(band, sentence.id),
          itemId: buildIdFor(band, sentence.id),
          cardId: null,
          slice: 'build',
          ladderLevel: 0,
          clusterId: `build:${band}`,
          retrievability: 0,
          lapses: 0,
        },
      });
    }
  }

  return scored
    .sort((a, b) => b.coverage - a.coverage)
    .slice(0, limit)
    .map((entry) => entry.candidate);
};

export interface TodaySnapshot {
  /** Reviews waiting right now. */
  due: number;
  /** Today's introduction budget (SPEC §7.2). */
  daily: DailyNewResult;
}

/**
 * A read-only look at today's load, for the home screen.
 *
 * Counted the same way `dueCandidates` counts — scoped to the language being
 * studied — so the number on the home screen cannot disagree with what the
 * session it launches actually contains.
 *
 * Writes nothing. §2.2's ban on browsing as a study activity is about advancing
 * cards, and this advances none — it is the same class of read as the glossary
 * (D67).
 */
export const todaySnapshot = async (
  profile: Profile,
  now: Timestamp,
): Promise<TodaySnapshot> => {
  const [due, introduced] = await Promise.all([
    dueCardCount(profile.id, now, profile.targets[0] ?? 'en'),
    introducedToday(profile.id, now),
  ]);

  return {
    due,
    daily: dailyNewWords({
      cap: profile.dailyNewWords,
      budgetMinutes: profile.dailyMinutes,
      introducedToday: introduced,
    }),
  };
};

export interface SessionPlan {
  session: Session;
  /** What the throttle decided, so the UI can explain a quiet day honestly. */
  throttle: ThrottleResult;
  /** Today's introduction budget, spent and remaining (SPEC §7.2). */
  daily: DailyNewResult;
  frontier: FrequencyBand;
  /** How many contrastive drills the session carries (SPEC §7.2's ~5%). */
  drills: number;
}

/** SPEC §7.2 asks for *one* contrastive drill; two on a longer session. */
const MAX_DRILLS = 2;

/** Rebuilding a sentence needs a vocabulary to rebuild it out of. */
const MIN_KNOWN_FOR_BUILDS = 25;
/** Most of the sentence already known, or it is a jigsaw rather than a lesson. */
const BUILD_MIN_COVERAGE = 0.8;
/** Long enough that a sentence is not served twice in the same week. */
const BUILD_COOLDOWN_MS = 7 * 86_400_000;
const MAX_BUILDS = 3;

export interface PlanOptions {
  /**
   * SPEC §2.6: whether audio works on this device at all. Minimal-pair drills
   * are withheld without it, exactly as L4 is.
   */
  audioAvailable?: boolean;
}

export const planSession = async (
  profile: Profile,
  now: Timestamp,
  options: PlanOptions = {},
): Promise<SessionPlan> => {
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

  // SPEC §7.2's other half. The throttle above reacts to a backlog that already
  // exists; this stops one forming. They are not redundant — the throttle is
  // computed per *session* from a forecast that only moves days later, so five
  // sessions in one evening passed it five times and introduced five doses of
  // new material, which is the exact failure §7.2 calls the top cause of
  // abandonment. The cap is the learner's own (§2.14), defaulting to what their
  // session length can carry.
  const daily = dailyNewWords({
    cap: profile.dailyNewWords,
    budgetMinutes: profile.dailyMinutes,
    introducedToday: await introducedToday(profile.id, now),
  });
  const newAllowance = Math.min(throttle.allowed, daily.remaining);

  const deferred = await deferredItemIds(profile.id, now);
  const [due, fresh, drills, builds] = await Promise.all([
    dueCandidates(profile, now, deferred),
    newCandidates(profile, newAllowance, frontier, deferred),
    drillCandidates(profile, MAX_DRILLS, options.audioAvailable ?? false),
    buildCandidates(profile, now, frontier, MAX_BUILDS),
  ]);

  const composed = composeSession({
    budgetMinutes: profile.dailyMinutes,
    // The day is the seed: one stable session per day, fresh ordering tomorrow.
    seed: Math.floor(now / 86_400_000),
    due,
    fresh,
    drills,
    builds,
  });

  const session: Session = {
    id: crypto.randomUUID(),
    profileId: profile.id,
    lang,
    startedAt: now,
    endedAt: null,
    plannedMinutes: profile.dailyMinutes,
    itemIds: composed.entries.map((entry) => entry.itemId),
    completed: 0,
    resumeCursor: 0,
  };
  await db.sessions.add(session);
  return { session, throttle, daily, frontier, drills: composed.allocation.drill };
};

export const startSession = async (
  profile: Profile,
  now: Timestamp,
  options: PlanOptions = {},
): Promise<Session> => (await planSession(profile, now, options)).session;

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
