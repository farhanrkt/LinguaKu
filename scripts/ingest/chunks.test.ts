import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { surfaceForms } from './chunkForms.ts';

const CONTENT = join(process.cwd(), 'assets', 'content');

interface Chunk {
  id: string;
  headword: string;
  gloss: string;
  note?: string;
  freqRank: number;
  band: number;
  anchors: string[];
  examples?: Array<{ id: string; text: string; tr: { id: string; text: string } }>;
}

const chunksFor = (lang: string): Chunk[] => {
  const all: Chunk[] = [];
  for (const band of [1, 2, 3, 4, 5, 6]) {
    const path = join(CONTENT, lang, `chunks.b${band}.json`);
    if (!existsSync(path)) continue;
    all.push(...(JSON.parse(readFileSync(path, 'utf8')) as { chunks: Chunk[] }).chunks);
  }
  return all;
};

describe('surfaceForms', () => {
  it('finds the inflections the corpus actually uses', () => {
    // The corpus has "took a shower", not "take a shower". Matching only the
    // base form rejected a third of the authored list on the first run.
    const forms = surfaceForms('take a shower');
    expect(forms).toContain('take a shower');
    expect(forms).toContain('took a shower');
    expect(forms).toContain('taking a shower');
  });

  it('splits a two-word phrasal verb around its object', () => {
    // `Please drop me off at the station.` is the corpus's only example of
    // "drop off", and a matcher that cannot see through the object calls the
    // phrase unattested.
    expect(surfaceForms('drop off')).toContain('drop me off');
    expect(surfaceForms('turn on')).toContain('turn it on');
  });

  it('does not split a three-word chunk, where nothing goes in the gap', () => {
    expect(surfaceForms('take a shower')).not.toContain('take me a shower');
  });

  it('leaves an unknown leading word alone rather than inventing a verb', () => {
    // No part-of-speech tags exist here (D34), so inflecting anything that
    // leads a chunk would produce "ons foot".
    expect(surfaceForms('on foot')).toEqual(['on foot']);
  });

  it('varies the possessive, since the chunk is the same either way', () => {
    expect(surfaceForms('brush my teeth')).toContain('brush her teeth');
  });
});

describe('the shipped chunks (SPEC §2.5)', () => {
  const en = chunksFor('en');
  const ja = chunksFor('ja');

  it('ships the phrase §2.5 names as its own example', () => {
    expect(en.map((chunk) => chunk.headword)).toContain('take a shower');
  });

  it('anchors every chunk to a real sentence — §2.5s ingestion rule', () => {
    for (const chunk of [...en, ...ja]) {
      expect(chunk.anchors.length).toBeGreaterThan(0);
      for (const anchor of chunk.anchors) expect(anchor.startsWith('tatoeba:')).toBe(true);
    }
  });

  it('gives every chunk an Indonesian meaning, because its parts do not compose', () => {
    for (const chunk of [...en, ...ja]) expect(chunk.gloss.length).toBeGreaterThan(0);
  });

  it('reaches a beginner in both languages', () => {
    // A chunk banded past the starter bands is never imported, so it would
    // exist in the repository and never in a session. The Japanese formulas
    // banded at 6 on the first run for exactly that reason.
    expect(en.filter((chunk) => chunk.band <= 3).length).toBeGreaterThan(30);
    expect(ja.filter((chunk) => chunk.band <= 3).length).toBeGreaterThan(5);
  });

  it('is deterministic in id order within a band (invariant 10)', () => {
    for (const band of [1, 2, 3]) {
      const path = join(CONTENT, 'en', `chunks.b${band}.json`);
      if (!existsSync(path)) continue;
      const { chunks } = JSON.parse(readFileSync(path, 'utf8')) as { chunks: Chunk[] };
      const sorted = [...chunks].sort(
        (a, b) => a.freqRank - b.freqRank || (a.id < b.id ? -1 : 1),
      );
      expect(chunks.map((chunk) => chunk.id)).toEqual(sorted.map((chunk) => chunk.id));
    }
  });
});

describe('chunks are reachable at runtime', () => {
  const shipped = [...chunksFor('en'), ...chunksFor('ja')];

  it('carries its own example sentences rather than ids to resolve', () => {
    // The regression this pins: anchors were referenced by id and resolved
    // against `anchors.b<band>.json`, which is the curated subset a band's
    // *vocabulary* is taught through (D19). A chunk draws its anchors from the
    // whole corpus, so the lookup missed for 15 of 70 English chunks and 5 of
    // 17 Japanese ones — buildTask returned null and the session silently
    // skipped them. "by the way" and 「ありがとうございます」 were unlearnable.
    for (const chunk of shipped) {
      expect(chunk.examples?.length ?? 0).toBeGreaterThan(0);
      for (const example of chunk.examples ?? []) {
        expect(example.text.length).toBeGreaterThan(0);
        expect(example.tr.text.length).toBeGreaterThan(0);
      }
    }
  });

  it('ships no shard for a band the pipeline no longer assigns', () => {
    // `chunks.b6.json` survived a re-banding because the manifest was only ever
    // added to. It shipped 23 duplicate Japanese chunks at a dead band.
    for (const lang of ['en', 'ja']) {
      const manifest = JSON.parse(
        readFileSync(join(CONTENT, lang, 'manifest.json'), 'utf8'),
      ) as { shards: Array<{ kind: string; path: string }> };
      for (const shard of manifest.shards.filter((entry) => entry.kind === 'chunks')) {
        expect(existsSync(join(CONTENT, lang, shard.path))).toBe(true);
      }
      const onDisk = readdirSync(join(CONTENT, lang)).filter((name) =>
        name.startsWith('chunks.b'),
      );
      const listed = manifest.shards
        .filter((entry) => entry.kind === 'chunks')
        .map((entry) => entry.path);
      expect(onDisk.sort()).toEqual([...listed].sort());
    }
  });
});
