import type { TargetLang } from './types.ts';

/**
 * Loads the compiled contrastive content (SPEC §3).
 *
 * Same shape as the sentence loader in content.ts and for the same reason: this
 * is reference material, read by id, never queried — so it stays as JSON in
 * memory rather than becoming IndexedDB rows. It is authored content compiled by
 * scripts/ingest/build-contrastive.ts; the YAML never reaches the browser.
 *
 * ~15 KB gzipped for English, precached with the starter bands, so the first
 * drill of the first offline session is already there.
 */

export const CONTENT_BASE = '/content';

export type DrillType = 'mcq' | 'cloze' | 'minimal-pair' | 'correction';
export type CategoryKind = 'morphosyntax' | 'phonology' | 'lexis';

export interface Drill {
  id: string;
  categoryId: string;
  type: DrillType;
  prompt: string;
  options?: string[];
  answer: string;
  /** SPEC §2.9: shown whether the learner got it right or wrong. */
  explain: string;
  /** Elo difficulty on the src/core/elo.ts scale. Absent means median. */
  difficulty?: number;
  /** Minimal pairs only — requires audio, and is withheld without it (§2.6). */
  audio?: true;
  say?: string;
}

export interface ContrastiveNote {
  /** What Indonesian does. */
  l1: string;
  /** What English does instead, and why. */
  target: string;
  minimalPair: { wrong: string; right: string; gloss: string };
  tip?: string;
}

export interface Category {
  id: string;
  kind: CategoryKind;
  label: string;
  summary: string;
  note: ContrastiveNote;
  drills: Drill[];
}

export interface FalseFriend {
  en: string;
  idLookalike: string;
  enMeans: string;
  idWordIs: string;
}

export interface ContrastivePack {
  version: number;
  lang: string;
  l1: string;
  categories: Category[];
  falseFriends: FalseFriend[];
  /** Every drill, flattened, in authoring order. */
  drills: Drill[];
  byCategory: ReadonlyMap<string, Category>;
  byDrillId: ReadonlyMap<string, Drill>;
}

const cache = new Map<TargetLang, ContrastivePack>();
const inFlight = new Map<TargetLang, Promise<ContrastivePack>>();

interface WirePack {
  version: number;
  lang: string;
  l1: string;
  categories: Category[];
  falseFriends: FalseFriend[];
}

const index = (wire: WirePack): ContrastivePack => {
  const drills = wire.categories.flatMap((category) => category.drills);
  return {
    ...wire,
    drills,
    byCategory: new Map(wire.categories.map((category) => [category.id, category])),
    byDrillId: new Map(drills.map((drill) => [drill.id, drill])),
  };
};

export const EMPTY_PACK: ContrastivePack = index({
  version: 0,
  lang: 'en',
  l1: 'id',
  categories: [],
  falseFriends: [],
});

/**
 * The pack for a language, or an empty one if it has none yet.
 *
 * Empty rather than throwing: Japanese has no `ja.yaml` until M6, and a missing
 * contrastive pack must degrade to "no drills in the session", not to a session
 * that fails to start.
 */
export const loadContrastive = async (lang: TargetLang): Promise<ContrastivePack> => {
  const cached = cache.get(lang);
  if (cached) return cached;

  // Concurrent callers share one fetch: the app preloads on boot and the
  // session composer asks for the same pack moments later.
  const existing = inFlight.get(lang);
  if (existing) return existing;

  const request = (async () => {
    let pack = EMPTY_PACK;
    try {
      const response = await fetch(`${CONTENT_BASE}/${lang}/contrastive.json`);
      if (response.ok) pack = index((await response.json()) as WirePack);
    } catch {
      // Offline before the pack was ever cached. No drills this session.
    }
    cache.set(lang, pack);
    inFlight.delete(lang);
    return pack;
  })();
  inFlight.set(lang, request);
  return request;
};

/**
 * The pack **if it is already in memory**, without waiting for a fetch.
 *
 * This exists to keep the contrastive engine off the critical path. SPEC §5.4
 * gives icon-tap-to-first-question three seconds, and session planning is inside
 * that budget — so it may not block on a network round trip for content that only
 * decides whether a drill is added. Content that has not arrived yet simply is
 * not scheduled, exactly as an unfetched band is not; a load is kicked off so the
 * next session has it.
 */
export const peekContrastive = (lang: TargetLang): ContrastivePack | null => {
  const cached = cache.get(lang);
  if (cached) return cached;
  void loadContrastive(lang);
  return null;
};

/**
 * SPEC §2.6, applied to drills: a minimal-pair item that cannot be heard is not
 * a minimal-pair item. It is withheld rather than shown as a reading exercise,
 * which would silently turn a listening measurement into a spelling one.
 */
export const isDrillPresentable = (drill: Drill, audioAvailable: boolean): boolean =>
  drill.audio !== true || audioAvailable;
