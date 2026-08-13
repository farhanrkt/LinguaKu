import { describe, expect, it } from 'vitest';
import { romajiToKana, toHiragana, toKatakana, toRomaji } from './kana.ts';

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
