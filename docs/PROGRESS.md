# PROGRESS.md

## v1.33.0 — an unanswerable question is not a hard one (2026-10-04)

The user's report, verbatim:

> there is fixing sentence in hiragana, how can a complete beginner do that even
> though the skill level is really from 0

They could not. `drillCandidates` picked by Elo difficulty alone — the drill
nearest the learner's rating — and a fresh profile sits at the median. So
session one offered

> きのうのえいがは おもしろいでした。
> *Ada satu yang keliru di kalimat ini. Tulis ulang yang benar.*

to someone who had not been taught one character.

D33 already contains the reasoning, written about a different case: a wrong tag
is worse than no tag, because it shows the learner an explanation of a mistake
they did not make. This is worse again — a wrong answer they had **no way** to
get right teaches them the app is unfair, and it poisons the §3.3 heatmap, which
reads those answers as evidence about the category.

### What the gate reads

The whole drill: prompt, options and answer. A prompt in Indonesian with
Japanese options is just as unanswerable, and splitting the check would have let
those through.

Latin and punctuation are always readable, so the drills that need no Japanese
to answer — *"Kata serapan seperti 'kopi' biasanya ditulis dengan?"* — stay
available from the first session. Those are exactly where a beginner should
start, and §2.9 is most of the app's early teaching.

It unlocks character by character off §2.4's known-set, the same signal the
romaji fade uses, so the drills arrive as the script does.

### Two vacuous tests, both caught by falsifying

The first filtered the session queue on a `drill:` prefix. Drill candidates
carry the raw drill id, so the filter matched nothing and the test asserted that
an empty list contained nothing unreadable — it passed with the gate removed.
The second looked ids up in the pack instead, and fails with the gate removed,
which is the only evidence that it guards anything.

Neither would have been noticed without disabling the feature and re-running.
That is twice in two days a green test turned out to be testing nothing.

952 unit · 78 e2e.

## v1.32.1 — the rung that climbs itself (2026-10-04)

v1.32.0 taught the syllabary and started a Japanese beginner at romaji, which is
where §4.3 starts them. This is the other half: **leaving** that rung.

> romaji → kana → kanji, with romaji **actively deprecated after kana fluency**

Before this, deprecating it meant finding a control on the home screen and
knowing what it was for. Now it happens on its own: the romaji rung draws a word
**in kana as soon as the learner can read every character in it**, so the script
arrives character by character as the syllabary is earned, and the latin is left
only where it is still doing work.

A learner three days in sees `neko ga suki` become `ねこ が suki` and then
`ねこ が すき`, without touching a setting.

"Can read" is §2.4's existing definition — a card above the known threshold —
not a new one. The task carries which characters qualify, computed over the
readings as well as the surface, because a kanji token's kana only exists in its
reading and that is exactly what the romaji rung falls back to.

### A test that passed with the feature switched off

The first browser gate asserted that hiragana appeared somewhere on the page.
A kana card is hiragana by definition, so it passed with the fade disabled —
caught by falsifying it, which is the only reason it was caught at all.

Narrowing it to the sentence element meant walking past whatever the composer
had put first, and the walk turned out slower and flakier than the thing it was
guarding: two minutes, hanging on clicks, for a claim that is pure.

So it is covered where it is deterministic. `furigana.test.ts` owns the
rendering decision — all latin at zero characters, `が` alone once が is known,
plain kana once the sentence is readable — and `task.test.ts` owns the wiring,
including that a katakana reading counts as its hiragana self: the syllabary
teaches ネ and ね separately, but a learner who knows ね can read ネコ.

947 unit · 77 e2e.

## v1.32.0 — the alphabet (2026-10-04)

The user asked how a complete beginner is supposed to rewrite a sentence in
hiragana *"even though the skill level is really from 0"*.

The honest answer was that they are not, and the drill was not the problem.

### The app never taught hiragana

| | |
|---|---|
| kanji shipped as learnable items | **1,748** |
| single-kana lexemes | **15** — every one a particle (は, の), not the alphabet |
| kana instruction anywhere in the app | **two multiple-choice trivia questions** |
| what the first screen promises | *"Bahasa Jepang — Mulai dari nol, dari hiragana"* |

And `defaultScriptMode` started that learner at **kana**, citing §4.3:

> romaji is deprecated the moment kana is fluent, so we never make it the
> default entry point

§4.3 says *"romaji → kana → kanji, with romaji **actively deprecated after kana
fluency**"*. Romaji is the rung you **leave**. The comment reversed its own
source — and two unit tests and one e2e pinned the reversal, one of them named
*"defaults Japanese learners to kana, never romaji"*. A beginner who had been
taught no characters was started one rung above where they stood, and then shown
sentences in a script nothing had introduced.

### 208 characters, scheduled like everything else

104 hiragana then 104 katakana, as `kind: 'kana'` items on the same FSRS
scheduler as every word and kanji. The card shows the character, its sound, and
the other script's form of the same sound — because hiragana and katakana are
*"dua set huruf untuk bunyi yang sama"*, and meeting them as two unrelated
alphabets is what makes the second feel like starting over.

**There is no shard.** The gojūon comes from `src/core/kana.ts`, which already
held the romaji table `romajiToKana` round-trips against. The writing system is
not a corpus: no licence entry, no download, no content hash, nothing to go
stale — and no re-download for anyone.

The small kana — ぁぃぅぇぉゃゅょ — are left out. They are never a syllable on
their own; they appear as the second half of a digraph, and きゃ is taught whole.
`ROMAJI` carries them because the converter needs them. A learner does not meet
them as characters.

### Half the budget, not all of it

Kana takes **half** the new-item slots while any remain unlearned.

Taking every slot makes the syllabary a wall — 104 hiragana at five new items a
day is three weeks before the first real word, which is precisely the fixed
lesson order §1 names as a non-goal. Taking none is what the app did. So they
run together: some characters and some words every session, with the words in
romaji until the characters land.

A first meeting with a character is **errorless**, like a first lexeme: the
confirmation is the response, and the only honest grade for it is "fine". That
path already existed for exposure cards and now covers both.

### What a day-one learner sees now

Pick Japanese, tap practise, and the first card is あ, with `a` under it and
*"Bunyi yang sama ditulis ア dalam Katakana."*

Gated end to end: 208 items exist, the first card is あ, answering it advances,
and the composer's queue holds characters **and** words.

### Still to come in this rehaul

The per-character fade — words rendered in kana only once their characters are
known — plus the readability gate on drills, and the home screen.

938 unit · 77 e2e.

## v1.31.0 — a card that would not say what the character means (2026-10-04)

Reported by the user, about Japanese: a kanji card shows the character *"with no
word meaning or how to read it in romaji"*. Both true.

All **1,748** shipped kanji carry KANJIDIC2 `meanings` — 日 is
`["day", "sun", "Japan", "counter for days"]` — and the card rendered none of
them. `toRomaji` has been in `core/kana.ts` since M6 and the card never called
it. A beginner met this:

> 与 · Tersusun dari 勹 + 上 · Dibaca あた

A character, two shapes, and a kana reading. Nothing about meaning, and nothing
they could pronounce.

### Why the meanings were missing, and why that was the wrong call

They are English, and §10 is Indonesian-first. There is no Indonesian source to
swap in: the id.wiktionary gloss shards cover 274 Japanese lexemes and **0
kanji**, measured.

So the real choice was English-with-a-label or nothing — and nothing is not the
neutral option. It is a card that teaches a character while withholding what it
means. §10's rule is about the app's own voice, not about refusing to show data
in the language it happens to exist in, as long as the learner is told which
language that is.

Now:

> 与 · Tersusun dari 勹 + 上
> **Artinya (bahasa Inggris)** bestow, participate in, give, award
> **Dibaca** あた (ata) · Dipakai dalam 与える, dibaca あたえる.

Romaji sits *beside* the kana rather than replacing it: the kana is what they
are learning to read, the latin is the scaffold.

### This is the small half

The same report named two bigger things — a beginner being asked to rewrite a
hiragana sentence on day one, and a home screen that is mostly settings. The
root turned out to be that **the app never teaches hiragana at all**: 1,748
kanji ship as learnable items against *fifteen* single-kana lexemes, all of them
particles, and the only kana instruction anywhere is two multiple-choice trivia
questions. The first screen says *"Mulai dari nol, dari hiragana."*

That is the next build, and it is §4.3's own ladder finally implemented.

931 unit · 75 e2e.

## v1.30.1 — 日 is made up of 日 (2026-10-04)

The other half of the card v1.30.0 opened.

KRADFILE lists a character among its own radicals, and D41's derived grouping
keeps it. Over the shipped shard:

| | count | the card said |
|---|---|---|
| breakdown is only the character | **62** | *"日 tersusun dari 日"* |
| breakdown lists it beside real parts | **78** | *"見 tersusun dari 見 + 目 + 儿"* |

…and then the baseline mnemonic invited the learner to *"karang ceritamu sendiri
dari bagian-bagian itu"* — make up your own story from those parts.

### A fallback that could never run

`baselineAtomic` exists for precisely the first case:

> 日 adalah bentuk dasar. Coba karang caramu sendiri untuk mengingatnya.

It is guarded on `components.length > 0`, and **no shipped kanji has an empty
breakdown** — 0 of 1,748, because D41's fallback to raw radicals always produces
at least the character itself. So the branch written for the atomic case was
reachable only in a case that never occurs, while the case it was written for
got the circular text instead.

### One rule

A character is not one of its own components.

- 見 → 目 + 儿. More useful than it was, not less.
- 日 → nothing, so the component line hides and `baselineAtomic` fires for the
  first time since M6.
- Everything else is untouched: 140 of 1,748 cards change, 8%.

It is filtered where the face is built, not in the shard. The raw KRADFILE set
is licensed data that D41 ships deliberately alongside the derived grouping, so
the correction belongs to how it is read, not to the record of what was
received.

### Left alone

`森 → 木` and `林 → 木`. Both are true and both lose that there are three and
two of them — KRADFILE lists *unique* radicals, so the count is not in the data,
and inventing it is not an option.

928 unit · 75 e2e.

## v1.30.0 — a full stop that is not part of any word (2026-10-04)

§2.11's acceptance criterion is *"every kanji item renders its component
breakdown; user-authored mnemonics persist and survive sync."* v1.21.0 fixed the
sync half. This time I checked the card itself, which neither half had looked at.

The breakdown is fine — **0 of 1,748** shipped kanji have an empty one, so D41's
fallback to raw radicals holds everywhere. The reading was not.

### What the card said

KANJIDIC2 writes a kun reading with its okurigana attached and a dot marking
where the kanji stops. 会 is `あ.う`: the character is read あ, and the う is
written after it in kana. A leading or trailing hyphen marks a prefix or suffix
position — 一 is `ひと-`, 部 is `-べ`.

The card rendered `{face.reading}` verbatim, under the heading **"Dibaca"**.

| shape | count | example |
|---|---|---|
| clean | 870 | 日 → `ひ` |
| dot | 863 | 会 → `あ.う` |
| trailing hyphen | 9 | 一 → `ひと-` |
| leading hyphen | 4 | 部 → `-べ` |
| hyphen and dot | 2 | 可 → `-べ.き` |

**878 of 1,748 — 50.2%** — told an Indonesian beginner that a kanji is read as
a string containing a full stop.

### Why the obvious fix is wrong

Strip the dot: `あ.う` → `あう`. That is worse than leaving it, because あう is
the reading of **会う**, not of 会. The card would stop being cryptic and start
being false — which is the failure §2.7 exists to prevent, moved one screen
over.

So both halves are kept, and the card says each one plainly. Driven in a browser
on 与:

> **Dibaca** あた
> Dipakai dalam 与える, dibaca あたえる.

Both true. `あた.える` was neither.

The position hyphen is dropped — 13 of 1,748. The reading is right either way,
and what the hyphen adds is that the character sits at the front or the back of
a compound: copy worth less than what it would cost the learner to decode.

### Where the split lives

In `buildTask`, not the view. The kanji face already carries display-ready data
for its components and its mnemonic, and putting the reading there too means a
deterministic test covers it — this repo has no component tests, so a split done
in the view would have been guarded by nothing but my eyes.

Falsified by putting `item.reading` back: three of the four cases fail.

### Scope

Lexeme readings carry no notation — **0 of 5,633**, measured — so this is the
kanji shard alone, and no content had to change.

925 unit · 75 e2e.

## v1.29.1 — the offline test that never opened a card (2026-10-04)

R11 ended with a sentence about what the next pass would need: *"an offline test
that asserts content availability rather than just that the app boots."* That
turned out to be worth doing on its own, before any of R11's options.

### What the gate actually proved

```ts
await context.setOffline(true);
await page.reload();
await expect(page.getByRole('heading', { name: 'Halo!' })).toBeVisible();
```

The home screen. Which renders from the precached JS and CSS whether or not a
single content shard survived.

That is the fragile half. Thirty shards are precached and revision-managed;
thirty-four live in a runtime cache whose entry cap once sat one fetch *below*
the shard count — a failure invariant 34 describes as looking *"like content
that mysteriously will not open on a plane."* And R11's recommended fix is a
service-worker change whose failure mode is silently breaking exactly this.

So the thing guarding §5.4's headline promise could not see the promise break.

### Cutting the network and answering a card

The new test composes a session, checks the card carries a real headword, and
answers it. A session needs the lexeme shard for its items, the anchor shard for
its sentences and the gloss shard for its meanings — nothing renders without all
three.

**It passes**, which is the first direct evidence in this repo that §5.4 holds
rather than being assumed.

### Proving it could fail

Removing the content precache globs alone was **not enough** — the test still
passed, because the runtime `CacheFirst` rule had already caught the shards
during the online first run. Which is itself worth knowing: the two mechanisms
overlap, and the precache matters for the learner who installs and goes offline
*before* a session rather than after.

The first attempt was also inconclusive for a duller reason —
`playwright.config.ts` sets `reuseExistingServer: true`, so a preview server
left running from an earlier run meant the build never re-ran and the config
edit changed nothing. A falsification that does not rebuild is not a
falsification.

With the server killed and **both** mechanisms removed, the result is clean:

| | shell-only test (old) | answer-a-card test (new) |
|---|---|---|
| content caching intact | pass | pass |
| content caching removed | **pass** | **fail** |

916 unit · 75 e2e.

## v1.29.0 — a hash that proved nothing (2026-10-04)

v1.26.0 changed shipped content for the first time in a while, which raised a
question worth checking rather than assuming: does a learner who already has the
old shards actually get the new ones?

Invariant 10 says content hashes are "the cache-busting signal". They are not —
not for every shard.

### The shard URL carries no hash

`content/ja/kanji.b1.json` is the same URL whatever is in it. The service
worker's runtime rule for content JSON is `CacheFirst`, with this comment:

> Shards are immutable for a given manifest hash.

True as intent, false as implemented: the hash lives in the manifest, not in the
URL, so `CacheFirst` has no way to see a change.

### How much of the content this reaches — measured from `dist/sw.js`

| | handled correctly | exposed |
|---|---|---|
| **30 precached**, revision-managed | manifests, contrastive, topics, bands 1–3 of lexemes/anchors/chunks/glosses | — |
| **34 runtime `CacheFirst`** | — | all `sentences.*` and `passages.*`, bands 4–5, `pseudowords.json`, `kanji.b1.json` |

Workbox updates the precached 30 properly. Of the other 34, only shards that
`ensureBands` *imports* can be recorded wrong — and it is only ever called with
`STARTER_BANDS`, so bands 4–5 are never imported at all.

That leaves exactly one: **`kanji.b1.json`**, which `ensureBands` always wants
regardless of band.

### The part that was permanent

1. The manifest revalidates and offers a new hash.
2. `ensureBands` sees the mismatch and fetches.
3. `CacheFirst` serves the **old** body.
4. The import writes `sha256: shard.sha256` — the **new** hash — against it.

From then on the comparison is equal and the app never looks again. Stale kanji
breakdowns and readings, permanently, with the app believing it is current.

The fix is one line of intent: **record the hash of the bytes that arrived, not
the one the manifest promised.** The rows still go in, because stale content is
valid content and withholding it would be worse than serving last week's — but
the comparison stays honest and the next boot retries instead of believing it is
done.

### What that does not fix, and why it is filed rather than forced

Under `CacheFirst` the retry is served from the same stale entry, so honesty is
not delivery. Three ways out, measured rather than guessed:

1. **Precache it.** Simple and correct; **95 KB gzipped** added to every Japanese
   learner's first load against a 764 KB starter set. A 12% increase to fix a
   latent bug is the wrong trade for §5.4's mobile-data learner.
2. **Version the URL** so `CacheFirst` becomes true. Needs the runtime pattern to
   accept a query *and* `ignoreURLParametersMatching` so precached shards still
   match their revisionless entries — a subtle service-worker change whose
   failure mode is silently breaking offline, which `check:offline` and one smoke
   test are thin cover for.
3. **`StaleWhileRevalidate`.** Picks up changes next load, and silently
   re-downloads a 211 KB sentence shard every time the reader opens online —
   exactly the cost D80 makes the reader announce.

Option 2 is right and wants its own pass with an offline test that asserts
content availability rather than just that the app boots. **R11.**

### A fixture that could not have caught it

The two existing hash tests used placeholder hashes — `'lex-1'`, `'lex-2'` —
so no body ever matched its manifest entry and the comparison was never really
exercised. They compute real hashes now, over the same bytes the stub serves,
and the fetch stub returns a real `Response` rather than a `json()`-only
lookalike, because the import reads the body as text to hash it.

916 unit · 74 e2e.

## v1.28.0 — a seam the feature did not use (2026-10-04)

Started from the same thread as v1.27.0: which parts of this app are English
only without saying so. `detectInterference` is one.

### §2.9's error-triggered note never fires for Japanese

The detector can emit seven category ids — `ARTICLES`, `COPULA_BE`,
`MODAL_BISA`, `PLURAL_S`, `PREPOSITIONS`, `PRONOUN_GENDER`, `TENSE_ASPECT`.
The Japanese pack's ids are `PARTICLES_WA_GA`, `PARTICLES_NI_DE`,
`WORD_ORDER_SOV`, `POLITENESS_REGISTERS`, `MORA_TIMING`, `SCRIPT_KANA` and
eight more. **Zero overlap.**

No wrong data results — the session filters detector hits against the active
language's pack before recording them — so a Japanese wrong answer is simply
tagged with nothing, and §2.9's *"where the error matches a known Indonesian-L1
interference pattern, show the contrastive note"* never happens.

This is **not** fixed here. Writing は/が and に/で heuristics against a
learner's typed answer is exactly the wrong-tag risk D34 refuses — *"a wrong tag
is worse than no tag — it shows the learner an explanation of a mistake they did
not make"* — in a language whose output needs a native speaker to check. It is
recorded in `docs/SCIENCE.md` §2.9 with the measurement, beside R7 and R10.

The drills themselves are unaffected: `ja.yaml` compiles 14 categories, the
composer schedules them, and the §3.3 heatmap reports all of them.

### What the trace did turn up

`Item.interferenceTags` — a **required** field, with a Dexie multi-entry index
over it since schema v1, documented in `db.ts` as:

> `items.*interferenceTags` is a multi-entry index so the contrastive engine
> can pull drills by category (SPEC §3.3).

The contrastive engine was built in M4 and pulls drills from the compiled
`contrastive.json`. The error tagger reads the answer text. **Nothing ever
queried the index.** And nothing ever wrote a tag: 0 of 5,245 English and 0 of
6,904 Japanese shipped lexemes carry one, with the field set to `[]` at all
three of its writers.

