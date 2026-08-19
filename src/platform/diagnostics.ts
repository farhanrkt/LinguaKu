/**
 * The device report — R1's manual test matrix, made runnable by whoever is
 * holding the phone.
 *
 * `docs/DECISIONS.md` Part 3 has been empty since M4, and it is the last
 * technical unknown in the product: it gates L4 dictation, the minimal-pair
 * drills, the listening axis of the radar, and shadowing. It has stayed empty
 * for a mundane reason — filling it needs real hardware, and the person with
 * the hardware is not the person with the debugger.
 *
 * So this module collects the rows instead. Everything the matrix asks for is
 * observable from inside the app; what was missing was somewhere to put it and
 * a way to get it out. `formatDeviceReport` emits markdown that pastes straight
 * into Part 3.
 *
 * Two things make this more than a convenience:
 *
 *  - **It probes from inside a tap.** D29 records that the boot probe marks iOS
 *    Safari dead where audio would have worked, because iOS requires a user
 *    gesture and neither boot nor first paint is one. A button *is* one, so this
 *    is the only place in the app where iOS gets an honest answer — and
 *    `adoptVerdict` lets that answer count (see src/platform/speech.ts).
 *  - **It measures rather than judges.** The probe here runs to a deliberately
 *    long deadline and reports the elapsed time, because the open question is
 *    whether the app's deadline is the right number on a cheap Android. A
 *    verdict of "dead" answers a different question than "finished, in 932 ms"
 *    — and that distinction is what corrected the deadline in v1.5.1.
 */

import {
  adoptVerdict,
  firstCallLatencyMs,
  probeVoice,
  TTS_ONEND_DEADLINE_MS,
  type VoiceReport,
} from './speech.ts';
import { speechInputSupport, type SpeechInputSupport } from './speechRecognition.ts';
import {
  notificationPermission,
  reminderSupport,
  type PermissionState,
  type ReminderSupport,
} from './notifications.ts';
import { getStorageDurability, type StorageDurability } from './persistence.ts';
import type { TargetLang } from '../data/types.ts';

/**
 * Long enough to time an engine the app would give up on.
 *
 * The app schedules L4 against `TTS_ONEND_DEADLINE_MS` and that is not relaxed
 * here — a slower engine is reported, not adopted. But a device that completes
 * at 932 ms is a different finding from one that never completes at all, and at
 * the app's own deadline the two look identical in the table. Keeping this
 * generous is what let the first real row correct the deadline instead of
 * silently confirming it.
 */
export const DIAGNOSTIC_DEADLINE_MS = 5_000;

/** BCP-47 tags the probe uses, matching what the app asks for at runtime. */
const PROBE_LANGS: Record<TargetLang, string> = { en: 'en-US', ja: 'ja-JP' };

export interface LanguageProbe {
  lang: TargetLang;
  report: VoiceReport;
  /**
   * Whether this run's verdict was taken up for the session. True only when a
   * device that had been treated as silent turned out, from inside the tap, to
   * speak inside the app's own deadline.
   */
  adopted: boolean;
}

/**
 * What the phone actually is, which the user agent no longer says.
 *
 * The first real row came back as `Android 10; K` — Chrome has frozen the model
 * to "K" and the platform version to 10 since v110, so a matrix keyed on the UA
 * string cannot tell a 2019 budget phone from this year's flagship. That
 * distinction is the entire point of R1: "works on a cheap Android" is the
 * claim under test.
 *
 * These come from client hints and are all best-effort — Chromium-only, absent
 * on Firefox and Safari, and null rather than guessed when unavailable.
 */
