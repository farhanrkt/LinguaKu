/**
 * Topic clusters (SPEC §2.10, §2.14, §2.8).
 *
 * `npm run ingest:topics`
 *
 * Compiles `data/topics/*.yaml` into `assets/content/{lang}/topics.json`, which
 * is a small map from item id to topic id plus the topic labels the settings
 * screen renders. It is a shard like any other and carries its `sources`.
 *
 * ## What the compiler refuses
 *
 * **A word that is not in the inventory.** The whole value of an authored map
 * is that a human chose the members; the whole risk is that it silently rots as
 * the corpus changes. So every word must resolve to a shipped lexeme, and the
 * build fails with the list of misses. That is the same discipline the
 * contrastive compiler applies to an MCQ whose answer is missing (D31).
 *
 * **A topic with no label or fewer than five words**, because a cluster of two
 * cannot space anything under §2.8 and a topic with no label cannot be offered
 * under §2.14.
 *
 * Coverage — what share of the inventory ended up in any topic — is written
 * into the shard rather than into a commit message: partial tagging is expected
 * and the app should be able to say how partial.
 */

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

import type { FrequencyBand } from '../../src/core/frequency.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BANDS: readonly FrequencyBand[] = [1, 2, 3, 4, 5];

/** Below this a cluster cannot do its §2.8 job, and reads as an afterthought. */
const MIN_WORDS = 5;

interface SourceTopic {
  id: string;
  label: string;
  hint?: string;
  words: string[];
}

const errors: string[] = [];
const fail = (message: string): void => {
  errors.push(message);
};

const build = async (lang: 'en' | 'ja'): Promise<void> => {
  const path = join(ROOT, 'data', 'topics', `${lang}.yaml`);
  if (!existsSync(path)) return;

  const source = parse(await readFile(path, 'utf8')) as { topics: SourceTopic[] };

  // headword → item id, for every lexeme and chunk the app ships.
  const idByHeadword = new Map<string, string>();
  let inventory = 0;
  for (const band of BANDS) {
    for (const kind of ['lexemes', 'chunks'] as const) {
      const shardPath = join(ROOT, 'assets', 'content', lang, `${kind}.b${band}.json`);
      if (!existsSync(shardPath)) continue;
      const shard = JSON.parse(await readFile(shardPath, 'utf8')) as {
        lexemes?: Array<{ id: string; headword: string }>;
        chunks?: Array<{ id: string; headword: string }>;
      };
      for (const row of shard.lexemes ?? shard.chunks ?? []) {
        idByHeadword.set(row.headword.toLowerCase(), row.id);
        inventory++;
      }
    }
  }

  const topicOf = new Map<string, string>();
  const topics: Array<{ id: string; label: string; hint?: string; items: number }> = [];
  const seen = new Set<string>();

  for (const topic of source.topics ?? []) {
    if (!topic.id?.trim()) fail(`${lang}: a topic with no id`);
    if (!topic.label?.trim()) fail(`${lang}/${topic.id}: no label — §2.14 offers this to a learner`);
    if (seen.has(topic.id)) fail(`${lang}/${topic.id}: listed twice`);
    seen.add(topic.id);

    const missing: string[] = [];
    let members = 0;
    for (const word of topic.words ?? []) {
      const id = idByHeadword.get(String(word).toLowerCase());
      if (id === undefined) {
        missing.push(String(word));
        continue;
      }
      // First topic wins: a word in two topics would make the §2.8 spacing rule
      // ambiguous, and the earlier list is the more specific one by convention.
      if (!topicOf.has(id)) topicOf.set(id, topic.id);
      members++;
    }

    if (missing.length > 0) {
      fail(`${lang}/${topic.id}: not in the shipped inventory — ${missing.join(', ')}`);
    }
    if (members < MIN_WORDS) {
      fail(`${lang}/${topic.id}: only ${members} members; a cluster under ${MIN_WORDS} spaces nothing`);
    }
    topics.push({
      id: topic.id,
      label: topic.label,
      ...(topic.hint?.trim() ? { hint: topic.hint.trim() } : {}),
      items: members,
    });
  }

  if (errors.length > 0) return;

  const body = JSON.stringify({
    sources: ['linguaku-authored'],
    license: 'MIT',
    lang,
    topics,
    // Sorted, so a rerun is byte-identical (invariant 10).
    items: Object.fromEntries([...topicOf.entries()].sort(([a], [b]) => (a < b ? -1 : 1))),
    coverage: {
      tagged: topicOf.size,
      inventory,
      share: Number((topicOf.size / Math.max(1, inventory)).toFixed(4)),
    },
  });
  await writeFile(join(ROOT, 'assets', 'content', lang, 'topics.json'), body);

  const manifestPath = join(ROOT, 'assets', 'content', lang, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
    shards: Array<Record<string, unknown>>;
  };
  const record = {
    kind: 'topics',
    band: 0,
    path: 'topics.json',
    count: topics.length,
    bytes: Buffer.byteLength(body),
    gzipBytes: gzipSync(body, { level: 9 }).length,
    sha256: createHash('sha256').update(body).digest('hex'),
  };
  const at = manifest.shards.findIndex((shard) => shard.kind === 'topics');
  if (at === -1) manifest.shards.push(record);
  else manifest.shards[at] = record;
  manifest.shards.sort((a, b) => String(a.path).localeCompare(String(b.path)));
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  console.log(
    `✓ ${lang}: ${topics.length} topics, ${topicOf.size} of ${inventory} items tagged (${((topicOf.size / inventory) * 100).toFixed(1)}%)`,
  );
};

for (const lang of ['en', 'ja'] as const) await build(lang);

if (errors.length > 0) {
  for (const error of errors) console.error(`✗ ${error}`);
  console.error(`\n${errors.length} problem(s). Nothing written.`);
  process.exit(1);
}
