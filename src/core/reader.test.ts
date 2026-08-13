import { describe, expect, it } from 'vitest';
import {
  COVERAGE_MIN_TOKENS,
  MAX_UNKNOWN_PER_SENTENCE,
  selectPassages,
  selectReading,
  tokensOf,
} from './reader.ts';
import { COVERAGE_FLOOR, lexemeIdFor } from './coverage.ts';

/**
 * SPEC §8 and §2.4. The reader's whole job is to keep the learner above the
 * comprehension floor — the line between reading and decoding — while still
 * putting something new in front of them.
 */

const sentence = (id: string, text: string) => ({
  id,
  text,
  tr: { id: `tr-${id}`, text: `terjemahan ${id}` },
});

/** The learner knows these words; everything else is new. */
const knowing = (...words: string[]) =>
  new Set(words.map((word) => lexemeIdFor('en', word)));

describe('selectReading (SPEC §8)', () => {
  const pool = [
    sentence('all-known', 'the cat sat on the mat'),
    sentence('one-new', 'the cat sat on the rug'),
    sentence('two-new', 'the cat leapt onto the rug'),
    sentence('unreadable', 'perspicacious felines circumvent obfuscated impediments'),
  ];
  const known = knowing('the', 'cat', 'sat', 'on', 'mat', 'leapt');

  it('drops anything the learner could only decode', () => {
    const chosen = selectReading({ pool, known, lang: 'en', limit: 10, seed: 1 });
    // Reading a sentence you understand a fifth of is decoding, not reading.
    expect(chosen.map((item) => item.sentence.id)).not.toContain('unreadable');
  });

  it('applies the coverage floor only where it can be met (D28)', () => {
    // Coverage is quantized to 1/n, so a six-word sentence with one new word
    // scores 0.833 and would fail an 0.85 floor — while being exactly what a
    // learner should read. Short sentences are governed by the unknown count;
    // the floor is a running-text criterion and applies to running text.
    const chosen = selectReading({ pool, known, lang: 'en', limit: 10, seed: 1 });
    expect(chosen.map((item) => item.sentence.id)).toContain('one-new');

    for (const item of chosen) {
      if (tokensOf(item.sentence).length >= COVERAGE_MIN_TOKENS) {
        expect(item.coverage).toBeGreaterThanOrEqual(COVERAGE_FLOOR);
      }
    }
  });

  it('still holds long text to the floor', () => {
    const long = sentence(
      'long-and-hard',
      'the cat sat on the mat while numerous inexplicable contraptions quietly rearranged themselves',
    );
    const chosen = selectReading({ pool: [long], known, lang: 'en', limit: 10, seed: 1 });
    expect(chosen).toEqual([]);
  });

  it('refuses sentences carrying too many unknown words at once', () => {
    const chosen = selectReading({ pool, known, lang: 'en', limit: 10, seed: 1 });
    for (const item of chosen) {
      expect(item.unknown.length).toBeLessThanOrEqual(MAX_UNKNOWN_PER_SENTENCE);
    }
  });

  it('puts sentences that teach something before ones that do not', () => {
    // A sentence with nothing new is entertainment, not input (SPEC §2.4).
    const chosen = selectReading({ pool, known, lang: 'en', limit: 10, seed: 1 });
    const teaching = chosen.findIndex((item) => item.unknown.length > 0);
    const nothingNew = chosen.findIndex((item) => item.unknown.length === 0);
    expect(teaching).toBeGreaterThanOrEqual(0);
    if (nothingNew >= 0) expect(teaching).toBeLessThan(nothingNew);
  });

  it('names which words are new, so the reader can mark them', () => {
    const chosen = selectReading({ pool, known, lang: 'en', limit: 10, seed: 1 });
    const oneNew = chosen.find((item) => item.sentence.id === 'one-new');
    expect(oneNew?.unknown).toEqual([lexemeIdFor('en', 'rug')]);
  });

  it('honours the limit', () => {
    expect(selectReading({ pool, known, lang: 'en', limit: 2, seed: 1 })).toHaveLength(2);
  });

  it('is deterministic for a seed and varies between seeds', () => {
    const big = Array.from({ length: 40 }, (_, index) =>
      sentence(`s${index}`, 'the cat sat on the mat'),
    );
    const ids = (seed: number) =>
      selectReading({ pool: big, known, lang: 'en', limit: 5, seed }).map((i) => i.sentence.id);
    expect(ids(1)).toEqual(ids(1));
    expect(ids(1)).not.toEqual(ids(2));
  });

  it('gives a learner who knows nothing nothing to read, rather than nonsense', () => {
    // The honest empty state: at zero known words every sentence is below the
    // floor, and the reader says so instead of serving a wall of unknown text.
    expect(selectReading({ pool, known: new Set(), lang: 'en', limit: 10, seed: 1 })).toEqual([]);
  });
});

