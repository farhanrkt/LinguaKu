import { describe, expect, it } from 'vitest';
import { clipName, MAX_DICTATION_TOKENS, planClips, withinBudget } from './audio.ts';

const anchor = (id: string, text: string, maxRank: number) => ({ id, text, maxRank });
const lexeme = (id: string, headword: string, freqRank: number) => ({ id, headword, freqRank });

describe('planClips', () => {
  it('leaves out sentences no dictation card could ever use', () => {
    // D30 caps L4 at ten tokens, past which it measures working memory rather
    // than phonological form. A clip for a longer sentence is budget spent on
    // an item that cannot exist.
    const long = Array.from({ length: MAX_DICTATION_TOKENS + 3 }, () => 'word').join(' ');
    const plan = planClips('en', [], [anchor('s1', 'She left.', 100), anchor('s2', long, 100)]);
    expect(plan.map((clip) => clip.key)).toEqual(['s1']);
  });

  it('spends the budget in the order a learner meets the material', () => {
    const plan = planClips(
      'en',
      [lexeme('l1', 'rare', 7_000), lexeme('l2', 'the', 1)],
      [anchor('s1', 'A rare bird.', 6_000), anchor('s2', 'I see it.', 40)],
    );
    // One scale for both kinds: a common word, the sentence that teaches it,
    // then the rare ones. Buying every word first would starve L4, which is the
    // only rung that is withheld outright without audio.
    expect(plan.map((clip) => clip.key)).toEqual(['lex:l2', 's2', 's1', 'lex:l1']);
  });

  it('is deterministic where priorities tie (invariant 10)', () => {
    const anchors = [anchor('b', 'Two.', 500), anchor('a', 'One.', 500)];
    expect(planClips('en', [], anchors).map((clip) => clip.key)).toEqual(['a', 'b']);
    expect(planClips('en', [], [...anchors].reverse()).map((clip) => clip.key)).toEqual(['a', 'b']);
  });

  it('counts Japanese by character, since it has no spaces to count', () => {
    const short = 'これはペンです。';
    const long = 'これはとても長い日本語の文章で、聞き取りの問題には長すぎます。';
    const plan = planClips('ja', [], [anchor('s1', short, 100), anchor('s2', long, 100)]);
    expect(plan.map((clip) => clip.key)).toEqual(['s1']);
  });

  it('drops empty text rather than generating silence', () => {
    expect(planClips('en', [lexeme('l1', '', 1)], [])).toEqual([]);
  });
});

describe('clipName', () => {
  it('names a clip by its content, so an unchanged line is never re-encoded', () => {
    expect(clipName('voice-a', 'Hello.')).toBe(clipName('voice-a', 'Hello.'));
    expect(clipName('voice-a', 'Hello.')).not.toBe(clipName('voice-b', 'Hello.'));
    expect(clipName('voice-a', 'Hello.')).not.toBe(clipName('voice-a', 'Goodbye.'));
  });

  it('defaults to AAC, because iOS is the device most likely to need a clip', () => {
    // Safari only gained Ogg Opus in 17.5, and iOS is exactly where the boot
    // probe reports a dead engine (D29). A clip it cannot play is not insurance.
    expect(clipName('voice-a', 'Hello.')).toMatch(/^[0-9a-f]{16}\.m4a$/);
    expect(clipName('voice-a', 'Hello.', 'opus')).toMatch(/\.opus$/);
    expect(clipName('voice-a', 'Hello.', 'mp3')).toMatch(/\.mp3$/);
  });

  it('distinguishes speakers, so a 904-speaker model cannot drift silently', () => {
    expect(clipName('libritts', 'Hello.', 'm4a', 0)).not.toBe(
      clipName('libritts', 'Hello.', 'm4a', 7),
    );
  });
});

describe('withinBudget', () => {
  it('keeps the most valuable clips and drops the tail', () => {
    const plan = planClips(
      'en',
      Array.from({ length: 10 }, (_, i) => lexeme(`l${i}`, `w${i}`, i)),
      [],
    );
    expect(withinBudget(plan, 8 * 1024 * 3, 8 * 1024)).toHaveLength(3);
  });

  it('returns nothing rather than something when there is no room at all', () => {
    expect(withinBudget([{ key: 'a', text: 'a', priority: 1 }], 0, 8 * 1024)).toEqual([]);
  });
});
