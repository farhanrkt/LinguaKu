import { useEffect, useRef, useState } from 'react';
import { copy } from '../../i18n/id.ts';
import { Button } from '../../ui/Button.tsx';
import { OptionCard } from '../../ui/OptionCard.tsx';
import type { Confidence } from '../../data/types.ts';
import type { Task } from './task.ts';

export interface AnswerPayload {
  raw: string;
  confidence: Confidence | null;
}

interface TaskProps {
  task: Task;
  onAnswer: (payload: AnswerPayload) => void;
  onPlayAudio: () => void;
  audioAvailable: boolean;
}

const AudioButton = ({ onPlay, available }: { onPlay: () => void; available: boolean }) =>
  available ? (
    <button
      type="button"
      onClick={onPlay}
      className="mt-3 flex w-fit min-h-12 items-center gap-2 rounded-full border-2 border-stone-300 px-4 font-semibold text-teal-800 motion-safe:transition-colors hover:border-teal-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 dark:border-slate-700 dark:text-teal-300 dark:focus-visible:outline-teal-300"
    >
      <span aria-hidden>🔊</span>
      {copy.session.audio.play}
    </button>
  ) : (
    // SPEC §2.6: say that audio is missing rather than pretending it is there.
    <p className="mt-3 text-sm text-stone-500 dark:text-slate-500">
      {copy.session.audio.unavailable}
    </p>
  );

/** L0 — errorless first exposure. Nothing is being tested yet. */
export const ExposureTask = ({ task, onAnswer, onPlayAudio, audioAvailable }: TaskProps) => (
  <div>
    <p className="text-sm font-semibold tracking-wide text-teal-800 uppercase dark:text-teal-300">
      {copy.session.exposure.heading}
    </p>
    <p className="mt-1 text-sm text-stone-600 dark:text-slate-400">
      {copy.session.exposure.instruction}
    </p>

    <p className="mt-6 text-2xl leading-snug font-bold">{task.sentence.text}</p>
    <p className="mt-2 text-lg text-stone-600 dark:text-slate-400">{task.translation}</p>
    <p className="mt-4">
      <span className="inline-block rounded-lg bg-teal-50 px-3 py-1 font-semibold text-teal-900 dark:bg-teal-950 dark:text-teal-200">
        {task.headword}
      </span>
    </p>

    <AudioButton onPlay={onPlayAudio} available={audioAvailable} />

    <div className="mt-8">
      <Button onClick={() => onAnswer({ raw: task.headword, confidence: null })}>
        {copy.session.exposure.confirm}
      </Button>
    </div>
  </div>
);

/** L1 — recognition. Distractors come from the same frequency band (§2.3). */
export const RecognitionTask = ({ task, onAnswer, onPlayAudio, audioAvailable }: TaskProps) => (
  <div>
    <p className="text-sm font-semibold tracking-wide text-teal-800 uppercase dark:text-teal-300">
      {copy.session.recognition.heading}
    </p>

    <p className="mt-4 text-2xl leading-snug font-bold">{task.sentence.text}</p>
    <AudioButton onPlay={onPlayAudio} available={audioAvailable} />

    <div className="mt-6 flex flex-col gap-3">
      {(task.options ?? []).map((option) => (
        <OptionCard
          key={option}
          label={option}
          selected={false}
          onToggle={() => onAnswer({ raw: option, confidence: null })}
        />
      ))}
    </div>
  </div>
);

/** L2/L3 — contextual production, with or without the Indonesian support. */
export const ClozeTask = ({ task, onAnswer, onPlayAudio, audioAvailable }: TaskProps) => {
  const [value, setValue] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const supported = task.kind === 'cloze-supported';

  // Focus on mount. The component is keyed by item, so a new task remounts it
  // and the field clears itself — no state reset needed.
  useEffect(() => {
    input.current?.focus();
  }, []);

  const submit = (confidence: Confidence) => {
    if (value.trim().length === 0) return;
    onAnswer({ raw: value, confidence });
  };

  return (
    <div>
      <p className="text-sm font-semibold tracking-wide text-teal-800 uppercase dark:text-teal-300">
        {supported ? copy.session.cloze.supported : copy.session.cloze.unaided}
      </p>

      <p className="mt-4 text-2xl leading-snug font-bold">
        {task.cloze?.before}
        <span className="mx-1 inline-block min-w-24 border-b-4 border-teal-700 align-bottom dark:border-teal-400">
          &nbsp;
        </span>
        {task.cloze?.after}
      </p>

      {supported ? (
        <p className="mt-2 text-lg text-stone-600 dark:text-slate-400">{task.translation}</p>
      ) : null}

      <AudioButton onPlay={onPlayAudio} available={audioAvailable} />

      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit('yakin');
        }}
      >
        <input
          ref={input}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          aria-label={copy.session.cloze.placeholder}
          placeholder={copy.session.cloze.placeholder}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="mt-6 min-h-14 w-full rounded-2xl border-2 border-stone-300 px-4 text-lg focus-visible:border-teal-700 focus-visible:outline-none dark:border-slate-700 dark:bg-slate-900 dark:focus-visible:border-teal-400"
        />

        {/* SPEC §2.12: the confidence signal *is* the submit button, so asking
            for it costs the learner nothing. */}
        <div className="mt-4 flex gap-3">
          <Button type="submit" disabled={value.trim().length === 0}>
            {copy.session.cloze.sure}
          </Button>
          <Button
            variant="quiet"
            disabled={value.trim().length === 0}
            onClick={() => submit('ragu')}
            className="border-2 border-stone-300 dark:border-slate-700"
          >
            {copy.session.cloze.unsure}
          </Button>
        </div>
      </form>
    </div>
  );
};
