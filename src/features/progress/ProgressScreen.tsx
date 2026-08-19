import { useCallback, useEffect, useRef, useState } from 'react';
import { copy } from '../../i18n/id.ts';
import { Button } from '../../ui/Button.tsx';
import { Screen } from '../../ui/Screen.tsx';
import { MIN_ATTEMPTS_TO_CLAIM, type CategoryStanding } from '../../core/elo.ts';
import { loadContrastive, type Category } from '../../data/contrastive.ts';
import { categoryStandings, drillAttemptCount } from '../../data/repositories/contrastive.ts';
import { buildProgressReport, type ProgressReport } from '../../data/repositories/progress.ts';
import { retuneTarget } from '../../core/retention.ts';
import { updateProfile } from '../../data/repositories/profiles.ts';
import { exportFilename, exportProfile, importProfile, parseBundle } from '../../data/export.ts';
import { BarRow, Columns, Radar, TargetMeter } from './charts.tsx';
import type { Profile } from '../../data/types.ts';

/**
 * SPEC §9: honest, capability-framed, all local.
 *
 * The rule the whole screen is built around: **nothing is claimed that the
 * learner's own answers do not support.** Every section has an explicit
 * "not measured yet" state, and those states are *shown* rather than hidden —
 * hiding them would let the screen read as complete when it is not.
 *
 * There is no composite score anywhere, and no level label. SPEC §2.15 bans
 * fake-precision level claims, and a single number over five separately measured
 * skills would be exactly that.
 */

interface ProgressScreenProps {
  profile: Profile;
  onBack: () => void;
  /** SPEC §2.2's passive glossary: the numbers here, made browsable. */
  onGlossary: () => void;
}

interface HeatRow {
  standing: CategoryStanding;
  category: Category;
}

const percent = (value: number): number => Math.round(value * 100);

export const ProgressScreen = ({ profile, onBack, onGlossary }: ProgressScreenProps) => {
  const lang = profile.targets[0] ?? 'en';
  const [report, setReport] = useState<ProgressReport | null>(null);
  const [rows, setRows] = useState<HeatRow[] | null>(null);
  const [drills, setDrills] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const pack = await loadContrastive(lang);
    const [built, standings, count] = await Promise.all([
      buildProgressReport(profile, Date.now()),
      categoryStandings(profile.id, lang, pack.categories.map((category) => category.id)),
      drillAttemptCount(profile.id),
    ]);
    setReport(built);
    setDrills(count);
    setRows(
      standings.flatMap((standing) => {
        const category = pack.byCategory.get(standing.categoryId);
        return category ? [{ standing, category }] : [];
      }),
    );
  }, [profile, lang]);

  // `load` is a useCallback over stable inputs, so this runs once per profile.
  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  // SPEC §9: no account required to export. A blob and a link — nothing leaves
  // the device unless the learner puts it somewhere themselves.
  const handleExport = useCallback(async () => {
    const bundle = await exportProfile(profile.id, Date.now());
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = exportFilename(Date.now());
    link.click();
    URL.revokeObjectURL(url);
    setNotice(copy.progress.data.exported);
  }, [profile.id]);

  const handleImport = useCallback(
    async (file: File) => {
      try {
        const result = await importProfile(parseBundle(await file.text()));
        setNotice(copy.progress.data.imported(result.reviewLogs));
        await load();
      } catch {
        setNotice(copy.progress.data.importFailed);
      }
    },
    [load],
  );

  return (
    <Screen footer={<Button onClick={onBack}>{copy.progress.back}</Button>}>
      <h1 className="text-2xl font-bold">{copy.progress.heading}</h1>
      <p className="mt-1 text-sm text-stone-600 dark:text-slate-400">{copy.progress.localOnly}</p>

      {/* SPEC §2.2's passive glossary. The numbers below count what a learner
          knows; this is where they can look at it. */}
      <button
        type="button"
        onClick={onGlossary}
        data-testid="glossary-open"
        className="mt-5 min-h-14 w-full rounded-2xl border-2 border-stone-300 px-4 font-semibold text-teal-800 motion-safe:transition-colors hover:border-teal-700 dark:border-slate-700 dark:text-teal-300"
      >
        {copy.glossary.open}
      </button>

      {report === null ? null : (
        <>
          <Vocabulary report={report} />
          <CoverageCurve report={report} />
          <Retention report={report} profile={profile} onRetune={() => void load()} />
          <Forecast report={report} />
          <Skills report={report} />
          <Calibration report={report} />
          <Consistency report={report} />
          <WeeklyRecap report={report} />
          <Heatmap rows={rows} drills={drills} />
        </>
      )}

      <h2 className="mt-8 text-lg font-bold">{copy.progress.data.heading}</h2>
      <p className="mt-1 text-sm text-stone-600 dark:text-slate-400">{copy.progress.data.note}</p>
      <div className="mt-3 flex flex-col gap-3">
        <Button variant="quiet" onClick={() => void handleExport()} data-testid="export"
          className="border-2 border-stone-300 dark:border-slate-700">
          {copy.progress.data.export}
        </Button>
        <Button
          variant="quiet"
          onClick={() => fileInput.current?.click()}
          data-testid="import"
          className="border-2 border-stone-300 dark:border-slate-700"
        >
          {copy.progress.data.importLabel}
        </Button>
        {/* The visible control is the button above, which opens this input.
            A screen reader meets the input itself, though, so it carries its own
            name — without one it is announced as an unlabelled file field, and
            the learner has no idea what they are being asked to hand over. */}
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          aria-label={copy.progress.data.importLabel}
          data-testid="import-file"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleImport(file);
          }}
        />
      </div>
      {notice ? (
        <p className="mt-3 rounded-2xl bg-teal-50 p-3 text-sm text-teal-900 dark:bg-teal-950 dark:text-teal-200"
          role="status" data-testid="data-notice">
          {notice}
        </p>
      ) : null}
    </Screen>
  );
};

