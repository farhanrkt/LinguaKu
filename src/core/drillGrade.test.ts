import { describe, expect, it } from 'vitest';
import { gradeDrill } from './drillGrade.ts';

describe('gradeDrill', () => {
  it('accepts the chosen option only when it is the answer', () => {
    const drill = { type: 'mcq', prompt: 'Last night we ___ a movie.', options: ['watched', 'watches'], answer: 'watched' };
    expect(gradeDrill(drill, 'watched').correct).toBe(true);
    // One letter away is a different form, and the form is the question.
    expect(gradeDrill(drill, 'watches').correct).toBe(false);
  });

  it('never accepts a correction prompt retyped unchanged', () => {
    const drill = {
      type: 'correction',
      prompt: 'My sister work at a bank near our house.',
      answer: 'My sister works at a bank near our house.',
    };
    expect(gradeDrill(drill, drill.prompt)).toEqual({ outcome: 'wrong', correct: false });
    expect(gradeDrill(drill, drill.answer)).toEqual({ outcome: 'correct', correct: true });
    // Fixed the error, slipped elsewhere: a near-miss, and still right.
    expect(gradeDrill(drill, 'My sister works at a bank near our hose.')).toEqual({
      outcome: 'near-miss',
      correct: true,
    });
    // Slipped elsewhere and left the error in: wrong.
    expect(gradeDrill(drill, 'My sister work at a bank near our hose.').correct).toBe(false);
  });

  it('forgives a cloze typo only where the tested ending survives', () => {
    const drill = { type: 'cloze', prompt: 'Yesterday I ___ a film.', answer: 'watched' };
    expect(gradeDrill(drill, 'wacthed').correct).toBe(true);
    expect(gradeDrill(drill, 'watches').correct).toBe(false);
  });

  it('accepts formatting, contractions and script, which are never the tested difference', () => {
    expect(gradeDrill({ type: 'cloze', prompt: '___', answer: "doesn't" }, 'does not').correct).toBe(true);
    expect(gradeDrill({ type: 'cloze', prompt: '___', answer: 'します' }, 'shimasu').correct).toBe(true);
    expect(gradeDrill({ type: 'cloze', prompt: '___', answer: 'します' }, 'シマス').correct).toBe(true);
  });

});
