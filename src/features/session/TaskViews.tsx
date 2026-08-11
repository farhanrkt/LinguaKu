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

/**
 * L4 — audio-only dictation (SPEC §2.3).
 *
 * The sentence text is deliberately absent: the whole rung exists to test
 * phonological form, and showing the words would turn it into a copying
 * exercise. An item only reaches this view when audio for it is genuinely
 * available (SPEC §2.6), so there is no "no audio" branch to fall back to.
 */
export const DictationTask = ({ onAnswer, onPlayAudio }: TaskProps) => {
  const [value, setValue] = useState('');
  const input = useRef<HTMLInputElement>(null);

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
        {copy.session.dictation.heading}
      </p>
      <p className="mt-1 text-sm text-stone-600 dark:text-slate-400">
        {copy.session.dictation.instruction}
      </p>

      <button
        type="button"
        onClick={onPlayAudio}
        data-testid="dictation-play"
        className="mt-6 flex min-h-16 w-full items-center justify-center gap-3 rounded-2xl bg-teal-700 text-lg font-semibold text-white motion-safe:transition-colors hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 dark:bg-teal-500 dark:text-slate-950 dark:hover:bg-teal-400"
      >
        <span aria-hidden>🔊</span>
        {copy.session.dictation.replay}
      </button>

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
          aria-label={copy.session.dictation.placeholder}
          placeholder={copy.session.dictation.placeholder}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="mt-6 min-h-14 w-full rounded-2xl border-2 border-stone-300 px-4 text-lg focus-visible:border-teal-700 focus-visible:outline-none dark:border-slate-700 dark:bg-slate-900 dark:focus-visible:border-teal-400"
        />
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

/**
 * The kanji card (SPEC §2.11): component breakdown, readings, and a mnemonic the
 * learner can rewrite.
 *
 * The editable field is the point, not a nicety. §2.11's finding is that
 * self-generated mnemonics are stronger than given ones, so the baseline is
 * deliberately thin and the copy invites replacing it.
 */
export const KanjiTask = ({
  task,
  onAnswer,
  onSaveMnemonic,
}: TaskProps & { onSaveMnemonic: (text: string) => Promise<void> }) => {
  const face = task.kanji;
  const [text, setText] = useState(face?.mnemonic ?? '');
  const [saved, setSaved] = useState(false);
  if (!face) return null;

  return (
    <div>
      <p className="text-sm font-semibold tracking-wide text-teal-800 uppercase dark:text-teal-300">
        {copy.session.kanji.heading}
      </p>
      <p className="mt-1 text-sm text-stone-600 dark:text-slate-400">
        {copy.session.kanji.instruction}
      </p>

      <p className="mt-6 text-center text-7xl leading-none font-bold" data-testid="kanji-literal">
        {face.literal}
      </p>

      {face.components.length > 0 ? (
        <div className="mt-6">
          <p className="text-sm font-semibold text-stone-500 dark:text-slate-500">
            {copy.session.kanji.componentsHeading}
          </p>
          <p className="mt-1 text-2xl" data-testid="kanji-components">
            {face.components.join('  +  ')}
          </p>
        </div>
      ) : null}

      {face.reading ? (
        <div className="mt-4">
          <p className="text-sm font-semibold text-stone-500 dark:text-slate-500">
            {copy.session.kanji.readingHeading}
          </p>
          <p className="mt-1 text-xl">{face.reading}</p>
        </div>
      ) : null}

      <div className="mt-6">
        <p className="text-sm font-semibold text-stone-500 dark:text-slate-500">
          {copy.session.kanji.mnemonicHeading}
          {face.mnemonicIsMine ? (
            <span className="ml-2 rounded bg-teal-50 px-1.5 py-0.5 text-xs text-teal-900 dark:bg-teal-950 dark:text-teal-200">
              {copy.session.kanji.mine}
            </span>
          ) : null}
        </p>
        <p className="mt-1 text-sm text-stone-500 dark:text-slate-500">
          {copy.session.kanji.mnemonicHint}
        </p>
        <textarea
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setSaved(false);
          }}
          aria-label={copy.session.kanji.mnemonicPlaceholder}
          placeholder={copy.session.kanji.mnemonicPlaceholder}
          rows={3}
          data-testid="mnemonic-input"
          className="mt-2 w-full rounded-2xl border-2 border-stone-300 p-3 focus-visible:border-teal-700 focus-visible:outline-none dark:border-slate-700 dark:bg-slate-900 dark:focus-visible:border-teal-400"
        />
        <div className="mt-2 flex items-center gap-3">
          <Button
            variant="quiet"
            data-testid="mnemonic-save"
            className="w-auto border-2 border-stone-300 px-4 dark:border-slate-700"
            onClick={() => {
              void onSaveMnemonic(text).then(() => setSaved(true));
            }}
          >
            {copy.session.kanji.save}
          </Button>
          {saved ? (
            <span className="text-sm text-teal-800 dark:text-teal-300" role="status">
              {copy.session.kanji.saved}
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-8">
        <Button onClick={() => onAnswer({ raw: face.literal, confidence: null })}>
          {copy.session.kanji.confirm}
        </Button>
      </div>
    </div>
  );
};
