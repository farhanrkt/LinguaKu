/**
 * Audio budget and provenance gate (SPEC §5.3, risk R4, invariant 5).
 *
 * `check-licenses.mjs` already refuses a file under `assets/` whose path names
 * no cleared dataset. This checks the two things that are specific to audio and
 * that a licence gate cannot see:
 *
 *  1. **The budget.** A beginner's first download is ≤ 8 MB (SPEC §5.3) and the
 *     text half of it is already accounted for. Audio is the only thing in this
 *     project capable of blowing that budget by an order of magnitude, and the
 *     failure mode is silent: the build succeeds, the app works on the laptop
 *     it was built on, and a learner on mobile data pays for it.
 *  2. **The index tells the truth.** Every clip `audio.json` promises must
 *     exist, and every clip on disk must be reachable from it — an orphan is
 *     bytes shipped for nothing, and a missing one is an L4 card that will fail
 *     to play at the moment a learner is being tested on it.
 *
 * Passing with no audio at all is the expected state today, and is reported as
 * such rather than silently.
 *
 * Usage: node scripts/check-audio.mjs
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = join(ROOT, 'assets', 'content');

/** SPEC §5.3's 8 MB, less the ~1.4 MB of text a two-language install ships. */
const BUDGET_BYTES = 6.5 * 1024 * 1024;

const errors = [];
const fail = (message) => errors.push(message);

let totalBytes = 0;
let totalClips = 0;
let languages = 0;

if (existsSync(CONTENT)) {
  for (const lang of readdirSync(CONTENT)) {
    const indexPath = join(CONTENT, lang, 'audio.json');
    if (!existsSync(indexPath)) continue;
    languages++;

    let index;
    try {
      index = JSON.parse(readFileSync(indexPath, 'utf8'));
    } catch {
      fail(`${relative(ROOT, indexPath)}: not valid JSON`);
      continue;
    }

    if (!Array.isArray(index.sources) || index.sources.length === 0) {
      fail(`${relative(ROOT, indexPath)}: missing "sources" — the licence gate reads it`);
    }

    const clips = Object.entries(index.clips ?? {});
    if (clips.length === 0) fail(`${relative(ROOT, indexPath)}: an index with no clips in it`);

    const referenced = new Set();
    for (const [key, url] of clips) {
      // URLs are absolute paths into the built site: /content/<lang>/<voice>/<file>.
      const relativePath = String(url).replace(/^\/content\//, '');
      const onDisk = join(CONTENT, relativePath);
      if (!existsSync(onDisk)) {
        fail(`${lang}: "${key}" points at ${url}, which does not exist`);
        continue;
      }
      referenced.add(onDisk);
      totalBytes += statSync(onDisk).size;
      totalClips++;
    }

    // Orphans: bytes that ship and are never played.
    const voiceDirs = readdirSync(join(CONTENT, lang), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(CONTENT, lang, entry.name));
    for (const dir of voiceDirs) {
      for (const file of readdirSync(dir)) {
        const full = join(dir, file);
        if (!referenced.has(full)) {
          fail(`${relative(ROOT, full)}: on disk but not in audio.json`);
        }
      }
    }
  }
}

if (totalBytes > BUDGET_BYTES) {
  fail(
    `audio is ${(totalBytes / 1024 / 1024).toFixed(2)} MB, over the ${(BUDGET_BYTES / 1024 / 1024).toFixed(2)} MB budget (SPEC §5.3)`,
  );
}

if (errors.length > 0) {
  for (const error of errors) console.error(`✗ ${error}`);
  console.error(`\n${errors.length} audio problem(s).`);
  process.exit(1);
}

console.log(
  languages === 0
    ? '✓ no pre-cached audio yet — the fallback chain terminates in synthesis (risk R1)'
    : `✓ ${totalClips} clip(s) across ${languages} language(s), ${(totalBytes / 1024 / 1024).toFixed(2)} MB / ${(BUDGET_BYTES / 1024 / 1024).toFixed(2)} MB`,
);
