/**
 * Indonesian glosses, parsed from the Wiktionary dump (risk R3).
 *
 * `npm run ingest:glosses`
 * Requires `.cache/wiktionary/idwiktionary-pages-articles.xml` — see
 * `npm run ingest:fetch:wiktionary`.
 *
 * ## The route, and why it is not Kaikki
 *
 * R3 left this open with a specific blocker: Kaikki's raw-data page states no
 * licence for the *extraction*, and the underlying Wiktionary content being CC
 * BY-SA does not clear a third party's derived file. R3's own suggestion was to
 * parse the Wikimedia dumps directly, which is what this does — one licence,
 * read at source, no intermediary's terms to assume.
 *
 * ## What the measurement decided
 *
 * Measured 2026-08-12 over the shipped lexeme inventory:
 *
 * | | bands 1–3 |
 * |---|---|
 * | English headwords with an id.wiktionary gloss | **40.3%** (740 / 1,834) |
 * | English, adding en.wiktionary translation tables | 56.5% on band 1 |
 * | Japanese | **9.2%** (184 / 2,000) |
 *
 * The v1.3.0 go/no-go was 70%, so **L2 does not become meaning recall** and
 * D21's supported cloze stands. Two things in the numbers made that clear-cut
 * rather than marginal:
 *
 *  - **The misses are the commonest words.** Of band 1's first sixty by rank,
 *    the words with no gloss are *to, was, do, be, his, are, not, her, at,
 *    didn't, think, as, can, from, go, by* — function words and inflections,
 *    where a dictionary gloss is least meaningful anyway. Coverage is worst
 *    exactly where a learner meets words first.
 *  - **Translation tables carry senses a beginner must not be shown.**
 *    en.wiktionary gives `know → tahu, setubuh`. The second is not wrong; it is
 *    "know" in the biblical sense, and it would be shown to a learner meeting
 *    the word for the first time. That is a per-sense review problem, not a
 *    coverage problem, and it is why those tables are not used here at all.
 *
 * ## So what glosses are for
 *
 * Reference, never an answer key. The distinction is the whole decision:
 * *grading* against a gloss demands that it be right for every item, and an
 * unfair "wrong" is precisely what §2.7 exists to prevent; *displaying* one
 * demands only that it be right when it is shown, and a word with no gloss
 * simply keeps the honest empty state the reader already has.
 *
 * Output: `assets/content/{lang}/glosses.b{band}.json`, its own shard under CC
 * BY-SA 4.0 so the English sentence shards keep CC BY 2.0 FR — mixing the two
 * into one file would quietly upgrade the whole English corpus to share-alike.
 */

