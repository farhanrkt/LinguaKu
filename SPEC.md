# LinguaKu — Master Build Prompt

> The contract for this project. Authored by the project owner; reproduced here
> verbatim so that any session can self-orient. Amendments are recorded in
> `docs/DECISIONS.md`, not by editing this file.

---

## 0. Role and operating contract

You are the lead engineer and learning-science architect for **LinguaKu**, an offline-first PWA that teaches **English** and **Japanese** to **Indonesian (L1) speakers**.

Operating rules for this project:

1. **Zero recurring cost is a hard constraint, not a preference.** Every dependency, dataset, and hosted service must be free at the tier we use, or the feature does not ship. If you cannot find a free path, stop and tell me — do not silently add a paid dependency.
2. **Every learner-facing mechanic must trace to a named finding in §2.** When you implement a feature, add a code comment `// SCIENCE: <mechanism> — see SPEC §2.x` explaining which effect it operationalizes. If you invent a mechanic with no basis, flag it as `// UNVALIDATED:` and tell me.
3. **Work in milestones (§12).** At the end of each milestone: run tests, run the bundle-size check, run the license check, then write `docs/PROGRESS.md` with what shipped, what you deviated on and why, and the next decision I need to make.
4. **Ask before assuming** on the open questions in §14. Do not paper over ambiguity.
5. **TypeScript strict, no `any`, no dead scaffolding.** Prefer deleting code over commenting it out.
6. Write `CLAUDE.md` at repo root in Milestone 0 summarizing architecture, commands, and invariants so future sessions self-orient.

---

## 1. Product thesis

**The problem with existing apps for this audience:** they are (a) built for English-L1 learners and ignore what is specifically hard for Indonesian speakers, (b) optimized for engagement metrics rather than retention curves, (c) gated behind paywalls or accounts, and (d) full of recognition-only multiple choice, which inflates a feeling of progress without building recall.

**LinguaKu's thesis:** a learner in Bogor should be able to tap an icon on a cheap Android phone, be answering a *useful* question within three seconds, offline, with no account — and the item they see should be chosen because a memory model predicts they are about to forget it, or because it targets a mistake that Indonesian speakers specifically make.

**Non-goals (say no to these):**

- Not a chatbot tutor. LLM features are optional garnish, never the core loop.
- Not a course/curriculum player with fixed lesson order.
- Not gamified with loss-aversion mechanics (streak shame, lives, gems, leaderboards).
- Not a social network.

---

## 2. Learning-science requirements

Each subsection is a **requirement**, with the mechanism it implements and the acceptance test.

### 2.1 Spaced retrieval with a modern memory model

Use **FSRS** (Free Spaced Repetition Scheduler) via the `ts-fsrs` package — a pure TypeScript implementation supporting ESM/CJS/UMD, with `createEmptyCard()`, `scheduler.repeat()` for previewing all four rating outcomes and `scheduler.next()` when the rating is known. Store the full review log per answer so that parameters can later be optimized per-user with `@open-spaced-repetition/binding`.

- Default `request_retention` = 0.90, `enable_fuzz` = true, short-term steps enabled.
- Every review writes a `ReviewLog` row — this is the substrate for personalization and for the honest analytics in §9. Never discard logs.
- **Accept:** unit tests prove that scheduling is deterministic given (card state, rating, timestamp), that the review log round-trips, and that a simulated 90-day learner history produces a measured retention rate within ±3 points of the target.

### 2.2 Retrieval practice, not review

The learner must **produce or select an answer before seeing it**. There is no "browse the list" mode as a study activity (a passive glossary is fine, but it does not create or advance cards).

- **Accept:** no code path advances a card's FSRS state without a recorded learner response.

### 2.3 Desirable difficulty via a card-type ladder

A single lexeme is not one card. It is a **ladder**, and items graduate upward as stability grows:

| Level | Task | Modality |
|---|---|---|
| L0 | First exposure: sentence + audio + gloss, learner just confirms | recognition, errorless |
| L1 | Multiple choice ID → target (4 distractors from same frequency band) | recognition |
| L2 | Target → meaning, typed or spoken | recall |
| L3 | Cloze inside a known sentence | contextual recall |
| L4 | **Audio-only** cloze / dictation of the sentence | phonological form |
| L5 | ID → target, produced (typed, with IME/romaji or kana keyboard) | production |
| L6 | Open prompt: use the word in a sentence about your own life | free production |