Invariant 8 names this exactly — *"no dead scaffolding… do not build a seam for
a feature two milestones out"* — and it was found two milestones out.

Schema v8 drops it. Index-only, so no row moves: Dexie rebuilds the store's
indexes and leaves the data alone, and `items` is generated content that is not
in the export bundle, so no backup carries the field forward either. The
migration test opens a real v7 store, writes items into it, upgrades, and counts
them — plus asserts the indexes the app actually queries still answer.

### The shape of these two

Both are the same mistake at different distances. One built an index for a query
nobody wrote; the other left a detector that matches nothing for half the
learners. Neither was wrong when it was written — the index was v1 planning for
M4, the detector was M4 shipping English first — and both stopped being true
without anything saying so.

915 unit · 74 e2e.

## v1.27.0 — a test with nothing to catch you (2026-10-04)

Found by grepping the copy for hardcoded language names after v1.26.1, and
following one of them.

`placement.result.overclaimed` read *"Beberapa kata tadi sebenarnya bukan bahasa
**Inggris**"* — "some of those words weren't actually English". The obvious fix
is to make it language-aware, like the heatmap heading. Checking who could see
it turned up something else: **a Japanese learner can never see that sentence at
all**, because there is nothing for them to over-claim.

### What §4.2 asks for, and what ships

> Include a **Yes/No vocabulary-size check with generated pseudowords** to catch
> overclaiming, correcting the raw score for false alarms.

And `src/core/pseudoword.ts` says what happens without them:

> A Yes/No test without pseudowords measures confidence, not vocabulary — a
> learner who says yes to everything scores 100%.

`build-en.ts` generates `assets/content/en/pseudowords.json` from a character
model of the corpus. `build-ja.ts` generates nothing. `loadPseudowords('ja')`
404s, `PlacementScreen` catches it into an empty list, and the run shows no
pseudoword at all.

`correctedAbility` then does this:

```ts
if (tally.pseudoShown === 0) return raw;
```

The raw estimate, with its raw standard error, handed back indistinguishable
from a corrected one. Nothing documented the gap.

### Why not just generate them

Generating Japanese pseudowords from a character model risks emitting a **real
word**. Japanese has a small phoneme inventory and a dense homophone space, so a
plausible-looking kana string is much likelier to exist than a plausible-looking
English letter string — and a "pseudoword" that is real makes the correction
*wrong* rather than absent, which is worse than not having one. Validating
against JMdict catches dictionary entries and not names, slang or compounds.

This log already records the English lesson: *"a trigram model makes obvious
fakes"* — and that was for a language everyone working on this can read.

So it goes in the register as **R10**, in the same category as R7's voice
licence and the device matrix: a thing that needs a person who speaks the
language rather than more code.

### What was done instead

`wasControlled` replaces the silent `return raw`, and the result screen says
what did not happen:

> Buat bahasa ini kami belum punya kata-kata jebakan, jadi angka ini murni dari
> jawabanmu sendiri — anggap saja titik awal, bukan hasil tes.

Two things deliberately **not** done:

- The estimate is not discarded. It is still the honest 1PL reading of the
  answers the learner actually gave; what it may not do is present itself as
  checked.
- No discount is invented for it. `placementRun.ts` is careful to label its one
  calibration choice as a calibration choice, and inventing a second with no
  measurement behind it would be exactly the kind of fake precision §2.15 bans.

The harm was bounded in the first place — placement is offered, never enforced
(invariant 13), skippable at no cost, and §4.2 re-estimates continuously — but
"bounded" is not "worth leaving unsaid".

And `overclaimed` lost its "bahasa Inggris": it now says *"bukan kata asli"*,
which is true in any language and will still be true when R10 closes.

913 unit · 74 e2e.

## v1.26.1 — your English patterns, in Japanese (2026-10-04)

Found by reading the Japanese progress screen end to end after v1.26.0 moved
the numbers on it — which is what you do after changing a figure a learner sees,
and which turned up something else entirely.

The §3.3 contrastive heatmap is headed:

> **Pola bahasa Inggrismu** — *your English patterns*

It was a literal, with no language in it. On a Japanese profile that sentence
sat directly above は dan が, hiragana dan katakana, and あげる・くれる・もらう.

The data was right the whole time. `allCategoryScores` is scoped by language and
the right categories were listed; only the heading lied, which is why no test
caught it — every assertion about the heatmap was about its rows.

`copy.langNames` has existed since M0 and the screen already had `lang` in
scope two components away. It takes it now.

### What the rest of that screen looked like

Worth recording, because it is the first full read of §9 for Japanese since the
figures were corrected, and the rest of it holds up:

> Kata yang sudah kamu kunci mencakup sekitar **37%** kata yang muncul
> sehari-hari. … Semua tahap selesai berarti **54%** … Sisanya partikel dan kata
> bantu — itu tata bahasa, dan kami ajarkan lewat kalimat, bukan lewat hafalan
> kata.

And every unmeasured row says so rather than showing a zero — "Belum diukur" on
all five skill axes, "Belum cukup data · Butuh 5 jawaban lagi" on all fourteen
heatmap categories, "Belum cukup ulangan terjadwal untuk dinilai" on retention.
Invariant 18 holds across the whole screen.

910 unit · 74 e2e.

## v1.26.0 — a percentage of itself (2026-10-04)

`build-en.ts` writes the rule down, right where it computes the English number:

> A learner who mastered every word we ship would still not reach 100%: proper
> nouns are filtered from the inventory (D14) and band 6 is not shipped at all,
> and both still turn up in real sentences. **Reporting a percentage without
> saying what it is a percentage *of* would overstate it.**

English comes out at **0.873**. Japanese came out at **1**.

### Why it was exactly 1

```ts
const lemmas = analysed.filter((t) => TEACHABLE_POS.has(t.pos) && isJapanese(t.basic_form));
...
for (const lemma of pair.lemmas) counts.set(lemma, (counts.get(lemma) ?? 0) + 1);
const totalTokens = [...counts.values()].reduce((sum, count) => sum + count, 0);
const shareOf = (lemma) => (counts.get(lemma) ?? 0) / totalTokens;
```

The denominator **is** the teachable set. Every share was a fraction of what the
app already covers, so they summed to exactly 1 by construction. `teachableShare`
was not a measurement at all — it was the share of the teachable tokens that are
teachable.

And the pipeline knew better in the line above it: *"Content words only:
particles and punctuation are grammar, not vocabulary."* It excluded them from
the inventory and from the denominator in the same breath.

### What the learner was told

§9's copy renders that figure directly:

> Kalau semua kata yang kami punya kamu kuasai, angkanya sampai **100%**.
> Sisanya nama orang dan kata yang sangat jarang.

Master our inventory and you understand everything you read — for a language
where particles alone are a large share of running text. There was no remainder
for the second sentence to describe, because the first one had claimed all of it.

### The corrected number, corroborated

The denominator is now every **word-like** token — `pos !== '記号'`, so particles
and auxiliaries in, punctuation out. Punctuation stays out because English's
`tokenizeLatin` strips it, and counting it on one side only would make the two
languages' figures mean different things.

    6,904 distinct lemmas, 63,065 teachable of 117,729 running words (53.6%)

**53.6%**, against English's 87.3%. Band 1 falls from 69.6% to 37.3%.

What makes this trustworthy rather than merely different: R9 measured, from a
completely different direction — resolving shipped anchor tokens against the
lexeme inventory — that Japanese tokens resolve **53.0%** of the time. Two
independent measurements landing within half a point of each other.

### The copy had to move with it

Correcting the number alone would have left a false explanation attached to it.
*"Sisanya nama orang dan kata yang sangat jarang"* is true of English's missing
12.7%. It is false of Japanese's missing 46.4%, which is grammar — and grammar
this app does teach, through sentences and contrastive drills, just not as
vocabulary. Both ceiling strings take the language now and say what the
remainder actually is.

### Proving the pipeline before changing it

Before touching `build-ja.ts` I ran it unchanged and diffed. Two things came out
of that:

- The content **is** deterministic — a full re-run reproduces every Japanese
  shard byte for byte, which is invariant 10 holding rather than being assumed.
- `ingest:ja` rewrites `manifest.json` from scratch, so it **drops every shard
  entry the other compilers added** — chunks and glosses. `chunks.test.ts`
  catches it and the build goes red, so nothing can ship that way, but the
  failure says "ships no shard for a band the pipeline no longer assigns", which
  does not tell you to re-run the chunk compiler. `CLAUDE.md` did not list
  `ingest:ja` at all. It does now, with the ordering.

The corrected pipeline was then run twice more and reproduces exactly.

### Cost

Five Japanese lexeme shards and the manifest change hash, so every Japanese
learner re-downloads them. That is invariant 10's documented price for a content
change, and it is worth paying for a figure that was telling them something
untrue about their own progress.

908 unit · 74 e2e.

## v1.25.1 — a seam, or a lie (2026-10-04)

Finishing the list D96 opened. Rerunning the dead-export scan over **non-test
source only** had turned up fifteen names; three of them were the script ladder,
the deferral undo and the gloss cache, which became v1.23.0, v1.24.0 and
v1.24.1. This is the rest of the list.

The useful question turned out not to be "does anything call it" but **"does the
file claim a caller it does not have"**.

### Three lies, deleted

- **`preview`** — *"what each rating would do, without committing — SPEC §2.1
  asks for this so the UI can show real intervals on the answer buttons."*
  There are no answer buttons. That is a design decision, not an omission: this
  app grades the learner's *answer* and derives the rating (`gradeForOutcome`),
  so there is nothing for a four-way preview to label. §2.1 names
  `scheduler.repeat()` as an API capability and its acceptance criteria are
  about determinism and the log.
- **`isMined`** and **`pendingMined`** — duplicates of `minedItemIds`, which the
  composer already uses. `pendingMined`'s comment described the prioritisation
  as something the composer would do *with it*; the composer does it without it,
  through `minedRank` in `newCandidates`.

### Four seams, kept — and deleting them would have made the tests worse

`getCategoryScore`, `isContentReady`, `ttsReport` and `GRADES` are accurate,
working, and called only from tests. Each one is how a test reads a property the
app really has:

- `getCategoryScore` returns §2.15's unmeasured default where no row exists, and
  that defaulting is exactly what the contrastive tests assert
  `recordCategoryAttempt` against. `allCategoryScores` returns a Map with no
  default, so routing them through it would have lost the behaviour under test.
- `isContentReady` is how the content tests check `ensureBands` wrote its
  bookkeeping (db v2) and not only its rows.
- `ttsReport` is how the speech tests see what the probe actually recorded.
- `GRADES` is how §2.1's determinism property is proved over the **whole** rating
  space rather than the subset the app emits.

So the rule is not "delete what has no production caller". It is that the file
must not claim a caller it does not have, and each of these now says it is a
seam — which is what `clearAnchorCache` and `resetTtsVerdict` have always said.

`GRADES` needed its comment corrected rather than kept: *"the four things a
learner can say about a card"* describes a different app. Nothing here asks
them, and Easy is never produced at all, because the only honest source for
"that felt effortless" would be the learner saying so and §2.12 forbids reading
it off the confidence tap.

### Two real fixes fell out of the same pass

- **`knownItemIds` inlined `isKnown`'s body.** §2.4's 0.6 threshold had two
  definitions in neighbouring files, agreeing by coincidence — the sort of
  agreement that survives exactly until someone changes one of them. It
  delegates now.
- **The L4 dictation gate counted `tokenizeLatin(anchor.text)`** — D99's defect
  one more time. Measured over the shipped band-1 anchors it admitted **100%**
  of them where real tokens admit 99.9%: three sentences of 11–12 tokens against
  a cap of 10. Small, and not a measurement either way. It counts the anchor's
  own tokens now.

The scan is down to seven names, and all seven are seams that say so.

902 unit · 74 e2e.

## v1.25.0 — the reader had almost nothing in it (2026-10-04)

Started as the slice v1.23.0 deferred: §4.3's script ladder reached the practice
session and not the reader, so a control labelled "Tulisan Jepang" took effect
on one screen and not the other. Wiring it meant opening the Japanese reader,
which turned out to contain **four sentences**.

### What the Japanese reader was offering

`coverageOf(text, known, lang)` tokenizes with `tokenizeLatin`. That function
finds no Japanese words — it splits on punctuation and returns the runs
between. So a Japanese sentence's §2.4 coverage was decided by where its commas
fell.

Measured over the shipped band-1 anchors, knowing every Japanese word the app
ships:

| sentence | `tokenizeLatin` sees | coverage |
|---|---|---|
| `お誕生日おめでとうムーリエル！` | one run | **0.00** |
| `彼はよく学校を欠席する。` | one run | **0.00** |
| `あの、すみません...` | `["あの", "すみません"]` | **1.00** |
| `本当？なぜ？` | `["本当", "なぜ"]` | **1.00** |

2,148 of 2,152 scored zero and were dropped. The four that survived scored 1.00
because their punctuation happened to split them into runs that were themselves
lexeme ids — and all four are interjections: `あの、すみません...`, `残念・・・。`,
`本当？なぜ？`, `あなた、大丈夫？`. That is the least useful reading material in
the corpus, because §2.4 wants comprehensible input **with something new in it**.

### Two more selectors were ranking on the same number

- **`selectGraded`** picks which anchor sentence teaches a word — §2.4's i+1
  choice. Every Japanese anchor scored below the floor, so it returned null and
  the caller fell through to `anchors[0]`. The i+1 selection was a no-op for a
  whole language.
- **`buildCandidates`** skips the coverage gate for Japanese, with a comment
  explaining the zeros as a dictionary-form/surface-form mismatch and citing
  *"294 of 300 band-1 anchors score exactly 0"*. That measurement was taken
  through the same broken function. It was measuring the bug.

### This is v1.15.1 again

v1.15.1 found sentence building silently English-only for exactly this reason
and fixed it by **taking tokens instead of text**. The lesson did not generalise
at the time, and `coverageOf` had the same shape two modules away.

So `coverageOfTokens` is now the implementation and `coverageOf` is the
Latin-only convenience in front of it — `coverageOfTokens(tokenizeLatin(text), …)`.
English is unchanged by construction, which is the point of writing it that way
round rather than adding a language branch.

### What it is worth

Counted through the real selector over the real shard:

| knows | reader offered, before | after |
|---|---|---|
| band 1 (500 words) | 4 | **113** |
| bands 1–3 (2,000) | 4 | **187** |
| every shipped word (6,904) | 4 | **249** |

And the figures are measurements: `今の何の音？` at 0.83, `これ誰の本？` at 0.80.

### The number R9 was filed with was wrong, and the risk still stands

`294 of 300` re-measures to **6 of 300**, with a mean coverage of **0.428**
knowing every Japanese word the app ships. The zeros were the tokenizer.

That does not rescue R9 — 0.428 is still far below the 0.92–0.98 §2.4 asks for,
because Japanese particles are not vocabulary. What changed is that it is now a
measurement rather than an artifact, and the risk register says so.

`buildCandidates` keeps its gate off for Japanese: at `BUILD_MIN_COVERAGE` the
real number clears only **21 of 2,152** anchors, against the 1,521 buildable
sentences v1.15.1 recovered. It is now a choice against a real figure rather
than a limitation, and turning it on is an R9 decision rather than a code one.

### The ladder in the reader, and the one decision it needed

Kana and romaji **rewrite the surface** — 学校 is drawn as がっこう or gakkou —
and the dictionary lookup behind a tapped word has to reach the token the
sentence actually contains, or the reader stops being able to gloss anything
written in kanji. So `TextPart` separates what is shown from what the tap means:
`value` defaults to `text`, so a caller with nothing to separate says nothing,
and §2.4's unknown-word highlight keys off the token for the same reason.

Ruby goes **inside** the button rather than around it, which leaves the roving
tabindex untouched and keeps invariant 35's one-stop-per-block promise exactly
as it was. Per-kanji stability is read once over the whole feed rather than per
sentence, because the same character recurs and the lookup is a database read.

### A gate that could not fail

The first version of the tap test clicked words until any panel opened. It
passed against a deliberately broken `value` — because a kana token is unchanged
by the rewrite and resolves either way, so the loop found one of those first.

The one that ships compares the two rungs' rendered words, asserts that some
index differs, taps that index, and checks the **mine** button appears — which
renders only where `db.items.get` resolved the word. That one fails when `value`
is broken, which is the only reason to have it.

906 unit · 74 e2e.

## v1.24.1 — a bad moment, remembered as a fact (2026-10-04)

Found while reading a comment that turned out to be wrong about something else.

`clearGlossCache` is documented as *"Test seam; also used when a language
switch invalidates what is in memory."* It is not: the cache is keyed
`lang:band`, so a language switch needs no clearing, and nothing outside the
tests calls it. Correcting that two-word claim meant reading the loader it
belongs to, which had a real defect in it.

### Three loaders, one mistake

```ts
  } catch {
    // Offline before this band was cached, or no gloss shard for this language.
    // Either way the caller gets "no gloss", which is a state it already has.
  }
  cache.set(key, map);     // ← map is still EMPTY
```

Glosses, topics and the reader's sentence shards all did this. Each comment
reasons correctly about the *first* call and not at all about the second: a
failed fetch was written into the in-memory cache and stayed there for the rest
of the session, even once the network came back.

The trigger is ordinary — offline before a shard had ever been fetched, or a
service worker still installing on a first visit.

### Why the gloss case is the worst one

Every word in that band reports **"Kata ini belum ada di kamus kami"** for the
rest of the session. That is the false branch of invariant 38 — *a card shows
what the word means, or says it has no entry* — and the learner has no way at
all to detect it, because D59 measured gloss coverage at **30% of English
lexemes and 4% of Japanese**. "No entry" is the ordinary answer here. A wrong
one is indistinguishable from a right one.

The other two are quieter but not better:

- **Topics** only *reorder* new items (invariant 33), never restrict them. So a
  session that silently lost its topic map looks exactly like a learner who
  chose no topic. Nothing on screen would differ.
- **Sentences** cost money. §5.4's learner is on mobile data and D80 makes the
  reader state its download before spending it — so a cached failure means the
  reader reports itself empty *after* the learner agreed to pay for it, with no
  way to ask again short of a reload.

### The distinction worth making

The easy fix is to never cache a failure. That is wrong in one direction:
Japanese ships gloss shards for bands 1–2 only, so bands 3–5 legitimately 404,
and re-fetching a shard that does not exist once per card is waste rather than
caution.

So `fetchShard` draws the line the loaders were missing:

> **A 404 is a fact about the build and may be remembered. Anything else is a
> fact about right now and may not.**

Each loader still returns its empty value on failure — `glossFor` gives `[]`,
the reader opens with nothing, the composer behaves as it did before topics.
What changed is that none of them writes it down.

### Falsified

Each of the three has a test that fails once, succeeds the second time, and
asserts the second call returns real data; plus one that 404s twice and asserts
a single fetch. Checked against the old behaviour by putting `cache.set` back
into the `catch` — the two "tries again" cases fail, the 404 case does not,
which is exactly the split the fix is about.

899 unit · 72 e2e.

## v1.24.0 — a word you set aside, and no way back (2026-10-04)

The second name off the non-test dead-export scan that found §4.3's script
ladder. `src/data/repositories/deferrals.ts` ends with this:

```ts
/** Undo, for a learner who changes their mind. */
export const undeferItem = async (profileId: string, itemId: string): Promise<void> => {
```

No screen called it.

### What that cost

The deferral window escalates on purpose, and the file argues the case well:
*"One skip is 'not today'; four is 'stop showing me this'. A fixed window would
either nag someone who has clearly declined or bury a word they merely postponed
once."* It is 3 days, then 7, then 21, then 60.

