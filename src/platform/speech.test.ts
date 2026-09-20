import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  adoptVerdict,
  isTtsLive,
  listVoices,
  pickVoice,
  probeOnBoot,
  probeVoice,
  resetTtsVerdict,
  speak,
  TTS_ONEND_DEADLINE_MS,
  ttsReport,
  type VoiceReport,
} from './speech.ts';

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
  /**
   * What the engine does when asked to speak.
   *  'end'     — the honest engine: starts and finishes.
   *  'start'   — fires onstart and then never finishes. This is the Android
   *              failure the onend deadline exists to catch.
   *  'error'   — refuses outright.
   *  'silent'  — accepts the utterance and does nothing at all.
   *  'slow'    — finishes, but after the deadline has passed.
   */
  utterance?: 'end' | 'start' | 'error' | 'silent' | 'slow';
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
      const behaviour = options.utterance ?? 'end';
      if (behaviour === 'end') {
        setTimeout(() => utterance.onstart?.(), 0);
        setTimeout(() => utterance.onend?.(), 0);
      }
      // 'start': it announces itself and then goes quiet forever.
      if (behaviour === 'start') setTimeout(() => utterance.onstart?.(), 0);
      if (behaviour === 'error') setTimeout(() => utterance.onerror?.(), 0);
      if (behaviour === 'slow') {
        setTimeout(() => utterance.onstart?.(), 0);
        setTimeout(() => utterance.onend?.(), 5_000);
      }
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
const FAST = { voicesTimeoutMs: 50, utteranceTimeoutMs: 50, deferMs: 0 };

