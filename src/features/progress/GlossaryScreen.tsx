import { useEffect, useState } from 'react';
import { copy } from '../../i18n/id.ts';
import { Button } from '../../ui/Button.tsx';
import { Screen } from '../../ui/Screen.tsx';
import {
  buildGlossary,
  type GlossaryEntry,
  type GlossaryStrength,
} from '../../data/repositories/glossary.ts';
import {
  activeDeferrals,
  undeferItem,
  type Deferral,
} from '../../data/repositories/deferrals.ts';
import type { Profile } from '../../data/types.ts';

/**
 * Everything the learner has met, browsable (SPEC §2.2, §2.14).
 *
 * §2.2 bans browsing as a *study activity* and permits exactly this in the same
 * sentence: *"a passive glossary is fine, but it does not create or advance
 * cards."* So there is no answer button anywhere on this screen, and the query
 * behind it is a read that cannot reach `recordReview` (invariant 0).
 *
 * It exists because the progress screen could say *"kamu mengenali sekitar
 * 1.200 kata"* and never show one of them. Competence you cannot look at is a
 * claim; competence you can scroll through is evidence — which is the whole
 * §2.14 framing, applied to the thing the learner is actually accumulating.
 *
 * Strongest first, so opening it shows what they have secured rather than what
 * they are currently failing.
 */

interface GlossaryScreenProps {
  profile: Profile;
  onBack: () => void;
}

const TONE: Record<GlossaryStrength, string> = {
  mastered: 'bg-teal-100 text-teal-900 dark:bg-teal-900 dark:text-teal-100',
  known: 'bg-teal-50 text-teal-900 dark:bg-teal-950 dark:text-teal-200',
  weak: 'bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100',
  leech: 'bg-stone-100 text-stone-700 dark:bg-slate-900 dark:text-slate-300',
};

const Entry = ({ entry }: { entry: GlossaryEntry }) => {
  const [open, setOpen] = useState(false);

  return (
    <li className="border-b border-stone-200 py-3 dark:border-slate-800">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="flex w-full items-baseline justify-between gap-3 text-left"
      >
        <span>
          <span className="text-lg font-semibold">{entry.headword}</span>
          {entry.reading ? (
            <span className="ml-2 text-sm text-stone-500 dark:text-slate-400">{entry.reading}</span>
          ) : null}
          {entry.gloss ? (
            <span className="ml-2 text-stone-600 dark:text-slate-400">{entry.gloss}</span>
          ) : null}
        </span>
        <span className={`shrink-0 rounded-lg px-2 py-1 text-xs font-semibold ${TONE[entry.strength]}`}>
          {copy.glossary.strength[entry.strength]}
        </span>
      </button>

      {open ? (
        <div className="mt-2 text-sm text-stone-600 dark:text-slate-400">
          {entry.example ? (
            <p>
              {entry.example.text}
              <span className="mt-1 block text-stone-500 dark:text-slate-400">
                {entry.example.translation}
              </span>
            </p>
          ) : null}
          {/* No gloss is a normal state, not a defect: coverage is 30% of
              English and 4% of Japanese, measured (D59). */}
          {entry.gloss ? null : <p className="mt-1">{copy.glossary.noGloss}</p>}
          <p className="mt-1">{copy.glossary.band(entry.band)}</p>
        </div>
      ) : null}
    </li>
  );
};

const DAY = 86_400_000;

/**
 * The words the learner set aside, and the way back (SPEC §2.14).
 *
 * A skip is a request — *not this, not now* — and it buries the word for 3 days
 * the first time and 60 by the fourth. `undeferItem` has existed for a learner
 * who changes their mind since v1.1.0 and nothing called it, so a mis-tap was
 * irreversible for up to two months.
 *
 * It lives here rather than in the session, because the session is where the
 * mistake is made and an answered card retires (invariant 39) — a control that
 * reaches back into a card that is gone is exactly the kind of second code path
 * D77 refuses. This is a list, and a list is the honest place to undo something.
 */