"Belum perlu kata ini" is a 56px control at the bottom of every card, in the
thumb zone, directly below the primary action. A mis-tap there removed a word
for three days; a second one for a week; a fourth for two months. And the same
file says why that is the wrong outcome:

> It is capped, because §2.14 is about autonomy rather than deletion, and a
> permanently vanished item cannot be reconsidered.

The cap was there. The reconsidering was not.

### Expire, don't delete

`undeferItem` deleted the row — which also deletes `times`, the count the
escalation is computed from. `deferredItemIds` deliberately leaves *lapsed*
rows in place for exactly that reason, and the undo path contradicted it: a
learner who had declined four times and changed their mind once would, on their
next skip, be treated as someone who had never declined at all.

So the undo sets `until` to now and keeps the row. The composer stops skipping
the word, and the history of having declined it survives. There is a unit test
that declines twice, undoes, declines again and asserts the window is 21 days
rather than 3.

### Why the glossary and not the session

The session is where the mistake is made, so an undo there would be the most
direct fix. It is also the one place it cannot go: an answered card **retires**
(invariant 39) — every control goes, which is what makes a second answer
impossible rather than merely refused — and a skip does not even leave a card
behind to attach something to. A control that reaches back into a card that is
gone is the second code path D77 refuses on principle.

A list is the honest place to undo something, and the glossary already exists as
the passive read §2.2 explicitly permits. The section sits below the word list
and outside its search-dependent branch, so a learner hunting for a word they
set aside finds it whether or not they have answered anything yet.

Each row says when the word would have come back on its own. That matters: it
makes taking it back a **choice** rather than a rescue, which is the §2.14
framing — and it is information the learner would otherwise have no way to get.

`activeDeferrals` drops a word the content shards no longer carry rather than
inventing a headword for it, which is invariant 18's rule in a different shape.

### One thing the compiler caught

The first version computed "comes back in N days" with `Date.now()` in the
component body. The React compiler rejects it as an impure call during render —
the same rule that moved `SwipeCard`'s drag threshold out of render in v1.12.0.
The timestamp is captured when the list is read instead, which is also more
correct: every row is measured against one instant rather than against whenever
React happened to re-render.

892 unit · 72 e2e.

## v1.23.0 — the script ladder nobody could see (2026-10-04)

M6 built SPEC §4.3 in full. `src/core/furigana.ts` is 100-odd lines of careful
work: the romaji → kana → kanji ladder, §10's per-kanji fade, and D42's argument
for why furigana attaches to a token rather than a character — okurigana spans
kanji and kana, rendaku voices 紙 to がみ inside 手紙, and 今日 is きょう as a
whole word with no split at all. `Profile.scriptMode` was written at first run,
defaulted to `kana` for Japanese, and re-derived on a language switch.

**`furiganaFor` was called by no screen. `scriptMode` was read by none.**

So a Japanese learner saw raw kanji with no readings, permanently, while the
database recorded that they were on the kana rung.

### Why the earlier scan missed it

The dead-export scan that found `slippingSoon` (v1.16.0), `cancelSpeech`
(v1.19.0) and seven more (v1.19.1) counts occurrences of each exported name
across `src`, `scripts` and `e2e`. `furiganaFor` has a caller: `furigana.test.ts`
exercises it thoroughly. So does `kanjiIn`. So does `isKana`.

Rerunning the same scan over **non-test source only** found fifteen names,
including these three. That is the scan that should have been run all along: an
export whose only caller is its own test is not covered code, it is code that
was built and never connected — which is the single most common defect in this
repository's history.

### The three decisions

**The data rides on the task, the segments are built in the view.**
`furiganaFor` is pure and synchronous, so the pipeline's tokens and readings and
the learner's per-kanji stability are resolved in `buildTask`, the last place
that can read the database. The *segments* are not, because `scriptMode` can
change while a card is on screen and a card's stability cannot.

A kanji with no card maps to `null`, never `0`. Zero stability would be a claim
that the learner studied the character and forgot it; null is the truth, and
`isFaded(null)` is false, so a missing card **shows** the reading rather than
withholding it. That is invariant 18's rule applied to a scaffold.

**The whole card is at one rung.** The first working build rendered the
sentence through the ladder and left the headword chip alone, which produced
this, in kana mode:

> かれはよくがっこうをけっせきする。
> `欠席`

The learner at two rungs at once, and the lower one is the one they chose.
`headwordIn` writes the chip and the free-production prompt at the current rung;
`headword` itself stays the answer and what a verdict shows, so display and
grading cannot drift apart.

**Romaji is written with spaces.** Joining romaji tokens with nothing gives

> karehayokugakkouokessekisuru。

which defeats the only thing §4.3's romaji rung exists for — getting an
Indonesian speaker producing sound on day one, which §3.2 says works *because*
Japanese /a i u e o/ maps cleanly onto Indonesian vowels. `furigana.test.ts` had
asserted the spaced form since M6, with a literal `.join(' ')`, and no renderer
ever honoured it. The separator is a prop on `Furigana` and is suppressed before
closing punctuation, so `suru。` stays attached rather than becoming `suru 。`.

### The control is part of the minimum, not a follow-up

Kana mode *replaces* kanji with their readings. Shipping the renderer without a
way to change rung would have put every Japanese learner permanently in kana and
meant they never saw a kanji at all — worse than shipping neither half. So the
ladder is on the home screen beside the language, Japanese-only, with the romaji
hint saying what §4.3 says about romaji: it is the rung you leave. That is a
fact about the writing system, not a judgement about the learner.

### Markup

`<ruby>` with `<rp>` brackets, not a stack of positioned spans. Ruby wraps and
reflows with the line, survives text zoom, and `rt` inherits its colour — so the
dark-mode contrast gate's verdict on body text is its verdict here too. `<rp>`
is for the fallback path: without it, a browser with no ruby support runs 私 and
わたし together into something that is neither.

A plain token renders as plain text rather than `<ruby>` with an empty `<rt>`,
which would reserve the line space above it for nothing and make a sentence with
no kanji taller than one with kanji.

### Checked by looking

All three rungs were driven in the browser, which is where the headword
mismatch and the unspaced romaji were found — neither is visible in a unit test,
and the second had a passing test asserting the opposite.

The e2e gates the half that is deterministic: the control exists, it is
Japanese-only, it starts on the rung §4.3 names, and the choice survives a
reload. That last assertion caught a race of its own — `handleChange` updates
React state first and persists after, so reloading on the rendered state alone
beats the write. The test waits on IndexedDB instead, which is the thing it
actually means.

### Left for the next slice

The **reader** still renders Japanese without furigana. It runs its text
through `TappableText`, whose roving-tabindex contract is invariant 35, and
putting ruby inside a composite with managed tab stops needs its own thought
rather than a copy of this. Recorded rather than done.

886 unit · 71 e2e.

## v1.22.0 — the app marked its own output wrong (2026-10-04)

Found the same way as v1.21.0: reading SPEC §2's acceptance criteria against the
code that claims them. §2.7's reads, in full:

> **Accept:** grader unit tests cover romaji↔kana equivalence, typos within
> tolerance, and English contractions.

Two of the three were covered. The third had a note in `grader.ts` where the
implementation should have been — *"Romaji↔kana equivalence is M6 and plugs in
as another normalization pass"* — and M6 was six milestones ago. It shipped
`src/core/kana.ts` with `toHiragana`, `toKatakana`, `romajiToKana` and `isKana`,
every conversion the pass needs, and three of those four were reachable only
from their own test file.

### The button that wrote the wrong answer

`KanaInput` has a katakana toggle. It is a real control with `aria-pressed` and
a label, and pressing it makes the kana palette write katakana.

`normalizeAnswer` did NFC, case, punctuation and whitespace. Nothing folded
kana. So ネコ against ねこ was two mistakes at a tolerance of zero —
`mismatch`, flatly wrong, not even a near-miss. Half-width katakana (ﾈｺ), which
some IMEs emit, failed the same way in a different Unicode block.

The app shipped a button that produced an answer it then marked wrong.

### The answer the input cannot type

Worse, and bigger. `KanaInput` is a kana keyboard: `romajiToKana` plus a palette.
There is no kanji conversion step — that is the whole reason the component
exists, per its own comment, because "Japanese production is where an IME
headache would stop a learner cold".

The production rung grades against `item.headword`. Measured over the shipped
shards:

| band | lexemes | with kanji in the headword | of those, carrying a reading |
|---|---|---|---|
| 1 | 500 | 356 (71.2%) | 355 (99.7%) |
| 2 | 500 | 386 (77.2%) | 381 (98.7%) |
| 3 | 1,000 | 728 (72.8%) | 719 (98.8%) |
| 4 | 2,000 | 1,243 (62.2%) | 1,208 (97.2%) |
| 5 | 2,904 | 2,250 (77.5%) | 2,156 (95.8%) |
| **all** | **6,904** | **4,963 (71.9%)** | **4,819 (97.1%)** |

So for 71.9% of the Japanese vocabulary, the expected answer could not be
produced by the input the app provides, and the hiragana reading — which 97.1%
of those items carry — was marked wrong.

§4.3 decides whether accepting the reading is a concession or the point:

> script mode for Japanese (romaji → kana → kanji, with romaji actively
> deprecated after kana fluency)

`defaultScriptMode` starts a Japanese learner at **kana**. Kanji is the rung
above. Asking for 私 while teaching わたし grades a rung the learner has not
reached.

### What it actually cost

Driven in a browser against the unfixed build, answering 私 with わたし:

> **Jawabannya “私”. Kita pelan-pelan lagi untuk kata ini.**

Wrong *and demoted*. The demotion is a `ReviewLog` row, and invariant 1 makes
`ReviewLog` append-only — so it is not a bad grade, it is an **uncorrectable**
one, and it lands in the retention rate §9 reports. That is the difference
between this and a cosmetic grading complaint.

### Three decisions in the fix

- **The romaji route is gated on kana being expected.** `romajiToKana('bank')`
  is ばんk; comparing *that* against an English answer could only ever make
  grading worse. The gate is "does the expected answer contain kana", which
  needs no language argument and so cannot be passed wrong.
- **Where kana is involved the distance is measured on one script.** タベマス
  against たべます is not five mistakes, and reading it as five would push a
  genuine near-miss out of tolerance on the strength of the script alone.
- **The headword stays first in the accepted list**, because it is the form the
  verdict shows. The learner types わたし and is then shown 私, which is
  teaching rather than merely grading. `makeCloze` slices the matched headword
  out of the sentence, so a cloze answer *is* the headword and the same reading
  applies; the free rung (L6) checks `usesWord` against every form, because a
  sentence written with わたし used the word.

### A test that was deleted rather than kept

The browser evidence above came from an e2e that seeded a due L5 card on a
kanji lexeme and answered it with the reading. It passed against the fix and
failed against the unfixed build with exactly the verdict quoted — and it was
**too racy to keep as a gate**: it depends on a whole language's content
importing and on what §2.8's interleaving puts ahead of the seeded card, and it
passed alone while failing behind the rest of the suite. Three attempts to pin
it down each moved the flake rather than removing it, including one where the
walk-to-the-card loop skipped the very card it was walking towards (a skip is a
deferral — invariant 23) and another where a generic `getByRole('textbox')`
answered it.

A gate that fails for reasons unrelated to what it guards teaches the next
reader to ignore it. So the wiring is covered by
`src/features/session/task.test.ts` instead — deterministic, with the anchor
fetch stubbed — and the browser run is recorded here and in the test's header,
where it is evidence rather than a flaky gate.

### One thing observed and not explained

While chasing that flake, a session twice planned two items and delivered one:
the progress read "1 dari 2" and the summary reported only the drill, so
`buildTask` must have returned `null` and the item was dropped with no trace —
the failure mode `task.ts` already documents for chunks. The obvious cause is
not it: **0 of 6,904 Japanese and 0 of 5,245 English lexemes** have an anchor
that fails to resolve in their own band's shard, measured. Recorded as an
observation, not a diagnosis.

### Retired by being used

`isKana`, `toHiragana` and `romajiToKana` now have callers outside their tests.
A dead-export scan that counts test files misses this class entirely, which is
how `furiganaFor` — §4.3's whole script ladder, and the next thing to look at —
is still waiting.

881 unit · 69 e2e.

## v1.21.0 — sync did not carry what three documents said it carried (2026-10-04)

Found by reading the acceptance criteria in SPEC §2 against the code that
claims them, rather than by using the app. Three defects, all in one function,
all of the same kind: something written down and not kept.

### The mnemonic that never left the phone it was typed on

§2.11's acceptance criterion is, in full: *"every kanji item renders its
component breakdown; **user-authored mnemonics persist and survive sync**."*
Three places in the repository restate it.

- `src/data/types.ts`, over `interface Mnemonic`: *"learner-edited mnemonics
  beat given ones, so they win on sync."*
- `src/data/repositories/mnemonics.ts` quotes the criterion verbatim, and names
  `authoredByUser` as *"the sync tiebreaker SPEC §2.11 asks for"*.
- The export bundle has carried `mnemonics` since M5.

A `Delta` carried the session, its review logs, its drill attempts and its
touched cards. It did not carry a mnemonic, and never had. There was no
tiebreaker to be, because nothing arrived to tie with.

What makes this the worst of the three is *why* §2.11 exists. The mnemonic is
the only content in this app the learner writes themselves, and it is asked for
because self-generated mnemonics are stronger than given ones — the generation
effect. Stranding it on one device is the single most damaging thing sync could
do to it, and the app shipped a settings screen inviting the learner to turn on
the feature that would do it.

### The heatmap that contradicted its own log

`DrillAttempt` rows travelled. The `CategoryScore` they produce did not — and
`recordDrillAnswer` is the only writer of contrastive state (invariant 15), so
a merge cannot rebuild one. The result on a second device: twenty answers sat
in its own append-only log while the §3.3 heatmap read `attempts: 0` off the
missing score row and rendered §2.15's honest-ignorance line —
*"belum cukup data"*, answer five more (invariant 16).

Invariant 18 exists to stop an unmeasured figure being drawn as zero. This was
the inverse and it is worse: a **measured** figure drawn as zero, and the
measurement was sitting in the same database.

### The window that dropped a session permanently

`pendingDeltas` selected sessions with `startedAt >= since`. Begin a session,
sync, come back and finish it, and the session is behind the cursor — forever,
because the cursor has moved on and `startedAt` never will.

This is not an exotic sequence. §2.13 persists `resumeCursor` after every
single answer *specifically* so a session survives being interrupted, and
`findResumable` will hand one back days later. Straddling a sync is the
ordinary case for anyone who syncs more than once.

Two things decided the fix:

- **It has to be `endedAt`, not "push it unfinished and replace it later."**
  The Worker does `ON CONFLICT(session_id) DO NOTHING`. A session gets exactly
  one push upstream, so it must be the finished one; a partial delta sent
  early would become the permanent record and the rest of the session would be
  lost on the server rather than merely delayed.
- **Rows read from the earliest session being pushed, not from `since`.**
  Fixing only the session query would have sent a straddling session carrying
  the reviews answered *after* the sync and not the ones before it — a session
  missing half its history, which is worse than a session that did not arrive.

### Three smaller things that came with it

- The cursor is taken **before** the read instead of `Date.now()` after the
  write, which had skipped anything written while the request was in flight.
- `localMnemonics` and `localScores` are **required** on `MergeInput`, not
  defaulted. A caller that forgot them would silently discard the learner's own
  text, which is precisely the bug being fixed, so the compiler asks instead.
  Making them required broke nine call sites, every one of them deliberately.
- `DELTA_VERSION` is 2, and a version 1 delta still reads. A second device that
  has not updated yet is a device whose review history is the one thing that
  cannot be recovered; refusing its session over two absent fields would trade
  a real loss for a cosmetic consistency.

### The consent sentence had to change too

The screen asked for *"riwayat latihanmu"* — your practice history — and until
this release that was exactly what left the phone. It now also carries free
text the learner typed. Widening the upload without widening the sentence that
asks permission for it would be the same defect in a different register, so
the screen names what travels, including what does not: no settings, no token.

### Falsified

All three were written as tests that read the pushed request body as `unknown`,
so they describe the wire and **fail at runtime** against the unfixed code
rather than failing to compile against it. Confirmed failing, then fixed:
864 unit tests from 854.

---

## v1.15.1 – v1.20.1 — nine releases recorded in DECISIONS and not here

Flagged while writing the entry above: this file stopped at v1.15.0 while the
app was at v1.20.1, and `CLAUDE.md` points a new reader here for "where things
stand". The reasoning for each of these is in `docs/DECISIONS.md` as D84–D93;
what was missing is the index. In order:

| Release | What it was |
|---|---|
| v1.15.1 | Sentence building was silently English-only — `tokenizeLatin` returns a Japanese sentence as one unbroken token, so the gate rejected every one of them. 0 → 1,521 buildable sentences at band 1. |
| docs | R9 filed: English anchor tokens resolve to a lexeme 95.8% of the time and Japanese 53.0%, because particles are not vocabulary. A learner who knows every Japanese word the app ships tops out at 53.9% mean coverage. Redefining a §2 criterion for one language is not a unilateral call. |
| v1.16.0 | `slippingSoon` — the words closest to being forgotten — had existed since M2 and was called by nothing. That is §1's whole thesis, invisible. |
| v1.17.0 | Shadowing did not exist, while §8, PROGRESS, the launch checklist and the README all said it did. The platform half and every line of its Indonesian were already written. |
| v1.18.0 | A backup silently lost every rebuilt sentence. |
| v1.18.1 | Two more tables were missing from it; a test now walks `db.tables` and fails unless each one is exported or named as generated. |
| v1.19.0 | Audio played over the top of the next card. `cancelSpeech` had existed since M4 and nothing called it. No unit test could catch it — the CI browser has no speech engine. |
| v1.19.1 | Sync states what it is about to upload (`deltaSize`, unused since M7), and seven exports that nothing read were deleted or wired up. |
| v1.19.2 | A refused import told the learner the file *"isn't a LinguaKu backup"* when it was one, from a newer version of the app. |
| v1.20.0 | A failed sync printed *"Gagal: HTTP 401"* to an Indonesian learner. Five classified failures, each naming its remedy. |
| v1.20.1 | The app claimed a reminder it had not set — `scheduleReminder` returns whether anything was actually scheduled and both callers discarded the boolean. |

The pattern across nine of the eleven is one thing: **a document asserting a
behaviour that no code performed.** Six were found by listing exported names
that appear only at their own declaration, two by using the app in a browser,
and one by reading an acceptance criterion against its implementation — which
is how the release above was found too.

## v1.15.0 — the variety half (2026-10-02)

v1.14.0 did the structure half of the brief and said plainly what it had not
done: *"the variety half — more kinds of exercise so that not every card
presents as 'a question' — is a larger piece of work and is not started."* This
is that.

### Picking one exercise rather than several

The temptation was to add three or four activities and call it variety. The
useful question turned out to be narrower: **what can the catalog not currently
ask for?**

Running down §8: recognition MCQ, meaning recall, cloze, dictation, listening
MCQ, minimal pairs, production, shadowing, the reader, kanji component build,
particle drills, error correction, free production. Thirteen exercises, all
implemented, and every single one of them asks for **a word** — pick it, type
it, recall it, hear it, use it.

None asks the learner to put words in the right **order**. And §3.1 names
exactly that as a *systematic* Indonesian-L1 error rather than a careless one:
Indonesian is head-initial, so *mobil merah* arrives as "a car red". The
authored contrastive drills cover `NP_WORD_ORDER` with a finite hand-written
set; the corpus can generate practice for it without limit.

