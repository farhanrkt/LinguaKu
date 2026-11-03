/**
 * Applies the reviewed reading table to the committed Japanese lexeme shards.
 *
 * `build-ja.ts` now produces these readings itself (`pickReading` plus
 * `READINGS`), but a full re-run needs JMdict, KANJIDIC2, KRADFILE and the
 * Tatoeba exports in `.cache/` — and rewrites the manifest from scratch. This
 * changes only the `reading` of the lexemes the table settles, rewrites those
 * shards in the pipeline's own serialization, and updates their manifest
 * records, so the result is what a re-run would write for those fields.
 *
 * Deterministic and idempotent: running it twice changes nothing the second
 * time (invariant 10).
 *
 *   node scripts/ingest/fix-ja-readings.ts
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { READINGS } from './jaReadings.ts';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets', 'content', 'ja');

interface Lexeme {
  id: string;
  headword: string;
  reading?: string;
  freqRank: number;
  band: number;
  anchors: string[];
  share: number;
}

interface ShardRecord {
  kind: string;
  band: number;
  path: string;
  count: number;
  bytes: number;
  gzipBytes: number;
  sha256: string;
}

const manifestPath = join(DIR, 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { shards: ShardRecord[] };

let changed = 0;
for (const record of manifest.shards.filter((shard) => shard.kind === 'lexemes')) {
  const path = join(DIR, record.path);
  const shard = JSON.parse(await readFile(path, 'utf8')) as { lexemes: Lexeme[] };
  let touched = false;
  shard.lexemes = shard.lexemes.map((lexeme) => {
    const reading = READINGS[lexeme.headword];
    if (reading === undefined || reading === lexeme.reading) return lexeme;
    touched = true;
    changed++;
    // Key order as the pipeline writes it: reading follows headword.
    const { id, headword, freqRank, band, anchors, share } = lexeme;
    return { id, headword, reading, freqRank, band, anchors, share };
  });
  if (!touched) continue;

  const body = JSON.stringify(shard);
  await writeFile(path, body);
  record.bytes = Buffer.byteLength(body);
  record.gzipBytes = gzipSync(body, { level: 9 }).length;
  record.sha256 = createHash('sha256').update(body).digest('hex');
}

await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`✓ ${changed} reading(s) corrected`);
