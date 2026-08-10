import { useCallback, useEffect, useState } from 'react';
import { FirstRun } from './features/onboarding/FirstRun';
import { Home } from './features/home/Home';
import { createProfile, getCurrentProfile, updateProfile } from './data/repositories/profiles';
import {
  getStorageDurability,
  requestPersistentStorage,
  type StorageDurability,
} from './platform/persistence';
import { registerServiceWorker, type OfflineStatus } from './platform/serviceWorker';
import type { DailyMinutes, Profile, TargetLang } from './data/types';

type ProfileState = { status: 'loading' } | { status: 'ready'; profile: Profile | null };

export const App = () => {
  const [state, setState] = useState<ProfileState>({ status: 'loading' });
  const [offline, setOffline] = useState<OfflineStatus>('preparing');
  const [durability, setDurability] = useState<StorageDurability>('best-effort');

  useEffect(() => {
    registerServiceWorker(setOffline);
    void (async () => {
      const [profile, storage] = await Promise.all([getCurrentProfile(), getStorageDurability()]);
      setDurability(storage);
      setState({ status: 'ready', profile });
    })();
  }, []);

  const handleStart = useCallback(async (targets: TargetLang[], dailyMinutes: DailyMinutes) => {
    const profile = await createProfile({ targets, dailyMinutes, now: Date.now() });
    setState({ status: 'ready', profile });
    // Ask only once the learner has committed to something — a permission
    // prompt on a cold first paint is the fastest way to lose them.
    setDurability(await requestPersistentStorage());
  }, []);

  const handleChange = useCallback(
    async (changes: Partial<Pick<Profile, 'targets' | 'dailyMinutes'>>) => {
      setState((current) => {
        if (current.status !== 'ready' || !current.profile) return current;
        return { status: 'ready', profile: { ...current.profile, ...changes } };
      });
      const profile = await getCurrentProfile();
      if (profile) await updateProfile(profile.id, changes);
    },
    [],
  );

  if (state.status === 'loading') return null;

  return state.profile ? (
    <Home
      profile={state.profile}
      offline={offline}
      durability={durability}
      onChange={(changes) => void handleChange(changes)}
    />
  ) : (
    <FirstRun onStart={(targets, minutes) => void handleStart(targets, minutes)} />
  );
};
