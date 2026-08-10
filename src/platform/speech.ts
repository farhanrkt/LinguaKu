/**
 * Web Speech synthesis capability probe.
 *
 * SPEC §2.6 makes audio mandatory and §5.1 gets it free from `speechSynthesis`.
 * That is the most fragile assumption in the app (risk R1 in docs/DECISIONS.md),
 * so this module's job is to find out the truth on the actual device rather
 * than assume it:
 *
 *  - `getVoices()` is populated asynchronously. Called on first paint it
 *    returns an empty list, which is indistinguishable from "no voices
 *    installed" unless you wait for `voiceschanged`.
 *  - A voice's existence does not mean it works offline. `localService` is the
 *    only signal separating on-device synthesis from a network round trip, and
 *    an app that claims to work offline cannot rely on the network one.
 *  - Some engines list a voice that never actually speaks, so the probe ends by
 *    speaking a silent test utterance and waiting for the engine to confirm.
 *
 * SPEC §2.6: an item with no working audio is excluded from L4 scheduling. It
 * is never silently downgraded to a text card.
 */

export type SpeechSupport =
  /** A voice for this language exists and audibly started. */
  | 'ready'
  /** The API exists but has no usable voice for this language. */
  | 'no-voice'
  /** `speechSynthesis` is not available at all. */
  | 'unsupported';

export interface VoiceReport {
  support: SpeechSupport;
  voiceName: string | null;
  /** False means the voice may need the network — see R1. */
  localService: boolean;
  voiceCount: number;
  probedAt: number;
}

const VOICES_TIMEOUT_MS = 2_000;
const UTTERANCE_TIMEOUT_MS = 2_000;

const synth = (): SpeechSynthesis | null =>
  typeof globalThis.speechSynthesis === 'undefined' ? null : globalThis.speechSynthesis;

/** BCP-47 prefix match: `en` accepts `en-US`, `en-GB`, `en_AU`. */
const matchesLanguage = (voiceLang: string, language: string): boolean =>
  voiceLang.toLowerCase().replace('_', '-').startsWith(language.toLowerCase());

/**
 * Waits for the voice list to populate. Resolves with whatever exists when the
 * timeout expires rather than hanging — a device with no voices must reach a
 * verdict too.
 */
export const listVoices = async (
  language?: string,
  timeoutMs = VOICES_TIMEOUT_MS,
): Promise<SpeechSynthesisVoice[]> => {
  const speech = synth();
  if (!speech) return [];

  const filter = (voices: SpeechSynthesisVoice[]) =>
    language === undefined ? voices : voices.filter((voice) => matchesLanguage(voice.lang, language));

  const immediate = filter(speech.getVoices());
  if (immediate.length > 0) return immediate;

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearInterval(poll);
      clearTimeout(timer);
      speech.removeEventListener?.('voiceschanged', onChange);
      resolve(filter(speech.getVoices()));
    };
    const onChange = () => {
      if (filter(speech.getVoices()).length > 0) finish();
    };
    // Belt and braces: some engines never fire the event but do fill the list.
    const poll = setInterval(onChange, 100);
    const timer = setTimeout(finish, timeoutMs);
    speech.addEventListener?.('voiceschanged', onChange);
  });
};

/** Prefers an on-device voice; falls back to any voice for the language. */
export const pickVoice = (
  voices: readonly SpeechSynthesisVoice[],
): SpeechSynthesisVoice | null =>
  voices.find((voice) => voice.localService) ?? voices[0] ?? null;

/**
 * Speaks a silent utterance and waits for the engine to acknowledge it.
 *
 * On iOS, speech requires a user gesture, so this should be run from inside one
 * (the app probes when a session starts). A failure here is reported as
 * `no-voice` rather than assumed away.
 */
const utteranceWorks = async (
  voice: SpeechSynthesisVoice,
  timeoutMs = UTTERANCE_TIMEOUT_MS,
): Promise<boolean> => {
  const speech = synth();
  if (!speech || typeof globalThis.SpeechSynthesisUtterance === 'undefined') return false;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (worked: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      speech.cancel();
      resolve(worked);
    };

    const utterance = new SpeechSynthesisUtterance('.');
    utterance.voice = voice;
    utterance.lang = voice.lang;
    utterance.volume = 0;
    utterance.onstart = () => finish(true);
    utterance.onend = () => finish(true);
    utterance.onerror = () => finish(false);

    const timer = setTimeout(() => finish(false), timeoutMs);
    speech.speak(utterance);
  });
};

export interface ProbeOptions {
  voicesTimeoutMs?: number;
  utteranceTimeoutMs?: number;
}

export const probeVoice = async (
  language: string,
  options: ProbeOptions = {},
): Promise<VoiceReport> => {
  const probedAt = Date.now();
  if (!synth()) {
    return { support: 'unsupported', voiceName: null, localService: false, voiceCount: 0, probedAt };
  }

  const voices = await listVoices(language, options.voicesTimeoutMs);
  const voice = pickVoice(voices);
  if (!voice) {
    return { support: 'no-voice', voiceName: null, localService: false, voiceCount: 0, probedAt };
  }

  const works = await utteranceWorks(voice, options.utteranceTimeoutMs);
  return {
    support: works ? 'ready' : 'no-voice',
    voiceName: voice.name,
    localService: voice.localService,
    voiceCount: voices.length,
    probedAt,
  };
};

// ------------------------------------------------------------------ speaking

export interface SpeakOptions {
  rate?: number;
  /** Skip the voice lookup when the caller already probed. */
  voice?: SpeechSynthesisVoice | null;
}

/**
 * Speaks text, resolving when the engine finishes. Resolves (rather than
 * rejecting) when speech is unavailable: audio is an enhancement at every rung
 * except L4, and L4 items are filtered out upstream.
 */
export const speak = async (
  text: string,
  language: string,
  options: SpeakOptions = {},
): Promise<void> => {
  const speech = synth();
  if (!speech || typeof globalThis.SpeechSynthesisUtterance === 'undefined') return;

  const voice = options.voice ?? pickVoice(await listVoices(language));
  if (!voice) return;

  speech.cancel();
  await new Promise<void>((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = voice;
    utterance.lang = voice.lang;
    // A shade under natural pace: learners need the word, not the performance.
    utterance.rate = options.rate ?? 0.95;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    speech.speak(utterance);
  });
};

export const cancelSpeech = (): void => {
  synth()?.cancel();
};

/** SPEC §2.6: no working audio means the L4 rung is withheld, not faked. */
export const canScheduleAudioOnly = (report: VoiceReport | null): boolean =>
  report?.support === 'ready';