export interface DeviceHints {
  model: string | null;
  /**
   * The OS name, read rather than assumed.
   *
   * This row used to be printed as `Android/OS <version>` on every device,
   * because the matrix's whole subject is cheap Android phones. On a Mac it
   * produced *"Android/OS 26.5.0"*, and on an iPhone it would have produced a
   * row claiming Android — which is worse than an empty cell, since the empty
   * ones are the honest ones. Chromium has always offered this for free as a
   * low-entropy hint; nothing had asked for it.
   */
  platform: string | null;
  platformVersion: string | null;
  /** GB of RAM, rounded down by the browser. The cheapness signal that matters. */
  memoryGb: number | null;
  cores: number | null;
  screen: string | null;
}

export interface DeviceReport {
  collectedAt: number;
  userAgent: string;
  device: DeviceHints;
  languages: LanguageProbe[];
  /** Cost of the very first `getVoices()` call, in ms — see R1's 15s finding. */
  firstCallMs: number | null;
  recognition: SpeechInputSupport;
  reminders: ReminderSupport;
  notifications: PermissionState;
  storage: StorageDurability;
  /** Installed as a PWA, or running in a browser tab. */
  standalone: boolean;
}

interface UserAgentDataLike {
  /** Low-entropy and synchronous: present whenever `userAgentData` is. */
  platform?: string;
  getHighEntropyValues?: (hints: string[]) => Promise<{ model?: string; platformVersion?: string }>;
}

const collectHints = async (): Promise<DeviceHints> => {
  const nav = globalThis.navigator as
    | (Navigator & { userAgentData?: UserAgentDataLike; deviceMemory?: number })
    | undefined;

  const hints: DeviceHints = {
    model: null,
    platform: nav?.userAgentData?.platform?.trim() || null,
    platformVersion: null,
    memoryGb: nav?.deviceMemory ?? null,
    cores: nav?.hardwareConcurrency ?? null,
    screen:
      typeof globalThis.screen === 'undefined'
        ? null
        : `${globalThis.screen.width}×${globalThis.screen.height} @${globalThis.devicePixelRatio ?? 1}x`,
  };

  try {
    const high = await nav?.userAgentData?.getHighEntropyValues?.(['model', 'platformVersion']);
    if (high) {
      hints.model = high.model?.trim() || null;
      hints.platformVersion = high.platformVersion?.trim() || null;
    }
  } catch {
    // Firefox and Safari have no userAgentData, and a browser may refuse the
    // hints. Null is the honest answer; a guess would be a fabricated row.
  }
  return hints;
};

const isStandalone = (): boolean => {
  try {
    return globalThis.matchMedia?.('(display-mode: standalone)').matches === true;
  } catch {
    return false;
  }
};

/**
 * Runs every probe the matrix asks about. **Call this from a user gesture** —
 * that is what makes the iOS answer meaningful, and it is also the only polite
 * time to make a device spend fifteen seconds inside `speechSynthesis`.
 */
export const collectDeviceReport = async (
  langs: readonly TargetLang[] = ['en', 'ja'],
  now: number = Date.now(),
): Promise<DeviceReport> => {
  const languages: LanguageProbe[] = [];
  for (const lang of langs) {
    // Sequential on purpose: two engines speaking at once on a device with one
    // synthesis queue would time each other out and report two dead voices.
    const report = await probeVoice(PROBE_LANGS[lang], {
      utteranceTimeoutMs: DIAGNOSTIC_DEADLINE_MS,
    });
    languages.push({ lang, report, adopted: adoptVerdict(lang, report) });
  }

  return {
    collectedAt: now,
    userAgent: typeof navigator === 'undefined' ? 'unknown' : navigator.userAgent,
    device: await collectHints(),
    languages,
    firstCallMs: firstCallLatencyMs(),
    recognition: speechInputSupport(),
    reminders: reminderSupport(),
    notifications: notificationPermission(),
    storage: await getStorageDurability(),
    standalone: isStandalone(),
  };
};

// ------------------------------------------------------------------ formatting

const ms = (value: number | null): string =>
  value === null ? '—' : `${Math.round(value)} ms`;

