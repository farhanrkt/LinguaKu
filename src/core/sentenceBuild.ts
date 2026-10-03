import { mulberry32, shuffle } from './rng.ts';
import { isLexemeCandidate } from './tokenize.ts';

/**
 * Rebuild the sentence from its words (SPEC §3.1 `NP_WORD_ORDER`).
 *
 * Every other exercise in the catalog asks for *a word*: pick it, type it,
 * recall it, hear it. None of them asks the learner to put words in the right
 * **order**, which §3.1 names as a systematic Indonesian-L1 error rather than a
 * careless one — Indonesian is head-initial, so *mobil merah* comes out as
 * "a car red". The authored contrastive drills cover that category with a
 * finite, hand-written set; the corpus can generate practice for it without
 * limit.
 *
 * It is also the one exercise here whose *interaction* is different — tapping
 * tiles rather than typing or choosing — which matters, because a session where
 * every card presents identically reads as unstructured however varied the
 * pedagogy underneath it is.
 */

/**
 * Queue ids for a rebuild puzzle, so a session can tell one from a lexeme.
 *
 * In `core` rather than beside the task builder because the *planner* mints
 * these and the planner lives in `src/data`, which may not import from
 * `src/features`.
 */
const PREFIX = 'build:';

export const buildIdFor = (band: number, sentenceId: string): string =>
  `${PREFIX}${band}:${sentenceId}`;

export const isBuildId = (id: string): boolean => id.startsWith(PREFIX);

/** Splits an id back into the band and sentence it names. */
export const parseBuildId = (id: string): { band: number; sentenceId: string } | null => {
  if (!isBuildId(id)) return null;
  const [, rawBand, ...rest] = id.split(':');
  const band = Number(rawBand);
  const sentenceId = rest.join(':');
  if (!Number.isFinite(band) || sentenceId.length === 0) return null;
  return { band, sentenceId };
};

/** Below this a sentence is trivial to reassemble; above it, tedious on a phone. */
export const MIN_TOKENS = 4;
export const MAX_TOKENS = 10;

/** Extra words that belong to no correct answer. Enough to matter, few enough to scan. */
export const DISTRACTORS = 2;

export interface BuildTile {
  /** Stable within one puzzle, so React keys and taps survive a re-render. */
  id: string;
  text: string;
}

export interface BuildPuzzle {
  tiles: BuildTile[];
  /** The answer, in order, lowercased — what `gradeBuild` compares against. */
  solution: string[];
}

export interface BuildInput {
  /**
   * The sentence's tokens. For Japanese these are the shipped morphological
   * ones (D10); for English the caller tokenizes. Never raw text — see
   * `wordsOf`.
   */
  tokens: readonly string[];
  /** Same-band words to draw decoys from. Words already in the sentence are skipped. */
  distractorPool: readonly string[];
  seed: number;
}

/**
 * The words a learner is asked to place.
 *
 * Takes **tokens, not text**, and that is the whole difference between this
 * working in one language and in two. `tokenizeLatin` returns a Japanese
 * sentence as a single token — it is one unbroken run of letters — so building
 * the puzzle from text silently rejected every Japanese sentence and made the
 * exercise English-only without saying so. Japanese anchors ship build-time
 * morphological tokens (D10) and every one of them has them; the caller passes
 * those.
 *
 * Punctuation is dropped: the tokenizer emits 。and ！as tokens of their own,
 * and making someone place a full stop is not word-order practice.
 */
export const wordsOf = (tokens: readonly string[]): string[] =>
  tokens.filter((token) => isLexemeCandidate(token));

/** Whether a sentence is the right shape to be worth rebuilding. */
export const isBuildable = (tokens: readonly string[]): boolean => {
  const count = wordsOf(tokens).length;
  return count >= MIN_TOKENS && count <= MAX_TOKENS;
};

export const makePuzzle = (input: BuildInput): BuildPuzzle | null => {
  const words = wordsOf(input.tokens);
  if (words.length < MIN_TOKENS || words.length > MAX_TOKENS) return null;

  const solution = words.map((word) => word.toLowerCase());
  const present = new Set(solution);
  const rng = mulberry32(input.seed);

  // A decoy that is already in the sentence is not a decoy — it would make a
  // second, equally correct arrangement and mark a right answer wrong.
  const decoys = shuffle(
    input.distractorPool.filter(
      (word) => isLexemeCandidate(word) && !present.has(word.toLowerCase()),
    ),
    rng,
  ).slice(0, DISTRACTORS);

  const tiles = shuffle(
    [...words, ...decoys].map((text, index) => ({ id: `${index}:${text}`, text })),
    rng,
  );

  return { tiles, solution };
};

export type BuildOutcome = 'correct' | 'wrong';

export interface BuildResult {
  outcome: BuildOutcome;
  /** Index of the first tile that broke the order, or null when it is right. */
  firstWrongAt: number | null;
}

/**
 * Graded on the word order alone.
 *
 * Case and punctuation are not the exercise — the learner never typed them, the
 * tiles carry whatever casing the corpus had, and marking someone wrong for a
 * capital letter they were never given a choice about is the unfairness §2.7
 * exists to prevent.
 */
export const gradeBuild = (assembled: readonly string[], solution: readonly string[]): BuildResult => {
  for (let index = 0; index < Math.max(assembled.length, solution.length); index++) {
    const given = assembled[index]?.toLowerCase();
    if (given !== solution[index]) {
      return { outcome: 'wrong', firstWrongAt: index };
    }
  }
  return { outcome: 'correct', firstWrongAt: null };
};
