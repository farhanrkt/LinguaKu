import { describe, expect, it } from 'vitest';
import { makeCloze } from './cloze.ts';

describe('makeCloze', () => {
  it('removes the word and keeps the rest intact', () => {
    expect(makeCloze('The cat sat on the mat.', 'cat')).toEqual({
      before: 'The ',
      answer: 'cat',
      after: ' sat on the mat.',
    });
  });

  it('preserves the original casing of the word it removed', () => {
    expect(makeCloze('Cats are quiet.', 'cats')?.answer).toBe('Cats');
  });

  it('only matches whole words', () => {
    expect(makeCloze('The category is wrong.', 'cat')).toBeNull();
    expect(makeCloze('A concatenation.', 'cat')).toBeNull();
  });

  it('does not tear a contraction in half', () => {
    // Blanking "let" out of "let's" would leave an unanswerable fragment.
    expect(makeCloze("Let's try something.", 'let')).toBeNull();
    expect(makeCloze("Let's try something.", "let's")?.answer).toBe("Let's");
  });

  it('treats a typographic apostrophe as a plain one', () => {
    expect(makeCloze('I don’t know.', "don't")?.answer).toBe('don’t');
  });

  it('takes the first occurrence when a word repeats', () => {
    const cloze = makeCloze('The cat saw the cat.', 'cat');
    expect(cloze?.before).toBe('The ');
    expect(cloze?.after).toBe(' saw the cat.');
  });

  it('handles a word at either end of the sentence', () => {
    expect(makeCloze('Run!', 'run')).toEqual({ before: '', answer: 'Run', after: '!' });
    expect(makeCloze('Please run', 'run')).toEqual({
      before: 'Please ',
      answer: 'run',
      after: '',
    });
  });

  it('returns null rather than an empty blank when the word is absent', () => {
    expect(makeCloze('The cat sat.', 'dog')).toBeNull();
    expect(makeCloze('The cat sat.', '')).toBeNull();
  });

  it('treats regex metacharacters in the headword as literals', () => {
    // Headwords come from the tokenizer so they are letters, digits and
    // apostrophes — but an unescaped metacharacter would throw at runtime,
    // and a wrong match is worse than no match.
    expect(makeCloze('What (really) happened?', 'really')?.answer).toBe('really');
    expect(makeCloze('a + b', '+')?.answer).toBe('+');
    expect(makeCloze('a . b', '+')).toBeNull();
  });
});

describe('what a cloze leaves to go on', () => {
  it('measures the context around the blank', async () => {
    const { clozeContext, MIN_CLOZE_CONTEXT } = await import('./cloze.ts');
    // "Yesterday?" with the word removed is "___ ?": nothing to recall from.
    expect(clozeContext(makeCloze('Yesterday?', 'yesterday')!)).toBeLessThan(MIN_CLOZE_CONTEXT);
    expect(clozeContext(makeCloze('I saw him yesterday.', 'yesterday')!)).toBeGreaterThanOrEqual(MIN_CLOZE_CONTEXT);
  });

  it('blanks a Japanese token and counts only words around it', async () => {
    const { makeTokenCloze, clozeContext } = await import('./cloze.ts');
    const tokens = ['私', 'は', 'ねこ', 'が', 'すき', 'です', '。'];
    const cloze = makeTokenCloze(tokens, 'ねこ')!;
    expect(cloze).toEqual({ before: '私は', answer: 'ねこ', after: 'がすきです。', tokenIndex: 2 });
    expect(clozeContext(cloze, tokens)).toBe(5);
    expect(makeTokenCloze(tokens, 'いぬ')).toBeNull();
  });

  it('hints with the first letter and the length', async () => {
    const { clozeHint } = await import('./cloze.ts');
    expect(clozeHint('she')).toBe('s__');
    expect(clozeHint("don't")).toBe("d__'_");
  });
});
