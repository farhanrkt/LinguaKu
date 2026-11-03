/**
 * Applies `GLOSS_REVIEW` to the committed gloss shards.
 *
 * `build-glosses.ts` applies it too, but a re-run needs the Wikimedia dumps in
 * `.cache/`. This rewrites only the glosses the review settles, in the
 * pipeline's serialization, and updates their manifest records. Idempotent.
 *
 *   node scripts/ingest/fix-glosses.ts
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { GLOSS_REVIEW } from './glossReview.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets', 'content');

let changed = 0;
for (const lang of ['en', 'ja'] as const) {
  const manifestPath = join(ROOT, lang, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
    shards: Array<{ kind: string; path: string; bytes: number; gzipBytes: number; sha256: string }>;
  };
  let touchedManifest = false;
  for (const record of manifest.shards.filter((shard) => shard.kind === 'glosses')) {
    const path = join(ROOT, lang, record.path);
    const shard = JSON.parse(await readFile(path, 'utf8')) as { glosses: Record<string, string[]> };
    let touched = false;
    for (const [id, senses] of Object.entries(GLOSS_REVIEW)) {
      const current = shard.glosses[id];
      if (current === undefined || JSON.stringify(current) === JSON.stringify(senses)) continue;
      shard.glosses[id] = [...senses];
      touched = true;
      changed++;
    }
    if (!touched) continue;
    const body = JSON.stringify(shard);
    await writeFile(path, body);
    record.bytes = Buffer.byteLength(body);
    record.gzipBytes = gzipSync(body, { level: 9 }).length;
    record.sha256 = createHash('sha256').update(body).digest('hex');
    touchedManifest = true;
  }
  if (touchedManifest) await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
}
console.log(`✓ ${changed} gloss(es) replaced`);
