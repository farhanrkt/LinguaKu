import type { Rng } from './rng.ts';

/**
 * Pseudoword generation for the Yes/No vocabulary check (SPEC §4.2).
 *
 * A Yes/No test without pseudowords measures confidence, not vocabulary — a
 * learner who says yes to everything scores full marks. The pseudowords have to
 * be *plausible*, though: a learner who can spot the fakes by their shape is
 * still not being measured on vocabulary. So they are sampled from a character
 * trigram model fitted to real English words, which reproduces English
 * phonotactics without reproducing English words.
 *
 * Generated at build time from the corpus we already ship, so this adds no
 * licence surface and no runtime cost.
 */

const START = '';
const END = '';

/** Next-character counts, keyed by the characters before them. */
export interface CharModel {
  order: number;
  contexts: ReadonlyMap<string, ReadonlyMap<string, number>>;
}

/**
 * Order 3 (a quadgram model), not 2. A trigram model mashes morphemes together
 * — it happily emits `admaninja` and `awflualte`, which a learner spots as fake
 * on sight. Three characters of context follows English orthotactics closely
 * enough to produce word-shaped output, while still being far too little
 * context to reconstruct real words.
 */
export const DEFAULT_ORDER = 3;

export const buildCharModel = (words: readonly string[], order = DEFAULT_ORDER): CharModel => {
  const model = new Map<string, Map<string, number>>();

  for (const word of words) {
    const padded = `${START.repeat(order)}${word}${END}`;
    for (let i = order; i < padded.length; i++) {
      const context = padded.slice(i - order, i);
      const next = padded[i]!;
      const counts = model.get(context) ?? new Map<string, number>();
      counts.set(next, (counts.get(next) ?? 0) + 1);
      model.set(context, counts);
    }
  }
  return { order, contexts: model };
};

const sampleFrom = (counts: ReadonlyMap<string, number>, rng: Rng): string | null => {
  const total = [...counts.values()].reduce((sum, count) => sum + count, 0);
  if (total === 0) return null;

  let target = rng() * total;
  // Sorted so a given seed always produces the same word, whatever order the
  // model was built in — the pipeline has to be reproducible (D10).
  for (const [character, count] of [...counts].sort(([a], [b]) => a.localeCompare(b))) {
    target -= count;
    if (target <= 0) return character;
  }
  return null;
};

export interface SampleOptions {
  minLength: number;
  maxLength: number;
}

/** Samples one candidate. Returns null if it ran off the end of the model. */
export const samplePseudoword = (
  model: CharModel,
  rng: Rng,
  options: SampleOptions,
): string | null => {
  let context = START.repeat(model.order);
  let word = '';

  while (word.length < options.maxLength) {
    const counts = model.contexts.get(context);
    if (!counts) return null;

    const next = sampleFrom(counts, rng);
    if (next === null) return null;
    if (next === END) break;

    word += next;
    context = context.slice(1) + next;
  }

  return word.length >= options.minLength && word.length <= options.maxLength ? word : null;
};

/**
 * True if the candidate is a real word, or one edit away from one.
 *
 * The one-edit rule matters: `becuase` is not an English word, but showing it
 * in a vocabulary test measures whether the learner spots a typo, not whether
 * they know the word. A false alarm should mean "I over-claimed", not "I read
 * it charitably".
 */
export const isTooCloseToReal = (candidate: string, realWords: ReadonlySet<string>): boolean => {
  if (realWords.has(candidate)) return true;

  const alphabet = 'abcdefghijklmnopqrstuvwxyz';
  for (let i = 0; i < candidate.length; i++) {
    // Deletion.
    if (realWords.has(candidate.slice(0, i) + candidate.slice(i + 1))) return true;
    for (const letter of alphabet) {
      // Substitution and insertion.
      if (realWords.has(candidate.slice(0, i) + letter + candidate.slice(i + 1))) return true;
      if (realWords.has(candidate.slice(0, i) + letter + candidate.slice(i))) return true;
    }
  }
  for (const letter of alphabet) {
    if (realWords.has(candidate + letter)) return true;
  }
  return false;
};

export interface GenerateOptions extends SampleOptions {
  count: number;
  /** Give up rather than spin forever on a model that cannot produce enough. */
  maxAttempts?: number;
}

export const generatePseudowords = (
  model: CharModel,
  realWords: ReadonlySet<string>,
  rng: Rng,
  options: GenerateOptions,
): string[] => {
  const accepted = new Set<string>();
  const limit = options.maxAttempts ?? options.count * 200;

  for (let attempt = 0; attempt < limit && accepted.size < options.count; attempt++) {
    const candidate = samplePseudoword(model, rng, options);
    if (!candidate || !/^[a-z]+$/.test(candidate)) continue;
    if (isTooCloseToReal(candidate, realWords)) continue;
    accepted.add(candidate);
  }
  return [...accepted].sort();
};
