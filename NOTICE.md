# Attribution

LinguaKu is built on freely licensed data. This file is the canonical list; it
is enforced by `npm run check:licenses` and mirrored by the in-app attribution
screen (SPEC §5.2). The machine-readable source of truth is
[`data/licenses.json`](data/licenses.json).

Terms below were read at the linked source on the date given. **Licences drift —
re-verify before each release.**

---

## Code and data are licensed separately

**The LinguaKu source code is MIT-licensed** — see [`LICENSE`](LICENSE).

**The bundled linguistic datasets are not.** They keep their own terms, and MIT
does not reach them:

| What | Terms |
|---|---|
| `assets/content/en/**` (Tatoeba-derived) | **CC BY 2.0 FR** — attribution required |
| `assets/content/ja/**` (Tatoeba + EDRDG) | **CC BY-SA 4.0** — attribution **and share-alike** |
| `assets/content/*/contrastive.json` and `data/contrastive/*.yaml` | MIT, with the code — authored for this project, nothing third-party attaches |

Two consequences worth stating plainly. Reusing this repository's code is
unrestricted; **redistributing the Japanese content shards obliges you to CC
BY-SA 4.0**, because mixing Tatoeba with EDRDG data takes the stricter term
rather than the more convenient one. And EDRDG's acknowledgement requirement is
a condition of use, not a courtesy — the in-app attribution screen satisfies it
and must not be removed from a derivative.

---

## LinguaKu authored content

The Indonesian-L1 contrastive taxonomy (SPEC §3): the error categories, the
Indonesian explanations, the minimal pairs, the drills and the false-friend
list. Authored for this project and versioned in
[`data/contrastive/`](data/contrastive/); `assets/content/*/contrastive.json` is
generated from it.

- Licence: **MIT**, with the project's code — no third-party terms attach.
- Verified: 2026-08-11

The example sentences in that content are written for it, not taken from the
corpus, so nothing here inherits Tatoeba's attribution requirement. It ships
under the project's code licence, settled as MIT at v1.0.0 (decision D12).

## Tatoeba

Example sentences and translation alignments.

- Source: <https://tatoeba.org/en/downloads>
- Licence: **CC BY 2.0 FR** — <https://creativecommons.org/licenses/by/2.0/fr/>
- Verified: 2026-08-10

Sentence text is released under CC BY 2.0 FR, and a subset is additionally
available under CC0 1.0. Attribution to Tatoeba and its contributors is
required for the CC BY portion.

LinguaKu's English content in `assets/content/en/` is derived from Tatoeba: the
sentence pairs are Tatoeba sentences and their Indonesian translations, and the
**word frequency ranking is computed from the Tatoeba English corpus itself**
rather than from an external word list.

**Audio is not covered by that licence.** Each audio file's licence is chosen by
the contributor who recorded it; where the licence field is empty, the clip may
not be reused outside Tatoeba. LinguaKu therefore resolves audio licences
per file and ships no clip whose terms are unknown.

## Simple English Wikipedia

Graded reading passages.

- Source: <https://dumps.wikimedia.org/simplewiki/>
- Licence: **CC BY-SA 4.0** — <https://creativecommons.org/licenses/by-sa/4.0/>
- Verified: 2026-08-12

Cleared at source on the same day as the Wiktionary glosses, and confirmed the
same two ways: `dumps.wikimedia.org/legal.html` and the wiki's own rights info.

**Share-alike applies.** `assets/content/en/passages.b*.json` ship under CC
BY-SA 4.0, separately from the Tatoeba-derived sentence shards, which remain CC
BY 2.0 FR. Every passage records the article title it was taken from, so
attribution is traceable per paragraph rather than only per corpus — the reader
shows that title above each text.

## Indonesian Wiktionary (id.wiktionary.org)

Short Indonesian glosses for English and Japanese headwords.

- Source: <https://dumps.wikimedia.org/idwiktionary/>
- Licence: **CC BY-SA 4.0** — <https://creativecommons.org/licenses/by-sa/4.0/>
- Verified: 2026-08-12

Parsed from the Wikimedia dump directly rather than from a third-party
extraction, so the only terms that apply are Wikimedia's own. Confirmed two
ways on 2026-08-12: `dumps.wikimedia.org/legal.html` states that original
textual content is licensed under the GFDL **and** CC BY-SA 4.0, and
id.wiktionary's own API reports CC BY-SA 4.0 as the site's rights info.

**Share-alike applies.** `assets/content/{en,ja}/glosses.b*.json` ship under CC
BY-SA 4.0. They are kept as separate shards precisely so that this does not
travel into the Tatoeba-derived sentence shards, which remain CC BY 2.0 FR.

Glosses are shown as reference — in the reader's word panel and on first
exposure — and are **never used to grade an answer**. Coverage is partial by
measurement (30% of English lexemes, 4% of Japanese), and a word without one
says so rather than being given an invented meaning.

## JMdict (Electronic Dictionary Research and Development Group)

Japanese lexicon: headwords, readings and senses.

- Source: <https://www.edrdg.org/jmdict/j_jmdict.html>
- Licence: **CC BY-SA 4.0** — <https://www.edrdg.org/edrdg/licence.html>
- Verified: 2026-08-10

## KRADFILE / RADKFILE (Electronic Dictionary Research and Development Group)

Kanji decomposition into visible components — what makes SPEC §2.11's
`校 = 木 + 交` breakdown possible.

- Source: <https://www.edrdg.org/krad/kradinf.html>
- Licence: **CC BY-SA 4.0** — <https://www.edrdg.org/edrdg/licence.html>
- Verified: 2026-08-11

Cleared at M6 by reading both pages. `kradinf.html` states the files are
available under the EDRDG Licence, and `licence.html` lists RADKFILE/KRADFILE
among the files it covers. **KRADFILE2 / RADKFILE2 are copyright Jim Rose and
are not used here.**

## IPAdic, via kuromoji (Nara Institute of Science and Technology)

Build-time morphological tokenization of Japanese sentences.

- Source: <https://github.com/takuyaa/kuromoji.js>
- Licence: **Apache-2.0**, with the IPAdic BSD-style notice
- Verified: 2026-08-11

A build tool rather than shipped content: the dictionary never reaches the
browser (decision D10). What ships is the token boundaries and readings derived
from it, which is why it is acknowledged here.

## KANJIDIC2 (Electronic Dictionary Research and Development Group)

Kanji readings, grades, stroke counts and frequency data.

- Source: <https://www.edrdg.org/wiki/index.php/KANJIDIC_Project>
- Licence: **CC BY-SA 4.0** — <https://www.edrdg.org/edrdg/licence.html>
- Verified: 2026-08-10

### EDRDG conditions that shape the product

These files are the property of the Electronic Dictionary Research and
Development Group, and are used in conformance with the Group's licence. Two
conditions have design consequences:

1. **Acknowledgement must be visible.** EDRDG requires acknowledgement on each
   screen that displays dictionary content, or — for applications — on a
   dedicated screen such as "About". LinguaKu ships an in-app attribution
   screen and credits EDRDG on Japanese item detail views.
2. **Share-alike.** Any content shard derived from EDRDG data ships under
   CC BY-SA 4.0. This constrains what may be combined into the same file.

---

## Not yet cleared

Datasets under evaluation are listed as `candidates` in
[`data/licenses.json`](data/licenses.json) with the specific blocker for each.
Nothing may enter `assets/` under a candidate key — the licence gate fails the
build if it does.
