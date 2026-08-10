import { describe, expect, it } from 'vitest';
import {
  gradeAnswer,
  gradeForOutcome,
  editDistance,
  normalizeAnswer,
  toleranceFor,
} from './grader.ts';

describe('normalizeAnswer', () => {
  it('ignores case, punctuation and stray spacing', () => {
    expect(normalizeAnswer('  The CAT, sat!  ')).toBe('the cat sat');
  });

  it('treats a typographic apostrophe as a plain one', () => {
    expect(normalizeAnswer('don’t')).toBe(normalizeAnswer("don't"));
  });

  it('keeps apostrophes inside words, since they carry meaning', () => {
    expect(normalizeAnswer("don't")).toBe("don't");
  });
});

describe('editDistance', () => {
  it('is zero for identical strings', () => {
    expect(editDistance('kucing', 'kucing')).toBe(0);
  });

  it('counts single edits', () => {
    expect(editDistance('kucing', 'kucng')).toBe(1); // deletion
    expect(editDistance('cat', 'bat')).toBe(1); // substitution
    expect(editDistance('cat', 'cats')).toBe(1); // insertion
  });

  it('charges only 1 for an adjacent transposition, the commonest typo', () => {
    expect(editDistance('becuase', 'because')).toBe(1);
    expect(editDistance('teh', 'the')).toBe(1);
  });

  it('handles an empty side', () => {
    expect(editDistance('', 'cat')).toBe(3);
    expect(editDistance('cat', '')).toBe(3);
  });
});

describe('toleranceFor', () => {
  it('gives short words no slack, because one letter makes another word', () => {
    expect(toleranceFor('cat')).toBe(0);
    expect(toleranceFor('bad')).toBe(0);
  });

  it('scales with length', () => {
    expect(toleranceFor('because')).toBe(1);
    expect(toleranceFor('kesempatan')).toBe(1);
    expect(toleranceFor('extraordinary')).toBe(2);
  });

  it('caps, because close enough stops being close enough', () => {
    expect(toleranceFor('a'.repeat(200))).toBe(3);
  });
});

describe('gradeAnswer', () => {
  it('accepts an exact answer', () => {
    expect(gradeAnswer('kucing', 'kucing')).toMatchObject({ outcome: 'correct', reason: 'exact' });
  });

  it('accepts an answer that differs only in formatting', () => {
    expect(gradeAnswer('  Kucing! ', 'kucing')).toMatchObject({
      outcome: 'correct',
      reason: 'formatting',
    });
  });

  it('accepts either side of a contraction (SPEC §3.1: Indonesian has none)', () => {
    expect(gradeAnswer('I am hungry', "I'm hungry")).toMatchObject({
      outcome: 'correct',
      reason: 'contraction',
    });
    expect(gradeAnswer("I'm hungry", 'I am hungry')).toMatchObject({ outcome: 'correct' });
    expect(gradeAnswer('I can not swim', "I can't swim")).toMatchObject({ outcome: 'correct' });
  });

  it('calls a typo a near-miss, not a failure', () => {
    const result = gradeAnswer('becuase', 'because');
    expect(result.outcome).toBe('near-miss');
    expect(result.reason).toBe('typo');
    expect(result.matched).toBe('because');
  });

  it('does not let a near-miss swallow a genuinely different short word', () => {
    expect(gradeAnswer('bad', 'bed').outcome).toBe('wrong');
    expect(gradeAnswer('ship', 'sheep').outcome).toBe('wrong');
  });

  it('rejects a different answer', () => {
    expect(gradeAnswer('anjing', 'kucing')).toMatchObject({
      outcome: 'wrong',
      reason: 'mismatch',
    });
  });

  it('treats an empty answer as wrong rather than crashing', () => {
    expect(gradeAnswer('   ', 'kucing')).toMatchObject({ outcome: 'wrong', reason: 'empty' });
  });

  it('accepts any of several valid answers', () => {
    const accepted = ['kucing', 'meong'];
    expect(gradeAnswer('meong', accepted).outcome).toBe('correct');
    expect(gradeAnswer('kucing', accepted).outcome).toBe('correct');
    expect(gradeAnswer('anjing', accepted).outcome).toBe('wrong');
  });

  it('reports the closest alternative when nothing matched exactly', () => {
    const result = gradeAnswer('kesempata', ['kesempatan', 'peluang']);
    expect(result.outcome).toBe('near-miss');
    expect(result.matched).toBe('kesempatan');
  });

  it('handles an empty accepted list without pretending the answer was right', () => {
    expect(gradeAnswer('anything', []).outcome).toBe('wrong');
  });
});

describe('gradeForOutcome', () => {
  it('maps outcomes onto FSRS ratings', () => {
    expect(gradeForOutcome('correct')).toBe(3);
    expect(gradeForOutcome('near-miss')).toBe(2);
    expect(gradeForOutcome('wrong')).toBe(1);
  });

  it('never invents Easy, which no signal we collect justifies', () => {
    const grades = (['correct', 'near-miss', 'wrong'] as const).map(gradeForOutcome);
    expect(grades).not.toContain(4);
  });
});
