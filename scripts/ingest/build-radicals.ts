/**
 * Compiles data/radicals/ja.yaml into assets/content/ja/radicals.json (D121).
 *
 * The parts a kanji card shows come from KRADFILE (`components` in the kanji
 * shard), and 98 of the 234 the shipped kanji use are radicals with no reading
 * or meaning anywhere in the data — so the card drew 厶 or 冂 with nothing
 * beside it, and drew KRADFILE's stand-ins (汁 for 氵) as if they were the part.
 * The table names every part: the glyph actually written, its romaji, and its
 * meaning in Indonesian.
 *
 * Validated both ways against the shipped kanji (invariant 32): a part no
 * entry names fails the build, and so does an entry no shipped kanji uses.
 * Deterministic (invariant 10): keys sorted, no timestamps.
 *
 *   node scripts/ingest/build-radicals.ts
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { parse } from 'yaml';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = join(ROOT, 'assets', 'content', 'ja');

interface ShardRecord {
  kind: string;
  band: number;
  path: string;
  count: number;
  bytes: number;
  gzipBytes: number;
  sha256: string;
}

interface Entry {
  glyph?: string;
  romaji: string;
  meaning: string;
}

const source = parse(await readFile(join(ROOT, 'data', 'radicals', 'ja.yaml'), 'utf8')) as Record<string, Entry>;
const manifestPath = join(DIR, 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { shards: ShardRecord[] };

const used = new Set<string>();
for (const record of manifest.shards.filter((shard) => shard.kind === 'kanji')) {
  const shard = JSON.parse(await readFile(join(DIR, record.path), 'utf8')) as {
    kanji: Array<{ literal: string; components: string[] }>;
  };
  for (const kanji of shard.kanji) {
    for (const part of kanji.components) if (part !== kanji.literal) used.add(part);
  }
}

const errors: string[] = [];
const unnamed = [...used].filter((part) => source[part] === undefined);
if (unnamed.length > 0) errors.push(`no entry for parts the shipped kanji use: ${unnamed.join(' ')}`);
const unused = Object.keys(source).filter((part) => !used.has(part));
if (unused.length > 0) errors.push(`entries no shipped kanji uses: ${unused.join(' ')}`);
for (const [part, entry] of Object.entries(source)) {
  if (!/^[a-z]+( [a-z]+)*$/u.test(entry.romaji ?? '')) errors.push(`${part}: romaji must be lowercase Latin words`);
  if (!entry.meaning?.trim()) errors.push(`${part}: no meaning`);
  if (entry.glyph !== undefined && [...entry.glyph].length !== 1) errors.push(`${part}: glyph is one character`);
}
if (errors.length > 0) {
  for (const error of errors) console.error(`✗ ${error}`);
  process.exit(1);
}

const radicals = Object.fromEntries(
  Object.keys(source)
    .sort()
    .map((part) => {
      const entry = source[part]!;
      return [
        part,
        {
          ...(entry.glyph !== undefined ? { glyph: entry.glyph } : {}),
          romaji: entry.romaji,
          meaning: entry.meaning.split(';').map((sense) => sense.trim()).filter((sense) => sense.length > 0),
        },
      ];
    }),
);

const name = 'radicals.json';
const body = JSON.stringify({
  sources: ['linguaku-authored'],
  license: 'MIT',
  lang: 'ja',
  count: Object.keys(radicals).length,
  radicals,
});
await writeFile(join(DIR, name), body);

const record: ShardRecord = {
  kind: 'radicals',
  band: 1,
  path: name,
  count: Object.keys(radicals).length,
  bytes: Buffer.byteLength(body),
  gzipBytes: gzipSync(body, { level: 9 }).length,
  sha256: createHash('sha256').update(body).digest('hex'),
};
const at = manifest.shards.findIndex((shard) => shard.kind === 'radicals');
if (at === -1) manifest.shards.push(record);
else manifest.shards[at] = record;
await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`✓ ja/${name}: ${record.count} parts named (${(record.gzipBytes / 1024).toFixed(1)} KB gzipped)`);