// --------------------------------------------------------------- vocabulary

const Vocabulary = ({ report }: { report: ProgressReport }) => {
  const { vocabulary, coverage } = report;

  return (
    <section data-testid="vocab">
      <h2 className="mt-8 text-lg font-bold">{copy.progress.vocab.heading}</h2>
      {vocabulary.measured ? (
        <>
          <p className="mt-2 text-xl font-bold">
            {copy.progress.vocab.headline(vocabulary.estimate)}
          </p>
          {/* SPEC §9: an estimate always carries its band. */}
          <p className="mt-1 text-sm text-stone-600 dark:text-slate-400">
            {copy.progress.vocab.range(vocabulary.low, vocabulary.high)}
          </p>
          <p className="mt-1 text-sm text-stone-500 dark:text-slate-400">
            {copy.progress.vocab.floor(vocabulary.floor)}
          </p>
          {coverage.share > 0 ? (
            <>
              <p className="mt-3">{copy.progress.vocab.capability(percent(coverage.share))}</p>
              <p className="mt-1 text-sm text-stone-500 dark:text-slate-400">
                {copy.progress.vocab.ceiling(percent(coverage.teachableShare))}
              </p>
            </>
          ) : null}
          {vocabulary.unsampledBands.length > 0 ? (
            <p className="mt-2 text-sm text-stone-500 dark:text-slate-400">
              {copy.progress.vocab.wide}
            </p>
          ) : null}
        </>
      ) : (
        <p className="mt-2 text-stone-600 dark:text-slate-400">{copy.progress.vocab.empty}</p>
      )}
    </section>
  );
};