Promotion rule: advance when FSRS stability at the current level exceeds a threshold *and* last-3 accuracy ≥ 2/3. Demote on lapse. Distractors must be plausible (same POS, same frequency band, or a known confusable from §3).

- **Accept:** a learner who only ever sees L1 cards for an item cannot reach "mastered" status in the UI.

### 2.4 Comprehensible input at i+1, quantified

Reading and listening material is selected by **known-token coverage**, following the finding that ~95–98% lexical coverage is needed for unassisted comprehension.

- Compute `coverage = known_tokens / total_tokens` using the learner's current known-set (FSRS retrievability > 0.6 counts as known).
- Target band for a graded item: **coverage ∈ [0.92, 0.98]** — high enough to comprehend, low enough to contain something new.
- Japanese tokenization must be morphological (see §6 for the free option), not naive character splitting.
- **Accept:** the content selector, given a synthetic learner profile, returns items whose coverage falls in band ≥90% of the time, and never returns an item with coverage < 0.85.

### 2.5 Everything lives in a sentence

No naked word-pair flashcards. Every lexical item is anchored to at least one example sentence with an Indonesian translation and audio. Collocations and formulaic chunks (e.g. *"take a shower"*, 「お世話になります」) are first-class items, not derived from single words.

- **Accept:** the ingestion pipeline rejects any lexeme with zero linked example sentences.

### 2.6 Dual coding and audio-first

Every item ships with pronounceable audio. Listening is not an optional skill tab — audio-only cards (L4) are mandatory in the ladder.

- **Accept:** an item with no available audio (neither cached clip nor working TTS voice) is excluded from L4 scheduling rather than silently degraded to text.

### 2.7 Generation and output

At least one production task per session (L5/L6, typed or spoken). Speech uses the browser's free speech recognition where available; text answers are graded with tolerant matching (normalize case, punctuation, optional kana/romaji equivalence, Levenshtein tolerance scaled to item length) and *near-misses are shown as near-misses*, not marked wrong outright.

- **Accept:** grader unit tests cover romaji↔kana equivalence, typos within tolerance, and English contractions.

### 2.8 Interleaving and mixed practice

The session composer must interleave skills and card types. Never more than **2 consecutive items of the same card type** and never more than 3 from the same topic cluster.

- **Accept:** a property test over 1,000 generated sessions finds no violation.

### 2.9 Elaborative, contrastive feedback

Wrong answers get an explanation, not just the correct answer. Where the error matches a known Indonesian-L1 interference pattern (§3), show the contrastive note in **Indonesian**: what the L1 pattern is, why the target language differs, and one minimal pair.

- **Accept:** ≥80% of grammar items and ≥100% of items tagged with an interference category have an authored contrastive note.

### 2.10 Frequency-ordered curriculum

New-item introduction order is driven by corpus frequency banded into tiers (1–500, 501–1000, 1001–2000, 2001–4000, 4001–8000, 8001+), modulated by learner-selected topic goals. Rationale: the top ~2,000 word families cover the large majority of everyday text, so early effort should buy maximal coverage.

- **Accept:** the "known words" dashboard can render a coverage-vs-frequency-band curve from real learner state.

### 2.11 Mnemonics and decomposition for kanji

Kanji items are taught by **radical decomposition + an Indonesian-language mnemonic**, plus a component graph so the learner sees 校 as 木 + 交. Learners can edit the mnemonic (self-generated mnemonics are stronger than given ones) — store the edit locally.

- **Accept:** every kanji item renders its component breakdown; user-authored mnemonics persist and survive sync.

### 2.12 Metacognitive calibration

Before revealing the answer on recall cards, ask a one-tap confidence signal (Yakin / Ragu). Chart calibration (confidence vs. actual accuracy) in progress. This trains judgment-of-learning accuracy and gives us a second signal for leech detection.

- **Accept:** calibration chart renders from real logs; confidence never overrides the FSRS rating.

### 2.13 Microlearning and habit architecture

Default session = **4 minutes** ("Latihan 4 menit"), with 8-minute and 15-minute options. Onboarding asks for an implementation intention ("Setiap hari setelah ___, saya latihan di ___") and schedules a local notification for that cue. Sessions are interruption-safe: state persists after every single answer.

