import { useEffect, useState } from 'react';
import { copy } from '../../i18n/id.ts';
import { Button } from '../../ui/Button.tsx';
import { Screen } from '../../ui/Screen.tsx';

/**
 * The attribution screen (SPEC §5.2).
 *
 * **This is a licence condition, not a courtesy.** EDRDG's terms require that an
 * application using JMdict, KANJIDIC2 or KRADFILE acknowledge the usage and
 * source in its documentation or UI, and — where dictionary content is displayed
 * on screen — on each such screen, unless the material is mixed with other
 * sources, in which case a general acknowledgement suffices. LinguaKu's Japanese
 * content mixes Tatoeba sentences with EDRDG readings and kanji data, so this
 * screen is that general acknowledgement, and it has to exist before the app
 * ships a single Japanese card.
 *
 * It renders from `data/licenses.json` — the same file the CI gate checks — so
 * a dataset cannot enter the build without also appearing here. Hardcoding the
 * list would let the two drift, and the one that drifts silently is the legal
 * one.
 *
 * Only `datasets` are shown. `candidates` are explicitly **not cleared for use**
 * and nothing derived from them is in the build, so attributing them would claim
 * a provenance the app does not have.
 */

interface Dataset {
  key: string;
  name: string;
  url: string;
  use: string;
  license: string;
  licenseUrl: string;
  attributionRequired: boolean;
  shareAlike: boolean;
  verifiedOn: string;
  notes?: string;
}

export const AttributionScreen = ({ onBack }: { onBack: () => void }) => {
  const [datasets, setDatasets] = useState<Dataset[] | null>(null);

  useEffect(() => {
    void (async () => {
      // Lazily imported: this screen is rarely opened and the manifest has no
      // business in the initial bundle (invariant 6).
      const manifest = (await import('../../../data/licenses.json')) as unknown as {
        default: { datasets: Dataset[] };
      };
      setDatasets(manifest.default.datasets);
    })();
  }, []);

  return (
    <Screen footer={<Button onClick={onBack}>{copy.attribution.back}</Button>}>
      <h1 className="text-2xl font-bold">{copy.attribution.heading}</h1>
      <p className="mt-2 text-stone-600 dark:text-slate-400">{copy.attribution.intro}</p>

      <ul className="mt-6 flex flex-col gap-4" data-testid="attribution-list">
        {(datasets ?? []).map((dataset) => (
          <li
            key={dataset.key}
            className="rounded-2xl border-2 border-stone-200 p-4 dark:border-slate-800"
          >
            <h2 className="font-bold">{dataset.name}</h2>
            <p className="mt-1 text-sm text-stone-600 dark:text-slate-400">{dataset.use}</p>

            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="text-stone-500 dark:text-slate-400">{copy.attribution.licenseLabel}</dt>
              <dd>
                <a
                  href={dataset.licenseUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-teal-800 underline underline-offset-2 dark:text-teal-300"
                >
                  {dataset.license}
                </a>
                {dataset.shareAlike ? (
                  <span className="ml-2 rounded bg-stone-100 px-1.5 py-0.5 text-xs text-stone-600 dark:bg-slate-800 dark:text-slate-400">
                    {copy.attribution.shareAlike}
                  </span>
                ) : null}
              </dd>

              <dt className="text-stone-500 dark:text-slate-400">{copy.attribution.sourceLabel}</dt>
              <dd className="break-all">
                <a
                  href={dataset.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-teal-800 underline underline-offset-2 dark:text-teal-300"
                >
                  {dataset.url}
                </a>
              </dd>

              {/* SPEC §5.2: licences drift, so the date we read them is part of
                  the claim rather than a footnote. */}
              <dt className="text-stone-500 dark:text-slate-400">
                {copy.attribution.verifiedLabel}
              </dt>
              <dd className="tabular-nums">{dataset.verifiedOn}</dd>
            </dl>
          </li>
        ))}
      </ul>

      <p className="mt-6 text-sm text-stone-500 dark:text-slate-400">
        {copy.attribution.shareAlikeNote}
      </p>
    </Screen>
  );
};
