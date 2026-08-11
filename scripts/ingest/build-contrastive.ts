/**
 * Contrastive-engine content pipeline (SPEC §3, milestone M4).
 *
 *   data/contrastive/en.yaml  →  validate  →  assets/content/en/contrastive.json
 *
 * The YAML is the authored source of truth (SPEC §3: "authored content,
 * versioned, not hardcoded in components"). It is compiled at build time rather
 * than parsed at runtime for two reasons: a YAML parser has no business in a
 * 200 KB bundle, and the validation below is worth failing the *build* over
 * rather than discovering on a learner's phone — an MCQ whose answer is not
 * among its options is unanswerable.
 *
 * Deterministic like every other shard (invariant 10): no timestamps, and the
 * output preserves authoring order rather than depending on object iteration.
 *
 * Usage: npm run ingest:contrastive
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SOURCE = join(ROOT, 'data', 'contrastive', 'en.yaml');
const OUT_DIR = join(ROOT, 'assets', 'content', 'en');

/** SPEC §12 M4 acceptance. */
const MIN_DRILLS = 100;
/** SPEC §3.1 asks for a curated list of at least this many. */
const MIN_FALSE_FRIENDS = 60;

// ------------------------------------------------------------------- shapes

type DrillType = 'mcq' | 'cloze' | 'minimal-pair';
type CategoryKind = 'morphosyntax' | 'phonology' | 'lexis';

interface AuthoredDrill {
  id: string;
  type: DrillType;
  prompt: string;
  options?: string[];
  answer: string;
  explain: string;
  difficulty?: number;
  /** Minimal pairs need to be heard; `say` is what the engine speaks. */
  audio?: boolean;
  say?: string;
}

interface AuthoredCategory {
  id: string;
  kind: CategoryKind;
  label: string;
  summary: string;
  note: {
    l1: string;
    target: string;
    minimalPair: { wrong: string; right: string; gloss: string };
    tip?: string;
  };
  drills: AuthoredDrill[];
}

interface AuthoredFile {
  version: number;
  lang: string;
  l1: string;
  categories: AuthoredCategory[];
  falseFriends: Array<{ en: string; idLookalike: string; enMeans: string; idWordIs: string }>;
}

// --------------------------------------------------------------- validation

const errors: string[] = [];
const fail = (message: string): void => {
  errors.push(message);
};

const source = parse(await readFile(SOURCE, 'utf8')) as AuthoredFile;

const seenCategories = new Set<string>();
const seenDrills = new Set<string>();

for (const category of source.categories) {
  if (seenCategories.has(category.id)) fail(`${category.id}: duplicate category id`);
  seenCategories.add(category.id);

  if (!/^[A-Z][A-Z0-9_]*$/.test(category.id)) {
    fail(`${category.id}: category ids are SCREAMING_SNAKE_CASE`);
  }
  for (const field of ['label', 'summary'] as const) {
    if (!category[field]?.trim()) fail(`${category.id}: missing "${field}"`);
  }

  // SPEC §2.9: what the L1 pattern is, why the target language differs, and one
  // minimal pair. All three, or the note is not a contrastive note.
  const note = category.note;
  if (!note?.l1?.trim()) fail(`${category.id}: note.l1 missing — the L1 pattern is the point`);
  if (!note?.target?.trim()) fail(`${category.id}: note.target missing`);
  if (!note?.minimalPair?.wrong?.trim() || !note?.minimalPair?.right?.trim()) {
    fail(`${category.id}: note.minimalPair needs both a wrong and a right form (SPEC §2.9)`);
  }
  if (note?.minimalPair?.wrong === note?.minimalPair?.right) {
    fail(`${category.id}: the minimal pair's two sides are identical`);
  }

  if (!Array.isArray(category.drills) || category.drills.length === 0) {
    fail(`${category.id}: no drills — an untestable category cannot be estimated (SPEC §3.3)`);
  }

  for (const drill of category.drills ?? []) {
    if (seenDrills.has(drill.id)) fail(`${drill.id}: duplicate drill id`);
    seenDrills.add(drill.id);

    if (!drill.id.startsWith(`${category.id}-`)) {
      fail(`${drill.id}: drill ids are prefixed with their category id`);
    }
    if (!drill.prompt?.trim()) fail(`${drill.id}: missing prompt`);
    if (!drill.answer?.trim()) fail(`${drill.id}: missing answer`);
    // SPEC §2.9 acceptance: 100% of interference-tagged items carry an
    // explanation. Enforced here, per item, rather than measured afterwards.
    if (!drill.explain?.trim()) fail(`${drill.id}: missing explanation (SPEC §2.9)`);

    if (drill.type === 'mcq' || drill.type === 'minimal-pair') {
      const options = drill.options ?? [];
      if (options.length < 2) fail(`${drill.id}: needs at least two options`);
      if (!options.includes(drill.answer)) {
        fail(`${drill.id}: the answer is not among its options — unanswerable`);
      }
      if (new Set(options).size !== options.length) fail(`${drill.id}: duplicate options`);
    } else if (drill.options) {
      fail(`${drill.id}: a cloze drill is typed, so it must not carry options`);
    }

    if (drill.type === 'minimal-pair') {
      if (drill.audio !== true) fail(`${drill.id}: a minimal pair must be marked audio: true`);
      if (!drill.say?.trim()) fail(`${drill.id}: a minimal pair needs "say"`);
      if (drill.say !== undefined && !(drill.options ?? []).includes(drill.say)) {
        fail(`${drill.id}: "say" must be one of the options`);
      }
      if (drill.say !== drill.answer) {
        fail(`${drill.id}: the spoken word is the answer, by definition`);
      }
    } else if (drill.audio) {
      fail(`${drill.id}: only minimal pairs require audio`);
    }
  }
}

