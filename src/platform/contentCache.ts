import { contentUrl, fetchManifest } from '../data/content.ts';
import type { FrequencyBand } from '../core/frequency.ts';
import type { TargetLang } from '../data/types.ts';

/** Must match the runtime rule's `cacheName` in vite.config.ts. */
const CACHE = 'linguaku-content';

/** What a session reads for a band, offline (invariant 54). */
const KINDS = ['lexemes', 'anchors', 'glosses', 'chunks'] as const;

/**
 * Writes the chosen language's bands into the service worker's runtime cache.
 *
 * The starter bands used to be precached for both languages, so a learner who
 * picked English downloaded Japanese too. They are fetched for one language
 * now — and written here directly, because the very first page load is not yet
 * controlled by the service worker, so its own fetches would bypass the cache
 * and the "install, then go offline before a session" learner the precache
 * existed for would have nothing. The URLs are the versioned ones the loaders
 * request (`contentUrl`), so the worker's `CacheFirst` finds exactly these.
 *
 * Best effort: offline, or a browser without the Cache API, writes nothing and
 * the loaders still fetch on demand.
 */
export const fillContentCache = async (
  lang: TargetLang,
  bands: readonly FrequencyBand[],
): Promise<void> => {
  if (typeof caches === 'undefined') return;
  try {
    const manifest = await fetchManifest(lang);
    const urls = manifest.shards
      .filter(
        (shard) =>
          (KINDS as readonly string[]).includes(shard.kind) &&
          bands.includes(shard.band),
      )
      .map((shard) => contentUrl(lang, shard.path));
    const cache = await caches.open(CACHE);
    const missing = (await Promise.all(urls.map(async (url) => ((await cache.match(url)) ? null : url)))).filter(
      (url): url is string => url !== null,
    );
    if (missing.length > 0) await cache.addAll(missing);
  } catch {
    // Offline or quota: the loaders fetch on demand, as before.
  }
};