So one exercise, chosen because it fills a real hole in the catalog rather than
because other apps have it — and it happens to be the one whose *interaction* is
also different, which is the surface complaint being answered.

### Where the budget came from

§7.2 reserves ~15% of a session for *"one input activity"*, and that reservation
has spilled into reviews on **every session this app has ever composed** —
because the input activity §7.2 names is the reader, which is a screen of its
own that a learner opens deliberately. Sentence building is an in-session input
activity, so it takes two thirds of that share and the rest keeps spilling.
Nothing was taken from reviews, new items or drills.

### The four decisions that stop it being word salad

**Anchors, not the full sentence shards.** Anchors are precached with the
starter bands, so this costs a learner nothing extra on a metered connection
(D80) — and they are the sentences the band is already taught through.

**80% of the sentence must already be known.** Reassembling words you have never
met is a jigsaw puzzle, not a language exercise.

**A decoy is never a word that is already in the sentence.** That one is a trap
rather than a preference: a decoy appearing in the answer creates a second,
equally correct arrangement, and the grader would then mark a right answer
wrong — the §2.7 failure, manufactured by the exercise itself.

**Case and punctuation are not graded.** The learner was handed the tiles. They
never chose the capital letter, so they cannot be marked wrong for it.

### The defect it introduced, and where it was caught

`buildCandidates` runs inside `planSession` and loads a content shard.
`loadAnchors` throws when the shard is absent — offline before that band was
cached, or any fetch failure at all — and that took **the entire session plan**
down with it. An optional extra that can stop a session being planned is worse
than no extra.

Caught by the unit suite, which has no base URL to fetch from, so every throttle
test went red at once. It would have reached a learner as a session that simply
refused to start, on the exact device §5.4 is written about.

### A trap avoided twice now

The a11y scan runs on a brand-new profile, and a build puzzle needs a learner
with a vocabulary — so the card would have shipped **never having been scanned**,
which is precisely the state the reader was in before v1.10.0. It has its own
scan now. The first version of that scan also got stuck, because it could not
drive past a typed card; the walk is shared with the session test rather than
duplicated, since the duplicate is what diverged.

### Still open

The grammar axis now draws on both the authored drills and these attempts, which
is what §4.2's third dimension is for. What has not been attempted is a
*matching* activity, or anything that would make the app's **Japanese** side feel
as varied — sentence building works there (particles and verb-final order are
exactly the right thing to drill) but the Japanese corpus has no anchor coverage
to speak of at the bands a beginner is in.

---

## v1.14.0 — making the curriculum visible (2026-10-02)

The brief was blunt and fair: *"just questions all the time is boring and
unstructured"*, with Duolingo named as the reference.

### The conflict, and what to do with it

SPEC §1 lists among its non-goals *"not a course/curriculum player with fixed
lesson order"* and *"not gamified with loss-aversion mechanics"*, and the product
thesis is written explicitly against apps *"optimized for engagement metrics
rather than retention curves"*. Duolingo is this spec's anti-reference, by name
and by argument.

But the complaint underneath it is correct, and it is not a complaint about
ordering. **The app has had a curriculum since M1** — frequency order, strictly
applied, and defensible — and a learner has never once been able to see it. An
honest curriculum that is invisible is indistinguishable from no curriculum at
all. "Unstructured" is an accurate description of the *experience*, even though
it is a false description of the *system*.

So: build the structure, skip the mechanics §1 bans. That turned out to be the
better product anyway, because the honest version has a stronger number in it
than any invented level would.

### The number that made it work

The pipeline has published this since M1 and nothing had ever shown it to a
learner: **band 1 is 481 words, and those 481 words are 70.3% of all tokens in
the corpus.** Through band 5 it is 87.3%, which is the teachable ceiling.

That is a far better motivator than a level badge, and it has the property a
level badge can never have: it is true. "Finish this stage and you will know
seven words in every ten you meet" is a fact about English, not a claim about
the learner — which is exactly the claim invariant 9 forbids and the reason
there is no CEFR or JLPT label anywhere in this app.

Nothing on the path unlocks, gates or expires. The composer still works across
bands as it always has. A stage is a position, not a door, and §1's ban on fixed
lesson order is untouched.

### Two things that decide whether it is honest

**Partial stages count toward the headline figure.** A learner three-quarters of
the way through band 1 has not covered zero percent of English. Crediting only
completed bands would be defensible arithmetic and would make a true number read
as a lie, so each band is credited in proportion to how much of it is secured —
the same way `estimateCoverage` reads the same data two sections further down
the screen. Two figures for one learner, computed two ways, is how a progress
screen stops being believed.

**The scale comes from the manifest, not from IndexedDB.** Found by looking at
the screen rather than by a test: the first version built its stages from local
items, and only the starter bands are imported (invariant 11). So it showed a
learner three stages out of five and told them the app tops out at 82% when it
teaches 87.3% — understating both the journey and the ceiling, on the one screen
whose whole job is to state the journey accurately.

### What this is not, yet

This is the *structure* half of the brief. The *variety* half — more kinds of
exercise, the sentence-building and matching activities these apps use to stop
every card feeling identical — is a larger piece of work with its own content
requirements, and it is not started. The ladder already has seven rungs and the
catalog is complete per §8; the problem is that they all present as "a question",
which is a different problem from having too few of them.

---

## v1.13.0 — the half of §5.4 that was never built (2026-09-20)

Asked to develop the app further with no brief, so the work was choosing what
to build. Three candidates were checked against the code before anything was
written, and two of them turned out to be done already.

**Leeches** (§7.2) are fully handled: a lapse threshold, demotion, re-teaching
with a *fresh* sentence rather than the one that failed, a feedback line and a
glossary badge. **Metacognitive calibration** (§2.12) is collected as the
confidence tap and reported on the progress screen. Neither needed anything.

**Metered connections did not exist in the codebase at all** — one comment in
`index.css` referencing §5.4 and nothing else. That is the gap.

### Why it matters more than it sounds

§5.4's reference device is *"Indonesian mid-range Android on mobile data"*, and
the architecture has taken that seriously since M2: §5.3 budgets a beginner's
first download at 8 MB, and D20 explicitly defers the large shards so that *"a
learner who never opens the reader never pays for them"*.

So the deferral was right. What was never built is the other half of the
sentence — telling the learner when they *are* about to pay.

Measured from the manifest the pipeline already publishes: the first tap of
**Baca** fetches its band's sentence and passage shards, **415 KB gzipped** for
an English learner at band 2 and **479 KB** for a Japanese one. On a prepaid
Indonesian plan that is money, spent silently, on a screen the learner may have
opened out of curiosity.

### The three decisions that make it honest rather than just cautious

A warning that fires too often is worse than none, so most of the work was in
deciding when *not* to ask.

**A shard already in the cache is never charged for.** The gate asks
`caches.match` before it asks the learner. Someone who downloaded this band last
week already owns it, and warning them about a cost that no longer exists would
be a false alarm dressed up as care.

**Practice is never gated.** Only the reader is. The session's content is
precached, so a learner who says no still studies exactly as before — and the
gate's own copy says that, because a learner who thinks declining will break
their practice will not decline.

**Unknown connectivity does not hold back, and this is the load-bearing one.**
Only Chromium implements the Network Information API; Firefox and Safari report
nothing. Treating silence as "probably metered" would withhold the reader from
most desktop learners and every iPhone on Wi-Fi, on no evidence whatsoever.
Withholding what someone expected, on a guess, is a worse failure than the
download — and anyone who disagrees can set *"always ask"*.

The figure shown is `gzipBytes`, not `bytes`. Quoting the raw size would
overstate the cost by roughly four times, which is its own kind of dishonesty.

### Two things the visual pass caught

Neither would have failed a test. The gate's "download" button and the footer's
"Kembali" were both full-width teal primaries, so the screen offered the learner
two things that looked equally like the answer; navigation is quiet while a
decision is on screen and primary again once it is gone. And the screen-reader
hint explaining the arrow keys for tap-to-gloss was still announced while the
gate was up, on a screen with no words to move between.

### Left open

The session summary could point at the reader when the day's allowance is spent
— an honest "there is more if you want it" that does not become a streak. It was
scoped out rather than rushed in beside a feature it has nothing to do with.

---

## v1.12.1 — the bug v1.12.0 left open (2026-09-20)

v1.12.0 closed by naming this and deliberately not fixing it, because it was
adjacent to the work rather than part of it. Fixed now.

**What was wrong.** Three builders feed a session queue. `newCandidates` scoped
by the `[lang+kind]` index; `drillCandidates` scoped throughout; `dueCandidates`
did not scope at all. So every *review* in an English session was drawn from the
whole profile, and a learner who had studied both languages could be handed
Japanese kanji under a heading that said they were studying English.

The interesting part is that the invariant was already written down. `Session`
gained a `lang` field at v1.0.1 for exactly this reason — resuming a session
under a different target served the wrong language — and sessions written before
that field are still never resumed because of it. The field recorded the
intention; nothing enforced it one layer down.

**Reading a card's language.** Cards are keyed `profileId::itemId` and carry no
language. Rather than a second round trip per card to fetch its item,
`langOfItemId` reads the namespace every item id already carries — the inverse
of `lexemeIdFor`, which has been constructing those ids since M1.

**Where the filter goes is the actual fix.** `dueCards` pages at 200 rows. Doing
the filter after that page is fetched would be worse than useless for the
learner this bug is about: a large Japanese backlog would occupy all 200 rows
and their English session would come back looking empty. The predicate therefore
runs inside the query, before the limit.

**A test that passed against the bug.** The first version of the crowding test
seeded 250 Japanese cards and one English card, all with the same due time, and
passed whether or not the fix was present — `p1::en:lex:survivor` sorts before
`p1::ja:...`, so the English card landed inside the first 200 rows for free. It
now backdates the Japanese cards by a week so they genuinely fill the page.
Worth recording because the test looked correct and asserted the right thing;
only running it against the unfixed code showed it was measuring nothing.

All three tests in the new suite were checked that way, and two of the three
needed nothing — but the one that did would have shipped as false assurance.

---

## v1.12.0 — flashcards, and the pacing underneath them (2026-09-20)

The ask was flashcards you tap or swipe through to learn new words every day,
structured the way an SRS normally handles new material. The gesture was the
visible half. The half that changes what a learner experiences was underneath.

### What was actually missing

The app has had FSRS, a seven-rung ladder and a review-debt throttle since M5.
So "add spaced repetition" was already done. The gap was narrower and worse:

§7.2 calls review debt *"the #1 cause of abandonment in SRS apps"* and requires
the throttle to be automatic. `newItemAllowance` has implemented that since M5
and it works. But it is a **brake**, not a speed limit. It is computed per
*session*, from a seven-day forecast, and a forecast cannot move until cards
exist and their due dates have spread — days after the evening that caused the
problem. A learner running five sessions in one evening passed it five times.

Measuring it was the moment the size of this became clear: **a fresh 4-minute
learner's very first session queued 30 new words**, against a review capacity of
20 a day. Thirty first exposures, each of which comes back several times over
the following fortnight. The backlog is bought on day one and delivered on day
four, and §7.2 says exactly what happens then.

### The cap, and the cost of it

`dailyNewWords` caps introductions per local day. Counting them needed nothing
new: `recordReview` already queries a card's history to compute promotion, so it
knows when an answer is an item's first and records that on the log row. No
migration, no scan, and rows written before this release read correctly as "not
an introduction" because the counter only ever asks about today.

The default is `dailyCapacityFor(minutes) / 4` rather than a fresh constant —
one source of truth, so the two halves of §7.2 cannot drift apart. That gives
**5 / 10 / 19** new words a day for the three session lengths.

**The cost is real and it is stated rather than buried.** A learner with no
cards has nothing to review, so their first sessions are now exactly one day's
allowance — five items, not thirty. The old behaviour *looked* more generous and
was the thing that would have made them quit in a fortnight. The home screen
names the number before they start, and anyone who wants more can say so.

Two existing tests failed on this, and both were asserting session length as an
incidental proxy — *"more than 5 items"* — for things that were actually about
something else (that a queue gets filled; that declining a word costs nothing).
They now measure what they were about. Worth flagging plainly: I changed the
expectations of tests that were passing, and the reason is that the number they
encoded was only true because the app was over-introducing.

### The gesture

`SwipeCard`. Right takes the word, left declines it, and the answered card
swipes on. Three rules keep it from becoming a second way for things to go
wrong: every swipe is also a button and the gesture is invisible to assistive
technology; it only attaches to cards whose primary action was already a tap,
because on a typed rung a horizontal drag fights the learner for text selection;
and it commits through the same latch a tap does, so one swipe is one review.

The drag decides its axis after 10px and then holds it — without that the page
cannot be scrolled from anywhere on a card, which is the failure that makes
swipe UIs feel broken. It resists a pull towards a side with nothing on it, and
under `prefers-reduced-motion` it does not transform at all while still
committing.

### Three defects found by building it

None of these were the feature. All three were found by using it.

**Settings could persist out of order.** Every change started its own
read-then-write chain, so two in flight raced and the row kept whichever
*finished* last rather than whichever was asked for last. Stepping a control
five times quickly saved the fourth value. Found because a Playwright test
reloaded the page faster than a human would — which is a real learner killing
the app right after a tap.

**A stepper lost taps**, because each one waited for a write and a re-render
before the next could count from the right base. My first fix moved the
arithmetic into a state updater, which traded the race for a worse bug: the
updater called `onChange`, and React is free to run an updater more than once.
The value now lives in a ref, which is synchronous.

**A swiped card scrolled the page sideways** — 464px of document in a 375px
viewport. `Screen` clips horizontally now, with `clip` rather than `hidden`,
because `hidden` creates a scroll container and would have silently broken the
sticky footer directly above it.

### Left open

`dueCandidates` pulls due cards for the whole profile rather than the language
being studied, so a learner who has studied both can get Japanese cards inside
an English session. `todaySnapshot` deliberately counts the same way so the home
screen cannot disagree with the session it launches; both should be scoped
together when it is fixed.

---

## v1.11.1 — retiring the answered card (2026-08-19)

v1.11.0 stopped the duplicate reviews with two latches and explicitly left the
layout as it was, flagging it as the larger change. This is that change.

**The layout was the actual cause.** The verdict rendered in the footer while
the live card stayed mounted above it, so every control that produced the answer
was still on screen and still wired up. The latch refused the second answer;
nothing stopped it being *offered*. Replacing the card removes the offer, which
is the difference between a rule and a structure — and this codebase's whole
argument is that the structural version is the one that survives.

**What the retired card keeps, and why.** The sentence, with the answer filled
into the blank and chipped; the translation; and the learner's own answer where
it differed from the correct one. Dropping the content and showing only the
verdict would have been simpler and worse: *"Jawabannya 'A'"* is close to
meaningless without *"He got an ___"* beside it, and a learner who answered
wrongly needs to see what they wrote next to what was wanted.

**Not dimmed, deliberately.** The reflex for "this is finished" is reduced
opacity, and opacity on text is precisely the failure the dark-mode gate found
54 instances of one release ago — a shade that clears AA at full strength does
not at 60%. It retires by losing its controls and by saying *"Soal tadi"*, at
full contrast, which is legible to someone who cannot perceive the styling at
all.

**A gap fell out of it.** With the retired card shorter than the live one, the
`flex-1` main column pushed the sticky footer down and left a dead band between
a card and the verdict about it — and the verdict was inside its own
`max-h-[60vh]` scroller, nested in a page that also scrolled. Both went: the
answered state is one column in the page, and the footer carries only *"Lanjut"*.
That is what §10 asks for anyway — the thumb zone is for the thing you press,
not for a scrollable panel of prose.

Verified by hand in both themes at mobile width, with a short verdict (correct,
promoted) and a long one (wrong, demoted, with a contrastive note attached).

---

## v1.11.0 — two reports from using it, and what was under them (2026-08-19)

Both of this release's items came from the owner using the app rather than from
a gate, which is worth noting on its own: eleven releases of CI and the two
defects that a person found in one sitting were a **permanent data corruption**
and a rung whose prompt could not be answered.

### The double-write

The report was that buttons could be spammed. The mechanism is that every write
in the session is an `async` handler and none of them was latched, and there are
two distinct ways to click twice — which matters, because the obvious fix only
addresses one.

*Racing* is two clicks inside one `await`. Eight taps on "Oke, paham" wrote
**eight** review rows. *Sequentially* is a second click after the verdict is
already up, which is possible because the feedback renders in the **footer**
while the card stays mounted above it — every control that produced the answer
is still there. An in-flight latch does nothing about the second case; the two
clicks are seconds apart.

**Why this is not a cosmetic bug.** `ReviewLog` is append-only, enforced at the
Dexie hook, and that is deliberate: invariant 1 exists so the log can be trusted
as the substrate for FSRS optimisation and for §9's retention rate. The same
property means a duplicated row **cannot be corrected**. Every spare tap a
learner made on a slow phone is permanently in the data the app uses to tell
them how well they are doing.

The race is held with a **ref** rather than state, because `setState` is
asynchronous and two clicks in one tick would both read the old value — a state
flag would have looked like a fix and not been one.

**Both gates were falsified before being trusted.** Reverting each fix and
re-running gives 8 rows instead of 1, and 5 instead of 3. A gate that has never
failed has not been tested.

### The missing meaning

The report was that the translation of the word sometimes does not show. Three
separate things were true.

**It was fetched for one rung out of seven.** `glossFor` sat inside the
`exposure` branch, so every other rung carried no gloss at all — even where the
app had one on disk.

**L5 was unanswerable as written.** §2.3 defines it as "ID → target, produced":
the prompt should be the *meaning* and the learner produces the word. It was
showing the *sentence* translation while grading a single headword. A learner
reading *"Dia mendapat nilai A."* and asked for the English had to produce
**"a"**, with nothing marking which word was wanted. This is the kind of defect
that survives eleven milestones of CI because nothing about it is a type error,
a failing assertion, or a crash — the screen renders perfectly and the exercise
is impossible.

**The empty case rendered as nothing.** Coverage is 30% and 4% (D59), so the
absent branch is the *common* one, and a blank space where a meaning should be
is indistinguishable from a bug. The reader has said this out loud since
v1.7.0; the session was the surface that stayed silent. That silence is what the
report was actually describing.

The gloss now resolves once per task for every kind — `glossFor` caches per
band, so it costs one shard read per band rather than one per card — and appears
at L0, as L5's prompt, and in the feedback on **every** card, which is the one
place it is both useful everywhere and incapable of leaking an answer.

### The compliment nobody earned

L0 submitted the headword as its own answer so that it would grade "correct",
which meant a card that asked nothing printed "Benar!" and then waited for a
second tap. It advances on the one tap now. The review is still recorded —
invariant 0 is satisfied because the confirmation *is* the response — and
promotions are reported in the summary, which is where §2.14 wants them.

### Left open

Nothing from this work. The three v2.0.0 gates are unchanged and all belong to a
person.

---

## v1.10.1 — two of the four gates, worked as far as they go (2026-08-19)

v1.9.0 named four things standing between this app and v2.0.0, and said all four
belong to a person. That is still true of three of them. The fourth turned out
to be a decision the owner could make in one word, and once made, it was mine to
carry out.

### Sync: deployed

The choice was deploy or delete, and the answer was deploy. What made this worth
doing rather than deferring is that `workers/sync/` had **never been executed**
— its own README said *"The Worker itself has never been deployed or run"*, and
a Worker that has never run is not a feature, it is a hypothesis.

