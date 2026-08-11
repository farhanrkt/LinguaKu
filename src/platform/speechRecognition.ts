/**
 * Speech input (SPEC §5.1, §2.7).
 *
 * The spec is unusually explicit about the failure mode here, and it is the
 * acceptance criterion for the whole milestone: *"Where unavailable, offer
 * record-and-self-compare with a waveform, and **never block progression on
 * it**."* So this module is built the way `speech.ts` was, and for the same
 * reason R1 taught us: assume nothing, probe cheaply, fail to "not available"
 * rather than to a hang.
 *
 * Three specific hazards, all of them real on the reference device:
 *
 *  - `SpeechRecognition` is prefixed on Chromium and absent on Firefox and on
 *    every iOS browser. Feature-detecting the constructor is not enough.
 *  - Where it exists it may still need the network. `continuous` recognition on
 *    Chrome Android streams audio to a server, which an app that promises to
 *    work offline cannot depend on — so a failure is treated as absence, not as
 *    a wrong answer.
 *  - It needs a microphone permission that the learner may refuse, and refusing
 *    must cost them nothing.
 *
 * Nothing here ever produces a *grade*. It produces a transcript, which is fed
 * to the same tolerant grader a typed answer goes through (§2.7). A learner who
 * speaks is answering the same question by another route.
 */

export type SpeechInputSupport = 'ready' | 'unsupported';

interface RecognitionEventLike {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}

interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}

type RecognitionConstructor = new () => RecognitionLike;

const constructorFor = (): RecognitionConstructor | null => {
  const global = globalThis as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return global.SpeechRecognition ?? global.webkitSpeechRecognition ?? null;
};

/**
 * Whether speech input exists at all.
 *
 * Deliberately *not* a live probe. Unlike synthesis, starting a recognizer
 * prompts for the microphone, and asking a learner for permission in order to
 * find out whether a button should be visible would be a poor trade. The button
 * appears when the API exists; if the learner declines the permission, the
 * attempt fails quietly and typing is right there.
 */
export const speechInputSupport = (): SpeechInputSupport =>
  constructorFor() === null ? 'unsupported' : 'ready';

export const isSpeechInputAvailable = (): boolean => speechInputSupport() === 'ready';

export interface RecognitionResult {
  transcript: string;
  /** False when the engine was unavailable, refused, or produced nothing. */
  heard: boolean;
}

/** Longest we wait for an utterance before giving the learner back their turn. */
export const RECOGNITION_TIMEOUT_MS = 8_000;

/**
 * Listens once and returns what it heard.
 *
 * Resolves rather than rejects on every failure path — no permission, no
 * network, no speech, an engine that never fires anything. §5.1's "never block
 * progression on it" means a broken microphone must be indistinguishable, from
 * the session's point of view, from a learner who chose to type.
 */
export const recognizeOnce = async (
  language: string,
  timeoutMs = RECOGNITION_TIMEOUT_MS,
): Promise<RecognitionResult> => {
  const Recognition = constructorFor();
  if (!Recognition) return { transcript: '', heard: false };

  return new Promise((resolve) => {
    let settled = false;
    const finish = (transcript: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        recognition.abort();
      } catch {
        // Already stopped. Nothing to do, and nothing worth telling the learner.
      }
      resolve({ transcript, heard: transcript.length > 0 });
    };

    const recognition = new Recognition();
    recognition.lang = language;
    // One utterance, one answer. Continuous mode is where the network
    // dependency and the battery cost live.
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const best = event.results[0]?.[0]?.transcript ?? '';
      finish(best.trim());
    };
    recognition.onerror = () => finish('');
    recognition.onend = () => finish('');

    const timer = setTimeout(() => finish(''), timeoutMs);

    try {
      recognition.start();
    } catch {
      finish('');
    }
  });
};

// ------------------------------------------------------------- shadowing

/**
 * SPEC §5.1's fallback and §8's shadowing exercise: record the learner, play it
 * back beside the model, and let *them* judge. No transcript, no score.
 *
 * That is not a lesser version of recognition — for pronunciation it is arguably
 * the better one. A recognizer tells you whether a machine understood you; your
 * own ear tells you how far you are from the model, which is the thing being
 * trained. It also works on every device with a microphone, which recognition
 * does not.
 */
export const isRecordingAvailable = (): boolean =>
  typeof globalThis.MediaRecorder !== 'undefined' &&
  typeof navigator !== 'undefined' &&
  navigator.mediaDevices?.getUserMedia !== undefined;

export interface Recording {
  url: string;
  /** Coarse loudness samples, 0..1, for the waveform. */
  peaks: number[];
  stop: () => void;
}

/**
 * Records until stopped. Resolves with a playable URL and a peak envelope.
 *
 * The peaks are sampled from an `AnalyserNode` while recording rather than
 * decoded afterwards: decoding costs a second on a mid-range phone and the
 * waveform is there to be glanced at, not measured.
 */
export const startRecording = async (
  onPeak: (level: number) => void,
): Promise<{ stop: () => Promise<Recording | null> } | null> => {
  if (!isRecordingAvailable()) return null;

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    // Permission refused, or no microphone. Costs the learner nothing.
    return null;
  }

  const recorder = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };

  const context = new AudioContext();
  const analyser = context.createAnalyser();
  analyser.fftSize = 256;
  context.createMediaStreamSource(stream).connect(analyser);
  const buffer = new Uint8Array(analyser.frequencyBinCount);
  const peaks: number[] = [];

  let sampling = true;
  const sample = () => {
    if (!sampling) return;
    analyser.getByteTimeDomainData(buffer);
    let peak = 0;
    for (const value of buffer) peak = Math.max(peak, Math.abs(value - 128) / 128);
    peaks.push(peak);
    onPeak(peak);
    requestAnimationFrame(sample);
  };
  recorder.start();
  requestAnimationFrame(sample);

  return {
    stop: () =>
      new Promise<Recording | null>((resolve) => {
        sampling = false;
        recorder.onstop = () => {
          for (const track of stream.getTracks()) track.stop();
          void context.close();
          const blob = new Blob(chunks, { type: recorder.mimeType });
          resolve({
            url: URL.createObjectURL(blob),
            peaks,
            stop: () => URL.revokeObjectURL(blob as unknown as string),
          });
        };
        recorder.stop();
      }),
  };
};
