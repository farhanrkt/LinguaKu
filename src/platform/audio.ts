import { isTtsLive, speak } from './speech.ts';
import type { TargetLang } from '../data/types.ts';

/**
 * Audio playback, and the pre-cached clip set that stands in when the device's
 * speech engine is dead (risk R1, SPEC §2.6).
 *
 * The order is deliberate: **a pre-cached clip always wins**. It is a real
 * recording, it is already on the device, and it cannot be affected by whatever
 * the OEM's TTS engine is doing. Synthesis is the fallback, not the default.
 *
 * ## There are no clips yet, and that is not an oversight
 *
 * Tatoeba's audio is *not* covered by the sentence licence — each clip's terms
 * are chosen by the contributor who recorded it, and clips with an empty licence
 * field may not be reused at all. `tatoeba-audio` therefore sits under
 * `candidates` in data/licenses.json, and the licence gate refuses candidates
 * (SPEC §5.2). So `audio.json` does not exist today, the index loads empty, and
 * every item reports "no clip".
 *
 * That is exactly the state this module is designed to survive: with the engine
 * dead and no clips, `hasAudio` is false everywhere and L4 is withheld from every
 * item rather than degraded to a text card. When licence-cleared clips land, they
 * drop into `assets/content/{lang}/audio.json` and nothing else changes.
 */

export const CONTENT_BASE = '/content';

export interface ClipIndex {
  /** Sentence id → URL of a pre-cached clip. */
  readonly clips: ReadonlyMap<string, string>;
}

export const EMPTY_CLIP_INDEX: ClipIndex = { clips: new Map() };

const indexCache = new Map<TargetLang, ClipIndex>();

interface WireClipIndex {
  sources: string[];
  clips: Record<string, string>;
}

/**
 * Loads the clip index for a language. A missing manifest is the normal case,
 * not an error — it means this language ships no pre-cached audio.
 */
export const loadClipIndex = async (lang: TargetLang): Promise<ClipIndex> => {
  const cached = indexCache.get(lang);
  if (cached) return cached;

  let index = EMPTY_CLIP_INDEX;
  try {
    const response = await fetch(`${CONTENT_BASE}/${lang}/audio.json`);
    if (response.ok) {
      const payload = (await response.json()) as WireClipIndex;
      index = { clips: new Map(Object.entries(payload.clips ?? {})) };
    }
  } catch {
    // Offline, or no such file. Either way: no clips.
  }
  indexCache.set(lang, index);
  return index;
};

export const clipUrl = (index: ClipIndex, sentenceId: string): string | null =>
  index.clips.get(sentenceId) ?? null;

/**
 * SPEC §2.6: whether this specific sentence can be presented as audio at all —
 * "neither cached clip nor working TTS voice" is the exclusion condition, so
 * either one satisfies it.
 */
export const hasAudio = (index: ClipIndex, sentenceId: string): boolean =>
  index.clips.has(sentenceId) || isTtsLive();

// ------------------------------------------------------------------ playback

let element: HTMLAudioElement | null = null;

const playClip = async (url: string): Promise<void> => {
  if (typeof Audio === 'undefined') return;
  element?.pause();
  element = new Audio(url);
  await new Promise<void>((resolve) => {
    const done = () => resolve();
    element?.addEventListener('ended', done, { once: true });
    // A clip that fails to play resolves rather than rejects: audio is an
    // enhancement everywhere except L4, and L4 items are filtered upstream.
    element?.addEventListener('error', done, { once: true });
    void element?.play().catch(done);
  });
};

/** Plays a sentence: the pre-cached clip if there is one, otherwise synthesis. */
export const playSentence = async (
  index: ClipIndex,
  sentenceId: string,
  text: string,
  lang: TargetLang,
): Promise<void> => {
  const url = clipUrl(index, sentenceId);
  if (url !== null) return playClip(url);
  if (!isTtsLive()) return;
  return speak(text, lang);
};
