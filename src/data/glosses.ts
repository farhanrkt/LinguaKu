import type { FrequencyBand } from '../core/frequency.ts';
import { CONTENT_BASE } from './content.ts';
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

  let map: ReadonlyMap<string, readonly string[]> = EMPTY;
  try {
    const response = await fetch(`${CONTENT_BASE}/${lang}/glosses.b${band}.json`);
    if (response.ok) {
      const payload = (await response.json()) as { glosses?: Record<string, string[]> };
      map = new Map(Object.entries(payload.glosses ?? {}));
    }
  } catch {
    // Offline before this band was cached, or no gloss shard for this language.
    // Either way the caller gets "no gloss", which is a state it already has.
  }
  cache.set(key, map);
  return map;
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

/** Test seam; also used when a language switch invalidates what is in memory. */
export const clearGlossCache = (): void => cache.clear();
