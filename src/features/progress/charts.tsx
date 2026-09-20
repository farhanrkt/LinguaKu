import type { ReactNode } from 'react';

/**
 * The chart primitives SPEC §9 needs, as inline SVG.
 *
 * No charting library. The whole initial bundle budget is 200 KB gzipped
 * (invariant 6) and the smallest credible chart library is a meaningful slice of
 * it — for five small figures that are bars, a polygon and a marker. Everything
 * here is under a hundred lines and renders from plain numbers.
 *
 * Two rules the components enforce rather than leave to callers:
 *
 *  - **`null` is not zero.** Every component takes `number | null` for a value
 *    and draws an explicit gap for null, because SPEC §2.15's ban on fake
 *    precision is easiest to break by letting "not measured" render as an empty
 *    bar that looks like "measured, and you scored nothing".
 *  - **Charts are decoration; the text is the message.** Every figure is
 *    `aria-hidden` and paired with a real sentence, so nothing here is the only
 *    way to read a number.
 */

const pct = (value: number): number => Math.round(value * 100);

// ------------------------------------------------------------------- bars

export interface BarRowProps {
  label: string;
  /** 0..1, or null for "not measured". */
  value: number | null;
  detail: string;
  tone?: 'default' | 'warn' | 'good';
  /** A lighter bar behind the main one — e.g. how much of a band was sampled. */
  backdrop?: number;
}

export const BarRow = ({ label, value, detail, tone = 'default', backdrop }: BarRowProps) => {
  const fill =
    tone === 'warn'
      ? 'bg-amber-500 dark:bg-amber-400'
      : tone === 'good'
        ? 'bg-teal-600 dark:bg-teal-400'
        : 'bg-teal-700 dark:bg-teal-400';

  return (
    <li className="py-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-semibold">{label}</span>
        <span className="text-sm text-stone-600 tabular-nums dark:text-slate-400">
          {value === null ? '—' : `${pct(value)}%`}
        </span>
      </div>
      <div
        aria-hidden
        className="relative mt-1 h-2 overflow-hidden rounded-full bg-stone-200 dark:bg-slate-800"
      >
        {backdrop !== undefined ? (
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-stone-300 dark:bg-slate-700"
            style={{ width: `${pct(Math.min(1, backdrop))}%` }}
          />
        ) : null}
        {value === null ? null : (
          <div
            className={`absolute inset-y-0 left-0 rounded-full motion-safe:transition-all ${fill}`}
            style={{ width: `${pct(value)}%` }}
          />
        )}
      </div>
      <p className="mt-1 text-sm text-stone-500 dark:text-slate-400">{detail}</p>
    </li>
  );
};

// ---------------------------------------------------------------- forecast

export interface ColumnsProps {
  values: readonly number[];
  labelFor: (index: number) => string;
  emptyLabel: string;
}

/** The 14-day workload forecast (SPEC §9). */
export const Columns = ({ values, labelFor, emptyLabel }: ColumnsProps) => {
  const peak = Math.max(1, ...values);
  if (values.every((value) => value === 0)) {
    return <p className="text-sm text-stone-500 dark:text-slate-400">{emptyLabel}</p>;
  }

  return (
    <div className="mt-2 flex items-end gap-1" data-testid="forecast">
      {values.map((value, index) => (
        <div key={index} className="flex flex-1 flex-col items-center gap-1">
          <div
            aria-hidden
            className="w-full rounded-t bg-teal-700 motion-safe:transition-all dark:bg-teal-400"
            style={{ height: `${Math.max(2, (value / peak) * 56)}px` }}
          />
          <span className="text-[10px] text-stone-500 tabular-nums dark:text-slate-400">
            {labelFor(index)}
          </span>
          <span className="sr-only">{value}</span>
        </div>
      ))}
    </div>
  );
};

// ------------------------------------------------------------------- radar

