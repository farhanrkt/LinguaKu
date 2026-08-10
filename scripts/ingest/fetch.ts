/**
 * Downloads the raw Tatoeba exports into .cache/ (gitignored).
 *
 * SPEC §5.3: the pipeline runs offline and its *outputs* are committed, so
 * this never runs in CI and the multi-megabyte inputs never enter the repo.
 *
 * Usage: npm run ingest:fetch
 * Requires: `bunzip2` on PATH (macOS and every Linux distro ship it; Node has
 * no bzip2 in zlib, and pulling a decompressor in as a dependency to run one
 * command offline does not earn its place — SPEC §0 rule 1).
 */
import { spawnSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CACHE_DIR = join(ROOT, '.cache', 'tatoeba');

const BASE = 'https://downloads.tatoeba.org/exports/per_language';

/** All from the `tatoeba` dataset in data/licenses.json (CC BY 2.0 FR). */
export const EXPORTS = {
  /** `id \t lang \t text` — every Indonesian sentence. */
  indSentences: `${BASE}/ind/ind_sentences.tsv.bz2`,
  /** `ind_id \t eng_id` — Indonesian↔English translation links. */
  indEngLinks: `${BASE}/ind/ind-eng_links.tsv.bz2`,
  /** `id \t lang \t text` — every English sentence; also our frequency corpus. */
  engSentences: `${BASE}/eng/eng_sentences.tsv.bz2`,
} as const;

export const localPath = (url: string): string =>
  join(CACHE_DIR, url.split('/').pop()!.replace(/\.bz2$/, ''));

const exists = (path: string): Promise<boolean> =>
  stat(path).then(
    () => true,
    () => false,
  );

const download = async (url: string): Promise<void> => {
  const target = localPath(url);
  if (await exists(target)) {
    console.log(`· cached  ${target.replace(ROOT + '/', '')}`);
    return;
  }

  const compressed = `${target}.bz2`;
  console.log(`↓ fetching ${url}`);
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`${url} → HTTP ${response.status}`);
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(compressed));

  const result = spawnSync('bunzip2', ['-f', compressed], { stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(`bunzip2 failed on ${compressed} (is bzip2 installed?)`);
  }
  const { size } = await stat(target);
  console.log(`✓ ${(size / 1024 / 1024).toFixed(1)} MB  ${target.replace(ROOT + '/', '')}`);
};

await mkdir(CACHE_DIR, { recursive: true });
for (const url of Object.values(EXPORTS)) await download(url);
