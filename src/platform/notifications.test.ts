import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cueIsDue,
  nextOccurrence,
  notificationPermission,
  reminderSupport,
  scheduleReminder,
} from './notifications.ts';

/**
 * SPEC §2.13. The scheduling half of this module can only be as good as the
 * browser allows, so most of what is worth testing is the honesty of the
 * verdict — and the cue arithmetic, which must never accuse a learner who has
 * already practised.
 */

const AT = (h: number, m = 0) => new Date(2026, 7, 11, h, m, 0, 0).getTime();

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('nextOccurrence', () => {
  it('finds today’s cue when it has not passed yet', () => {
    expect(nextOccurrence('21:00', AT(8))).toBe(AT(21));
  });

  it('rolls to tomorrow once the cue has passed', () => {
    expect(nextOccurrence('07:30', AT(9))).toBe(AT(7, 30) + 86_400_000);
  });

  it('treats the cue minute itself as passed rather than firing late', () => {
    expect(nextOccurrence('09:00', AT(9))).toBe(AT(9) + 86_400_000);
  });

  it('survives a malformed time rather than scheduling at NaN', () => {
    const now = AT(10);
    expect(nextOccurrence('', now)).toBe(now);
    expect(nextOccurrence('nonsense', now)).toBe(now);
  });
});

describe('cueIsDue — the in-app fallback', () => {
  it('is due when the cue has passed and there has been no practice since', () => {
    expect(cueIsDue({ time: '07:00', now: AT(9), lastPractisedAt: null })).toBe(true);
  });

  it('is not due before the cue time', () => {
    expect(cueIsDue({ time: '21:00', now: AT(9), lastPractisedAt: null })).toBe(false);
  });

  /**
   * §2.14 bans guilt framing, and this is where it would leak in. A learner
   * whose cue is 21:00 and who practised at 08:00 has kept the habit; nagging
   * them at 21:01 would punish them for being early.
   */
  it('is not due to someone who already practised today', () => {
    expect(cueIsDue({ time: '21:00', now: AT(21, 30), lastPractisedAt: AT(8) })).toBe(false);
  });

  it('is due again the next day', () => {
    expect(
      cueIsDue({ time: '07:00', now: AT(9) + 86_400_000, lastPractisedAt: AT(8) }),
    ).toBe(true);
  });
});

describe('capability reporting', () => {
  it('reports unsupported where there is no Notification API', () => {
    vi.stubGlobal('Notification', undefined);
    expect(reminderSupport()).toBe('unsupported');
    // And a browser that cannot notify must never read as "allowed".
    expect(notificationPermission()).toBe('denied');
  });

  it('reports in-app-only where notifications exist but cannot be scheduled', () => {
    vi.stubGlobal('Notification', class {
      static permission = 'granted';
    });
    expect(reminderSupport()).toBe('in-app-only');
  });

  it('reports scheduled only where TimestampTrigger actually exists', () => {
    class WithTrigger {
      static permission = 'granted';
      showTrigger?: unknown;
    }
    WithTrigger.prototype.showTrigger = undefined;
    vi.stubGlobal('Notification', WithTrigger);
    expect(reminderSupport()).toBe('scheduled');
  });
});

describe('scheduleReminder refuses to claim what it did not do', () => {
  const input = { time: '21:00', title: 'Latihan', body: '4 menit' };

  it('returns false where scheduling is impossible', async () => {
    vi.stubGlobal('Notification', class {
      static permission = 'granted';
    });
    expect(await scheduleReminder(input)).toBe(false);
  });

  it('returns false when permission was never granted', async () => {
    class WithTrigger {
      static permission = 'default';
      showTrigger?: unknown;
    }
    WithTrigger.prototype.showTrigger = undefined;
    vi.stubGlobal('Notification', WithTrigger);
    expect(await scheduleReminder(input)).toBe(false);
  });

  it('returns false when the browser advertises the API and then throws', async () => {
    class WithTrigger {
      static permission = 'granted';
      showTrigger?: unknown;
    }
    WithTrigger.prototype.showTrigger = undefined;
    vi.stubGlobal('Notification', WithTrigger);
    vi.stubGlobal('TimestampTrigger', class {});
    vi.stubGlobal('navigator', {
      serviceWorker: {
        ready: Promise.resolve({
          showNotification: () => {
            throw new Error('nope');
          },
          getNotifications: () => Promise.resolve([]),
        }),
      },
    });
    expect(await scheduleReminder(input)).toBe(false);
  });

  it('reports true only once a notification was really accepted', async () => {
    class WithTrigger {
      static permission = 'granted';
      showTrigger?: unknown;
    }
    WithTrigger.prototype.showTrigger = undefined;
    vi.stubGlobal('Notification', WithTrigger);
    vi.stubGlobal('TimestampTrigger', class {
      constructor(public at: number) {}
    });
    const shown: string[] = [];
    vi.stubGlobal('navigator', {
      serviceWorker: {
        ready: Promise.resolve({
          showNotification: (title: string) => {
            shown.push(title);
          },
          getNotifications: () => Promise.resolve([]),
        }),
      },
    });
    expect(await scheduleReminder({ ...input, now: AT(8) })).toBe(true);
    expect(shown).toEqual(['Latihan']);
  });
});
