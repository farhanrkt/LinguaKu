/**
 * Collocations and formulaic chunks as first-class items (SPEC §2.5).
 *
 * `npm run ingest:chunks`
 *
 * ## Why these are authored rather than mined
 *
 * The obvious approach is statistical: pointwise mutual information over the
 * corpus, take the top n-grams. It was rejected on quality. Tatoeba is
 * saturated with `tom said` and `i don't`, PMI cannot tell a collocation from a
 * frequent accident, and the pipeline has no part-of-speech tags to filter with
 * (D34) — so the output would be a list nobody had read, shipped as teaching
 * material. Invariant 8's spirit applied to content: better to have fewer items
 * that a person chose.
 *
 * So `data/chunks/*.yaml` is authored, and this compiles it. What the corpus
 * does instead is *validate*: every chunk must occur in a sentence the app
 * actually ships, with an Indonesian translation, or **the build fails**. That
 * is §2.5's ingestion rule — the one that rejected 2,185 lexemes at M1 — applied
 * to chunks unchanged. A chunk without an example sentence is a naked word-pair
 * flashcard, which §2.5 exists to forbid.
 *
 * ## Banding
 *
 * By the **rarest word in the chunk**, not the average: "take a shower" is only
 * as reachable as `shower`. Anything else would put a phrase in front of a
 * learner who is missing a word in it.
 *
 * Reads the shipped shards rather than `.cache/`, so it reproduces for anyone
 * with the repository and no corpus download.
 */

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

import { bandForRank, UNKNOWN_RANK, type FrequencyBand } from '../../src/core/frequency.ts';
import { tokenizeLatin } from '../../src/core/tokenize.ts';
import { surfaceForms } from './chunkForms.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BANDS: readonly FrequencyBand[] = [1, 2, 3, 4, 5, 6];

/** Enough to teach the phrase in context; more is shard weight for nothing. */
const MAX_ANCHORS = 4;

/** A representative rank per band, for items that have no rank of their own. */
const RANK_FOR_BAND: Record<FrequencyBand, number> = {
  1: 250,
  2: 750,
  3: 1_500,
  4: 3_000,
  5: 6_000,
  6: 9_000,
};

interface SourceChunk {
  text: string;
  id: string;
  note?: string;
  /**
   * Extra surface forms that count as the same chunk when anchoring.
   *
   * Authored rather than inferred, and Japanese is what needs it: 「お世話にな
   * ります」 appears in the corpus as 「お世話になっております」, which is the same
   * formula one politeness level up. Inflecting Japanese here would mean
   * shipping a conjugator; naming the two or three forms that matter does not.
   */
  also?: string[];
}

interface Sentence {
  id: string;
  text: string;
  /** Absent on Japanese shards, which are not banded by token rank. */
  difficulty?: number;
  /** The band of the shard it shipped in — the band a learner meets it in. */
  band: FrequencyBand;
}

const errors: string[] = [];
const fail = (message: string): void => {
  errors.push(message);
};

/**
 * Whether a sentence contains the chunk.
 *
 * English matches on word boundaries, so `look at` does not match `look after`
 * and `get in` does not match `get into`. Japanese has no word boundaries to
 * match on and its chunks are contiguous strings, so containment is both
 * correct and the only option.
 */
