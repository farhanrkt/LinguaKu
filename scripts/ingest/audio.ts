/**
 * What gets a pre-recorded clip, and what it is called.
 *
 * Split out from `build-audio.ts` so the decisions are testable without a
 * synthesizer: which sentences are worth a clip, in what order, under what
 * filename. The part that cannot be tested here is one `execFile` call, and it
 * is isolated for exactly that reason.
 *
 * ## Why there is a clip set at all
 *
 * Risk R1: `speechSynthesis` is the single most fragile assumption in the app,
 * and on the reference device — a cheap Android with no TTS engine installed —
 * it delivers nothing. SPEC §2.6 then withholds L4 rather than degrading it to
 * text, which is correct and costs that learner the whole listening half of the
 * product. A pre-cached clip is the insurance, and R4 measured the room for it:
 * text is 2.6% of the 8 MB budget, so essentially all of it is available.
 *
 * ## What the budget buys
 *
 * Not everything. At ~12 KB per short AAC clip the whole budget is roughly
 * 500–650 clips, against 23,497 English sentences — so the selection is the
 * design, and it follows the ladder: L4 is dictation of a short sentence
 * (D30, ≤10 tokens), so a sentence longer than that can never be an L4 item and
 * a clip for it would be spent on nothing. What remains — headwords and short
 * sentences — is bought in frequency-rank order, one scale for both, because
 * that is the order a learner meets them in.
 */

import { createHash } from 'node:crypto';

/** SPEC §2.3 L4 / D30: past ten tokens dictation measures working memory. */
export const MAX_DICTATION_TOKENS = 10;

/**
 * Container formats, and why the default is not Opus.
 *
 * Opus is the better codec at this bitrate and was the first choice. It is the
 * wrong *default* for one reason: **Safari only gained Ogg Opus playback in
 * 17.5**, and iOS is precisely the platform where the boot probe marks audio
 * dead (D29's recorded cost — it will not speak outside a user gesture).
 * Shipping the insurance policy for silent devices in a format the most common
 * silent device cannot play would defeat the point of having one.
 *
 * AAC in an MP4 container plays everywhere, including iOS old enough to be the
 * reference device. It costs roughly half again as many bytes at equivalent
 * quality, which `check-audio.mjs` measures against the real budget rather than
 * an assumed one.
 */
export type ClipFormat = 'm4a' | 'opus' | 'mp3';

/** Rough bytes per clip at mono, for planning only — the gate measures reality. */
export const ESTIMATED_BYTES: Record<ClipFormat, number> = {
  m4a: 12 * 1024,
  opus: 8 * 1024,
  mp3: 16 * 1024,
};

/**
 * Clips are named by content, so an unchanged line is never re-encoded.
 *
 * The speaker is part of the name because a multi-speaker model such as
 * `en_US-libritts-high` carries **904** of them: leaving it unpinned makes the
 * voice a learner hears depend on Piper's default, which is not a promise any
 * version of it makes.
 */
export const clipName = (
  voiceKey: string,
  text: string,
  format: ClipFormat = 'm4a',
  speaker = 0,
): string =>
  createHash('sha256')
    .update([voiceKey, speaker, text].join(' '))
    .digest('hex')
    .slice(0, 16) + `.${format}`;

export interface ClipRequest {
  /** Sentence id, or `lex:<headword>` for a bare word. */
  key: string;
  text: string;
  /** Lower is more valuable — the order the budget is spent in. */
  priority: number;
}

export interface AnchorLike {
  id: string;
  text: string;
  maxRank: number;
}

export interface LexemeLike {
  id: string;
  headword: string;
  freqRank: number;
}

const tokenCount = (text: string, lang: 'en' | 'ja'): number =>
  // Japanese does not delimit words with spaces, and the pipeline's tokens are
  // not to hand here; characters are the honest proxy for "is this short?".
  lang === 'ja' ? [...text].length / 2 : text.trim().split(/\s+/).length;

/**
 * The clip list for one band, in the order the budget should be spent.
 *
 * Deterministic (invariant 10): ties break on the key, never on iteration
 * order, so the same corpus produces the same list and therefore the same
 * files — which is what stops a re-run from invalidating every learner's cache.
 */
export const planClips = (
  lang: 'en' | 'ja',
  lexemes: readonly LexemeLike[],
  anchors: readonly AnchorLike[],
): ClipRequest[] => {
  const requests: ClipRequest[] = [
    // Words and sentences compete on one scale — frequency rank — rather than
    // words being bought first. Rank order is what a learner actually meets, and
    // buying every headword before any sentence would spend the budget on the
    // rungs that still work without audio and starve the one that does not: L4
    // is withheld entirely when a sentence cannot be heard (SPEC §2.6).
    ...lexemes.map((lexeme) => ({
      key: `lex:${lexeme.id}`,
      text: lexeme.headword,
      priority: lexeme.freqRank,
    })),
    // Then the sentences that could actually be dictated.
    ...anchors
      .filter((anchor) => tokenCount(anchor.text, lang) <= MAX_DICTATION_TOKENS)
      .map((anchor) => ({
        key: anchor.id,
        text: anchor.text,
        // A clip is worth more where the sentence is made of common words: it
        // will be reached by more learners, sooner.
        priority: anchor.maxRank,
      })),
  ];

  return requests
    .filter((request) => request.text.length > 0)
    .sort((a, b) => a.priority - b.priority || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
};

/**
 * Trims a plan to a byte budget using a measured average clip size.
 *
 * Estimated rather than measured per clip because the decision of *what to
 * generate* has to be made before anything is generated. `build-audio.ts`
 * re-checks the real total afterwards, and `scripts/check-audio.mjs` is the
 * gate that fails the build if the estimate was wrong.
 */
export const withinBudget = (
  plan: readonly ClipRequest[],
  budgetBytes: number,
  averageClipBytes: number,
): ClipRequest[] => plan.slice(0, Math.max(0, Math.floor(budgetBytes / averageClipBytes)));