import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { gzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { FrequencyBand } from '../../src/core/frequency.ts';
import { sectionsOf, sensesIn } from './wikitext.ts';

/** Bands the pipeline ships lexemes for; band 6 is the open-ended tail. */
const BANDS: readonly FrequencyBand[] = [1, 2, 3, 4, 5];

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DUMP = join(ROOT, '.cache', 'wiktionary', 'idwiktionary-pages-articles.xml');

/** More than this is a dictionary page, not the meaning of a word. */
const MAX_SENSES = 3;

// ---------------------------------------------------------------- the pass

interface Lexeme {
  id: string;
  headword: string;
  reading?: string;
  band: FrequencyBand;
}

const readLexemes = async (lang: 'en' | 'ja'): Promise<Lexeme[]> => {
  const all: Lexeme[] = [];
  for (const band of BANDS) {
    const path = join(ROOT, 'assets', 'content', lang, `lexemes.b${band}.json`);
    if (!existsSync(path)) continue;
    const shard = JSON.parse(await readFile(path, 'utf8')) as { lexemes: Lexeme[] };
    all.push(...shard.lexemes.map((lexeme) => ({ ...lexeme, band })));
  }
  return all;
};

const main = async (): Promise<void> => {
  if (!existsSync(DUMP)) {
    throw new Error(
      `Missing ${DUMP}. Run: npm run ingest:fetch:wiktionary (needs bunzip2, as the Tatoeba fetch does).`,
    );
  }

  const wanted = new Map<'en' | 'ja', Map<string, Lexeme>>();
  for (const lang of ['en', 'ja'] as const) {
    const lexemes = await readLexemes(lang);
    wanted.set(
      lang,
      new Map(
        lexemes.flatMap((lexeme) => {
          // English matches case-insensitively; Japanese is matched on the
          // surface form and on the reading, since a dump page may be titled
          // either way.
          const keys = lang === 'en' ? [lexeme.headword.toLowerCase()] : [lexeme.headword];
          return keys.map((key) => [key, lexeme] as const);
        }),
      ),
    );
  }

  const found = new Map<'en' | 'ja', Map<string, string[]>>([
    ['en', new Map()],
    ['ja', new Map()],
  ]);

  let title = '';
  let inText = false;
  let buffer: string[] = [];
  let pages = 0;

  const consume = (body: string): void => {
    pages++;
    if (title.includes(':') || !body.includes('bahasa|')) return;
    const sections = sectionsOf(body);
    for (const lang of ['en', 'ja'] as const) {
      const chunks = sections.get(lang);
      if (!chunks) continue;
      const key = lang === 'en' ? title.toLowerCase() : title;
      if (!wanted.get(lang)!.has(key)) continue;
      const senses = chunks.flatMap((chunk) => sensesIn(chunk)).slice(0, MAX_SENSES);
      if (senses.length > 0) found.get(lang)!.set(key, senses);
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

  // ------------------------------------------------------------ write shards
  for (const lang of ['en', 'ja'] as const) {
    const lexemes = await readLexemes(lang);
    const glosses = found.get(lang)!;
    const manifestPath = join(ROOT, 'assets', 'content', lang, 'manifest.json');
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
      shards: Array<Record<string, unknown>>;
      glossCoverage?: unknown;
    };

    let total = 0;
    for (const band of BANDS) {
      const inBand = lexemes
        .filter((lexeme) => lexeme.band === band)
        .flatMap((lexeme) => {
          const senses = glosses.get(lang === 'en' ? lexeme.headword.toLowerCase() : lexeme.headword);
          return senses ? [{ id: lexeme.id, senses }] : [];
        })
        // Sorted by id, never by discovery order: invariant 10.
        .sort((a, b) => (a.id < b.id ? -1 : 1));
      if (inBand.length === 0) continue;
      total += inBand.length;

      const name = `glosses.b${band}.json`;
      const body = JSON.stringify({
        sources: ['wiktionary-id'],
        license: 'CC BY-SA 4.0',
        lang,
        band,
        count: inBand.length,
        glosses: Object.fromEntries(inBand.map((entry) => [entry.id, entry.senses])),
      });
      await writeFile(join(ROOT, 'assets', 'content', lang, name), body);

      const record = {
        kind: 'glosses',
        band,
        path: name,
        count: inBand.length,
        bytes: Buffer.byteLength(body),
        gzipBytes: gzipSync(body, { level: 9 }).length,
        sha256: createHash('sha256').update(body).digest('hex'),
      };
      const existing = manifest.shards.findIndex(
        (shard) => shard.kind === 'glosses' && shard.band === band,
      );
      if (existing === -1) manifest.shards.push(record);
      else manifest.shards[existing] = record;
    }

    manifest.shards.sort((a, b) => String(a.path).localeCompare(String(b.path)));
    // The coverage figure is published rather than kept in a commit message:
    // the app has to be able to say how much of its own vocabulary it can gloss.
    manifest.glossCoverage = {
      glossed: total,
      lexemes: lexemes.length,
      share: Number((total / Math.max(1, lexemes.length)).toFixed(4)),
    };
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

    console.log(
      `✓ ${lang}: ${total} of ${lexemes.length} lexemes glossed (${((total / lexemes.length) * 100).toFixed(1)}%) from ${pages} pages`,
    );
  }
};

await main();
