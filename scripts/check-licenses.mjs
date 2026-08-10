/**
 * License gate (SPEC §5.2 hard rule): no dataset lands in assets/ without an
 * entry in data/licenses.json and a matching section in NOTICE.md.
 *
 * The pipeline convention this enforces:
 *  - generated JSON shards carry a top-level `sources: string[]` of dataset
 *    keys (a shard may legitimately mix Tatoeba sentences with Wiktionary
 *    glosses, so provenance is per-file, not per-directory);
 *  - binary assets (audio, images) live under a directory named for their
 *    dataset key, because they cannot carry metadata inline.
 *
 * Usage: node scripts/check-licenses.mjs
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LICENSES = join(ROOT, 'data', 'licenses.json');
const NOTICE = join(ROOT, 'NOTICE.md');
const ASSETS = join(ROOT, 'assets');

const REQUIRED_FIELDS = [
  'key',
  'name',
  'url',
  'license',
  'licenseUrl',
  'attributionRequired',
  'shareAlike',
  'verifiedOn',
];

const errors = [];
const fail = (message) => errors.push(message);

// ------------------------------------------------------------ licenses.json

if (!existsSync(LICENSES)) {
  console.error('✗ data/licenses.json is missing.');
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(LICENSES, 'utf8'));
const datasets = manifest.datasets ?? [];
const keys = new Set();

for (const [index, dataset] of datasets.entries()) {
  const label = dataset.key ?? `datasets[${index}]`;
  for (const field of REQUIRED_FIELDS) {
    if (dataset[field] === undefined || dataset[field] === '') {
      fail(`${label}: missing required field "${field}"`);
    }
  }
  if (typeof dataset.attributionRequired !== 'boolean') {
    fail(`${label}: "attributionRequired" must be a boolean`);
  }
  if (typeof dataset.shareAlike !== 'boolean') {
    fail(`${label}: "shareAlike" must be a boolean`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataset.verifiedOn ?? '')) {
    fail(`${label}: "verifiedOn" must be an ISO date — license terms drift`);
  }
  if (keys.has(dataset.key)) fail(`${label}: duplicate dataset key`);
  keys.add(dataset.key);
}

// --------------------------------------------------------------- NOTICE.md

if (!existsSync(NOTICE)) {
  fail('NOTICE.md is missing — attribution is a licence condition, not a nicety');
} else {
  const notice = readFileSync(NOTICE, 'utf8');
  for (const dataset of datasets) {
    if (dataset.attributionRequired && !notice.includes(dataset.name)) {
      fail(`NOTICE.md does not mention "${dataset.name}", which requires attribution`);
    }
  }
}

// ------------------------------------------------------------------ assets

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });

let checkedFiles = 0;
if (existsSync(ASSETS)) {
  for (const file of walk(ASSETS)) {
    const rel = relative(ROOT, file);
    checkedFiles++;
    if (file.endsWith('.json')) {
      let sources;
      try {
        sources = JSON.parse(readFileSync(file, 'utf8')).sources;
      } catch {
        fail(`${rel}: not valid JSON`);
        continue;
      }
      if (!Array.isArray(sources) || sources.length === 0) {
        fail(`${rel}: missing a non-empty top-level "sources" array of dataset keys`);
        continue;
      }
      for (const source of sources) {
        if (!keys.has(source)) fail(`${rel}: unknown dataset key "${source}"`);
      }
    } else {
      const segments = relative(ASSETS, file).split(sep).slice(0, -1);
      if (!segments.some((segment) => keys.has(segment))) {
        fail(`${rel}: no path segment names a dataset in data/licenses.json`);
      }
    }
  }
}

// ------------------------------------------------------------------ report

if (errors.length > 0) {
  for (const error of errors) console.error(`✗ ${error}`);
  console.error(`\n${errors.length} licence problem(s). See SPEC §5.2.`);
  process.exit(1);
}

console.log(
  `✓ ${datasets.length} dataset(s) declared and attributed; ${checkedFiles} asset file(s) traced.`,
);
