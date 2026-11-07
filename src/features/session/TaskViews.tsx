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
import { romajiOfTokens, romajiOfWord, toHiragana, toRomaji } from '../../core/kana.ts';
import { TappableText, type TextPart } from '../../ui/TappableText.tsx';
import { WordSheet } from '../word/WordSheet.tsx';
import type { Confidence, ScriptMode } from '../../data/types.ts';
import type { ClozeHint, KanjiFace, Task } from './task.ts';
import type { Cloze } from '../../core/cloze.ts';

export interface AnswerPayload {
  raw: string;
  confidence: Confidence | null;
  /**
   * L6 only: whether the target word was found in the learner's sentence. A
   * sentence sent without it is recorded, never called correct.
   */
  verified?: boolean;
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
const segmentsOf = (task: Task, scriptMode: ScriptMode) => {
  const { tokens, readings } = task.sentence;
  if (tokens === undefined || readings === undefined) return null;
  const stability = task.kanjiStability ?? {};
  const readable = new Set(task.readableKana ?? []);
  return furiganaFor({
    tokens,
    readings,
    // `?? null` catches a character with no entry, not one with a stability
    // of zero — zero is a real measurement and null means never studied.
    stabilityOf: (kanji) => stability[kanji] ?? null,
    // §4.3's fade: a word is drawn in kana once the learner can read every
    // character in it, so the romaji rung empties itself.
    readsKana: (character) => readable.has(toHiragana(character)),
    scriptMode,
  });
};

const JAPANESE = /[\u3040-\u30ff\u4e00-\u9fff]/u;
const WORDLIKE = /[\p{L}\p{N}]/u;

/**
 * The romaji line under a Japanese sentence — every sentence, at every rung.
 *
 * The learner's rule: every Japanese character on screen comes with its
 * romaji. The kana rung used to draw kanji as kana with nothing else, and the
 * kanji rung set kana readings above the characters — neither of which a
 * learner who cannot yet read kana can say aloud. On the romaji rung the line
 * is dropped only while the sentence itself is still all Latin.
 */
export const RomajiLine = ({ romaji }: { romaji: string }) => (
  <p className="mt-1 text-base font-normal text-stone-600 dark:text-slate-400" data-testid="romaji-line">
    {romaji}
  </p>
);

/**
 * A Japanese sentence whose every word can be opened (see `WordSheet`): reading,
 * romaji, meaning, and for a word of two or more kanji, each character and the
 * combined meaning. One tab stop for the block (invariant 35), arrows inside.
 */
const JapaneseSentence = ({
  task,
  scriptMode,
  segments,
}: {
  task: Task;
  scriptMode: ScriptMode;
  segments: NonNullable<ReturnType<typeof segmentsOf>>;
}) => {
  const [open, setOpen] = useState<{ token: string; reading: string | null } | null>(null);
  const tokens = task.sentence.tokens ?? [];
  const readings = task.sentence.readings ?? [];
  const separator = scriptMode === 'romaji' ? ' ' : '';
  const parts: TextPart[] = tokens.flatMap((token, index): TextPart[] => {
    const segment = segments[index];
    const shown = segment?.text ?? token;
    const gap =
      index > 0 && separator.length > 0 && WORDLIKE.test(shown) && segment?.attach !== true
        ? [{ kind: 'gap' as const, text: separator }]
        : [];
    if (!WORDLIKE.test(token)) return [...gap, { kind: 'gap', text: shown }];
    return [
      ...gap,
      {
        kind: 'word',
        text: shown,
        ...(shown !== token ? { value: token } : {}),
        ...(segment?.ruby ? { ruby: segment.ruby } : {}),
        className: 'rounded px-0.5 text-left hover:bg-stone-100 dark:hover:bg-slate-800',
      },
    ];
  });
  const showsJapanese = segments.some((segment) => JAPANESE.test(segment.text));
  return (
    <>
      <TappableText
        parts={parts}
        label={copy.word.hint}
        onTap={(token) => {
          const index = tokens.indexOf(token);
          setOpen({ token, reading: index >= 0 ? (readings[index] ?? null) : null });
        }}
        wordTestId="sentence-word"
      />
      {showsJapanese ? <RomajiLine romaji={romajiOfTokens(tokens, readings)} /> : null}
      {open ? (
        <WordSheet token={open.token} reading={open.reading} onClose={() => setOpen(null)} />
      ) : null}
    </>
  );
};

export const SentenceText = ({
  task,
  scriptMode,
}: {
  task: Task;
  scriptMode: ScriptMode;
}) => {
  const segments = segmentsOf(task, scriptMode);
  if (segments === null) return <>{task.sentence.text}</>;
  return <JapaneseSentence task={task} scriptMode={scriptMode} segments={segments} />;
};

const Blank = () => (
  <span className="mx-1 inline-block min-w-24 border-b-4 border-teal-700 align-bottom dark:border-teal-400">
    &nbsp;
  </span>
);

/**
 * The sentence with its word removed. Japanese is drawn in the learner's own
 * script around the blank — the corpus spelling would have put kanji in front
 * of a learner on the romaji rung.
 */
export const ClozeFrame = ({
  task,
  cloze,
  scriptMode,
}: {
  task: Task;
  cloze: Cloze;
  scriptMode: ScriptMode;
}) => {
  const segments = segmentsOf(task, scriptMode);
  if (segments === null || cloze.tokenIndex === undefined) {
    return (
      <>
        {cloze.before}
        <Blank />
        {cloze.after}
      </>
    );
  }
  const separator = scriptMode === 'romaji' ? ' ' : '';
  const tokens = task.sentence.tokens ?? [];
  const readings = task.sentence.readings ?? [];
  const index = cloze.tokenIndex;
  // The blank stays a blank in romaji too: the line spells everything else.
  const romaji = [
    romajiOfTokens(tokens.slice(0, index), readings.slice(0, index)),
    '___',
    romajiOfTokens(tokens.slice(index + 1), readings.slice(index + 1)),
  ]
    .filter((part) => part.length > 0)
    .join(' ')
    .replace(/ ([.,?!])/g, '$1');
  return (
    <>
      <Furigana segments={segments.slice(0, index)} separator={separator} />
      {separator}
      <Blank />
      {separator}
      <Furigana segments={segments.slice(index + 1)} separator={separator} />
      {segments.some((segment) => JAPANESE.test(segment.text)) ? (
        <span className="mt-1 block text-base font-normal text-stone-600 dark:text-slate-400" data-testid="romaji-line">
          {romaji}
        </span>
      ) : null}
    </>
  );
};

/**
 * The first letter (or first kana) of the missing word, and how long it is.
 *
 * A one-character answer gets its length only: its first character *is* the
 * answer, and "Petunjuk: の" printed it. Kana is followed by its romaji
 * (D111) on the rungs that draw Japanese in kana or kanji.
 */
const HintLine = ({ hint, scriptMode }: { hint: ClozeHint; scriptMode: ScriptMode }) => {
  const shown =
    hint.rest === 0
      ? copy.session.cloze.oneCharacter
      : hint.script === 'latin'
        ? `${hint.first}${' _'.repeat(hint.rest)}`
        : scriptMode === 'romaji'
          ? `${toRomaji(hint.first)}…`
          : `${hint.first}${'＿'.repeat(hint.rest)} (${toRomaji(hint.first)}…)`;
  return (
    <p className="mt-2 text-sm text-stone-600 dark:text-slate-400" data-testid="cloze-hint">
      {copy.session.cloze.hint(shown)}
    </p>
  );
};

/**
 * "Saya tidak tahu": a miss, said plainly.
 *
 * Every typed rung disabled its submit button on an empty field, so a learner
 * who had forgotten the word had to type something invented and press "Yakin"
 * or "Ragu" — inventing a confidence too, which the §2.12 calibration chart
 * then read as a judgement. This records an honest miss and nothing else.
 */
const DontKnow = ({ onAnswer, busy }: { onAnswer: TaskProps['onAnswer']; busy?: boolean | undefined }) => (
  <button
    type="button"
    onClick={() => onAnswer({ raw: '', confidence: null })}
    disabled={busy === true}
    data-testid="dont-know"
    className="mt-3 min-h-12 w-full rounded-2xl text-sm font-semibold text-stone-600 underline-offset-4 hover:underline disabled:opacity-50 dark:text-slate-400"
  >
    {copy.session.dontKnow}
  </button>
);

/**
 * Romaji for a headword, or null where the chip already shows Latin (English,
 * or the romaji rung) — the learner's rule is romaji beside every Japanese
 * character shown, not twice beside the same word.
 */
export const headwordRomaji = (task: Task, scriptMode: ScriptMode): string | null => {
  const shown = headwordIn(scriptMode, task.headword, task.reading ?? null, task.romaji ?? null);
  if (!/[\u3040-\u30ff\u4e00-\u9fff]/u.test(shown)) return null;
  return romajiOfWord(task.headword, task.reading ?? null, task.romaji ?? null);
};

const WordMeaning = ({ task, scriptMode }: { task: Task; scriptMode: ScriptMode }) => {
  const senses = task.gloss ?? [];
  const romaji = headwordRomaji(task, scriptMode);
  const [open, setOpen] = useState(false);
  const japanese = /[\u3040-\u30ff\u4e00-\u9fff]/u.test(task.headword);
  const chip = headwordIn(scriptMode, task.headword, task.reading ?? null, task.romaji ?? null);
  return (
    <div className="mt-4">
      <p>
        {japanese ? (
          // Tappable: a word of two or more kanji opens to each character and
          // the combined meaning (WordSheet).
          <button
            type="button"
            onClick={() => setOpen(true)}
            data-testid="task-headword"
            className="inline-block rounded-lg bg-teal-50 px-3 py-1 font-semibold text-teal-900 underline decoration-dotted underline-offset-4 dark:bg-teal-950 dark:text-teal-200"
          >
            {chip}
          </button>
        ) : (
          <span
            data-testid="task-headword"
            className="inline-block rounded-lg bg-teal-50 px-3 py-1 font-semibold text-teal-900 dark:bg-teal-950 dark:text-teal-200"
          >
            {chip}
          </span>
        )}
        {romaji ? (
          <span className="ml-2 text-base text-stone-600 dark:text-slate-400" data-testid="task-headword-romaji">
            ({romaji})
          </span>
        ) : null}
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
      {open ? (
        <WordSheet token={task.headword} reading={task.reading ?? null} onClose={() => setOpen(false)} />
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
          {copy.session.kanji.inWord(
            `${literal}${okurigana}`,
            `${reading}${okurigana}`,
            toRomaji(toHiragana(`${reading}${okurigana}`)),
          )}
        </p>
      )}
    </div>
  );
};

/**
 * One character of the syllabary (SPEC §4.3).
 *
 * At L0 the card simply shows the sound — errorless exposure, the same as a
 * first lexeme — and above it asks for the sound in latin letters, which is the
 * only production task a character of a syllabary has.
 *
 * The other script's form of the same sound is always on the card. Hiragana and
 * katakana are "dua set huruf untuk bunyi yang sama", and meeting them as two
 * unrelated alphabets is the thing that makes the second one feel like starting
 * over.
 */
export const KanaTask = ({ task, onAnswer, busy }: TaskProps) => {
  const face = task.kana;
  const [value, setValue] = useState('');
  if (!face) return null;

  const asks = task.ladderLevel > 0;
  const script = copy.session.kana.scriptLabel[face.script];
  // The counterpart is in the *other* script. Passing `script` here printed
  // "ditulis ア dalam Hiragana" on every hiragana card.
  const otherScript =
    copy.session.kana.scriptLabel[face.script === 'hiragana' ? 'katakana' : 'hiragana'];

  return (
    <div>
      <p className="text-sm font-semibold tracking-wide text-teal-800 uppercase dark:text-teal-300">
        {copy.session.kana.heading} · {script}
      </p>
      <p className="mt-2 text-stone-600 dark:text-slate-400">
        {asks ? copy.session.kana.recall : copy.session.kana.instruction}
      </p>

      <p className="mt-6 text-center text-8xl leading-none font-bold" data-testid="kana-character">
        {face.character}
      </p>

      {asks ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (busy === true) return;
            onAnswer({ raw: value, confidence: null });
          }}
        >
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            aria-label={copy.session.kana.recall}
            placeholder={copy.session.kana.placeholder}
            data-testid="kana-input"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="mt-6 min-h-14 w-full rounded-2xl border-2 border-stone-300 px-4 text-center text-2xl focus-visible:border-teal-700 focus-visible:outline-none dark:border-slate-700 dark:bg-slate-900 dark:focus-visible:border-teal-400"
          />
          {/* `type="submit"`: Button defaults to "button", so without this the
              primary action did nothing and only the keyboard's Enter worked. */}
          <Button
            type="submit"
            className="mt-4 w-full"
            disabled={busy === true || value.trim().length === 0}
            data-testid="kana-submit"
          >
            {copy.session.kana.submit}
          </Button>
          <DontKnow onAnswer={onAnswer} busy={busy} />
        </form>
      ) : (
        <>
          <p className="mt-3 text-center text-3xl text-teal-800 dark:text-teal-300" data-testid="kana-romaji">
            {face.romaji}
          </p>
          <p className="mt-4 text-center text-sm text-stone-600 dark:text-slate-400">
            {copy.session.kana.counterpart(face.counterpart, face.romaji, otherScript)}
          </p>
          <Button
            className="mt-6 w-full"
            disabled={busy === true}
            data-testid="kana-confirm"
            onClick={() => onAnswer({ raw: face.romaji, confidence: null })}
          >
            {copy.session.kana.confirm}
          </Button>
        </>
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

    <div className="mt-6 text-2xl leading-snug font-bold" data-testid="task-sentence">
      <SentenceText task={task} scriptMode={scriptMode} />
    </div>
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
      {task.cloze ? copy.session.recognition.wordHeading : copy.session.recognition.heading}
    </p>

    {task.cloze ? (
      <>
        <p className="mt-4 text-2xl leading-snug font-bold" data-testid="task-sentence">
          <ClozeFrame task={task} cloze={task.cloze} scriptMode={scriptMode} />
        </p>
        <p className="mt-2 text-lg text-stone-600 dark:text-slate-400">{task.translation}</p>
      </>
    ) : (
      <div className="mt-4 text-2xl leading-snug font-bold" data-testid="task-sentence">
        <SentenceText task={task} scriptMode={scriptMode} />
      </div>
    )}
    <AudioButton onPlay={onPlayAudio} available={audioAvailable} />

    <div className="mt-6 flex flex-col gap-3">
      {(task.options ?? []).map((option) => {
        const romaji = task.optionsRomaji?.[option];
        return (
          <OptionCard
            key={option}
            label={option}
            {...(romaji !== undefined ? { hint: romaji } : {})}
            selected={false}
            disabled={busy === true}
            onToggle={() => onAnswer({ raw: option, confidence: null })}
          />
        );
      })}
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
      <DontKnow onAnswer={onAnswer} busy={busy} />
    </div>
  );
};

