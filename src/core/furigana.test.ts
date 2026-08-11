import { describe, expect, it } from 'vitest';
import {
  FURIGANA_FADE_STABILITY_DAYS,
  furiganaFor,
  isFaded,
  kanjiIn,
} from './furigana.ts';
import { isKana, isKanji, toHiragana, toKatakana, toRomaji } from './kana.ts';

const build = (
  tokens: string[],
  readings: string[],
  stability: Record<string, number> = {},
  scriptMode: 'romaji' | 'kana' | 'kanji' = 'kanji',
) =>
  furiganaFor({
    tokens,
    readings,
    stabilityOf: (kanji) => stability[kanji] ?? null,
    scriptMode,
  });

describe('kana conversion', () => {
  it('converts katakana readings to hiragana, which is what furigana is set in', () => {
    expect(toHiragana('ガッコウ')).toBe('がっこう');
    expect(toKatakana('がっこう')).toBe('ガッコウ');
  });

  it('leaves kanji and punctuation alone', () => {
    expect(toHiragana('学校へ行く。')).toBe('学校へ行く。');
  });

  it('recognizes the scripts', () => {
    expect(isKanji('学')).toBe(true);
    expect(isKanji('が')).toBe(false);
    expect(isKana('が')).toBe(true);
    expect(isKana('ガ')).toBe(true);
    expect(isKana('学')).toBe(false);
  });
});

describe('toRomaji', () => {
  it('romanizes plain kana', () => {
    expect(toRomaji('ねこ')).toBe('neko');
    expect(toRomaji('わたし')).toBe('watashi');
  });

  it('uses Hepburn for the sounds Indonesian learners meet on signage', () => {
    expect(toRomaji('し')).toBe('shi');
    expect(toRomaji('つ')).toBe('tsu');
    expect(toRomaji('ち')).toBe('chi');
    expect(toRomaji('ふ')).toBe('fu');
  });

  it('keeps digraphs together', () => {
    expect(toRomaji('きゃ')).toBe('kya');
    expect(toRomaji('とうきょう')).toBe('toukyou');
    expect(toRomaji('じゃ')).toBe('ja');
  });

  it('doubles the consonant after a small tsu', () => {
    // SPEC §3.2's MORA_TIMING: きて and きって are different words, and
    // Indonesian has no length distinction to hear it with.
    expect(toRomaji('きって')).toBe('kitte');
    expect(toRomaji('きて')).toBe('kite');
  });

  it('lengthens a vowel rather than dropping it', () => {
    // おばさん (aunt) versus おばあさん (grandmother) — the spec's own example.
    expect(toRomaji('おばさん')).toBe('obasan');
    expect(toRomaji('おばあさん')).toBe('obaasan');
    expect(toRomaji('コーヒー')).toBe('koohii');
  });

  it('passes through what it cannot map', () => {
    expect(toRomaji('ねこ、a')).toBe('neko、a');
  });
});

describe('furigana fading (SPEC §2.3, §4.3)', () => {
  it('shows a reading over a kanji the learner has never studied', () => {
    expect(build(['学校'], ['ガッコウ'])).toEqual([{ text: '学校', ruby: 'がっこう' }]);
  });

  it('drops it once every kanji in the token is stable', () => {
    const stable = { 学: 40, 校: 40 };
    expect(build(['学校'], ['ガッコウ'], stable)).toEqual([{ text: '学校', ruby: null }]);
  });

  it('keeps it while any kanji in the token is still weak', () => {
    // The stated consequence of token-level ruby: 学校 keeps its reading until
    // *both* characters have faded, because a reading cannot be half-removed.
    const half = { 学: 40 };
    expect(build(['学校'], ['ガッコウ'], half)).toEqual([{ text: '学校', ruby: 'がっこう' }]);
  });

  it('fades each token independently', () => {
    const segments = build(['私', 'は', '学校', 'へ', '行く'], ['ワタシ', 'ハ', 'ガッコウ', 'ヘ', 'イク'], {
      私: 60,
      学: 60,
      校: 60,
    });
    expect(segments[0]).toEqual({ text: '私', ruby: null });
    expect(segments[2]).toEqual({ text: '学校', ruby: null });
    // 行 was never studied, so 行く keeps its reading.
    expect(segments[4]).toEqual({ text: '行く', ruby: 'いく' });
  });

  it('never puts a reading over kana', () => {
    const segments = build(['は', 'ひらがな'], ['ハ', 'ヒラガナ']);
    expect(segments).toEqual([
      { text: 'は', ruby: null },
      { text: 'ひらがな', ruby: null },
    ]);
  });

  it('treats an unstudied kanji as needing the scaffold, not as faded', () => {
    expect(isFaded(null)).toBe(false);
    expect(isFaded(0)).toBe(false);
    expect(isFaded(FURIGANA_FADE_STABILITY_DAYS - 0.1)).toBe(false);
    expect(isFaded(FURIGANA_FADE_STABILITY_DAYS)).toBe(true);
  });

  it('carries okurigana inside the token rather than splitting it', () => {
    // 行く is いく — the reading spans a kanji and a kana, which is exactly why
    // this is done per token.
    expect(build(['行く'], ['イク'])).toEqual([{ text: '行く', ruby: 'いく' }]);
  });
});

describe('the script ladder (SPEC §4.3)', () => {
  const tokens = ['私', 'は', '学校', 'へ', '行く'];
  const readings = ['ワタシ', 'ハ', 'ガッコウ', 'ヘ', 'イク'];

  it('romaji transliterates everything and shows no ruby', () => {
    const segments = build(tokens, readings, {}, 'romaji');
    expect(segments.map((s) => s.text).join(' ')).toBe('watashi ha gakkou he iku');
    expect(segments.every((s) => s.ruby === null)).toBe(true);
  });

  it('kana replaces kanji with their readings instead of annotating them', () => {
    const segments = build(tokens, readings, {}, 'kana');
    expect(segments.map((s) => s.text).join('')).toBe('わたしはがっこうへいく');
    expect(segments.every((s) => s.ruby === null)).toBe(true);
  });

  it('kanji keeps the real text and annotates what is not yet known', () => {
    const segments = build(tokens, readings, {}, 'kanji');
    expect(segments.map((s) => s.text).join('')).toBe('私は学校へ行く');
    expect(segments.filter((s) => s.ruby !== null).length).toBeGreaterThan(0);
  });

  it('shows the same text in every mode once everything has faded', () => {
    // The ladder's endpoint: a learner who knows the kanji reads plain Japanese.
    const known = { 私: 60, 学: 60, 校: 60, 行: 60 };
    const segments = build(tokens, readings, known, 'kanji');
    expect(segments.every((s) => s.ruby === null)).toBe(true);
  });
});

describe('kanjiIn', () => {
  it('lists the distinct kanji a sentence would teach', () => {
    expect(kanjiIn('私は学校へ行く。')).toEqual(['私', '学', '校', '行']);
  });

  it('returns nothing for a kana-only sentence', () => {
    expect(kanjiIn('ひらがなだけ')).toEqual([]);
  });
});