describe('tokensOf', () => {
  it('uses the pipeline’s own tokens where they exist', () => {
    // Japanese ships build-time morphological tokens (D10); the reader must not
    // re-split them, and could not do so correctly if it tried.
    const japanese = {
      id: 'ja',
      text: '私は学校へ行く',
      tokens: ['私', 'は', '学校', 'へ', '行く'],
      tr: { id: 't', text: 'saya pergi ke sekolah' },
    };
    expect(tokensOf(japanese)).toEqual(['私', 'は', '学校', 'へ', '行く']);
  });

  it('falls back to the shared tokenizer for English', () => {
    // The *same* tokenizer the pipeline used, so coverage cannot drift between
    // what was measured and what is shown.
    expect(tokensOf(sentence('en', 'the cat sat'))).toEqual(['the', 'cat', 'sat']);
  });
});

describe('the floors that catch what the count rule misses', () => {
  it('rejects a fragment, however well the learner knows it', () => {
    // Tatoeba is full of these. "Hi." is not reading.
    const pool = [sentence('frag', 'hi there')];
    const known = knowing('hi', 'there');
    expect(selectReading({ pool, known, lang: 'en', limit: 5, seed: 1 })).toEqual([]);
  });

  it('rejects a short sentence that is mostly unknown', () => {
    // Two of four words new passes "at most two unknown" on a technicality, and
    // is 50% coverage — decoding, not reading.
    const pool = [sentence('thin', 'the quokka devours pastry')];
    const known = knowing('the', 'pastry');
    expect(selectReading({ pool, known, lang: 'en', limit: 5, seed: 1 })).toEqual([]);
  });

  it('still accepts a normal sentence with one new word', () => {
    const pool = [sentence('good', 'the cat sat on the rug')];
    const known = knowing('the', 'cat', 'sat', 'on');
    expect(selectReading({ pool, known, lang: 'en', limit: 5, seed: 1 })).toHaveLength(1);
  });
});

describe('selectPassages — §2.4 on running text', () => {
  /** A passage of `tokens` distinct words, `unknownCount` of them unknown. */
  const withCoverage = (id: string, tokens: number, unknownCount: number) => {
    const words = Array.from({ length: tokens }, (_, i) => `${id}w${i}`);
    return {
      passage: {
        id,
        title: id,
        text: `${words.join(' ')}.`,
        tokens,
        vocab: words,
      },
      known: new Set(
        words.slice(0, tokens - unknownCount).map((word) => lexemeIdFor('en', word)),
      ),
    };
  };

  it('reaches §2.4s band, which a single sentence cannot (D28)', () => {
    // 50 tokens, 2 unknown → 0.96, inside [0.92, 0.98]. On a 10-token sentence
    // there is no reachable value in that band at all.
    const { passage: text, known } = withCoverage('p1', 50, 2);
    const [item] = selectPassages({ pool: [text], known, lang: 'en', limit: 5, seed: 1 });
    expect(item?.coverage).toBeCloseTo(0.96, 2);
    expect(item?.inBand).toBe(true);
  });

  it('never returns a passage below the floor §2.4 sets', () => {
    const { passage: text, known } = withCoverage('p1', 50, 15); // 0.70
    expect(selectPassages({ pool: [text], known, lang: 'en', limit: 5, seed: 1 })).toEqual([]);
  });

  it('prefers in-band passages over merely-readable ones', () => {
    const easy = withCoverage('easy', 50, 0); // 1.00 — nothing new
    const banded = withCoverage('banded', 50, 2); // 0.96
    const known = new Set([...easy.known, ...banded.known]);
    const picked = selectPassages({
      pool: [easy.passage, banded.passage],
      known,
      lang: 'en',
      limit: 2,
      seed: 1,
    });
    expect(picked[0]?.passage.id).toBe('banded');
  });

  it('counts words outside the inventory as unknown rather than absent', () => {
    // Ten known words and forty the app has never heard of. Scoring over the
    // in-inventory slice would call that perfect comprehension; it is 20%.
    const inInventory = Array.from({ length: 10 }, (_, i) => `known${i}`);
    const rest = Array.from({ length: 40 }, (_, i) => `obscure${i}`);
    const known = new Set(inInventory.map((word) => lexemeIdFor('en', word)));
    const picked = selectPassages({
      pool: [
        {
          id: 'p',
          title: 'p',
          text: `${[...inInventory, ...rest].join(' ')}.`,
          tokens: 50,
          vocab: inInventory,
        },
      ],
      known,
      lang: 'en',
      limit: 1,
      seed: 1,
    });
    expect(picked).toEqual([]);
  });

  it('is deterministic under a seed', () => {
    const pool = Array.from({ length: 8 }, (_, i) => withCoverage(`p${i}`, 50, 2));
    const known = new Set(pool.flatMap((entry) => [...entry.known]));
    const run = () =>
      selectPassages({
        pool: pool.map((entry) => entry.passage),
        known,
        lang: 'en',
        limit: 3,
        seed: 7,
      }).map((item) => item.passage.id);
    expect(run()).toEqual(run());
  });
});
