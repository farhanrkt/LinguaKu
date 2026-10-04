import { useEffect, useState } from 'react';
import { copy } from '../../i18n/id.ts';
import { Button } from '../../ui/Button.tsx';
import { Screen } from '../../ui/Screen.tsx';
import { sessionProgress, type TodaySnapshot } from '../../data/repositories/sessions.ts';
import {
  buildLearningPath,
  slippingSoon,
  type SlippingWord,
} from '../../data/repositories/progress.ts';
import type { LearningPath } from '../../core/path.ts';
import type { Profile, Session } from '../../data/types.ts';


interface HomeProps {
  profile: Profile;
  /** An unfinished session, if the learner was interrupted (SPEC §2.13). */
  resumable: Session | null;
  busy: boolean;
  /** False while the learner has not yet taken (or declined) placement. */
  placementOffered: boolean;
  /** Today's reviews and remaining new words, or null while it loads. */
  today: TodaySnapshot | null;
  /** Fired once the home screen is up; releases the speech probe (risk R1). */
  onReady: () => void;
  onPlacement: () => void;
  onProgress: () => void;
  onRead: () => void;
  onSettings: () => void;
  onPractise: () => void;
  /**
   * SPEC §2.13: the learner's own cue word when it has passed and today holds
   * no practice, otherwise null. Their words, not ours — that is the mechanism.
   */
  cueDue: string | null;
  onDismissCue: () => void;
}

export const Home = ({
  profile,
  resumable,
  busy,
  placementOffered,
  today,
  onReady,
  onPlacement,
  onProgress,
  onRead,
  onSettings,
  onPractise,
  cueDue,
  onDismissCue,
}: HomeProps) => {
  // Sessions, content, drills and the ability estimate all follow `targets[0]`,
  // so this control switches *which language you are learning now* rather than
  // ticking a set. Tapping the one already active is a no-op; the other language
  // keeps its cards, its ability and its own unfinished session.
  const activeTarget = profile.targets[0] ?? 'en';
  // The dashboard's figures, loaded **after** the first paint.
  //
  // Invariant 12 caps icon-tap to first answerable question at 3s, and the
  // practise button is in the footer from the first frame — so these are two
  // targeted reads (the path and the slipping list), never the whole §9 report,
  // and nothing waits on them.
  const [path, setPath] = useState<LearningPath | null>(null);
  const [slipping, setSlipping] = useState<SlippingWord[] | null>(null);

  useEffect(() => {
    let live = true;
    const now = Date.now();
    void buildLearningPath(profile, now).then((result) => {
      if (live) setPath(result);
    });
    void slippingSoon(profile.id, now, 3).then((result) => {
      if (live) setSlipping(result);
    });
    return () => {
      live = false;
    };
  }, [profile]);

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

      {/*
        Today's load, stated before the learner commits to it — the one thing an
        SRS home screen owes its user, and the thing this one has never said.
        Null while it loads: a flashed zero would read as "nothing to do"
        (invariant 18 — an unmeasured figure is never drawn as a zero).
      */}
      {today === null ? null : today.due === 0 && today.daily.remaining === 0 ? (
        <p className="mt-4 text-stone-600 dark:text-slate-400" data-testid="today-clear">
          {today.daily.cap === 0 ? copy.home.today.clearPaused : copy.home.today.clear}
        </p>
      ) : (
        <p className="mt-4 text-lg text-stone-600 dark:text-slate-400" data-testid="today-load">
          <span className="font-bold text-stone-900 tabular-nums dark:text-slate-100">
            {today.due}
          </span>{' '}
          {copy.home.today.dueLabel}
          <span aria-hidden className="mx-2 text-stone-400 dark:text-slate-600">
            ·
          </span>
          <span className="font-bold text-stone-900 tabular-nums dark:text-slate-100">
            {today.daily.remaining}
          </span>{' '}
          {copy.home.today.newLabel}
        </p>
      )}
      {today !== null && today.daily.reached && today.due > 0 ? (
        <p className="mt-1 text-sm text-stone-500 dark:text-slate-400" data-testid="today-cap">
          {copy.home.today.capReached}
        </p>
      ) : null}

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

      {/* SPEC §2.14: capability, never a score. What the learner has secured and
          what is closest to slipping — both measured, both with an honest empty
          state rather than a zero (invariant 18). */}
      <h2 className="mt-8 text-lg font-bold">{copy.home.dashboard.reachHeading}</h2>
      {path === null ? (
        <p className="mt-2 text-stone-600 dark:text-slate-400">{copy.progress.notYet}</p>
      ) : path.securedTotal === 0 ? (
        <p className="mt-2 text-stone-600 dark:text-slate-400" data-testid="reach-empty">
          {copy.home.dashboard.reachEmpty}
        </p>
      ) : (
        <>
          {/* One figure, not two. `securedTotal` sums every stage while
              `current` is the stage in progress, so a learner whose three words
              happen to sit in band 2 read "3 kata sudah kamu kunci" directly
              above "Tahap 1: 0 dari 481" — both true, and together nonsense.
              The full path lives on the progress screen, which has room to
              explain it. */}
          <p className="mt-2 text-lg text-stone-700 dark:text-slate-300" data-testid="reach">
            {copy.home.dashboard.reach(Math.round(path.reach * 100), path.securedTotal)}
          </p>
        </>
      )}

      <h2 className="mt-8 text-lg font-bold">{copy.home.dashboard.slippingHeading}</h2>
      {slipping === null ? (
        <p className="mt-2 text-stone-600 dark:text-slate-400">{copy.progress.notYet}</p>
      ) : slipping.length === 0 ? (
        <p className="mt-2 text-stone-600 dark:text-slate-400" data-testid="slipping-empty">
          {copy.home.dashboard.slippingEmpty}
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-stone-500 dark:text-slate-400">
            {copy.home.dashboard.slippingHint}
          </p>
          <ul className="mt-2 flex flex-wrap gap-2" data-testid="slipping">
            {slipping.map((word) => (
              <li
                key={word.itemId}
                className="rounded-lg bg-stone-100 px-3 py-1 font-semibold text-stone-800 dark:bg-slate-900 dark:text-slate-200"
              >
                {word.headword}
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Everything that is not practice lives one tap deeper (SPEC §10): the
          home screen's job is to get a learner into a session, and it had grown
          seven links between them and the button that does it. */}
      <button
        type="button"
        onClick={onSettings}
        data-testid="settings-open"
        className="mt-6 min-h-12 w-full rounded-2xl border-2 border-stone-300 px-4 font-semibold text-teal-800 motion-safe:transition-colors hover:border-teal-700 dark:border-slate-700 dark:text-teal-300"
      >
        {copy.settings.open}
      </button>


    </Screen>
  );
};
