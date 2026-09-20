/**
 * Pre-cached audio, generated offline (SPEC §2.6, risk R1, risk R4).
 *
 * ```
 * npm run ingest:audio -- --lang en --voice piper-libritts-en \
 *   --model /path/en_US-libritts-high.onnx --speaker 0 --format m4a
 * ```
 *
 * ## Where the output goes, and why not `assets/content/audio/`
 *
 * Clips are written to **`assets/content/<lang>/<voiceKey>/`** and the voice key
 * must name a dataset in `data/licenses.json`. That is not a preference: the
 * licence gate (`scripts/check-licenses.mjs`) walks `assets/` and refuses any
 * binary whose path contains no dataset key, because a binary cannot carry
 * provenance inline the way a JSON shard can (D9). A directory called `audio/`
 * fails that check, and it should — it says nothing about who recorded what
 * under which terms.
 *
 * Requires `piper` and `ffmpeg` on PATH.
 *
 * ## This has never been run
 *
 * Stated plainly, the way `workers/sync/README.md` states the same thing: Piper
 * is not installed in the environment this was written in, and — the part that
 * actually blocks it — **no voice model has been cleared**. English has a
 * candidate (`piper-libritts-en`); **Japanese has no voice at all**, measured
 * against the official index on 2026-08-13: 173 voices, 54 language codes, no
 * `ja_JP`.
 * Invariant 5 is absolute: nothing enters `assets/` without an entry in
 * `data/licenses.json`, and a voice model carries the terms of the corpus it
 * was trained on, which vary per voice. So the generator exists, the gate that
 * polices its output exists and runs in CI, and the clip set is empty until a
 * human reads a licence and dates it.
 *
 * The parts that can be tested without a synthesizer are in `audio.ts` and are
 * tested there. What is untested is the `execFile` call below.
 *
 * ## Why Piper
 *
 * It runs offline at build time, so it adds no runtime dependency and no
 * recurring cost (§0 rule 1). The alternative — a hosted TTS API — is a bill.
 *
 * ## Determinism (invariant 10)
 *
 * Clip filenames are content hashes of `voice + speaker + text`, so a re-run
 * against an unchanged corpus produces the same names and skips every file that
 * already exists. Piper is deterministic for a fixed model and speaker, but that
 * is not relied on: an existing file is never regenerated, so byte-identical
 * output survives a future voice version that is not. The speaker is in the
 * hash because a multi-speaker model without `--speaker` does not reproduce.
 */

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import {
  clipName,
  ESTIMATED_BYTES,
  planClips,
  withinBudget,
  type ClipFormat,
  type ClipRequest,
} from './audio.ts';

const run = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** R4: the whole 8 MB first-download budget, minus what text already spends. */
const BUDGET_BYTES = 6 * 1024 * 1024;

/** Bands a beginner gets offline. Later bands are fetched on demand. */
const BANDS = [1, 2] as const;

interface Args {
  lang: 'en' | 'ja';
  /** Dataset key for the voice model — must exist in data/licenses.json. */
  voice: string;
  /** Path to the Piper .onnx voice model. */
  model: string;
  format: ClipFormat;
  /** Which speaker, for a multi-speaker model. Pinned, never left to default. */
  speaker: number;
}

const parseArgs = (argv: readonly string[]): Args => {
  const get = (name: string): string | undefined => {
    const index = argv.indexOf(`--${name}`);
    return index === -1 ? undefined : argv[index + 1];
  };
  const lang = get('lang');
  const voice = get('voice');
  const model = get('model');
  const format = (get('format') ?? 'm4a') as ClipFormat;
  const speaker = Number(get('speaker') ?? 0);
  if ((lang !== 'en' && lang !== 'ja') || !voice || !model) {
    throw new Error(
      'usage: ingest:audio -- --lang <en|ja> --voice <key> --model <path.onnx> [--format m4a|opus|mp3] [--speaker N]',
    );
  }
  if (!['m4a', 'opus', 'mp3'].includes(format)) throw new Error(`unknown --format ${format}`);
  if (!Number.isInteger(speaker) || speaker < 0) throw new Error('--speaker must be a whole number');
  return { lang, voice, model, format, speaker };
};

/**
 * The licence gate, enforced before anything is written rather than after.
 *
 * `check-licenses.mjs` would catch an undeclared voice at build time anyway;
 * refusing here means an unlicensed clip never touches the disk in the first
 * place, which is the difference between a failing build and a repository that
 * has to be scrubbed.
 */
