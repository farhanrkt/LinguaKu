import { useState } from 'react';
import { copy } from '../../i18n/id.ts';
import { Button } from '../../ui/Button.tsx';
import { OptionCard } from '../../ui/OptionCard.tsx';
import { Screen } from '../../ui/Screen.tsx';
import type { DailyMinutes, TargetLang } from '../../data/types.ts';

const TARGETS: TargetLang[] = ['en', 'ja'];
const MINUTES: DailyMinutes[] = [4, 8, 15];

interface FirstRunProps {
  onStart: (targets: TargetLang[], dailyMinutes: DailyMinutes) => void;
}

/**
 * SPEC §10: no signup, no onboarding wall — one screen, two taps, done.
 * SPEC §2.14 (autonomy): the learner chooses the daily load; nothing here is
 * imposed and everything is editable later.
 */
export const FirstRun = ({ onStart }: FirstRunProps) => {
  const [targets, setTargets] = useState<TargetLang[]>([]);
  // SPEC §2.13: microlearning — 4 minutes is the default, not the minimum.
  const [minutes, setMinutes] = useState<DailyMinutes>(4);

  const toggleTarget = (lang: TargetLang) =>
    setTargets((current) =>
      current.includes(lang) ? current.filter((l) => l !== lang) : [...current, lang],
    );

  return (
    <Screen
      footer={
        <>
          {targets.length === 0 ? (
            <p className="mb-2 text-center text-sm text-stone-600 dark:text-slate-400">
              {copy.firstRun.needTarget}
            </p>
          ) : null}
          <Button disabled={targets.length === 0} onClick={() => onStart(targets, minutes)}>
            {copy.firstRun.start}
          </Button>
        </>
      }
    >
      <h1 className="text-2xl font-bold">{copy.firstRun.heading}</h1>
      <p className="mt-1 text-stone-600 dark:text-slate-400">{copy.firstRun.subheading}</p>

      <div className="mt-5 flex flex-col gap-3">
        {TARGETS.map((lang) => (
          <OptionCard
            key={lang}
            label={copy.firstRun.targets[lang].label}
            hint={copy.firstRun.targets[lang].hint}
            selected={targets.includes(lang)}
            onToggle={() => toggleTarget(lang)}
          />
        ))}
      </div>

      <h2 className="mt-8 text-lg font-bold">{copy.firstRun.minutesHeading}</h2>
      <p className="mt-1 text-sm text-stone-600 dark:text-slate-400">{copy.firstRun.minutesHint}</p>

      <div className="mt-4 flex flex-col gap-3">
        {MINUTES.map((value) => (
          <OptionCard
            key={value}
            label={copy.firstRun.minutes[value].label}
            hint={copy.firstRun.minutes[value].hint}
            selected={minutes === value}
            onToggle={() => setMinutes(value)}
          />
        ))}
      </div>
    </Screen>
  );
};