- **Accept:** killing the app mid-session and reopening resumes at the exact next item with no lost review logs.

### 2.14 Motivation via competence, not coercion (SDT)

- **Autonomy:** learner picks topic clusters and daily load; can always skip an item ("belum perlu").
- **Competence:** progress is expressed in *capability* terms ("kamu sekarang paham ~86% kata di percakapan sehari-hari"), not points.
- **No dark patterns:** no lives, no gem economy, no streak that can be "broken" — use a rolling 7-day consistency band that heals itself, and never send guilt-framed copy.
- **Accept:** a written `docs/ETHICS.md` lists the banned mechanics; PR checklist references it.

### 2.15 Explicitly banned mechanics

Recognition-only progression; translation-only cards with no context; timed pressure as the default; "XP" divorced from measured ability; auto-advancing lessons that ignore memory state; fake-precision claims ("you are B1!") without an uncertainty band.

---

## 3. The Indonesian-L1 contrastive engine (the differentiator)

Build a data-driven **interference model**: a taxonomy of error categories, each with (a) an Indonesian-language explanation, (b) generated drill items, (c) a per-learner mastery estimate, (d) a heatmap in progress. Store as `data/contrastive/{en,ja}.yaml` — authored content, versioned, not hardcoded in components.

### 3.1 English for Indonesian speakers — high-yield categories

**Morphosyntax (Indonesian has no inflection; these are systematic, not careless):**

- `TENSE_ASPECT` — Indonesian marks time lexically (*sudah / sedang / akan / kemarin*), so past `-ed` is dropped: *"Yesterday I go to Jakarta."*
- `AGREEMENT_3SG` — third-person `-s` omission: *"She go to school."*
- `COPULA_BE` — omission, because *"Dia cantik"* has no copula: *"She beautiful."*
- `ARTICLES` — a/an/the have no Indonesian equivalent; both omission and over-insertion.
- `PLURAL_S` — Indonesian pluralizes by reduplication or quantifier: *"I have two book."*
- `PRONOUN_GENDER` — **highest-frequency error**: *dia* is genderless, so he/she are swapped constantly.
- `NP_WORD_ORDER` — Indonesian is head-initial (*mobil merah* = car red): *"a car red."*
- `PREPOSITIONS` — di/ke/dari → in/at/on/to mapping is many-to-many.
- `PASSIVE_OVERUSE` — Indonesian uses passive far more readily; produces stilted English.
- `MODAL_BISA` — *bisa* → can/could/be able to collapse.

**Phonology (drive minimal-pair listening drills and pronunciation scoring):**

- Missing phonemes: /θ/ /ð/ /v/ /z/ /ʃ/ /ʒ/ — *think→tink*, *very→fery*, *zoo→sue*.
- Vowel length/tenseness: /ɪ/ vs /iː/ (*ship/sheep*), /æ/ vs /e/ (*bad/bed*), /ʊ/ vs /uː/.
- Final consonant devoicing and cluster reduction: *bag→back*, *asked→ask*.
- Word stress: Indonesian is closer to syllable-timed, English is stress-timed with schwa reduction — teach stress placement explicitly as a listening skill.

**False friends:** *actual/aktual*, *eventually/eventual*, *sensible/sensibel*, *fabric/pabrik*, *sympathetic/simpatik*, *pension/pensiun*, *ambition/ambisi* register mismatch. Ship a curated list of ≥60.

### 3.2 Japanese for Indonesian speakers — and where they have an advantage

**Positive transfer — surface these explicitly as "ini mirip bahasa Indonesia" notes. Naming the parallel is elaborative encoding, and it is a real morale advantage this audience is never told about:**

- **Vowel system:** Japanese /a i u e o/ maps cleanly onto Indonesian vowels; Indonesian speakers have a far easier start than English speakers.
- **Mostly open syllables (CV)** — matches Indonesian phonotactics; no tone.
- **Classifiers/counters:** Indonesian already has *ekor, buah, orang, batang, lembar* — 匹/個/人/本/枚 is a familiar concept, not an alien one. Teach as a mapping table.
- **No plural marking, no articles, no gender** — all three match Indonesian.
- **Politeness registers:** plain vs 丁寧 vs 敬語 maps onto *kamu/kau* vs *Anda* vs *bahasa halus*; Javanese/Sundanese speakers with *ngoko/krama* intuition have a genuine head start. Say so.
- **Topic prominence:** Indonesian fronts topics (*Buku itu, saya sudah baca*) — a real bridge into は.