const Deferrals = ({
  rows,
  now,
  onRestore,
}: {
  rows: readonly Deferral[];
  /**
   * Captured when the list was read, not read during render: `Date.now()` in a
   * component body is an impure call and the React compiler rejects it — the
   * same rule that moved `SwipeCard`'s threshold out of render (D77).
   */
  now: number;
  onRestore: (itemId: string) => void;
}) => {
  if (rows.length === 0) return null;
  return (
    <section className="mt-10" data-testid="deferred">
      <h2 className="text-lg font-bold">{copy.glossary.deferred.heading}</h2>
      <p className="mt-1 text-sm text-stone-600 dark:text-slate-400">
        {copy.glossary.deferred.intro}
      </p>
      <ul className="mt-3 flex flex-col gap-2">
        {rows.map((row) => (
          <li
            key={row.itemId}
            className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border-2 border-stone-200 px-4 py-2 dark:border-slate-800"
          >
            <span>
              <span className="block font-semibold">{row.headword}</span>
              <span className="block text-sm text-stone-600 dark:text-slate-400">
                {copy.glossary.deferred.until(Math.ceil((row.until - now) / DAY))}
              </span>
            </span>
            <button
              type="button"
              onClick={() => onRestore(row.itemId)}
              data-testid="deferred-restore"
              className="min-h-12 shrink-0 rounded-2xl border-2 border-teal-700 px-4 font-semibold text-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 motion-safe:transition-colors dark:border-teal-400 dark:text-teal-300"
            >
              {copy.glossary.deferred.restore}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
};

export const GlossaryScreen = ({ profile, onBack }: GlossaryScreenProps) => {
  const [search, setSearch] = useState('');
  const [state, setState] = useState<{ entries: GlossaryEntry[]; total: number } | null>(null);
  const [deferrals, setDeferrals] = useState<{ rows: Deferral[]; now: number }>({
    rows: [],
    now: 0,
  });

  useEffect(() => {
    let live = true;
    void buildGlossary(profile.id, profile.targets[0] ?? 'en', Date.now(), { search }).then(
      (result) => {
        if (live) setState(result);
      },
    );
    return () => {
      live = false;
    };
  }, [profile.id, profile.targets, search]);

  useEffect(() => {
    let live = true;
    const now = Date.now();
    void activeDeferrals(profile.id, now).then((rows) => {
      if (live) setDeferrals({ rows, now });
    });
    return () => {
      live = false;
    };
  }, [profile.id]);

  const restore = (itemId: string) => {
    // Optimistic, and safe to be: the row is only ever removed from this list,
    // and a failed write would simply leave the word deferred — which is the
    // state the learner already had.
    setDeferrals((current) => ({
      ...current,
      rows: current.rows.filter((row) => row.itemId !== itemId),
    }));
    void undeferItem(profile.id, itemId, Date.now());
  };

  return (
    <Screen footer={<Button onClick={onBack}>{copy.progress.back}</Button>}>
      <h1 className="text-2xl font-bold">{copy.glossary.heading}</h1>
      <p className="mt-1 text-sm text-stone-600 dark:text-slate-400">{copy.glossary.intro}</p>

      <label className="mt-5 block">
        <span className="sr-only">{copy.glossary.search}</span>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={copy.glossary.search}
          data-testid="glossary-search"
          autoComplete="off"
          className="min-h-14 w-full rounded-2xl border-2 border-stone-300 px-4 text-base dark:border-slate-700 dark:bg-slate-950"
        />
      </label>

      {state === null ? (
        <p className="mt-6 text-stone-600 dark:text-slate-400">{copy.progress.notYet}</p>
      ) : state.total === 0 ? (
        <p className="mt-6 text-stone-600 dark:text-slate-400" data-testid="glossary-empty">
          {search.length > 0 ? copy.glossary.noMatch : copy.glossary.empty}
        </p>
      ) : (
        <>
          <p className="mt-4 text-sm text-stone-500 dark:text-slate-400" data-testid="glossary-count">
            {copy.glossary.count(state.total)}
          </p>
          <ul className="mt-2" data-testid="glossary-list">
            {state.entries.map((entry) => (
              <Entry key={entry.itemId} entry={entry} />
            ))}
          </ul>
          {state.total > state.entries.length ? (
            <p className="mt-3 text-sm text-stone-500 dark:text-slate-400">
              {copy.glossary.more(state.total - state.entries.length)}
            </p>
          ) : null}
        </>
      )}

      {/* Outside the search-dependent branch: a learner looking for a word they
          set aside should find this whether or not the glossary has entries. */}
      <Deferrals rows={deferrals.rows} now={deferrals.now} onRestore={restore} />
    </Screen>
  );
};