Running it found two errors in the procedure the README documented: `d1 execute`
needs `--config` when invoked from the repo root, and `d1 create` prints a
suggested binding named after the database, which is **not** the `DB` binding
`index.ts` actually reads. Both would have stopped whoever followed those steps
next.

**The verification that mattered was that it grants nothing.** `SYNC_TOKEN` is
unset on purpose, and the Worker is written to fail closed on exactly that —
`!env.SYNC_TOKEN` is the first half of the auth check. Fourteen consecutive
unauthenticated requests answered 401. The endpoint exists; the secret is the
owner's to set, and I did not set it, because a bearer token that has been
through a transcript is not a secret.

**A thing worth knowing for the next deploy:** for the first few minutes,
`workers.dev` returned intermittent Cloudflare `error code: 1042` pages with a
404 status, mixed in with correct 401s from the Worker. That is the edge and not
the code — the Worker's own 404 body is `{"error":"not found"}` — and reading it
as a bug in the routing would have cost an hour. It settled inside three
minutes.

**Invariant 21 was re-run rather than reasoned about.** The e2e test that drives
a full session and asserts zero requests leave the origin still passes. That was
the expected result — nothing in `src/` imports the client — but "the invariant
says so" is exactly the kind of confidence this project keeps finding to be
misplaced.

### R7: the index moved, and it still does not help

R7 recorded on 2026-08-13 that Japanese had no voice in the official Piper set:
173 voices, 54 language codes, no `ja_JP`. Re-measuring found **174 voices and
55 codes** — and a Japanese one, filed under **`ja_JA`**. The register's own
method had gone stale in five days, and the reason a search kept coming back
empty was a non-standard region code rather than an absent voice.

The voice is NICT's Hi-Fi-Captain, **CC BY-NC-SA 4.0**, and the NC disqualifies
it under the rule R7 already wrote down. So the answer did not change; only the
reason did, and the reason is worth having written down, because the next person
to grep for `ja_JP` will also find nothing.

The three remaining paths are in the register as a table. The short version is
that there is **no Japanese voice that is both ready-made and unconditionally
free**: the one that clears the non-commercial bar is a conditional grant
attached to someone's mascot character and needs a forked generator, and the one
with a genuinely clean licence (Common Voice, CC0) has no model behind it yet.
Nothing was promoted. R7 says reading and dating is the owner's step, and that
is still the right place for it.

### The copy packet

The third gate needed neither hardware nor a licence — only a native speaker and
a legible list. All 349 strings, grouped by the screen they appear on, with the
three tone rules from `id.ts`'s own docblock as the review criteria.

### What is left

Three gates, all of them a person's: the voice licence, four empty rows in the
device matrix, and someone reading 349 lines of Indonesian. None of them is code,
and none of them can be honestly closed by the thing that writes the code.

---

## v1.10.0 — the tab stops, and what dark mode had been hiding (2026-08-19)

v1.9.1 closed with one item under **Left open**: every word in the reader is a
focusable button, two passages add ~160 tab stops before the feed, and fixing it
"means a different interaction model for tap-to-gloss, which is a design
decision rather than a patch". That was true, and the decision is D70.

### The interaction model

The alternative to a button per word is not "fewer buttons" — a learner has to
be able to reach *any* word, because the one they do not know is the one they
will tap. So the words stay, and the *tab order* changes: a passage or a
sentence is one composite widget, Tab enters and leaves it, and Left/Right and
Home/End move inside. This is the WAI-ARIA roving tabindex pattern, and it is
what a text editor, a toolbar and a date picker all do for the same reason.

Two details were decisions rather than defaults. **Arrows clamp** instead of
wrapping, because prose is a line and not a ring — arriving back at the first
word of a paragraph reads as a bug to someone who cannot see the whole block.
And a **click sets the entry point**, so tabbing back into a block returns the
learner to the word they were last at rather than to the start of the paragraph.

**The gate asserts both halves.** Counting tab stops alone would pass if the
words stopped being reachable at all, which would be a worse §10 failure than
the one being fixed — so the test also asserts that 100+ words are still there
and that ArrowRight moves between them and Enter opens the panel.

### What the two new scans found, which is the part worth reading

Both new gates found real defects on their first run. That is now four releases
in a row where the gate found something the code review did not.

**Dark mode had never been scanned at all.** §10 promises "dark mode, WCAG AA
contrast" as a single clause, and every axe run since v1.8.0 ran in light mode —
so exactly half of that promise had been resting on care since M0. The tertiary
text shade measured **4.23:1** on the page background, below the 4.5 floor, in
**54 places across 15 files**. Every screen with secondary text was affected.

The fix costs something and the cost is worth naming: raising that shade
collapses it into the secondary one, so dark mode now has one fewer step of type
hierarchy than light mode has. The third grey was not AA, and AA is what §10
promises; the hierarchy was not promised.

**Scanning the reader empty was scanning the wrong thing.** The existing sweep
reached the reader before the learner had any vocabulary, so axe had only ever
seen *"Belum ada bacaan yang pas"* — never a passage, never the feed, never the
word panel, which are the parts carrying roles. Seeded with vocabulary, it found
`text-stone-500` at **4.38:1** inside the tinted word panel. That shade clears
AA at 4.60:1 on the page background: it was correct where it was written and
wrong where it was reused, which is precisely the defect a person re-reading the
CSS would not catch.

### Running it on a second platform, which found two more

The device matrix has had one row since v1.5.1, and the app collects rows
itself. Running that on this machine was meant to fill the empty "Chrome,
desktop" row. It did not — the browser is Chromium inside an Electron host, so
the row is filed under its own name and the desktop row is still empty. Writing
"Chrome, desktop" and meaning something else is the one thing that table cannot
survive.

**The report named the wrong operating system.** `Android/OS <version>` was
printed unconditionally — the label was a constant, because the matrix is about
Android phones. This machine reported *"Android/OS 26.5.0"*. An iPhone would
have reported Android. The whole purpose of that screen is to produce rows a
person can trust without re-deriving them, and the platform has been available
as a free client hint the entire time.

**The boot probe never answered while the page was hidden.** The home screen sat
on *"Mengecek suara di HP ini…"* for 25 s and counting, then resolved correctly
the moment the page was looked at. `requestIdleCallback` does not run for a
hidden page and its `timeout` only counts while visible — so the comment in
`idle()` claiming "the timeout is a ceiling, not a target" was wrong in the one
case it existed for. Deferring until visible **stays**: the ~15 s first-call
stall on a device with no speech service is why the probe waits at all, and a
hidden page is not the moment to spend it. What changed is that the wait is now
bounded once the learner is actually there.

### Left open

Nothing new. The four things standing between this and v2.0.0 are the same four
v1.9.0 named, and every one of them is a decision or a measurement that belongs
to a person: the voice model's licence (R7), the four empty matrix rows, the
native-speaker pass over the Indonesian, and sync deployed or deleted. This
release deliberately moved none of them, because moving them without the person
is the one failure mode this project has been built to avoid.

---

## v1.9.1 — the review pass (2026-08-18)

Nine releases went onto this branch in one sitting with no independent review.
Every bug caught during that sitting was caught by a *gate* — the licence gate
found a dataset the app never used, the offline gate found a cache one shard
from evicting content, the chunk compiler found its own matcher rejecting real
phrases. None was found by reading the code, so the code got read.

Four defects, three of them invisible: nothing crashed, no test failed, and a
learner would simply have received less than the release notes promised.

**A fifth of the chunks were never shown.** The pipeline picks anchors from the
whole corpus; the runtime resolved them against `anchors.b<band>.json`, the
curated subset a band's vocabulary is taught through (D19). 15 of 70 English
chunks and 5 of 17 Japanese resolved nothing, `buildTask` returned null, and
`SessionScreen` skipped them — the composer scheduled the item, it took a slot
in the queue, and the learner never saw it. The fix carries the sentences in the
shard: ~20 KB to delete a class of lookup failure.

**Japanese answers ending in ん were graded wrong.** `KanaInput` committed the
conversion and called a zero-argument `onSubmit` in the same tick, so the caller
submitted its pre-conversion state: `nihon` + Enter arrived as `にほn`, which
grades *wrong* rather than near-miss. A correct answer marked wrong, on the exact
rung §2.7 was written to protect.

**The pipeline never pruned.** `chunks.b6.json` survived a re-banding because
the manifest was only ever appended to — shipping duplicate content at a dead
band, and making the output depend on what was there before.

**Mining was missing from passages**, the surface the reader now shows first,
guarded against a field (`fromSentenceId`) that nothing reads.

### Left open

Every word in the reader is a focusable button, so two passages add ~160 tab
stops before the feed. The pattern predates this branch and passages amplify it;
fixing it properly means a different interaction model for tap-to-gloss, which
is a design decision rather than a patch.

---

## v1.9.0 — the deploy audit (2026-08-18)

v1.9.0 was defined as the honest close: absorb what the device matrix reports,
integrate the native copy pass, re-measure the launch checklist. Two of those
three are gated on a person. The third was mine, and doing it properly meant
auditing what the deploy actually ships — which found two live defects in the
offline promise.

### The runtime cache was one shard from evicting content

`maxEntries: 64`, set at M2 when the app shipped 47 content files. Glosses,
chunks, topics and passages took it to **65**. Workbox evicts least-recently-used
entries past the cap, so a learner who worked in both languages was one fetch
away from losing a shard they had already downloaded — and the symptom is
content that mysteriously will not open, offline, later.

Nothing else would have caught it. It is not a type error, no test exercised it,
and the number was correct when it was written.

### Audio would not have been cached at all

Every runtime rule matched `.json`. The clips the owner is about to generate
would have matched none of them — fetched on every play, absent offline, which
is the one situation they exist for (§5.4 promises offline audio for cached
bands, explicitly). They have their own cache now, with `rangeRequests`, because
an `<audio>` element issues Range requests, Safari always does, and a cached
clip answering one with a 200 will not play.

Both were found by **writing the gate**, not by reading the code — which is the
argument for the gate.

### `check:offline`

Asserts against `dist/sw.js` rather than `vite.config.ts` (D69): the built
worker is what ships. It reads the cap per cache name, because the largest
number in the file is the audio cache, and taking that would let the content
cache silently shrink below the shard count again.

### The checklist

Every number in `docs/LAUNCH-CHECKLIST.md` is from the run that wrote it. The
one worth noting: **icon tap → first answerable question is 103 ms** against a
3 s budget, down from 1.4 s at v1.0.0 — the cold-start test now prints the
figure so headroom is visible before it becomes a failure rather than after.

The manual section gained a step that exists because of what was just fixed:
open the reader before going offline. Content fetched at runtime is the half of
the offline promise a precache cannot keep, and it is the half that was broken.

### What v2.0.0 is waiting for

Nothing in code. Audio shipped, the matrix filled, the Indonesian reviewed by a
native speaker, sync deployed or deleted — four decisions, all of them yours.
The v1 line is closed.

---

## v1.8.0 — accessibility, gated (2026-08-13)

§10 has promised WCAG AA contrast, `motion-safe:` on every transition, 56px tap
targets and *"full keyboard operation on desktop"* since M0. §13 listed CI gates
for the bundle, the licences, the cold start and installability — and for none
of that. Four promises, held up by care alone, for eleven milestones.

**The first run found a real one.** The JSON restore control is a styled button
in front of a visually hidden file input; a screen reader met an **unlabelled
file field**, critical severity, on the single screen where a learner hands over
their entire history. Fixed, and it is the kind of defect that only a gate
finds — nothing about it is visible to someone looking at the screen.

**The keyboard is checked by using it** (D68). axe cannot observe "full keyboard
operation", so that test drives the app with nothing but Tab and Enter, from the
home screen into a session and through an answer, with no clicks and no test ids
reached past the UI. Reduced motion is checked by asking the browser for the
preference and asserting nothing declares a transition.

**axe is a floor, not a verdict**, and the spec comment says so: it catches
contrast, names, roles and labels, and it cannot tell whether a screen makes
sense to a person.

### Still ahead

| | | |
|---|---|---|
| **v1.9.0** | The honest close | Whatever the device matrix reports, the native copy pass integrated, the launch checklist re-measured. The last v1. |
| **v2.0.0** | — | Gated on decisions and hardware rather than code: audio shipped, the matrix filled, the Indonesian reviewed by a native speaker, sync deployed or deleted. |

---

## v1.7.0 — the glossary (2026-08-13)

Named at v1.6.0 as the obvious next thing and left rather than rushed; built
now. SPEC §2.2 permits exactly one kind of browsing — *"a passive glossary is
fine, but it does not create or advance cards"* — and the app had the ban
without the permission.

**Why it is worth a release.** The progress screen has been able to *count* a
learner's vocabulary since M5 and never able to *show* it. §2.14 asks progress
to be expressed as capability; a number is a claim about capability, a list you
can scroll through is the thing itself.

**The second half of §2.2's sentence is the design** (D67). `buildGlossary`
opens no transaction, calls no writer, and has no path to `recordReview` — the
only function permitted to move FSRS state (invariant 0). The test that matters
builds the glossary against a timestamp thirty days later and asserts the card
is byte-identical afterwards: looking at your own vocabulary must not schedule
it.

Ordered strongest first, which is a §2.14 decision rather than a technical one.
Opening it shows what a learner has secured, not what they are currently
failing.

### The plan from here

| | | |
|---|---|---|
| **v1.8.0** | Reachable | §10 promises WCAG AA, reduced motion and *"full keyboard operation on desktop"*; §13 gates none of it. An axe-core run and a keyboard-traversal test in CI, plus whatever they find. |
| **v1.9.0** | The honest close | Whatever the device matrix reports, the native copy pass integrated, the launch checklist re-measured against real numbers. The last v1. |
| **v2.0.0** | — | Gated on decisions rather than code: audio shipped, the matrix filled, the Indonesian reviewed by a native speaker, sync deployed or deleted. The first release whose every claim has been checked by a person on real hardware. |

---

## v1.6.0 — learning material, and the screen that had run out of room (2026-08-13)

Two §2 requirements had been typed and empty since M0. Both now have content
behind them, and both were built the same way: authored by a person, then held
to the corpus by a compiler that fails the build.

### §2.5 — chunks

73 English and 23 Japanese collocations and formulas. The design question was
authored versus mined, and mining lost on quality: Tatoeba is saturated with
`tom said`, PMI cannot tell a collocation from a frequent accident, and D34
already records that this pipeline has no part-of-speech tags to filter with.
The output would have been teaching material nobody had read.

So the corpus **validates** instead of generating (D64): every chunk must occur
in a sentence the app actually ships, or the build fails — §2.5's own ingestion
rule, the one that rejected 2,185 lexemes at M1.

**The gate immediately found two bugs in itself, which is the useful part.**
Seventeen chunks failed on the first run, and the cause was the matcher rather
than the corpus: English inflects, so the corpus holds *"took a shower"* and not
the base form; and separable phrasal verbs appear as *"drop me off"*. Fixing
both recovered a third of the list. What stayed rejected — *get dressed*, *take
it easy*, 「ただいま」 — genuinely is not in a 23,497-pair corpus, and was deleted
rather than shipped without an example.

A chunk carries its own Indonesian meaning, because its parts do not compose,
and counts as its own card type so two cannot land back to back (§2.8).

### §2.10 and §2.14 — topics

Twelve English topics, seven Japanese, picked in settings. This closes the last
promise §2.14 was making without a control: *"the learner picks topic clusters"*.

**It reorders, never restricts** (D65) — a learner who picks "food" still needs
the function words that make a sentence, and filtering to a topic would starve
them of exactly those. The map is partial (6.9% of the English inventory, 2.0%
of the Japanese) and says so in the shard, because a wrong topic is worse than
no topic when topics steer what gets taught next.

It also makes §2.8's second rule real for the first time. *"Never more than 3
from the same topic cluster"* has been running against the frequency band since
M2, which made it a restatement of the band gate; three food words in a row is
now something the composer can actually see.

The compiler caught three authoring errors on the first run, including a
Cyrillic word that had slipped into the Japanese list — which is the argument
for having it.

### The home screen

Seven links had accumulated between the learner and the practise button, each
one shipped for a good reason (D66). Habit, sync, diagnostics and attribution
are now behind one settings screen, which is where the topic picker lives too.
The e2e suite goes through the same door a learner does rather than reaching
past the UI, which is why four specs changed.

### Not built, and worth naming

