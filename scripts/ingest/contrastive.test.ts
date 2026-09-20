import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { detectInterference } from '../../src/core/interference.ts';

/**
 * Integrity checks over the *shipped* contrastive content, generated from
 * data/contrastive/en.yaml and committed. These run in CI, so authored content
 * that breaks an M4 acceptance criterion fails the build rather than reaching a
 * learner as an unanswerable question.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PACK = join(ROOT, 'assets', 'content', 'en', 'contrastive.json');

interface Drill {
  id: string;
  categoryId: string;
  type: 'mcq' | 'cloze' | 'minimal-pair' | 'correction';
  prompt: string;
  options?: string[];
  answer: string;
  explain: string;
  difficulty?: number;
  audio?: true;
  say?: string;
}

interface Category {
  id: string;
  kind: 'morphosyntax' | 'phonology' | 'lexis';
  label: string;
  summary: string;
  note: {
    l1: string;
    target: string;
    minimalPair: { wrong: string; right: string; gloss: string };
    tip?: string;
  };
  drills: Drill[];
}

interface Pack {
  sources: string[];
  lang: string;
  l1: string;
  categories: Category[];
  falseFriends: Array<{ en: string; idLookalike: string; enMeans: string; idWordIs: string }>;
}

const pack = JSON.parse(readFileSync(PACK, 'utf8')) as Pack;
const drills = pack.categories.flatMap((category) => category.drills);
const ids = new Set(pack.categories.map((category) => category.id));

describe('M4 acceptance (SPEC §12)', () => {
  it('ships at least 100 authored contrastive items', () => {
    expect(drills.length).toBeGreaterThanOrEqual(100);
  });

  it('covers every morphosyntax category SPEC §3.1 names', () => {
    for (const required of [
      'TENSE_ASPECT',
      'AGREEMENT_3SG',
      'COPULA_BE',
      'ARTICLES',
      'PLURAL_S',
      'PRONOUN_GENDER',
      'NP_WORD_ORDER',
      'PREPOSITIONS',
      'PASSIVE_OVERUSE',
      'MODAL_BISA',
    ]) {
      expect(ids.has(required)).toBe(true);
    }
  });

  it('covers the phonology SPEC §3.1 names', () => {
    const phonology = pack.categories.filter((category) => category.kind === 'phonology');
    // Missing phonemes, the three vowel contrasts, final consonants, clusters
    // and stress — SPEC §3.1's four bullets, unpacked.
    expect(phonology.length).toBeGreaterThanOrEqual(9);
    for (const required of [
      'PHON_TH',
      'PHON_V_F',
      'PHON_Z_S',
      'PHON_SH_ZH',
      'VOWEL_IH_EE',
      'VOWEL_AE_E',
      'VOWEL_UH_OO',
      'FINAL_DEVOICING',
      'CLUSTER_REDUCTION',
      'WORD_STRESS',
    ]) {
      expect(ids.has(required)).toBe(true);
    }
  });

  it('ships the curated false-friend list SPEC §3.1 asks for', () => {
    expect(pack.falseFriends.length).toBeGreaterThanOrEqual(60);
    for (const entry of pack.falseFriends) {
      expect(entry.en.length).toBeGreaterThan(0);
      expect(entry.enMeans.length).toBeGreaterThan(0);
    }
  });

  it('has no duplicate false-friend entries', () => {
    const seen = pack.falseFriends.map((entry) => entry.en);
    expect(new Set(seen).size).toBe(seen.length);
  });
});

describe('SPEC §2.9: every tagged item carries an authored contrastive note', () => {
  it('gives every category the full three-part note', () => {
    for (const category of pack.categories) {
      expect(category.note.l1.length).toBeGreaterThan(40);
      expect(category.note.target.length).toBeGreaterThan(40);
      expect(category.note.minimalPair.wrong.length).toBeGreaterThan(0);
      expect(category.note.minimalPair.right.length).toBeGreaterThan(0);
      expect(category.note.minimalPair.wrong).not.toBe(category.note.minimalPair.right);
    }
  });

  it('explains every single drill — 100%, not 80%', () => {
    for (const drill of drills) {
      expect(drill.explain.trim().length).toBeGreaterThan(0);
    }
  });

  it('writes the notes in Indonesian, not English', () => {
    // A crude smell test, but it catches the real failure: a note drafted in
    // English and never translated. Every note should contain common Indonesian
    // function words.
    const indonesian = /\b(yang|tidak|kamu|di|itu|dan|bahasa)\b/i;
    for (const category of pack.categories) {
      expect(category.note.l1).toMatch(indonesian);
      expect(category.note.target).toMatch(indonesian);
    }
  });
});

describe('drill integrity', () => {
  it('gives every category something to be estimated from (SPEC §3.3)', () => {
    for (const category of pack.categories) {
      expect(category.drills.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('has no duplicate drill ids', () => {
    expect(new Set(drills.map((drill) => drill.id)).size).toBe(drills.length);
  });

  it('files every drill under a category that exists', () => {
    for (const drill of drills) expect(ids.has(drill.categoryId)).toBe(true);
  });

  it('always includes the answer among the options', () => {
    for (const drill of drills.filter((d) => d.type === 'mcq' || d.type === 'minimal-pair')) {
      expect(drill.options).toBeDefined();
      expect(drill.options).toContain(drill.answer);
    }
  });

  it('never gives a typed drill options to pick from', () => {
    // Cloze and correction are both typed: the learner writes the answer, and
    // options would turn a production task into a recognition one (§2.15).
    for (const drill of drills.filter((d) => d.type === 'cloze' || d.type === 'correction')) {
      expect(drill.options).toBeUndefined();
    }
  });

  it('gives every correction drill a sentence to fix and a different one back', () => {
    // SPEC §8's "perbaiki kalimat ini". A correction whose answer equals its
    // prompt is a trick question; the compiler refuses it and this holds the
    // line in the shipped file.
    const corrections = drills.filter((drill) => drill.type === 'correction');
    expect(corrections.length).toBeGreaterThanOrEqual(10);
    for (const drill of corrections) {
      expect(drill.prompt).not.toBe(drill.answer);
      expect(drill.explain.length).toBeGreaterThan(0);
    }
  });

  it('marks every audio-dependent drill so it can be withheld (SPEC §2.6)', () => {
    for (const drill of drills.filter((d) => d.type === 'minimal-pair')) {
      expect(drill.audio).toBe(true);
      expect(drill.say).toBe(drill.answer);
      expect(drill.options).toContain(drill.say);
    }
    // And nothing else claims to need audio.
    for (const drill of drills.filter((d) => d.audio)) {
      expect(drill.type).toBe('minimal-pair');
    }
  });

  it('leaves enough text-only drills to run without any audio at all', () => {
    // The floor that matters if R1 turns out badly on real devices: with every
    // minimal pair withheld, there must still be a usable engine.
    const textOnly = drills.filter((drill) => !drill.audio);
    expect(textOnly.length).toBeGreaterThanOrEqual(80);
    const categoriesWithTextDrills = new Set(textOnly.map((drill) => drill.categoryId));
    for (const category of pack.categories.filter((c) => c.kind !== 'phonology')) {
      expect(categoriesWithTextDrills.has(category.id)).toBe(true);
    }
  });

  it('keeps authored difficulties on the Elo scale', () => {
    for (const drill of drills) {
      if (drill.difficulty === undefined) continue;
      expect(drill.difficulty).toBeGreaterThan(700);
      expect(drill.difficulty).toBeLessThan(1700);
    }
  });
});

describe('provenance (SPEC §5.2)', () => {
  it('declares itself as authored content, not as a third-party dataset', () => {
    expect(pack.sources).toEqual(['linguaku-authored']);
  });
});

describe('the detector and the authored categories agree', () => {
  it('has an authored note for every category the detector can emit', () => {
    // If `detectInterference` can tag an error, SPEC §2.9 requires an
    // explanation to exist for it. This is the join between the two halves.
    const emittable = [
      detectInterference({ raw: 'he', expected: 'she' }),
      detectInterference({ raw: 'go', expected: 'goes', before: 'She' }),
      detectInterference({ raw: 'walk', expected: 'walked' }),
      detectInterference({ raw: 'is', expected: 'are' }),
      detectInterference({ raw: 'a', expected: 'the' }),
      detectInterference({ raw: 'book', expected: 'books', before: 'two' }),
      detectInterference({ raw: 'in', expected: 'on' }),
      detectInterference({ raw: 'can', expected: 'could' }),
    ].flat();

    expect(emittable.length).toBeGreaterThan(0);
    for (const categoryId of new Set(emittable)) {
      expect(ids.has(categoryId)).toBe(true);
    }
  });
});
