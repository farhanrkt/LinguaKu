import { describe, expect, it } from 'vitest';
import { mulberry32 } from './rng.ts';
import {
  buildCharModel,
  generatePseudowords,
  isTooCloseToReal,
  samplePseudoword,
} from './pseudoword.ts';

const REAL = [
  'about', 'after', 'again', 'because', 'before', 'below', 'between', 'change',
  'family', 'father', 'friend', 'garden', 'happen', 'listen', 'market', 'mother',
  'number', 'people', 'person', 'picture', 'problem', 'question', 'reason',
  'remember', 'school', 'second', 'simple', 'street', 'student', 'summer',
  'teacher', 'together', 'tomorrow', 'weather', 'window', 'winter', 'writer',
];
const realWords = new Set(REAL);

/**
 * These tests fit an order-2 model: 37 words are far too few to support the
 * order-3 default, which would reject every sample as too close to a real one.
 * The production model is fitted to ~15,000 words.
 */
const TEST_ORDER = 2;

describe('buildCharModel', () => {
  it('learns which letters follow a context', () => {
    const model = buildCharModel(['cat'], 2);
    expect(model.contexts.get('ca')?.get('t')).toBe(1);
  });

  it('counts repeated contexts across the corpus', () => {
    const model = buildCharModel(['cat', 'car'], 2);
    expect(model.contexts.get('ca')?.get('t')).toBe(1);
    expect(model.contexts.get('ca')?.get('r')).toBe(1);
  });

  it('handles an empty corpus without throwing', () => {
    expect(buildCharModel([]).contexts.size).toBe(0);
  });
});

describe('samplePseudoword', () => {
  it('produces a word of the requested length', () => {
    const model = buildCharModel(REAL, TEST_ORDER);
    const word = samplePseudoword(model, mulberry32(7), { minLength: 4, maxLength: 9 });
    expect(word === null || (word.length >= 4 && word.length <= 9)).toBe(true);
  });

  it('is deterministic for a seed', () => {
    const model = buildCharModel(REAL, TEST_ORDER);
    const options = { minLength: 4, maxLength: 9 };
    expect(samplePseudoword(model, mulberry32(3), options)).toBe(
      samplePseudoword(model, mulberry32(3), options),
    );
  });

  it('returns null rather than hanging on an empty model', () => {
    expect(
      samplePseudoword(buildCharModel([], TEST_ORDER), mulberry32(1), { minLength: 4, maxLength: 9 }),
    ).toBeNull();
  });
});

describe('isTooCloseToReal', () => {
  it('rejects an actual word', () => {
    expect(isTooCloseToReal('school', realWords)).toBe(true);
  });

  it('rejects a one-letter substitution', () => {
    expect(isTooCloseToReal('schoot', realWords)).toBe(true);
  });

  it('rejects a one-letter deletion', () => {
    expect(isTooCloseToReal('schol', realWords)).toBe(true);
  });

  it('rejects a one-letter insertion', () => {
    // A learner reading charitably sees a typo, not a fake word.
    expect(isTooCloseToReal('schoool', realWords)).toBe(true);
  });

  it('accepts something genuinely distinct', () => {
    expect(isTooCloseToReal('brimtle', realWords)).toBe(false);
  });
});

describe('generatePseudowords', () => {
  const model = buildCharModel(REAL, TEST_ORDER);

  it('produces the requested number of distinct words', () => {
    const words = generatePseudowords(model, realWords, mulberry32(1), {
      count: 10,
      minLength: 4,
      maxLength: 9,
    });
    expect(words).toHaveLength(10);
    expect(new Set(words).size).toBe(10);
  });

  it('never emits a real word or a near-miss of one', () => {
    const words = generatePseudowords(model, realWords, mulberry32(2), {
      count: 20,
      minLength: 4,
      maxLength: 9,
    });
    for (const word of words) {
      expect(isTooCloseToReal(word, realWords)).toBe(false);
    }
  });

  it('emits only lowercase letters', () => {
    const words = generatePseudowords(model, realWords, mulberry32(4), {
      count: 15,
      minLength: 4,
      maxLength: 9,
    });
    for (const word of words) expect(word).toMatch(/^[a-z]{4,9}$/);
  });

  it('is reproducible, so shard hashes do not churn', () => {
    const run = () =>
      generatePseudowords(model, realWords, mulberry32(9), {
        count: 12,
        minLength: 4,
        maxLength: 9,
      });
    expect(run()).toEqual(run());
  });

  it('gives up instead of spinning when the model cannot supply enough', () => {
    const tiny = buildCharModel(['cat'], 2);
    const words = generatePseudowords(tiny, new Set(['cat']), mulberry32(1), {
      count: 50,
      minLength: 4,
      maxLength: 9,
      maxAttempts: 500,
    });
    expect(words.length).toBeLessThan(50);
  });
});
