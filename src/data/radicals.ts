import { contentUrl, fetchShard } from './content.ts';

/**
 * The parts of a kanji, named (SPEC §2.11, D121).
 *
 * KRADFILE says which radicals a kanji contains; this says what each one is
 * called and what it means, and which glyph to draw where KRADFILE writes a
 * stand-in (汁 for 氵). Authored in data/radicals/ja.yaml and compiled against
 * the shipped kanji, so every part a card can show has an entry.
 *
 * Held in memory, like the gloss shards: 3.5 KB, read by id, never queried.
 */

export interface Radical {
  /** What is actually written in the character: 氵, where KRADFILE says 汁. */
  glyph: string;
  /** The traditional radical name in romaji, or the part's reading. */
  romaji: string;
  /** Indonesian, one or more senses. */
  meaning: readonly string[];
}

const EMPTY: ReadonlyMap<string, Radical> = new Map();
let cache: ReadonlyMap<string, Radical> | null = null;

export const loadRadicals = async (): Promise<ReadonlyMap<string, Radical>> => {
  if (cache) return cache;
  try {
    const payload = await fetchShard<{
      radicals?: Record<string, { glyph?: string; romaji: string; meaning: string[] }>;
    }>(contentUrl('ja', 'radicals.json'));
    // A 404 is a fact about the build and may be remembered (invariant 50).
    cache = new Map(
      Object.entries(payload?.radicals ?? {}).map(([part, entry]) => [
        part,
        { glyph: entry.glyph ?? part, romaji: entry.romaji, meaning: entry.meaning },
      ]),
    );
    return cache;
  } catch {
    // Offline before it was fetched: unnamed parts for now, asked again later.
    return EMPTY;
  }
};

export const clearRadicalCache = (): void => {
  cache = null;
};
