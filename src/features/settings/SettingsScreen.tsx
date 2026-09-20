import { useEffect, useRef, useState } from 'react';
import { copy } from '../../i18n/id.ts';
import { Button } from '../../ui/Button.tsx';
import { OptionCard } from '../../ui/OptionCard.tsx';
import { defaultDailyNewWords } from '../../core/forecast.ts';
import { Screen } from '../../ui/Screen.tsx';
import { loadTopics, type Topic } from '../../data/topics.ts';
import type { Profile, TargetLang } from '../../data/types.ts';

/**
 * One place for everything that is not practice.
 *
 * The home screen had grown to seven stacked links — reader, progress, habit,
 * sync, diagnostics, attribution, and the settings that were already there —
 * which pushed the one button that matters, *Latihan 4 menit*, further from the
 * thumb every time something shipped (SPEC §10). The rule applied here: the
 * home screen holds practice and the two things a learner opens *between*
 * sessions; everything else lives one tap deeper.
 *
 * It also hosts the topic picker, which is SPEC §2.14's *"learner picks topic
 * clusters"* — a promise the app has made in the spec since M0 and offered no
 * control for until now.
 */

interface SettingsScreenProps {
  profile: Profile;
  onChange: (changes: Partial<Pick<Profile, 'topics' | 'dailyNewWords' | 'dataSaver'>>) => void;
  onHabit: () => void;
  onSync: () => void;
  onDiagnostics: () => void;
  onAttribution: () => void;
  onBack: () => void;
}

const link =
  'mt-2 min-h-14 w-full rounded-2xl border-2 border-stone-300 px-4 text-left font-semibold text-teal-800 motion-safe:transition-colors hover:border-teal-700 dark:border-slate-700 dark:text-teal-300';

/** §10's 56px tap target, as a square. */
const stepper =
  'grid size-14 shrink-0 place-items-center rounded-2xl border-2 border-stone-300 text-2xl font-semibold text-teal-800 ' +
  'motion-safe:transition-colors hover:border-teal-700 disabled:opacity-40 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ' +
  'dark:border-slate-700 dark:text-teal-300 dark:focus-visible:outline-teal-300';

/**
 * A ceiling on the stepper, not on the learner's ambition — the debt throttle
 * (SPEC §7.2) still governs what actually gets introduced, so a high number
 * here is a request rather than a guarantee.
 */
const PACE_MAX = 40;

/** Ordered least-intrusive first, which is also the default's position. */
const DATA_CHOICES = ['auto', 'save', 'full'] as const;