/** SPEC §2.10's acceptance: a coverage-vs-frequency-band curve from real state. */
const CoverageCurve = ({ report }: { report: ProgressReport }) => (
  <section data-testid="coverage-curve">
    <h2 className="mt-8 text-lg font-bold">{copy.progress.curve.heading}</h2>
    <p className="mt-1 text-sm text-stone-600 dark:text-slate-400">{copy.progress.curve.hint}</p>
    <ul className="mt-2 divide-y divide-stone-200 dark:divide-slate-800">
      {report.bands.map((band) => (
        <BarRow
          key={band.band}
          label={copy.progress.curve.band(band.band)}
          value={band.rate}
          backdrop={band.sampled}
          detail={
            band.seen === 0
              ? copy.progress.curve.untouched
              : copy.progress.curve.known(band.known, band.seen)
          }
        />
      ))}
    </ul>
  </section>
);

// ---------------------------------------------------------------- retention

const Retention = ({
  report,
  profile,
  onRetune,
}: {
  report: ProgressReport;
  profile: Profile;
  onRetune: () => void;
}) => {
  const { retention } = report;
  const [retuned, setRetuned] = useState(false);

  // SPEC §9: *"say so and offer to retune"*. The offer only appears when the
  // evidence actually rules the target out — never as a permanent knob inviting
  // a learner to fiddle with their own forgetting curve.
  const offerRetune = retention.verdict === 'below' || retention.verdict === 'above';

  const handleRetune = async () => {
    const next = retuneTarget(retention.target, retention.verdict);
    await updateProfile(profile.id, { requestRetention: next });
    setRetuned(true);
    onRetune();
  };

  const message =
    retention.verdict === 'on-target'
      ? copy.progress.retention.onTarget
      : retention.verdict === 'below'
        ? copy.progress.retention.below
        : retention.verdict === 'above'
          ? copy.progress.retention.above
          : copy.progress.retention.unknown;

  return (
    <section data-testid="retention">
      <h2 className="mt-8 text-lg font-bold">{copy.progress.retention.heading}</h2>
      {retention.measured ? (
        <>
          <TargetMeter
            value={retention.rate}
            low={retention.low}
            high={retention.high}
            target={retention.target}
          />
          <p className="mt-2">
            <strong>{copy.progress.retention.actual(percent(retention.rate))}</strong>{' '}
            <span className="text-stone-600 dark:text-slate-400">
              {copy.progress.retention.reviews(retention.reviews)} ·{' '}
              {copy.progress.retention.target(percent(retention.target))}
            </span>
          </p>
          <p className="mt-1 text-sm text-stone-600 dark:text-slate-400">{message}</p>
          {offerRetune && !retuned ? (
            <div className="mt-3">
              <Button
                variant="quiet"
                onClick={() => void handleRetune()}
                data-testid="retune"
                className="border-2 border-stone-300 dark:border-slate-700"
              >
                {copy.progress.retention.retune}
              </Button>
            </div>
          ) : null}
          {retuned ? (
            <p className="mt-2 text-sm text-teal-800 dark:text-teal-300" role="status">
              {copy.progress.retention.retuned}
            </p>
          ) : null}
        </>
      ) : (
        <p className="mt-2 text-stone-600 dark:text-slate-400">
          {copy.progress.retention.unknown}
        </p>
      )}
    </section>
  );
};

const Forecast = ({ report }: { report: ProgressReport }) => (
  <section data-testid="forecast-section">
    <h2 className="mt-8 text-lg font-bold">{copy.progress.forecast.heading}</h2>
    <p className="mt-1 text-sm text-stone-600 dark:text-slate-400">{copy.progress.forecast.hint}</p>
    <Columns
      values={report.forecast.map((day) => day.dueCount)}
      labelFor={(index) => (index === 0 ? '•' : String(index))}
      emptyLabel={copy.progress.forecast.quiet}
    />
  </section>
);

// ------------------------------------------------------------------ skills

