import { describe, expect, it } from 'vitest';
import { gradeBuild, isBuildable, makePuzzle, MAX_TOKENS } from './sentenceBuild.ts';
import { tokenizeLatinPreservingCase } from './tokenize.ts';

/** The caller's job in the app, done here so the tests read as sentences. */
const en = (text: string): string[] => tokenizeLatinPreservingCase(text);

const pool = ['banana', 'quickly', 'yesterday', 'blue'];

describe('isBuildable', () => {
  it('rejects a sentence too short to be a puzzle', () => {
    expect(isBuildable(en('I am here.'))).toBe(false);
  });

  it('accepts a sentence in the workable range', () => {
    expect(isBuildable(en('I am Tom and this is Mary.'))).toBe(true);
  });

  it('rejects a sentence too long to lay out on a phone', () => {
    expect(isBuildable(Array.from({ length: MAX_TOKENS + 1 }, () => 'word'))).toBe(false);
  });
});

describe('makePuzzle', () => {
  it('offers every word of the sentence, plus decoys', () => {
    const puzzle = makePuzzle({ tokens: en('She got an A today.'), distractorPool: pool, seed: 1 });
    expect(puzzle).not.toBeNull();
    expect(puzzle!.solution).toEqual(['she', 'got', 'an', 'a', 'today']);
    // Five words plus two decoys.
    expect(puzzle!.tiles).toHaveLength(7);
    for (const word of puzzle!.solution) {
      expect(puzzle!.tiles.some((tile) => tile.text.toLowerCase() === word)).toBe(true);
    }
  });

  it('never uses a decoy that is already in the sentence', () => {
    // A decoy that appears in the answer would make a second, equally correct
    // arrangement — and then mark a right answer wrong.
    const puzzle = makePuzzle({
      tokens: en('The blue car is mine.'),
      distractorPool: ['blue', 'car', 'banana'],
      seed: 7,
    });
    const decoys = puzzle!.tiles.filter(
      (tile) => !puzzle!.solution.includes(tile.text.toLowerCase()),
    );
    expect(decoys.every((tile) => tile.text === 'banana')).toBe(true);
  });

  it('keeps the corpus casing on the tiles', () => {
    // The learner is handed the words; they never chose the capital letter.
    const puzzle = makePuzzle({ tokens: en('She got an A today.'), distractorPool: pool, seed: 2 });
    expect(puzzle!.tiles.some((tile) => tile.text === 'She')).toBe(true);
  });

  it('is deterministic for a seed, and varies across seeds', () => {
    const order = (seed: number) =>
      makePuzzle({ tokens: en('She got an A today.'), distractorPool: pool, seed })!.tiles.map(
        (t) => t.text,
      );
    expect(order(1)).toEqual(order(1));
    expect(order(1)).not.toEqual(order(9));
  });

  it('declines a sentence outside the workable range', () => {
    expect(makePuzzle({ tokens: en('Too short.'), distractorPool: pool, seed: 1 })).toBeNull();
  });

  it('copes with a pool that has nothing usable in it', () => {
    const puzzle = makePuzzle({ tokens: en('She got an A today.'), distractorPool: [], seed: 1 });
    expect(puzzle!.tiles).toHaveLength(5);
  });
});

describe('gradeBuild', () => {
  const solution = ['she', 'got', 'an', 'a', 'today'];

  it('accepts the right order', () => {
    expect(gradeBuild(['She', 'got', 'an', 'A', 'today'], solution).outcome).toBe('correct');
  });

  it('ignores case, which the learner never chose', () => {
    expect(gradeBuild(['she', 'GOT', 'an', 'a', 'today'], solution).outcome).toBe('correct');
  });

  it('points at the first word that broke the order', () => {
    const result = gradeBuild(['She', 'an', 'got', 'a', 'today'], solution);
    expect(result.outcome).toBe('wrong');
    expect(result.firstWrongAt).toBe(1);
  });

  it('is wrong when a word is missing or spare', () => {
    expect(gradeBuild(['she', 'got', 'an', 'a'], solution).outcome).toBe('wrong');
    expect(gradeBuild([...solution, 'banana'], solution).outcome).toBe('wrong');
  });
});

/**
 * The defect this API shape exists to prevent.
 *
 * `makePuzzle` used to take the sentence *text* and tokenize it itself, with
 * `tokenizeLatin` — which returns a Japanese sentence as **one token**, because
 * it is one unbroken run of letters. So `isBuildable` rejected every Japanese
 * sentence, `buildCandidates` filtered them all out, and the exercise was
 * silently English-only. Nothing failed; a Japanese learner simply never met it,
 * and the Japanese explanation string could never render.
 *
 * Japanese anchors ship build-time morphological tokens (D10) and all 2,152 of
 * them have them. The fix was to take tokens rather than text.
 */
describe('Japanese, which the text-based version silently excluded', () => {
  // As shipped in assets/content/ja/anchors.b1.json.
  const tokens = ['私', 'は', '毎日', '本', 'を', '読み', 'ます', '。'];

  it('is buildable from its shipped tokens', () => {
    expect(isBuildable(tokens)).toBe(true);
    // And the whole sentence as one string is not, which is what used to happen.
    expect(isBuildable(['私は毎日本を読みます'])).toBe(false);
  });

  it('makes a puzzle whose tiles are words, not the whole sentence', () => {
    const puzzle = makePuzzle({ tokens, distractorPool: ['水', '猫'], seed: 3 });
    expect(puzzle).not.toBeNull();
    expect(puzzle!.solution).toEqual(['私', 'は', '毎日', '本', 'を', '読み', 'ます']);
    expect(puzzle!.tiles.length).toBe(9);
  });

  it('drops punctuation rather than asking the learner to place it', () => {
    // The morphological tokenizer emits 。 and ！ as tokens of their own, and
    // placing a full stop is not word-order practice.
    const puzzle = makePuzzle({ tokens, distractorPool: [], seed: 1 });
    expect(puzzle!.solution).not.toContain('。');
    expect(puzzle!.tiles.some((tile) => tile.text === '。')).toBe(false);
  });

  it('never offers punctuation as a decoy either', () => {
    const puzzle = makePuzzle({ tokens, distractorPool: ['！', '？', '水'], seed: 1 });
    expect(puzzle!.tiles.every((tile) => tile.text !== '！')).toBe(true);
  });
});
