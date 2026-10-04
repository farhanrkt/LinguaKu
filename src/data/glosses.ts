import type { FrequencyBand } from '../core/frequency.ts';
import { CONTENT_BASE, fetchShard } from './content.ts';
import type { TargetLang } from './types.ts';

/**
 * Indonesian glosses (SPEC §2.5, risk R3), loaded per band and cached.
 *
 * ## Reference, not an answer key
 *
 * This is the distinction the whole feature rests on, and it is why L2 is
 * unchanged. Grading a typed meaning against a gloss requires the gloss to be
 * right for *every* item, and marking a good answer wrong is the exact
 * unfairness §2.7 exists to prevent. Showing a gloss requires only that it be
 * right where it is shown — and where there is none, the screen says so, which
 * it already did.
 *
 * Coverage is partial and was measured before anything was built on it: 30% of
 * English lexemes, 4% of Japanese, and worst on the commonest words, which are
 * function words a gloss serves badly anyway. `scripts/ingest/build-glosses.ts`
 * carries the numbers and the reasoning.
 *
 * A missing shard is not an error — a language may ship none at all.
 */

const cache = new Map<string, ReadonlyMap<string, readonly string[]>>();

const EMPTY: ReadonlyMap<string, readonly string[]> = new Map();

export const loadGlosses = async (
  lang: TargetLang,
  band: FrequencyBand,
): Promise<ReadonlyMap<string, readonly string[]>> => {
  const key = `${lang}:${band}`;
  const cached = cache.get(key);
  if (cached) return cached;

  try {
    const payload = await fetchShard<{ glosses?: Record<string, string[]> }>(
      `${CONTENT_BASE}/${lang}/glosses.b${band}.json`,
    );
    // `null` is a 404: no gloss shard exists for this language and band, which
    // is true of every Japanese band above 2 and is permanent for this build.
    const map: ReadonlyMap<string, readonly string[]> =
      payload === null ? EMPTY : new Map(Object.entries(payload.glosses ?? {}));
    cache.set(key, map);
    return map;
  } catch {
    // Offline before this band was cached, or a server fault. The caller gets
    // "no gloss", which is a state it already handles — but this is **not**
    // written to the cache. Remembering it would make every word in the band
    // report "belum ada di kamus kami" for the rest of the session, which is
    // invariant 38's false branch and undetectable to the learner, because
    // D59 makes "no entry" the common answer anyway.
    return EMPTY;
  }
};

/**
 * The senses for one item, or an empty list.
 *
 * At most three, because a dictionary page is not a gloss — and the caller
 * renders them joined, so a long tail of rare senses would bury the one the
 * learner needs.
 */
export const glossFor = async (
  lang: TargetLang,
  band: FrequencyBand,
  itemId: string,
): Promise<readonly string[]> => (await loadGlosses(lang, band)).get(itemId) ?? [];

/**
 * Test seam. The cache is keyed `lang:band`, so a language switch needs no
 * clearing — an earlier version of this comment claimed otherwise.
 */
export const clearGlossCache = (): void => cache.clear();