**Genuine difficulties:**

- `PARTICLES` — は/が/を/に/で/へ/と/から/まで; no Indonesian analogue. Sub-category `WA_GA` for topic vs subject, taught via the topic-fronting bridge above.
- `WORD_ORDER_SOV` — verb-final, plus modifier-before-noun (opposite of Indonesian's head-initial NPs).
- `VERB_CONJUGATION` — godan/ichidan, て-form, plain vs polite; Indonesian verbs don't inflect for tense at all.
- `ADJ_CONJUGATION` — い-adjectives inflect (かった/くない); no analogue.
- `MORA_TIMING` — long vowels, っ, ん carry meaning: おばさん/おばあさん, きて/きって. Indonesian has no length distinction → dedicated minimal-pair listening drills.
- `SCRIPT` — hiragana → katakana → kanji, with katakana loanwords being deceptively hard.
- `PITCH_ACCENT` — optional advanced layer (はし/はし); ship behind a toggle, off by default.
- `KEIGO` — 尊敬語/謙譲語 as an N3+ layer.
- `GIVING_RECEIVING` — あげる/くれる/もらう direction-of-benefit; conceptually alien.

### 3.3 How the engine works

1. Each drill item and each error is tagged with zero or more category IDs.
2. Wrong answers increment an **Elo-style ability estimate per category** (not just per item).
3. The session composer injects targeted drills when a category's estimate is below threshold, and generates minimal-pair items automatically where the data supports it.
4. Progress shows the heatmap: *"Kelemahan terbesarmu: he/she dan past tense."*

---

## 4. Proficiency model and placement

### 4.1 Frames

- **English:** CEFR A1–C2, presented **with an uncertainty band**, e.g. "A2 → B1 (perkiraan)". Back it with vocabulary-size estimate + grammar-category mastery, not vibes.
- **Japanese:** JLPT N5–N1 (community/open wordlists), plus separate kanji-known count and kana fluency. KANJIDIC2 carries grade/frequency/JLPT-ish metadata usable for banding.

### 4.2 Placement (must feel like learning, not like an exam)

- **≤ 90 seconds, ≤ 25 items**, adaptive. Use a 1PL/Elo item-selection loop over frequency-banded items; stop when the standard error of the ability estimate drops below threshold or the item cap is hit.
- Include a **Yes/No vocabulary-size check** with generated pseudowords to catch overclaiming, correcting the raw score for false alarms.
- Estimate **three separate abilities**: receptive vocabulary, listening, grammar. Do not collapse into one number.
- **Placement is skippable.** If skipped, cold-start at frequency band 1 and let the first ~50 responses do the estimating implicitly.
- Re-estimate continuously; never make the learner retake anything.

### 4.3 Level-awareness in every subsystem

Level gates: which frequency bands introduce new items, which sentences are eligible as context, which card-ladder levels are unlocked, which grammar points are teachable, whether furigana is shown (auto-fade furigana as kanji stability rises), and script mode for Japanese (romaji → kana → kanji, with romaji actively deprecated after kana fluency).

---

## 5. Zero-cost architecture

### 5.1 Stack

- **Frontend:** React + TypeScript + Vite, installable PWA with a service worker. Tailwind. No heavy UI kit.
- **State/storage:** IndexedDB via Dexie. **Local-first is the source of truth.**
- **Scheduler:** `ts-fsrs` (MIT-licensed, browser-safe).
- **Audio out:** Web Speech API `speechSynthesis` (`ja-JP`, `en-US`/`en-GB`) — free, on-device, no quota. Fall back to pre-cached CC-licensed clips. Detect voice availability at runtime and degrade gracefully (this is the single most fragile assumption in the app — write a capability-probe module and a manual test matrix across Chrome Android, Firefox, Safari iOS).
- **Speech in:** `SpeechRecognition` / `webkitSpeechRecognition` where available (Chrome/Android). Score by transcript similarity to target. Where unavailable, offer record-and-self-compare with a waveform, and never block progression on it.
- **Japanese morphology:** a WASM/JS tokenizer with a bundled dictionary, loaded lazily and cached (evaluate size carefully — if the dictionary exceeds budget, precompute tokenization at **build time** for all shipped sentences and skip runtime tokenization entirely; user-pasted text then falls back to a lighter heuristic). Prefer the build-time route.
- **Hosting:** Cloudflare Pages or GitHub Pages, static. CI on GitHub Actions.
- **Optional sync (Phase 2):** Cloudflare Workers + D1. The Workers free plan allows on the order of 100k requests/day with a 10ms CPU budget per request, and D1's free tier is generous for this shape of data — but **verify current limits at build time** and design sync as a batched delta log (one write per finished session, not per card) so we sit far under any cap. **The app must be 100% functional with sync disabled.**
- **Optional AI:** bring-your-own-key only (user pastes a key for a free-tier provider), used for example-sentence generation and free-production feedback. Feature-flagged off. Core loop never calls it.

### 5.2 Content sources (all free — record every license in `NOTICE.md` and render an in-app attribution screen)

| Source | Use | License note |
|---|---|---|
| **Tatoeba** | example sentences + JA/EN/ID alignments; some audio | Textual sentences are CC-BY 2.0 FR — **attribution is required**; a subset is CC0. Audio licenses vary per contributor and must be checked per file. |
| **JMdict / JMnedict / KANJIDIC2** (EDRDG) | Japanese lexicon, readings, kanji data | EDRDG license — attribution required, share-alike terms apply to the data. Verify current text before shipping. |
| **Wiktionary / Kaikki extracts** | ID glosses, definitions | CC BY-SA — attribution + share-alike. |
| **Open frequency lists** (OpenSubtitles/OPUS-derived, `wordfreq`-style datasets) | frequency banding for EN and JA | check each list's license individually. |
| **Simple English Wikipedia** | graded reading passages | CC BY-SA. |
| **LibriVox / Wikimedia Commons audio** | listening material | public domain / CC. |
| **Open JLPT & CEFR-aligned wordlists** | level banding | verify per list; prefer permissive. |

**Hard rule:** the build fails if any dataset lands in `assets/` without an entry in `data/licenses.json`. Write that check as a CI step in Milestone 1.

### 5.3 Content pipeline

`scripts/ingest/*` (Node, run offline, committed outputs) → normalize → dedupe → **score difficulty** (max token frequency rank, sentence length, syntactic depth, kanji grade) → **band by level** → tokenize Japanese at build time → shard into level-scoped JSON/SQLite chunks → emit content hashes for cache-busting.

Sharding target: initial download for a beginner ≤ **8 MB**; each additional band lazy-loaded and cached by the service worker.

### 5.4 Performance budget (Indonesian mid-range Android on mobile data is the reference device)

- Initial JS ≤ 200 KB gzipped; Lighthouse PWA ≥ 90; TTI ≤ 3s on simulated 3G / 4× CPU throttle.
- **From app icon tap to first answerable question: ≤ 3 seconds** on a warm cache. Enforce with an automated timing test in CI.
- Fully functional offline after first load, including audio for cached bands.

---

## 6. Data model (Dexie / IndexedDB — mirror in D1 if sync ships)

```ts
Profile        { id, uiLang: 'id', targets: ['en'|'ja'][], dailyMinutes, scriptMode, createdAt }
Ability        { profileId, lang, dimension: 'vocab'|'listening'|'grammar'|'production',
                 theta, standardError, updatedAt }
Item           { id, lang, kind: 'lexeme'|'sentence'|'kanji'|'grammar'|'chunk',
                 headword, reading, glossId, freqRank, band, levelTag, componentsOf?,
                 interferenceTags: string[], sourceRef }
Sentence       { id, lang, text, tokens, translationId, audioRef?, difficulty, coverageMeta, sourceRef }
Card           { id, itemId, ladderLevel: 0..6, fsrs: {due, stability, difficulty, state, reps, lapses,
                 last_review, learning_steps}, suspended }
ReviewLog      { id, cardId, rating, confidence, latencyMs, answerRaw, correct,
                 interferenceHit?: string[], reviewedAt, scheduledDays, elapsedDays, stateBefore }
CategoryScore  { profileId, lang, categoryId, elo, attempts, updatedAt }
Session        { id, startedAt, endedAt, plannedMinutes, itemIds, completed, resumeCursor }
Mnemonic       { itemId, text, authoredByUser }
Habit          { cue, place, notificationTime, enabled }
```

**Invariants:** `ReviewLog` is append-only. All writes are idempotent and keyed so sync is last-write-wins per card with the log as tiebreaker. Every schema change ships with a Dexie migration and a round-trip test.

---

## 7. Core algorithms to implement (each in `src/core/`, pure, unit-tested, no React imports)

1. **`scheduler.ts`** — thin `ts-fsrs` wrapper; preview/apply, per-user parameter slot, retrievability query.
2. **`sessionComposer.ts`** — given `(profile, now, budgetMinutes)` return an ordered item list:
   - Reserve ~60% budget for due reviews, prioritizing cards nearest the retention threshold (most at risk), then leeches (lapses ≥ 6 → demote a ladder level, re-teach with a fresh sentence, never just repeat).
   - ~20% new items, with a daily new-item cap that **adapts to review debt** (if forecast load next week > 1.5× daily budget, throttle new items automatically — this is the #1 cause of abandonment in SRS apps).
   - ~15% one input activity (graded sentence/passage/audio at i+1 per §2.4).
   - ~5% one contrastive drill from the weakest category (§3.3).
   - Enforce the interleaving constraints of §2.8. Deterministic under a seeded RNG for testability.
3. **`coverage.ts`** — known-set computation and text coverage scoring.
4. **`placement.ts`** — adaptive item selection, ability update, stopping rule, pseudoword false-alarm correction.
5. **`grader.ts`** — tolerant answer matching (normalization, romaji↔kana, Levenshtein tolerance, near-miss classification, interference-tag detection on wrong answers).
6. **`difficulty.ts`** — content difficulty scoring and banding.
7. **`elo.ts`** — per-category ability updates.
8. **`forecast.ts`** — upcoming review load projection for the workload dashboard and the new-item throttle.

---

## 8. Exercise catalog (implement in this order)

Recognition MCQ · meaning recall · sentence cloze · **dictation (audio → text)** · listening MCQ · minimal-pair discrimination (phonology, §3) · production (ID → target) · shadowing (play → record → compare) · tap-to-gloss graded reader with **one-tap card creation** (frictionless sentence mining) · kanji component build · particle-selection drill (JA) · error-correction drill ("perbaiki kalimat ini") · free production with a rubric prompt.

The graded reader is the retention engine — make tap-to-gloss and one-tap mining feel instant.

---

## 9. Progress and analytics (honest, capability-framed, all local)

- **Vocabulary size estimate with a confidence interval**, plus a coverage-vs-frequency-band curve.
- Capability sentence in Indonesian: *"Kamu mengenali ~2.400 kata — cukup untuk memahami sekitar 86% kata dalam percakapan sehari-hari."*
- **Level estimate with an uncertainty band** (never a bare "You are B1!").
- **True retention rate vs. target** (from real logs) — if actual retention is far off 90%, say so and offer to retune.
- **Workload forecast** — reviews due over the next 14 days.
- **Skill radar:** reading / listening / vocab / grammar / production.
- **Interference heatmap** (§3.3) — the most actionable screen in the app.
- **Calibration chart** (§2.12).
- Weekly recap; consistency band, not a punishable streak.
- **Export everything as JSON.** The learner owns their data. No account required to export.

---

## 10. UX requirements

- **Indonesian-first UI copy** (warm, plain, non-corporate; no exam-anxiety framing). Language toggle exists but `id` is default.
- **No signup.** Anonymous local profile created on first launch. Account is an optional later upgrade purely for sync.
- **No onboarding wall.** First screen: pick a language, tap start. Placement is offered, not enforced.
- Thumb-zone layout, large tap targets, one-handed operation.
- Japanese input without an IME headache: on-screen kana keyboard + romaji input with live conversion.
- Furigana auto-fades per-kanji as stability rises.
- Dark mode; respects reduced-motion; WCAG AA contrast; full keyboard operation on desktop.
- Session end screen shows *what got stronger*, not points.
- PWA shortcuts: "Latihan 4 menit" jumps straight into a session.

---

## 11. Repository layout

```
/src
  /core        pure logic (§7) — no React, 100% unit tested
  /data        Dexie schema, migrations, repositories
  /features    session, reader, placement, progress, settings
  /ui          primitives
  /platform    speech, storage, notifications, capability probes
/scripts/ingest  offline content pipeline (§5.3)
/assets/content  generated, sharded, hashed
/data/contrastive  authored YAML (§3)
/docs        PROGRESS.md, ETHICS.md, DECISIONS.md, SCIENCE.md
CLAUDE.md    architecture + commands + invariants
NOTICE.md    attributions (Tatoeba, EDRDG, Wiktionary, …)
```

---

## 12. Milestones (stop and report after each)

**M0 — Foundations.** Vite+TS+PWA skeleton, Dexie schema, `CLAUDE.md`, CI (typecheck, test, bundle budget, license check), `docs/SCIENCE.md` mapping every §2 requirement to its planned implementation.
*Accept:* `npm run verify` green; app installs as a PWA and loads offline.

**M1 — Content pipeline, English only.** Ingest sentences + frequency lists + ID glosses; difficulty scoring; banding; sharding; `NOTICE.md` and the license CI gate.
*Accept:* ≥5,000 banded EN sentences with ID translations; license check passes; beginner shard ≤ 8 MB.

**M2 — The loop.** FSRS scheduler, card ladder L0–L3, session composer, TTS probe, session UI, resume-safety.
*Accept:* a 4-minute session runs end-to-end offline; kill-and-resume loses nothing; §2.1 and §2.8 tests pass; icon-tap-to-first-question ≤ 3s.

**M3 — Level awareness.** Adaptive placement, ability estimation, i+1 content selector, new-item throttle driven by forecast.
*Accept:* §2.4 and §4.2 acceptance tests pass; simulated learners of three different levels receive appropriately different content.

**M4 — Contrastive engine (EN).** Authored `en.yaml` covering all §3.1 categories, interference tagging, targeted drills, minimal-pair listening, heatmap.
*Accept:* ≥100 authored contrastive items; wrong answers on tagged items produce an Indonesian explanation; heatmap renders from real logs.

**M5 — Progress.** Vocabulary-size estimate + CI, coverage curve, retention vs target, forecast, radar, calibration, JSON export.
*Accept:* every §9 item renders from real local data; export round-trips into a fresh install.

**M6 — Japanese.** JMdict/KANJIDIC ingestion, build-time tokenization, kana→kanji script ladder, furigana fading, kanji components + editable mnemonics, particle drills, mora minimal pairs, `ja.yaml` contrastive content including the **positive-transfer notes**.
*Accept:* a Japanese absolute beginner path from kana to first 100 kanji works offline; JA-specific tests pass.

**M7 — Production, reader, optional sync.** Dictation, shadowing, tap-to-gloss reader with one-tap mining, speech-recognition scoring with graceful fallback, then optional Cloudflare Workers+D1 delta sync behind a flag.
*Accept:* app remains fully functional with sync disabled and with speech APIs unavailable.

---

## 13. Testing and quality gates

- Vitest for all of `src/core` — property tests for the composer, golden tests for the scheduler, simulated-learner tests (agents with known forgetting curves) validating that measured retention converges near target.
- Playwright smoke: install → session → offline reload → resume.
- CI gates: typecheck · unit tests · bundle budget · license manifest · Lighthouse PWA score · cold-start timing.
- Manual test matrix for speech APIs across Chrome Android / Firefox / Safari iOS — document actual behavior in `docs/DECISIONS.md`.

---

## 14. Questions to ask me before writing Milestone 1 code

1. Should English and Japanese ship as one installable app with a language switcher, or two builds sharing a core package?
2. Is a GitHub repo already set up, and do you want Cloudflare Pages or GitHub Pages for hosting?
3. How much authored content will you write yourself (contrastive notes, mnemonics) vs. how much should be generated from corpora and reviewed?
4. Target learner: absolute beginner in both, or intermediate English + beginner Japanese (the most common Indonesian profile)? This changes default banding.
5. Do you want the optional bring-your-own-key AI layer scaffolded in M0, or deferred to post-M7?

**Answers on record (2026-08-10):** 1 — one installable app with lazily-loaded language packs. 2 — Cloudflare Pages, new repo. 4 — intermediate English + beginner Japanese. 5 — deferred to post-M7. Question 3 remains open; see `docs/PROGRESS.md`.

---

## 15. First action

Read this spec, write `docs/DECISIONS.md` with your reading of the riskiest assumptions (my nominations: Web Speech API voice availability on Indonesian Android devices; Japanese tokenizer size; the true licensing terms of each dataset; whether 8 MB is achievable), ask me the §14 questions, then execute **Milestone 0**.
