/**
 * English content pipeline (SPEC §5.3, milestone M1).
 *
 *   raw Tatoeba exports
 *     → normalize → dedupe → frequency rank → difficulty score → band
 *     → shard by band → content hashes
 *     → assets/content/en/
 *
 * Frequency is derived from Tatoeba's own English corpus rather than an
 * external word list. That is a deliberate choice (decision D13): it adds no
 * licence surface, it is register-matched to the sentences we actually teach
 * from, and it makes §2.4 coverage self-consistent — a rank predicts coverage
 * of *our* corpus, which is the thing coverage is computed over.
 *
 * Usage: npm run ingest:fetch && npm run ingest:en
 */
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { gzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { scoreSentence } from '../../src/core/difficulty.ts';
import { bandForRank, rankTokens, type FrequencyBand } from '../../src/core/frequency.ts';
import { isLikelyProperNoun, type CaseStats } from '../../src/core/properNoun.ts';
import { buildCharModel, generatePseudowords } from '../../src/core/pseudoword.ts';
import { mulberry32 } from '../../src/core/rng.ts';
import {
  isLexemeCandidate,
  tokenizeLatin,
  tokenizeLatinPreservingCase,
} from '../../src/core/tokenize.ts';
import { EXPORTS, localPath } from './fetch.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT_DIR = join(ROOT, 'assets', 'content', 'en');

/** Bands 1–5. Band 6 is the open-ended tail; shipping it is not an M1 concern. */
const MAX_LEXEME_RANK = 8000;
/** SPEC §2.5: a lexeme with no example sentence is rejected, not shipped bare. */
const MIN_ANCHORS = 1;
const MAX_ANCHORS = 5;

const BANDS: FrequencyBand[] = [1, 2, 3, 4, 5, 6];

const readLines = async function* (path: string): AsyncGenerator<string> {
  const stream = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  for await (const line of stream) if (line.length > 0) yield line;
};

// ------------------------------------------------------------------ 1. inputs

console.log('reading Indonesian sentences…');
const indonesian = new Map<string, string>();
for await (const line of readLines(localPath(EXPORTS.indSentences))) {
  const [id, , text] = line.split('\t');
  if (id && text) indonesian.set(id, text.trim());
}
console.log(`  ${indonesian.size.toLocaleString()} Indonesian sentences`);

console.log('reading ind↔eng links…');
const links: Array<readonly [indId: string, engId: string]> = [];
const neededEnglish = new Set<string>();
for await (const line of readLines(localPath(EXPORTS.indEngLinks))) {
  const [indId, engId] = line.split('\t');
  if (indId && engId && indonesian.has(indId)) {
    links.push([indId, engId]);
    neededEnglish.add(engId);
  }
}
console.log(`  ${links.length.toLocaleString()} links`);

// -------------------------------------- 2. frequency over the *whole* corpus

console.log('counting English tokens across the full corpus…');
const counts = new Map<string, number>();
/** Casing tallies, so the lexeme inventory can drop names (Tatoeba is full of Tom). */
const caseStats = new Map<string, CaseStats>();
const english = new Map<string, string>();
let englishLines = 0;
for await (const line of readLines(localPath(EXPORTS.engSentences))) {
  const [id, , text] = line.split('\t');
  if (!id || !text) continue;
  englishLines++;
  const trimmed = text.trim();
  if (neededEnglish.has(id)) english.set(id, trimmed);
  // Split on sentence terminators first: a Tatoeba line can hold more than one
  // sentence, and "sentence-initial" has to mean initial in *its* sentence or
  // the casing evidence is polluted.
  for (const clause of trimmed.split(/(?<=[.!?])[\s"'”’)]*\s+/)) {
    const surfaces = tokenizeLatinPreservingCase(clause);
    for (const [index, surface] of surfaces.entries()) {
      const token = surface.toLowerCase();
      counts.set(token, (counts.get(token) ?? 0) + 1);
      const stats = caseStats.get(token) ?? { nonInitial: 0, nonInitialLowercase: 0 };
      if (index > 0) {
        stats.nonInitial++;
        if (surface === token) stats.nonInitialLowercase++;
      }
      caseStats.set(token, stats);
    }
  }
}
const ranks = rankTokens(counts);
const rankOf = (token: string): number | undefined => ranks.get(token);

/**
 * Total tokens in the corpus the ranks were derived from.
 *
 * This is what turns "you know 2,400 words" into "you understand ~86% of the
 * words you meet" (SPEC §9). Because the ranks come from Tatoeba's own English
 * corpus (D13), that percentage is *exact* over the text we teach from rather
 * than borrowed from someone else's frequency list — no extrapolation, no Zipf
 * approximation standing in for a measurement.
 */
const totalTokens = [...counts.values()].reduce((sum, count) => sum + count, 0);

/** Share of all corpus tokens this word accounts for. */
const shareOf = (token: string): number =>
  Number(((counts.get(token) ?? 0) / totalTokens).toPrecision(6));
console.log(
  `  ${englishLines.toLocaleString()} sentences, ${ranks.size.toLocaleString()} distinct tokens`,
);

// ------------------------------------------------- 3. pair, dedupe, and score

interface Pair {
  engId: string;
  text: string;
  tokens: string[];
  indId: string;
  translation: string;
  difficulty: number;
  band: FrequencyBand;
  /** Highest token rank in the sentence — `CoverageMeta.maxFreqRank` (SPEC §6). */
  maxRank: number;
}

/** One translation per English sentence: shortest, ties broken by id, so reruns agree. */
const bestTranslation = new Map<string, string>();
for (const [indId, engId] of links) {
  if (!english.has(engId)) continue;
  const current = bestTranslation.get(engId);
  if (current === undefined) {
    bestTranslation.set(engId, indId);
    continue;
  }
  const candidate = indonesian.get(indId)!;
  const incumbent = indonesian.get(current)!;
  if (candidate.length < incumbent.length || (candidate.length === incumbent.length && indId < current)) {
    bestTranslation.set(engId, indId);
  }
}

/** And one English sentence per normalized surface form, so near-duplicates go. */
const seenText = new Map<string, string>();
const pairs: Pair[] = [];
for (const [engId, indId] of [...bestTranslation].sort(([a], [b]) => Number(a) - Number(b))) {
  const text = english.get(engId)!;
  const tokens = tokenizeLatin(text);
  if (tokens.length === 0) continue;

  const key = tokens.join(' ');
  const incumbent = seenText.get(key);
  if (incumbent !== undefined) continue;
  seenText.set(key, engId);

  const { difficulty, band, maxRank } = scoreSentence(tokens, rankOf, text);
  pairs.push({
    engId,
    text,
    tokens,
    indId,
    translation: indonesian.get(indId)!,
    difficulty,
    band,
    maxRank,
  });
}
console.log(`  ${pairs.length.toLocaleString()} deduped EN↔ID pairs`);

// ------------------------------------------------------- 4. lexeme inventory

const sentenceId = (engId: string): string => `tatoeba:eng:${engId}`;

interface Lexeme {
  id: string;
  headword: string;
  freqRank: number;
  band: FrequencyBand;
  anchors: string[];
  /** Fraction of corpus tokens this word accounts for (SPEC §9, §2.10). */
  share: number;
}

/** Easiest examples first: a learner meeting a word wants the simplest sentence. */
const byDifficulty = [...pairs].sort(
  (a, b) => a.difficulty - b.difficulty || Number(a.engId) - Number(b.engId),
);

const isVocabulary = (token: string): boolean =>
  isLexemeCandidate(token) &&
  !isLikelyProperNoun(token, caseStats.get(token) ?? { nonInitial: 0, nonInitialLowercase: 0 });

const anchorsByToken = new Map<string, string[]>();
for (const pair of byDifficulty) {
  for (const token of new Set(pair.tokens)) {
    const rank = rankOf(token);
    if (rank === undefined || rank > MAX_LEXEME_RANK || !isVocabulary(token)) continue;
    const anchors = anchorsByToken.get(token) ?? [];
    if (anchors.length < MAX_ANCHORS) {
      anchors.push(sentenceId(pair.engId));
      anchorsByToken.set(token, anchors);
    }
  }
}

const lexemes: Lexeme[] = [];
let rejectedForNoAnchor = 0;
let rejectedAsProperNoun = 0;
for (const [token, rank] of ranks) {
  if (rank > MAX_LEXEME_RANK || !isLexemeCandidate(token)) continue;
  if (!isVocabulary(token)) {
    rejectedAsProperNoun++;
    continue;
  }
  const anchors = anchorsByToken.get(token) ?? [];
  if (anchors.length < MIN_ANCHORS) {
    rejectedForNoAnchor++;
    continue;
  }
  lexemes.push({
    id: `en:lex:${token}`,
    headword: token,
    freqRank: rank,
    band: bandForRank(rank),
    anchors,
    share: shareOf(token),
  });
}
lexemes.sort((a, b) => a.freqRank - b.freqRank);
console.log(
  `  ${lexemes.length.toLocaleString()} lexemes kept; ` +
    `${rejectedForNoAnchor.toLocaleString()} rejected for having no example sentence (SPEC §2.5), ` +
    `${rejectedAsProperNoun.toLocaleString()} as proper nouns`,
);

// ------------------------------------------------------------ 5. pseudowords

// SPEC §4.2: the Yes/No vocabulary check needs plausible non-words, or it
// measures confidence instead of vocabulary. Sampled from a trigram model of
// the corpus's own words, so they follow English phonotactics without being
// English — and so they cost no extra licence surface.
const realWordSet = new Set(
  [...ranks.keys()].filter((token) => /^[a-z]+$/.test(token)),
);
const modelWords = [...ranks.entries()]
  .filter(([token, rank]) => rank <= 20_000 && /^[a-z]{4,9}$/.test(token))
  .map(([token]) => token);

const pseudowords = generatePseudowords(
  buildCharModel(modelWords),
  realWordSet,
  // Fixed seed: the pipeline must be byte-reproducible (D10).
  mulberry32(20260810),
  { count: 240, minLength: 4, maxLength: 9 },
);
console.log(`  ${pseudowords.length} pseudowords from ${modelWords.length.toLocaleString()} words`);

// ---------------------------------------------------------------- 6. sharding

await mkdir(OUT_DIR, { recursive: true });

interface ShardRecord {
  kind: 'sentences' | 'lexemes' | 'anchors';
  band: FrequencyBand;
  path: string;
  count: number;
  bytes: number;
  gzipBytes: number;
  sha256: string;
}

const shards: ShardRecord[] = [];

const writeShard = async (
  kind: ShardRecord['kind'],
  band: FrequencyBand,
  payload: Record<string, unknown>,
  count: number,
): Promise<void> => {
  if (count === 0) return;
  const name = `${kind}.b${band}.json`;
  // `sources` is the licence gate's hook (SPEC §5.2, decision D9).
  const body = JSON.stringify({ sources: ['tatoeba'], license: 'CC BY 2.0 FR', ...payload });
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

for (const band of BANDS) {
  const inBand = pairs.filter((pair) => pair.band === band);
  await writeShard(
    'sentences',
    band,
    {
      lang: 'en',
      band,
      count: inBand.length,
      sentences: inBand.map((pair) => ({
        id: sentenceId(pair.engId),
        text: pair.text,
        difficulty: pair.difficulty,
        maxRank: pair.maxRank,
        tr: { id: `tatoeba:ind:${pair.indId}`, text: pair.translation },
      })),
    },
    inBand.length,
  );

  const bandLexemes = lexemes.filter((lexeme) => lexeme.band === band);
  await writeShard(
    'lexemes',
    band,
    { lang: 'en', band, count: bandLexemes.length, lexemes: bandLexemes },
    bandLexemes.length,
  );

  // Just the sentences this band's lexemes are actually taught through.
  //
  // The full `sentences.*` shards exist for the i+1 selector and the reader
  // (M3, M7), which need the whole corpus. A *session* needs a couple of dozen
  // examples, and importing 27k sentences to show 20 cards costs ~40s on a
  // phone — so the session path loads this instead.
  const anchorIds = new Set(bandLexemes.flatMap((lexeme) => lexeme.anchors));
  const anchors = pairs.filter((pair) => anchorIds.has(sentenceId(pair.engId)));
  await writeShard(
    'anchors',
    band,
    {
      lang: 'en',
      band,
      count: anchors.length,
      sentences: anchors.map((pair) => ({
        id: sentenceId(pair.engId),
        text: pair.text,
        difficulty: pair.difficulty,
        maxRank: pair.maxRank,
        tr: { id: `tatoeba:ind:${pair.indId}`, text: pair.translation },
      })),
    },
    anchors.length,
  );
}

// The manifest carries the hashes (SPEC §5.3 cache-busting). Filenames stay
// stable so the shard list itself is cacheable; the loader compares hashes.
// Deliberately free of timestamps: the same corpus must produce byte-identical
// output, or every rerun invalidates every learner's cache for nothing.
await writeFile(
  join(OUT_DIR, 'pseudowords.json'),
  JSON.stringify({
    sources: ['tatoeba'],
    license: 'CC BY 2.0 FR',
    note: 'Sampled from a trigram model fitted to the Tatoeba English corpus. Derived statistics, not Tatoeba text.',
    lang: 'en',
    count: pseudowords.length,
    words: pseudowords,
  }),
);

const manifest = {
  sources: ['tatoeba'],
  license: 'CC BY 2.0 FR',
  version: 1,
  lang: 'en',
  corpus: {
    englishSentences: englishLines,
    indonesianSentences: indonesian.size,
    links: links.length,
    distinctTokens: ranks.size,
    tokenTotal: totalTokens,
    pairs: pairs.length,
    lexemes: lexemes.length,
    pseudowords: pseudowords.length,
    maxLexemeRank: MAX_LEXEME_RANK,
  },
  /**
   * The ceiling on the capability figure in SPEC §9. A learner who mastered
   * every word we ship would still not reach 100%: proper nouns are filtered
   * from the inventory (D14) and band 6 is not shipped at all, and both still
   * turn up in real sentences. Reporting a percentage without saying what it is
   * a percentage *of* would overstate it.
   */
  coverage: {
    teachableShare: Number(
      lexemes.reduce((sum, lexeme) => sum + lexeme.share, 0).toPrecision(6),
    ),
    bandShare: BANDS.map((band) => ({
      band,
      share: Number(
        lexemes
          .filter((lexeme) => lexeme.band === band)
          .reduce((sum, lexeme) => sum + lexeme.share, 0)
          .toPrecision(6),
      ),
      lexemes: lexemes.filter((lexeme) => lexeme.band === band).length,
    })).filter((entry) => entry.lexemes > 0),
  },
  shards: shards.sort((a, b) => a.kind.localeCompare(b.kind) || a.band - b.band),
};
await writeFile(join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));

// ------------------------------------------------------------------ 6. report

const total = (predicate: (shard: ShardRecord) => boolean): string => {
  const bytes = shards.filter(predicate).reduce((sum, shard) => sum + shard.gzipBytes, 0);
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
};

console.log('\nshards (gzipped):');
for (const shard of shards) {
  console.log(
    `  ${shard.path.padEnd(18)} ${String(shard.count).padStart(7)} items  ` +
      `${(shard.gzipBytes / 1024).toFixed(1).padStart(8)} KB`,
  );
}
console.log(`\n  band 1 only (beginner first download): ${total((s) => s.band === 1)}`);
console.log(`  bands 1-2:                             ${total((s) => s.band <= 2)}`);
console.log(`  everything:                            ${total(() => true)}`);