A **browsable glossary** — §2.2 explicitly permits one ("a passive glossary is
fine, but it does not create or advance cards") and there is still no screen
where a learner can look at what they know. The progress screen counts it; it
cannot show it. That is the obvious next thing here and it was left rather than
rushed alongside two content pipelines.

---

## M8–M11 — the v1.2.0–v1.5.0 roadmap, executed in one pass (2026-08-12)

`docs/ROADMAP.md` planned four releases. This entry records what actually
landed, what the measurements changed, and the two items that are **not built**
— named here rather than left to be discovered.

| | planned | actual |
|---|---|---|
| unit tests | — | **724** (from 653) |
| e2e tests | — | **45** (from 41) |
| initial JS, gzipped | ≤ 200 KB | **136.2 KB** (68%) |
| datasets cleared | — | **9** (from 7) |
| §8 exercise catalog | all | complete — the error-correction drill was the last one |
| radar axes measured | 5 | **4 of 5**; listening and reading stopped being `null` |

### M8 · Audio, and the device we have never seen

**The device matrix is now something anyone with a phone can fill.** It has been
empty since M4 for a mundane reason — the person with the hardware is not the
person with the debugger — so the probes moved into the app:
`src/features/settings/DiagnosticsScreen.tsx` runs them on demand and emits
markdown that pastes straight into Part 3 of `docs/DECISIONS.md`.

Two things make it more than a convenience:

**It probes from inside a tap, and a good answer counts** (D57). D29 recorded
that the boot probe marks iOS Safari dead where audio would have worked, because
iOS wants a user gesture and neither boot nor first paint is one. A button *is*
one. `adoptVerdict` takes up that answer for the session — but only upward
(a later failure never retracts an engine already heard to speak) and only
inside the app's own 500 ms deadline, so a slow engine is reported honestly and
still withheld from L4.

**It measures rather than judges.** The diagnostic probe runs to a 5-second
deadline and reports the elapsed time, because the open question is whether
500 ms is right on a cheap Android — and at a 500 ms deadline, "finished in
780 ms" and "never finished" look identical.

**Listening stopped being `null`** (D58). §4.2 wants three abilities estimated
separately; `vocab` has been real since M3 and `listening` is now estimated from
L4 dictation answers through the same 1PL model placement uses, with the item's
frequency rank as its difficulty. Not from placement — §4.2's 90 seconds are
already spent (D24) — and not from minimal-pair drills either, because a drill
has no difficulty on any measured scale and inventing one would be exactly the
fabrication D25 refuses. Below five answers there is no estimate and no row.

Two bugs fell out of writing it: the radar's listening axis counted every rung
**≥ 4**, so L5 and L6 production answers were being reported as listening; and
`production` had been hard-coded to `null` with the basis "(M7)" since M5, four
milestones after production shipped. Both now read the rung from the log.

**The audio pipeline exists and has never been run.** `scripts/ingest/build-audio.ts`
plans, names and indexes clips deterministically, `npm run check:audio` is a new
CI gate over the budget and the index, and the pure half is unit-tested. What is
missing is not code: **no voice model has been licence-checked**, so nothing may
enter `assets/` (invariant 5), and Piper is not installed here. This is stated
the way `workers/sync` states the same thing rather than left to look finished.

**D53's open half is closed.** First run offered a multi-select while the app
teaches one language at a time; it now asks which language to *start* with and
says switching is free and loses nothing.

### M9 · Meaning — and the measurement that changed the plan

The roadmap set a **70% go/no-go** on gloss coverage before building anything on
top. Measured over the shipped lexeme inventory on 2026-08-12:

| | bands 1–3 |
|---|---|
| English, id.wiktionary | **40.3%** (740 / 1,834) |
| English, adding en.wiktionary translation tables | 56.5% on band 1 |
| Japanese | **9.2%** (184 / 2,000) |

**So L2 does not become meaning recall, and D21 stands.** Two things made that
clear-cut rather than marginal. The misses are the *commonest* words — of band
1's first sixty by rank, the ones with no gloss are *to, was, do, be, his, are,
not, her, at, think, as, can, from, go, by* — function words, where a dictionary
gloss is least useful anyway. And en.wiktionary's translation tables give
`know → tahu, setubuh`: not wrong, and not something to show a learner meeting
the word for the first time. That is a per-sense review problem, not a coverage
problem, so those tables are not used at all.

**What shipped instead is the distinction that makes glosses useful anyway**
(D59): *grading* against a gloss demands it be right for every item, and an
unfair "wrong" is what §2.7 exists to prevent; *displaying* one demands only
that it be right where it is shown. So 1,581 English and 274 Japanese glosses
ship as **reference** — the reader's word panel finally has the dictionary M7
had to go without, and L0 finally has the gloss §2.3 always asked for — and a
word without one says so.

**The licence was cleared at source, which is what R3 suggested.** The old
blocker was Kaikki's extraction stating no terms of its own; parsing the
Wikimedia dump directly removes the intermediary. Confirmed two ways on
2026-08-12: `dumps.wikimedia.org/legal.html`, and each wiki's own `rightsinfo`
API. Glosses ship in **their own shards** under CC BY-SA 4.0 so the
Tatoeba-derived English sentence shards stay CC BY 2.0 FR — mixing them into one
file would have quietly upgraded the whole English corpus to share-alike.

**The kana keyboard** (§10) is built, and with it `romajiToKana` — an IME-style
live converter the repo never had. It holds a trailing `n` while typing (or
`nani` would lose its first keystroke to ん) and commits it on submit, and it
makes っ from doubled consonants, because きって is not きて and §3.2 says mora
length is where Indonesian gives no intuition at all.

### M10 · Reading

**Simple English Wikipedia is cleared and ingested**: 389,501 articles →
paragraphs → banded by 90th-percentile token rank, exactly as sentences are
(D15). And the histogram is the finding:

| band | paragraphs found | shipped |
|---|---|---|
| 1 | 5 | 5 |
| 2 | 75 | 75 |
| 3 | 712 | 400 |
| 4 | 3,843 | 400 |
| 5 | 4,558 | 400 |
| 6 | 241,652 | 400 |

**"Simple" English is not beginner English by our banding** — 96% of its prose
sits in band 6. That is not a reason to relax the measure; it is a reason to say
who the reader is for. The default learner is *intermediate English* (D3), which
is band 3 and up, and that is where the material is. A band-1 learner keeps the
sentence feed, and the screen does not pretend otherwise (D61).

**§2.4's coverage band is finally operative.** D28 recorded that [0.92, 0.98] is
literally unreachable on a ten-token sentence — the reachable values are 1.00,
0.90, 0.80. On a forty-token paragraph there are forty values inside it, so
`selectPassages` applies the spec's own threshold as written, and drops anything
under 0.85 outright rather than approximating.

**Reading stopped being `null`.** The check is a cloze over a word in the text
just read — the same retrieval §2.2 already requires, over running text — and it
is deliberately not a comprehension quiz: 1,680 passages cannot carry authored
questions, and generated ones would be answerable by string-matching. Attempts
go to their own append-only table (`ReadingAttempt`, schema v6) for D32's reason
exactly: a passage has no card, so these could never be review logs.

### M11 · The learner's own parameters

**The error-correction drill** — §8's last unbuilt catalog item — ships as a
drill *type* rather than an MCQ dressed as one: the prompt is a sentence with a
mistake, the answer is the whole sentence back. 10 English and 5 Japanese,
authored, one per morphosyntax category. The compiler refuses a correction whose
answer equals its prompt, and caught the first Japanese one for ending in 。
rather than a full stop, which is the gate doing its job.

**The optional AI layer was built and then deleted** (D63). It went in under
this pass's blanket instruction — bring-your-own-key, off by default, called
only from a tap, with a zero-egress e2e test driving a session with a key
configured. On review it was **declined outright**: the product's claim is that
a learner's data never leaves the phone unless they run the infrastructure
themselves, and a guarded module makes that claim conditional on the guard
rather than on the shape of the code. Invariant 8 says prefer deleting code over
guarding it, so `src/platform/ai.ts`, its screen, its feedback panel, its tests
and its copy are gone rather than flagged off. §14 question 5 is now answered
*declined* rather than *deferred*, and D63 records the reasoning so the next
session starts from the decision instead of the code.

The consequence is worth stating plainly: L6 still grades on whether the target
word was used and says so (D49). That was the one thing the layer would have
improved, and the honest version of that limitation is the one that ships.

**The FSRS optimizer was evaluated and not shipped** (D62). `fsrs-browser@6.6.0`
is BSD-3-Clause and 332 KB of WASM plus 36 KB of glue: fine as a lazy chunk,
since invariant 6 counts the entry chunk. What is not established is whether it
runs usefully single-threaded on the reference device — its threading goes
through `wasm-bindgen-rayon`, which needs cross-origin isolation — and a
parameter fit that silently degrades a learner's schedule is worse than the
bounded nudge D39 already ships. The nudge stays; the numbers are recorded so
the next session starts from them rather than from scratch.

### Not built

| | Why |
|---|---|
| **Chunks as first-class items** (§2.5, `ItemKind = 'chunk'`) | Extraction is mechanical (PMI over the shipped corpus) but the output needs a human pass before it becomes teaching material, and shipping unreviewed collocations as items would put content nobody read in front of learners. Typed and still unproduced. |
| **Topic clusters** (§2.10, §2.14, §2.8's second rule) | The mechanism is small; the content is not. It needs ~20 authored clusters over the first 2,000 words in two languages, and a bad topic map is worse than none — it would gate new-item selection on a taxonomy nobody trusts. `clusterId` is still a constant, so §2.8's per-cluster rule remains inert. |

Both were planned for v1.3.0 and v1.4.0 respectively. Neither is blocked by
anything technical; both are blocked on authored content and a reviewer.

### One defect found on the way out

Writing the declared-but-unreferenced check for the audio sequencing turned up a
live one: **`jmnedict` has been listed as a shipped dataset since M6** — and
therefore named on the in-app attribution screen — for a proper-name
disambiguation feature that was never built. Nothing fetches it, nothing parses
it, no shard declares it. The screen was claiming a provenance the app does not
have, which is the mirror of the failure M6 wrote that screen to avoid, and the
e2e test only checked the other direction.

It is now a candidate, `NOTICE.md` no longer attributes it, the e2e test asserts
it is absent, and `check-licenses.mjs` fails the build on any dataset that
nothing references. The same check is what will stop a voice model from being
promoted before its clips exist.

### Decisions I need from you

**1. The voice model — you have taken this, and three things changed under it.**
`en_US-libritts-high` exists and its corpus is CC BY 4.0, but it has 904
speakers, so `--speaker` is now part of the clip hash. **There is no Japanese
Piper voice in the official catalogue** — 173 voices, 54 language codes, no
`ja_JP` — so `ja_JP-jsut-multi_di-medium` cannot be pulled from it, and a
community model needs its own licence read (JSUT's terms especially). And the
default output is now **AAC/m4a**, not Opus: Safari only plays Ogg Opus from
17.5, and iOS is the device the clips exist to rescue. Output path is
`assets/content/<lang>/<voiceKey>/` — `assets/content/audio/` fails the licence
gate, by design.

**2. Two datasets were cleared without you.** `wiktionary-id` and
`wikipedia-simple-en` were promoted from candidates to datasets by reading the
terms at source and dating them (2026-08-12). The reasoning is in
`data/licenses.json` and `NOTICE.md`. If you would rather clear licences
yourself, say so and they come back out.

**3. The Indonesian copy grew again** — the diagnostics screen, the AI screen,
the passage reader, the kana keyboard, and 15 new drill explanations. All of it
still wants a native pass.

**4. The sync Worker is still undeployed.** Written, documented, unproven, and
now the only remaining path by which a learner's data could leave the phone —
deploy it once to test D51's arithmetic, or delete `workers/`.

---

## M7 — Production, reader, optional sync · complete (2026-08-11)

**Acceptance:** the app remains fully functional with sync disabled **and** with
speech APIs unavailable. Both met, and both as executable tests rather than
claims.

| | required | actual |
|---|---|---|
| ladder rungs reachable | L0–L6 | **all seven** |
| works with speech APIs absent | yes | ladder skips L4, drills withheld, typing unaffected |
| works with sync disabled | yes | **zero external requests**, asserted in the browser |
| unit tests | — | 596 |
| e2e tests | — | 29 |
| initial JS (gzipped) | ≤ 200 KB | 125.5 KB |

```
✓ typecheck · lint · 596 unit tests · licence gate · build · bundle budget
✓ 29 e2e: offline session, resume, cold start, installability, placement,
  drills, heatmap, §9 progress, export/restore, attribution, reader, sync
```

### The reader (§8)

Tap-to-gloss and one-tap mining, both entirely local — an e2e test cuts the
network before tapping to prove it. Three things the spec's words could not
survive contact with the corpus, all recorded as decisions:

**A feed, not a passage** (D45). Tatoeba is independent sentence pairs, not
documents. Stringing unrelated sentences together and calling it a passage would
*look* like a reader and *read* like nonsense, which is worse than a feed —
extensive reading depends on the text meaning something.

**Mining records an intention, not a card** (D46). "One-tap card creation" done
literally breaks invariant 0: a card is the product of an answer, and minting one
from a tap puts an item in the schedule with a due date nobody earned. The tap
writes to `minedItems`; the composer introduces the word next session, ahead of
the frontier queue and *past* the frontier gate — level gating exists to stop us
marching a learner through words they did not choose, not to overrule a choice
they made.

**Three floors, because one is not enough** (D47). The count rule alone passes
*"the quokka devours pastry"* — two unknown of four — on a technicality.

### Production, and the silent device

The ladder reaches L6. L5 is production from the Indonesian alone; L6 is a
sentence about the learner's own life.

**Audio was modelled as a ceiling, and that became wrong the moment production
landed** (D48). A learner with no speech engine would have been capped at L3 —
locked out of the top half of the ladder by a missing *listening* rung. So
`audioAvailable` now gates one rung rather than the maximum, and promotion runs
3 → 5 without it. §2.6 is satisfied exactly as written: the item is excluded from
L4 scheduling and nothing else changes. The old test asserted the lock-out; it
now asserts the escape.

**L6 grades on whether the word was used, and says so** (D49). No right answer
exists to match and there is no grammar model — D4 keeps the LLM layer out until
after M7 — so the honest check is the only checkable thing, which is also exactly
the generation effect the rung exists for.

**Speech input is detected, never probed** (D50). Synthesis earns a live probe
because an engine that lists a voice and never speaks is real and a silent
utterance is cheap. Recognition would cost a microphone permission prompt merely
to decide whether to draw a button. Every failure path — absent, refused, silent,
hanging, throwing — resolves to "not heard", with the text field right there.

### Sync, and the arithmetic that changed its design

§5.1 asked for the free-tier limits to be verified at build time. Read
2026-08-11 at developers.cloudflare.com:

| | |
|---|---|
| Workers requests | 100,000 / day |
| Workers CPU | 10 ms / request |
| D1 rows written | 100,000 / day |
| D1 rows read | 5,000,000 / day |

§5.1 says to batch "one write per finished session, not per card", which fixes
the *request* count. **The binding constraint turns out to be somewhere else.** A
4-minute session produces around thirty review logs; at one D1 row each that is
100,000 ÷ 30 ≈ **3,300 sessions a day** — an order of magnitude below the request
cap. So a delta is one *row*: the whole session as an opaque payload, which moves
both caps to 100,000 sessions a day (D51).

The server can afford that because it never reads inside a delta. It cannot: the
local store is the source of truth, merge logic is pure and lives on the client
in `src/core/delta.ts`, and the Worker only routes — which is also what keeps it
inside the 10 ms CPU budget.

**Disabled is structural, not careful.** Nothing in `src/features` or `src/data`
imports the sync module; the settings screen is the only caller. No boot
registration, no timer, no listener. An e2e test drives a whole session and the
progress screen while asserting **zero requests leave the origin**.

It is also opt-in with no default endpoint, which is a privacy decision: sync
means a learner's history leaves their phone, and nothing about the core product
needs that. The token lives in `localStorage` rather than Dexie so it cannot end
up inside an export bundle the learner might share (D52).

### Deviations

| Deviation | Why |
|---|---|
| The Worker has never been deployed or run | It needs a Cloudflare account the build environment does not have. The client, delta format and merge rules are unit-tested in CI; the limits above were read from documentation, not measured against a live account. `workers/sync/README.md` says so under "What is untested". |
| Shadowing is record-and-compare, with no score | §5.1 asks for exactly this where recognition is unavailable. For pronunciation it is arguably the better tool anyway: a recognizer tells you whether a machine understood you, your own ear tells you how far you are from the model. |
| No per-word dictionary in the reader | R3 again — no gloss source is licence-cleared. The panel shows what the app knows and says plainly that there is no dictionary, rather than leaving a thin gloss unexplained. |
| L6 does not assess sentence quality | See D49. Inventing a score would add a number nobody could defend. |

### Next decision I need from you

**1. R1 — the device matrix, still empty and now the last technical unknown.**
Every speech path degrades gracefully and is tested against stubs; none has run
on a real phone. It gates L4, three Japanese drills, the listening axis of the
radar, and now shadowing.

**2. Piper audio.** Design approved and unblocked; not started. It needs the
voice-model licence chosen and dated before a clip enters `assets/`.

**3. Deploy the Worker, or drop it.** It is written and documented but unproven.
If sync matters, one deployment would tell us whether the arithmetic holds. If it
does not, deleting `workers/` costs nothing — the app has never depended on it.

**4. The Indonesian copy across M6 and M7 wants a native pass**, particularly the
Japanese drills and the reader's word panel.

---

## M6 — Japanese · complete (2026-08-11)

**Acceptance:** a Japanese absolute-beginner path from kana to first 100 kanji
works offline; JA-specific tests pass. Both met.

| | required | actual |
|---|---|---|
| JA sentences with an Indonesian translation | §2.5 | **15,324** (5,919 direct + 9,405 via English) |
| kanji shipped, with component breakdown | §2.11: every one | **1,748 / 1,748** |
| JA contrastive categories | §3.2 | 14, of which **6 are positive transfer** |
| positive-transfer topics §3.2 names | all | 6 of 6 |
| beginner first download | ≤ 8 MB | **0.49 MB** |
| unit tests | — | 532 |
| e2e tests | — | 23 |
| initial JS (gzipped) | ≤ 200 KB | 120.8 KB |

```
✓ typecheck · lint · 532 unit tests · licence gate (7 datasets) · build · bundle
✓ 23 e2e, including the attribution screen the EDRDG licence requires
```

### R2 is resolved, by measurement

The risk register said Japanese might not satisfy §2.5 at all — "possibly in the
hundreds" of JA↔ID pairs. Measured: 5,919 direct, 12,395 reachable through
English, **15,324** after union and dedup. Pessimistic in size, right in shape.

Every sentence records `via: 'direct' | 'en'`, and triangulated ones carry the
English `bridge` id. A two-hop translation can drift in ways a direct pair
cannot, so the route is auditable per sentence rather than invisible, and a
direct pair always wins where one exists. No machine translation was used or
needed (D40).

### The attribution screen is a licence condition, so it went first

EDRDG requires an application using JMdict, KANJIDIC2 or KRADFILE to acknowledge
the usage and source in its UI. We now ship all three, so the screen had to exist
before a single Japanese card could. It renders from `data/licenses.json` — the
same file the CI gate reads — so a dataset cannot enter the build without
appearing here, and the legal list cannot drift from the actual one.

It shows `datasets` only, never `candidates`: listing a source we do not ship
would claim a provenance the app does not have, which is the mirror of omitting
one we do. An e2e test asserts both directions.

**KRADFILE cleared** by reading both EDRDG pages: covered by the EDRDG licence,
CC BY-SA 4.0. KRADFILE2/RADKFILE2 are a different copyright and are not used.
Japanese shards ship CC BY-SA 4.0 — mixing Tatoeba with EDRDG takes the stricter
term, not the more convenient one.

### Three things the data decided rather than the plan

**KRADFILE does not decompose 校 the way §2.11 says.** It gives the *radicals* —
父 + 木 + 亠 — which is correct and is not what the spec asks the learner to see,
because 交 is itself 亠 + 父. A conservative containment rule recovers the level
the spec wants: where another kanji's radical set is a proper subset of this
one's, the shared radicals collapse into it. That yields **校 = 木 + 交, 語 = 言 +
吾, 時 = 日 + 寺** from licensed data rather than 1,748 hand-authored breakdowns.
Marked `UNVALIDATED`, raw radicals ship alongside, fires on 1,149 of 1,748 (D41).

**Furigana cannot fade per character, and pretending otherwise produces wrong
furigana rather than finer furigana** (D42). Okurigana spans kanji and kana
(行く = いく), rendaku voices a reading by position (手紙 = てがみ), and jukujikun
has no split at all (今日 = きょう, where neither character contributes a
syllable). So a ruby span covers a token — which is how furigana is set in real
Japanese text — and the reading drops when *every* kanji in it is stable. 学校
loses its furigana once both 学 and 校 are known, not half of it when one is.

**A stale backup was silently undoing a newer mnemonic.** The M5 import rule
(bundle wins for current state) is right for cards and scores and wrong for the
one table where the learner's own authorship *is* the value. §2.11's finding is
that self-generated mnemonics beat given ones, so mnemonics are now last-write-
wins **by timestamp**: restoring last month's file cannot undo the version
rewritten yesterday. Found by writing the round-trip test the invariant demands,
not by inspection (D43).

### Positive transfer is the part of §3.2 that makes it unusual

Every language course lists what is hard. §3.2 asks for the opposite as well:
*"naming the parallel is elaborative encoding, and it is a real morale advantage
this audience is never told about."* So `ja.yaml` has two kinds of entry, and the
build **fails** if the positive half is missing.

Six advantages are named explicitly: the shared five-vowel system, open CV
syllables, familiar numeral classifiers (ekor/buah/orang/batang → 匹/個/人/本),
no plural marking or articles or gender, topic fronting as a bridge into は, and
politeness registers that a ngoko/krama speaker already has the instinct for.
They carry a note and no drills, because there is nothing to remediate — and the
compiler special-cases exactly that rather than demanding drills for them.

The eight difficulties are drilled: は/が, に/で, SOV and modifier-before-noun,
mora timing with the spec's own minimal pairs (おばさん/おばあさん, きて/きって),
verb and adjective conjugation, kana script, and あげる/くれる/もらう.

### Deviations

| Deviation | Why |
|---|---|
| Furigana fades per token, not per character | A per-character split of a reading is not generally possible — okurigana, rendaku, jukujikun. Stated in the module header and pinned by a test rather than left as a surprise (D42). |
| Japanese has 32 drills against English's 116 | §12's ≥100 bar is M4's, for English. §3.2's requirement is coverage of the named categories plus the positive-transfer notes, and both are complete. The drill count should grow with use, not be padded to hit a number set for a different milestone. |
| No false-friend list for Japanese | §3.1 asks for one for English. §3.2 does not, and Indonesian–Japanese false friends are a much thinner phenomenon. |
| Kanji are exempt from §2.5's anchor rule | §2.5 is about lexemes — a word must be met in a sentence. A kanji is taught by its components and readings, which is what §2.11 specifies, so requiring an example sentence for 校 would be applying the wrong rule. |
| Old JLPT levels ship, current N1–N5 do not | KANJIDIC2 carries the pre-2010 four-level scale. Mapping it onto N1–N5 would be inventing an alignment, which is what D16 refused to do for CEFR. `jlpt-wordlists` is still an uncleared candidate. |

### Next decision I need from you

**1. R1 — the device matrix, now blocking more than before.** Japanese needs
`ja-JP` voices, which §3.2's mora-timing drills depend on entirely, and R1 notes
those are the *most* likely to be missing on a cheap Android. Three of the
Japanese drills are withheld without audio today.

**2. Piper audio.** Your lazy-band design is approved and unblocks the payload
question. Piper is not installed here, and the voice-model licence still needs
choosing and dating before a clip enters `assets/` — for Japanese as well as
English now.

**3. The Japanese drills want a native reviewer more than the English ones did.**
I am more confident about the Indonesian in the positive-transfer notes than
about the Japanese example sentences in the drills. Worth a pass before anyone
learns from them.

---

## M5 — Progress and analytics · complete (2026-08-11)

**Acceptance:** every §9 item renders from real local data; export round-trips
into a fresh install. Both met.

| | required | actual |
|---|---|---|
| §9 items rendering from local data | all | 10 of 10 |
| export → fresh install → identical state | round-trips | asserted through a JSON string |
| unit tests | — | 468 |
| e2e tests | — | 21 |
| initial JS (gzipped) | ≤ 200 KB | 119.2 KB |
| charting dependencies added | — | none |

```
✓ typecheck · lint · 468 unit tests · licence gate · build · bundle budget
✓ 21 e2e: offline session, resume, cold start, installability, placement,
  contrastive drills, heatmap, every §9 section, JSON export and restore
```

### The number this milestone is really about

**Band 1 is 481 words and 70.3% of every token in the corpus.** The pipeline now
emits per-word corpus share, so §9's capability sentence — *"kamu mengenali
sekitar N kata… kira-kira X% dari kata yang muncul di kalimat yang kami
ajarkan"* — is **measured, not modelled**. No Zipf approximation, no borrowed
frequency list: the ranks came from the corpus we teach from (D13), so the
percentage is exact over that corpus and the copy says exactly which corpus.

It also produces an honest ceiling. Master every word we ship and you reach
**87.3%**, not 100% — proper nouns are filtered out of the inventory (D14) and
band 6 is not shipped, and both still turn up in real sentences. The screen says
so rather than letting the learner infer that the last 13% is their fault.

Regenerating the shards was also an unplanned check of invariant 10: rerunning
the unchanged pipeline first produced byte-identical output, which is the
property the whole cache-busting story rests on.

### The vocabulary interval is asymmetric, on purpose

SPEC §9 wants a vocabulary-size estimate *with a confidence interval*. The
tempting version is a symmetric ± around an extrapolation, and it would be
dishonest here: new items come from the learner's frontier band, nearest the
frontier first (D27), so within a band they have met the commoner words and not
the rarer ones, and a band they have never been shown tells us nothing at all.

So the interval is built out of what each piece of evidence actually supports
(D35):

- the **floor** is the count of words demonstrably retained — no inference;
- the **middle** extrapolates only bands with a real sample, using a Wilson
  score interval, which unlike the normal approximation does not produce bounds
  above 1 when a learner gets ten out of ten;
- the **ceiling** adds every unsampled band *whole*, because "we have not tested
  you on 3,400 words" is exactly that wide.

A learner three sessions in gets a very wide band. That is the correct answer.

### Retention audits the scheduler, and the audit can act

`measureRetention` counts **only cards that were genuinely due after an
interval** — a card still in learning has not been left alone, so answering it
says nothing about whether the interval was right, and counting those would push
the number towards 100% and make a mistuned scheduler look perfect.

The verdict comes from the confidence interval, not the point estimate (D39): 51
of 60 is 85% on its face and nowhere near enough evidence to accuse the
scheduler of anything, and there is a test that says so.

§9 asks the app to *"say so and offer to retune"*, so it does — the offer appears
only when the evidence rules the target out, and it moves
`request_retention` one bounded step in the direction the evidence points. It is
a **nudge, not an optimization**, and the code says so: a real per-user parameter
fit is what §2.1 buys the review log for, and it needs the FSRS optimizer and far
more history. Retuning upward shortens intervals for someone who keeps
forgetting; retuning downward hands time back to someone who barely does.

### Four more things worth flagging

**The append-only hook caught the import path, and it was right.** Restore
originally deleted the profile's review logs and laid the bundle down whole;
the Dexie hook rejected it. The fix is better than the original: `ReviewLog` and
`DrillAttempt` are keyed by UUID, so an import **merges** — it adds the rows it
does not have and touches nothing else — while cards, abilities and scores are
current state and get overwritten (D37). That is SPEC §6's own sentence read
literally, it makes re-importing a no-op, it unions two devices' histories, and
it means a restore can never destroy review history.

**No charting library.** Five small figures — bars, a polygon, a marker — against
a 200 KB budget. `charts.tsx` is under 200 lines of inline SVG, and every
component takes `number | null` so that "not measured" cannot accidentally render
as a bar of zero (D38). The bundle went 113.7 → 119.2 KB for the whole milestone.

**The radar has five axes and three of them are honest gaps.** Reading and free
production have no items until M7, so they are drawn as hollow markers on empty
spokes rather than points at the origin — a polygon pulled to zero reads as "you
scored nothing at reading" when the truth is that reading has never been tested.
An e2e test asserts the screen never shows 0% for them.

**The empty state is most of the work.** The first thing every §9 section needed
was a truthful way to say it has nothing yet, and the first e2e test asserts
exactly that — before any answer, vocabulary, retention and calibration all say
so in Indonesian, and no level label appears anywhere.

### Deviations

| Deviation | Why |
|---|---|
| Retuning is a bounded nudge to `request_retention`, not a parameter fit | §2.1's real optimizer needs `@open-spaced-repetition/binding` and a long history. One honest step per look at the evidence is what the data supports now; the log keeps accumulating for the real thing. |
| The capability percentage is over *our* corpus, not "everyday conversation" | We can measure the first exactly and cannot measure the second at all. The copy names the corpus rather than making a claim about the language (D36). |
| `mastered` and `placedAtRank` are computed but not yet shown | Both are in `ProgressReport` for the weekly recap; the recap is the one §9 line that reads better with a week of data behind it than with an empty state. Flagged rather than half-built. |
| Reading and production score `null` forever until M7 | D25's rule, applied to the radar: a missing measurement reads as "not measured", a fabricated one reads as a measurement. |
| Lexeme shards changed hash to carry `share` | A real content change, so the re-download is earned rather than churn. Pre-release, so nobody pays for it twice. |

### Next decision I need from you

**1. R1, unchanged and now the longest-standing open item.** The device matrix in
`docs/DECISIONS.md` Part 3 is still empty. M5 added nothing to this except one
more consumer: the listening axis of the radar stays `null` on any device where
the probe says the engine is dead.

**2. Pre-cached audio — still a licence question, not a code one.** Unchanged
from M4, and it now gates two visible things rather than one.

**3. The weekly recap (§9's last line) is deliberately unbuilt.** Everything it
would summarise is computed; what I do not know is whether you want it as a
screen, a card on the home screen, or the body of the local notification the
habit cue (§2.13) already schedules. That is a product call.

---

## M4 — The contrastive engine · complete (2026-08-11)

**Acceptance:** ≥100 authored contrastive items; wrong answers on tagged items
produce an Indonesian explanation; the heatmap renders from real logs. All three
met. L4 dictation is unblocked alongside, behind the hardened TTS probe.

| | required | actual |
|---|---|---|
| authored contrastive items | ≥ 100 | **116** across 21 categories |
| §3.1 morphosyntax categories covered | all 10 | 10 |
| §3.1 phonology categories covered | all | 10 |
| curated false friends | ≥ 60 | **75** |
| items tagged with a category carrying a note | 100% | 100%, gated in the build |
| §2.8 interleaving, 1,000 sessions **with drills mixed in** | no violations | 0 violations, 0 relaxations |
| unit tests | — | 414 |
| e2e tests | — | 17 |
| icon tap → first answerable question | ≤ 3s | 53 ms (gate still green) |
| initial JS (gzipped) | ≤ 200 KB | 113.7 KB |
| contrastive pack | — | 15.3 KB gzipped, precached |

```
✓ typecheck · lint · 414 unit tests · licence gate · build · bundle budget
✓ 17 e2e tests: offline session, lossless resume, cold start, installability,
  placement, contrastive drills and the heatmap
```

### Task 1 — L4 unblocked, and what the probe now actually asserts

The probe fires once per app start, speaks a zero-volume utterance, and waits for
**`onend` and only `onend`** for **500 ms**. Anything else — a voice that never
finishes, an engine that fires `onstart` and goes quiet, an error, silence — is
`dead` for the rest of the session (D29). It runs as soon as a screen is painted
rather than during boot itself, for a reason that turned out to be the most
important thing this milestone learned; see below.

Waiting on `onend` rather than `onstart` is the whole point of the change. The
Android failure mode is an engine that announces itself and produces nothing, and
a start-based check passes it; there is now a test that stubs exactly that engine
and asserts the verdict is `dead`.

The fallback chain below it is per item, not per app:

1. a pre-cached clip for that sentence, if one exists;
2. otherwise synthesis, if the probe said the engine is live;
3. otherwise the item is not L4-eligible and is held at L3.

That third branch is `ladderCeiling(hasAudio)`, and it is a ceiling rather than a
filter for a reason. An item that cannot be heard is never *promoted* into L4, and
a card already sitting at L4 when the engine dies is **demoted visibly** — the
review log records the rung the learner was actually shown. The alternative,
presenting a dictation card as a text card, is exactly the silent degradation
§2.6 forbids, and it would poison every later measurement of the ladder.

L4 itself is dictation of a short sentence (≤10 tokens), chosen over the
audio-cloze reading of §2.3 because the answer is fully determined by what was
heard, with no visible frame to guess from. An item whose anchors are all too
long has no L4 material and is held at L3 by the same mechanism (D30).

**The honest gap:** the pre-cached clip set is empty. Tatoeba audio is a licence
*candidate*, not a cleared dataset — terms are per contributor and some clips
carry none — so nothing may enter `assets/` under it. Step 1 of that chain is
built, tested, and has nothing to serve. On a device whose engine is dead, L4 is
therefore withheld from every item today. The app stays fully usable: 94 of the
116 drills are text, every rung below L4 is text, and the home screen says in
Indonesian that listening practice is hidden and why.

### Task 2 — the contrastive engine

**`data/contrastive/en.yaml`** — 21 categories: all ten §3.1 morphosyntax
categories, ten phonology categories (the missing phonemes split by contrast,
the three vowel pairs, final devoicing, cluster reduction, word stress), and
false friends. Each carries a three-part Indonesian note in a fixed order —
*what Indonesian does*, *what English does instead*, *one minimal pair* — plus
116 drills and a curated list of 75 false friends.

The order of the note is a decision, not a layout. Naming the L1 pattern first
tells the learner the mistake is systematic rather than careless, which is the
entire claim §2.9 is making. All example sentences are authored here rather than
lifted from the corpus, so the content carries no third-party licence
(`linguaku-authored`, declared and attributed).

`npm run ingest:contrastive` compiles the YAML to a 15 KB shard and **fails the
build** on an MCQ whose answer is not among its options, a category with no
minimal pair, a drill with no explanation, or a minimal pair not marked as
needing audio (D31). A YAML parser has no business in the bundle, and an
unanswerable question should never reach a phone.

**`src/core/elo.ts`** — one rating per category, updated in place after every
answer, with K decaying as evidence accumulates. Elo rather than the 1PL grid
`placement.ts` uses because this question never stops being asked, over twenty
categories at once, and has to stay incremental.

**`src/core/interference.ts`** — the piece that makes the engine work on ordinary
reviews rather than only on drills. It turns a wrong cloze answer into category
tags: `he` for `she`, `walk` for `walked`, `is` for `are`, `a` for `the`. Those
tags are written to `ReviewLog.interferenceHit`, move the same Elo ratings the
drills do, and pull up the authored note as feedback. The heatmap is therefore
built from what the learner does when they are *not* being tested on it, which is
the thing a quiz cannot tell you.

**The composer** now spends §7.2's last 5% on drills from the weakest category
(nearest the learner's rating within it), with drills counting as their own card
type so §2.8 keeps two of them apart. Drills deliberately do not receive the
spare budget when reviews run dry: §7.2 asks for one contrastive drill, not for a
session to become remediation.

**The heatmap** ranks measured categories weakest-first and says *"belum cukup
data"* — with the number of answers still needed — for everything else.
`heatmap.test.ts` walks the whole join: a normal cloze answered wrongly, through
the detector, into the review log and the category rating, out as a ranked
standing — with no drill involved anywhere.

### The R1 finding that cost the most to learn

**The first `speechSynthesis` call blocks the main thread for ~15 seconds when
there is no speech service behind it.** Not the probe's timeouts — those are
async and bounded — the API call itself.

It showed up as the cold-start acceptance test going from 1.2s to 14.9s the
moment the probe was wired into boot, and returning to 1.2s when it was moved.
Instrumenting the boot path showed a 14.9-second gap with no network activity and
no JavaScript progress, sitting between the content manifest arriving and the
anchor shards being requested — the main thread, gone.

That is five times SPEC §5.4's entire icon-tap-to-first-question budget, with the
app frozen for all of it, and it lands on exactly the device R1 is about: the
cheap Android with no TTS engine installed.

`requestIdleCallback` was not enough — the idle moments during an async boot are
precisely the gaps where the app is waiting on IO and is about to want the main
thread back. So the probe now fires only once a screen is **painted**:
`onFirstQuestion` from the session screen, `onReady` from home. Until it answers,
`isTtsLive()` is false and audio is withheld, which is the same safe default the
rest of §2.6 runs on. A unit test stubs the API and asserts the probe has not
touched it before the deferral elapses.

This is worth a row of its own in the device matrix: not just *is there a voice*
but *how long does the first call take*. If it reproduces on real hardware, the
probe may belong behind an explicit "test audio" button rather than running by
itself at all.

### Four things worth flagging

**A wrong tag is worse than no tag.** `book`/`books` and `go`/`goes` are the same
string alternation, and M1's frequency-only pipeline produces no part-of-speech
tag. The word before the blank settles most cases; where it does not, the
detector emits nothing at all (D34). Roughly half of `interference.test.ts` is
about the detector staying quiet.

**Eight correct answers in a row is not yet "you've got this".** The weakness
threshold is expected accuracy below 0.75 on a median drill, and the damped K
means clearing it takes about a dozen. A test that asserted otherwise was
rewritten rather than the threshold lowered: the cost of the strict version is a
few extra drills in a category the learner is fine at, which is much cheaper than
declaring a weakness resolved on thin evidence.

**Drills are not review logs** (D32). A drill has no FSRS card — nothing
scheduled, no stability — so filing drill answers among the review logs would put
unscheduled items into the retention rate §9 promises to report honestly. They
get their own table and their own single writer, with the same one-transaction
discipline `recordReview` has.

**Session planning must not touch the network.** `planSession` runs inside the
≤3s budget, so the contrastive pack is read from memory if it is there and simply
skipped if it is not — a first-ever session that starts before the pack lands
gets no drill, and the next one does. Content that has not arrived is not
scheduled, the same rule bands already follow.

**The e2e suite found a real bug, not a flake.** Advancing to the next card left
the *previous* card on screen and answerable for as long as the next one took to
build — so a learner could answer a card that had already been graded, and a
second `recordReview` would land on it. Fixed by clearing the card with the
feedback; the test helper now also waits for the counter to move rather than
racing the app.

### Deviations

| Deviation | Why |
|---|---|
| The probe fires after the first screen paints, not literally at boot | Forced by measurement, not preference: a literal boot probe freezes the app for ~15s on a device with no speech service (above). It is still once per app start with one verdict for the session, which is what the directive was buying. |
| The probe will mark iOS Safari dead where audio might have worked | iOS requires a user gesture before it will speak, and neither boot nor first paint is one. This is the cost of a stable session-wide verdict (D29), and it fails safe — L4 withheld, never faked. The M2 behaviour (probe inside the practise tap) traded the stable verdict for iOS coverage. Reversible; the matrix should decide it. |
| L4 is dictation only, not the audio-cloze alternative §2.3 also allows | Dictation's answer is determined entirely by the audio. An audio-cloze needs the sentence frame on screen, which makes it partly a reading task — a weaker measurement of phonological form (D30). |
| `CategoryScore` gains a `correct` tally, beyond the §6 shape | The heatmap reports accuracy, and the Elo rating is damped and difficulty-weighted, so it does not carry a raw hit count. Existing rows are backfilled with 0 rather than a number reconstructed from the rating. |
| The 22 minimal-pair listening drills are withheld without audio | Same rule as L4 (§2.6). Shown as a reading exercise they would silently convert a listening measurement into a spelling one. |
| `yaml` added as a devDependency | MIT, build-time only, never in the bundle. §0 rule 1 is about recurring cost, and there is none. |
| Phonology categories will stay unmeasured on a silent device | Honest consequence of the above: the heatmap will show them as "belum cukup data" indefinitely rather than scoring them from text proxies. |

### Next decision I need from you

**1. R1, still — and now it is the only thing standing between the engine and
its listening half.** Part 3 of `docs/DECISIONS.md` is still empty. M4 proceeded
on the basis that the matrix had been run, and the probe was built to the 500 ms
`onend` deadline that direction specified; no results came with it, so I have not
written rows I did not observe. Two things need real phones: whether 500 ms is
the right number on a cheap Android, and whether the iOS gesture consequence
above costs real learners their listening material.

**2. Pre-cached audio is now the binding constraint, and it is a licence
question, not a code one.** The fallback exists and has nothing to serve.
Options, all of which are yours: clear Tatoeba audio per clip (the export carries
a licence field; the ones with an empty field are unusable), source a
CC-licensed clip set, or accept synthesis-only and let dead-engine devices go
without L4 permanently. R4 measured the room: essentially the whole 8 MB budget
is free for roughly 800–1,000 clips.

**3. The Indonesian copy is a draft and reads like one in places.** You said you
would edit it. The places I would look first: the phonology tips, which are the
hardest to write without sounding like a textbook, and `PASSIVE_OVERUSE`, where
the explanation is about register and my ear for Indonesian register is the
weakest part of this file.

---

## M3 — Level awareness · complete (2026-08-10)

**Acceptance:** §2.4 and §4.2 acceptance tests pass; simulated learners of three
different levels receive appropriately different content. Both met.

| | required | actual |
|---|---|---|
| i+1 selection in band, passage-length text | ≥ 90% | **100%**, 0 below the floor |
| placement length | ≤ 25 items, ≤ 90s | capped and asserted end to end |
| three simulated learners get different bands | yes | strictly increasing band means |
| unit tests | — | 306 |
| e2e tests | — | 14 |

### What shipped

Four new `src/core` modules: `coverage` (known-set and i+1 selection),
`forecast` (14-day load projection and the new-item throttle), `placement`
(1PL estimation, max-information selection, stopping rule, false-alarm
correction) and `pseudoword` (build-time non-word generation).

The placement screen itself is one interaction: a word, and two buttons. SPEC
§4.2 asks for both an adaptive 1PL loop and a Yes/No pseudoword check inside 90
seconds, so they are the **same sequence** (D24) — every real word judged is a
1PL response, and pseudowords interleave at one in four to catch over-claiming.
It is offered right after the language choice and can always be declined; an
e2e test asserts that declining costs nothing, because a placement that has
quietly become mandatory is an onboarding wall.

Sessions are now level-gated: new items come from the learner's frontier band,
nearest the frontier first (D27), and the new-item allowance is throttled
automatically by projected review debt. Which anchor sentence teaches a word is
now an i+1 decision rather than always the globally easiest one.

### Three things measurement or the spec's own numbers forced

**The i+1 coverage band is unreachable on sentences.** Coverage on an n-token
text is quantized to 1/n, and the band is 0.06 wide — so below ~17 tokens it can
contain no achievable value at all. On a 10-token sentence the reachable
coverages are 1.00, 0.90, 0.80: the band is empty. §2.4's threshold is a
*running-text* finding. Applied literally to single sentences it would reject
nearly all of them, so short items fall back to i+1's literal form — exactly one
new word — and the §2.4 acceptance test runs on passage-length text where the
band is the operative criterion (D28).

**Uncapped over-claim correction produced a useless placement.** A learner who
answered erratically and claimed pseudowords got "somewhere between band 1 and
band 6" — honest, and worthless. Evidence can fail to narrow what we knew; it
cannot make us less certain than the prior, so the corrected standard error is
now capped there. Where the band is still three tiers wide, the result screen
says so in words rather than printing the range (D26).

**A trigram model makes obvious fakes.** The first pseudoword pass emitted
`admaninja` and `awflualte` — a learner spots those on sight, and a Yes/No check
whose fakes are visible measures nothing. An order-3 character model follows
English orthotactics closely enough to produce word-shaped output (`anago`,
`badests`, `assicks`) while carrying far too little context to reconstruct real
words. Candidates within one edit of a real word are rejected too: showing
`becuase` tests whether a learner spots a typo, not whether they know the word.

### Deviations

| Deviation | Why |
|---|---|
| Only `vocab` is estimated; listening and grammar rows are absent | §4.2 forbids collapsing the three. Listening needs audio verified on a real device (R1); grammar has no items until M4. A missing row reads as "not measured"; a fabricated one would read as a measurement (D25). |
| Vocabulary ability is a corrected self-report, not a test of recall | It is what §4.2's Yes/No check is, and it buys 25 items in 90 seconds. The false-alarm correction is what keeps it from measuring confidence. Recall-based placement items would need glosses (R3). |
| The mapping from false-alarm correction onto (θ, SE) is a calibration choice | The mechanism is the spec's; the shrink-toward-prior mapping is an implementation detail, labelled as such in the code rather than presented as a finding. |
| §7.2's "forecast load > 1.5× daily budget" read as *mean daily* load | Read as a weekly total against a daily budget it would throttle almost every learner — any learner with more than ~60 cards due in a week. Mean daily load against daily capacity is the reading that does what the rule is for. |

### Next decision I need from you

Still only R1: **the speech device matrix**. Unchanged from M2 — the probe is
built and tested against engines that lie, but has never run on a real phone,
and until it has, L4 stays withheld and the `listening` ability stays unmeasured.

---

## M2 — The loop · complete (2026-08-10)

**Acceptance:** a 4-minute session runs end to end offline; kill-and-resume
loses nothing; §2.1 and §2.8 tests pass; icon-tap to first question ≤ 3s. All
four met, each as an executable test rather than a claim.

| | required | actual |
|---|---|---|
| icon tap → first answerable question | ≤ 3s | **1.2s** |
| §2.8 interleaving over 1,000 generated sessions | no violations | **0 violations, 0 relaxations** |
| session offline, network cut | works | e2e passes |
| kill mid-session → review logs kept | all | e2e asserts the count |
| initial JS (gzipped) | ≤ 200 KB | 105.4 KB |
| first-load precache | ≤ 8 MB | ~0.58 MB gzipped |

```
✓ typecheck · lint · 198 unit tests · licence gate · build · bundle budget
✓ 9 e2e tests: offline session, lossless resume, cold start, installability
```

### The R5 decision, made

You delegated it, so: **one active FSRS card per item**, with the ladder level
selecting the task and FSRS state carrying across promotion (D18). A card per
rung would multiply review load by up to 7× and cap a 4-minute-a-day learner at
a vocabulary in the low hundreds. `ReviewLog.ladderLevel` records the rung every
answer was given at, so promotion uses the last three answers *at the current
level* and the call stays reversible on real evidence rather than on argument.

### What shipped

Six new `src/core` modules, all pure and unit-tested: `scheduler` (the ts-fsrs
wrapper), `ladder` (promotion, demotion, leeches, mastery), `grader`,
`sessionComposer`, `cloze`, `rng`. Plus `src/platform/speech.ts` (the R1 probe),
the content loader, the review and session repositories, and the session UI —
L0 exposure, L1 recognition, L2/L3 cloze, feedback, and an end screen that
reports what got stronger rather than points.

`recordReview` is the single writer of FSRS state: it cannot be called without a
rating and it writes the card and appends the log in one transaction. That is
§2.2 made structural. A card is not created until the learner first answers it.

### Four things measurement changed

**Importing the corpus into IndexedDB took 43 seconds.** Bands 1–3 are 27,650
sentence rows, and the budget for icon-tap-to-first-question is 3 seconds.
Fetching and parsing the same content as JSON takes ~5 ms. So lexemes (queried,
thousands) live in IndexedDB and sentences (read by id, tens of thousands) stay
as JSON in memory, with the pipeline emitting `anchors.b*.json` — just the
sentences a band's vocabulary is taught through. 43s → **1.2s** (D19).

**Runtime caching could not deliver the offline promise.** §5.4 says the app
works offline after first load; runtime caching only achieves that if the
learner happened to be online for a whole session first. The starter bands are
now precached — 0.58 MB gzipped against an 8 MB budget (D20).

**Naive greedy interleaving fails §2.8.** Always taking the highest-priority
legal card defers same-type cards until only same-type cards remain, then has no
legal move — 2 violations in 1,000 sessions. Ordering by how many of a category
are still waiting, with risk breaking ties, gives zero violations.

**Plain Levenshtein calls a transposition a different word.** `becuase` scores
distance 2 from `because`, past the tolerance for a 7-letter word — so a learner
who knew the answer would be told they were wrong. Damerau-Levenshtein charges 1
for the commonest typing slip there is.

### Deviations

| Deviation | Why |
|---|---|
| L2 is a cloze *with* the Indonesian translation, not "target → meaning typed" | Grading typed meaning needs a gloss (blocked, R3). Grading against the single shipped translation would mark good paraphrases wrong — the unfairness §2.7 exists to prevent. Contextual production splits by support instead: L2 shows the translation, L3 does not (D21). Reverts when glosses land. |
| No answer ever produces an FSRS rating of Easy | §2.12 forbids deriving it from the confidence tap, and deriving it from latency would be invented. Correct → Good, near-miss → Hard, wrong → Again (D22). |
| Lighthouse PWA gate replaced with direct installability assertions | Lighthouse **removed the PWA category in v12** (Chrome 126) when Chrome revised its installability criteria. The e2e suite asserts what the score measured — manifest validity, icon resolution, maskable icon, SW control, offline start_url — with no new dependency (D23). |
| `ReviewLog.ladderLevel` and `Item.anchorSentenceIds` added to the §6 shape | Both follow from D18: promotion needs the last three answers at the current rung, and which example a learner meets first is a pipeline decision, not a query. |
| Session budget spends the reserved input/contrastive 20% on reviews | Those pools have no content until M3 and M4. The share is reserved in the constants, so the numbers are already right when they arrive. |
| The §2.1 "±3 points of target retention" test is not the one the spec describes | Simulating a learner who forgets on FSRS's own curve tests FSRS against itself. What ships is a regression test that our parameters and timestamp handling reach the scheduler intact — see R6, which called this at M0. |

### Known content-quality limitation

Frequency is type-level with no POS tagging, so the exposure card for the
article `a` can pick *"She got an A."* — where the "A" is a grade, not the
article. Real, visible, and not worth a tagger yet; noting it rather than
hiding it.

### Next decision I need from you

Only one, and it is not blocking: **the manual speech device matrix** (R1).
The probe is built and tested against engines that lie, but it has still never
run on a real phone. That needs a cheap Android, an iPhone, and Firefox Android
— things I cannot reach. Until then L4 stays withheld rather than guessed at.

---

## M1 — Content pipeline, English · complete (2026-08-10)

**Acceptance:** ≥5,000 banded EN sentences with ID translations; licence check
passes; beginner shard ≤ 8 MB. All three met, with a lot of room.

| | required | actual |
|---|---|---|
| banded EN sentences with ID translations | ≥ 5,000 | **23,497** |
| beginner first download (band 1, gzipped) | ≤ 8 MB | **0.21 MB** |
| whole corpus, all six bands (gzipped) | — | 1.05 MB |
| lexemes ranked, banded and anchored | — | 5,245 |
| licence gate | passes | 4 datasets declared, 12 asset files traced |

```
✓ typecheck · lint · 61 unit tests · licence gate · build · bundle budget
✓ 3 e2e tests including offline reload
```

### The two blockers, resolved

**English frequency list — removed rather than cleared.** Frequency ranks are
computed from Tatoeba's own 2.03M-sentence English corpus (decision D13). This
adds no licence surface, is register-matched to the sentences we actually teach
from, and makes §2.4 coverage self-consistent: a rank predicts coverage of *our*
corpus, which is the thing coverage is computed over. `wordfreq` was verified as
a viable fallback (Apache-2.0 code, CC BY-SA 4.0 data) but is sunset and frozen
at ~2021 usage.

**Indonesian glosses — sidestepped, not solved.** M1 anchors meaning in
translated sentences rather than dictionary definitions, which is what §2.5
asks for anyway. Kaikki's terms remain unstated and the blocker is still live
for the short glosses that L1/L2 cards will eventually want.

### What shipped

**`scripts/ingest/`** — `fetch.ts` pulls the Tatoeba exports into a gitignored
`.cache/`; `build-en.ts` runs the §5.3 chain (normalize → dedupe → rank →
score → band → shard → hash) in about six seconds. Both are TypeScript executed
directly by Node, so they share `src/core` with the app instead of duplicating
the tokenizer and the difficulty scorer (D17).

**Four new `src/core` modules**, pure and unit-tested: `tokenize.ts` (the same
tokenizer at build time and runtime, so coverage cannot drift), `frequency.ts`
(§2.10 bands, deterministic ranking), `difficulty.ts` (§7.6), `properNoun.ts`.

**`assets/content/en/`** — 11 shards plus a manifest carrying a SHA-256 per
shard for cache-busting. Output is deterministic: no timestamps, ties broken
explicitly, so an unchanged corpus produces byte-identical files and nobody
re-downloads anything.

**Content-integrity tests in CI** — the M1 acceptance numbers, hash and byte
matching per shard, every anchor resolving to a sentence that actually ships,
every lexeme banded consistently with its rank, and no placeholder name taught
as vocabulary.

### Two judgement calls worth reviewing

**Tatoeba made `tom` the third most frequent English token**, ahead of `a` —
the corpus is saturated with Tom and Mary as placeholder names. Ranks are left
untouched, because coverage genuinely has to account for a learner meeting
"Tom" in a sentence, but proper nouns are filtered out of the *vocabulary list*
(D14). Detection uses lower-case share among mid-sentence occurrences only; the
naive version, which looks at all occurrences, also deleted `i'm`, `i've` and
`where's`, since those are capitalized only because they open sentences. 493
tokens filtered. **Known gap:** demonyms go too — `french` and `german` are not
currently teachable words.

**Sentences are banded by 90th-percentile token rank, not by the composite
difficulty score** (D15). "The harder words in this sentence live in band N" is
defensible; "this sentence is B1" is not. Relatedly, `Item.levelTag` is now
optional and unset for everything M1 ships (D16) — inventing CEFR labels from
frequency would be exactly the fake precision §2.15 bans.

### Deviations

| Deviation | Why |
|---|---|
| No Indonesian glosses in the lexeme inventory | Blocked on licence (above). Meaning is carried by anchor sentences, which §2.5 prefers. |
| Lexeme inventory stops at rank 8,000 (bands 1–5) | Band 6 is the open-ended tail; shipping it means hundreds of thousands of entries for no M1 benefit. |
| `Item.levelTag` made optional | See D16 — no cleared CEFR alignment exists. |
| Shards not yet copied into `dist/` | The runtime loader is M2. Copying 4.5 MB into the build with nothing reading it would be dead weight. |
| Every relative import now carries a file extension | See D17 — lets Node run the pipeline against `src/core` with no transpiler. |
| Syntactic depth approximated by clause markers | Shipping a parser to score 25k sentences is not free; the proxy is labelled as a proxy everywhere it surfaces. |

### Next decision I need from you

Nothing blocks M2 except **the ladder-versus-FSRS question**, still open from
M0 and repeated below. Everything else in M1 was mine to decide and is
documented in `docs/DECISIONS.md` (D13–D17).

---

## M0 — Foundations · complete (2026-08-10)

**Acceptance:** `npm run verify` green; app installs as a PWA and loads offline.
Both met, and the offline half is proven by an automated test rather than a
claim — Playwright cuts the network and reloads.

```
✓ typecheck (tsc --noEmit, strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes)
✓ lint (eslint, type-checked rules, no-explicit-any as an error)
✓ 18 unit tests
✓ licence gate: 4 datasets declared and attributed
✓ build
✓ initial JS 91.8 KB / 200 KB (46%) · initial CSS 3.9 KB / 40 KB (10%)
✓ 3 e2e tests on an emulated Pixel 5, including offline reload
```

### What shipped

**Toolchain.** Vite 8 + React 19 + TypeScript 6 (strict, plus
`noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`), Tailwind 4,
`vite-plugin-pwa`, Vitest, Playwright, ESLint with type-checked rules.

**Data layer (SPEC §6).** All ten entities typed, and the Dexie schema at
version 1 with indexes chosen for the queries the composer will actually run
(`[profileId+suspended+dueAt]` for due cards, `[profileId+reviewedAt]` for
analytics, a multi-entry index on `interferenceTags` for the contrastive
engine). Two invariants are enforced by the store rather than by convention:

- `ReviewLog` is append-only — update, `put()` over an existing row, delete and
  `clear()` all throw. A reset drops the database instead.
- `Card.dueAt` is derived from `Card.fsrs.dueAt` by a Dexie hook, so it cannot
  drift no matter what writes the card.

`src/data/fsrsState.ts` is the serialization boundary to `ts-fsrs`, round-trip
tested across five review generations.

**App.** First-run screen (pick languages, pick daily minutes) creating an
anonymous local profile — no signup, no wall, two taps. Home screen with those
settings editable and an honest status panel (offline readiness, storage
durability). Indonesian-first copy, all of it in `src/i18n/id.ts`; dark mode;
WCAG AA contrast; `motion-safe:` transitions; 56px+ tap targets with primary
actions in the thumb zone.

**CI gates.** `npm run verify` chains typecheck → lint → unit → licence →
build → bundle budget. `scripts/check-bundle.mjs` walks the real build manifest
and counts only the entry chunk plus its transitive static imports, so lazy
content shards will not be able to hide inside the budget.
`scripts/check-licenses.mjs` enforces the §5.2 hard rule.

**Docs.** `CLAUDE.md`, `docs/SCIENCE.md` (all fifteen §2 requirements mapped to
implementation and acceptance test), `docs/DECISIONS.md` (risk register plus
twelve standing decisions), `docs/ETHICS.md`, `NOTICE.md`, `SPEC.md`.

**Licence research (SPEC §15).** Four datasets verified by reading the licence
text: Tatoeba (CC BY 2.0 FR; audio is *not* covered — per-contributor, and
unlicensed clips are unusable) and JMdict / JMnedict / KANJIDIC2 (CC BY-SA 4.0,
share-alike, with EDRDG requiring visible acknowledgement). Everything else is
in a `candidates` list with its specific blocker; the gate refuses candidates.

### Deviations from the spec, and why

| Deviation | Why |
|---|---|
| `profileId` added to `Card`, `ReviewLog`, `Mnemonic` | §6 omits it, but scoped export (§9) and per-profile delta sync (§5.1) both need it. |
| Indexed booleans stored as `0 \| 1` | IndexedDB cannot index booleans, and the composer's hot path is a compound index containing `suspended`. |
| Timestamps stored as epoch ms, not `Date` | Indexable, and lossless through export/import. `Date` exists only at the `ts-fsrs` boundary. |
| `Card.dueAt` added as a derived mirror | IndexedDB cannot index a nested path inside a compound key. |
| `Habit` and `Mnemonic` given explicit keys | §6 gives neither a primary key. |
| Licence gate written in M0, not M1 | §12 lists a licence check among M0's CI gates; writing it now also gave the licence research somewhere to land. |
| Lighthouse PWA gate not yet in CI | §13 lists it, but it pairs naturally with the cold-start timing test, which is M2's acceptance criterion. Both land together in M2. |
| Code licence left `UNLICENSED` | Not mine to pick — see the decision needed below. |

### Not built, deliberately

No `src/core/` modules, no scheduler, no session UI, no AI seam. Per §0 rule 5
these would be scaffolding for milestones that have not started. `ts-fsrs` is a
dependency today only because the schema's serialization contract is defined
against its types and tested against its real scheduler.

---

## Decisions I need from you

**1. The ladder-versus-FSRS question — this one blocks M2.**
§2.3 turns one lexeme into up to seven cards; §2.1 buys a memory model built
for one card per memory. If every rung carries its own FSRS state, a 4-minute
session's review capacity caps the learner at a vocabulary in the low hundreds.
My recommendation is **one active card per item**, where the ladder level
selects the task and FSRS state carries across promotion (difficulty bump up,
demotion on lapse), with each `ReviewLog` recording the level it was answered
at. The schema supports either reading today. Full argument: R5 in
`docs/DECISIONS.md`.

**2. §14 question 3, still open: how much content do you author yourself?**
This shapes M4 and M6 more than any technical choice. Roughly: (a) you author
the ~100 contrastive notes and I generate drills from them, (b) I draft
everything from corpora and you review, or (c) split — you write the
explanations that need a native ear, I generate the mechanical items. My
recommendation is (c): the contrastive explanations in §3.1 are the product's
differentiator and read wrong when they are not written by someone who has made
the mistake.

**3. ~~Two licence blockers that stop M1 from shipping.~~ Resolved in M1** —
frequency by removing the dependency (D13), glosses by deferring them (§2.5
anchors meaning in sentences anyway). The gloss question returns when L1/L2
cards want a short definition.

**4. Code licence.** Currently `UNLICENSED`. EDRDG's share-alike binds the data,
not the code, so this is a free choice — worth settling before the repo is
public.

**5. Japanese sentence data will not meet §2.5 as written.** Tatoeba has 28,198
Indonesian sentences against 2.0M English; direct JA↔ID pairs will be a small
fraction of that. Not urgent until M6, but the options (pivot through English,
gloss in Indonesian at lexeme level only, or hand-author a core) each change
what the app promises. R2 in `docs/DECISIONS.md`.

---

## Next milestone

**M4 — Contrastive engine (English).** The differentiator: authored
`data/contrastive/en.yaml` covering every §3.1 category, interference tagging on
items and wrong answers, targeted drills, minimal-pair listening, and the
heatmap. This is the milestone where §14 question 3 — how much of the
contrastive content you write yourself — stops being hypothetical.