export interface RadarAxis {
  label: string;
  /** 0..1, or null when never measured — drawn as a gap, never as zero. */
  value: number | null;
}

/**
 * SPEC §9's skill radar. Axes that have never been measured are drawn as an
 * empty spoke with a hollow marker, not as a point at the origin: a polygon
 * pulled to zero would read as "you scored nothing at listening" when the truth
 * is that listening has never been tested.
 */
export const Radar = ({ axes, size = 200 }: { axes: readonly RadarAxis[]; size?: number }) => {
  const centre = size / 2;
  const radius = centre - 28;
  const at = (index: number, distance: number) => {
    const angle = (Math.PI * 2 * index) / axes.length - Math.PI / 2;
    return [centre + Math.cos(angle) * distance, centre + Math.sin(angle) * distance] as const;
  };

  const measured = axes.filter((axis) => axis.value !== null);
  // A polygon needs three corners to be a shape; below that, the spokes say it.
  const polygon =
    measured.length >= 3
      ? axes
          .map((axis, index) =>
            axis.value === null ? null : at(index, radius * Math.max(0.04, axis.value)).join(','),
          )
          .filter((point): point is string => point !== null)
          .join(' ')
      : null;

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="mx-auto mt-2 w-full max-w-[240px]"
      role="img"
      aria-hidden
    >
      {[0.25, 0.5, 0.75, 1].map((ring) => (
        <circle
          key={ring}
          cx={centre}
          cy={centre}
          r={radius * ring}
          className="fill-none stroke-stone-200 dark:stroke-slate-800"
          strokeWidth={1}
        />
      ))}
      {axes.map((axis, index) => {
        const [x, y] = at(index, radius);
        return (
          <line
            key={axis.label}
            x1={centre}
            y1={centre}
            x2={x}
            y2={y}
            className="stroke-stone-200 dark:stroke-slate-800"
            strokeWidth={1}
          />
        );
      })}
      {polygon ? (
        <polygon
          points={polygon}
          className="fill-teal-600/25 stroke-teal-700 dark:fill-teal-400/25 dark:stroke-teal-400"
          strokeWidth={2}
        />
      ) : null}
      {axes.map((axis, index) => {
        const [x, y] = at(index, radius * (axis.value ?? 1));
        return axis.value === null ? (
          <circle
            key={axis.label}
            cx={at(index, radius)[0]}
            cy={at(index, radius)[1]}
            r={3}
            className="fill-none stroke-stone-300 dark:stroke-slate-700"
            strokeWidth={1.5}
          />
        ) : (
          <circle
            key={axis.label}
            cx={x}
            cy={y}
            r={3}
            className="fill-teal-700 dark:fill-teal-400"
          />
        );
      })}
    </svg>
  );
};

// ------------------------------------------------------------ target meter

/**
 * A measured rate against a target, with its confidence interval. The interval
 * is the point: SPEC §9 asks whether retention is *off target*, and a bare point
 * estimate cannot answer that.
 */
export const TargetMeter = ({
  value,
  low,
  high,
  target,
  children,
}: {
  value: number;
  low: number;
  high: number;
  target: number;
  children?: ReactNode;
}) => (
  <div>
    <div
      aria-hidden
      className="relative mt-2 h-6 overflow-hidden rounded-full bg-stone-200 dark:bg-slate-800"
    >
      <div
        className="absolute inset-y-0 rounded-full bg-teal-600/40 dark:bg-teal-400/40"
        style={{ left: `${pct(low)}%`, width: `${pct(high - low)}%` }}
      />
      <div
        className="absolute inset-y-0 w-1 rounded bg-teal-800 dark:bg-teal-300"
        style={{ left: `calc(${pct(value)}% - 2px)` }}
      />
      <div
        className="absolute inset-y-0 w-0.5 bg-stone-900 dark:bg-slate-100"
        style={{ left: `${pct(target)}%` }}
      />
    </div>
    {children}
  </div>
);
