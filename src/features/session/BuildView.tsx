import { useState } from 'react';
import { copy } from '../../i18n/id.ts';
import { Button } from '../../ui/Button.tsx';
import type { BuildTile } from '../../core/sentenceBuild.ts';
import type { BuildTask } from './build.ts';

/**
 * SPEC §3.1 `NP_WORD_ORDER` — rebuild the sentence from its words.
 *
 * Every other card in the catalog asks for *a word*. This one asks for an
 * **order**, which §3.1 names as a systematic Indonesian-L1 error rather than a
 * careless one: Indonesian is head-initial, so *mobil merah* comes out as "a
 * car red". It is also the only card whose interaction is tapping tiles, which
 * is the point — a session where every card presents identically reads as
 * unstructured however varied the pedagogy underneath it is.
 */

interface BuildViewProps {
  task: BuildTask;
  lang: string;
  onAnswer: (assembled: string[]) => void;
  busy?: boolean;
}

export const BuildView = ({ task, lang, onAnswer, busy }: BuildViewProps) => {
  /** Tile ids in the order the learner tapped them. */
  const [placed, setPlaced] = useState<string[]>([]);

  const byId = new Map(task.puzzle.tiles.map((tile) => [tile.id, tile]));
  const chosen = placed.flatMap((id) => {
    const tile = byId.get(id);
    return tile ? [tile] : [];
  });
  const remaining = task.puzzle.tiles.filter((tile) => !placed.includes(tile.id));

  const tileClass =
    'min-h-12 rounded-xl border-2 border-stone-300 bg-white px-3 py-2 font-semibold ' +
    'motion-safe:transition-colors hover:border-teal-700 ' +
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ' +
    'disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:focus-visible:outline-teal-300';

  return (
    <div>
      <p className="text-sm font-semibold tracking-wide text-teal-800 uppercase dark:text-teal-300">
        {copy.session.build.heading}
      </p>
      <p className="mt-1 text-sm text-stone-600 dark:text-slate-400">
        {copy.session.build.instruction}
      </p>

      {/* What they are rebuilding: the Indonesian, which is the only thing on
          screen that is not part of the answer. */}
      <p className="mt-5 text-xl leading-snug font-bold" data-testid="build-prompt">
        {task.prompt}
      </p>

      {/* The sentence so far. Keeps its height when empty so the tiles below do
          not jump up the screen on the first tap. */}
      <div
        className="mt-4 flex min-h-20 flex-wrap content-start gap-2 rounded-2xl border-2 border-dashed border-stone-300 p-3 dark:border-slate-700"
        data-testid="build-answer"
      >
        {chosen.length === 0 ? (
          <p className="text-sm text-stone-500 dark:text-slate-400">{copy.session.build.empty}</p>
        ) : (
          chosen.map((tile) => (
            <button
              key={tile.id}
              type="button"
              disabled={busy === true}
              onClick={() => setPlaced((current) => current.filter((id) => id !== tile.id))}
              className={tileClass}
              data-testid="build-placed"
            >
              {tile.text}
            </button>
          ))
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2" data-testid="build-tiles">
        {remaining.map((tile: BuildTile) => (
          <button
            key={tile.id}
            type="button"
            disabled={busy === true}
            onClick={() => setPlaced((current) => [...current, tile.id])}
            className={tileClass}
            data-testid="build-tile"
          >
            {tile.text}
          </button>
        ))}
      </div>

      <p className="mt-3 text-sm text-stone-500 dark:text-slate-400">
        {copy.session.build.hint}
      </p>

      <div className="mt-4">
        <Button
          onClick={() => onAnswer(chosen.map((tile) => tile.text))}
          disabled={chosen.length === 0 || busy === true}
          data-testid="build-submit"
        >
          {copy.session.build.submit}
        </Button>
      </div>

      <p className="mt-3 text-sm text-stone-600 dark:text-slate-400">
        {lang === 'ja' ? copy.session.build.whyJa : copy.session.build.why}
      </p>
    </div>
  );
};
