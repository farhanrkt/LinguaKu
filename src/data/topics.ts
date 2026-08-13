import { CONTENT_BASE } from './content.ts';
import type { TargetLang } from './types.ts';

/**
 * Topic clusters (SPEC §2.10, §2.14, §2.8).
 *
 * One small shard per language: the topics a learner can choose, and a map from
 * item id to topic. Loaded once and cached, because the composer reads it on
 * every plan and a session must not wait on a fetch (§5.4).
 *
 * **Partial by design.** Roughly 7% of the English inventory and 2% of the
 * Japanese is tagged, which is a real number published in the shard rather than
 * an impression. A word in no topic loses nothing: it is not boosted when a
 * topic is chosen, and it keeps its frequency band as its cluster for §2.8's
 * spacing rule, exactly as every word did before this existed.
 */

export interface Topic {
  id: string;
  label: string;
  hint?: string;
  /** How many shipped items carry this topic. */
  items: number;
}

export interface TopicPack {
  topics: readonly Topic[];
  /** Item id → topic id. */
  byItem: ReadonlyMap<string, string>;
  coverage: { tagged: number; inventory: number; share: number };
}

export const EMPTY_TOPICS: TopicPack = {
  topics: [],
  byItem: new Map(),
  coverage: { tagged: 0, inventory: 0, share: 0 },
};

const cache = new Map<TargetLang, TopicPack>();

export const loadTopics = async (lang: TargetLang): Promise<TopicPack> => {
  const cached = cache.get(lang);
  if (cached) return cached;

  let pack = EMPTY_TOPICS;
  try {
    const response = await fetch(`${CONTENT_BASE}/${lang}/topics.json`);
    if (response.ok) {
      const payload = (await response.json()) as {
        topics?: Topic[];
        items?: Record<string, string>;
        coverage?: TopicPack['coverage'];
      };
      pack = {
        topics: payload.topics ?? [],
        byItem: new Map(Object.entries(payload.items ?? {})),
        coverage: payload.coverage ?? EMPTY_TOPICS.coverage,
      };
    }
  } catch {
    // Offline before it was cached, or a language with no topic map. Either
    // way the app behaves as it did before topics existed.
  }
  cache.set(lang, pack);
  return pack;
};

/** The pack if it is already in memory. The composer must not await a fetch. */
export const peekTopics = (lang: TargetLang): TopicPack | null => cache.get(lang) ?? null;

export const clearTopicCache = (): void => cache.clear();
