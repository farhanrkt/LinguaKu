import { useCallback, useEffect, useState } from 'react';
import { copy } from '../../i18n/id.ts';
import { Button } from '../../ui/Button.tsx';
import { Screen } from '../../ui/Screen.tsx';
import { db } from '../../data/db.ts';
import { loadPseudowords } from '../../data/content.ts';
import { saveAbility } from '../../data/repositories/abilities.ts';
import { bandForAbility, type AbilityEstimate } from '../../core/placement.ts';
import {
  buildProbePool,
  correctedAbility,
  emptyPlacement,
  nextProbe,
  recordAnswer,
  tallyFrom,
  type PlacementProbe,
  type PlacementState,
} from './placementRun.ts';
import type { Profile } from '../../data/types.ts';

/**
 * SPEC §4.2: ≤90 seconds, ≤25 items, adaptive, and it must feel like learning
 * rather than an exam. **Always skippable** — the offer is a button, never a
 * gate, and skipping simply leaves the learner at the prior.
 */

interface PlacementScreenProps {
  profile: Profile;
  onDone: () => void;
}

type Phase =
  | { name: 'loading' }
  | { name: 'intro' }
  | { name: 'asking'; probe: PlacementProbe }
  | { name: 'result'; estimate: AbilityEstimate; overclaimed: boolean };

/** Enough breadth to place anyone from beginner to the top of band 5. */
const PROBE_WORDS = 120;

export const PlacementScreen = ({ profile, onDone }: PlacementScreenProps) => {
  const lang = profile.targets[0] ?? 'en';
  const [pool, setPool] = useState<ReturnType<typeof buildProbePool> | null>(null);
  const [state, setState] = useState<PlacementState | null>(null);
  const [phase, setPhase] = useState<Phase>({ name: 'loading' });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [items, pseudowords] = await Promise.all([
        db.items.where('[lang+kind]').equals([lang, 'lexeme']).sortBy('freqRank'),
        loadPseudowords(lang).catch(() => [] as string[]),
      ]);
      if (cancelled) return;

      // Spread the probes evenly across the rank range rather than taking the
      // first N, or every question would come from band 1.
      const step = Math.max(1, Math.floor(items.length / PROBE_WORDS));
      const spread = items.filter((_, index) => index % step === 0).slice(0, PROBE_WORDS);

      setPool(buildProbePool(spread, pseudowords, profile.createdAt));
      setPhase({ name: 'intro' });
    })();
    return () => {
      cancelled = true;
    };
  }, [lang, profile.createdAt]);

  const advance = useCallback(
    (current: PlacementState) => {
      if (!pool) return;
      const probe = nextProbe({ state: current, pool, now: Date.now() });
      if (probe) {
        setPhase({ name: 'asking', probe });
        return;
      }

      const estimate = correctedAbility(current);
      const tally = tallyFrom(current);
      void saveAbility(profile.id, lang, 'vocab', estimate, Date.now());
      setPhase({
        name: 'result',
        estimate,
        overclaimed: tally.falseAlarms > 0,
      });
    },
    [pool, profile.id, lang],
  );

  const begin = useCallback(() => {
    const fresh = emptyPlacement(Date.now());
    setState(fresh);
    advance(fresh);
  }, [advance]);

  const answer = useCallback(
    (knows: boolean) => {
      if (!state || phase.name !== 'asking') return;
      const next = recordAnswer(state, phase.probe, knows);
      setState(next);
      advance(next);
    },
    [state, phase, advance],
  );

  if (phase.name === 'loading') {
    return (
      <Screen>
        <p className="mt-12 text-center text-stone-600 dark:text-slate-400">
          {copy.session.preparing}
        </p>
      </Screen>
    );
  }

  if (phase.name === 'intro') {
    return (
      <Screen
        footer={
          <>
            <Button onClick={begin} data-testid="placement-start">
              {copy.placement.start}
            </Button>
            <button
              type="button"
              onClick={onDone}
              className="mt-2 min-h-12 w-full text-sm text-stone-500 underline-offset-4 hover:underline dark:text-slate-500"
              data-testid="placement-skip"
            >
              {copy.placement.skip}
            </button>
          </>
        }
      >
        <h1 className="mt-6 text-2xl font-bold">{copy.placement.heading}</h1>
        <p className="mt-3 text-stone-600 dark:text-slate-400">{copy.placement.intro}</p>
        <p className="mt-3 text-stone-600 dark:text-slate-400">{copy.placement.instruction}</p>
        <p className="mt-6 text-sm text-stone-500 dark:text-slate-500">
          {copy.placement.skipNote}
        </p>
      </Screen>
    );
  }

  if (phase.name === 'asking') {
    return (
      <Screen
        footer={
          <div className="flex gap-3">
            <Button onClick={() => answer(true)} data-testid="placement-know">
              {copy.placement.know}
            </Button>
            <Button
              variant="quiet"
              onClick={() => answer(false)}
              className="border-2 border-stone-300 dark:border-slate-700"
              data-testid="placement-dont-know"
            >
              {copy.placement.dontKnow}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-stone-500 dark:text-slate-500" data-testid="placement-progress">
          {copy.placement.progress(state?.asked.length ?? 0)}
        </p>
        <p
          className="mt-16 text-center text-4xl font-bold break-words"
          data-testid="placement-word"
        >
          {phase.probe.word}
        </p>
      </Screen>
    );
  }

  // SPEC §4.1 and §2.15: report a band, never a bare level. The standard error
  // *is* the band — showing the point estimate alone would be the fake
  // precision the spec bans.
  const low = bandForAbility(phase.estimate.theta - phase.estimate.standardError);
  const high = bandForAbility(phase.estimate.theta + phase.estimate.standardError);
  // A band three tiers wide is not a placement, it is noise wearing a number.
  const tooVague = high - low >= 3;

  return (
    <Screen footer={<Button onClick={onDone}>{copy.placement.result.begin}</Button>}>
      <h1 className="mt-8 text-2xl font-bold" data-testid="placement-result">
        {copy.placement.result.heading}
      </h1>
      <p className="mt-4 text-lg">
        {tooVague ? copy.placement.result.unclear : copy.placement.result.band(low, high)}
      </p>
      {tooVague ? null : (
        <p className="mt-3 text-sm text-stone-600 dark:text-slate-400">
          {copy.placement.result.estimate}
        </p>
      )}
      {phase.overclaimed ? (
        <p className="mt-3 rounded-2xl bg-stone-100 p-3 text-sm text-stone-600 dark:bg-slate-900 dark:text-slate-400">
          {copy.placement.result.overclaimed}
        </p>
      ) : null}
    </Screen>
  );
};