const Skills = ({ report }: { report: ProgressReport }) => (
  <section data-testid="skills">
    <h2 className="mt-8 text-lg font-bold">{copy.progress.skills.heading}</h2>
    <p className="mt-1 text-sm text-stone-600 dark:text-slate-400">{copy.progress.skills.hint}</p>
    <Radar
      axes={report.skills.map((skill) => ({
        label: copy.progress.skills.names[skill.skill],
        value: skill.score,
      }))}
    />
    <ul className="mt-2 divide-y divide-stone-200 dark:divide-slate-800">
      {report.skills.map((skill) => (
        <li key={skill.skill} className="flex items-baseline justify-between gap-3 py-2 text-sm">
          <span className="font-semibold">{copy.progress.skills.names[skill.skill]}</span>
          <span className="text-stone-600 tabular-nums dark:text-slate-400">
            {skill.score === null
              ? copy.progress.skills.unmeasured
              : `${percent(skill.score)}% · ${copy.progress.skills.answers(skill.answers)}`}
          </span>
        </li>
      ))}
    </ul>
  </section>
);

const Calibration = ({ report }: { report: ProgressReport }) => {
  const { calibration } = report;
  const [sure, unsure] = calibration.buckets;

  return (
    <section data-testid="calibration">
      <h2 className="mt-8 text-lg font-bold">{copy.progress.calibration.heading}</h2>
      <p className="mt-1 text-sm text-stone-600 dark:text-slate-400">
        {copy.progress.calibration.hint}
      </p>
      {calibration.measured && sure && unsure ? (
        <>
          <ul className="mt-2 divide-y divide-stone-200 dark:divide-slate-800">
            <BarRow
              label={copy.progress.calibration.sure}
              value={sure.accuracy}
              tone="good"
              detail={copy.progress.skills.answers(sure.answers)}
            />
            <BarRow
              label={copy.progress.calibration.unsure}
              value={unsure.accuracy}
              tone="warn"
              detail={copy.progress.skills.answers(unsure.answers)}
            />
          </ul>
          <p className="mt-1 text-sm text-stone-600 dark:text-slate-400">
            {calibration.discriminating
              ? copy.progress.calibration.good
              : copy.progress.calibration.weak}
          </p>
        </>
      ) : (
        <p className="mt-2 text-stone-600 dark:text-slate-400">
          {copy.progress.calibration.unknown}
        </p>
      )}
    </section>
  );
};

/** SPEC §2.14: a rolling band that heals, never a streak that breaks. */
const Consistency = ({ report }: { report: ProgressReport }) => (
  <section data-testid="consistency">
    <h2 className="mt-8 text-lg font-bold">{copy.progress.consistency.heading}</h2>
    <div aria-hidden className="mt-2 flex gap-1">
      {Array.from({ length: report.consistency.window }, (_, index) => (
        <div
          key={index}
          className={`h-3 flex-1 rounded-full ${
            index < report.consistency.days
              ? 'bg-teal-700 dark:bg-teal-400'
              : 'bg-stone-200 dark:bg-slate-800'
          }`}
        />
      ))}
    </div>
    <p className="mt-2">
      {copy.progress.consistency.days(report.consistency.days, report.consistency.window)}
    </p>
    <p className="mt-1 text-sm text-stone-500 dark:text-slate-400">
      {copy.progress.consistency.note}
    </p>
  </section>
);

/**
 * SPEC §9's weekly recap — the last §9 line to be built.
 *
 * Every line is a capability. There is no total, no score and no target: a
 * quiet week is a fact here, not a shortfall (§2.14, docs/ETHICS.md). The
 * comparison to last week is a direction and is never labelled good or bad.
 */
