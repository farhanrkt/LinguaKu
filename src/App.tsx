import { useCallback, useEffect, useState } from 'react';
import { FirstRun } from './features/onboarding/FirstRun.tsx';
import { Home } from './features/home/Home.tsx';
import { SessionScreen } from './features/session/SessionScreen.tsx';
import { PlacementScreen } from './features/placement/PlacementScreen.tsx';
import { ProgressScreen } from './features/progress/ProgressScreen.tsx';
import { AttributionScreen } from './features/settings/AttributionScreen.tsx';
import { ReaderScreen } from './features/reader/ReaderScreen.tsx';
import { hasBeenPlaced } from './data/repositories/abilities.ts';
import { createProfile, getCurrentProfile, updateProfile } from './data/repositories/profiles.ts';
import { findResumable, startSession } from './data/repositories/sessions.ts';
import { ensureBands, STARTER_BANDS } from './data/content.ts';
import { loadContrastive } from './data/contrastive.ts';
import {
  getStorageDurability,
  requestPersistentStorage,
  type StorageDurability,
} from './platform/persistence.ts';
import { isTtsLive, probeOnBoot, type VoiceReport } from './platform/speech.ts';
import { registerServiceWorker, type OfflineStatus } from './platform/serviceWorker.ts';
import type { DailyMinutes, Profile, Session, TargetLang } from './data/types.ts';

type Screen =
  | { name: 'loading' }
  | { name: 'first-run' }
  | { name: 'home'; profile: Profile }
  | { name: 'placement'; profile: Profile }
  | { name: 'progress'; profile: Profile }
  | { name: 'attribution'; profile: Profile }
  | { name: 'reader'; profile: Profile }
  | { name: 'session'; profile: Profile; session: Session };

