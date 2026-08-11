import { db } from './db.ts';
import { bandForRank, type FrequencyBand } from '../core/frequency.ts';
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
  /**
   * Japanese only: build-time morphological tokens and their readings (D10).
   * The reader never tokenizes — a bundled dictionary is an order of magnitude
   * over the whole content budget — so furigana is assembled from these.
   */
  tokens?: string[];
  readings?: string[];
  /**
   * How this sentence reached Indonesian. `en` means it was triangulated
   * through English and has been through two translators (risk R2, D40); the
   * `bridge` is the English sentence it came via, so a two-hop translation is
   * auditable rather than indistinguishable from a direct one.
   */
  via?: 'direct' | 'en';
  bridge?: string;
}

interface WireLexeme {
  id: string;
  headword: string;
  /** Japanese only: the dictionary reading, from JMdict. */
  reading?: string;
  freqRank: number;
  band: FrequencyBand;
  anchors: string[];
  /** Fraction of corpus tokens this word accounts for (SPEC §9). */
  share?: number;
}

/** A kanji, from KANJIDIC2 and KRADFILE (SPEC §2.11). */
export interface WireKanji {
  id: string;
  literal: string;
  grade: number | null;
  strokes: number | null;
  freq: number | null;
  jlpt: number | null;
  on: string[];
  kun: string[];
  meanings: string[];
  /** KRADFILE's radicals — authoritative. */
  components: string[];
  /** Grouped one level up, so 校 reads as 木 + 交 (decision D41). */
  breakdown: string[];
}

interface ShardRecord {
  kind: 'sentences' | 'lexemes' | 'anchors' | 'kanji';
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
  /**
   * Token-share bookkeeping for the SPEC §9 capability figure. Optional because
   * only the English pipeline emits it so far.
   */
  coverage?: {
    /** Share of corpus tokens covered by everything we ship — the ceiling. */
    teachableShare: number;
    bandShare: Array<{ band: FrequencyBand; share: number; lexemes: number }>;
  };
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
  ...(wire.reading !== undefined ? { reading: wire.reading } : {}),
  freqRank: wire.freqRank,
  band: wire.band,
  ...(wire.share !== undefined ? { share: wire.share } : {}),
  interferenceTags: [],
  // Derived from the corpus rather than lifted from one sentence, so the
  // external id is the surface form itself.
  sourceRef: { dataset: 'tatoeba', externalId: wire.headword },
});

/**
 * A kanji becomes an `Item` like any other, so it gets a card, a schedule and a
 * place in the session — SPEC §2.11 teaches kanji, it does not merely display
 * them. `componentsOf` carries the breakdown the card renders, and the anchors
 * are left empty: a kanji is taught by its components and readings, not by an
 * example sentence, which is why §2.5's anchor rule does not apply to it.
 */
const toKanjiItem = (wire: WireKanji, lang: TargetLang): Item => ({
  id: wire.id,
  lang,
  kind: 'kanji',
  headword: wire.literal,
  ...(wire.kun[0] ?? wire.on[0] ? { reading: wire.kun[0] ?? wire.on[0]! } : {}),
  anchorSentenceIds: [],
  componentsOf: wire.breakdown,
  // KANJIDIC2's newspaper frequency where it has one; otherwise the tail.
  freqRank: wire.freq ?? UNKNOWN_KANJI_RANK,
  band: bandForRank(wire.freq ?? UNKNOWN_KANJI_RANK),
  interferenceTags: [],
  sourceRef: { dataset: 'kanjidic2', externalId: wire.literal },
});

/** Past every band: a kanji with no newspaper frequency is not early material. */
const UNKNOWN_KANJI_RANK = 9_000;

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
    // Kanji ship as one shard rather than per band: a learner's kanji path does
    // not follow the vocabulary bands, and 1,748 records is small enough that
    // splitting it would cost more requests than it saves bytes.
    const wanted =
      shard.kind === 'kanji' ? true : shard.kind === 'lexemes' && bands.includes(shard.band);
    if (!wanted) continue;

    const existing = await db.contentShards.get(shard.path);
    if (existing?.sha256 === shard.sha256) {
      result.skipped.push(shard.path);
      continue;
    }

    const payload = await fetchJson<{ lexemes?: WireLexeme[]; kanji?: WireKanji[] }>(
      `${CONTENT_BASE}/${lang}/${shard.path}`,
    );
    const rows =
      shard.kind === 'kanji'
        ? (payload.kanji ?? []).map((wire) => toKanjiItem(wire, lang))
        : (payload.lexemes ?? []).map((wire) => toItem(wire, lang));
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

// ------------------------------------------------------- the reader's corpus

const sentenceCache = new Map<string, AnchorSentence[]>();

/**
 * The **full** sentence shard for a band, for the reader (SPEC §8).
 *
 * Anchors are the handful of examples a band's vocabulary is taught through;
 * these are everything. They are an order of magnitude larger (211 KB against 15
 * KB for English band 1), which is why they are fetched on demand rather than
 * precached with the starter bands (D20) — a learner who never opens the reader
 * never pays for them, and once fetched the service worker keeps them offline.
 */
export const loadSentences = async (
  lang: TargetLang,
  band: FrequencyBand,
): Promise<AnchorSentence[]> => {
  const key = `${lang}:${band}`;
  const cached = sentenceCache.get(key);
  if (cached) return cached;

  try {
    const payload = await fetchJson<{ sentences: AnchorSentence[] }>(
      `${CONTENT_BASE}/${lang}/sentences.b${band}.json`,
    );
    sentenceCache.set(key, payload.sentences);
    return payload.sentences;
  } catch {
    // Offline before this band was ever fetched. The reader says it has nothing
    // rather than failing to open.
    sentenceCache.set(key, []);
    return [];
  }
};

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
