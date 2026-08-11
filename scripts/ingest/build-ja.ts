/**
 * Japanese content pipeline (SPEC §5.3, milestone M6).
 *
 *   Tatoeba jpn + jpn-ind + jpn-eng + ind-eng, JMdict, KANJIDIC2, KRADFILE
 *     → triangulate translations → tokenize (build time) → rank → band
 *     → shard by band → content hashes
 *     → assets/content/ja/
 *
 * ## The translation problem, measured rather than assumed
 *
 * Risk R2 predicted Japanese would fail SPEC §2.5 ("everything lives in a
 * sentence, with an Indonesian translation") because direct JA↔ID pairs would be
 * "a subset of a subset, possibly in the hundreds". Measured on 2026-08-11:
 *
 *   Japanese sentences                248,849
 *   with a *direct* Indonesian pair     5,919
 *   reachable through English          12,395
 *   union                              15,326
 *
 * So the prediction was pessimistic but the shape was right: direct pairs alone
 * are thin, and triangulating through English roughly triples the corpus. Every
 * sentence records which route produced it (`via`), because a JA→EN→ID chain has
 * been through two translators and can drift in a way a direct pair cannot. That
 * flag is what lets the reviewer audit it and the UI decide how much to trust it.
 *
 * ## Licence
 *
 * EDRDG data is CC BY-SA 4.0 — **share-alike** — so these shards ship under CC
 * BY-SA 4.0, not the CC BY 2.0 FR the English shards carry. Attribution is a
 * licence condition, satisfied by NOTICE.md and the in-app attribution screen.
 *
 * Usage: npm run ingest:fetch && npm run ingest:ja
 */
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { gzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { XMLParser } from 'fast-xml-parser';

import { bandForRank, rankTokens, type FrequencyBand } from '../../src/core/frequency.ts';
import { EXPORTS, GZ_EXPORTS, localPath } from './fetch.ts';

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_DIR = join(ROOT, 'assets', 'content', 'ja');

/** Bands 1–5, as for English. Band 6 is the open-ended tail. */
const MAX_LEXEME_RANK = 8000;
const MIN_ANCHORS = 1;
const MAX_ANCHORS = 5;
const BANDS: FrequencyBand[] = [1, 2, 3, 4, 5, 6];

const readLines = async function* (path: string): AsyncGenerator<string> {
  const stream = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  for await (const line of stream) if (line.length > 0) yield line;
};

// ------------------------------------------------------------------ 1. inputs

console.log('reading Indonesian and English sentences…');
const indonesian = new Map<string, string>();
for await (const line of readLines(localPath(EXPORTS.indSentences))) {
  const [id, , text] = line.split('\t');
  if (id && text) indonesian.set(id, text.trim());
}

/** eng_id → ind_id, shortest translation wins so reruns agree (as in build-en). */
const indForEng = new Map<string, string>();
for await (const line of readLines(localPath(EXPORTS.indEngLinks))) {
  const [indId, engId] = line.split('\t');
  if (!indId || !engId || !indonesian.has(indId)) continue;
  const incumbent = indForEng.get(engId);
  if (incumbent === undefined) {
    indForEng.set(engId, indId);
    continue;
  }
  const candidate = indonesian.get(indId)!;
  const current = indonesian.get(incumbent)!;
  if (candidate.length < current.length || (candidate.length === current.length && indId < incumbent)) {
    indForEng.set(engId, indId);
  }
}
console.log(`  ${indonesian.size.toLocaleString()} Indonesian sentences, ${indForEng.size.toLocaleString()} reachable from English`);

console.log('reading Japanese sentences…');
const japanese = new Map<string, string>();
for await (const line of readLines(localPath(EXPORTS.jpnSentences))) {
  const [id, , text] = line.split('\t');
  if (id && text) japanese.set(id, text.trim());
}
console.log(`  ${japanese.size.toLocaleString()} Japanese sentences`);

// --------------------------------------------- 2. translations: direct, then EN

type Route = 'direct' | 'en';

interface Translation {
  indId: string;
  text: string;
  via: Route;
  /** The English sentence a triangulated pair was bridged through, for audit. */
  bridgeEngId?: string;
}

const translation = new Map<string, Translation>();

for await (const line of readLines(localPath(EXPORTS.jpnIndLinks))) {
  const [jpnId, indId] = line.split('\t');
  if (!jpnId || !indId || !japanese.has(jpnId)) continue;
  const text = indonesian.get(indId);
  if (!text) continue;
  const incumbent = translation.get(jpnId);
  // Shortest wins, ties by id — deterministic (invariant 10).
  if (!incumbent || text.length < incumbent.text.length || (text.length === incumbent.text.length && indId < incumbent.indId)) {
    translation.set(jpnId, { indId, text, via: 'direct' });
  }
}
const directCount = translation.size;

for await (const line of readLines(localPath(EXPORTS.jpnEngLinks))) {
  const [jpnId, engId] = line.split('\t');
  if (!jpnId || !engId || !japanese.has(jpnId)) continue;
  // A direct pair is always better than a two-hop one: never overwrite.
  if (translation.get(jpnId)?.via === 'direct') continue;
  const indId = indForEng.get(engId);
  if (!indId) continue;
  const text = indonesian.get(indId);
  if (!text) continue;
  const incumbent = translation.get(jpnId);
  if (!incumbent || text.length < incumbent.text.length || (text.length === incumbent.text.length && indId < incumbent.indId)) {
    translation.set(jpnId, { indId, text, via: 'en', bridgeEngId: engId });
  }
}
console.log(
  `  ${translation.size.toLocaleString()} Japanese sentences with an Indonesian translation ` +
    `(${directCount.toLocaleString()} direct, ${(translation.size - directCount).toLocaleString()} via English)`,
);

// -------------------------------------------------- 3. build-time tokenization

/**
 * SPEC §5.1 and decision D10: tokenize at build time, never at runtime. A
 * bundled morphological dictionary is an order of magnitude over the whole
 * content budget, so `Sentence.tokens` is precomputed here and the browser never
 * sees IPAdic.
 */
console.log('building the tokenizer…');
interface KuromojiToken {
  surface_form: string;
  reading?: string;
  pos: string;
  basic_form: string;
}
interface Tokenizer {
  tokenize(text: string): KuromojiToken[];
}
const kuromoji = require('@sglkc/kuromoji') as {
  builder(options: { dicPath: string }): {
    build(callback: (error: Error | null, tokenizer: Tokenizer) => void): void;
  };
};
const dicPath = join(dirname(require.resolve('@sglkc/kuromoji/package.json')), 'dict');
const tokenizer = await new Promise<Tokenizer>((resolve, reject) => {
  kuromoji.builder({ dicPath }).build((error, built) => (error ? reject(error) : resolve(built)));
});

/** Content words only: particles and punctuation are grammar, not vocabulary. */
const TEACHABLE_POS = new Set(['名詞', '動詞', '形容詞', '副詞', '連体詞', '感動詞']);
/** Anything that is only punctuation or latin is not a Japanese lexeme. */
const isJapanese = (text: string): boolean =>
  /[぀-ゟ゠-ヿ一-龯]/.test(text);

interface Pair {
  jpnId: string;
  text: string;
  tokens: string[];
  /** Lemmas, for the vocabulary inventory — 行き and 行っ are both 行く. */
  lemmas: string[];
  readings: string[];
  tr: Translation;
}

console.log('tokenizing…');
const pairs: Pair[] = [];
const seenText = new Set<string>();
for (const [jpnId, tr] of [...translation].sort(([a], [b]) => Number(a) - Number(b))) {
  const text = japanese.get(jpnId)!;
  if (seenText.has(text)) continue;
  seenText.add(text);

  const analysed = tokenizer.tokenize(text);
  const tokens = analysed.map((token) => token.surface_form);
  const lemmas = analysed
    .filter((token) => TEACHABLE_POS.has(token.pos) && isJapanese(token.basic_form))
    .map((token) => (token.basic_form === '*' ? token.surface_form : token.basic_form));

  pairs.push({
    jpnId,
    text,
    tokens,
    lemmas,
    readings: analysed.map((token) => token.reading ?? token.surface_form),
    tr,
  });
}
console.log(`  ${pairs.length.toLocaleString()} deduped JA↔ID pairs tokenized`);

// ----------------------------------------------------- 4. frequency and banding

/**
 * Ranks come from the Japanese corpus we teach from, exactly as English ranks
 * come from Tatoeba's English corpus (decision D13). Same reasoning: no extra
 * licence surface, register-matched to the sentences, and self-consistent with
 * the coverage figures in SPEC §2.4 and §9.
 */
const counts = new Map<string, number>();
for (const pair of pairs) {
  for (const lemma of pair.lemmas) counts.set(lemma, (counts.get(lemma) ?? 0) + 1);
}
const ranks = rankTokens(counts);
const totalTokens = [...counts.values()].reduce((sum, count) => sum + count, 0);
const shareOf = (lemma: string): number =>
  Number(((counts.get(lemma) ?? 0) / totalTokens).toPrecision(6));
console.log(`  ${ranks.size.toLocaleString()} distinct lemmas over ${totalTokens.toLocaleString()} tokens`);

// --------------------------------------------------------------- 5. dictionaries

/**
 * JMdict is read by targeted extraction rather than a DOM parse.
 *
 * Not laziness: the file is 60 MB and its DTD defines several hundred entities
 * (`&n;` for noun and so on), which a general parser expands eagerly — enough to
 * trip fast-xml-parser's expansion guard before a single entry is read. We want
 * two fields per entry, both of which are unambiguous single tags, so scanning
 * for them is cheaper, uses a fraction of the memory, and cannot be broken by a
 * change to the entity list.
 */
console.log('reading JMdict…');
const jmdictText = await readFile(localPath(GZ_EXPORTS.jmdict), 'utf8');

/** headword (or reading, for kana-only words) → its first kana reading. */
const readingFor = new Map<string, string>();
let jmdictEntries = 0;
for (const match of jmdictText.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
  const entry = match[1]!;
  jmdictEntries++;
  const reading = /<reb>(.*?)<\/reb>/.exec(entry)?.[1];
  if (!reading) continue;
  const headwords = [...entry.matchAll(/<keb>(.*?)<\/keb>/g)].map((m) => m[1]!);
  for (const headword of headwords) {
    // First entry wins: JMdict orders them with the commonest reading first.
    if (!readingFor.has(headword)) readingFor.set(headword, reading);
  }
  // A kana-only word is its own reading.
  if (headwords.length === 0 && !readingFor.has(reading)) readingFor.set(reading, reading);
}
console.log(`  ${jmdictEntries.toLocaleString()} entries, ${readingFor.size.toLocaleString()} headwords with readings`);

console.log('reading KANJIDIC2…');
// KANJIDIC2 has no such entity problem and its structure is genuinely nested,
// so the real parser earns its place here.
const xml = new XMLParser({ ignoreAttributes: false });
interface KanjiCharacter {
  literal: string;
  misc?: { grade?: number; stroke_count?: number | number[]; freq?: number; jlpt?: number };
  reading_meaning?: {
    rmgroup?: {
      reading?: Array<{ '#text': string; '@_r_type': string }> | { '#text': string; '@_r_type': string };
      meaning?: Array<string | { '#text': string; '@_m_lang'?: string }> | string;
    };
  };
}
const kanjidic = xml.parse(await readFile(localPath(GZ_EXPORTS.kanjidic2), 'utf8')) as {
  kanjidic2: { character: KanjiCharacter[] };
};

console.log('reading KRADFILE…');
/** SPEC §2.11: 校 → 木 + 交. The file is EUC-JP, so it is decoded explicitly. */
const kradText = new TextDecoder('euc-jp').decode(await readFile(localPath(GZ_EXPORTS.kradfile)));
const components = new Map<string, string[]>();
for (const line of kradText.split('\n')) {
  if (line.startsWith('#') || !line.includes(':')) continue;
  const [kanji, rest] = line.split(':');
  if (!kanji || !rest) continue;
  components.set(kanji.trim(), rest.trim().split(/\s+/).filter(Boolean));
}
console.log(`  ${components.size.toLocaleString()} kanji decompositions`);

/**
 * KRADFILE gives the *radical* components — the atoms you would search by. It
 * decomposes 校 as 父 + 木 + 亠, which is correct and is not what SPEC §2.11
 * asks a learner to see: *"a component graph so the learner sees 校 as 木 + 交"*.
 * 交 is itself 亠 + 父, so the spec's split is one level up from the radicals.
 *
 * This recovers that level. For each kanji, it looks for another *kanji* whose
 * own radical set is a proper subset of this one's; where it finds one, the
 * shared radicals collapse into that kanji. 校 = {父, 木, 亠} contains 交 =
 * {亠, 父}, leaving 木 — so 校 = 木 + 交, which is the spec's own example
 * recovered from licensed data rather than authored by hand.
 *
 * UNVALIDATED: the subset rule is a derived heuristic, not something KRADFILE
 * states. It is deliberately conservative — one level, largest match, and only
 * against characters that are themselves kanji — and the raw radical list ships
 * alongside it, so nothing is lost if a grouping turns out to be wrong.
 */
const groupComponents = (literal: string): string[] => {
  const own = components.get(literal);
  if (!own || own.length < 2) return own ?? [];
  const ownSet = new Set(own);

  let best: { kanji: string; parts: string[] } | null = null;
  for (const [candidate, parts] of components) {
    if (candidate === literal || parts.length < 2 || parts.length >= own.length) continue;
    if (!parts.every((part) => ownSet.has(part))) continue;
    if (!best || parts.length > best.parts.length ||
        (parts.length === best.parts.length && candidate < best.kanji)) {
      best = { kanji: candidate, parts };
    }
  }
  if (!best) return own;

  const consumed = new Set(best.parts);
  const rest = own.filter((part) => !consumed.has(part));
  // A grouping that consumes everything says nothing ("校 = 校").
  return rest.length > 0 ? [...rest, best.kanji] : own;
};

// ------------------------------------------------------------ 6. the inventory

const sentenceId = (jpnId: string): string => `tatoeba:jpn:${jpnId}`;

interface Lexeme {
  id: string;
  headword: string;
  reading?: string;
  freqRank: number;
  band: FrequencyBand;
  anchors: string[];
  share: number;
}

/** Easiest first: fewest tokens, ties by id, so a learner meets the simplest example. */
const byLength = [...pairs].sort(
  (a, b) => a.tokens.length - b.tokens.length || Number(a.jpnId) - Number(b.jpnId),
);

const anchorsByLemma = new Map<string, string[]>();
for (const pair of byLength) {
  for (const lemma of new Set(pair.lemmas)) {
    const rank = ranks.get(lemma);
    if (rank === undefined || rank > MAX_LEXEME_RANK) continue;
    const anchors = anchorsByLemma.get(lemma) ?? [];
    if (anchors.length < MAX_ANCHORS) {
      anchors.push(sentenceId(pair.jpnId));
      anchorsByLemma.set(lemma, anchors);
    }
  }
}

const lexemes: Lexeme[] = [];
let rejectedForNoAnchor = 0;
for (const [lemma, rank] of ranks) {
  if (rank > MAX_LEXEME_RANK) continue;
  const anchors = anchorsByLemma.get(lemma) ?? [];
  if (anchors.length < MIN_ANCHORS) {
    rejectedForNoAnchor++;
    continue;
  }
  const reading = readingFor.get(lemma);
  lexemes.push({
    id: `ja:lex:${lemma}`,
    headword: lemma,
    ...(reading ? { reading } : {}),
    freqRank: rank,
    band: bandForRank(rank),
    anchors,
    share: shareOf(lemma),
  });
}
lexemes.sort((a, b) => a.freqRank - b.freqRank);
console.log(
  `  ${lexemes.length.toLocaleString()} lexemes kept; ` +
    `${rejectedForNoAnchor.toLocaleString()} rejected for having no example sentence (SPEC §2.5)`,
);

// ------------------------------------------------------------------- 7. kanji

/** Kanji actually used by the sentences we ship — not all 13,000 in KANJIDIC2. */
const usedKanji = new Set<string>();
for (const pair of pairs) {
  for (const character of pair.text) {
    if (/[一-龯]/.test(character)) usedKanji.add(character);
  }
}

const first = <T>(value: T | T[] | undefined): T | undefined =>
  Array.isArray(value) ? value[0] : value;

interface KanjiRecord {
  id: string;
  literal: string;
  grade: number | null;
  strokes: number | null;
  /** KANJIDIC2's own frequency rank among newspaper kanji, where it has one. */
  freq: number | null;
  /** Old JLPT level (4 = easiest). Not the current N1–N5 scale; see the notes. */
  jlpt: number | null;
  on: string[];
  kun: string[];
  meanings: string[];
  /** The radical components, straight from KRADFILE. Authoritative. */
  components: string[];
  /**
   * The same kanji grouped one level up, so 校 reads as 木 + 交 rather than as
   * three radicals (SPEC §2.11). Derived, not stated by KRADFILE — see
   * `groupComponents`. Equal to `components` where no grouping was found.
   */
  breakdown: string[];
}

const kanji: KanjiRecord[] = [];
for (const character of kanjidic.kanjidic2.character) {
  if (!usedKanji.has(character.literal)) continue;
  const group = character.reading_meaning?.rmgroup;
  const readings = group?.reading
    ? Array.isArray(group.reading)
      ? group.reading
      : [group.reading]
    : [];
  const meanings = (group?.meaning ? (Array.isArray(group.meaning) ? group.meaning : [group.meaning]) : [])
    // KANJIDIC2 carries meanings in several languages; the untagged ones are English.
    .filter((meaning) => typeof meaning === 'string')
    .slice(0, 4);

  kanji.push({
    id: `ja:kanji:${character.literal}`,
    literal: character.literal,
    grade: character.misc?.grade ?? null,
    strokes: first(character.misc?.stroke_count) ?? null,
    freq: character.misc?.freq ?? null,
    jlpt: character.misc?.jlpt ?? null,
    on: readings.filter((r) => r['@_r_type'] === 'ja_on').map((r) => r['#text']).slice(0, 4),
    kun: readings.filter((r) => r['@_r_type'] === 'ja_kun').map((r) => r['#text']).slice(0, 4),
    meanings,
    components: components.get(character.literal) ?? [],
    breakdown: groupComponents(character.literal),
  });
}
kanji.sort((a, b) => (a.freq ?? 99_999) - (b.freq ?? 99_999) || a.literal.localeCompare(b.literal));
const withComponents = kanji.filter((k) => k.components.length > 0).length;
console.log(
  `  ${kanji.length.toLocaleString()} kanji in the shipped sentences; ` +
    `${withComponents.toLocaleString()} have a component breakdown (SPEC §2.11)`,
);

// ---------------------------------------------------------------- 8. sharding

await mkdir(OUT_DIR, { recursive: true });

interface ShardRecord {
  kind: 'sentences' | 'lexemes' | 'anchors' | 'kanji';
  band: FrequencyBand;
  path: string;
  count: number;
  bytes: number;
  gzipBytes: number;
  sha256: string;
}
const shards: ShardRecord[] = [];

/**
 * CC BY-SA 4.0, not CC BY 2.0 FR: these shards mix Tatoeba text with EDRDG
 * readings and kanji data, and EDRDG's share-alike term is the stricter of the
 * two, so it governs the result.
 */
const SOURCES = ['tatoeba', 'jmdict', 'kanjidic2', 'kradfile', 'ipadic'];
const LICENSE = 'CC BY-SA 4.0';

const writeShard = async (
  kind: ShardRecord['kind'],
  band: FrequencyBand,
  payload: Record<string, unknown>,
  count: number,
): Promise<void> => {
  if (count === 0) return;
  const name = `${kind}.b${band}.json`;
  const body = JSON.stringify({ sources: SOURCES, license: LICENSE, ...payload });
  await writeFile(join(OUT_DIR, name), body);
  shards.push({
    kind,
    band,
    path: name,
    count,
    bytes: Buffer.byteLength(body),
    gzipBytes: gzipSync(body, { level: 9 }).length,
    sha256: createHash('sha256').update(body).digest('hex'),
  });
};

/** A sentence's band is its rarest teachable lemma, as for English (D15). */
const bandOf = (pair: Pair): FrequencyBand => {
  const rankList = pair.lemmas
    .map((lemma) => ranks.get(lemma))
    .filter((rank): rank is number => rank !== undefined)
    .sort((a, b) => a - b);
  if (rankList.length === 0) return 6;
  const p90 = rankList[Math.min(rankList.length - 1, Math.floor(rankList.length * 0.9))]!;
  return bandForRank(p90);
};
const bandByPair = new Map(pairs.map((pair) => [pair.jpnId, bandOf(pair)] as const));

const wireSentence = (pair: Pair) => ({
  id: sentenceId(pair.jpnId),
  text: pair.text,
  tokens: pair.tokens,
  readings: pair.readings,
  tr: { id: `tatoeba:ind:${pair.tr.indId}`, text: pair.tr.text },
  // Which route produced the translation. A JA→EN→ID chain has been through two
  // translators; recording it is what makes that auditable rather than invisible.
  via: pair.tr.via,
  ...(pair.tr.bridgeEngId ? { bridge: `tatoeba:eng:${pair.tr.bridgeEngId}` } : {}),
});

for (const band of BANDS) {
  const inBand = pairs.filter((pair) => bandByPair.get(pair.jpnId) === band);
  await writeShard('sentences', band, { lang: 'ja', band, count: inBand.length, sentences: inBand.map(wireSentence) }, inBand.length);

  const bandLexemes = lexemes.filter((lexeme) => lexeme.band === band);
  await writeShard('lexemes', band, { lang: 'ja', band, count: bandLexemes.length, lexemes: bandLexemes }, bandLexemes.length);

  const anchorIds = new Set(bandLexemes.flatMap((lexeme) => lexeme.anchors));
  const anchors = pairs.filter((pair) => anchorIds.has(sentenceId(pair.jpnId)));
  await writeShard('anchors', band, { lang: 'ja', band, count: anchors.length, sentences: anchors.map(wireSentence) }, anchors.length);
}

// Kanji ship as one shard: 2,000-odd records is small, and a learner's kanji
// path does not follow the vocabulary bands.
await writeShard('kanji', 1, { lang: 'ja', count: kanji.length, kanji }, kanji.length);

const manifest = {
  sources: SOURCES,
  license: LICENSE,
  version: 1,
  lang: 'ja',
  corpus: {
    japaneseSentences: japanese.size,
    directPairs: directCount,
    triangulatedPairs: translation.size - directCount,
    pairs: pairs.length,
    distinctLemmas: ranks.size,
    tokenTotal: totalTokens,
    lexemes: lexemes.length,
    kanji: kanji.length,
    kanjiWithComponents: withComponents,
    maxLexemeRank: MAX_LEXEME_RANK,
  },
  coverage: {
    teachableShare: Number(lexemes.reduce((sum, lexeme) => sum + lexeme.share, 0).toPrecision(6)),
    bandShare: BANDS.map((band) => ({
      band,
      share: Number(
        lexemes.filter((l) => l.band === band).reduce((sum, l) => sum + l.share, 0).toPrecision(6),
      ),
      lexemes: lexemes.filter((l) => l.band === band).length,
    })).filter((entry) => entry.lexemes > 0),
  },
  shards: shards.sort((a, b) => a.kind.localeCompare(b.kind) || a.band - b.band),
};
await writeFile(join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));

// ------------------------------------------------------------------ 9. report

const total = (predicate: (shard: ShardRecord) => boolean): string =>
  `${(shards.filter(predicate).reduce((sum, s) => sum + s.gzipBytes, 0) / 1024 / 1024).toFixed(2)} MB`;

console.log('\nshards (gzipped):');
for (const shard of shards) {
  console.log(
    `  ${shard.path.padEnd(18)} ${String(shard.count).padStart(7)} items  ` +
      `${(shard.gzipBytes / 1024).toFixed(1).padStart(8)} KB`,
  );
}
console.log(`\n  band 1 only (beginner first download): ${total((s) => s.band === 1)}`);
console.log(`  everything:                            ${total(() => true)}`);
