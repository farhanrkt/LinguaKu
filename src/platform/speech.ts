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
  /** A voice for this language exists and the engine completed an utterance. */
  | 'ready'
  /** The API exists but has no usable voice for this language. */
  | 'no-voice'
  /**
   * A voice exists and the engine accepted the utterance, but never finished
   * it inside the deadline. This is the Android failure mode that makes voice
   * enumeration useless on its own — see R1.
   */
  | 'dead'
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

/**
 * How long the boot probe waits for `onend` before declaring the engine dead
 * for this session.
 *
 * 500 ms is the number the device matrix settled on, and it is deliberately
 * tight: this budget is spent inside the ≤3s icon-tap-to-first-question window
 * (SPEC §5.4), and an engine that cannot finish a zero-volume full stop in half
 * a second is not going to deliver a dictation card on time either.
 *
 * `onend`, specifically — not `onstart`. The engine that lies about audio fires
 * `onstart` and then goes quiet forever; only completion proves it spoke.
 */
export const TTS_ONEND_DEADLINE_MS = 500;

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
 * Speaks a zero-volume utterance and waits for the engine to *finish* it.
 *
 * Resolving on `onend` alone is the whole point. An engine that fires `onstart`
 * and then never completes has told us nothing about whether a learner would
 * hear anything, and on Android that is a real configuration, not a hypothetical
 * one. Anything that has not completed inside the deadline is dead.
 */
const utteranceCompletes = async (
  voice: SpeechSynthesisVoice,
  timeoutMs = TTS_ONEND_DEADLINE_MS,
): Promise<boolean> => {
  const speech = synth();
  if (!speech || typeof globalThis.SpeechSynthesisUtterance === 'undefined') return false;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (completed: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      speech.cancel();
      resolve(completed);
    };

    const utterance = new SpeechSynthesisUtterance('.');
    utterance.voice = voice;
    utterance.lang = voice.lang;
    utterance.volume = 0;
    utterance.onend = () => finish(true);
    utterance.onerror = () => finish(false);

    const timer = setTimeout(() => finish(false), timeoutMs);
    speech.speak(utterance);
  });
};

export interface ProbeOptions {
  voicesTimeoutMs?: number;
  /** Defaults to `TTS_ONEND_DEADLINE_MS`. */
  utteranceTimeoutMs?: number;
  /**
   * How long `probeOnBoot` waits before probing, where `requestIdleCallback`
   * is unavailable. Defaults to `IDLE_FALLBACK_MS`.
   */
  deferMs?: number;
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

  const completed = await utteranceCompletes(voice, options.utteranceTimeoutMs);
  return {
    support: completed ? 'ready' : 'dead',
    voiceName: voice.name,
    localService: voice.localService,
    voiceCount: voices.length,
    probedAt,
  };
};

// ------------------------------------------------------- the session verdict

/**
 * The probe runs **once per app boot**, and its answer stands for the whole
 * session.
 *
 * Re-probing per card would be worse in both directions: it costs a settle
 * delay on every audio item, and a device that answers "ready" once and "dead"
 * the next time would flip the L4 rung in and out under the learner. One
 * verdict per session is a stable contract that the rest of the app can gate on
 * (`ladderCeiling` in src/core/ladder.ts).
 */
/**
 * Keyed by language, because voice availability is. R1's specific warning is
 * that `ja-JP` is the voice most likely to be absent on a cheap Android ROM —
 * so a device that speaks English fine may have nothing for Japanese, and a
 * single app-wide verdict would let the English voice vouch for it. That would
 * report audio as ready, schedule L4 dictation and mora minimal-pair drills, and
 * then have nothing to speak them with: the silent degradation §2.6 forbids.
 *
 * D29's guarantee is unchanged in the sense that matters — one verdict per
 * language per app start, so the L4 rung still cannot flicker under the learner.
 */
const verdicts = new Map<string, VoiceReport>();
const inFlight = new Map<string, Promise<VoiceReport>>();

/**
 * Probes on boot and caches the verdict for the session. Concurrent callers
 * share the one probe; later callers get the cached answer without speaking
 * again.
 *
 * **Callers must not run this until the first screen is painted.** Measured, not
 * assumed: the first touch of `speechSynthesis` in an environment with no speech
 * service behind it **blocks the main thread for ~15 seconds** — five times SPEC
 * §5.4's entire icon-tap-to-first-question budget, with the app frozen for all
 * of it. A device with no speech service is not a hypothetical; it is precisely
 * the device R1 is about, so this is a cost real learners would pay.
 *
 * `idle()` below is a second line of defence, not the first: `requestIdleCallback`
 * fires during the gaps in an async boot, which are exactly the moments the app
 * is waiting on IO and about to need the main thread again. The reliable signal
 * is the app telling us a screen is up — see `markInteractive` in src/App.tsx.
 *
 * Until it answers, `isTtsLive()` is false: audio is withheld rather than
 * assumed, which is the same safe default the rest of §2.6 runs on.
 */
export const probeOnBoot = async (
  language: string,
  options: ProbeOptions = {},
): Promise<VoiceReport> => {
  const settled = verdicts.get(language);
  if (settled) return settled;

  const running = inFlight.get(language);
  if (running) return running;

  const probe = idle(options.deferMs)
    .then(() => probeVoice(language, options))
    .then((report) => {
      verdicts.set(language, report);
      inFlight.delete(language);
      return report;
    });
  inFlight.set(language, probe);
  return probe;
};

/** Long enough that the first question is painted, where there is no idle API. */
export const IDLE_FALLBACK_MS = 1_500;

/** Resolves once the main thread has nothing better to do. */
const idle = (deferMs = IDLE_FALLBACK_MS): Promise<void> =>
  new Promise((resolve) => {
    if (typeof globalThis.requestIdleCallback === 'function') {
      // The timeout is a ceiling, not a target: on a busy first load the probe
      // still happens, just late enough not to be in front of the learner.
      globalThis.requestIdleCallback(() => resolve(), { timeout: 3_000 });
    } else {
      setTimeout(resolve, deferMs);
    }
  });

/** The session's verdict, or null if the probe has not answered yet. */
export const ttsReport = (language: string): VoiceReport | null =>
  verdicts.get(language) ?? null;

/**
 * SPEC §2.6: a dead engine means audio must come from a pre-cached clip or the
 * item is withheld. Unknown (probe still running) is treated as *not* live —
 * the honest default, since claiming audio we cannot deliver is the failure
 * this whole module exists to prevent.
 */
export const isTtsLive = (language: string): boolean =>
  verdicts.get(language)?.support === 'ready';

/** Test seam: the verdict is module state and would otherwise leak between cases. */
export const resetTtsVerdict = (): void => {
  verdicts.clear();
  inFlight.clear();
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