afterEach(() => {
  vi.unstubAllGlobals();
  resetTtsVerdict();
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
    expect((await probeVoice('en', FAST)).support).toBe('dead');
  });

  it('catches an engine that starts and then never finishes', async () => {
    // Precisely why the probe waits for `onend` and not `onstart`: this engine
    // announces itself, produces nothing, and would pass a start-based check.
    stubSpeech({ voices: [voice('Liar', 'en-US')], utterance: 'start' });
    expect((await probeVoice('en', FAST)).support).toBe('dead');
  });

  it('calls an engine slower than the deadline dead', async () => {
    stubSpeech({ voices: [voice('Sluggish', 'en-US')], utterance: 'slow' });
    expect((await probeVoice('en', FAST)).support).toBe('dead');
  });

  it('catches an engine that errors on speak', async () => {
    stubSpeech({ voices: [voice('Broken', 'en-US')], utterance: 'error' });
    expect((await probeVoice('en', FAST)).support).toBe('dead');
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

describe('speak', () => {
  it('says the text it was given', async () => {
    const { spoken } = stubSpeech({ voices: [voice('Voice', 'en-US')], utterance: 'end' });
    await Promise.race([speak('halo', 'en'), new Promise((r) => setTimeout(r, 100))]);
    expect(spoken).toContain('halo');
  });

  it('resolves quietly when there is no voice, rather than throwing mid-session', async () => {
    stubSpeech({ voices: [] });
    await expect(speak('halo', 'en')).resolves.toBeUndefined();
  });
});

describe('the boot verdict (risk R1)', () => {
  it('waits exactly half a second for onend before giving up', () => {
    // The device matrix's number. Kept as a named constant so the deadline is
    // one decision in one place rather than a literal sprinkled about.
    // Raised from 500 ms after the first real device row (2026-08-13): a phone
    // with working on-device voices in both languages completed at 932 ms and
    // 999 ms, and a 500 ms deadline withheld L4 from it. See D29.
    expect(TTS_ONEND_DEADLINE_MS).toBe(2_000);
  });

  it('reports nothing until the probe has actually answered', () => {
    expect(ttsReport('en')).toBeNull();
    // Unknown counts as not live: claiming audio we have not verified is the
    // failure this module exists to prevent (SPEC §2.6).
    expect(isTtsLive('en')).toBe(false);
  });

  it('holds one verdict for the whole session instead of re-probing', async () => {
    const stub = stubSpeech({ voices: [voice('Voice', 'en-US')], utterance: 'end' });
    await probeOnBoot('en', FAST);
    await probeOnBoot('en', FAST);
    await probeOnBoot('en', FAST);
    // Three callers, one utterance: an L4 card must not pay a probe each time,
    // and a verdict that flips mid-session would flicker the rung in and out.
    expect(stub.spoken).toHaveLength(1);
    expect(isTtsLive('en')).toBe(true);
  });

  /**
   * Voice availability is per language, and R1 says `ja-JP` is the one most
   * likely to be missing on a cheap Android. A single verdict shared across
   * languages would let an en-US voice vouch for Japanese — reporting audio as
   * ready, scheduling L4 dictation and mora minimal-pair drills, and then having
   * nothing to speak them with. That is the silent degradation §2.6 forbids.
   */
  it('reaches a separate verdict per language', async () => {
    const stub = stubSpeech({ voices: [voice('Voice', 'en-US')], utterance: 'end' });
    await probeOnBoot('en', FAST);
    expect(isTtsLive('en')).toBe(true);

    // The same device, asked about a language it has no voice for.
    await probeOnBoot('ja', FAST);
    expect(isTtsLive('ja')).toBe(false);
    expect(isTtsLive('en')).toBe(true);
    // One utterance per language, not one for the app.
    expect(stub.spoken).toHaveLength(1);
  });

  it('still holds one verdict per language for the whole session', async () => {
    const stub = stubSpeech({ voices: [voice('Voice', 'ja-JP')], utterance: 'end' });
    await probeOnBoot('ja', FAST);
    await probeOnBoot('ja', FAST);
    expect(stub.spoken).toHaveLength(1);
    expect(isTtsLive('ja')).toBe(true);
  });

  it('shares one probe between concurrent callers', async () => {
    const stub = stubSpeech({ voices: [voice('Voice', 'en-US')], utterance: 'end' });
    const reports = await Promise.all([
      probeOnBoot('en', FAST),
      probeOnBoot('en', FAST),
      probeOnBoot('en', FAST),
    ]);
    expect(stub.spoken).toHaveLength(1);
    expect(new Set(reports.map((report) => report.support))).toEqual(new Set(['ready']));
  });

  it('does not touch the speech API until the main thread is idle', async () => {
    // The regression guard for a measured cost: the first touch of
    // `speechSynthesis` where no speech service exists stalls the main thread
    // for ~15s, which would put the probe five times over SPEC §5.4's whole
    // icon-tap-to-first-question budget.
    const stub = stubSpeech({ voices: [voice('Voice', 'en-US')], utterance: 'end' });
    const probe = probeOnBoot('en', { ...FAST, deferMs: 60 });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(stub.spoken).toHaveLength(0);
    expect(isTtsLive('en')).toBe(false);
    await probe;
    expect(stub.spoken).toHaveLength(1);
  });

  it('marks the engine dead for the session when onend never arrives', async () => {
    stubSpeech({ voices: [voice('Liar', 'en-US')], utterance: 'start' });
    expect((await probeOnBoot('en', FAST)).support).toBe('dead');
    expect(isTtsLive('en')).toBe(false);
    // And it stays dead — no second chance mid-session.
    expect(ttsReport('en')?.support).toBe('dead');
  });
});

describe('adoptVerdict — the gesture-driven second chance (D29)', () => {
  const ready = (onendMs: number | null): VoiceReport => ({
    support: 'ready',
    voiceName: 'Samantha',
    localService: true,
    voiceCount: 1,
    probedAt: 0,
    onendMs,
  });

  it('rescues a device the boot probe called silent', async () => {
    // Exactly iOS Safari: the boot probe cannot speak outside a gesture, so it
    // marks a working engine dead. A probe from inside a tap knows better.
    stubSpeech({ voices: [voice('Samantha', 'en-US')], utterance: 'silent' });
    expect((await probeOnBoot('en', FAST)).support).toBe('dead');
    expect(isTtsLive('en')).toBe(false);

    expect(adoptVerdict('en', ready(120))).toBe(true);
    expect(isTtsLive('en')).toBe(true);
  });

  it('refuses to adopt an engine that finished after the deadline', () => {
    // L4 is scheduled against the deadline. Admitting a slower engine here
    // would put dictation cards in front of someone who has to wait for them.
    expect(adoptVerdict('en', ready(TTS_ONEND_DEADLINE_MS + 1))).toBe(false);
    expect(isTtsLive('en')).toBe(false);
  });

  it('never retracts an engine that has already been heard to speak', async () => {
    stubSpeech({ voices: [voice('Voice', 'en-US')], utterance: 'end' });
    await probeOnBoot('en', FAST);
    expect(isTtsLive('en')).toBe(true);

    // A later failure is not evidence the device cannot speak, and flipping the
    // rung out mid-session is the flicker D29 exists to prevent.
    expect(
      adoptVerdict('en', { ...ready(null), support: 'dead', voiceName: null }),
    ).toBe(false);
    expect(isTtsLive('en')).toBe(true);
  });
});

describe('probeVoice timing', () => {
  it('records how long the utterance actually took, not just that it passed', async () => {
    stubSpeech({ voices: [voice('Voice', 'en-US')], utterance: 'end' });
    const report = await probeVoice('en', FAST);
    expect(report.support).toBe('ready');
    expect(report.onendMs).not.toBeNull();
    expect(report.onendMs).toBeGreaterThanOrEqual(0);
  });

  it('reports no elapsed time when the engine never finished', async () => {
    stubSpeech({ voices: [voice('Liar', 'en-US')], utterance: 'start' });
    expect((await probeVoice('en', FAST)).onendMs).toBeNull();
  });
});