export const App = () => {
  const [screen, setScreen] = useState<Screen>({ name: 'loading' });
  const [offline, setOffline] = useState<OfflineStatus>('preparing');
  const [durability, setDurability] = useState<StorageDurability>('best-effort');
  const [voice, setVoice] = useState<VoiceReport | null>(null);
  const [resumable, setResumable] = useState<Session | null>(null);
  const [placementOffered, setPlacementOffered] = useState(true);
  const [busy, setBusy] = useState(false);

  /**
   * SPEC §2.6 / risk R1: probe the speech engine once per app start, and let
   * that verdict govern the session.
   *
   * It fires when a screen is actually up — never during boot. The first touch
   * of `speechSynthesis` on a device with no speech service **blocks the main
   * thread for ~15 seconds** (measured; see src/platform/speech.ts), which would
   * put the app's whole ≤3s icon-tap budget behind a freeze. `probeOnBoot` is
   * idempotent, so calling this from every screen costs one probe.
   */
  const probeAudio = useCallback((lang: TargetLang) => {
    void probeOnBoot(lang).then(setVoice);
  }, []);

  /** Starts or resumes a session. The only path into the practice loop. */
  const beginSession = useCallback(async (profile: Profile) => {
    const lang = profile.targets[0] ?? 'en';
    await ensureBands(lang, STARTER_BANDS).catch(() => undefined);
    // The boot probe's verdict stands for the whole session (risk R1), so the
    // composer knows here whether minimal-pair drills can be scheduled at all.
    const session =
      (await findResumable(profile.id)) ??
      (await startSession(profile, Date.now(), { audioAvailable: isTtsLive() }));
    setResumable(null);
    setScreen({ name: 'session', profile, session });
  }, []);

  useEffect(() => {
    registerServiceWorker(setOffline);
    void (async () => {
      const [profile, storage] = await Promise.all([getCurrentProfile(), getStorageDurability()]);
      setDurability(storage);
      // Warm the contrastive pack off the critical path, so it is in memory by
      // the time the composer looks for it (SPEC §5.4).
      void loadContrastive(profile?.targets[0] ?? 'en');
      if (!profile) {
        setScreen({ name: 'first-run' });
        return;
      }
      // SPEC §10: the "Latihan 4 menit" launcher shortcut jumps straight into a
      // session — that path is what the ≤3s icon-tap budget (§5.4) measures.
      if (new URLSearchParams(window.location.search).has('latihan')) {
        await beginSession(profile);
        return;
      }
      setResumable(await findResumable(profile.id));
      setPlacementOffered(await hasBeenPlaced(profile.id, profile.targets[0] ?? 'en'));
      setScreen({ name: 'home', profile });
    })();
  }, [beginSession]);

  // Content is fetched once and cached by the service worker. Kicked off as
  // soon as there is a profile so the first session does not wait on it.
  useEffect(() => {
    if (screen.name !== 'home') return;
    const lang = screen.profile.targets[0];
    if (!lang) return;
    void ensureBands(lang, STARTER_BANDS).catch(() => {
      // Offline on first run: the session screen reports having no material
      // rather than the app failing to load.
    });
  }, [screen]);

  const handleStart = useCallback(async (targets: TargetLang[], dailyMinutes: DailyMinutes) => {
    const profile = await createProfile({ targets, dailyMinutes, now: Date.now() });
    // SPEC §10: placement is offered, not enforced — and only after the learner
    // has already chosen something, so it is never an onboarding wall.
    await ensureBands(profile.targets[0] ?? 'en', STARTER_BANDS).catch(() => undefined);
    setScreen({ name: 'placement', profile });
    // Ask only once the learner has committed to something — a permission
    // prompt on a cold first paint is the fastest way to lose them.
    setDurability(await requestPersistentStorage());
  }, []);

  const handleChange = useCallback(
    async (changes: Partial<Pick<Profile, 'targets' | 'dailyMinutes'>>) => {
      setScreen((current) =>
        current.name === 'home'
          ? { name: 'home', profile: { ...current.profile, ...changes } }
          : current,
      );
      const profile = await getCurrentProfile();
      if (profile) await updateProfile(profile.id, changes);
    },
    [],
  );

  const handlePractise = useCallback(async () => {
    if (screen.name !== 'home' || busy) return;
    setBusy(true);
    try {
      await beginSession(screen.profile);
    } finally {
      setBusy(false);
    }
  }, [screen, busy, beginSession]);

  const handleFinish = useCallback(async () => {
    const profile = await getCurrentProfile();
    if (!profile) return;
    setResumable(await findResumable(profile.id));
    setScreen({ name: 'home', profile });
  }, []);

  switch (screen.name) {
    case 'loading':
      return null;
    case 'first-run':
      return <FirstRun onStart={(targets, minutes) => void handleStart(targets, minutes)} />;
    case 'placement':
      return (
        <PlacementScreen
          profile={screen.profile}
          onDone={() => {
            // Re-read rather than assume: skipping leaves the offer standing,
            // taking it does not (SPEC §4.2 — offered, never enforced).
            const { profile } = screen;
            void hasBeenPlaced(profile.id, profile.targets[0] ?? 'en').then(setPlacementOffered);
            setScreen({ name: 'home', profile });
          }}
        />
      );
    case 'session':
      return (
        <SessionScreen
          profile={screen.profile}
          session={screen.session}
          onFirstQuestion={() => probeAudio(screen.profile.targets[0] ?? 'en')}
          onFinish={() => void handleFinish()}
        />
      );
    case 'reader':
      return (
        <ReaderScreen
          profile={screen.profile}
          onBack={() => setScreen({ name: 'home', profile: screen.profile })}
        />
      );
    case 'attribution':
      return (
        <AttributionScreen
          onBack={() => setScreen({ name: 'home', profile: screen.profile })}
        />
      );
    case 'progress':
      return (
        <ProgressScreen
          profile={screen.profile}
          onBack={() => setScreen({ name: 'home', profile: screen.profile })}
        />
      );
    case 'home':
      return (
        <Home
          profile={screen.profile}
          offline={offline}
          durability={durability}
          voice={voice}
          resumable={resumable}
          busy={busy}
          placementOffered={placementOffered}
          onReady={() => probeAudio(screen.profile.targets[0] ?? 'en')}
          onPlacement={() => setScreen({ name: 'placement', profile: screen.profile })}
          onProgress={() => setScreen({ name: 'progress', profile: screen.profile })}
          onAttribution={() => setScreen({ name: 'attribution', profile: screen.profile })}
          onRead={() => setScreen({ name: 'reader', profile: screen.profile })}
          onPractise={() => void handlePractise()}
          onChange={(changes) => void handleChange(changes)}
        />
      );
  }
};
