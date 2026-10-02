import { loadAnchors } from '../../data/content.ts';
import { makePuzzle, parseBuildId, type BuildPuzzle } from '../../core/sentenceBuild.ts';
import { tokenizeLatin } from '../../core/tokenize.ts';
import type { FrequencyBand } from '../../core/frequency.ts';
import type { TargetLang } from '../../data/types.ts';

export interface BuildTask {
  sentenceId: string;
  /** The Indonesian the learner is rebuilding *from*. */
  prompt: string;
  /** The target-language sentence, for the reveal. */
  answerText: string;
  puzzle: BuildPuzzle;
}

/**
 * Resolves a queue id back into a puzzle.
 *
 * Decoys come from the same band's anchors, which is the pool the learner is
 * being taught out of — a decoy from a band they have never met is not a
 * distractor, it is a word they can rule out on sight.
 */
export const buildBuildTask = async (
  lang: TargetLang,
  id: string,
  seed: number,
): Promise<BuildTask | null> => {
  const parsed = parseBuildId(id);
  if (!parsed) return null;
  const band = parsed.band as FrequencyBand;
  const { sentenceId } = parsed;

  const anchors = await loadAnchors(lang, band);
  const sentence = anchors.get(sentenceId);
  if (!sentence) return null;

  const pool: string[] = [];
  for (const other of anchors.values()) {
    if (other.id === sentenceId) continue;
    for (const token of tokenizeLatin(other.text)) pool.push(token);
    if (pool.length > 400) break;
  }

  const puzzle = makePuzzle({ text: sentence.text, distractorPool: pool, seed });
  if (!puzzle) return null;

  return {
    sentenceId,
    prompt: sentence.tr.text,
    answerText: sentence.text,
    puzzle,
  };
};
