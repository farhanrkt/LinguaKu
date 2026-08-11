import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isRecordingAvailable,
  isSpeechInputAvailable,
  recognizeOnce,
  speechInputSupport,
} from './speechRecognition.ts';

/**
 * M7's acceptance criterion is that the app *"remains fully functional … with
 * speech APIs unavailable"*, and SPEC §5.1 adds "never block progression on it".
 *
 * So almost everything here is about the absent and broken cases. A recognizer
 * that works is the easy path; the one that is missing, refused, silent or
 * hanging is the one a learner on a cheap Android will actually meet.
 */

interface StubRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: { results: string[][] }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type Behaviour = 'hears' | 'error' | 'silent' | 'throws' | 'nothing';

const stubRecognition = (behaviour: Behaviour, transcript = 'hello') => {
  const started: string[] = [];
  class Stub implements StubRecognition {
    lang = '';
    continuous = false;
    interimResults = false;
    maxAlternatives = 1;
    onresult: ((event: { results: string[][] }) => void) | null = null;
    onerror: (() => void) | null = null;
    onend: (() => void) | null = null;
    start() {
      started.push(this.lang);
      if (behaviour === 'throws') throw new Error('already started');
      if (behaviour === 'hears') {
        setTimeout(() => this.onresult?.({ results: [[{ transcript } as never]] as never }), 0);
      }
      if (behaviour === 'error') setTimeout(() => this.onerror?.(), 0);
      if (behaviour === 'nothing') setTimeout(() => this.onend?.(), 0);
      // 'silent': the engine accepts and never fires anything at all.
    }
    stop() {}
    abort() {}
  }
  vi.stubGlobal('SpeechRecognition', Stub);
  return { started };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('speechInputSupport', () => {
  it('reports unsupported where the API is absent', () => {
    vi.stubGlobal('SpeechRecognition', undefined);
    vi.stubGlobal('webkitSpeechRecognition', undefined);
    expect(speechInputSupport()).toBe('unsupported');
    expect(isSpeechInputAvailable()).toBe(false);
  });

  it('finds the prefixed constructor Chromium ships', () => {
    vi.stubGlobal('SpeechRecognition', undefined);
    vi.stubGlobal('webkitSpeechRecognition', class {});
    expect(isSpeechInputAvailable()).toBe(true);
  });

  it('does not touch the microphone merely to answer the question', () => {
    // Detecting support must not prompt for permission: asking a learner to
    // grant a microphone so the app can decide whether to show a button is a
    // bad trade, and §5.1 makes speech optional anyway.
    const getUserMedia = vi.fn();
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });
    vi.stubGlobal('SpeechRecognition', class {});
    isSpeechInputAvailable();
    expect(getUserMedia).not.toHaveBeenCalled();
  });
});

describe('recognizeOnce — every failure resolves, none rejects', () => {
  it('returns the transcript when the engine hears something', async () => {
    stubRecognition('hears', 'she goes to school');
    await expect(recognizeOnce('en-US', 50)).resolves.toEqual({
      transcript: 'she goes to school',
      heard: true,
    });
  });

  it('resolves quietly when the API is absent', async () => {
    vi.stubGlobal('SpeechRecognition', undefined);
    vi.stubGlobal('webkitSpeechRecognition', undefined);
    await expect(recognizeOnce('en-US', 50)).resolves.toEqual({ transcript: '', heard: false });
  });

  it('resolves when the engine errors — a refused mic is not a wrong answer', async () => {
    stubRecognition('error');
    expect((await recognizeOnce('en-US', 50)).heard).toBe(false);
  });

  it('resolves when the engine ends without hearing anything', async () => {
    stubRecognition('nothing');
    expect((await recognizeOnce('en-US', 50)).heard).toBe(false);
  });

  it('gives up on an engine that hangs, rather than trapping the learner', async () => {
    // The failure mode that would actually block progression: an engine that
    // accepts the request and never fires anything back.
    stubRecognition('silent');
    expect((await recognizeOnce('en-US', 50)).heard).toBe(false);
  });

  it('resolves when start() itself throws', async () => {
    stubRecognition('throws');
    expect((await recognizeOnce('en-US', 50)).heard).toBe(false);
  });

  it('asks for one utterance, not a continuous stream', async () => {
    // Continuous mode is where the network dependency and the battery cost
    // live, and this app promises to work offline.
    let captured: StubRecognition | null = null;
    class Stub {
      lang = '';
      continuous = true;
      interimResults = true;
      maxAlternatives = 5;
      onresult: unknown = null;
      onerror: (() => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        captured = this as unknown as StubRecognition;
        setTimeout(() => this.onend?.(), 0);
      }
      stop() {}
      abort() {}
    }
    vi.stubGlobal('SpeechRecognition', Stub);
    await recognizeOnce('ja-JP', 50);
    expect(captured!.continuous).toBe(false);
    expect(captured!.interimResults).toBe(false);
    expect(captured!.lang).toBe('ja-JP');
  });
});

describe('isRecordingAvailable (SPEC §5.1 fallback)', () => {
  it('is false without MediaRecorder', () => {
    vi.stubGlobal('MediaRecorder', undefined);
    expect(isRecordingAvailable()).toBe(false);
  });

  it('is false without getUserMedia', () => {
    vi.stubGlobal('MediaRecorder', class {});
    vi.stubGlobal('navigator', {});
    expect(isRecordingAvailable()).toBe(false);
  });

  it('is true when both exist', () => {
    vi.stubGlobal('MediaRecorder', class {});
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: () => undefined } });
    expect(isRecordingAvailable()).toBe(true);
  });
});
