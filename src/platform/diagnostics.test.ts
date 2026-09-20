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
  userAgent: 'Mozilla/5.0 (Linux; Android 10; K) Chrome/151.0.0.0',
  device: {
    model: 'SM-A125F',
    platform: 'Android',
    platformVersion: '13',
    memoryGb: 2,
    cores: 8,
    screen: '360×800 @2x',
  },
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
    const cell = formatVoiceCell(report({ onendMs: TTS_ONEND_DEADLINE_MS + 500 }));
    expect(cell).toContain(`over the ${TTS_ONEND_DEADLINE_MS} ms deadline`);
  });

  it('serves the device that corrected the deadline', () => {
    // The first real row (2026-08-13, Chrome 151 / Android): working on-device
    // voices at 932 ms and 999 ms, withheld by the old 500 ms deadline. This is
    // the regression guard for that row — if the deadline ever tightens back
    // under a second, this phone silently loses L4 and the mora drills again.
    for (const onendMs of [932, 999]) {
      const cell = formatVoiceCell(report({ onendMs }));
      expect(cell).toContain(`${onendMs} ms`);
      expect(cell).not.toContain('stays withheld');
    }
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
    expect(row).toContain('no voice');
  });

  it('names the device, which the user agent no longer does', () => {
    // Chrome freezes the UA to "Android 10; K" regardless of the phone, so a
    // row keyed on it cannot tell a budget device from a flagship — and "works
    // on a cheap Android" is the claim R1 is about.
    const row = formatDeviceReport(deviceReport()).split('\n')[0] ?? '';
    expect(row).toContain('SM-A125F');
    expect(row).toContain('2 GB RAM');
    expect(row).toContain('Android 13');
    // The UA stays, because it carries the browser version the hints do not.
    expect(row).toContain('Chrome/151.0.0.0');
  });

  it('names the OS the browser reports, never the one the matrix is about', () => {
    // The row was hardcoded to "Android/OS <version>" because R1 is about cheap
    // Android phones. A Mac reported "Android/OS 26.5.0"; an iPhone would have
    // reported Android. The empty cells in this matrix are the honest ones, and
    // a row naming the wrong OS is worth less than no row at all.
    const mac = formatDeviceReport(
      deviceReport({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/148.0.0.0',
        device: {
          model: null,
          platform: 'macOS',
          platformVersion: '26.5.0',
          memoryGb: 8,
          cores: 8,
          screen: '1440×900 @2x',
        },
      }),
    ).split('\n')[0] ?? '';
    expect(mac).toContain('macOS 26.5.0');
    expect(mac).not.toContain('Android');
  });

  it('still says something when only one half of the OS is known', () => {
    // Firefox and Safari have no client hints at all; a Chromium that refuses
    // the high-entropy call still gives the platform name.
    const partial = formatDeviceReport(
      deviceReport({
        device: {
          model: null,
          platform: 'iOS',
          platformVersion: null,
          memoryGb: null,
          cores: null,
          screen: null,
        },
      }),
    ).split('\n')[0] ?? '';
    expect(partial).toContain('iOS');
    expect(partial).not.toContain('undefined');
  });

  it('falls back to the user agent where client hints are unavailable', () => {
    // Firefox and Safari have no userAgentData. A row with no device name is
    // worth less than one with it, and much more than an invented one.
    const noHints = deviceReport({
      device: {
        model: null,
        platform: null,
        platformVersion: null,
        memoryGb: null,
        cores: null,
        screen: null,
      },
    });
    const row = formatDeviceReport(noHints).split('\n')[0] ?? '';
    expect(row).toContain('Chrome/151.0.0.0');
    expect(row).not.toContain('—  ');
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
