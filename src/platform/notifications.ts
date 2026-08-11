/**
 * Local reminders for the habit cue (SPEC §2.13).
 *
 * §2.13 asks onboarding for an implementation intention — *"Setiap hari setelah
 * ___, saya latihan di ___"* — and for a local notification scheduled at that
 * cue. The finding behind it is Gollwitzer's: an intention bound to a specific
 * cue and place is acted on far more often than a bare intention, and the cue is
 * doing the work, not the reminder.
 *
 * **There is no push server, and there will not be one.** Web Push needs a
 * server holding VAPID keys and a subscription per device; that is a recurring
 * cost and a piece of infrastructure this project does not have (§0 rule 1,
 * invariant 4). So a reminder here can only ever be *local*, and that limits
 * what is honestly deliverable:
 *
 *  1. **Notification Triggers** (`TimestampTrigger`) fires while the app is
 *     closed and is the only API that delivers what §2.13 literally describes.
 *     It is Chromium-only and behind a flag on most builds, so it is used where
 *     it exists and never assumed.
 *  2. **Otherwise the cue is shown in-app** on the next open after the time has
 *     passed. That is a weaker thing than a notification and it is labelled as
 *     one — the settings screen says plainly whether this device can remind you
 *     when the app is shut.
 *
 * The dishonest option — asking for notification permission, storing a time, and
 * silently never firing — is the one thing ruled out. §2.6 sets the precedent:
 * a capability that does not exist is withheld and named, never faked.
 */

export type ReminderSupport =
  /** `TimestampTrigger` exists: a reminder can fire with the app closed. */
  | 'scheduled'
  /** Notifications exist but cannot be scheduled ahead; in-app cue only. */
  | 'in-app-only'
  /** No Notification API at all. */
  | 'unsupported';

export type PermissionState = 'granted' | 'denied' | 'default';

const hasNotification = (): boolean => typeof globalThis.Notification !== 'undefined';

/**
 * Feature detection only — never prompts. `showTrigger` is a property of the
 * options object the constructor reads, so its presence on the prototype is
 * what distinguishes a browser that can schedule from one that cannot.
 */
export const reminderSupport = (): ReminderSupport => {
  if (!hasNotification()) return 'unsupported';
  return 'showTrigger' in Notification.prototype ? 'scheduled' : 'in-app-only';
};

export const notificationPermission = (): PermissionState =>
  hasNotification() ? Notification.permission : 'denied';

/**
 * Asked for only when the learner has just written a cue — never on boot.
 * A permission prompt on a cold first paint is the fastest way to lose someone,
 * and a prompt for a thing they have not asked for is worse than no reminder.
 */
export const requestNotificationPermission = async (): Promise<PermissionState> => {
  if (!hasNotification()) return 'denied';
  if (Notification.permission !== 'default') return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
};

/** Local wall-clock `HH:mm` → that same clock time on the day `now` falls in. */
const cueOn = (time: string, now: number): number | null => {
  const [hours, minutes] = time.split(':').map(Number);
  if (hours === undefined || minutes === undefined || Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null;
  }
  const at = new Date(now);
  at.setHours(hours, minutes, 0, 0);
  return at.getTime();
};

/** Local wall-clock `HH:mm` → the next epoch-ms instant at that time. */
export const nextOccurrence = (time: string, now: number): number => {
  const today = cueOn(time, now);
  if (today === null) return now;
  return today > now ? today : today + 86_400_000;
};

/**
 * True when the cue time has passed since the learner last practised — the
 * in-app fallback for every browser without Notification Triggers.
 *
 * Deliberately not "have they practised today": a learner whose cue is 21:00 and
 * who practised at 08:00 has kept the habit, and telling them otherwise at 21:01
 * would be the guilt framing §2.14 bans.
 */
export const cueIsDue = (input: {
  time: string;
  now: number;
  lastPractisedAt: number | null;
}): boolean => {
  const cueToday = cueOn(input.time, input.now);
  if (cueToday === null || input.now < cueToday) return false;

  // Measured from the start of the day, not from the cue. A learner whose cue
  // is 21:00 and who practised at 08:00 has already done the thing; comparing
  // against the cue would surface a reminder at 21:01 for work finished
  // thirteen hours earlier.
  const dayStart = new Date(input.now).setHours(0, 0, 0, 0);
  return input.lastPractisedAt === null || input.lastPractisedAt < dayStart;
};

export interface ScheduleInput {
  time: string;
  title: string;
  body: string;
  now?: number;
}

/**
 * Schedules the next reminder where the browser can, and reports honestly where
 * it cannot. Returns whether anything was actually scheduled — the settings
 * screen shows that verdict rather than a promise.
 *
 * One notification, not a recurring series: `TimestampTrigger` has no repeat, so
 * the next one is scheduled each time the app opens. A learner who never opens
 * the app stops being reminded, which is the correct failure — a reminder that
 * outlives the learner's interest in the app is spam.
 */
export const scheduleReminder = async (input: ScheduleInput): Promise<boolean> => {
  if (reminderSupport() !== 'scheduled') return false;
  if (notificationPermission() !== 'granted') return false;

  const registration = await navigator.serviceWorker?.ready.catch(() => null);
  if (!registration) return false;

  try {
    await cancelReminders(registration);
    const TriggerCtor = (globalThis as { TimestampTrigger?: new (t: number) => unknown })
      .TimestampTrigger;
    if (!TriggerCtor) return false;

    await registration.showNotification(input.title, {
      body: input.body,
      tag: REMINDER_TAG,
      showTrigger: new TriggerCtor(nextOccurrence(input.time, input.now ?? Date.now())),
    } as NotificationOptions);
    return true;
  } catch {
    // A browser that advertises the API and then refuses it is the speech-probe
    // failure again: report not-scheduled rather than assume it worked.
    return false;
  }
};

const REMINDER_TAG = 'linguaku-habit-cue';

/** Clears any pending reminder — called before rescheduling, and on disable. */
export const cancelReminders = async (
  registration?: ServiceWorkerRegistration | null,
): Promise<void> => {
  const target = registration ?? (await navigator.serviceWorker?.ready.catch(() => null));
  if (!target) return;
  try {
    const pending = await target.getNotifications({ tag: REMINDER_TAG, includeTriggered: true } as
      GetNotificationOptions);
    for (const notification of pending) notification.close();
  } catch {
    // Nothing to clear, or the browser will not say. Either way, not an error.
  }
};
