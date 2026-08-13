/**
 * Graded reading passages from Simple English Wikipedia (SPEC §5.2, §8, D45).
 *
 * `npm run ingest:passages` — needs `.cache/wiktionary/simplewiki-pages-articles.xml`
 * (`npm run ingest:fetch:wiki`).
 *
 * ## Why this exists
 *
 * D45 recorded that the reader is a *feed* of independent sentences because
 * Tatoeba is a corpus of sentence pairs and stringing them into a "passage"
 * would read like nonsense — and that the selector was written so that only the
 * source would have to change when a real passage corpus cleared. This is that
 * source.
 *
 * It also un-corners D28. §2.4's coverage band [0.92, 0.98] is a *running-text*
 * criterion, and on a ten-token sentence the reachable coverages are 1.00, 0.90
 * and 0.80 — the band is literally empty. On a forty-token paragraph it is not,
 * so the spec's own threshold becomes the operative rule for the first time.
 *
 * ## Banding
 *
 * By 90th-percentile token rank, exactly as sentences are banded (D15): "the
 * harder words in this text live in band N" is a defensible claim where "this
 * text is B1" is not. Ranks come from the same Tatoeba-derived inventory the
 * rest of the app uses (D13), so a passage's band means the same thing as a
 * sentence's band and coverage stays self-consistent.
 *
 * A word outside the inventory counts as rank 8,001+ rather than being ignored:
 * Wikipedia's vocabulary is far richer than Tatoeba's, and pretending an
 * unknown word is absent would band an encyclopedia paragraph as beginner text.
 */

import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { gzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { tokenizeLatin } from '../../src/core/tokenize.ts';
import { bandForRank, UNKNOWN_RANK, type FrequencyBand } from '../../src/core/frequency.ts';
import { isArticle, paragraphsOf } from './wikitext-article.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DUMP = join(ROOT, '.cache', 'wiktionary', 'simplewiki-pages-articles.xml');
const OUT_DIR = join(ROOT, 'assets', 'content', 'en');

/**
 * How many passages ship per band.
 *
 * A cap rather than everything: the corpus would yield hundreds of thousands,
 * and a learner reads a handful a day. Bands 1–3 get the most because that is
 * where the learners are (D3), and the shards are lazy anyway (§5.3).
 */
const PER_BAND = 400;

const readRanks = async (): Promise<Map<string, number>> => {
  const ranks = new Map<string, number>();
  for (const band of [1, 2, 3, 4, 5]) {
    const path = join(OUT_DIR, `lexemes.b${band}.json`);
    if (!existsSync(path)) continue;
    const shard = JSON.parse(await readFile(path, 'utf8')) as {
      lexemes: Array<{ headword: string; freqRank: number }>;
    };
    for (const lexeme of shard.lexemes) ranks.set(lexeme.headword, lexeme.freqRank);
  }
  return ranks;
};

/** The 90th-percentile token rank — D15's banding rule, applied to prose. */
export const p90Rank = (tokens: readonly string[], ranks: ReadonlyMap<string, number>): number => {
  if (tokens.length === 0) return UNKNOWN_RANK;
  const sorted = tokens
    .map((token) => ranks.get(token) ?? UNKNOWN_RANK)
    .sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.9))]!;
};

interface Passage {
  id: string;
  title: string;
  text: string;
  band: FrequencyBand;
  tokens: number;
  /** The banding signal (D15), kept so the selector can order within a band. */
  p90: number;
  /** Distinct in-inventory tokens, for the coverage selector (§2.4). */
  vocab: string[];
}

