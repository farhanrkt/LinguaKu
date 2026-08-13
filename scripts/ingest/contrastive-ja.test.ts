import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * SPEC §3.2. The Japanese taxonomy is a different shape from the English one,
 * and these tests exist to keep it that way.
 *
 * §3.2's distinguishing instruction is not about difficulties — every course has
 * those. It is: *"Positive transfer — surface these explicitly as 'ini mirip
 * bahasa Indonesia' notes. Naming the parallel is elaborative encoding, and it
 * is a real morale advantage this audience is never told about."* A ja.yaml that
 * only listed what is hard would have missed the point of the section, so the
 * build fails on it and so does this file.
 */

const PACK = join(
  dirname(fileURLToPath(import.meta.url)),
  '..', '..', 'assets', 'content', 'ja', 'contrastive.json',
);

interface Drill {
  id: string;
  categoryId: string;
  type: 'mcq' | 'cloze' | 'minimal-pair';
  prompt: string;
  options?: string[];
  answer: string;
  explain: string;
  audio?: true;
  say?: string;
}

interface Category {
  id: string;
  kind: string;
  label: string;
  summary: string;
  positiveTransfer?: true;
  note: {
    l1: string;
    target: string;
    minimalPair: { wrong: string; right: string; gloss: string };
    tip?: string;
  };
  drills: Drill[];
}

const pack = JSON.parse(readFileSync(PACK, 'utf8')) as {
  sources: string[];
  lang: string;
  categories: Category[];
};
const ids = new Set(pack.categories.map((category) => category.id));
const drills = pack.categories.flatMap((category) => category.drills);
const positive = pack.categories.filter((category) => category.positiveTransfer);

describe('positive transfer (SPEC §3.2, the part that makes this section unusual)', () => {
  it('names the advantages, not only the difficulties', () => {
    expect(positive.length).toBeGreaterThanOrEqual(5);
  });

  it('covers each advantage §3.2 lists by name', () => {
    // Vowels, open syllables, classifiers, no plural/article/gender, topic
    // fronting, politeness registers.
    for (const required of [
      'VOWELS_MATCH',
      'OPEN_SYLLABLES',
      'CLASSIFIERS_FAMILIAR',
      'NO_PLURAL_NO_ARTICLE',
      'TOPIC_FRONTING',
      'POLITENESS_REGISTERS',
    ]) {
      expect(ids.has(required)).toBe(true);
    }
  });

  it('carries no drills, because there is nothing to remediate', () => {
    for (const category of positive) {
      expect(category.drills).toHaveLength(0);
    }
  });

  it('actually says the Indonesian thing out loud', () => {
    // The note has to name the L1 parallel — that naming *is* the mechanism
    // (elaborative encoding), not framing around it.
    for (const category of positive) {
      expect(category.note.l1).toMatch(/Indonesia|Jawa|Sunda|kamu/i);
      expect(category.note.l1.length).toBeGreaterThan(40);
    }
  });

  it('mentions the concrete Indonesian classifiers §3.2 names', () => {
    const note = pack.categories.find((c) => c.id === 'CLASSIFIERS_FAMILIAR')?.note;
    const text = `${note?.l1} ${note?.target} ${note?.tip ?? ''}`;
    for (const word of ['ekor', 'buah', 'orang', 'batang']) {
      expect(text).toContain(word);
    }
    for (const counter of ['匹', '個', '人', '本']) {
      expect(text).toContain(counter);
    }
  });

  it('names the ngoko/krama parallel for Javanese and Sundanese speakers', () => {
    const note = pack.categories.find((c) => c.id === 'POLITENESS_REGISTERS')?.note;
    expect(`${note?.l1} ${note?.target}`).toMatch(/ngoko|krama/i);
  });
});

describe('the genuine difficulties (SPEC §3.2)', () => {
  it('covers the categories §3.2 names as hard', () => {
    for (const required of [
      'PARTICLES_WA_GA',
      'PARTICLES_NI_DE',
      'WORD_ORDER_SOV',
      'MORA_TIMING',
      'VERB_CONJUGATION',
      'ADJ_CONJUGATION',
      'SCRIPT_KANA',
      'GIVING_RECEIVING',
    ]) {
      expect(ids.has(required)).toBe(true);
    }
  });

  it('drills every category that is not a positive-transfer note', () => {
    for (const category of pack.categories.filter((c) => !c.positiveTransfer)) {
      expect(category.drills.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('drills the mora-timing minimal pairs §3.2 names', () => {
    const mora = pack.categories.find((c) => c.id === 'MORA_TIMING');
    const spoken = mora?.drills.filter((drill) => drill.audio).map((drill) => drill.say) ?? [];
    // おばさん/おばあさん and きて/きって are the spec's own examples.
    expect(spoken).toContain('おばあさん');
    expect(spoken).toContain('きって');
  });

  it('explains every drill, and never leaves one in English', () => {
    // Tested as a negative, deliberately. The failure worth catching is an
    // explanation drafted in English and never translated; a positive word-list
    // cannot express that, because these are one-line explanations and a
    // perfectly Indonesian sentence like "っ menahan konsonan satu ketukan"
    // happens to contain none of the obvious function words. English function
    // words, by contrast, are near-absent from Indonesian, so their presence is
    // a real signal.
    const english = /\b(the|is|are|was|were|this|that|with|from|for|you|and|of|to|in)\b/i;
    for (const drill of drills) {
      expect(drill.explain.trim().length).toBeGreaterThan(0);
      expect(drill.explain).not.toMatch(english);
      expect(drill.prompt.length).toBeGreaterThan(0);
    }
  });

  it('keeps every multiple-choice answer among its options', () => {
    // Cloze and correction are both typed answers; only the choice types have
    // options at all, and an answer missing from them is unanswerable.
    for (const drill of drills.filter((d) => d.type === 'mcq' || d.type === 'minimal-pair')) {
      expect(drill.options).toContain(drill.answer);
    }
  });

  it('marks audio-dependent drills so they can be withheld (SPEC §2.6)', () => {
    for (const drill of drills.filter((d) => d.type === 'minimal-pair')) {
      expect(drill.audio).toBe(true);
      expect(drill.say).toBe(drill.answer);
    }
  });

  it('leaves enough text-only drills to run with no audio at all', () => {
    expect(drills.filter((drill) => !drill.audio).length).toBeGreaterThanOrEqual(25);
  });
});

describe('provenance', () => {
  it('declares itself as authored content', () => {
    expect(pack.sources).toEqual(['linguaku-authored']);
    expect(pack.lang).toBe('ja');
  });
});
