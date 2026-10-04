import { describe, expect, it } from 'vitest';
import { GOJUON, kanaSyllabary, toHiragana, toRomaji } from './kana.ts';

/**
 * The app ships 1,748 kanji as learnable items and **fifteen** single-kana
 * lexemes — and those are particles like は and の, not the alphabet. The only
 * hiragana instruction anywhere is two multiple-choice trivia questions, while
 * the first screen promises *"Bahasa Jepang — Mulai dari nol, dari hiragana."*
 *
 * So a complete beginner was put at `kana` script mode and handed sentences in
 * a writing system nothing had taught them. This is the inventory that fixes
 * that: the syllabary as schedulable items, hiragana before katakana.
 *
 * It is written out rather than generated from a corpus, and it needs no shard:
 * the gojūon is the writing system, not a dataset.
 */
describe('the syllabary a beginner has to learn', () => {
  const all = kanaSyllabary();

  it('covers both scripts completely, and nothing twice', () => {
    // 46 base + 25 voiced + 33 contracted = 104 per script.
    expect(all).toHaveLength(208);
    expect(new Set(all.map((s) => s.kana)).size).toBe(208);
    expect(new Set(all.map((s) => s.id)).size).toBe(208);
  });

  it('leaves out the small kana, which are never a syllable alone', () => {
    // ぁぃぅぇぉゃゅょ appear only as the second half of a digraph, and the
    // digraphs are taught whole. `ROMAJI` carries them for the converter.
    for (const small of ['ぁ', 'ぃ', 'ぅ', 'ぇ', 'ぉ', 'ゃ', 'ゅ', 'ょ']) {
      expect(all.some((s) => s.kana === small)).toBe(false);
    }
  });

  it('teaches hiragana first, then katakana', () => {
    const firstKatakana = all.findIndex((s) => s.script === 'katakana');
    expect(firstKatakana).toBe(104);
    expect(all.slice(0, 104).every((s) => s.script === 'hiragana')).toBe(true);
    expect(all[0]).toMatchObject({ kana: 'あ', romaji: 'a', row: 'a' });
    expect(all[104]).toMatchObject({ kana: 'ア', romaji: 'a' });
  });

  it('starts with the five vowels every other row is built from', () => {
    expect(all.slice(0, 5).map((s) => s.kana)).toEqual(['あ', 'い', 'う', 'え', 'お']);
  });

  it('puts the voiced and contracted forms after the base 46', () => {
    const base = all.filter((s) => s.script === 'hiragana').slice(0, 46);
    expect(base.map((s) => s.kana).join('')).toContain('ん');
    // が is voiced か: it comes after every plain row.
    expect(all.findIndex((s) => s.kana === 'が')).toBeGreaterThan(
      all.findIndex((s) => s.kana === 'ろ'),
    );
    // きゃ is contracted: after every voiced one.
    expect(all.findIndex((s) => s.kana === 'きゃ')).toBeGreaterThan(
      all.findIndex((s) => s.kana === 'ぽ'),
    );
  });

  it('gives every character a reading the converter agrees with', () => {
    // The romaji is not a second hand-written table that could drift from the
    // one `romajiToKana` round-trips against — it is read off that one.
    for (const syllable of all) {
      expect(syllable.romaji.length).toBeGreaterThan(0);
      expect(syllable.romaji).toBe(toRomaji(toHiragana(syllable.kana)));
    }
  });

  it('has no row the converter cannot romanise', () => {
    for (const [, characters] of GOJUON) {
      for (const kana of characters) expect(toRomaji(kana)).toMatch(/^[a-z]+$/);
    }
  });
});
