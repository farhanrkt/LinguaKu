import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  collectDeviceReport,
  DIAGNOSTIC_DEADLINE_MS,
  formatDeviceReport,
  formatVoiceCell,
  type DeviceReport,
} from './diagnostics.ts';
import { isTtsLive, resetTtsVerdict, TTS_ONEND_DEADLINE_MS, type VoiceReport } from './speech.ts';

/**
 * The device report exists to fill `docs/DECISIONS.md` Part 3 from a real
 * phone, so what is tested here is that it reports what was observed — including
 * the observations that are inconvenient.
 */

const report = (overrides: Partial<VoiceReport> = {}): VoiceReport => ({
  support: 'ready',
  voiceName: 'Google US English',
  localService: true,
  voiceCount: 3,
  probedAt: 0,
  onendMs: 120,
  ...overrides,
});

const deviceReport = (overrides: Partial<DeviceReport> = {}): DeviceReport => ({
  collectedAt: Date.UTC(2026, 7, 12),
  userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-A125F)',
  languages: [
    { lang: 'en', report: report(), adopted: false },
    { lang: 'ja', report: report({ support: 'no-voice', voiceName: null, voiceCount: 0, onendMs: null }), adopted: false },
  ],
  firstCallMs: 8,
  recognition: 'ready',
  reminders: 'in-app-only',
  notifications: 'default',
  storage: 'persisted',
  standalone: true,
  ...overrides,
});

describe('formatVoiceCell', () => {
  it('reports the time an engine took, not just that it passed', () => {
    expect(formatVoiceCell(report({ onendMs: 120 }))).toContain('120 ms');
  });

  it('names a completing-but-too-slow engine as withheld rather than ready', () => {
    // The finding the matrix is for: is 500 ms right on a cheap Android? An
    // engine that finishes at 780 ms is a real answer, and it is not "dead".
    const cell = formatVoiceCell(report({ onendMs: 780 }));
    expect(cell).toContain('780 ms');
    expect(cell).toContain(`over the ${TTS_ONEND_DEADLINE_MS} ms deadline`);
  });

  it('distinguishes no voice from an engine that never finishes', () => {
    expect(formatVoiceCell(report({ support: 'no-voice' }))).toBe('no voice');
    expect(formatVoiceCell(report({ support: 'dead' }))).toContain('never finished');
    expect(formatVoiceCell(report({ support: 'unsupported' }))).toBe('no speechSynthesis');
  });
});

describe('formatDeviceReport', () => {
  it('emits a markdown row with a cell per matrix column', () => {
    const lines = formatDeviceReport(deviceReport()).split('\n');
    const row = lines[0] ?? '';
    expect(row.startsWith('|')).toBe(true);
    expect(row.split('|')).toHaveLength(8); // 6 cells plus the outer pipes
    expect(row).toContain('SM-A125F');
    expect(row).toContain('no voice');
  });

  it('calls out R1s stall when the first call was slow, and stays quiet when it was not', () => {
    expect(formatDeviceReport(deviceReport({ firstCallMs: 14_900 }))).toContain(
      "R1's stall reproduces",
    );
    expect(formatDeviceReport(deviceReport({ firstCallMs: 8 }))).not.toContain('reproduces');
  });

  it('says which deadline was used, so the numbers cannot be read against the wrong bar', () => {
    const text = formatDeviceReport(deviceReport());
    expect(text).toContain(`${DIAGNOSTIC_DEADLINE_MS} ms`);
    expect(text).toContain(`≤ ${TTS_ONEND_DEADLINE_MS} ms`);
  });

  it('records when a probe from inside the tap rescued a device the boot probe called silent', () => {
    const rescued = deviceReport({
      languages: [{ lang: 'en', report: report(), adopted: true }],
    });
    expect(formatDeviceReport(rescued)).toContain('adopted from inside the tap');
  });

  it('reports a missing recognizer as absent rather than omitting the column', () => {
    expect(formatDeviceReport(deviceReport({ recognition: 'unsupported' })).split('\n')[0]).toContain(
      'absent',
    );
  });
});

describe('collectDeviceReport', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    resetTtsVerdict();
  });

  it('reaches a verdict for every language on a device with no speech API at all', async () => {
    vi.stubGlobal('speechSynthesis', undefined);
    vi.stubGlobal('navigator', { userAgent: 'test-agent' });

    const collected = await collectDeviceReport();
    expect(collected.languages.map((probe) => probe.report.support)).toEqual([
      'unsupported',
      'unsupported',
    ]);
    expect(collected.recognition).toBe('unsupported');
    // Nothing was adopted, so nothing claims the device can speak.
    expect(isTtsLive('en')).toBe(false);
  });
});
