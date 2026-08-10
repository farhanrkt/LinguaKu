import { copy } from '../../i18n/id.ts';
import { OptionCard } from '../../ui/OptionCard.tsx';
import { Screen } from '../../ui/Screen.tsx';
import type { DailyMinutes, Profile, TargetLang } from '../../data/types.ts';
import type { OfflineStatus } from '../../platform/serviceWorker.ts';
import type { StorageDurability } from '../../platform/persistence.ts';

const TARGETS: TargetLang[] = ['en', 'ja'];
const MINUTES: DailyMinutes[] = [4, 8, 15];

interface HomeProps {
  profile: Profile;
  offline: OfflineStatus;
  durability: StorageDurability;
  onChange: (changes: Partial<Pick<Profile, 'targets' | 'dailyMinutes'>>) => void;
}

const offlineLabel: Record<OfflineStatus, string> = {
  ready: copy.home.offlineReady,
  preparing: copy.home.offlinePreparing,
  unavailable: copy.home.offlineUnavailable,
};

export const Home = ({ profile, offline, durability, onChange }: HomeProps) => {
  const toggleTarget = (lang: TargetLang) => {
    const next = profile.targets.includes(lang)
      ? profile.targets.filter((l) => l !== lang)
      : [...profile.targets, lang];
    // Autonomy has a floor: a profile with no target language has nothing to do.
    if (next.length > 0) onChange({ targets: next });
  };

  return (
    <Screen>
      <h1 className="text-2xl font-bold">{copy.home.greeting}</h1>
      <p className="mt-1 text-stone-600 dark:text-slate-400">
        {copy.home.learningLabel}{' '}
        <strong className="font-semibold text-stone-900 dark:text-slate-100">
          {profile.targets.map((lang) => copy.langNames[lang]).join(' dan ')}
        </strong>
        .
      </p>

      <h2 className="mt-8 text-lg font-bold">{copy.home.changeTargets}</h2>
      <div className="mt-3 flex flex-col gap-3">
        {TARGETS.map((lang) => (
          <OptionCard
            key={lang}
            label={copy.firstRun.targets[lang].label}
            selected={profile.targets.includes(lang)}
            onToggle={() => toggleTarget(lang)}
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
      </ul>

      <p className="mt-8 rounded-2xl bg-stone-100 p-4 text-sm text-stone-600 dark:bg-slate-900 dark:text-slate-400">
        {copy.home.roadmap}
      </p>
    </Screen>
  );
};
