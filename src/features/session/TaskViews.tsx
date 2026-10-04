import { useEffect, useRef, useState } from 'react';
import { copy } from '../../i18n/id.ts';
import { KanaInput } from '../../ui/KanaInput.tsx';
import { Button } from '../../ui/Button.tsx';
import { SwipeCard } from '../../ui/SwipeCard.tsx';
import { Shadowing } from './Shadowing.tsx';
import { usesWord } from '../../core/usage.ts';
import { OptionCard } from '../../ui/OptionCard.tsx';
import {
  isSpeechInputAvailable,
  recognizeOnce,
} from '../../platform/speechRecognition.ts';
import { Furigana } from '../../ui/Furigana.tsx';
import { furiganaFor, headwordIn } from '../../core/furigana.ts';
import type { Confidence, ScriptMode } from '../../data/types.ts';
import type { Task } from './task.ts';

export interface AnswerPayload {
  raw: string;
  confidence: Confidence | null;
}

interface TaskProps {
  task: Task;
  /**
   * SPEC §4.3's romaji → kana → kanji ladder. Required rather than defaulted:
   * a view that forgot it would quietly show a Japanese learner the script they
   * have not reached, and there is no safe value to fall back to.
   */
  scriptMode: ScriptMode;
  onAnswer: (payload: AnswerPayload) => void;
  onPlayAudio: () => void;
  audioAvailable: boolean;
  /**
   * An answer is already being written. One click is one answer, and the
   * controls say so rather than silently swallowing the extra taps — see
   * `SessionScreen`, where the guard that actually enforces it lives.
   */
  busy?: boolean;
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
    <p className="mt-3 text-sm text-stone-500 dark:text-slate-400">
      {copy.session.audio.unavailable}
    </p>
  );

/**
 * The word, and what it means in Indonesian.
 *
 * Glosses cover 30% of English words and 4% of Japanese — measured, D59 — so
 * "no entry" is the ordinary case, not an error. It gets said out loud for the
 * same reason the reader says it: a learner who sees nothing cannot tell
 * whether the app has no answer or whether they missed it. What a gloss is
 * *not* is an answer key (invariant 29), which is why this shows meaning and
 * never grades against it.
 */
/**
 * A task's sentence, with the readings a learner still needs above it.
 *
 * SPEC §10: *"Furigana auto-fades per-kanji as stability rises."* Every decision
 * about which script to show and when a reading goes lives in
 * `src/core/furigana.ts`; this resolves it against the task and hands the
 * result to the markup. English falls through to plain text, because the
 * pipeline only emits tokens and readings for Japanese (D10).
 */
export const SentenceText = ({
  task,
  scriptMode,
}: {
  task: Task;
  scriptMode: ScriptMode;
}) => {
  const { tokens, readings } = task.sentence;
  if (tokens === undefined || readings === undefined) return <>{task.sentence.text}</>;

  const stability = task.kanjiStability ?? {};
  return (
    <Furigana
      // Romaji is written with spaces between words. Kana and kanji are not.
      separator={scriptMode === 'romaji' ? ' ' : ''}
      segments={furiganaFor({
        tokens,
        readings,
        // `?? null` catches a character with no entry, not one with a stability
        // of zero — zero is a real measurement and null means never studied.
        stabilityOf: (kanji) => stability[kanji] ?? null,
        scriptMode,
      })}
    />
  );
};

const WordMeaning = ({ task, scriptMode }: { task: Task; scriptMode: ScriptMode }) => {
  const senses = task.gloss ?? [];
  return (
    <div className="mt-4">
      <p>
        <span
          data-testid="task-headword"
          className="inline-block rounded-lg bg-teal-50 px-3 py-1 font-semibold text-teal-900 dark:bg-teal-950 dark:text-teal-200"
        >
          {headwordIn(scriptMode, task.headword, task.reading ?? null)}
        </span>
        {senses.length > 0 ? (
          <span data-testid="task-gloss" className="ml-2 text-lg text-stone-600 dark:text-slate-400">
            {senses.join('; ')}
          </span>
        ) : null}
      </p>
      {senses.length === 0 ? (
        <p className="mt-2 text-sm text-stone-600 dark:text-slate-400" data-testid="task-no-gloss">
          {copy.session.meaning.none}
        </p>
      ) : null}
    </div>
  );
};

