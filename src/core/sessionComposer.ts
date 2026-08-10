import { LEECH_LAPSE_THRESHOLD } from './ladder.ts';
import { mulberry32, shuffle } from './rng.ts';
import type { LadderLevel } from '../data/types.ts';

/**
 * SCIENCE: interleaving beats blocked practice for discrimination and transfer,
 * even though it feels worse while you are doing it — see SPEC §2.8. Budget
 * allocation and review prioritization are SPEC §7.2.
 *
 * The composer is pure and deterministic under its seed: same inputs, same
 * session, every time. Nothing here touches the database or the clock.
 */

/** The task a card presents, derived from its ladder level. */
export type CardType = 'exposure' | 'recognition' | 'recall' | 'cloze';

export const cardTypeForLevel = (level: LadderLevel): CardType => {
  switch (level) {
    case 0:
      return 'exposure';
    case 1:
      return 'recognition';
    case 2:
      return 'recall';
    default:
      return 'cloze';
  }
};

/**
 * Rough seconds a learner spends on each task. Calibration constants, not
 * findings — but they are what makes "Latihan 4 menit" (SPEC §2.13) an honest
 * promise rather than a label on an arbitrary number of cards.
 */
export const SECONDS_PER_CARD_TYPE: Record<CardType, number> = {
  exposure: 8,
  recognition: 9,
  recall: 16,
  cloze: 18,
};

export type SessionSlice = 'review' | 'new';

/**
 * SPEC §7.2 splits the budget ~60% reviews / ~20% new / ~15% one input
 * activity / ~5% one contrastive drill. The last two have no content until M3
 * and M4, so their share is reserved here and spills into reviews (then new)
 * rather than being quietly redistributed — when those pools arrive, the
 * numbers below are already right.
 */
export const SLICE_SHARE: Record<SessionSlice, number> = { review: 0.6, new: 0.2 };
export const RESERVED_SHARE = 0.2;

/** SPEC §2.8. */
export const MAX_CONSECUTIVE_SAME_TYPE = 2;
export const MAX_CONSECUTIVE_SAME_CLUSTER = 3;

export interface Candidate {
  /** Card id for a review, item id for a new item. Unique within a session. */
  id: string;
  itemId: string;
  /** Null when the card does not exist yet — a new item. */
  cardId: string | null;
  slice: SessionSlice;
  ladderLevel: LadderLevel;
  /**
   * Topic cluster for the §2.8 spacing rule. M1 content carries no topic
   * tagging, so callers pass the frequency band as a stand-in; the composer
   * does not care what the string means, only that like groups with like.
   */
  clusterId: string;
  /** Reviews: 0..1, lower means closer to being forgotten. Ignored for new items. */
  retrievability: number;
  lapses: number;
}

export interface ComposeInput {
  budgetMinutes: number;
  seed: number;
  due: readonly Candidate[];
  fresh: readonly Candidate[];
}

export interface ComposedSession {
  entries: Candidate[];
  estimatedSeconds: number;
  budgetSeconds: number;
  allocation: Record<SessionSlice, number>;
  /**
   * True when the remaining pool made SPEC §2.8 impossible to satisfy — e.g.
   * every card left is the same type. Surfaced rather than swallowed, because
   * a silently blocked session is the failure mode the rule exists to prevent.
   */
  interleaveRelaxed: boolean;
}

const secondsFor = (candidate: Candidate): number =>
  SECONDS_PER_CARD_TYPE[cardTypeForLevel(candidate.ladderLevel)];

/**
 * SPEC §7.2: the cards nearest the retention threshold are the ones about to
 * be lost, so they go first. Leeches come after — they need re-teaching more
 * than they need another attempt, and letting them crowd out healthy reviews
 * is how a session turns into a wall of the same six words.
 */
const byRisk = (a: Candidate, b: Candidate): number => {
  const aLeech = a.lapses >= LEECH_LAPSE_THRESHOLD ? 1 : 0;
  const bLeech = b.lapses >= LEECH_LAPSE_THRESHOLD ? 1 : 0;
  if (aLeech !== bLeech) return aLeech - bLeech;
  if (a.retrievability !== b.retrievability) return a.retrievability - b.retrievability;
  return a.id.localeCompare(b.id);
};