const drillCount = source.categories.reduce(
  (total, category) => total + (category.drills?.length ?? 0),
  0,
);
if (drillCount < MIN_DRILLS) {
  fail(`only ${drillCount} drills authored; SPEC §12 M4 wants at least ${MIN_DRILLS}`);
}
if ((source.falseFriends?.length ?? 0) < MIN_FALSE_FRIENDS) {
  fail(
    `only ${source.falseFriends?.length ?? 0} false friends; SPEC §3.1 asks for ${MIN_FALSE_FRIENDS}`,
  );
}

if (errors.length > 0) {
  for (const error of errors) console.error(`✗ ${error}`);
  console.error(`\n${errors.length} problem(s) in ${SOURCE}. Nothing written.`);
  process.exit(1);
}

// ------------------------------------------------------------------- output

await mkdir(OUT_DIR, { recursive: true });

const payload = {
  // The licence gate's hook (SPEC §5.2, decision D9). This content is authored
  // for LinguaKu — no third-party dataset is involved, and the example sentences
  // are written here rather than lifted from the corpus.
  sources: ['linguaku-authored'],
  license: 'project-owned',
  version: source.version,
  lang: source.lang,
  l1: source.l1,
  categories: source.categories.map((category) => ({
    id: category.id,
    kind: category.kind,
    label: category.label,
    summary: category.summary,
    note: {
      l1: category.note.l1,
      target: category.note.target,
      minimalPair: category.note.minimalPair,
      ...(category.note.tip ? { tip: category.note.tip } : {}),
    },
    drills: category.drills.map((drill) => ({
      id: drill.id,
      categoryId: category.id,
      type: drill.type,
      prompt: drill.prompt,
      ...(drill.options ? { options: drill.options } : {}),
      answer: drill.answer,
      explain: drill.explain,
      ...(drill.difficulty !== undefined ? { difficulty: drill.difficulty } : {}),
      ...(drill.audio ? { audio: true as const, say: drill.say } : {}),
    })),
  })),
  falseFriends: source.falseFriends,
};

const body = JSON.stringify(payload);
await writeFile(join(OUT_DIR, 'contrastive.json'), body);

// ------------------------------------------------------------------- report

const byKind = new Map<CategoryKind, number>();
for (const category of source.categories) {
  byKind.set(category.kind, (byKind.get(category.kind) ?? 0) + 1);
}
const audioDrills = source.categories
  .flatMap((category) => category.drills)
  .filter((drill) => drill.audio).length;

console.log(`✓ ${source.categories.length} categories, ${drillCount} drills`);
for (const [kind, count] of [...byKind].sort(([a], [b]) => a.localeCompare(b))) {
  console.log(`    ${kind.padEnd(14)} ${count}`);
}
console.log(`  ${audioDrills} drills require audio (withheld without it — SPEC §2.6)`);
console.log(`  ${source.falseFriends.length} false friends`);
console.log(
  `  contrastive.json  ${(Buffer.byteLength(body) / 1024).toFixed(1)} KB` +
    `  (${(gzipSync(body, { level: 9 }).length / 1024).toFixed(1)} KB gzipped)`,
);
