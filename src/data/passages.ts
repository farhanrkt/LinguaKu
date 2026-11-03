import type { FrequencyBand } from '../core/frequency.ts';
import { contentUrl } from './content.ts';
import type { TargetLang } from './types.ts';

/**
 * Graded reading passages (SPEC §8, §2.4).
 *
 * Lazy and never precached: a beginner should not pay for reading material on
 * first load (§5.3), and the reader is a screen they choose to open.
 *
 * **English only, and the screen says so.** There is no free, licence-cleared
 * corpus of graded Japanese prose — Simple English Wikipedia has no Japanese
 * equivalent, and Japanese Wikipedia is not graded. Japanese keeps the sentence
 * feed (D45), which is a different thing and is labelled as one rather than
 * left for the learner to infer parity.
 */

export interface Passage {
  id: string;
  /** The article it came from. Shown to the reader — CC BY-SA attribution. */
  title: string;
  text: string;
  band: FrequencyBand;
  tokens: number;
  p90: number;
  /** Distinct in-inventory tokens, precomputed for the coverage selector. */
  vocab: string[];
}

const cache = new Map<string, Passage[]>();

export const loadPassages = async (
  lang: TargetLang,
  band: FrequencyBand,
): Promise<Passage[]> => {
  const key = `${lang}:${band}`;
  const cached = cache.get(key);
  if (cached) return cached;

  try {
    const response = await fetch(contentUrl(lang, `passages.b${band}.json`));
    // A 404 is a fact about the build — Japanese has no passages — and may be
    // remembered. Anything else is a fact about right now (invariant 50).
    if (response.status === 404) {
      cache.set(key, []);
      return [];
    }
    if (!response.ok) return [];
    const passages = ((await response.json()) as { passages?: Passage[] }).passages ?? [];
    cache.set(key, passages);
    return passages;
  } catch {
    // Offline before this band was fetched: empty for now, asked again later.
    // This used to be cached too, so one flaky moment emptied the reader's
    // passages for the rest of the session.
    return [];
  }
};