/**
 * A kanji's reading, with KANJIDIC2's notation unpacked rather than printed.
 *
 * `splitKanjiReading` explains the data; this decides what to show. The
 * character's own reading goes under "Dibaca", and where the dictionary marks
 * okurigana the word it forms is spelled out beside it — 会 is read あ, and it
 * is used in 会う, read あう. Both are true; `あ.う` on its own was neither.
 */
const KanjiReadingLine = ({
  literal,
  reading,
  romaji,
  okurigana,
}: {
  literal: string;
  reading: string;
  /** Latin letters beside the kana — what a day-one learner can actually say. */
  romaji: string | null;
  okurigana: string | undefined;
}) => {
  return (
    <div className="mt-4">
      <p className="text-sm font-semibold text-stone-500 dark:text-slate-400">
        {copy.session.kanji.readingHeading}
      </p>
      <p className="mt-1 text-xl" data-testid="kanji-reading">
        {reading}
        {romaji === null ? null : (
          <span className="ml-2 text-base text-stone-600 dark:text-slate-400">({romaji})</span>
        )}
      </p>
      {okurigana === undefined ? null : (
        <p className="mt-1 text-sm text-stone-600 dark:text-slate-400" data-testid="kanji-in-word">
          {copy.session.kanji.inWord(`${literal}${okurigana}`, `${reading}${okurigana}`)}
        </p>
      )}
    </div>
  );
};

/** L0 — errorless first exposure. Nothing is being tested yet. */
export const ExposureTask = ({
  task,
  onAnswer,
  onPlayAudio,
  audioAvailable,
  busy,
  onDefer,
  scriptMode,
}: TaskProps & { onDefer?: () => void }) => (
  <div>
    <SwipeCard
      className="rounded-2xl border-2 border-stone-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
      {...(busy === true
        ? {}
        : {
            right: {
              label: copy.session.swipe.confirm,
              onCommit: () => onAnswer({ raw: task.headword, confidence: null }),
            },
            ...(onDefer ? { left: { label: copy.session.swipe.defer, onCommit: onDefer } } : {}),
          })}
    >
    <p className="text-sm font-semibold tracking-wide text-teal-800 uppercase dark:text-teal-300">
      {copy.session.exposure.heading}
    </p>
    <p className="mt-1 text-sm text-stone-600 dark:text-slate-400">
      {copy.session.exposure.instruction}
    </p>

    <p className="mt-6 text-2xl leading-snug font-bold">
      <SentenceText task={task} scriptMode={scriptMode} />
    </p>
    <p className="mt-2 text-lg text-stone-600 dark:text-slate-400">{task.translation}</p>
    {/* SPEC §2.3 L0: sentence + audio + gloss. */}
    <WordMeaning task={task} scriptMode={scriptMode} />

    {/* SPEC §2.5 + §2.9: where a chunk has an L1 trap, naming it is the whole
        value of teaching the phrase whole rather than word by word. */}
    {task.chunkNote ? (
      <p
        className="mt-4 rounded-2xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100"
        data-testid="chunk-note"
      >
        {task.chunkNote}
      </p>
    ) : null}

    <AudioButton onPlay={onPlayAudio} available={audioAvailable} />
    {/* SPEC §8's shadowing exercise, where the device can actually do it: hear
        the model, say it back, compare the two by ear. Offered at first
        exposure because that is when "listen and repeat" belongs, and withheld
        on a silent device exactly as L4 is (§2.6). */}
    {audioAvailable ? <Shadowing onPlayModel={onPlayAudio} /> : null}
    </SwipeCard>

    <div className="mt-6">
      <Button
        onClick={() => onAnswer({ raw: task.headword, confidence: null })}
        disabled={busy === true}
        data-testid="exposure-confirm"
      >
        {copy.session.exposure.confirm}
      </Button>
    </div>
    {/* The gesture is a shortcut, so it is mentioned rather than required. */}
    <p className="mt-2 text-center text-xs text-stone-500 dark:text-slate-400">
      {copy.session.swipe.hint}
    </p>
  </div>
);

