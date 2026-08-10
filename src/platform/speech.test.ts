import { afterEach, describe, expect, it, vi } from 'vitest';
import { canScheduleAudioOnly, listVoices, pickVoice, probeVoice, speak } from './speech.ts';

/**
 * Everything here is about risk R1: the device lies, is slow, or has no voice,
 * and the app must reach an honest verdict either way.
 */

const voice = (
  name: string,
  lang: string,
  localService = true,
): SpeechSynthesisVoice => ({ name, lang, localService, default: false, voiceURI: name });

/** The slice of SpeechSynthesisUtterance our stub engine actually touches. */
interface StubUtterance {
  text: string;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

interface StubOptions {
  voices?: SpeechSynthesisVoice[];
  /** Voices appear only after this many ms, as real engines do. */
  voicesAfterMs?: number;
  /** What the engine does when asked to speak. */
  utterance?: 'start' | 'error' | 'silent';
}

const stubSpeech = (options: StubOptions = {}) => {
  const listeners = new Set<() => void>();
  let voices: SpeechSynthesisVoice[] = options.voicesAfterMs ? [] : (options.voices ?? []);
  const spoken: string[] = [];

  if (options.voicesAfterMs !== undefined) {
    setTimeout(() => {
      voices = options.voices ?? [];
      for (const listener of listeners) listener();
    }, options.voicesAfterMs);
  }

  vi.stubGlobal('speechSynthesis', {
    getVoices: () => voices,
    speak: (utterance: StubUtterance) => {
      spoken.push(utterance.text);
      const behaviour = options.utterance ?? 'start';
      if (behaviour === 'start') setTimeout(() => utterance.onstart?.(), 0);
      if (behaviour === 'error') setTimeout(() => utterance.onerror?.(), 0);
      // 'silent': the engine accepts the utterance and never says anything.
    },
    cancel: () => {},
    addEventListener: (_event: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_event: string, listener: () => void) => listeners.delete(listener),
  });

  vi.stubGlobal(
    'SpeechSynthesisUtterance',
    class {
      text: string;
      voice: SpeechSynthesisVoice | null = null;
      lang = '';
      volume = 1;
      rate = 1;
      onstart: ((event: Event) => void) | null = null;
      onend: ((event: Event) => void) | null = null;
      onerror: ((event: Event) => void) | null = null;
      constructor(text: string) {
        this.text = text;
      }
    },
  );

  return { spoken };
};

/** Real engines get seconds; tests do not need to wait them out. */
const FAST = { voicesTimeoutMs: 50, utteranceTimeoutMs: 50 };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('listVoices', () => {
  it('waits for a list that populates late instead of calling it empty', async () => {
    stubSpeech({ voices: [voice('Google US English', 'en-US')], voicesAfterMs: 50 });
    expect(await listVoices('en')).toHaveLength(1);
  });

  it('gives up after the timeout rather than hanging forever', async () => {
    stubSpeech({ voices: [], voicesAfterMs: 5_000 });
    expect(await listVoices('en', 50)).toEqual([]);
  });

  it('matches on the language prefix, not the exact tag', async () => {
    stubSpeech({ voices: [voice('A', 'en-GB'), voice('B', 'en_AU'), voice('C', 'ja-JP')] });
    expect((await listVoices('en')).map((v) => v.name)).toEqual(['A', 'B']);
    expect((await listVoices('ja')).map((v) => v.name)).toEqual(['C']);
  });

  it('returns nothing when the API is absent', async () => {
    vi.stubGlobal('speechSynthesis', undefined);
    expect(await listVoices('en')).toEqual([]);
  });
});

describe('pickVoice', () => {
  it('prefers an on-device voice, since offline is the promise', () => {
    const remote = voice('Remote', 'en-US', false);
    const local = voice('Local', 'en-US', true);
    expect(pickVoice([remote, local])?.name).toBe('Local');
  });

  it('falls back to a network voice rather than none at all', () => {
    expect(pickVoice([voice('Remote', 'en-US', false)])?.name).toBe('Remote');
  });

  it('returns null when there is nothing to pick', () => {
    expect(pickVoice([])).toBeNull();
  });
});

describe('probeVoice (risk R1)', () => {
  it('reports ready when a voice exists and the engine confirms it', async () => {
    stubSpeech({ voices: [voice('Google US English', 'en-US')] });
    expect(await probeVoice('en', FAST)).toMatchObject({
      support: 'ready',
      voiceName: 'Google US English',
      localService: true,
    });
  });

  it('reports no-voice when the language is missing', async () => {
    stubSpeech({ voices: [voice('Google US English', 'en-US')] });
    expect(await probeVoice('ja', FAST)).toMatchObject({ support: 'no-voice', voiceName: null });
  });

  it('catches an engine that lists a voice but never speaks', async () => {
    // The failure mode that makes listing voices insufficient on its own.
    stubSpeech({ voices: [voice('Ghost', 'en-US')], utterance: 'silent' });
    expect((await probeVoice('en', FAST)).support).toBe('no-voice');
  });

  it('catches an engine that errors on speak', async () => {
    stubSpeech({ voices: [voice('Broken', 'en-US')], utterance: 'error' });
    expect((await probeVoice('en', FAST)).support).toBe('no-voice');
  });

  it('reports unsupported when the API is missing entirely', async () => {
    vi.stubGlobal('speechSynthesis', undefined);
    expect(await probeVoice('en', FAST)).toMatchObject({ support: 'unsupported', voiceCount: 0 });
  });

  it('flags a network-only voice, which cannot be trusted offline', async () => {
    stubSpeech({ voices: [voice('Cloud', 'en-US', false)] });
    expect(await probeVoice('en', FAST)).toMatchObject({ support: 'ready', localService: false });
  });
});

describe('canScheduleAudioOnly (SPEC §2.6)', () => {
  it('withholds L4 unless audio genuinely works', () => {
    const base = { voiceName: null, localService: false, voiceCount: 0, probedAt: 0 };
    expect(canScheduleAudioOnly({ ...base, support: 'ready' })).toBe(true);
    expect(canScheduleAudioOnly({ ...base, support: 'no-voice' })).toBe(false);
    expect(canScheduleAudioOnly({ ...base, support: 'unsupported' })).toBe(false);
    expect(canScheduleAudioOnly(null)).toBe(false);
  });
});

describe('speak', () => {
  it('says the text it was given', async () => {
    const { spoken } = stubSpeech({ voices: [voice('Voice', 'en-US')], utterance: 'start' });
    await Promise.race([speak('halo', 'en'), new Promise((r) => setTimeout(r, 100))]);
    expect(spoken).toContain('halo');
  });

  it('resolves quietly when there is no voice, rather than throwing mid-session', async () => {
    stubSpeech({ voices: [] });
    await expect(speak('halo', 'en')).resolves.toBeUndefined();
  });
});
