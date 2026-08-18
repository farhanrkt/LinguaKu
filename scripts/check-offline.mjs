/**
 * Offline-integrity gate (SPEC §5.4).
 *
 * §5.4 promises the app is *"fully functional offline after first load,
 * including audio for cached bands"*. Two things quietly break that promise as
 * content grows, and neither shows up in any other check — the build succeeds,
 * the tests pass, and the failure only appears on a plane:
 *
 *  1. **The runtime cache is capped.** Workbox evicts least-recently-used
 *     entries past `maxEntries`, so once the shard count passes the cap a
 *     learner starts losing content they have already downloaded. It happened:
 *     the cap was 64 from M2, and glosses, chunks, topics and passages took the
 *     shard count to 65.
 *  2. **A new file type may match no rule at all.** Every runtime rule here
 *     targets `.json`; the first audio clip would have matched none of them and
 *     been re-fetched on every play, which is precisely the situation the clips
 *     exist to survive.
 *
 * So this asserts against the **built service worker** rather than the config
 * that generated it — the artefact that actually ships.
 *
 * Usage: node scripts/check-offline.mjs   (after `npm run build`)
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SW = join(ROOT, 'dist', 'sw.js');
const CONTENT = join(ROOT, 'assets', 'content');

const errors = [];
const fail = (message) => errors.push(message);

if (!existsSync(SW)) {
  console.error('✗ dist/sw.js is missing — run `npm run build` first.');
  process.exit(1);
}
const sw = readFileSync(SW, 'utf8');

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });

const files = existsSync(CONTENT) ? walk(CONTENT) : [];
const shards = files.filter((file) => file.endsWith('.json'));
const clips = files.filter((file) => /\.(m4a|opus|mp3)$/.test(file));

// ------------------------------------------------- the cap must clear the count
//
// Read per cache, not as the maximum across all of them: the audio cache is
// deliberately large, and taking the largest number in the file would let the
// content cache shrink below the shard count without anything noticing — which
// is the exact failure this gate exists for.
const capFor = (cacheName) => {
  const match = new RegExp(`cacheName:"${cacheName}"[^}]*maxEntries:(\\d+)`).exec(sw);
  return match === null ? null : Number(match[1]);
};

const contentCap = capFor('linguaku-content');
if (contentCap === null) {
  fail('no expiration found for the content cache in the service worker');
} else if (contentCap < shards.length) {
  fail(
    `the content cache holds ${contentCap} entries and ${shards.length} shards ship: ` +
      'a learner who fetches them all starts evicting content they already downloaded',
  );
}

const audioCap = capFor('linguaku-audio');
if (clips.length > 0 && audioCap !== null && audioCap < clips.length) {
  fail(`the audio cache holds ${audioCap} entries and ${clips.length} clips ship`);
}

// ------------------------------------------------------ every type has a rule
if (!/content\\?\/.\+\\?\.json/.test(sw) && !sw.includes('json')) {
  fail('no runtime caching rule matches the content shards');
}
if (!/m4a|opus|mp3/.test(sw)) {
  fail(
    'no runtime caching rule matches audio clips — §5.4 promises offline audio for cached bands',
  );
}
if (clips.length > 0 && !sw.includes('linguaku-audio')) {
  fail(`${clips.length} audio clip(s) ship with no cache of their own`);
}

// --------------------------------------------------------- the offline promise
if (!sw.includes('precache') && !sw.includes('precacheAndRoute')) {
  fail('the service worker precaches nothing — the first offline session would fail');
}

if (errors.length > 0) {
  for (const error of errors) console.error(`✗ ${error}`);
  console.error(`\n${errors.length} offline problem(s). See SPEC §5.4.`);
  process.exit(1);
}

console.log(
  `✓ offline: ${shards.length} shard(s) under a ${contentCap}-entry cache, ` +
    `${clips.length} clip(s), audio rule present`,
);
