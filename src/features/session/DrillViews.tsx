import { useEffect, useRef, useState } from 'react';
import { copy } from '../../i18n/id.ts';
import { Button } from '../../ui/Button.tsx';
import { OptionCard } from '../../ui/OptionCard.tsx';
import type { Category } from '../../data/contrastive.ts';
import type { DrillTask } from './drill.ts';

/**
 * The contrastive drill (SPEC §3.3) and the note that follows it (SPEC §2.9).
 *
 * The note is shown on a **right** answer as well as a wrong one. Getting it
 * right by feel and getting it right because you know why are different states,
 * and the note is cheap; withholding it until failure would make the
 * explanation feel like a penalty.
 */

interface DrillProps {
  task: DrillTask;
  onAnswer: (raw: string) => void;
  onPlayAudio: () => void;
  /** A drill answer is already being written — one tap is one `DrillAttempt`. */
  busy?: boolean;
}

export const DrillPrompt = ({ task, onAnswer, onPlayAudio, busy }: DrillProps) => {
  const [value, setValue] = useState('');
  const input = useRef<HTMLInputElement>(null);
  // Cloze and correction are both typed; only the instruction differs, because
  // a correction asks for the whole sentence back rather than one word.
  const correction = task.drill.type === 'correction';
  const typed = task.drill.type === 'cloze' || correction;

  useEffect(() => {
    if (typed) input.current?.focus();
  }, [typed]);

  return (
    <div>
      <p className="text-sm font-semibold tracking-wide text-teal-800 uppercase dark:text-teal-300">
        {copy.session.drill.heading}
      </p>
      <p className="mt-1 text-sm text-stone-500 dark:text-slate-400">{task.category.label}</p>

      {/* SPEC §8's "perbaiki kalimat ini". The instruction has to come first:
          a wrong sentence shown without it reads as something to copy. */}
      {correction ? (
        <p className="mt-4 text-sm text-stone-600 dark:text-slate-400">
          {copy.session.drill.correctionInstruction}
        </p>
      ) : null}

      <p
        className={`mt-5 text-xl leading-snug font-bold ${
          correction ? 'text-stone-500 line-through decoration-stone-400 dark:text-slate-400' : ''
        }`}
        data-testid="drill-prompt"
      >
        {task.drill.prompt}
      </p>

      {task.drill.audio ? (
        <button
          type="button"
          onClick={onPlayAudio}
          data-testid="drill-play"
          className="mt-5 flex min-h-16 w-full items-center justify-center gap-3 rounded-2xl bg-teal-700 text-lg font-semibold text-white motion-safe:transition-colors hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 dark:bg-teal-500 dark:text-slate-950 dark:hover:bg-teal-400"
        >
          <span aria-hidden>🔊</span>
          {copy.session.dictation.replay}
        </button>
      ) : null}

      {typed ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (value.trim().length > 0) onAnswer(value);
          }}
        >
          <input
            ref={input}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            aria-label={
              correction ? copy.session.drill.correctionPlaceholder : copy.session.drill.typePlaceholder
            }
            placeholder={
              correction ? copy.session.drill.correctionPlaceholder : copy.session.drill.typePlaceholder
            }
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="mt-6 min-h-14 w-full rounded-2xl border-2 border-stone-300 px-4 text-lg focus-visible:border-teal-700 focus-visible:outline-none dark:border-slate-700 dark:bg-slate-900 dark:focus-visible:border-teal-400"
          />
          <div className="mt-4">
            <Button type="submit" disabled={value.trim().length === 0 || busy === true}>
              {copy.session.drill.submit}
            </Button>
          </div>
        </form>
      ) : (
        <div className="mt-6 flex flex-col gap-3">
          {task.options.map((option) => (
            <OptionCard
              key={option}
              label={option}
              selected={false}
              disabled={busy === true}
              onToggle={() => onAnswer(option)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * SPEC §2.9: the contrastive note, in Indonesian — what the L1 pattern is, why
 * English differs, and one minimal pair. In that order, because naming the
 * Indonesian pattern first is what tells the learner the mistake is systematic
 * rather than careless.
 */
export const ContrastiveNote = ({
  category,
  explain,
}: {
  category: Category;
  /**
   * The item-specific line. A drill has one; an error caught in an ordinary
   * review does not, and the category's own summary stands in.
   */
  explain?: string;
}) => {
  const { note } = category;
  return (
    <div
      className="rounded-2xl bg-stone-100 p-4 text-sm dark:bg-slate-900"
      data-testid="contrastive-note"
    >
      <p className="font-semibold text-stone-900 dark:text-slate-100">
        {explain ?? category.summary}
      </p>

      <p className="mt-3 font-semibold text-stone-500 dark:text-slate-400">
        {copy.session.drill.l1Heading}
      </p>
      <p className="text-stone-700 dark:text-slate-300">{note.l1}</p>

      <p className="mt-3 font-semibold text-stone-500 dark:text-slate-400">
        {copy.session.drill.targetHeading}
      </p>
      <p className="text-stone-700 dark:text-slate-300">{note.target}</p>

      <div className="mt-3 rounded-xl bg-white p-3 dark:bg-slate-950">
        <p className="font-semibold text-stone-500 dark:text-slate-400">
          {copy.session.drill.pairHeading}
        </p>
        <p className="mt-1 text-stone-500 line-through dark:text-slate-400">
          {note.minimalPair.wrong}
        </p>
        <p className="font-semibold text-teal-800 dark:text-teal-300">{note.minimalPair.right}</p>
        <p className="mt-1 text-stone-600 dark:text-slate-400">{note.minimalPair.gloss}</p>
      </div>

      {note.tip ? (
        <>
          <p className="mt-3 font-semibold text-stone-500 dark:text-slate-400">
            {copy.session.drill.tipHeading}
          </p>
          <p className="text-stone-700 dark:text-slate-300">{note.tip}</p>
        </>
      ) : null}
    </div>
  );
};