const main = async (): Promise<void> => {
  if (!existsSync(DUMP)) {
    throw new Error(`Missing ${DUMP}. Run: npm run ingest:fetch:wiki`);
  }

  const ranks = await readRanks();
  const byBand = new Map<FrequencyBand, Passage[]>();
  const histogram = new Map<FrequencyBand, number>();

  let title = '';
  let inText = false;
  let buffer: string[] = [];
  let articles = 0;

  const consume = (body: string): void => {
    if (!isArticle(title, body)) return;
    articles++;

    for (const [index, paragraph] of paragraphsOf(body).entries()) {
      const tokens = tokenizeLatin(paragraph);
      const p90 = p90Rank(tokens, ranks);
      const band = bandForRank(p90);
      histogram.set(band, (histogram.get(band) ?? 0) + 1);

      // Distinct tokens the app knows about; the reader's coverage rule reads
      // this rather than re-tokenizing on the phone.
      const vocab = [...new Set(tokens.filter((token) => ranks.has(token)))].sort();
      const bucket = byBand.get(band) ?? [];
      bucket.push({
        id: `simplewiki:${title.replace(/\s+/g, '_')}:${index}`,
        title,
        text: paragraph,
        band,
        tokens: tokens.length,
        p90,
        vocab,
      });
      // Bounded selection, keeping the *easiest* of a band rather than the
      // first encountered — band 6 alone yields a quarter of a million, and
      // alphabetical order by article title is not a pedagogical rule.
      if (bucket.length > PER_BAND * 2) {
        bucket.sort((a, b) => a.p90 - b.p90 || (a.id < b.id ? -1 : 1));
        bucket.length = PER_BAND;
      }
      byBand.set(band, bucket);
    }
  };

  const reader = createInterface({
    input: createReadStream(DUMP, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  for await (const line of reader) {
    const titleMatch = /<title>(.*?)<\/title>/.exec(line);
    if (titleMatch) title = titleMatch[1]!;

    if (line.includes('<text')) {
      if (line.includes('</text>')) {
        consume(line);
      } else {
        inText = true;
        buffer = [line];
      }
      continue;
    }
    if (!inText) continue;
    buffer.push(line);
    if (line.includes('</text>')) {
      inText = false;
      consume(buffer.join('\n'));
    }
  }

  // ------------------------------------------------------------------ output
  const manifestPath = join(OUT_DIR, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
    shards: Array<Record<string, unknown>>;
    passages?: unknown;
  };

  let kept = 0;
  const shipped = new Map<FrequencyBand, number>();
  for (const [band, all] of [...byBand.entries()].sort((a, b) => a[0] - b[0])) {
    // Easiest first within the band, ties broken on id — deterministic, and
    // the order the selector wants anyway (invariant 10).
    all.sort((a, b) => a.p90 - b.p90 || (a.id < b.id ? -1 : 1));
    const passages = all.slice(0, PER_BAND);
    shipped.set(band, passages.length);
    kept += passages.length;
    const name = `passages.b${band}.json`;
    const body = JSON.stringify({
      sources: ['wikipedia-simple-en'],
      license: 'CC BY-SA 4.0',
      lang: 'en',
      band,
      count: passages.length,
      passages,
    });
    await writeFile(join(OUT_DIR, name), body);

    const record = {
      kind: 'passages',
      band,
      path: name,
      count: passages.length,
      bytes: Buffer.byteLength(body),
      gzipBytes: gzipSync(body, { level: 9 }).length,
      sha256: createHash('sha256').update(body).digest('hex'),
    };
    const at = manifest.shards.findIndex(
      (shard) => shard.kind === 'passages' && shard.band === band,
    );
    if (at === -1) manifest.shards.push(record);
    else manifest.shards[at] = record;
  }

  manifest.shards.sort((a, b) => String(a.path).localeCompare(String(b.path)));
  manifest.passages = {
    articles,
    kept,
    perBand: [...histogram.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([band, found]) => ({ band, found, shipped: shipped.get(band) ?? 0 })),
  };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  console.log(`✓ ${articles} articles → ${kept} passages shipped`);
  for (const [band, found] of [...histogram.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`  band ${band}: ${found} found, ${shipped.get(band) ?? 0} shipped`);
  }
};

await main();