/** Fills a slice until its second budget runs out. Returns what it took. */
const take = (
  pool: readonly Candidate[],
  budgetSeconds: number,
): { taken: Candidate[]; spent: number; rest: Candidate[] } => {
  const taken: Candidate[] = [];
  const rest: Candidate[] = [];
  let spent = 0;
  for (const candidate of pool) {
    const cost = secondsFor(candidate);
    if (spent + cost <= budgetSeconds) {
      taken.push(candidate);
      spent += cost;
    } else {
      rest.push(candidate);
    }
  }
  return { taken, spent, rest };
};

const violates = (candidate: Candidate, ordered: readonly Candidate[]): boolean => {
  const type = cardTypeForLevel(candidate.ladderLevel);
  const sameType = ordered
    .slice(-MAX_CONSECUTIVE_SAME_TYPE)
    .every((entry) => cardTypeForLevel(entry.ladderLevel) === type);
  if (ordered.length >= MAX_CONSECUTIVE_SAME_TYPE && sameType) return true;

  const sameCluster = ordered
    .slice(-MAX_CONSECUTIVE_SAME_CLUSTER)
    .every((entry) => entry.clusterId === candidate.clusterId);
  return ordered.length >= MAX_CONSECUTIVE_SAME_CLUSTER && sameCluster;
};

const countBy = <T>(items: readonly Candidate[], key: (c: Candidate) => T): Map<T, number> => {
  const counts = new Map<T, number>();
  for (const item of items) counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  return counts;
};

/**
 * Interleave under the §2.8 constraints.
 *
 * Taking the highest-priority legal card at every step is the obvious approach
 * and it is wrong: it defers same-type cards until only same-type cards remain,
 * then has no legal move. So the primary key is **how many of that category are
 * still waiting** — spend down the crowded categories first, which is what keeps
 * a legal move available to the end — and risk order breaks the ties. With a
 * varied queue ties are the common case, so at-risk cards still surface early.
 */
const interleave = (selected: readonly Candidate[]): { entries: Candidate[]; relaxed: boolean } => {
  const remaining = [...selected];
  const entries: Candidate[] = [];
  let relaxed = false;

  while (remaining.length > 0) {
    const typeCounts = countBy(remaining, (c) => cardTypeForLevel(c.ladderLevel));
    const clusterCounts = countBy(remaining, (c) => c.clusterId);

    let bestIndex = -1;
    let bestScore = [-1, -1, -1];
    for (const [index, candidate] of remaining.entries()) {
      if (violates(candidate, entries)) continue;
      const score = [
        typeCounts.get(cardTypeForLevel(candidate.ladderLevel)) ?? 0,
        clusterCounts.get(candidate.clusterId) ?? 0,
        // `remaining` is in risk order, so an earlier index is a riskier card.
        -index,
      ];
      if (score[0]! > bestScore[0]! ||
        (score[0] === bestScore[0] && score[1]! > bestScore[1]!) ||
        (score[0] === bestScore[0] && score[1] === bestScore[1] && score[2]! > bestScore[2]!)
      ) {
        bestIndex = index;
        bestScore = score;
      }
    }

    if (bestIndex === -1) {
      bestIndex = 0;
      relaxed = true;
    }
    entries.push(remaining.splice(bestIndex, 1)[0]!);
  }
  return { entries, relaxed };
};

export const composeSession = (input: ComposeInput): ComposedSession => {
  const budgetSeconds = input.budgetMinutes * 60;
  const rng = mulberry32(input.seed);

  // Shuffle first, then sort: equal-priority cards vary between sessions
  // without the ordering itself becoming unpredictable.
  const due = shuffle(input.due, rng).sort(byRisk);
  const fresh = shuffle(input.fresh, rng);

  const reviewBudget = budgetSeconds * SLICE_SHARE.review;
  const newBudget = budgetSeconds * SLICE_SHARE.new;

  const reviews = take(due, reviewBudget);
  const news = take(fresh, newBudget);

  // The reserved share, plus anything a slice could not spend, goes back to
  // reviews and then to new items.
  let spare = budgetSeconds - reviews.spent - news.spent;
  const extraReviews = take(reviews.rest, spare);
  spare -= extraReviews.spent;
  const extraNew = take(news.rest, spare);

  const selected = [
    ...reviews.taken,
    ...extraReviews.taken,
    ...news.taken,
    ...extraNew.taken,
  ].sort(byRisk);

  const { entries, relaxed } = interleave(selected);

  return {
    entries,
    estimatedSeconds: entries.reduce((total, entry) => total + secondsFor(entry), 0),
    budgetSeconds,
    allocation: {
      review: reviews.taken.length + extraReviews.taken.length,
      new: news.taken.length + extraNew.taken.length,
    },
    interleaveRelaxed: relaxed,
  };
};
