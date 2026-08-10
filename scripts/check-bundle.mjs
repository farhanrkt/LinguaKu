/**
 * Bundle budget gate (SPEC §5.4).
 *
 * "Initial JS" is the entry chunk plus everything it statically imports —
 * i.e. what a learner on mobile data must download before the first paint.
 * Lazily-imported chunks (content shards, the Japanese layer) are reported
 * but not counted, which is exactly the pressure we want on the codebase.
 *
 * Usage: node scripts/check-bundle.mjs   (after `npm run build`)
 */
import { gzipSync } from 'node:zlib';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const MANIFEST = join(DIST, '.vite', 'manifest.json');

const BUDGET_JS_GZIP = 200 * 1024;
const BUDGET_CSS_GZIP = 40 * 1024;

if (!existsSync(MANIFEST)) {
  console.error(`✗ ${MANIFEST} not found — run \`npm run build\` first.`);
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const gzipBytes = (file) => gzipSync(readFileSync(join(DIST, file)), { level: 9 }).length;

const entries = Object.values(manifest).filter((chunk) => chunk.isEntry);
if (entries.length === 0) {
  console.error('✗ No entry chunk in the build manifest.');
  process.exit(1);
}

/** Entry chunk + transitive static imports = the critical path. */
const criticalJs = new Set();
const criticalCss = new Set();
const visit = (key) => {
  const chunk = manifest[key];
  if (!chunk || criticalJs.has(chunk.file)) return;
  criticalJs.add(chunk.file);
  for (const css of chunk.css ?? []) criticalCss.add(css);
  for (const imported of chunk.imports ?? []) visit(imported);
};
for (const entry of entries) {
  visit(Object.keys(manifest).find((key) => manifest[key] === entry));
}

const lazyJs = Object.values(manifest)
  .map((chunk) => chunk.file)
  .filter((file) => file?.endsWith('.js') && !criticalJs.has(file));

const sum = (files) => [...files].reduce((total, file) => total + gzipBytes(file), 0);
const jsBytes = sum(criticalJs);
const cssBytes = sum(criticalCss);
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

console.log('Critical path (gzipped):');
for (const file of [...criticalJs, ...criticalCss].sort()) {
  console.log(`  ${kb(gzipBytes(file)).padStart(9)}  ${file}`);
}
if (lazyJs.length > 0) {
  console.log(`Lazy chunks (not counted): ${lazyJs.length}, ${kb(sum(lazyJs))}`);
}

const results = [
  ['initial JS', jsBytes, BUDGET_JS_GZIP],
  ['initial CSS', cssBytes, BUDGET_CSS_GZIP],
];

let failed = false;
for (const [label, actual, budget] of results) {
  const ok = actual <= budget;
  failed ||= !ok;
  const pct = ((actual / budget) * 100).toFixed(0);
  console.log(`${ok ? '✓' : '✗'} ${label}: ${kb(actual)} / ${kb(budget)} (${pct}%)`);
}

process.exit(failed ? 1 : 0);