/** L1 — recognition. Distractors come from the same frequency band (§2.3). */
export const RecognitionTask = ({
  task,
  onAnswer,
  onPlayAudio,
  audioAvailable,
  busy,
  scriptMode,
}: TaskProps) => (
  <div>
    <p className="text-sm font-semibold tracking-wide text-teal-800 uppercase dark:text-teal-300">
      {copy.session.recognition.heading}
    </p>

    <p className="mt-4 text-2xl leading-snug font-bold">
      <SentenceText task={task} scriptMode={scriptMode} />
    </p>
    <AudioButton onPlay={onPlayAudio} available={audioAvailable} />

    <div className="mt-6 flex flex-col gap-3">
      {(task.options ?? []).map((option) => (
        <OptionCard
          key={option}
          label={option}
          selected={false}
          disabled={busy === true}
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
export const DictationTask = ({ onAnswer, onPlayAudio, busy }: TaskProps) => {
  const [value, setValue] = useState('');
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
  }, []);

  const submit = (confidence: Confidence, raw: string = value) => {
    if (raw.trim().length === 0) return;
    onAnswer({ raw, confidence });
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
          <Button type="submit" disabled={value.trim().length === 0 || busy === true}>
            {copy.session.cloze.sure}
          </Button>
          <Button
            variant="quiet"
            disabled={value.trim().length === 0 || busy === true}
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
export const ClozeTask = ({ task, onAnswer, onPlayAudio, audioAvailable, busy }: TaskProps) => {
  const [value, setValue] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const supported = task.kind === 'cloze-supported';

  // Focus on mount. The component is keyed by item, so a new task remounts it
  // and the field clears itself — no state reset needed.
  useEffect(() => {
    input.current?.focus();
  }, []);

  const submit = (confidence: Confidence, raw: string = value) => {
    if (raw.trim().length === 0) return;
    onAnswer({ raw, confidence });
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
          <Button type="submit" disabled={value.trim().length === 0 || busy === true}>
            {copy.session.cloze.sure}
          </Button>
          <Button
            variant="quiet"
            disabled={value.trim().length === 0 || busy === true}
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
          <p className="text-sm font-semibold text-stone-500 dark:text-slate-400">
            {copy.session.kanji.componentsHeading}
          </p>
          <p className="mt-1 text-2xl" data-testid="kanji-components">
            {face.components.join('  +  ')}
          </p>
        </div>
      ) : null}

      {face.meanings.length > 0 ? (
        <div className="mt-4">
          <p className="text-sm font-semibold text-stone-500 dark:text-slate-400">
            {copy.session.kanji.meaningHeading}
          </p>
          <p className="mt-1 text-lg" data-testid="kanji-meanings">
            {face.meanings.join(', ')}
          </p>
        </div>
      ) : null}

      {face.reading ? (
        <KanjiReadingLine
          literal={face.literal}
          reading={face.reading}
          romaji={face.romaji}
          okurigana={face.okurigana}
        />
      ) : null}

      <div className="mt-6">
        <p className="text-sm font-semibold text-stone-500 dark:text-slate-400">
          {copy.session.kanji.mnemonicHeading}
          {face.mnemonicIsMine ? (
            <span className="ml-2 rounded bg-teal-50 px-1.5 py-0.5 text-xs text-teal-900 dark:bg-teal-950 dark:text-teal-200">
              {copy.session.kanji.mine}
            </span>
          ) : null}
        </p>
        <p className="mt-1 text-sm text-stone-500 dark:text-slate-400">
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

/**
 * A microphone button that answers the same question as the keyboard.
 *
 * SPEC §5.1: *"never block progression on it"*. So it appears only when the API
 * exists, a failure fills nothing in and says so plainly, and the text field is
 * always right there. Speech is a second route to the same answer, never a gate.
 */
const SpeakButton = ({
  lang,
  onTranscript,
}: {
  lang: string;
  onTranscript: (text: string) => void;
}) => {
  const [listening, setListening] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  if (!isSpeechInputAvailable()) return null;

  return (
    <div className="mt-3">
      <Button
        variant="quiet"
        data-testid="speak"
        className="w-auto border-2 border-stone-300 px-4 dark:border-slate-700"
        disabled={listening}
        onClick={() => {
          setListening(true);
          setStatus(copy.session.speech.listening);
          void recognizeOnce(lang === 'ja' ? 'ja-JP' : 'en-US').then((result) => {
            setListening(false);
            if (result.heard) {
              onTranscript(result.transcript);
              setStatus(copy.session.speech.heard(result.transcript));
            } else {
              setStatus(copy.session.speech.notHeard);
            }
          });
        }}
      >
        🎤 {listening ? copy.session.speech.listening : copy.session.speech.speak}
      </Button>
      {status ? (
        <p className="mt-1 text-sm text-stone-500 dark:text-slate-400" role="status">
          {status}
        </p>
      ) : null}
    </div>
  );
};

/** L5 — production. The Indonesian alone, and a blank field (SPEC §2.3). */
export const ProductionTask = ({ task, onAnswer, lang, busy }: TaskProps & { lang: string }) => {
  const [value, setValue] = useState('');
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
  }, []);

  const submit = (confidence: Confidence, raw: string = value) => {
    if (raw.trim().length === 0) return;
    onAnswer({ raw, confidence });
  };

  return (
    <div>
      <p className="text-sm font-semibold tracking-wide text-teal-800 uppercase dark:text-teal-300">
        {copy.session.production.heading}
      </p>
      <p className="mt-1 text-sm text-stone-600 dark:text-slate-400">
        {lang === 'ja' ? copy.session.production.instructionJa : copy.session.production.instruction}
      </p>

      {/*
        §2.3 calls L5 "ID → target, produced": the prompt is the *meaning*, and
        the learner produces the word. It used to be the whole Indonesian
        sentence, while the graded answer was a single headword — so a learner
        could read the prompt perfectly and still have no way of knowing which
        word was wanted, or that one word was wanted at all.

        Where a gloss exists it leads and the sentence becomes context. Where
        none does — the common case at 30% coverage — the sentence leads, and
        the note says why it is the only clue on offer instead of leaving the
        learner to guess at the exercise as well as the answer.
      */}
      {task.gloss && task.gloss.length > 0 ? (
        <>
          <p className="mt-6 text-2xl leading-snug font-bold" data-testid="production-prompt">
            {task.gloss.join('; ')}
          </p>
          <p className="mt-3 text-sm text-stone-600 dark:text-slate-400">
            <span className="block text-xs tracking-wide uppercase">
              {copy.session.meaning.sentenceLabel}
            </span>
            {task.translation}
          </p>
        </>
      ) : (
        <>
          <p className="mt-6 text-2xl leading-snug font-bold" data-testid="production-prompt">
            {task.translation}
          </p>
          <p className="mt-2 text-sm text-stone-600 dark:text-slate-400" data-testid="task-no-gloss">
            {copy.session.meaning.none}
          </p>
        </>
      )}
      <p className="mt-2 text-sm font-semibold text-teal-800 dark:text-teal-300">
        {copy.session.production.oneWord}
      </p>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit('yakin');
        }}
      >
        {/* SPEC §10: Japanese production is where an IME headache would stop a
            learner cold, so this is the one rung that gets the kana input. */}
        {lang === 'ja' ? (
          <div className="mt-6">
            <KanaInput
              value={value}
              onChange={setValue}
              placeholder={copy.session.production.placeholder}
              data-testid="production-input"
              onSubmit={(committed) => submit('yakin', committed)}
            />
          </div>
        ) : (
          <input
            ref={input}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            aria-label={copy.session.production.placeholder}
            placeholder={copy.session.production.placeholder}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="mt-6 min-h-14 w-full rounded-2xl border-2 border-stone-300 px-4 text-lg focus-visible:border-teal-700 focus-visible:outline-none dark:border-slate-700 dark:bg-slate-900 dark:focus-visible:border-teal-400"
          />
        )}
        <SpeakButton lang={lang} onTranscript={setValue} />
        <div className="mt-4 flex gap-3">
          <Button type="submit" disabled={value.trim().length === 0 || busy === true}>
            {copy.session.cloze.sure}
          </Button>
          <Button
            variant="quiet"
            disabled={value.trim().length === 0 || busy === true}
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
 * L6 — free production (SPEC §2.3): use the word in a sentence about your own
 * life.
 *
 * **What is graded, and what is not.** The only thing we can honestly check is
 * whether the learner used the word — there is no grammar model here, and D4
 * keeps the LLM layer out until after M7. So the card says so: your sentence is
 * yours, and the check is that the word is in it. That is still the generation
 * effect doing its work; inventing a quality score would not add to it.
 */
export const FreeProductionTask = ({
  task,
  onAnswer,
  busy,
  lang,
  scriptMode,
}: TaskProps & { lang: string }) => {
  const [value, setValue] = useState('');
  const [missing, setMissing] = useState(false);

  /**
   * SPEC §2.7. The check used to be `sentence.includes(word)` and it was wrong
   * in both directions — "banana" counted as "an", and "I took the bus" did not
   * count as "take", which **blocked a learner who had answered correctly**.
   * `usesWord` tokenizes and knows regular inflections plus the common
   * irregulars.
   *
   * It still cannot know everything, so a miss is a question rather than a wall:
   * saying it again sends the sentence. A matcher that is merely usually right
   * must not have the last word over a learner who is looking at their own
   * sentence.
   */
  const submit = () => {
    // Any accepted form counts: a learner writing a Japanese sentence with わたし
    // used the word, and 私 is not the only spelling of it (SPEC §2.7, §4.3).
    const forms = [task.answer, ...(task.alsoAccepted ?? [])];
    const used = forms.some((word) => usesWord({ sentence: value, word, lang }));
    if (!missing && !used) {
      setMissing(true);
      return;
    }
    onAnswer({ raw: value, confidence: null });
  };

  return (
    <div>
      <p className="text-sm font-semibold tracking-wide text-teal-800 uppercase dark:text-teal-300">
        {copy.session.free.heading}
      </p>
      <p className="mt-2 text-lg">
        {copy.session.free.instruction(headwordIn(scriptMode, task.headword, task.reading ?? null))}
      </p>
      <p className="mt-1 text-sm text-stone-500 dark:text-slate-400">{copy.session.free.graded}</p>

      <textarea
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setMissing(false);
        }}
        aria-label={copy.session.free.placeholder}
        placeholder={copy.session.free.placeholder}
        rows={4}
        data-testid="free-input"
        className="mt-4 w-full rounded-2xl border-2 border-stone-300 p-3 text-lg focus-visible:border-teal-700 focus-visible:outline-none dark:border-slate-700 dark:bg-slate-900 dark:focus-visible:border-teal-400"
      />

      {missing ? (
        <p className="mt-2 text-sm text-amber-800 dark:text-amber-300" role="status">
          {copy.session.free.missing(headwordIn(scriptMode, task.headword, task.reading ?? null))}
        </p>
      ) : null}

      <div className="mt-4">
        <Button
          onClick={submit}
          disabled={value.trim().length === 0 || busy === true}
          data-testid="free-submit"
        >
          {missing ? copy.session.free.submitAnyway : copy.session.free.submit}
        </Button>
      </div>
    </div>
  );
};
