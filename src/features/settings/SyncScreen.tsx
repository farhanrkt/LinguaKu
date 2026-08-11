import { useCallback, useState } from 'react';
import { copy } from '../../i18n/id.ts';
import { Button } from '../../ui/Button.tsx';
import { Screen } from '../../ui/Screen.tsx';
import {
  readSyncSettings,
  syncNow,
  writeSyncSettings,
  type SyncOutcome,
  type SyncSettings,
} from '../../platform/sync.ts';
import type { Profile } from '../../data/types.ts';

/**
 * Optional sync (SPEC §5.1, Phase 2).
 *
 * **This screen is the only thing in the app that imports the sync module.**
 * That is what makes "the app is 100% functional with sync disabled" a
 * structural fact rather than a promise: there is no background timer, no
 * registration on boot, no listener. A learner who never opens this screen runs
 * an app in which none of that code executes.
 *
 * The copy is deliberate about two things the learner deserves to know before
 * they turn it on: there is no LinguaKu server, so they are pointing this at
 * infrastructure they run themselves; and enabling it means their review history
 * leaves the device.
 */

interface SyncScreenProps {
  profile: Profile;
  onBack: () => void;
}

export const SyncScreen = ({ profile, onBack }: SyncScreenProps) => {
  const [settings, setSettings] = useState<SyncSettings>(() => readSyncSettings());
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<SyncOutcome | null>(null);

  const update = (changes: Partial<SyncSettings>) => {
    setSettings((current) => ({ ...current, ...changes }));
    setSaved(false);
  };

  const save = () => {
    writeSyncSettings(settings);
    setSaved(true);
  };

  const run = useCallback(async () => {
    setBusy(true);
    try {
      const result = await syncNow(profile.id);
      setOutcome(result);
      setSettings(readSyncSettings());
    } finally {
      setBusy(false);
    }
  }, [profile.id]);

  return (
    <Screen footer={<Button onClick={onBack}>{copy.progress.back}</Button>}>
      <h1 className="text-2xl font-bold">{copy.sync.heading}</h1>
      <p className="mt-2 text-stone-600 dark:text-slate-400">{copy.sync.intro}</p>
      <p className="mt-2 text-sm text-stone-500 dark:text-slate-500">{copy.sync.noServer}</p>

      <label className="mt-6 flex min-h-14 items-center gap-3">
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(event) => update({ enabled: event.target.checked })}
          data-testid="sync-enable"
          className="size-6"
        />
        <span className="font-semibold">{copy.sync.enable}</span>
      </label>

      <label className="mt-4 block">
        <span className="text-sm font-semibold text-stone-600 dark:text-slate-400">
          {copy.sync.endpoint}
        </span>
        <input
          type="url"
          value={settings.endpoint}
          onChange={(event) => update({ endpoint: event.target.value })}
          placeholder={copy.sync.endpointPlaceholder}
          autoComplete="off"
          data-testid="sync-endpoint"
          className="mt-1 min-h-14 w-full rounded-2xl border-2 border-stone-300 px-4 focus-visible:border-teal-700 focus-visible:outline-none dark:border-slate-700 dark:bg-slate-900"
        />
      </label>

      <label className="mt-4 block">
        <span className="text-sm font-semibold text-stone-600 dark:text-slate-400">
          {copy.sync.token}
        </span>
        <input
          type="password"
          value={settings.token}
          onChange={(event) => update({ token: event.target.value })}
          placeholder={copy.sync.tokenPlaceholder}
          autoComplete="off"
          data-testid="sync-token"
          className="mt-1 min-h-14 w-full rounded-2xl border-2 border-stone-300 px-4 focus-visible:border-teal-700 focus-visible:outline-none dark:border-slate-700 dark:bg-slate-900"
        />
      </label>

      <div className="mt-4 flex flex-col gap-3">
        <Button
          variant="quiet"
          onClick={save}
          data-testid="sync-save"
          className="border-2 border-stone-300 dark:border-slate-700"
        >
          {copy.sync.save}
        </Button>
        <Button
          onClick={() => void run()}
          disabled={busy || !settings.enabled}
          data-testid="sync-now"
        >
          {busy ? copy.sync.syncing : copy.sync.syncNow}
        </Button>
      </div>

      {saved ? (
        <p className="mt-3 text-sm text-teal-800 dark:text-teal-300" role="status">
          {copy.sync.saved}
        </p>
      ) : null}

      {outcome ? (
        <p
          className="mt-3 rounded-2xl bg-stone-100 p-3 text-sm dark:bg-slate-900"
          role="status"
          data-testid="sync-outcome"
        >
          {outcome.status === 'ok'
            ? copy.sync.ok(outcome.pushed, outcome.merged)
            : outcome.status === 'failed'
              ? copy.sync.failed(outcome.reason)
              : copy.sync.disabled}
        </p>
      ) : null}

      <p className="mt-6 text-sm text-stone-500 dark:text-slate-500">
        {copy.sync.lastSynced(
          settings.lastSyncedAt
            ? new Date(settings.lastSyncedAt).toLocaleString('id-ID')
            : copy.sync.never,
        )}
      </p>
      <p className="mt-2 text-sm text-stone-500 dark:text-slate-500">{copy.sync.privacy}</p>
    </Screen>
  );
};