const contains = (sentence: string, chunk: string, lang: 'en' | 'ja'): boolean => {
  if (lang === 'ja') return sentence.includes(chunk);
  // Any inflection of the chunk counts as an example of it: the corpus has
  // "took a shower", not "take a shower", and rejecting that would reject the
  // phrase §2.5 names as its own example. See chunkForms.ts.
  return surfaceForms(chunk).some((form) => {
    const escaped = form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(?<![\\p{L}\\p{N}'])${escaped}(?![\\p{L}\\p{N}'])`, 'iu').test(sentence);
  });
};

const readSentences = async (lang: 'en' | 'ja'): Promise<Sentence[]> => {
  const all: Sentence[] = [];
  for (const band of BANDS) {
    const path = join(ROOT, 'assets', 'content', lang, `sentences.b${band}.json`);
    if (!existsSync(path)) continue;
    const shard = JSON.parse(await readFile(path, 'utf8')) as {
      sentences: Array<Omit<Sentence, 'band'>>;
    };
    // The shard's band, attached per sentence: the Japanese shards carry no
    // per-sentence rank at all (they are not banded by token rank), so this is
    // the only banding signal that exists for both languages.
    all.push(...shard.sentences.map((sentence) => ({ ...sentence, band })));
  }
  return all;
};

const readRanks = async (lang: 'en' | 'ja'): Promise<Map<string, number>> => {
  const ranks = new Map<string, number>();
  for (const band of BANDS) {
    const path = join(ROOT, 'assets', 'content', lang, `lexemes.b${band}.json`);
    if (!existsSync(path)) continue;
    const shard = JSON.parse(await readFile(path, 'utf8')) as {
      lexemes: Array<{ headword: string; freqRank: number }>;
    };
    for (const lexeme of shard.lexemes) ranks.set(lexeme.headword, lexeme.freqRank);
  }
  return ranks;
};

/**
 * The rank of a chunk: its **rarest** word.
 *
 * A chunk is only as reachable as the least common thing in it, and averaging
 * would hide exactly the word that makes it hard. Japanese chunks are not
 * tokenized here — they are fixed formulas rather than compositional phrases,
 * so they are banded by where they are taught rather than by their parts.
 */
const rankOf = (chunk: string, ranks: ReadonlyMap<string, number>, lang: 'en' | 'ja'): number => {
  if (lang === 'ja') return UNKNOWN_RANK;
  const tokens = tokenizeLatin(chunk);
  if (tokens.length === 0) return UNKNOWN_RANK;
  return Math.max(...tokens.map((token) => ranks.get(token) ?? UNKNOWN_RANK));
};

interface WireChunk {
  id: string;
  headword: string;
  gloss: string;
  note?: string;
  freqRank: number;
  band: FrequencyBand;
  anchors: string[];
}

const build = async (lang: 'en' | 'ja'): Promise<number> => {
  const path = join(ROOT, 'data', 'chunks', `${lang}.yaml`);
  if (!existsSync(path)) return 0;

  const source = parse(await readFile(path, 'utf8')) as { chunks: SourceChunk[] };
  const [sentences, ranks] = await Promise.all([readSentences(lang), readRanks(lang)]);

  const byBand = new Map<FrequencyBand, WireChunk[]>();
  const seen = new Set<string>();
  let total = 0;

  for (const entry of source.chunks ?? []) {
    const text = entry.text?.trim();
    if (!text) {
      fail('a chunk with no text');
      continue;
    }
    if (!entry.id?.trim()) fail(`${text}: missing the Indonesian meaning`);
    if (seen.has(text.toLowerCase())) fail(`${text}: listed twice`);
    seen.add(text.toLowerCase());

    // SPEC §2.5, the ingestion rule: no item without an example sentence.
    const forms = [text, ...(entry.also ?? [])];
    const matches = sentences
      .filter((sentence) => forms.some((form) => contains(sentence.text, form, lang)))
      // Easiest band first, then easiest within it, then by id so a rerun is
      // byte-identical (invariant 10).
      .sort(
        (a, b) =>
          a.band - b.band ||
          (a.difficulty ?? 0) - (b.difficulty ?? 0) ||
          (a.id < b.id ? -1 : 1),
      )
      .slice(0, MAX_ANCHORS);

    if (matches.length === 0) {
      fail(`${text}: no sentence in the shipped corpus contains it (SPEC §2.5)`);
      continue;
    }

    const freqRank = rankOf(text, ranks, lang);
    // English is banded by its rarest word: you cannot use a phrase you are
    // missing a word of. A Japanese formula has no such decomposition — it is
    // learned whole — so it is banded by the easiest sentence that teaches it,
    // which is also where a learner would first meet it.
    const easiest = matches[0]!;
    const band = freqRank === UNKNOWN_RANK ? easiest.band : bandForRank(freqRank);

    const bucket = byBand.get(band) ?? [];
    bucket.push({
      id: `${lang}:chunk:${text.replace(/\s+/g, '_')}`,
      headword: text,
      gloss: entry.id.trim(),
      ...(entry.note?.trim() ? { note: entry.note.trim() } : {}),
      // A rank the composer can order by. For a formula with no rank of its
      // own, the middle of the band it sits in — precise enough to sort, and
      // not pretending to a precision it does not have.
      freqRank: freqRank === UNKNOWN_RANK ? RANK_FOR_BAND[band] : freqRank,
      band,
      anchors: matches.map((sentence) => sentence.id),
    });
    byBand.set(band, bucket);
    total++;
  }

  if (errors.length > 0) return total;

  const manifestPath = join(ROOT, 'assets', 'content', lang, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
    shards: Array<Record<string, unknown>>;
    license?: string;
  };

  for (const [band, chunks] of [...byBand.entries()].sort((a, b) => a[0] - b[0])) {
    chunks.sort((a, b) => a.freqRank - b.freqRank || (a.id < b.id ? -1 : 1));
    const name = `chunks.b${band}.json`;
    const body = JSON.stringify({
      // The phrases and their Indonesian are authored here; the example
      // sentences they point at are Tatoeba's, so both are named (D9).
      sources: ['linguaku-authored', 'tatoeba'],
      license: manifest.license ?? 'CC BY 2.0 FR',
      lang,
      band,
      count: chunks.length,
      chunks,
    });
    await writeFile(join(ROOT, 'assets', 'content', lang, name), body);

    const record = {
      kind: 'chunks',
      band,
      path: name,
      count: chunks.length,
      bytes: Buffer.byteLength(body),
      gzipBytes: gzipSync(body, { level: 9 }).length,
      sha256: createHash('sha256').update(body).digest('hex'),
    };
    const at = manifest.shards.findIndex((s) => s.kind === 'chunks' && s.band === band);
    if (at === -1) manifest.shards.push(record);
    else manifest.shards[at] = record;
  }

  manifest.shards.sort((a, b) => String(a.path).localeCompare(String(b.path)));
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  console.log(
    `✓ ${lang}: ${total} chunks anchored across ${byBand.size} band(s) — ` +
      [...byBand.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([band, list]) => `b${band}:${list.length}`)
        .join(' '),
  );
  return total;
};

let shipped = 0;
for (const lang of ['en', 'ja'] as const) shipped += await build(lang);

if (errors.length > 0) {
  for (const error of errors) console.error(`✗ ${error}`);
  console.error(`\n${errors.length} problem(s). Nothing written.`);
  process.exit(1);
}
console.log(`${shipped} chunks total.`);
