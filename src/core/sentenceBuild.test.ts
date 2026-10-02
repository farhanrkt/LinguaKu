import { describe, expect, it } from 'vitest';
import { gradeBuild, isBuildable, makePuzzle, MAX_TOKENS } from './sentenceBuild.ts';

const pool = ['banana', 'quickly', 'yesterday', 'blue'];

describe('isBuildable', () => {
  it('rejects a sentence too short to be a puzzle', () => {
    expect(isBuildable('I am here.')).toBe(false);
  });

  it('accepts a sentence in the workable range', () => {
    expect(isBuildable('I am Tom and this is Mary.')).toBe(true);
  });

  it('rejects a sentence too long to lay out on a phone', () => {
    expect(isBuildable(Array.from({ length: MAX_TOKENS + 1 }, () => 'word').join(' '))).toBe(false);
  });
});

describe('makePuzzle', () => {
  it('offers every word of the sentence, plus decoys', () => {
    const puzzle = makePuzzle({ text: 'She got an A today.', distractorPool: pool, seed: 1 });
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
      text: 'The blue car is mine.',
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
    const puzzle = makePuzzle({ text: 'She got an A today.', distractorPool: pool, seed: 2 });
    expect(puzzle!.tiles.some((tile) => tile.text === 'She')).toBe(true);
  });

  it('is deterministic for a seed, and varies across seeds', () => {
    const order = (seed: number) =>
      makePuzzle({ text: 'She got an A today.', distractorPool: pool, seed })!.tiles.map(
        (t) => t.text,
      );
    expect(order(1)).toEqual(order(1));
    expect(order(1)).not.toEqual(order(9));
  });

  it('declines a sentence outside the workable range', () => {
    expect(makePuzzle({ text: 'Too short.', distractorPool: pool, seed: 1 })).toBeNull();
  });

  it('copes with a pool that has nothing usable in it', () => {
    const puzzle = makePuzzle({ text: 'She got an A today.', distractorPool: [], seed: 1 });
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
