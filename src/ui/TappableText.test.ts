import { describe, expect, it } from 'vitest';
import { nextWordIndex, wordPositions } from './TappableText.tsx';

/**
 * The reader's keyboard navigation rule (SPEC §10).
 *
 * Tested here rather than through the component because the rule is what can be
 * wrong: a wrap-around at the ends, an off-by-one that skips the last word, or
 * a key we swallow that the browser needed.
 */
describe('nextWordIndex', () => {
  it('moves one word at a time', () => {
    expect(nextWordIndex('ArrowRight', 3, 10)).toBe(4);
    expect(nextWordIndex('ArrowLeft', 3, 10)).toBe(2);
  });

  it('clamps at both ends rather than wrapping', () => {
    // Prose is a line, not a ring: arriving back at the first word from the
    // last one reads as a bug to someone who cannot see the whole block.
    expect(nextWordIndex('ArrowRight', 9, 10)).toBe(9);
    expect(nextWordIndex('ArrowLeft', 0, 10)).toBe(0);
  });

  it('jumps to the ends', () => {
    expect(nextWordIndex('Home', 5, 10)).toBe(0);
    expect(nextWordIndex('End', 5, 10)).toBe(9);
  });

  it('declines every key it does not own', () => {
    // Returning null is what lets Tab leave the block and Enter press the word.
    for (const key of ['Tab', 'Enter', ' ', 'ArrowUp', 'ArrowDown', 'a', 'Escape']) {
      expect(nextWordIndex(key, 3, 10)).toBeNull();
    }
  });

  it('has nowhere to go in an empty block', () => {
    expect(nextWordIndex('ArrowRight', 0, 0)).toBeNull();
    expect(nextWordIndex('End', 0, 0)).toBeNull();
  });

  it('stays put on a single word', () => {
    expect(nextWordIndex('ArrowRight', 0, 1)).toBe(0);
    expect(nextWordIndex('ArrowLeft', 0, 1)).toBe(0);
  });
});

describe('wordPositions', () => {
  it('numbers the words and skips the gaps', () => {
    expect(
      wordPositions([
        { kind: 'word', text: 'the' },
        { kind: 'gap', text: ' ' },
        { kind: 'word', text: 'cat' },
        { kind: 'gap', text: ' ' },
        { kind: 'word', text: 'sat' },
      ]),
    ).toEqual([0, -1, 1, -1, 2]);
  });

  it('handles text with no gaps at all', () => {
    // The Japanese feed: `tokensOf` returns words with no whitespace between.
    expect(
      wordPositions([
        { kind: 'word', text: '猫' },
        { kind: 'word', text: 'が' },
      ]),
    ).toEqual([0, 1]);
  });

  it('is empty for empty text', () => {
    expect(wordPositions([])).toEqual([]);
  });
});
