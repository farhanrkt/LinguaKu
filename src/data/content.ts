import { db } from './db.ts';
import type { FrequencyBand } from '../core/frequency.ts';
import type { Item, TargetLang } from './types.ts';

/**
 * Loads generated content shards (SPEC §5.3).
 *
 * Two kinds of content, deliberately handled differently:
 *
 *  - **Lexemes** are the curriculum. They are queried by band, rank and kind,
 *    and they are small (5,245 across every band), so they go into IndexedDB.
 *    The import is idempotent and keyed on the SHA-256 the manifest publishes.
 *  - **Sentences** are reference material. They are read by id and never
 *    queried, so they stay as JSON — fetched, parsed and held in memory for the
 *    band in use, with the service worker providing the offline copy.
 *
 * That split is not a preference, it is the §5.4 budget. Importing the 27,650
 * sentence rows of bands 1–3 into IndexedDB measured **43 seconds** on an
 * emulated mid-range phone, against a 3-second icon-tap-to-first-question
 * budget. Fetching and parsing the anchor shard for a band takes ~5 ms.
 */

export const CONTENT_BASE = '/content';

// ------------------------------------------------------------- wire format

export interface AnchorSentence {
  id: string;
  text: string;
  difficulty: number;
  maxRank: number;
  tr: { id: string; text: string };
}

interface WireLexeme {
  id: string;
  headword: string;
  freqRank: number;
  band: FrequencyBand;
  anchors: string[];
}

interface ShardRecord {
  kind: 'sentences' | 'lexemes' | 'anchors';
  band: FrequencyBand;
  path: string;
  count: number;
  sha256: string;
}

export interface ContentManifest {
  sources: string[];
  license: string;
  version: number;
  lang: TargetLang;
  corpus: Record<string, number>;
  shards: ShardRecord[];
}

const fetchJson = async <T>(url: string): Promise<T> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} → HTTP ${response.status}`);
  return (await response.json()) as T;
};

export const fetchManifest = (lang: TargetLang): Promise<ContentManifest> =>
  fetchJson<ContentManifest>(`${CONTENT_BASE}/${lang}/manifest.json`);

// ------------------------------------------------------ lexemes → IndexedDB

const toItem = (wire: WireLexeme, lang: TargetLang): Item => ({
  id: wire.id,
  lang,
  kind: 'lexeme',
  headword: wire.headword,
  anchorSentenceIds: wire.anchors,
  freqRank: wire.freqRank,
  band: wire.band,
  interferenceTags: [],
  // Derived from the Tatoeba English corpus rather than lifted from one
  // sentence, so the external id is the surface form itself.
  sourceRef: { dataset: 'tatoeba', externalId: wire.headword },
});

export interface ImportResult {
  imported: string[];
  skipped: string[];
  items: number;
}

/**
 * Ensures the given bands' vocabulary is present locally, and warms the anchor
 * sentences for them so the first question does not wait on a fetch.
 */
export const ensureBands = async (
  lang: TargetLang,
  bands: readonly FrequencyBand[],
  manifest?: ContentManifest,
): Promise<ImportResult> => {
  const resolved = manifest ?? (await fetchManifest(lang));
  const result: ImportResult = { imported: [], skipped: [], items: 0 };

  for (const shard of resolved.shards) {
    if (shard.kind !== 'lexemes' || !bands.includes(shard.band)) continue;

    const existing = await db.contentShards.get(shard.path);
    if (existing?.sha256 === shard.sha256) {
      result.skipped.push(shard.path);
      continue;
    }

    const payload = await fetchJson<{ lexemes: WireLexeme[] }>(
      `${CONTENT_BASE}/${lang}/${shard.path}`,
    );
    const rows = payload.lexemes.map((wire) => toItem(wire, lang));
    await db.items.bulkPut(rows);
    await db.contentShards.put({
      path: shard.path,
      lang,
      sha256: shard.sha256,
      importedAt: Date.now(),
      sentences: 0,
      items: rows.length,
    });
    result.imported.push(shard.path);
    result.items += rows.length;
  }

  await Promise.all(bands.map((band) => loadAnchors(lang, band).catch(() => new Map())));
  return result;
};

// ---------------------------------------------------------- anchors → memory

const anchorCache = new Map<string, Map<string, AnchorSentence>>();

/**
 * The anchor sentences for a band, indexed by id. Memoized per band: a session
 * touches one or two bands, and re-parsing a shard per card would be silly.
 */
export const loadAnchors = async (
  lang: TargetLang,
  band: FrequencyBand,
): Promise<Map<string, AnchorSentence>> => {
  const key = `${lang}:${band}`;
  const cached = anchorCache.get(key);
  if (cached) return cached;

  const payload = await fetchJson<{ sentences: AnchorSentence[] }>(
    `${CONTENT_BASE}/${lang}/anchors.b${band}.json`,
  );
  const map = new Map(payload.sentences.map((sentence) => [sentence.id, sentence]));
  anchorCache.set(key, map);
  return map;
};

export const getAnchor = async (
  lang: TargetLang,
  band: FrequencyBand,
  id: string,
): Promise<AnchorSentence | null> => (await loadAnchors(lang, band)).get(id) ?? null;

/** Same-band sentences, for SPEC §2.3's multiple-choice distractors. */
export const anchorPool = async (
  lang: TargetLang,
  band: FrequencyBand,
): Promise<AnchorSentence[]> => [...(await loadAnchors(lang, band)).values()];

/** Test seam: the cache is process-wide and would otherwise leak between cases. */
export const clearAnchorCache = (): void => {
  anchorCache.clear();
  pseudowordCache.clear();
};

// ------------------------------------------------------------- pseudowords

const pseudowordCache = new Map<string, string[]>();

/**
 * Non-words for the Yes/No vocabulary check (SPEC §4.2). Generated at build
 * time from a character model of the corpus, so they are plausible English
 * shapes that are not English words.
 */
export const loadPseudowords = async (lang: TargetLang): Promise<string[]> => {
  const cached = pseudowordCache.get(lang);
  if (cached) return cached;

  const payload = await fetchJson<{ words: string[] }>(
    `${CONTENT_BASE}/${lang}/pseudowords.json`,
  );
  pseudowordCache.set(lang, payload.words);
  return payload.words;
};

/**
 * Bands a learner starts with before placement (M3) has an opinion.
 * Decision D3: the default profile is an intermediate English speaker, so the
 * starter set reaches band 3 (ranks 1–2000) rather than stopping at the first
 * 500 words they already know.
 */
export const STARTER_BANDS: readonly FrequencyBand[] = [1, 2, 3];

export const isContentReady = async (lang: TargetLang): Promise<boolean> =>
  (await db.contentShards.where('lang').equals(lang).count()) > 0;
