import { useEffect, useState } from 'react';
import { copy } from '../../i18n/id.ts';
import { Button } from '../../ui/Button.tsx';
import { OptionCard } from '../../ui/OptionCard.tsx';
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
  onChange: (changes: Partial<Pick<Profile, 'topics'>>) => void;
  onHabit: () => void;
  onSync: () => void;
  onDiagnostics: () => void;
  onAttribution: () => void;
  onBack: () => void;
}

const link =
  'mt-2 min-h-14 w-full rounded-2xl border-2 border-stone-300 px-4 text-left font-semibold text-teal-800 motion-safe:transition-colors hover:border-teal-700 dark:border-slate-700 dark:text-teal-300';

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
        <p className="mt-4 text-sm text-stone-500 dark:text-slate-500">{copy.settings.loading}</p>
      ) : topics.length === 0 ? (
        <p className="mt-4 text-sm text-stone-500 dark:text-slate-500">{copy.settings.noTopics}</p>
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
          <p className="mt-3 text-sm text-stone-500 dark:text-slate-500">
            {chosen.size === 0 ? copy.settings.topicsNone : copy.settings.topicsNote}
          </p>
        </>
      )}

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
