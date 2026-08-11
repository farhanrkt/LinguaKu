import { describe, expect, it } from 'vitest';
import { detectInterference, slotBefore } from './interference.ts';

/**
 * SPEC §2.9 / §3.1. The rule these tests exist to hold: **a wrong tag is worse
 * than no tag.** A false positive shows a learner an explanation of a mistake
 * they did not make and moves an Elo rating on evidence that is not there, so
 * roughly half of what follows is about the detector staying quiet.
 */

const detect = (raw: string, expected: string, before?: string) =>
  detectInterference({ raw, expected, ...(before === undefined ? {} : { before }) });

describe('PRONOUN_GENDER (SPEC §3.1: the highest-frequency error)', () => {
  it('catches he for she and back again', () => {
    expect(detect('he', 'she')).toContain('PRONOUN_GENDER');
    expect(detect('she', 'he')).toContain('PRONOUN_GENDER');
  });

  it('catches the object and possessive forms too', () => {
    expect(detect('him', 'her')).toContain('PRONOUN_GENDER');
    expect(detect('his', 'her')).toContain('PRONOUN_GENDER');
    expect(detect('himself', 'herself')).toContain('PRONOUN_GENDER');
  });

  it('stays quiet when the learner simply wrote another word', () => {
    expect(detect('cat', 'she')).not.toContain('PRONOUN_GENDER');
    expect(detect('they', 'dog')).not.toContain('PRONOUN_GENDER');
  });
});

describe('TENSE_ASPECT', () => {
  it('catches a dropped regular -ed', () => {
    expect(detect('walk', 'walked')).toContain('TENSE_ASPECT');
    expect(detect('live', 'lived')).toContain('TENSE_ASPECT');
    expect(detect('study', 'studied')).toContain('TENSE_ASPECT');
  });

  it('catches the common irregulars', () => {
    expect(detect('go', 'went')).toContain('TENSE_ASPECT');
    expect(detect('eat', 'ate')).toContain('TENSE_ASPECT');
    expect(detect('buy', 'bought')).toContain('TENSE_ASPECT');
  });

  it('fires in both directions, because the choice of form is the error', () => {
    expect(detect('went', 'go')).toContain('TENSE_ASPECT');
    expect(detect('walked', 'walk')).toContain('TENSE_ASPECT');
  });

  it('does not fire on two unrelated verbs', () => {
    expect(detect('walked', 'talked')).not.toContain('TENSE_ASPECT');
  });
});

describe('AGREEMENT_3SG versus PLURAL_S — the ambiguity that needs context', () => {
  it('reads the -s as agreement after a third-person subject', () => {
    const hits = detect('go', 'goes', 'She');
    expect(hits).toContain('AGREEMENT_3SG');
    expect(hits).not.toContain('PLURAL_S');
  });

  it('reads the -s as a plural after a quantifier', () => {
    const hits = detect('book', 'books', 'I have two');
    expect(hits).toContain('PLURAL_S');
    expect(hits).not.toContain('AGREEMENT_3SG');
  });

  it('says nothing at all when the context does not settle it', () => {
    // `work`/`works` with no frame is genuinely ambiguous, and guessing would
    // move the wrong rating half the time.
    expect(detect('work', 'works')).toEqual([]);
  });

  it('still catches the irregulars without needing context', () => {
    // No noun pluralizes `have` into `has`, so there is nothing to disambiguate.
    expect(detect('have', 'has')).toContain('AGREEMENT_3SG');
    expect(detect('do', 'does')).toContain('AGREEMENT_3SG');
  });

  it('does not read an over-applied -s as a missing one', () => {
    // Writing "goes" where "go" belonged is a different mistake.
    expect(detect('goes', 'go', 'They')).not.toContain('AGREEMENT_3SG');
  });
});

describe('slotBefore', () => {
  it('recognizes a third-person subject', () => {
    expect(slotBefore('She')).toBe('verb');
    expect(slotBefore('Every morning it')).toBe('verb');
  });

  it('recognizes a noun introducer', () => {
    expect(slotBefore('I have two')).toBe('noun');
    expect(slotBefore('There are many')).toBe('noun');
  });

  it('refuses to decide on a word that could introduce either', () => {
    // "this works" and "this book" are both fine.
    expect(slotBefore('I think this')).toBe('unknown');
    expect(slotBefore('')).toBe('unknown');
    expect(slotBefore(undefined)).toBe('unknown');
  });
});

describe('COPULA_BE', () => {
  it('catches the wrong form of be', () => {
    expect(detect('is', 'are')).toContain('COPULA_BE');
    expect(detect('was', 'were')).toContain('COPULA_BE');
  });

  it('can legitimately report both copula and tense at once', () => {
    // `is` for `was` really is both mistakes, and both estimates should move.
    const hits = detect('is', 'was');
    expect(hits).toContain('COPULA_BE');
    expect(hits).toContain('TENSE_ASPECT');
  });
});

describe('ARTICLES', () => {
  it('catches the wrong article', () => {
    expect(detect('a', 'the')).toContain('ARTICLES');
    expect(detect('a', 'an')).toContain('ARTICLES');
  });

  it('catches an article typed where a word belonged, and the reverse', () => {
    expect(detect('the', 'water')).toContain('ARTICLES');
    expect(detect('water', 'the')).toContain('ARTICLES');
  });
});

describe('PREPOSITIONS and MODAL_BISA', () => {
  it('catches one preposition swapped for another', () => {
    expect(detect('in', 'on')).toContain('PREPOSITIONS');
    expect(detect('at', 'to')).toContain('PREPOSITIONS');
  });

  it('does not call a preposition-for-noun slip a mapping error', () => {
    expect(detect('house', 'on')).not.toContain('PREPOSITIONS');
  });

  it('catches can / could collapsing into one another', () => {
    expect(detect('can', 'could')).toContain('MODAL_BISA');
    expect(detect('may', 'can')).toContain('MODAL_BISA');
  });
});

describe('staying quiet', () => {
  it('reports nothing for a correct answer', () => {
    expect(detect('she', 'she')).toEqual([]);
  });

  it('reports nothing for an empty answer', () => {
    expect(detect('', 'she')).toEqual([]);
    expect(detect('   ', 'she')).toEqual([]);
  });

  it('ignores case and punctuation, like the grader does', () => {
    expect(detect('He!', 'she')).toContain('PRONOUN_GENDER');
  });

  it('declines to analyse a multi-word answer', () => {
    // Dictation and free production are not single-form slips, and treating
    // them as such would tag half of every sentence.
    expect(detect('she is', 'he is')).toEqual([]);
  });

  it('reports nothing for a plainly unrelated word', () => {
    expect(detect('elephant', 'tomorrow')).toEqual([]);
  });
});
