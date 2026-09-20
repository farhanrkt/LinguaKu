/**
 * Downloads the Wikimedia dumps into .cache/wiktionary/ (gitignored).
 *
 * `npm run ingest:fetch:wiki`
 *
 * Same shape and same rules as the Tatoeba fetch: it runs offline, the outputs
 * are committed rather than the inputs, and it needs `bunzip2` on PATH because
 * Node's zlib has no bzip2 and pulling a decompressor in as a dependency to run
 * one command offline does not earn its place (§0 rule 1).
 *
 * Both dumps are CC BY-SA 4.0 — verified 2026-08-12 at dumps.wikimedia.org and
 * against each wiki's own `siprop=rightsinfo`. See NOTICE.md.
 */
import { spawnSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CACHE_DIR = join(ROOT, '.cache', 'wiktionary');

export const DUMPS = {
  /** Indonesian Wiktionary: Indonesian definitions of English/Japanese words. */
  idwiktionary:
    'https://dumps.wikimedia.org/idwiktionary/latest/idwiktionary-latest-pages-articles.xml.bz2',
  /** Simple English Wikipedia: the graded passage corpus (SPEC §5.2). */
  simplewiki:
    'https://dumps.wikimedia.org/simplewiki/latest/simplewiki-latest-pages-articles.xml.bz2',
} as const;

export const localPath = (name: keyof typeof DUMPS): string =>
  join(CACHE_DIR, `${name}-pages-articles.xml`);

const exists = async (path: string): Promise<boolean> =>
  stat(path)
    .then(() => true)
    .catch(() => false);

const download = async (name: keyof typeof DUMPS): Promise<void> => {
  const xml = localPath(name);
  if (await exists(xml)) {
    console.log(`· ${name}: already in .cache`);
    return;
  }

  const archive = `${xml}.bz2`;
  if (!(await exists(archive))) {
    console.log(`↓ ${name}`);
    const response = await fetch(DUMPS[name]);
    if (!response.ok || !response.body) {
      throw new Error(`${name}: ${response.status} ${response.statusText}`);
    }
    await pipeline(Readable.fromWeb(response.body), createWriteStream(archive));
  }

  console.log(`· ${name}: decompressing`);
  const result = spawnSync('bunzip2', ['-k', '-f', archive], { stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error('bunzip2 failed — is it on PATH? (macOS and every Linux distro ship it)');
  }
};

await mkdir(CACHE_DIR, { recursive: true });
for (const name of Object.keys(DUMPS) as Array<keyof typeof DUMPS>) await download(name);
console.log('✓ dumps ready in .cache/wiktionary/');
