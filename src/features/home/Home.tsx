import { useEffect } from 'react';
import { copy } from '../../i18n/id.ts';
import { Button } from '../../ui/Button.tsx';
import { OptionCard } from '../../ui/OptionCard.tsx';
import { Screen } from '../../ui/Screen.tsx';
import { sessionProgress } from '../../data/repositories/sessions.ts';
import { activateTarget, scriptModeOnSwitch } from '../../data/repositories/profiles.ts';
import type { DailyMinutes, Profile, Session, TargetLang } from '../../data/types.ts';
import type { OfflineStatus } from '../../platform/serviceWorker.ts';
import type { VoiceReport } from '../../platform/speech.ts';
import type { StorageDurability } from '../../platform/persistence.ts';

const TARGETS: TargetLang[] = ['en', 'ja'];
const MINUTES: DailyMinutes[] = [4, 8, 15];

interface HomeProps {
  profile: Profile;
  offline: OfflineStatus;
  durability: StorageDurability;
  /** An unfinished session, if the learner was interrupted (SPEC §2.13). */
  resumable: Session | null;
  busy: boolean;
  /** The boot probe's verdict, or null while it is still running (risk R1). */
  voice: VoiceReport | null;
  /** False while the learner has not yet taken (or declined) placement. */
  placementOffered: boolean;
  /** Fired once the home screen is up; releases the speech probe (risk R1). */
  onReady: () => void;
  onPlacement: () => void;
  onProgress: () => void;
  onAttribution: () => void;
  onRead: () => void;
  onSync: () => void;
  onDiagnostics: () => void;
  onPractise: () => void;
  onChange: (changes: Partial<Pick<Profile, 'targets' | 'dailyMinutes' | 'scriptMode'>>) => void;
  /**
   * SPEC §2.13: the learner's own cue word when it has passed and today holds
   * no practice, otherwise null. Their words, not ours — that is the mechanism.
   */
  cueDue: string | null;
  onHabit: () => void;
  onDismissCue: () => void;
}

const offlineLabel: Record<OfflineStatus, string> = {
  ready: copy.home.offlineReady,
  preparing: copy.home.offlinePreparing,
  unavailable: copy.home.offlineUnavailable,
};

