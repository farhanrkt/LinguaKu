import { useEffect, useState } from 'react';
import { copy } from '../../i18n/id.ts';
import { Button } from '../../ui/Button.tsx';
import { Screen } from '../../ui/Screen.tsx';
import { MIN_ATTEMPTS_TO_CLAIM, type CategoryStanding } from '../../core/elo.ts';
import { loadContrastive, type Category } from '../../data/contrastive.ts';
import {
  categoryStandings,
  drillAttemptCount,
} from '../../data/repositories/contrastive.ts';
import type { Profile } from '../../data/types.ts';

/**
 * SPEC §3.3 step 4 and §9: the interference heatmap — *"the most actionable
 * screen in the app."*
 *
 * Three rules it holds to, all of them SPEC §2.15:
 *
 *  1. **Nothing is claimed without evidence.** A category with fewer than
 *     `MIN_ATTEMPTS_TO_CLAIM` answers renders as "belum cukup data" with the
 *     number of answers still needed — not as a middling score, and not hidden.
 *     Hiding it would let the learner read the screen as complete when it is not.
 *  2. **No composite score.** There is no single "grammar level" here. Twenty
 *     categories are twenty separate measurements and they stay separate.
 *  3. **Capability framing.** The lead line names what to work on next, never
 *     what is wrong with the learner (docs/ETHICS.md).
 */

interface ProgressScreenProps {
  profile: Profile;
  onBack: () => void;
}

interface Row {
  standing: CategoryStanding;
  category: Category;
}

export const ProgressScreen = ({ profile, onBack }: ProgressScreenProps) => {
  const lang = profile.targets[0] ?? 'en';
  const [rows, setRows] = useState<Row[] | null>(null);
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    void (async () => {
      const pack = await loadContrastive(lang);
      const [standings, count] = await Promise.all([
        categoryStandings(profile.id, lang, pack.categories.map((category) => category.id)),
        drillAttemptCount(profile.id),
      ]);
      const byId = pack.byCategory;
      setRows(
        standings.flatMap((standing) => {
          const category = byId.get(standing.categoryId);
          return category ? [{ standing, category }] : [];
        }),
      );
      setAttempts(count);
    })();
  }, [profile.id, lang]);

  const measured = (rows ?? []).filter((row) => row.standing.measured);
  // Weakest first among the measured; unmeasured trail behind in a stable order
  // so the screen does not reshuffle between visits.
  const ordered = [
    ...measured.sort((a, b) => a.standing.rating - b.standing.rating),
    ...(rows ?? [])
      .filter((row) => !row.standing.measured)
      .sort((a, b) => a.category.id.localeCompare(b.category.id)),
  ];
  const weakest = measured.filter((row) => row.standing.weak).slice(0, 2);

  return (
    <Screen footer={<Button onClick={onBack}>{copy.progress.back}</Button>}>
      <h1 className="text-2xl font-bold">{copy.progress.heading}</h1>

      <h2 className="mt-6 text-lg font-bold">{copy.progress.heatmap.heading}</h2>
      <p className="mt-1 text-sm text-stone-600 dark:text-slate-400">
        {copy.progress.heatmap.intro}
      </p>

      {weakest.length > 0 ? (
        <div
          className="mt-4 rounded-2xl bg-amber-50 p-4 dark:bg-amber-950"
          data-testid="heatmap-weakest"
        >
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            {copy.progress.heatmap.weakestLead}
          </p>
          <p className="mt-1 text-lg font-bold text-amber-950 dark:text-amber-100">
            {copy.progress.heatmap.weakestNames(weakest.map((row) => row.category.label))}
          </p>
        </div>
      ) : null}

      {rows === null ? null : ordered.length === 0 ? (
        <p className="mt-4 text-stone-600 dark:text-slate-400">{copy.progress.heatmap.empty}</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2" data-testid="heatmap">
          {ordered.map((row) => (
            <HeatmapRow key={row.category.id} row={row} />
          ))}
        </ul>
      )}

      <p className="mt-6 text-sm text-stone-500 dark:text-slate-500">
        {copy.progress.heatmap.attemptsSoFar(attempts)}
      </p>
    </Screen>
  );
};

/**
 * One category. The bar is the expected-accuracy figure, which is what the Elo
 * rating actually means — not the rating itself, which would be a number with no
 * interpretation a learner could act on.
 */
const HeatmapRow = ({ row }: { row: Row }) => {
  const { standing, category } = row;
  const percent = Math.round(standing.expected * 100);

  const tone = !standing.measured
    ? 'bg-stone-300 dark:bg-slate-700'
    : standing.weak
      ? 'bg-amber-500 dark:bg-amber-400'
      : 'bg-teal-600 dark:bg-teal-400';

  return (
    <li className="rounded-2xl border-2 border-stone-200 p-3 dark:border-slate-800">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-semibold">{category.label}</span>
        <span className="text-xs text-stone-500 dark:text-slate-500">
          {copy.progress.heatmap.kinds[category.kind]}
        </span>
      </div>

      {standing.measured ? (
        <>
          <div
            aria-hidden
            className="mt-2 h-2 overflow-hidden rounded-full bg-stone-200 dark:bg-slate-800"
          >
            <div
              className={`h-2 rounded-full motion-safe:transition-all ${tone}`}
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="mt-1 text-sm text-stone-600 dark:text-slate-400">
            {copy.progress.heatmap.accuracy(standing.correct, standing.attempts)}
            {standing.weak ? '' : ` · ${copy.progress.heatmap.solid}`}
          </p>
        </>
      ) : (
        <p className="mt-2 text-sm text-stone-500 dark:text-slate-500">
          {copy.progress.heatmap.notMeasured}
          {' · '}
          {copy.progress.heatmap.notMeasuredHint(MIN_ATTEMPTS_TO_CLAIM - standing.attempts)}
        </p>
      )}
    </li>
  );
};
