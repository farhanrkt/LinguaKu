import { useCallback, useEffect, useRef, useState } from 'react';
import { FirstRun } from './features/onboarding/FirstRun.tsx';
import { Home } from './features/home/Home.tsx';
import { SessionScreen } from './features/session/SessionScreen.tsx';
import { PlacementScreen } from './features/placement/PlacementScreen.tsx';
import { ProgressScreen } from './features/progress/ProgressScreen.tsx';
import { GlossaryScreen } from './features/progress/GlossaryScreen.tsx';
import { AttributionScreen } from './features/settings/AttributionScreen.tsx';
import { ReaderScreen } from './features/reader/ReaderScreen.tsx';
import { SyncScreen } from './features/settings/SyncScreen.tsx';
import { DiagnosticsScreen } from './features/settings/DiagnosticsScreen.tsx';
import { SettingsScreen } from './features/settings/SettingsScreen.tsx';
import { HabitScreen } from './features/habit/HabitScreen.tsx';
import { copy } from './i18n/id.ts';
import { hasBeenPlaced, refreshListeningAbility } from './data/repositories/abilities.ts';
import { createProfile, getCurrentProfile, updateProfile } from './data/repositories/profiles.ts';
import {
  findResumable,
  startSession,
  todaySnapshot,
  type TodaySnapshot,
} from './data/repositories/sessions.ts';
import { getHabit, lastPractisedAt } from './data/repositories/habits.ts';
import { cueIsDue, scheduleReminder } from './platform/notifications.ts';
import { ensureBands, STARTER_BANDS } from './data/content.ts';
import { loadContrastive } from './data/contrastive.ts';
import { loadTopics } from './data/topics.ts';
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
  | { name: 'sync'; profile: Profile }
  | { name: 'diagnostics'; profile: Profile }
  | { name: 'settings'; profile: Profile }
  | { name: 'glossary'; profile: Profile }
  | { name: 'habit'; profile: Profile }
  | { name: 'session'; profile: Profile; session: Session };