const assertVoiceCleared = async (voiceKey: string): Promise<void> => {
  const manifest = JSON.parse(
    await readFile(join(ROOT, 'data', 'licenses.json'), 'utf8'),
  ) as { datasets: Array<{ key: string }>; candidates?: Array<{ key: string }> };

  if (manifest.candidates?.some((candidate) => candidate.key === voiceKey)) {
    throw new Error(
      `${voiceKey} is a candidate, not a cleared dataset. Read its licence, date it, and promote it first (SPEC §5.2).`,
    );
  }
  if (!manifest.datasets.some((dataset) => dataset.key === voiceKey)) {
    throw new Error(`${voiceKey} is not in data/licenses.json. Invariant 5 refuses it.`);
  }
};

interface Shard {
  sentences?: Array<{ id: string; text: string; maxRank: number }>;
  lexemes?: Array<{ id: string; headword: string; freqRank: number }>;
}

const readShard = async (lang: string, name: string): Promise<Shard> => {
  const path = join(ROOT, 'assets', 'content', lang, name);
  return existsSync(path) ? (JSON.parse(await readFile(path, 'utf8')) as Shard) : {};
};

/**
 * One clip. The only part of this file that has never executed.
 *
 * Piper writes WAV; ffmpeg produces the file we ship. Both are offline tools,
 * both run once per clip, and neither reaches the browser. ffmpeg rather than
 * `opusenc` because it can emit all three formats and is the one encoder likely
 * to already be installed.
 */
const CODEC: Record<ClipFormat, string[]> = {
  m4a: ['-c:a', 'aac', '-b:a', '32k'],
  opus: ['-c:a', 'libopus', '-b:a', '24k'],
  mp3: ['-c:a', 'libmp3lame', '-b:a', '48k'],
};

const synthesize = async (request: ClipRequest, args: Args, outPath: string): Promise<void> => {
  const wav = `${outPath}.wav`;
  await run(
    'piper',
    ['--model', args.model, '--speaker', String(args.speaker), '--output_file', wav],
    { input: request.text } as never,
  );
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', wav, '-ac', '1', ...CODEC[args.format], outPath]);
  await rm(wav, { force: true });
};

const main = async (): Promise<void> => {
  const args = parseArgs(process.argv.slice(2));
  await assertVoiceCleared(args.voice);

  const outDir = join(ROOT, 'assets', 'content', args.lang, args.voice);
  await mkdir(outDir, { recursive: true });

  const clips: Record<string, string> = {};
  let generated = 0;
  let bytes = 0;

  for (const band of BANDS) {
    const [anchors, lexemes] = await Promise.all([
      readShard(args.lang, `anchors.b${band}.json`),
      readShard(args.lang, `lexemes.b${band}.json`),
    ]);

    const plan = withinBudget(
      planClips(args.lang, lexemes.lexemes ?? [], anchors.sentences ?? []),
      BUDGET_BYTES - bytes,
      ESTIMATED_BYTES[args.format],
    );

    for (const request of plan) {
      const name = clipName(args.voice, request.text, args.format, args.speaker);
      const outPath = join(outDir, name);
      if (!existsSync(outPath)) {
        await synthesize(request, args, outPath);
        generated++;
      }
      clips[request.key] = `/content/${args.lang}/${args.voice}/${name}`;
      bytes += (await stat(outPath)).size;
    }
  }

  // The index the app reads (src/platform/audio.ts). `sources` names both the
  // voice *and* Tatoeba: a synthesized reading of a CC BY sentence is a
  // derivative of that sentence, so the attribution obligation travels with it.
  const index = JSON.stringify({
    sources: [args.voice, 'tatoeba'],
    voice: args.voice,
    format: args.format,
    speaker: args.speaker,
    count: Object.keys(clips).length,
    bytes,
    clips: Object.fromEntries(Object.entries(clips).sort(([a], [b]) => (a < b ? -1 : 1))),
  });
  await writeFile(join(ROOT, 'assets', 'content', args.lang, 'audio.json'), index);

  console.log(
    `✓ ${Object.keys(clips).length} clips indexed (${generated} newly generated, ${(bytes / 1024 / 1024).toFixed(2)} MB)`,
  );
};

await main();
