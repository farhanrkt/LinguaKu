/**
 * Compiles data/meanings/{lang}.yaml into assets/content/{lang}/meanings.b*.json.
 *
 * Authored Indonesian meanings for words id.wiktionary does not cover (D112),
 * and — for Japanese — what the grammar tokens in a sentence do
 * (data/meanings/ja-forms.yaml). Like the chunk and topic compilers
 * (invariant 32) it checks every entry against what ships and fails on a word
 * the inventory does not contain, or a form no sentence contains, so neither
 * file can rot silently as the corpus changes. Deterministic (invariant 10):
 * entries sorted, no timestamps.
 *
 *   node scripts/ingest/build-meanings.ts
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { parse } from 'yaml';
import { annotate, loadTokenizer } from './japaneseRomaji.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

interface ShardRecord {
  kind: string;
  band: number;
  path: string;
  count: number;
  bytes: number;
  gzipBytes: number;
  sha256: string;
}

for (const lang of ['en', 'ja'] as const) {
  const sourcePath = join(ROOT, 'data', 'meanings', `${lang}.yaml`);
  if (!existsSync(sourcePath)) continue;
  const source = parse(await readFile(sourcePath, 'utf8')) as Record<string, string>;

  const dir = join(ROOT, 'assets', 'content', lang);
  const manifestPath = join(dir, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { shards: ShardRecord[] };

  const lexemes = new Map<string, { id: string; band: number }>();
  for (const record of manifest.shards.filter((shard) => shard.kind === 'lexemes')) {
    const shard = JSON.parse(await readFile(join(dir, record.path), 'utf8')) as {
      lexemes: Array<{ id: string; headword: string; band: number }>;
    };
    for (const lexeme of shard.lexemes) lexemes.set(lexeme.headword, lexeme);
  }

  // An explanation that mentions Japanese spells it inline, as every other
  // authored string does (D111): でした (deshita).
  const tokenizer = lang === 'ja' ? await loadTokenizer() : null;
  const sensesOf = (text: string): string[] =>
    (tokenizer ? annotate(tokenizer, text) : text)
      .split(';')
      .map((sense) => sense.trim())
      .filter((sense) => sense.length > 0);

  const unknown = Object.keys(source).filter((headword) => !lexemes.has(headword));
  if (unknown.length > 0) {
    throw new Error(`data/meanings/${lang}.yaml: not in the shipped inventory: ${unknown.join(', ')}`);
  }

  // Grammar tokens: particles, auxiliaries, inflected pieces. Not words, so
  // checked against the tokens the shipped sentences actually contain.
  const formsPath = join(ROOT, 'data', 'meanings', `${lang}-forms.yaml`);
  const forms = existsSync(formsPath)
    ? (parse(await readFile(formsPath, 'utf8')) as Record<string, string>)
    : {};
  if (Object.keys(forms).length > 0) {
    const tokens = new Set<string>();
    for (const record of manifest.shards.filter((shard) => shard.kind === 'anchors')) {
      const shard = JSON.parse(await readFile(join(dir, record.path), 'utf8')) as {
        sentences: Array<{ tokens?: string[] }>;
      };
      for (const sentence of shard.sentences) for (const token of sentence.tokens ?? []) tokens.add(token);
    }
    const absent = Object.keys(forms).filter((token) => !tokens.has(token));
    if (absent.length > 0) {
      throw new Error(`data/meanings/${lang}-forms.yaml: no shipped sentence contains: ${absent.join(', ')}`);
    }
    for (const [token, meaning] of Object.entries(forms)) {
      if (typeof meaning !== 'string' || meaning.trim().length === 0) {
        throw new Error(`data/meanings/${lang}-forms.yaml: ${token} has no explanation`);
      }
    }
  }

  const byBand = new Map<number, Array<[string, string[]]>>();
  for (const [headword, meaning] of Object.entries(source)) {
    if (typeof meaning !== 'string' || meaning.trim().length === 0) {
      throw new Error(`data/meanings/${lang}.yaml: ${headword} has no meaning`);
    }
    const lexeme = lexemes.get(headword)!;
    const senses = sensesOf(meaning);
    const list = byBand.get(lexeme.band) ?? [];
    list.push([lexeme.id, senses]);
    byBand.set(lexeme.band, list);
  }

  for (const [band, entries] of [...byBand].sort((a, b) => a[0] - b[0])) {
    entries.sort((a, b) => (a[0] < b[0] ? -1 : 1));
    const name = `meanings.b${band}.json`;
    // The forms ride in band 1, which every learner of the language has: a
    // particle is not rarer than the first word it is attached to.
    const formEntries =
      band === 1
        ? Object.entries(forms)
            .map(([token, meaning]): [string, string[]] => [token, sensesOf(meaning)])
            .sort((a, b) => (a[0] < b[0] ? -1 : 1))
        : [];
    const body = JSON.stringify({
      sources: ['linguaku-authored'],
      license: 'MIT',
      lang,
      band,
      count: entries.length,
      meanings: Object.fromEntries(entries),
      ...(formEntries.length > 0 ? { forms: Object.fromEntries(formEntries) } : {}),
    });
    await writeFile(join(dir, name), body);
    const record: ShardRecord = {
      kind: 'meanings',
      band,
      path: name,
      count: entries.length,
      bytes: Buffer.byteLength(body),
      gzipBytes: gzipSync(body, { level: 9 }).length,
      sha256: createHash('sha256').update(body).digest('hex'),
    };
    const at = manifest.shards.findIndex((shard) => shard.kind === 'meanings' && shard.band === band);
    if (at === -1) manifest.shards.push(record);
    else manifest.shards[at] = record;
    console.log(`✓ ${lang}/${name}: ${entries.length} meanings`);
  }
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
}
