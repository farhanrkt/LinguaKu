import { describe, expect, it } from 'vitest';
import { acceptedAnswers, editDistance, gradeAnswer, gradeForOutcome, normalizeAnswer, toleranceFor } from './grader.ts';

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

/**
 * SPEC §2.7's acceptance criterion names this first: *"grader unit tests cover
 * **romaji↔kana equivalence**, typos within tolerance, and English
 * contractions."* Two of the three were covered. This file's own header said
 * the third *"is M6 and plugs in as another normalization pass"* — M6 shipped
 * `src/core/kana.ts` with every conversion needed, and nothing plugged it in.
 *
 * What made it a live defect rather than a missing test: `KanaInput` ships a
 * **katakana toggle**, so the app hands the learner a button that writes ネコ
 * and then marks it wrong, and §4.3 puts a new Japanese learner at `kana`
 * script mode by default.
 */
describe('kana and romaji are the same answer (SPEC §2.7, §4.3)', () => {
  it('accepts katakana for a hiragana answer — the app’s own toggle writes it', () => {
    const result = gradeAnswer('ネコ', 'ねこ');
    expect(result.outcome).toBe('correct');
    expect(result.reason).toBe('script');
  });

  it('accepts hiragana for a katakana answer, which is where readings ship', () => {
    expect(gradeAnswer('ねこ', 'ネコ').outcome).toBe('correct');
  });

  it('accepts romaji, because §4.3 starts a Japanese learner below kana', () => {
    expect(gradeAnswer('neko', 'ねこ').outcome).toBe('correct');
    expect(gradeAnswer('tabemasu', 'たべます').outcome).toBe('correct');
  });

  it('handles the two rules Indonesian has no analogue for', () => {
    // A doubled consonant and a held `n` are meaning-bearing (SPEC §3.2).
    expect(gradeAnswer('kitte', 'きって').outcome).toBe('correct');
    expect(gradeAnswer('kite', 'きって').outcome).not.toBe('correct');
    expect(gradeAnswer('nihon', 'にほん').outcome).toBe('correct');
  });

  it('folds half-width katakana, which some IMEs produce', () => {
    expect(gradeAnswer('ﾈｺ', 'ねこ').outcome).toBe('correct');
  });

  it('leaves English alone — romaji is only tried where kana is expected', () => {
    // Without the gate, `romajiToKana` would turn an English answer into kana
    // and compare that, which can only ever make grading worse.
    expect(gradeAnswer('cat', 'cat').reason).toBe('exact');
    expect(gradeAnswer('neko', 'cat').outcome).toBe('wrong');
    expect(gradeAnswer('bank', 'bank').reason).toBe('exact');
  });

  it('still calls a wrong kana answer wrong', () => {
    expect(gradeAnswer('いぬ', 'ねこ').outcome).toBe('wrong');
    expect(gradeAnswer('inu', 'ねこ').outcome).toBe('wrong');
  });

  it('measures a kana near-miss on one script, not across two', () => {
    // たべました vs たべます differs by two characters; katakana for the same
    // word must not be read as five differences on top of that.
    const sameWord = gradeAnswer('タベマス', 'たべます');
    expect(sameWord.distance).toBe(0);
  });
});

/**
 * The other half of the same defect. `KanaInput` has no kanji conversion step,
 * 71.9% of shipped Japanese lexemes have kanji in the headword, and §4.3 puts
 * the learner at `kana`. The reading is the form they can produce.
 */
describe('acceptedAnswers (SPEC §2.7, §4.3)', () => {
  it('accepts the reading beside a kanji headword', () => {
    expect(acceptedAnswers({ lang: 'ja', answer: '私', reading: 'わたし' })).toEqual([
      '私',
      'わたし',
    ]);
  });

  it('keeps the headword first, because that is what the verdict shows', () => {
    const [first] = acceptedAnswers({ lang: 'ja', answer: '彼女', reading: 'かのじょ' });
    expect(first).toBe('彼女');
  });

  it('adds nothing when the reading is the headword', () => {
    // 2,000-odd lexemes are written in kana already; a duplicate candidate
    // would just be graded twice.
    expect(acceptedAnswers({ lang: 'ja', answer: 'ねこ', reading: 'ねこ' })).toEqual(['ねこ']);
    expect(acceptedAnswers({ lang: 'ja', answer: 'ネコ', reading: 'ねこ' })).toEqual(['ネコ']);
  });

  it('adds nothing for English, and nothing when there is no reading', () => {
    expect(acceptedAnswers({ lang: 'en', answer: 'cat', reading: null })).toEqual(['cat']);
    expect(acceptedAnswers({ lang: 'ja', answer: '私' })).toEqual(['私']);
  });

  it('grades the reading as correct once it is accepted', () => {
    const accepted = acceptedAnswers({ lang: 'ja', answer: '私', reading: 'わたし' });
    expect(gradeAnswer('わたし', accepted).outcome).toBe('correct');
    // And through the script pass, so romaji works on the same card.
    expect(gradeAnswer('watashi', accepted).outcome).toBe('correct');
    expect(gradeAnswer('私', accepted).reason).toBe('exact');
    expect(gradeAnswer('かのじょ', accepted).outcome).toBe('wrong');
  });
});
