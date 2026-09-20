import { useState } from 'react';
import { copy } from '../../i18n/id.ts';
import { Button } from '../../ui/Button.tsx';
import { Screen } from '../../ui/Screen.tsx';
import {
  collectDeviceReport,
  formatDeviceReport,
  type DeviceReport,
  type LanguageProbe,
} from '../../platform/diagnostics.ts';
import { TTS_ONEND_DEADLINE_MS, type VoiceReport } from '../../platform/speech.ts';
import type { TargetLang } from '../../data/types.ts';

/**
 * Risk R1's manual test matrix, turned into a screen (SPEC §13).
 *
 * `docs/DECISIONS.md` Part 3 has been empty since M4 because filling it needs
 * hardware rather than code. This is the way out: the probes all run on the
 * device, so the only thing missing was somewhere to run them on purpose and a
 * way to get the answer off the phone.
 *
 * **The button matters as much as the screen.** Every other probe in the app
 * runs on a timer after first paint, which is not a user gesture — and iOS
 * Safari will not speak outside one, so it is marked dead there whether or not
 * it works (D29's recorded cost). A probe fired from a tap is the only honest
 * measurement that platform allows, and `adoptVerdict` lets a good answer count
 * for the rest of the session.
 */

interface DiagnosticsProps {
  /** Lets the home screen's audio line reflect a rescued device immediately. */
  onProbed: (lang: TargetLang, report: VoiceReport) => void;
  onBack: () => void;
}

const voiceLine = (report: VoiceReport): string => {
  switch (report.support) {
    case 'unsupported':
      return copy.diagnostics.unsupported;
    case 'no-voice':
      return copy.diagnostics.noVoice;
    case 'dead':
      return copy.diagnostics.dead;
    case 'ready':
      return report.onendMs !== null && report.onendMs > TTS_ONEND_DEADLINE_MS
        ? copy.diagnostics.slow(Math.round(report.onendMs))
        : copy.diagnostics.ready(Math.round(report.onendMs ?? 0));
  }
};

const ProbeResult = ({ probe }: { probe: LanguageProbe }) => (
  <div className="mt-4 rounded-2xl bg-stone-100 p-4 dark:bg-slate-900">
    <h3 className="font-semibold">{copy.diagnostics.langHeading(copy.langNames[probe.lang])}</h3>
    <p
      className="mt-1 text-sm text-stone-700 dark:text-slate-300"
      data-testid={`diagnostics-voice-${probe.lang}`}
    >
      {voiceLine(probe.report)}
    </p>
    {probe.adopted ? (
      <p
        className="mt-2 text-sm font-semibold text-teal-800 dark:text-teal-300"
        data-testid={`diagnostics-adopted-${probe.lang}`}
      >
        {copy.diagnostics.adopted}
      </p>
    ) : null}
  </div>
);

export const DiagnosticsScreen = ({ onProbed, onBack }: DiagnosticsProps) => {
  const [report, setReport] = useState<DeviceReport | null>(null);
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);

  const run = async () => {
    setRunning(true);
    setCopied(false);
    try {
      const collected = await collectDeviceReport();
      setReport(collected);
      for (const probe of collected.languages) onProbed(probe.lang, probe.report);
    } finally {
      setRunning(false);
    }
  };

  const text = report ? formatDeviceReport(report) : '';

  const copyReport = async () => {
    try {
      await navigator.clipboard?.writeText(text);
      setCopied(true);
    } catch {
      // No clipboard permission, or no clipboard. The textarea below is the
      // fallback and it is always there — selecting text by hand still works.
      setCopied(false);
    }
  };

  return (
    <Screen
      footer={
        <Button onClick={() => void run()} disabled={running} data-testid="diagnostics-run">
          {running ? copy.diagnostics.running : report ? copy.diagnostics.again : copy.diagnostics.run}
        </Button>
      }
    >
      <h1 className="text-2xl font-bold">{copy.diagnostics.heading}</h1>
      <p className="mt-2 text-stone-600 dark:text-slate-400">{copy.diagnostics.intro}</p>

      {report ? (
        <>
          {report.languages.map((probe) => (
            <ProbeResult key={probe.lang} probe={probe} />
          ))}

          <ul className="mt-4 flex flex-col gap-2 text-sm text-stone-600 dark:text-slate-400">
            {report.firstCallMs === null ? null : (
              <li data-testid="diagnostics-first-call">
                {copy.diagnostics.firstCall(Math.round(report.firstCallMs))}
                {report.firstCallMs > 1_000 ? ` ${copy.diagnostics.firstCallSlow}` : ''}
              </li>
            )}
            <li>
              {report.recognition === 'ready'
                ? copy.diagnostics.recognitionReady
                : copy.diagnostics.recognitionAbsent}
            </li>
            <li>
              {report.reminders === 'scheduled'
                ? copy.diagnostics.remindersScheduled
                : report.reminders === 'in-app-only'
                  ? copy.diagnostics.remindersInApp
                  : copy.diagnostics.remindersNone}
            </li>
          </ul>

          <h2 className="mt-8 text-lg font-bold">{copy.diagnostics.copyHeading}</h2>
          <p className="mt-1 text-sm text-stone-600 dark:text-slate-400">
            {copy.diagnostics.copyHint}
          </p>
          <textarea
            readOnly
            value={text}
            rows={8}
            data-testid="diagnostics-report"
            className="mt-3 w-full rounded-2xl border-2 border-stone-300 bg-white p-3 font-mono text-xs text-stone-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
          />
          <button
            type="button"
            onClick={() => void copyReport()}
            data-testid="diagnostics-copy"
            className="mt-2 min-h-12 w-full rounded-2xl border-2 border-stone-300 px-4 font-semibold text-teal-800 motion-safe:transition-colors hover:border-teal-700 dark:border-slate-700 dark:text-teal-300"
          >
            {copied ? copy.diagnostics.copied : copy.diagnostics.copy}
          </button>
        </>
      ) : null}

      <button
        type="button"
        onClick={onBack}
        data-testid="diagnostics-back"
        className="mt-8 min-h-12 w-full text-left text-sm text-stone-500 underline underline-offset-4 dark:text-slate-400"
      >
        {copy.diagnostics.back}
      </button>
    </Screen>
  );
};