/** L2/L3 — contextual production, with or without the Indonesian support. */
export const ClozeTask = ({
  task,
  onAnswer,
  onPlayAudio,
  audioAvailable,
  busy,
  scriptMode,
}: TaskProps) => {
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

      <p className="mt-4 text-2xl leading-snug font-bold" data-testid="cloze-sentence">
        {task.cloze ? <ClozeFrame task={task} cloze={task.cloze} scriptMode={scriptMode} /> : null}
      </p>

      {supported ? (
        <p className="mt-2 text-lg text-stone-600 dark:text-slate-400">{task.translation}</p>
      ) : null}
      {task.hint ? <HintLine hint={task.hint} scriptMode={scriptMode} /> : null}

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
      <DontKnow onAnswer={onAnswer} busy={busy} />
    </div>
  );
};

/**
 * A kanji's whole face: parts, meanings, readings and the mnemonic.
 *
 * Shown at the first meeting and again on every verdict, because a learner who
 * missed the meaning or the reading needs exactly this — and the mnemonic is
 * editable in both places, since a miss is when a better one gets written.
 * The editable field is the point, not a nicety: §2.11's finding is that
 * self-generated mnemonics are stronger than given ones, so the baseline is
 * deliberately thin and the copy invites replacing it.
 */
export const KanjiDetails = ({
  face,
  onSaveMnemonic,
}: {
  face: KanjiFace;
  onSaveMnemonic?: (text: string) => Promise<void>;
}) => {
  const [text, setText] = useState(face.mnemonic);
  const [saved, setSaved] = useState(false);
  return (
    <div>
      {/* Every part with its name and meaning (D121): a bare 厶 or 冂 is a
          shape the learner cannot say or use in a mnemonic. */}
      {face.componentDetails.length > 0 ? (
        <div className="mt-6">
          <p className="text-sm font-semibold text-stone-500 dark:text-slate-400">
            {copy.session.kanji.componentsHeading}
          </p>
          <ul className="mt-2 flex flex-col gap-2" data-testid="kanji-components">
            {face.componentDetails.map((detail) => (
              <li key={detail.part} className="flex items-baseline gap-3 rounded-xl bg-stone-100 px-3 py-2 dark:bg-slate-900">
                <span className="text-2xl font-bold text-stone-900 dark:text-slate-100">{detail.part}</span>
                <span className="text-sm text-stone-700 dark:text-slate-300">
                  {detail.romaji ? <span className="font-semibold">{detail.romaji}</span> : null}
                  {detail.meaning ? <span className="text-stone-600 dark:text-slate-400"> — {detail.meaning}</span> : null}
                </span>
              </li>
            ))}
          </ul>
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

      {face.readings.length > 1 ? (
        <p className="mt-2 text-sm text-stone-600 dark:text-slate-400" data-testid="kanji-readings">
          {copy.session.kanji.allReadings(
            face.readings.map((reading) => `${reading} (${toRomaji(reading)})`).join(', '),
          )}
        </p>
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
        {onSaveMnemonic ? (
          <>
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
          </>
        ) : (
          <p className="mt-1 text-stone-700 dark:text-slate-300">{face.mnemonic}</p>
        )}
      </div>
    </div>
  );
};

/**
 * The kanji card (SPEC §2.11): component breakdown, readings, and a mnemonic the
 * learner can rewrite — and, after the first meeting, a question.
 *
 * It used to be a card that showed everything and was "answered" by tapping
 * "Oke, paham", graded Good every time: four taps over two weeks reached the
 * mastery bar and faded the character's furigana without one question asked
 * (§2.2). Now the first meeting is errorless, L1 asks what it means and L2 and
 * up ask how it is read.
 */
export const KanjiTask = ({
  task,
  onAnswer,
  onSaveMnemonic,
  busy,
}: TaskProps & { onSaveMnemonic: (text: string) => Promise<void> }) => {
  const face = task.kanji;
  const [value, setValue] = useState('');
  if (!face) return null;

  const submit = (confidence: Confidence) => {
    if (value.trim().length === 0) return;
    onAnswer({ raw: value, confidence });
  };

  return (
    <div>
      <p className="text-sm font-semibold tracking-wide text-teal-800 uppercase dark:text-teal-300">
        {copy.session.kanji.heading}
      </p>
      <p className="mt-1 text-sm text-stone-600 dark:text-slate-400">
        {face.mode === 'meaning'
          ? copy.session.kanji.meaningQuestion
          : face.mode === 'reading'
            ? copy.session.kanji.readingQuestion
            : copy.session.kanji.instruction}
      </p>

      <p className="mt-6 text-center text-7xl leading-none font-bold" data-testid="kanji-literal">
        {face.literal}
      </p>
      {/* Whichever half is not being asked is shown: how it is read while its
          meaning is the question, and what it means while its reading is. */}
      {face.mode === 'meaning' && face.reading ? (
        <p className="mt-3 text-center text-lg text-stone-600 dark:text-slate-400" data-testid="kanji-said">
          {face.reading} ({face.romaji})
        </p>
      ) : null}
      {face.mode === 'reading' && face.meanings.length > 0 ? (
        <p className="mt-3 text-center text-lg text-stone-600 dark:text-slate-400" data-testid="kanji-means">
          {copy.word.englishMeaning(face.meanings.slice(0, 3).join(', '))}
        </p>
      ) : null}

      {face.mode === 'meaning' ? (
        <>
          <p className="mt-4 text-center text-sm text-stone-500 dark:text-slate-400">
            {copy.session.kanji.meaningNote}
          </p>
          <div className="mt-4 flex flex-col gap-3" data-testid="kanji-options">
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
        </>
      ) : face.mode === 'reading' ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit('yakin');
          }}
        >
          <input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            aria-label={copy.session.kanji.readingPlaceholder}
            placeholder={copy.session.kanji.readingPlaceholder}
            data-testid="kanji-reading-input"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="mt-6 min-h-14 w-full rounded-2xl border-2 border-stone-300 px-4 text-center text-2xl focus-visible:border-teal-700 focus-visible:outline-none dark:border-slate-700 dark:bg-slate-900 dark:focus-visible:border-teal-400"
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
          <DontKnow onAnswer={onAnswer} busy={busy} />
        </form>
      ) : (
        <>
          <KanjiDetails face={face} onSaveMnemonic={onSaveMnemonic} />
          <div className="mt-8">
            <Button
              onClick={() => onAnswer({ raw: face.literal, confidence: null })}
              disabled={busy === true}
              data-testid="kanji-confirm"
            >
              {copy.session.kanji.confirm}
            </Button>
          </div>
        </>
      )}
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
export const ProductionTask = ({
  task,
  onAnswer,
  lang,
  busy,
  scriptMode,
}: TaskProps & { lang: string }) => {
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
      {task.frame ? (
        <p className="mt-3 text-xl leading-snug font-semibold" data-testid="production-frame">
          <ClozeFrame task={task} cloze={task.frame} scriptMode={scriptMode} />
        </p>
      ) : null}
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
      <DontKnow onAnswer={onAnswer} busy={busy} />
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
    onAnswer({ raw: value, confidence: null, verified: used });
  };

  return (
    <div>
      <p className="text-sm font-semibold tracking-wide text-teal-800 uppercase dark:text-teal-300">
        {copy.session.free.heading}
      </p>
      <p className="mt-2 text-lg">
        {copy.session.free.instruction(headwordIn(scriptMode, task.headword, task.reading ?? null, task.romaji ?? null))}
      </p>
      {/* The word to use, with its romaji and meaning (D111): writing a
          sentence around a word you cannot read or define is guesswork. */}
      <WordMeaning task={task} scriptMode={scriptMode} />
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
          {copy.session.free.missing(headwordIn(scriptMode, task.headword, task.reading ?? null, task.romaji ?? null))}
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
