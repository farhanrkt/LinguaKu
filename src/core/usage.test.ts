import { describe, expect, it } from 'vitest';
import { formsOf, usesWord } from './usage.ts';

const en = (sentence: string, word: string): boolean => usesWord({ sentence, word, lang: 'en' });

describe('usesWord — the cases the substring check got wrong', () => {
  it('does not give credit for a word hiding inside another', () => {
    // All three were PASS before, and all three are band-1 function words —
    // the ones a beginner meets first, so the failure was concentrated on the
    // most-taught vocabulary in the app.
    expect(en('I have a banana.', 'an')).toBe(false);
    expect(en('I want to educate people.', 'cat')).toBe(false);
    expect(en('She is honest.', 'on')).toBe(false);
  });

  it('accepts the word when it is genuinely there', () => {
    expect(en('I ate an apple.', 'an')).toBe(true);
    expect(en('The cat is asleep.', 'cat')).toBe(true);
    expect(en('The book is on the table.', 'on')).toBe(true);
  });

  it('accepts an irregular form the learner actually needed', () => {
    // These were the §2.7 failure: the learner produced the word in the form
    // the sentence required and was told they had not used it at all.
    expect(en('I took the bus yesterday.', 'take')).toBe(true);
    expect(en('She went home early.', 'go')).toBe(true);
    expect(en('I have two children.', 'child')).toBe(true);
    expect(en('He taught me to swim.', 'teach')).toBe(true);
  });

  it('accepts regular inflections by rule, not by table', () => {
    expect(en('He studies every night.', 'study')).toBe(true);
    expect(en('They were walking home.', 'walk')).toBe(true);
    expect(en('I stopped at the corner.', 'stop')).toBe(true);
    expect(en('She is making dinner.', 'make')).toBe(true);
    expect(en('We watched a film.', 'watch')).toBe(true);
  });

  it('is not fooled by a longer word that merely starts the same', () => {
    // The prefix rule only accepts a known inflectional suffix, so a compound
    // that happens to begin with the headword is still a different word.
    expect(en('I crossed the walkway.', 'walk')).toBe(false);
    expect(en('He is a carpenter.', 'car')).toBe(false);
  });

  it('matches a multi-word chunk only as a run, in order', () => {
    expect(en('How are you today?', 'how are you')).toBe(true);
    expect(en('I took a shower.', 'take a shower')).toBe(true);
    // Present, but not as the phrase.
    expect(en('How old are you?', 'how are you')).toBe(false);
  });

  it('is case and punctuation insensitive', () => {
    expect(en('TOOK the bus!', 'take')).toBe(true);
    expect(en('"Walk," she said.', 'walk')).toBe(true);
  });

  it('falls back to containment for Japanese, and says why', () => {
    // No runtime morphological analyser (D10, invariant 6), so there is no
    // honest tokenization of a learner's own Japanese sentence.
    expect(usesWord({ sentence: '私は水を飲みます。', word: '水', lang: 'ja' })).toBe(true);
    expect(usesWord({ sentence: '私は本を読みます。', word: '水', lang: 'ja' })).toBe(false);
  });

  it('vouches for nothing when there is no word to look for', () => {
    expect(en('Anything at all.', '')).toBe(true);
  });
});

describe('formsOf', () => {
  it('leads with the base form the learner was taught', () => {
    expect(formsOf('take')[0]).toBe('take');
    expect(formsOf('take')).toContain('took');
  });

  it('returns just the word where there is no irregular form', () => {
    expect(formsOf('walk')).toEqual(['walk']);
  });
});