export const SettingsScreen = ({
  profile,
  onChange,
  onHabit,
  onSync,
  onDiagnostics,
  onAttribution,
  onBack,
}: SettingsScreenProps) => {
  const lang: TargetLang = profile.targets[0] ?? 'en';
  const [topics, setTopics] = useState<readonly Topic[] | null>(null);
  const chosen = new Set(profile.topics ?? []);

  // Absent means "whatever suits my session length", so the control shows that
  // number rather than an empty box the learner has to guess at.
  const paceDefault = defaultDailyNewWords(profile.dailyMinutes);

  /**
   * Held in a ref *and* mirrored into state: the ref is what the next tap adds
   * to, because it updates synchronously, and the state is what renders.
   *
   * Reading the number straight off `profile` meant every tap had to wait for a
   * write and a re-render before the next one could be counted from the right
   * base — five taps on "−" landed as four. Moving it into a state updater
   * traded that for a worse bug: `onChange` is a side effect, and React is free
   * to run an updater more than once or not when you expect. A learner jabbing
   * a stepper on a slow phone is the ordinary case, not an edge one.
   */
  const chosenPace = profile.dailyNewWords ?? paceDefault;
  const pending = useRef(chosenPace);
  const [pace, setLocalPace] = useState(chosenPace);

  const applyPace = (next: number) => {
    pending.current = Math.max(0, Math.min(PACE_MAX, next));
    setLocalPace(pending.current);
    onChange({ dailyNewWords: pending.current });
  };

  useEffect(() => {
    void loadTopics(lang).then((pack) => setTopics(pack.topics));
  }, [lang]);

  const toggle = (id: string) => {
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange({ topics: [...next] });
  };

  return (
    <Screen footer={<Button onClick={onBack}>{copy.settings.done}</Button>}>
      <h1 className="text-2xl font-bold">{copy.settings.heading}</h1>

      <h2 className="mt-8 text-lg font-bold">{copy.settings.topicsHeading}</h2>
      <p className="mt-1 text-sm text-stone-600 dark:text-slate-400">{copy.settings.topicsIntro}</p>

      {topics === null ? (
        <p className="mt-4 text-sm text-stone-500 dark:text-slate-400">{copy.settings.loading}</p>
      ) : topics.length === 0 ? (
        <p className="mt-4 text-sm text-stone-500 dark:text-slate-400">{copy.settings.noTopics}</p>
      ) : (
        <>
          <div className="mt-4 flex flex-col gap-3" data-testid="topic-list">
            {topics.map((topic) => (
              <OptionCard
                key={topic.id}
                label={topic.label}
                hint={topic.hint ?? ''}
                selected={chosen.has(topic.id)}
                onToggle={() => toggle(topic.id)}
              />
            ))}
          </div>
          {/* §2.14 again: the learner should know that choosing costs them
              nothing, or the control reads as a commitment. */}
          <p className="mt-3 text-sm text-stone-500 dark:text-slate-400">
            {chosen.size === 0 ? copy.settings.topicsNone : copy.settings.topicsNote}
          </p>
        </>
      )}

      {/*
        SPEC §7.2's pace control. A stepper rather than the option cards above,
        because this is one number on a continuum and not a set of named
        choices — and the honest default is derived from the learner's own
        session length, so it is offered back rather than hidden.
      */}
      <h2 className="mt-10 text-lg font-bold">{copy.settings.pace.heading}</h2>
      <p className="mt-1 text-sm text-stone-600 dark:text-slate-400">{copy.settings.pace.intro}</p>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => applyPace(pending.current - 1)}
          disabled={pace <= 0}
          aria-label={copy.settings.pace.fewer}
          data-testid="pace-fewer"
          className={stepper}
        >
          −
        </button>
        <p
          className="flex-1 text-center text-lg font-semibold tabular-nums"
          aria-live="polite"
          data-testid="pace-value"
        >
          {pace}
        </p>
        <button
          type="button"
          onClick={() => applyPace(pending.current + 1)}
          disabled={pace >= PACE_MAX}
          aria-label={copy.settings.pace.more}
          data-testid="pace-more"
          className={stepper}
        >
          +
        </button>
      </div>
      <p className="mt-2 text-sm text-stone-600 dark:text-slate-400" data-testid="pace-note">
        {pace === 0 ? copy.settings.pace.none : copy.settings.pace.unit(pace)}
      </p>
      {pace === paceDefault ? null : (
        <button
          type="button"
          onClick={() => applyPace(paceDefault)}
          data-testid="pace-reset"
          className="mt-2 min-h-12 text-sm text-teal-800 underline underline-offset-4 dark:text-teal-300"
        >
          {copy.settings.pace.reset} — {copy.settings.pace.defaultNote(paceDefault)}
        </button>
      )}

      {/* SPEC §5.4: the reference learner is on mobile data, so what the app
          downloads is their decision to make rather than ours to assume. */}
      <h2 className="mt-10 text-lg font-bold">{copy.settings.data.heading}</h2>
      <p className="mt-1 text-sm text-stone-600 dark:text-slate-400">{copy.settings.data.intro}</p>

      <div className="mt-4 flex flex-col gap-3" data-testid="data-saver">
        {DATA_CHOICES.map((choice) => (
          <OptionCard
            key={choice}
            label={copy.settings.data[choice]}
            hint={copy.settings.data[`${choice}Hint`]}
            selected={(profile.dataSaver ?? 'auto') === choice}
            onToggle={() => onChange({ dataSaver: choice })}
          />
        ))}
      </div>

      <h2 className="mt-10 text-lg font-bold">{copy.settings.moreHeading}</h2>

      <button type="button" onClick={onHabit} data-testid="habit-open" className={link}>
        {copy.habit.open}
      </button>
      <button type="button" onClick={onDiagnostics} data-testid="diagnostics-open" className={link}>
        {copy.diagnostics.open}
      </button>
      <button type="button" onClick={onSync} data-testid="sync-open" className={link}>
        {copy.sync.open}
      </button>
      <button type="button" onClick={onAttribution} data-testid="attribution-open" className={link}>
        {copy.attribution.open}
      </button>
    </Screen>
  );
};
