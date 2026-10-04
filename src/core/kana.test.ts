import { describe, expect, it } from 'vitest';
import { romajiToKana, splitKanjiReading, toHiragana, toKatakana, toRomaji } from './kana.ts';
import { gradeAnswer } from './grader.ts';

/**
 * SPEC §4.3's script ladder in both directions. The cases that matter are the
 * ones Indonesian gives no intuition for: っ and long vowels carry meaning
 * (§3.2 `MORA_TIMING`), so a converter that smooths over them teaches the
 * wrong word.
 */

describe('kana conversion', () => {
  it('round-trips between the two kana', () => {
    expect(toHiragana('ネコ')).toBe('ねこ');
    expect(toKatakana('ねこ')).toBe('ネコ');
  });

  it('romanizes the length distinctions rather than flattening them', () => {
    expect(toRomaji('きって')).toBe('kitte');
    expect(toRomaji('きて')).toBe('kite');
    expect(toRomaji('おばあさん')).toBe('obaasan');
  });
});

describe('romajiToKana (SPEC §10)', () => {
  it('converts a syllable at a time', () => {
    expect(romajiToKana('neko')).toBe('ねこ');
    expect(romajiToKana('sushi')).toBe('すし');
    expect(romajiToKana('tokyo')).toBe('ときょ');
  });

  it('handles the digraphs, which are where a naive converter breaks', () => {
    expect(romajiToKana('kyou')).toBe('きょう');
    expect(romajiToKana('shashin')).toBe('しゃしn');
    expect(romajiToKana('shashin', true)).toBe('しゃしん');
    expect(romajiToKana('jugyou')).toBe('じゅぎょう');
  });

  it('makes っ from a doubled consonant, because きって is not きて', () => {
    // SPEC §3.2 MORA_TIMING: length is meaning-bearing and Indonesian has no
    // analogue, so this is the rule a learner most needs the input to respect.
    expect(romajiToKana('kitte')).toBe('きって');
    expect(romajiToKana('kite')).toBe('きて');
    expect(romajiToKana('gakkou')).toBe('がっこう');
  });

  it('resolves n by what follows it, and waits when nothing does', () => {
    // Held rather than converted: the learner typing `nani` would otherwise
    // watch their first keystroke become ん.
    expect(romajiToKana('nihon')).toBe('にほn');
    // Until they commit, and then it is ん.
    expect(romajiToKana('nihon', true)).toBe('にほん');
    expect(romajiToKana('nihonn')).toBe('にほん');
    expect(romajiToKana('kanpai')).toBe('かんぱい');
    expect(romajiToKana('nani')).toBe('なに');
  });

  it('leaves an unfinished syllable alone, since it runs on every keystroke', () => {
    // Converting `k` or `ky` early would fight the learner's fingers.
    expect(romajiToKana('k')).toBe('k');
    expect(romajiToKana('ky')).toBe('ky');
    expect(romajiToKana('kyo')).toBe('きょ');
  });

  it('accepts the Kunrei spellings Indonesian keyboards still teach', () => {
    expect(romajiToKana('tisha')).toBe('ちしゃ');
    expect(romajiToKana('sinbun', true)).toBe('しんぶん');
  });

  it('passes punctuation and spaces through untouched', () => {
    expect(romajiToKana('neko, inu')).toBe('ねこ, いぬ');
  });
});

describe('the commit boundary (§2.7)', () => {
  it('resolves a trailing n only on commit, and the grader needs that', () => {
    // The bug this pins: KanaInput called onChange(final) and then a
    // zero-argument onSubmit in the same tick, so the caller submitted its
    // pre-conversion state. `nihon` + Enter went in as にほn — and にほn is
    // graded *wrong* against にほん, not even a near miss. A learner who typed
    // the right answer was told they were wrong and the card took an Again.
    expect(romajiToKana('nihon')).toBe('にほn');
    expect(romajiToKana('nihon', true)).toBe('にほん');
    expect(gradeAnswer(romajiToKana('nihon'), 'にほん').outcome).toBe('wrong');
    expect(gradeAnswer(romajiToKana('nihon', true), 'にほん').outcome).toBe('correct');
  });
});

/**
 * KANJIDIC2 writes a kun reading with its okurigana attached and a dot marking
 * where the kanji stops: 会 is `あ.う`, meaning the character is read あ and the
 * う is written in kana after it. A leading or trailing hyphen marks a prefix or
 * suffix position — 一 is `ひと-`, 部 is `-べ`.
 *
 * That is dictionary notation, not a reading. The kanji card rendered it
 * verbatim under the heading "bacaannya", so **878 of the 1,748 shipped kanji —
 * 50.2% — told an Indonesian beginner that 会 is read `あ.う`**, a string with a
 * full stop in it that appears in no Japanese word.
 *
 * Stripping the dot would be worse than leaving it: あう is the reading of 会う,
 * not of 会, so the "fix" would make the card false instead of merely cryptic.
 * The split keeps both halves and lets the card say each one plainly.
 */
describe('splitKanjiReading (KANJIDIC2 notation is not a reading)', () => {
  it('separates the character’s reading from its okurigana', () => {
    expect(splitKanjiReading('あ.う')).toEqual({ reading: 'あ', okurigana: 'う' });
    expect(splitKanjiReading('なが.い')).toEqual({ reading: 'なが', okurigana: 'い' });
    expect(splitKanjiReading('みずか.ら')).toEqual({ reading: 'みずか', okurigana: 'ら' });
  });

  it('leaves a plain reading alone', () => {
    // 870 of 1,748 are already clean, including every on-yomi.
    expect(splitKanjiReading('ひ')).toEqual({ reading: 'ひ', okurigana: null });
    expect(splitKanjiReading('ニチ')).toEqual({ reading: 'ニチ', okurigana: null });
  });

  it('drops the position hyphen, which is notation too', () => {
    // 13 of 1,748. The reading is right either way; what the hyphen adds is
    // that the character sits at the front or the back of a compound, and
    // inventing copy for that in thirteen cases is not worth a sentence the
    // learner has to decode.
    expect(splitKanjiReading('ひと-')).toEqual({ reading: 'ひと', okurigana: null });
    expect(splitKanjiReading('-べ')).toEqual({ reading: 'べ', okurigana: null });
  });

  it('handles a hyphen and a dot together', () => {
    expect(splitKanjiReading('-べ.き')).toEqual({ reading: 'べ', okurigana: 'き' });
  });

  it('never returns notation, whatever it is given', () => {
    for (const raw of ['あ.う', 'ひと-', '-べ.き', 'ひ', '']) {
      const split = splitKanjiReading(raw);
      expect(split.reading).not.toMatch(/[.-]/);
      expect(split.okurigana ?? '').not.toMatch(/[.-]/);
    }
  });
});
