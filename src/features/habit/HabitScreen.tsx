import { useEffect, useState } from 'react';
import { copy } from '../../i18n/id.ts';
import { Button } from '../../ui/Button.tsx';
import { Screen } from '../../ui/Screen.tsx';
import { getHabit, saveHabit, setHabitEnabled } from '../../data/repositories/habits.ts';
import {
  reminderSupport,
  requestNotificationPermission,
  scheduleReminder,
  cancelReminders,
  type ReminderSupport,
} from '../../platform/notifications.ts';
import type { Profile } from '../../data/types.ts';

/**
 * SPEC §2.13: the implementation intention.
 *
 * The screen is a sentence the learner completes — *"Setiap hari setelah ___,
 * saya latihan di ___"* — rather than a settings form, because the finding is
 * about binding the plan to a cue they already have, and a form asking for
 * "reminder time" does not do that.
 *
 * Offered, never enforced. Skipping costs nothing and the app is complete
 * without it, the same contract placement runs on (§4.2, invariant 13).
 */

interface HabitScreenProps {
  profile: Profile;
  onDone: () => void;
}

const supportCopy: Record<ReminderSupport, string> = {
  scheduled: copy.habit.supportScheduled,
  'in-app-only': copy.habit.supportInApp,
  unsupported: copy.habit.supportNone,
};

export const HabitScreen = ({ profile, onDone }: HabitScreenProps) => {
  const [cue, setCue] = useState('');
  const [place, setPlace] = useState('');
  const [time, setTime] = useState('20:00');
  const [existing, setExisting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);

  const support = reminderSupport();

  useEffect(() => {
    void (async () => {
      const habit = await getHabit(profile.id);
      if (!habit) return;
      setCue(habit.cue);
      setPlace(habit.place);
      setTime(habit.notificationTime);
      setExisting(habit.enabled === 1);
    })();
  }, [profile.id]);

  const handleSave = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await saveHabit({
        profileId: profile.id,
        cue,
        place,
        notificationTime: time,
        enabled: true,
      });

      // Asked for only now — the learner has just written a plan, which is the
      // one moment a reminder prompt is something they asked for.
      if (support !== 'unsupported') {
        const permission = await requestNotificationPermission();
        setDenied(permission === 'denied');
        if (permission === 'granted') {
          await scheduleReminder({
            time,
            title: copy.session.start(profile.dailyMinutes),
            body: copy.habit.summary(cue, place, time),
          });
        }
      }
      onDone();
    } finally {
      setBusy(false);
    }
  };

  const handleOff = async () => {
    await setHabitEnabled(profile.id, false);
    await cancelReminders();
    onDone();
  };

  const complete = cue.trim().length > 0 && place.trim().length > 0;

  return (
    <Screen
      footer={
        <>
          <Button onClick={() => void handleSave()} disabled={!complete || busy} data-testid="habit-save">
            {copy.habit.save}
          </Button>
          <button
            type="button"
            onClick={onDone}
            data-testid="habit-skip"
            className="mt-2 min-h-12 w-full text-sm text-stone-500 underline underline-offset-4 dark:text-slate-400"
          >
            {copy.habit.skip}
          </button>
        </>
      }
    >
      <h1 className="text-2xl font-bold">{copy.habit.heading}</h1>
      <p className="mt-2 text-stone-600 dark:text-slate-400">{copy.habit.intro}</p>

      {/* The sentence frame, laid out as a sentence rather than as fields. */}
      <p className="mt-6 text-lg leading-relaxed" data-testid="habit-sentence">
        {copy.habit.sentenceBefore}{' '}
        <label className="sr-only" htmlFor="habit-cue">
          {copy.habit.cueLabel}
        </label>
        <input
          id="habit-cue"
          value={cue}
          onChange={(event) => setCue(event.target.value)}
          placeholder={copy.habit.cuePlaceholder}
          data-testid="habit-cue"
          className="mx-1 min-h-12 w-40 rounded-xl border-b-2 border-teal-700 bg-transparent px-2 font-semibold text-teal-900 placeholder:font-normal placeholder:text-stone-400 focus-visible:outline-2 focus-visible:outline-teal-700 dark:border-teal-400 dark:text-teal-200 dark:placeholder:text-slate-600"
        />
        {copy.habit.sentenceMiddle}{' '}
        <label className="sr-only" htmlFor="habit-place">
          {copy.habit.placeLabel}
        </label>
        <input
          id="habit-place"
          value={place}
          onChange={(event) => setPlace(event.target.value)}
          placeholder={copy.habit.placePlaceholder}
          data-testid="habit-place"
          className="mx-1 min-h-12 w-36 rounded-xl border-b-2 border-teal-700 bg-transparent px-2 font-semibold text-teal-900 placeholder:font-normal placeholder:text-stone-400 focus-visible:outline-2 focus-visible:outline-teal-700 dark:border-teal-400 dark:text-teal-200 dark:placeholder:text-slate-600"
        />
        {copy.habit.sentenceAfter}
      </p>

      <label className="mt-8 block text-sm font-semibold" htmlFor="habit-time">
        {copy.habit.timeLabel}
      </label>
      <input
        id="habit-time"
        type="time"
        value={time}
        onChange={(event) => setTime(event.target.value)}
        data-testid="habit-time"
        className="mt-2 min-h-14 w-full rounded-2xl border-2 border-stone-300 bg-transparent px-4 text-lg focus-visible:outline-2 focus-visible:outline-teal-700 dark:border-slate-700"
      />

      {/* SPEC §2.6's rule, applied to notifications: name the capability. */}
      <p className="mt-6 text-sm text-stone-500 dark:text-slate-400" data-testid="habit-support">
        {denied ? copy.habit.permissionDenied : supportCopy[support]}
      </p>
      <p className="mt-2 text-sm text-stone-500 dark:text-slate-400">{copy.habit.skipNote}</p>

      {existing ? (
        <button
          type="button"
          onClick={() => void handleOff()}
          data-testid="habit-off"
          className="mt-6 min-h-12 w-full text-left text-sm text-stone-500 underline underline-offset-4 dark:text-slate-400"
        >
          {copy.habit.off}
        </button>
      ) : null}
    </Screen>
  );
};
