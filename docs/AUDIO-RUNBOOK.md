# Generating the pre-cached audio (risk R1 / R7)

Everything the app needs in order to survive a dead speech engine is built and
tested except the clips themselves, because a clip cannot exist until a voice
model's licence has been read and dated. This is the procedure for the person
with Piper installed. It is written to be followed top to bottom without
re-deriving anything.

**Nothing here runs in CI**, and nothing here is on the critical path for a
release: with no clips, `npm run check:audio` passes and reports that the
fallback chain terminates in synthesis.

---

## 0. What you are producing, and where it goes

```
assets/content/en/piper-libritts-en/<16-hex>.m4a   ← the clips
assets/content/en/audio.json                       ← the index the app reads
```

**Not `assets/content/audio/`.** `scripts/check-licenses.mjs` walks `assets/`
and refuses any binary whose path contains no dataset key, because a binary
cannot carry provenance inline the way a JSON shard can (D9). The voice key *is*
the provenance. `build-audio.ts` refuses before writing a byte for the same
reason, so an unlicensed clip never touches the disk in the first place.

## 1. Promote the voice — in the same commit as the clips

`piper-libritts-en` sits under `candidates` in `data/licenses.json`. Move it to
`datasets` with the block below.

**Do not promote it early.** Since v1.5.0 the licence gate also fails on the
mirror case — a dataset declared but referenced by no asset — because the in-app
attribution screen renders `datasets` directly, so declaring a source the build
does not use claims a provenance the app does not have. (That check was added
after finding `jmnedict` had been doing exactly that since M6.) Promote and
generate together, or CI stops you.

```json
{
  "key": "piper-libritts-en",
  "name": "LibriTTS (via Piper voice en_US-libritts-high)",
  "url": "https://huggingface.co/rhasspy/piper-voices",
  "use": "Pre-cached audio for English anchor sentences and headwords (SPEC §2.6, risk R1) — the fallback when a device's speech engine is dead.",
  "license": "CC BY 4.0",
  "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
  "attributionRequired": true,
  "shareAlike": false,
  "verifiedOn": "2026-08-13",
  "notes": "The voice's model card gives its training corpus as LibriTTS (openslr.org/60), CC BY 4.0. Multi-speaker: 904 speakers, pinned with --speaker and included in the clip hash so a rerun reproduces (invariant 10). CC BY 4.0 is attribution-only, not share-alike, so clips impose no share-alike on what ships beside them; the sentences they voice remain Tatoeba's CC BY 2.0 FR, and audio.json declares both sources."
}
```

Delete the `piper-libritts-en` entry from `candidates` at the same time.
`assertVoiceCleared` in `build-audio.ts` checks `candidates` **first** and
throws — a key in both lists refuses to generate even though the gate would pass.

## 2. Attribution — CC BY 4.0 requires it

Add a section to `NOTICE.md`. The gate does a literal
`notice.includes(dataset.name)`, so the heading must carry the name **verbatim**:

```markdown
## LibriTTS (via Piper voice en_US-libritts-high)

Synthesized audio for English sentences and headwords.

- Source: <https://huggingface.co/rhasspy/piper-voices>
- Licence: **CC BY 4.0** — <https://creativecommons.org/licenses/by/4.0/>
- Verified: 2026-08-13

Clips are generated offline with Piper from the `en_US-libritts-high` voice,
whose training corpus is LibriTTS (openslr.org/60) under CC BY 4.0. Attribution
is required; share-alike is not, so the clips place no obligation on the shards
beside them.

**The sentences are Tatoeba's.** A synthesized reading of a CC BY sentence is a
derivative of that sentence, so `audio.json` names both sources and the
attribution obligation travels with it.
```

Nothing needs doing to the **in-app attribution screen**: it lazily imports
`data/licenses.json` and renders `datasets`, so the entry appears there the
moment it is promoted, and an e2e test asserts both directions.

## 3. Generate

Requires `piper` and `ffmpeg` on PATH.

```bash
npm run ingest:audio -- --lang en --voice piper-libritts-en --model /path/to/en_US-libritts-high.onnx --speaker 0 --format m4a
```

- `--speaker` is **not optional in practice**: the model carries 904 speakers,
  it is part of the clip hash, and an unpinned run does not reproduce.
- `--format` defaults to `m4a` (AAC). Opus is the better codec and the wrong
  choice here: Safari only gained Ogg Opus playback in 17.5, and iOS is exactly
  the platform where the boot probe reports a dead engine (D29). An insurance
  clip the most common silent device cannot play is not insurance.
- The two `execFile` calls in `synthesize()` are the only lines in this
  repository that have never executed. If your Piper build spells a flag
  differently, that one function is the whole surface to adjust.

## 4. Verify before committing

```bash
npm run check:audio   # budget, and index ↔ disk in both directions
npm run verify        # the full gate
npm run test:e2e      # 43 tests; the attribution one reads the new entry
```

`check:audio` fails on three things worth knowing in advance: total bytes over
6.5 MB, a clip promised by `audio.json` that is not on disk, and a clip on disk
that nothing references — an orphan is bytes every learner downloads for nothing.

Then re-run the ingest once more. It should generate **zero** new clips and
produce a byte-identical `audio.json`; that is invariant 10, and it is the
property the whole cache-busting story rests on.

## 5. What to expect

At ~12 KB per AAC clip against a 6 MB planning budget, roughly **500 clips** —
bands 1 and 2, headwords and dictation-length sentences interleaved by frequency
rank, which is the order a learner meets them in. That is enough to unblock L4
on a silent English device. It is not enough to cover the corpus, and it is not
meant to be.

## Japanese

**There is no Japanese voice to run this with.** Measured against
`rhasspy/piper-voices/voices.json` on 2026-08-13: 173 voices, 54 language codes,
no `ja_JP`. A community model would need its own licence read, and a
JSUT-derived one needs the corpus terms checked specifically — a non-commercial
restriction is incompatible with an MIT-licensed project whose assets are meant
to be redistributable.

Until one clears, Japanese stays on synthesis-or-nothing: L4 and the three
mora-timing drills are withheld on a silent device, and the home screen says so
in Indonesian. That is the designed behaviour (SPEC §2.6), not a regression.