export const Home = ({
  profile,
  offline,
  durability,
  voice,
  resumable,
  busy,
  placementOffered,
  onReady,
  onPlacement,
  onProgress,
  onAttribution,
  onRead,
  onSync,
  onDiagnostics,
  onPractise,
  onChange,
  cueDue,
  onHabit,
  onDismissCue,
}: HomeProps) => {
  // Sessions, content, drills and the ability estimate all follow `targets[0]`,
  // so this control switches *which language you are learning now* rather than
  // ticking a set. Tapping the one already active is a no-op; the other language
  // keeps its cards, its ability and its own unfinished session.
  const activeTarget = profile.targets[0] ?? 'en';
  const switchTarget = (lang: TargetLang) => {
    if (lang === activeTarget) return;
    onChange({
      targets: activateTarget(profile.targets, lang),
      // SPEC §4.3: a first-time Japanese learner starts at kana, whatever the
      // profile was carrying from its English days.
      scriptMode: scriptModeOnSwitch(profile.targets, lang, profile.scriptMode),
    });
  };

  // After the paint: the speech probe can block the main thread outright on a
  // device with no engine, so nothing may release it before there is a screen.
  useEffect(() => {
    const frame = requestAnimationFrame(() => onReady());
    return () => cancelAnimationFrame(frame);
  }, [onReady]);

  const resumeProgress = resumable ? sessionProgress(resumable) : null;

  return (
    <Screen
      footer={
        // SPEC §10: the primary action lives in the thumb zone.
        <Button onClick={onPractise} disabled={busy} data-testid="practise">
          {resumable
            ? copy.session.resume
            : copy.session.start(profile.dailyMinutes)}
        </Button>
      }
    >
      <h1 className="text-2xl font-bold">{copy.home.greeting}</h1>
      <p className="mt-1 text-stone-600 dark:text-slate-400">
        {copy.home.learningLabel}{' '}
        <strong
          data-testid="learning-label"
          className="font-semibold text-stone-900 dark:text-slate-100"
        >
          {copy.langNames[activeTarget]}
        </strong>
        .
      </p>

      {/* SPEC §2.13's in-app cue. An invitation with a way out, never a
          reprimand (§2.14) — and it names the learner's own words back. */}
      {cueDue !== null ? (
        <div
          data-testid="habit-cue-banner"
          className="mt-4 rounded-2xl bg-teal-50 p-4 dark:bg-teal-950"
        >
          <p className="text-sm text-teal-900 dark:text-teal-200">{copy.habit.cueNudge(cueDue)}</p>
          <button
            type="button"
            onClick={onDismissCue}
            data-testid="habit-cue-dismiss"
            className="mt-2 min-h-12 text-sm text-teal-800 underline underline-offset-4 dark:text-teal-300"
          >
            {copy.habit.cueDismiss}
          </button>
        </div>
      ) : null}

      {placementOffered ? null : (
        // SPEC §4.2: offered, never enforced — a quiet link, not a gate.
        <button
          type="button"
          onClick={onPlacement}
          data-testid="placement-offer"
          className="mt-4 min-h-12 w-full rounded-2xl border-2 border-stone-300 px-4 font-semibold text-teal-800 motion-safe:transition-colors hover:border-teal-700 dark:border-slate-700 dark:text-teal-300"
        >
          {copy.placement.offer}
        </button>
      )}

      <button
        type="button"
        onClick={onRead}
        data-testid="reader-open"
        className="mt-4 min-h-12 w-full rounded-2xl border-2 border-stone-300 px-4 font-semibold text-teal-800 motion-safe:transition-colors hover:border-teal-700 dark:border-slate-700 dark:text-teal-300"
      >
        {copy.reader.open}
      </button>

      <button
        type="button"
        onClick={onProgress}
        data-testid="progress-open"
        className="mt-4 min-h-12 w-full rounded-2xl border-2 border-stone-300 px-4 font-semibold text-teal-800 motion-safe:transition-colors hover:border-teal-700 dark:border-slate-700 dark:text-teal-300"
      >
        {copy.progress.open}
      </button>

      {resumeProgress ? (
        <p className="mt-3 rounded-2xl bg-teal-50 p-3 text-sm text-teal-900 dark:bg-teal-950 dark:text-teal-200">
          {copy.session.progress(resumeProgress.done, resumeProgress.total)}
        </p>
      ) : null}

      <h2 className="mt-8 text-lg font-bold">{copy.home.changeTargets}</h2>
      <div className="mt-3 flex flex-col gap-3">
        {TARGETS.map((lang) => (
          <OptionCard
            key={lang}
            label={copy.firstRun.targets[lang].label}
            selected={lang === activeTarget}
            onToggle={() => switchTarget(lang)}
          />
        ))}
      </div>

      <h2 className="mt-8 text-lg font-bold">{copy.home.changeMinutes}</h2>
      <div className="mt-3 flex flex-col gap-3">
        {MINUTES.map((value) => (
          <OptionCard
            key={value}
            label={copy.firstRun.minutes[value].label}
            selected={profile.dailyMinutes === value}
            onToggle={() => onChange({ dailyMinutes: value })}
          />
        ))}
      </div>

      <h2 className="mt-8 text-lg font-bold">{copy.home.statusHeading}</h2>
      <ul className="mt-3 flex flex-col gap-2 text-sm text-stone-600 dark:text-slate-400">
        <li data-testid="offline-status">{offlineLabel[offline]}</li>
        <li>
          {durability === 'persisted' ? copy.home.storagePersisted : copy.home.storageBestEffort}
        </li>
        {/* SPEC §2.6 / risk R1: say what the probe found rather than letting a
            silent device look like a broken app. */}
        <li data-testid="audio-status">
          {voice === null
            ? copy.home.audioProbing
            : voice.support === 'ready'
              ? copy.home.audioReady
              : copy.home.audioDead}
        </li>
      </ul>

      {/* Risk R1: the probe runs on a timer and iOS will not speak outside a
          gesture, so a silent verdict is not always the truth. This is the way
          to ask on purpose — and the way the device matrix gets filled. */}
      <button
        type="button"
        onClick={onDiagnostics}
        data-testid="diagnostics-open"
        className="mt-3 min-h-12 w-full rounded-2xl border-2 border-stone-300 px-4 font-semibold text-teal-800 motion-safe:transition-colors hover:border-teal-700 dark:border-slate-700 dark:text-teal-300"
      >
        {copy.diagnostics.open}
      </button>

      {/* SPEC §5.2: EDRDG's licence requires this acknowledgement to be
          reachable from the app, not only from the repository. */}
      <button
        type="button"
        onClick={onHabit}
        data-testid="habit-open"
        className="mt-8 min-h-12 w-full text-left text-sm text-stone-500 underline underline-offset-4 dark:text-slate-500"
      >
        {copy.habit.open}
      </button>

      <button
        type="button"
        onClick={onSync}
        data-testid="sync-open"
        className="mt-2 min-h-12 w-full text-left text-sm text-stone-500 underline underline-offset-4 dark:text-slate-500"
      >
        {copy.sync.open}
      </button>

      <button
        type="button"
        onClick={onAttribution}
        data-testid="attribution-open"
        className="mt-2 min-h-12 w-full text-left text-sm text-stone-500 underline underline-offset-4 dark:text-slate-500"
      >
        {copy.attribution.open}
      </button>
    </Screen>
  );
};