const WeeklyRecap = ({ report }: { report: ProgressReport }) => {
  const { recap } = report;
  const lines = [
    recap.met > 0 ? copy.recap.met(recap.met) : null,
    recap.strengthened > 0 ? copy.recap.strengthened(recap.strengthened) : null,
    recap.mastered > 0 ? copy.recap.mastered(recap.mastered) : null,
    recap.drills > 0 ? copy.recap.drills(recap.drills) : null,
  ].filter((line): line is string => line !== null);

  return (
    <section data-testid="recap">
      <h2 className="mt-8 text-lg font-bold">{copy.recap.heading}</h2>
      {recap.hasData ? (
        <>
          <ul className="mt-2 flex flex-col gap-1">
            {lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="mt-2">{copy.recap.days(recap.daysPractised)}</p>
          {recap.previousDaysPractised !== null ? (
            <p className="mt-1 text-sm text-stone-500 dark:text-slate-400">
              {recap.previousDaysPractised === recap.daysPractised
                ? copy.recap.comparedSame
                : copy.recap.comparedMore(recap.previousDaysPractised)}
            </p>
          ) : null}
        </>
      ) : (
        // Invariant 18: the empty state is shown, not hidden — and not dressed
        // up as encouragement.
        <p className="mt-2 text-stone-600 dark:text-slate-400">{copy.recap.empty}</p>
      )}
    </section>
  );
};

// ----------------------------------------------------------------- heatmap

/**
 * SPEC §3.3 step 4: the interference heatmap. Shipped in M4; the rules it holds
 * to are the same ones the rest of this screen follows — no claim under
 * `MIN_ATTEMPTS_TO_CLAIM` answers, no composite score, and "not measured yet"
 * shown rather than hidden.
 */
const Heatmap = ({ rows, drills }: { rows: HeatRow[] | null; drills: number }) => {
  const measured = (rows ?? []).filter((row) => row.standing.measured);
  const ordered = [
    ...measured.sort((a, b) => a.standing.rating - b.standing.rating),
    ...(rows ?? [])
      .filter((row) => !row.standing.measured)
      .sort((a, b) => a.category.id.localeCompare(b.category.id)),
  ];
  const weakest = measured.filter((row) => row.standing.weak).slice(0, 2);

  return (
    <section>
      <h2 className="mt-8 text-lg font-bold">{copy.progress.heatmap.heading}</h2>
      <p className="mt-1 text-sm text-stone-600 dark:text-slate-400">
        {copy.progress.heatmap.intro}
      </p>

      {weakest.length > 0 ? (
        <div className="mt-4 rounded-2xl bg-amber-50 p-4 dark:bg-amber-950" data-testid="heatmap-weakest">
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

      <p className="mt-4 text-sm text-stone-500 dark:text-slate-400">
        {copy.progress.heatmap.attemptsSoFar(drills)}
      </p>
    </section>
  );
};

const HeatmapRow = ({ row }: { row: HeatRow }) => {
  const { standing, category } = row;
  const tone = !standing.measured
    ? 'bg-stone-300 dark:bg-slate-700'
    : standing.weak
      ? 'bg-amber-500 dark:bg-amber-400'
      : 'bg-teal-600 dark:bg-teal-400';

  return (
    <li className="rounded-2xl border-2 border-stone-200 p-3 dark:border-slate-800">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-semibold">{category.label}</span>
        <span className="text-xs text-stone-500 dark:text-slate-400">
          {copy.progress.heatmap.kinds[category.kind]}
        </span>
      </div>

      {standing.measured ? (
        <>
          <div aria-hidden className="mt-2 h-2 overflow-hidden rounded-full bg-stone-200 dark:bg-slate-800">
            <div
              className={`h-2 rounded-full motion-safe:transition-all ${tone}`}
              style={{ width: `${percent(standing.expected)}%` }}
            />
          </div>
          <p className="mt-1 text-sm text-stone-600 dark:text-slate-400">
            {copy.progress.heatmap.accuracy(standing.correct, standing.attempts)}
            {standing.weak ? '' : ` · ${copy.progress.heatmap.solid}`}
          </p>
        </>
      ) : (
        <p className="mt-2 text-sm text-stone-500 dark:text-slate-400">
          {copy.progress.heatmap.notMeasured}
          {' · '}
          {copy.progress.heatmap.notMeasuredHint(MIN_ATTEMPTS_TO_CLAIM - standing.attempts)}
        </p>
      )}
    </li>
  );
};