/** One language's column in the matrix: the verdict, and the number behind it. */
export const formatVoiceCell = (report: VoiceReport): string => {
  switch (report.support) {
    case 'unsupported':
      return 'no speechSynthesis';
    case 'no-voice':
      return 'no voice';
    case 'dead':
      return `dead (listed ${report.voiceCount}, never finished in ${DIAGNOSTIC_DEADLINE_MS} ms)`;
    case 'ready':
      return `ready in ${ms(report.onendMs)} — ${report.voiceName ?? 'unnamed'}${
        report.onendMs !== null && report.onendMs > TTS_ONEND_DEADLINE_MS
          ? ` (over the ${TTS_ONEND_DEADLINE_MS} ms deadline: L4 stays withheld)`
          : ''
      }`;
  }
};

const localServiceCell = (probes: readonly LanguageProbe[]): string => {
  const withVoice = probes.filter((probe) => probe.report.voiceName !== null);
  if (withVoice.length === 0) return '—';
  return withVoice
    .map((probe) => `${probe.lang}: ${probe.report.localService ? 'yes' : 'no (network?)'}`)
    .join(', ');
};

const cellFor = (report: DeviceReport, lang: TargetLang): string => {
  const probe = report.languages.find((entry) => entry.lang === lang);
  return probe ? formatVoiceCell(probe.report) : 'not probed';
};

/**
 * Markdown for `docs/DECISIONS.md` Part 3 — a table row plus the context that
 * does not fit in one.
 *
 * Deliberately in English while every learner-facing string in the app is
 * Indonesian: this output is not learner-facing copy, it is a bug report being
 * pasted into an engineering document.
 */
/** The device column: what it is, falling back to the UA when hints are absent. */
/** The OS, named where the browser will say and omitted where it will not. */
const osCell = ({ platform, platformVersion }: DeviceHints): string | null => {
  if (platform === null && platformVersion === null) return null;
  if (platform === null) return `OS ${platformVersion}`;
  return platformVersion === null ? platform : `${platform} ${platformVersion}`;
};

const deviceCell = (report: DeviceReport): string => {
  const { model, memoryGb, cores } = report.device;
  const parts = [
    model,
    osCell(report.device),
    memoryGb === null ? null : `${memoryGb} GB RAM`,
    cores === null ? null : `${cores} cores`,
  ].filter((part): part is string => part !== null);

  // The UA is kept either way: it carries the browser version, which the hints
  // do not, and it is the only thing a non-Chromium browser will give us.
  return parts.length > 0 ? `${parts.join(', ')} — ${report.userAgent}` : report.userAgent;
};

export const formatDeviceReport = (report: DeviceReport): string => {
  const row = [
    deviceCell(report),
    cellFor(report, 'en'),
    cellFor(report, 'ja'),
    localServiceCell(report.languages),
    ms(report.firstCallMs),
    report.recognition === 'ready' ? 'present' : 'absent',
  ].join(' | ');

  const notes = [
    `collected: ${new Date(report.collectedAt).toISOString()}`,
    `first speechSynthesis call: ${ms(report.firstCallMs)}${
      report.firstCallMs !== null && report.firstCallMs > 1_000
        ? ' — R1\'s stall reproduces on this device'
        : ''
    }`,
    `probe deadline used: ${DIAGNOSTIC_DEADLINE_MS} ms; the app schedules L4 at ≤ ${TTS_ONEND_DEADLINE_MS} ms`,
    `reminders: ${report.reminders} (permission: ${report.notifications})`,
    `storage: ${report.storage}`,
    `screen: ${report.device.screen ?? 'unknown'}`,
    `display: ${report.standalone ? 'standalone (installed)' : 'browser tab'}`,
    ...report.languages
      .filter((probe) => probe.adopted)
      .map(
        (probe) =>
          `${probe.lang}: adopted from inside the tap — the boot probe had this device as silent`,
      ),
  ];

  return [`| ${row} |`, '', ...notes.map((note) => `- ${note}`)].join('\n');
};
