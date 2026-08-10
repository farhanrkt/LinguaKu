# Attribution

LinguaKu is built on freely licensed data. This file is the canonical list; it
is enforced by `npm run check:licenses` and mirrored by the in-app attribution
screen (SPEC §5.2). The machine-readable source of truth is
[`data/licenses.json`](data/licenses.json).

Terms below were read at the linked source on the date given. **Licences drift —
re-verify before each release.**

---

## Tatoeba

Example sentences and translation alignments.

- Source: <https://tatoeba.org/en/downloads>
- Licence: **CC BY 2.0 FR** — <https://creativecommons.org/licenses/by/2.0/fr/>
- Verified: 2026-08-10

Sentence text is released under CC BY 2.0 FR, and a subset is additionally
available under CC0 1.0. Attribution to Tatoeba and its contributors is
required for the CC BY portion.

**Audio is not covered by that licence.** Each audio file's licence is chosen by
the contributor who recorded it; where the licence field is empty, the clip may
not be reused outside Tatoeba. LinguaKu therefore resolves audio licences
per file and ships no clip whose terms are unknown.

## JMdict (Electronic Dictionary Research and Development Group)

Japanese lexicon: headwords, readings and senses.

- Source: <https://www.edrdg.org/jmdict/j_jmdict.html>
- Licence: **CC BY-SA 4.0** — <https://www.edrdg.org/edrdg/licence.html>
- Verified: 2026-08-10

## JMnedict (Electronic Dictionary Research and Development Group)

Japanese proper names.

- Source: <https://www.edrdg.org/enamdict/enamdict_doc.html>
- Licence: **CC BY-SA 4.0** — <https://www.edrdg.org/edrdg/licence.html>
- Verified: 2026-08-10

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