export const App = () => {
  const [screen, setScreen] = useState<Screen>({ name: 'loading' });
  const [offline, setOffline] = useState<OfflineStatus>('preparing');
  const [durability, setDurability] = useState<StorageDurability>('best-effort');
  const [voice, setVoice] = useState<VoiceReport | null>(null);
  const [resumable, setResumable] = useState<Session | null>(null);
  const [placementOffered, setPlacementOffered] = useState(true);
  /** Today's load for the home screen — null until it has actually been read. */
  const [today, setToday] = useState<TodaySnapshot | null>(null);
  /** SPEC §2.13: the in-app cue, for every device that cannot schedule one. */
  const [cueDue, setCueDue] = useState<string | null>(null);
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

  /**
   * SPEC §2.13, both halves of the reminder.
   *
   * Rescheduling on open is what makes a local `TimestampTrigger` behave like a
   * daily cue: the API has no repeat, so each open books the next one. A learner
   * who stops opening the app stops being reminded, which is the right failure —
   * a reminder that outlives their interest is spam, not a habit.
   *
   * The in-app cue is the fallback for every browser without that API, and it is
   * suppressed for anyone who has already practised today (§2.14: no guilt).
   */
  const refreshHabitCue = useCallback(async (profile: Profile) => {
    const habit = await getHabit(profile.id);
    if (!habit || habit.enabled === 0) {
      setCueDue(null);
      return;
    }
    const practised = await lastPractisedAt(profile.id);
    const due = cueIsDue({
      time: habit.notificationTime,
      now: Date.now(),
      lastPractisedAt: practised,
    });
    setCueDue(due ? habit.cue : null);
    void scheduleReminder({
      time: habit.notificationTime,
      title: copy.session.start(profile.dailyMinutes),
      body: copy.habit.summary(habit.cue, habit.place, habit.notificationTime),
    });
  }, []);

  /** Starts or resumes a session. The only path into the practice loop. */
  const beginSession = useCallback(async (profile: Profile) => {
    const lang = profile.targets[0] ?? 'en';
    await ensureBands(lang, STARTER_BANDS).catch(() => undefined);
    // The boot probe's verdict stands for the whole session (risk R1), so the
    // composer knows here whether minimal-pair drills can be scheduled at all.
    const session =
      (await findResumable(profile.id, lang)) ??
      (await startSession(profile, Date.now(), { audioAvailable: isTtsLive(lang) }));
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
      // The composer reads the topic map from memory and must never wait on a
      // fetch inside the ≤3s budget (§5.4), so it is warmed here like the pack.
      void loadTopics(profile?.targets[0] ?? 'en');
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
      setResumable(await findResumable(profile.id, profile.targets[0] ?? 'en'));
      setPlacementOffered(await hasBeenPlaced(profile.id, profile.targets[0] ?? 'en'));
      setScreen({ name: 'home', profile });
      void refreshHabitCue(profile);
    })();
  }, [beginSession, refreshHabitCue]);

  // Content is fetched once and cached by the service worker. Kicked off as
  // soon as there is a profile so the first session does not wait on it.
  useEffect(() => {
    if (screen.name !== 'home') return;
    // Today's load, re-read every time the home screen comes up rather than
    // decremented as the learner works: the session just changed both figures,
    // and guessing by how much is how a counter drifts away from the deck.
    void todaySnapshot(screen.profile, Date.now()).then(setToday);
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

  /**
   * Profile writes, in the order they were asked for.
   *
   * Each change used to start its own `getCurrentProfile` → `updateProfile`
   * chain, so two changes in flight raced and the DB kept whichever *finished*
   * last rather than whichever the learner asked for last. Stepping a control
   * five times quickly persisted the fourth value. Every setting on this screen
   * shares the one profile row, so they all share this queue.
   */
  const profileWrites = useRef<Promise<unknown>>(Promise.resolve());

  const queueProfileWrite = useCallback(<T,>(work: () => Promise<T>): Promise<T> => {
    const next = profileWrites.current.then(work, work);
    profileWrites.current = next.catch(() => undefined);
    return next;
  }, []);

  const handleChange = useCallback(
    async (
      changes: Partial<
        Pick<Profile, 'targets' | 'dailyMinutes' | 'scriptMode' | 'topics' | 'dailyNewWords'>
      >,
    ) => {
      setScreen((current) =>
        current.name === 'home' || current.name === 'settings'
          ? { ...current, profile: { ...current.profile, ...changes } }
          : current,
      );
      // The read is not queued — the profile id never changes, so concurrent
      // reads are safe and serializing them only put a round trip in front of
      // every write. Only the writes need an order.
      const profile = await getCurrentProfile();
      if (!profile) return;
      await queueProfileWrite(() => updateProfile(profile.id, changes));

      // Switching the language switches everything that hangs off it. Left
      // stale, the home screen offers to resume the *other* language's session
      // and hides the placement check because a different language was placed —
      // so a learner starting Japanese never gets offered one.
      const lang = changes.targets?.[0];
      if (!lang) return;
      void loadContrastive(lang);
      void loadTopics(lang);
      void ensureBands(lang, STARTER_BANDS).catch(() => undefined);
      const [resume, placed] = await Promise.all([
        findResumable(profile.id, lang),
        hasBeenPlaced(profile.id, lang),
      ]);
      setResumable(resume);
      setPlacementOffered(placed);
    },
    [queueProfileWrite],
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
    const lang = profile.targets[0] ?? 'en';
    // SPEC §4.2: re-estimate continuously, never make the learner retake
    // anything. A session is the natural moment — new dictation answers exist
    // or they do not, and where they do not this writes nothing at all.
    void refreshListeningAbility(profile.id, lang, Date.now());
    setResumable(await findResumable(profile.id, lang));
    // They just practised, so the cue has been answered (§2.14).
    setCueDue(null);
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
    case 'habit':
      return (
        <HabitScreen
          profile={screen.profile}
          onDone={() => {
            setCueDue(null);
            setScreen({ name: 'settings', profile: screen.profile });
          }}
        />
      );
    case 'diagnostics':
      return (
        <DiagnosticsScreen
          onProbed={(lang, report) => {
            // Only the active language drives the home screen's audio line; the
            // other language's verdict is still adopted inside the probe.
            if (lang === (screen.profile.targets[0] ?? 'en')) setVoice(report);
          }}
          onBack={() => setScreen({ name: 'settings', profile: screen.profile })}
        />
      );
    case 'settings':
      return (
        <SettingsScreen
          profile={screen.profile}
          onChange={(changes) => void handleChange(changes)}
          onHabit={() => setScreen({ name: 'habit', profile: screen.profile })}
          onSync={() => setScreen({ name: 'sync', profile: screen.profile })}
          onDiagnostics={() => setScreen({ name: 'diagnostics', profile: screen.profile })}
          onAttribution={() => setScreen({ name: 'attribution', profile: screen.profile })}
          onBack={() => setScreen({ name: 'home', profile: screen.profile })}
        />
      );
    case 'sync':
      return (
        <SyncScreen
          profile={screen.profile}
          onBack={() => setScreen({ name: 'settings', profile: screen.profile })}
        />
      );
    case 'attribution':
      return (
        <AttributionScreen
          onBack={() => setScreen({ name: 'settings', profile: screen.profile })}
        />
      );
    case 'glossary':
      return (
        <GlossaryScreen
          profile={screen.profile}
          onBack={() => setScreen({ name: 'progress', profile: screen.profile })}
        />
      );
    case 'progress':
      return (
        <ProgressScreen
          profile={screen.profile}
          onGlossary={() => setScreen({ name: 'glossary', profile: screen.profile })}
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
          today={today}
          onReady={() => probeAudio(screen.profile.targets[0] ?? 'en')}
          onPlacement={() => setScreen({ name: 'placement', profile: screen.profile })}
          onProgress={() => setScreen({ name: 'progress', profile: screen.profile })}
          onRead={() => setScreen({ name: 'reader', profile: screen.profile })}
          onSettings={() => setScreen({ name: 'settings', profile: screen.profile })}
          cueDue={cueDue}
          onDismissCue={() => setCueDue(null)}
          onPractise={() => void handlePractise()}
          onChange={(changes) => void handleChange(changes)}
        />
      );
  }
};
