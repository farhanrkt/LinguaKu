import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { copy } from '../../i18n/id.ts';
import { Button } from '../../ui/Button.tsx';
import { Screen } from '../../ui/Screen.tsx';
import { SwipeCard } from '../../ui/SwipeCard.tsx';
import { gradeAnswer, gradeForOutcome, type GradeResult } from '../../core/grader.ts';
import { detectInterference } from '../../core/interference.ts';
import {
  EMPTY_CLIP_INDEX,
  hasAudio,
  loadClipIndex,
  playSentence,
  type ClipIndex,
} from '../../platform/audio.ts';
import { speak } from '../../platform/speech.ts';
import { recordReview } from '../../data/repositories/reviews.ts';
import { recordCategoryAttempt, recordDrillAnswer } from '../../data/repositories/contrastive.ts';
import { advanceCursor, completeSession } from '../../data/repositories/sessions.ts';
import { deferItem } from '../../data/repositories/deferrals.ts';
import {
  EMPTY_PACK,
  loadContrastive,
  type Category,
  type ContrastivePack,
} from '../../data/contrastive.ts';
import { buildTask, type Task } from './task.ts';
import { buildDrillTask, isDrillId, type DrillTask } from './drill.ts';
import { knownItemIds } from '../../core/coverage.ts';
import { db } from '../../data/db.ts';
import {
  ClozeTask,
  DictationTask,
  ExposureTask,
  FreeProductionTask,
  KanjiTask,
  ProductionTask,
  RecognitionTask,
  type AnswerPayload,
} from './TaskViews.tsx';
import { saveMnemonic } from '../../data/repositories/mnemonics.ts';
import { ContrastiveNote, DrillPrompt } from './DrillViews.tsx';
import type { Profile, Session } from '../../data/types.ts';
import type { LadderDecision } from '../../core/ladder.ts';

/**
 * SPEC §2.13: interruption-safe. The cursor is written after every answer and
 * awaited before the next item renders, so a mid-session kill resumes exactly
 * where it stopped with every review log intact.
 *
 * A session queue holds two kinds of entry — lexeme items and contrastive drill
 * ids (SPEC §3.3) — routed by `isDrillId`. Drills are not FSRS cards, so they go
 * to a different writer; see src/data/repositories/contrastive.ts.
 */

interface SessionScreenProps {
  profile: Profile;
  session: Session;
  onFinish: () => void;
  /**
   * Called once the first question is actually on screen. The speech probe
   * hangs off this: touching `speechSynthesis` before the learner has something
   * to answer can freeze the main thread for seconds (see src/platform/speech.ts).
   */
  onFirstQuestion?: () => void;
}

type Entry =
  | { kind: 'item'; task: Task }
  | { kind: 'drill'; task: DrillTask };

interface Reveal {
  result: GradeResult;
  decision: LadderDecision;
  answer: string;
  /** The word this card was about, and what it means (SPEC §2.3, D59). */
  headword: string;
  gloss: readonly string[];
  /** The card itself, so it can stay on screen without staying answerable. */
  task: Task;
  /** What the learner actually gave, for the "you said" line. */
  raw: string;
  /** SPEC §2.9: categories this wrong answer matched, with their authored notes. */
  interference: Category[];
}

interface DrillReveal {
  correct: boolean;
  raw: string;
  task: DrillTask;
}

interface Tally {
  strengthened: number;
  learned: number;
  promoted: number;
  drills: number;
}

export const SessionScreen = ({
  profile,
  session,
  onFinish,
  onFirstQuestion,
}: SessionScreenProps) => {
  const lang = profile.targets[0] ?? 'en';
  const [cursor, setCursor] = useState(session.resumeCursor);
  const [entry, setEntry] = useState<Entry | null>(null);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [drillReveal, setDrillReveal] = useState<DrillReveal | null>(null);
  const [tally, setTally] = useState<Tally>({
    strengthened: 0,
    learned: 0,
    promoted: 0,
    drills: 0,
  });
  const [finished, setFinished] = useState(cursor >= session.itemIds.length);
  // Set when the task actually renders, not during render — `latencyMs` is a
  // real measurement (SPEC §6) and must start from when the learner saw it.
  const shownAt = useRef(0);
  // The known-set drives the i+1 choice of which sentence teaches a word
  // (SPEC §2.4). Loaded once per session, not per card.
  const [known, setKnown] = useState<ReadonlySet<string>>(new Set());
  // Both start empty rather than null, and **nothing waits on them**. Neither is
  // needed to render the first question, and SPEC §5.4 gives that question a 3s
  // budget from icon tap — a clip index that 404s (no audio ships yet) and a
  // contrastive pack that only matters for drills have no business in front of
  // it. Empty is also the conservative reading: no clips means no L4 (§2.6).
  const [clips, setClips] = useState<ClipIndex>(EMPTY_CLIP_INDEX);
  const [pack, setPack] = useState<ContrastivePack>(EMPTY_PACK);

  useEffect(() => {
    void (async () => {
      const cards = await db.cards.where('profileId').equals(profile.id).toArray();
      setKnown(knownItemIds(cards, Date.now()));
    })();
    void loadClipIndex(lang).then(setClips);
    void loadContrastive(lang).then(setPack);
  }, [profile.id, lang]);

  /**
   * SPEC §2.6: a pre-cached clip *or* a working voice. Either satisfies the
   * condition; neither means the L4 rung is withheld for this item.
   */
  const hasAudioFor = useMemo(
    () => (sentenceId: string) => hasAudio(clips, sentenceId, lang),
    [clips, lang],
  );

  // Load the entry at the cursor. Skipping unbuildable items keeps a single
  // missing sentence from stalling the whole session.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      for (let index = cursor; index < session.itemIds.length; index++) {
        const id = session.itemIds[index];
        if (!id) continue;
        const seed = session.startedAt + index;
        const built: Entry | null = isDrillId(id)
          ? await buildDrillTask(lang, id, seed).then((task) =>
              task ? ({ kind: 'drill', task } as const) : null,
            )
          : await buildTask(profile.id, id, seed, { known, hasAudioFor }).then((task) =>
              task ? ({ kind: 'item', task } as const) : null,
            );
        if (cancelled) return;
        if (built) {
          if (index !== cursor) setCursor(index);
          setEntry(built);
          shownAt.current = Date.now();
          // After the paint, not before it: this is what releases the speech
          // probe, and the probe can block the main thread outright.
          requestAnimationFrame(() => onFirstQuestion?.());
          return;
        }
      }
      if (!cancelled) setFinished(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    cursor,
    profile.id,
    session.itemIds,
    session.startedAt,
    known,
    lang,
    clips,
    pack,
    hasAudioFor,
    onFirstQuestion,
  ]);

  /**
   * One click is one answer.
   *
   * Every handler below is `async` and every one of them writes. Nothing
   * stopped a second click landing while the first was still in its `await`,
   * and the cost is not a cosmetic double-render: `recordReview` is the only
   * writer of FSRS state (invariant 0) and it appends to `ReviewLog`, which is
   * **append-only by Dexie hook and cannot be corrected afterwards**
   * (invariant 1). Two clicks on "Oke, paham" therefore meant two review rows
   * and two FSRS advances for one item, permanently, in the log §9 computes the
   * honest retention rate from. A drill did the same to `DrillAttempt`.
   *
   * The latch is a **ref**, not state: `setState` is asynchronous and two
   * clicks in one tick would both read the old value. The state beside it only
   * drives the disabled attributes, which is the visible half.
   */
  const writing = useRef(false);
  const [busy, setBusy] = useState(false);

  const once = async (work: () => Promise<void>): Promise<void> => {
    if (writing.current) return;
    writing.current = true;
    setBusy(true);
    try {
      await work();
    } finally {
      writing.current = false;
      setBusy(false);
    }
  };

  const playAudio = useCallback(() => {
    if (!entry) return;
    if (entry.kind === 'item') {
      void playSentence(clips, entry.task.sentence.id, entry.task.sentence.text, lang);
    } else if (entry.task.drill.say) {
      // A minimal pair is synthesized, not pre-recorded: the point is the
      // contrast between two words, and it is only ever scheduled when the
      // device has been proven able to speak (SPEC §2.6).
      void speak(entry.task.drill.say, lang);
    }
  }, [entry, clips, lang]);

  /**
   * Moves to the next item. Deliberately *un*guarded, because it is called from
   * inside `handleAnswer` — which already holds the latch — as well as from the
   * feedback button, which takes it via `once`.
   */
  const advance = useCallback(async () => {
    const next = cursor + 1;
    setReveal(null);
    setDrillReveal(null);
    // Clear the card as well as the feedback. Without this the *previous* item
    // stays on screen and answerable for the moment it takes to build the next
    // one — the learner can answer a card that has already been graded, and a
    // second `recordReview` lands on it. The build reads from memory, so the
    // "preparing" state is a frame or two.
    setEntry(null);
    // Persist *before* moving on — this await is the resume guarantee.
    await advanceCursor(session.id, next);
    if (next >= session.itemIds.length) {
      await completeSession(session.id, Date.now());
      setFinished(true);
      return;
    }
    setCursor(next);
  }, [cursor, session.id, session.itemIds.length]);

  const handleNext = useCallback(() => void once(advance), [advance]);

  const handleAnswer = useCallback(
    async (payload: AnswerPayload) => {
      // The backstop for a second answer arriving after the first has landed.
      // The card is unmounted the moment a verdict exists (D75), so nothing on
      // screen can reach here — but this is the only writer of permanent,
      // uncorrectable state (invariants 0 and 1), and one comparison is a
      // cheaper guarantee than a layout that must never change back.
      if (entry?.kind !== 'item' || reveal !== null) return;
      const task = entry.task;

      // L6 is free production: there is no right answer to match, and the only
      // thing we can honestly check is that the learner used the word (§2.3).
      // The view enforces that before submitting, so reaching here is a pass.
      const result =
        task.kind === 'free'
          ? ({ outcome: 'correct', reason: 'exact', distance: 0, tolerance: 0, matched: task.answer } as const)
          : gradeAnswer(payload.raw, task.answer);
      // L0 is errorless exposure: the learner confirms, they do not answer.
      const grade = task.kind === 'exposure' ? 3 : gradeForOutcome(result.outcome);
      const wasNew = task.ladderLevel === 0;

      // SPEC §2.9 / §3.3: a wrong answer that matches a known Indonesian-L1
      // pattern is evidence about that pattern, and it is logged as such.
      const hits =
        result.outcome === 'wrong' && task.kind !== 'exposure'
          ? detectInterference({
              raw: payload.raw,
              expected: task.answer,
              ...(task.cloze ? { before: task.cloze.before } : {}),
            })
          : [];
      const matched = hits.filter((id) => pack.byCategory.has(id));

      const { decision } = await recordReview({
        profileId: profile.id,
        itemId: task.itemId,
        grade,
        confidence: payload.confidence,
        latencyMs: Date.now() - shownAt.current,
        answerRaw: payload.raw,
        correct: result.outcome !== 'wrong',
        now: Date.now(),
        audioAvailable: hasAudioFor(task.sentence.id),
        ...(matched.length > 0 ? { interferenceHit: matched } : {}),
      });

      if (matched.length > 0) {
        await recordCategoryAttempt({
          profileId: profile.id,
          lang,
          categoryIds: matched,
          correct: false,
          now: Date.now(),
        });
      }

      setTally((current) => ({
        ...current,
        strengthened: current.strengthened + (result.outcome === 'wrong' ? 0 : 1),
        learned: current.learned + (wasNew ? 1 : 0),
        promoted: current.promoted + (decision.change === 'promoted' ? 1 : 0),
      }));
      // L0 asked nothing, so there is nothing to reveal. It used to submit the
      // headword as its own answer, grade it "correct", and congratulate the
      // learner for reading — two taps and a compliment nobody earned. The
      // review is still recorded above (invariant 0: the confirmation *is* the
      // response); any promotion it caused is reported in the session summary.
      if (task.kind === 'exposure') {
        await advance();
        return;
      }

      setReveal({
        result,
        decision,
        answer: task.answer,
        headword: task.headword,
        gloss: task.gloss ?? [],
        task,
        raw: payload.raw,
        interference: matched.flatMap((id) => {
          const category = pack.byCategory.get(id);
          return category ? [category] : [];
        }),
      });
    },
    [entry, profile.id, pack, lang, hasAudioFor, advance, reveal],
  );

  const handleDrillAnswer = useCallback(
    async (raw: string) => {
      if (entry?.kind !== 'drill' || drillReveal !== null) return;
      const { drill, category } = entry.task;
      const correct = gradeAnswer(raw, drill.answer).outcome !== 'wrong';

      await recordDrillAnswer({
        profileId: profile.id,
        lang,
        drillId: drill.id,
        categoryId: category.id,
        correct,
        answerRaw: raw,
        latencyMs: Date.now() - shownAt.current,
        ...(drill.difficulty !== undefined ? { itemDifficulty: drill.difficulty } : {}),
        now: Date.now(),
      });

      setTally((current) => ({ ...current, drills: current.drills + 1 }));
      setDrillReveal({ correct, raw, task: entry.task });
    },
    [entry, profile.id, lang, drillReveal],
  );


  /**
   * SPEC §2.14, autonomy: *"can always skip an item (belum perlu)"*.
   *
   * A skip is not an answer, so nothing here touches the scheduler — no
   * `recordReview`, no rating, no card. It records a request not to be shown
   * this for a while and moves on, and the window grows each time the same item
   * is declined. A drill has no item to defer, so it is simply passed over.
   */
  const handleSkip = useCallback(async () => {
    if (entry?.kind === 'item') {
      await deferItem(profile.id, entry.task.itemId, Date.now());
    }
    await advance();
  }, [entry, profile.id, advance]);

  const handleQuit = useCallback(async () => {
    await advanceCursor(session.id, cursor);
    onFinish();
  }, [cursor, session.id, onFinish]);

  if (finished) {
    return <SessionSummary tally={tally} onDone={onFinish} />;
  }

  if (!entry) {
    return (
      <Screen>
        <p className="mt-12 text-center text-stone-600 dark:text-slate-400">
          {copy.session.preparing}
        </p>
      </Screen>
    );
  }

  const view =
    entry.kind === 'drill' ? (
      <DrillPrompt
        key={entry.task.drill.id}
        task={entry.task}
        onAnswer={(raw) => void once(() => handleDrillAnswer(raw))}
        busy={busy}
        onPlayAudio={playAudio}
      />
    ) : entry.task.kind === 'exposure' ? (
      <ExposureTask
        task={entry.task}
        onAnswer={(payload) => void once(() => handleAnswer(payload))}
        busy={busy}
        onDefer={() => void once(handleSkip)}
        onPlayAudio={playAudio}
        audioAvailable={hasAudioFor(entry.task.sentence.id)}
      />
    ) : entry.task.kind === 'recognition' ? (
      <RecognitionTask
        task={entry.task}
        onAnswer={(payload) => void once(() => handleAnswer(payload))}
        busy={busy}
        onPlayAudio={playAudio}
        audioAvailable={hasAudioFor(entry.task.sentence.id)}
      />
    ) : entry.task.kind === 'kanji' ? (
      <KanjiTask
        key={entry.task.itemId}
        task={entry.task}
        onAnswer={(payload) => void once(() => handleAnswer(payload))}
        busy={busy}
        onPlayAudio={playAudio}
        audioAvailable={false}
        onSaveMnemonic={async (text) => {
          await saveMnemonic(profile.id, entry.task.itemId, text, Date.now());
        }}
      />
    ) : entry.task.kind === 'production' ? (
      <ProductionTask
        key={entry.task.itemId}
        task={entry.task}
        lang={lang}
        onAnswer={(payload) => void once(() => handleAnswer(payload))}
        busy={busy}
        onPlayAudio={playAudio}
        audioAvailable={false}
      />
    ) : entry.task.kind === 'free' ? (
      <FreeProductionTask
        key={entry.task.itemId}
        task={entry.task}
        onAnswer={(payload) => void once(() => handleAnswer(payload))}
        busy={busy}
        onPlayAudio={playAudio}
        audioAvailable={false}
      />
    ) : entry.task.kind === 'dictation' ? (
      <DictationTask
        key={entry.task.itemId}
        task={entry.task}
        onAnswer={(payload) => void once(() => handleAnswer(payload))}
        busy={busy}
        onPlayAudio={playAudio}
        audioAvailable
      />
    ) : (
      <ClozeTask
        key={entry.task.itemId}
        task={entry.task}
        onAnswer={(payload) => void once(() => handleAnswer(payload))}
        busy={busy}
        onPlayAudio={playAudio}
        audioAvailable={hasAudioFor(entry.task.sentence.id)}
      />
    );

  return (
    <Screen
      footer={
        // Answered: the whole verdict reads as one column in the page, and the
        // footer carries only the thing the learner is going to press (§10's
        // thumb zone). It used to hold the entire feedback inside its own
        // `max-h-[60vh]` scroller — a scroll region nested in a scrolling page,
        // with `flex-1` on the main column pushing it to the bottom and leaving
        // a dead band between the card and its own verdict.
        reveal || drillReveal ? (
          <Button onClick={handleNext} data-testid="next">
            {copy.session.feedback.next}
          </Button>
        ) : (
          <>
            {/* §2.14: declining is always available, and costs nothing. */}
            <button
              type="button"
              onClick={() => void once(handleSkip)}
              data-testid="session-skip"
              className="min-h-12 w-full rounded-2xl text-sm font-semibold text-stone-600 underline-offset-4 hover:underline dark:text-slate-400"
            >
              {copy.session.skipItem}
            </button>
            <button
              type="button"
              onClick={() => void handleQuit()}
              className="min-h-12 w-full text-sm text-stone-500 underline-offset-4 hover:underline dark:text-slate-400"
            >
              {copy.session.quit}
            </button>
          </>
        )
      }
    >
      <p
        className="text-sm text-stone-500 dark:text-slate-400"
        data-testid="session-progress"
      >
        {copy.session.progress(cursor + 1, session.itemIds.length)}
      </p>
      <div aria-hidden className="mt-2 h-1 rounded-full bg-stone-200 dark:bg-slate-800">
        <div
          className="h-1 rounded-full bg-teal-700 motion-safe:transition-all dark:bg-teal-400"
          style={{ width: `${((cursor + 1) / session.itemIds.length) * 100}%` }}
        />
      </div>

      {/* Answered cards retire: the content stays because the feedback refers
          to it, the controls go because a card that has been answered is not a
          question any more (D75). */}
      <div className="mt-6 flex flex-col gap-3">
        {reveal ? (
          <>
            <SwipeCard right={{ label: copy.session.swipe.next, onCommit: handleNext }}>
              <AnsweredCard task={reveal.task} raw={reveal.raw} />
            </SwipeCard>
            <Feedback reveal={reveal} />
          </>
        ) : drillReveal ? (
          <>
            <SwipeCard right={{ label: copy.session.swipe.next, onCommit: handleNext }}>
              <AnsweredDrill reveal={drillReveal} />
            </SwipeCard>
            <DrillFeedback reveal={drillReveal} />
          </>
        ) : (
          view
        )}
      </div>
    </Screen>
  );
};

/**
 * The card, after it has been answered — present but no longer a question.
 *
 * The feedback refers to this card: "the answer was X" only means something
 * against the sentence X belongs in, and a cloze's correct answer is close to
 * useless without the blank it goes in. So it stays. What it loses is every
 * control that could produce a second answer, which is what made the
 * duplicate-review hole reachable at all (D72) — the guard in `handleAnswer`
 * stays as well, but this is the half that makes it structural rather than
 * refused.
 *
 * **It is not dimmed.** The obvious way to say "finished" is opacity, and
 * opacity on text is exactly what the dark-mode contrast gate (D71) exists to
 * catch — a shade that clears AA at full strength does not at 60%. It retires by
 * losing its controls and saying so, at full contrast.
 */
const AnsweredCard = ({ task, raw }: { task: Task; raw: string }) => {
  const same = raw.trim().toLowerCase() === task.answer.trim().toLowerCase();
  const filled = (
    <span className="mx-1 inline-block rounded-lg bg-teal-50 px-2 py-0.5 font-bold text-teal-900 dark:bg-teal-950 dark:text-teal-200">
      {task.answer}
    </span>
  );

  return (
    <div
      className="rounded-2xl border-2 border-stone-200 p-4 dark:border-slate-800"
      data-testid="answered-card"
    >
      <p className="text-xs tracking-wide text-stone-500 uppercase dark:text-slate-400">
        {copy.session.answered.label}
      </p>

      <p className="mt-2 text-xl leading-snug font-semibold">
        {task.cloze ? (
          <>
            {task.cloze.before}
            {filled}
            {task.cloze.after}
          </>
        ) : (
          task.sentence.text
        )}
      </p>

      {task.translation.length > 0 ? (
        <p className="mt-1 text-stone-600 dark:text-slate-400">{task.translation}</p>
      ) : null}

      {/* Only where it adds something: repeating a correct answer back at the
          learner as "you said" is noise. */}
      {!same && raw.trim().length > 0 ? (
        <p className="mt-2 text-sm text-stone-600 dark:text-slate-400" data-testid="answered-yours">
          {copy.session.answered.yours(raw)}
        </p>
      ) : null}
    </div>
  );
};

/** The same, for a drill: the prompt stays, the options do not. */
const AnsweredDrill = ({ reveal }: { reveal: DrillReveal }) => (
  <div
    className="rounded-2xl border-2 border-stone-200 p-4 dark:border-slate-800"
    data-testid="answered-card"
  >
    <p className="text-xs tracking-wide text-stone-500 uppercase dark:text-slate-400">
      {copy.session.answered.label}
    </p>
    <p className="mt-2 text-xl leading-snug font-semibold">{reveal.task.drill.prompt}</p>
    {reveal.raw.trim().toLowerCase() !== reveal.task.drill.answer.trim().toLowerCase() &&
    reveal.raw.trim().length > 0 ? (
      <p className="mt-2 text-sm text-stone-600 dark:text-slate-400" data-testid="answered-yours">
        {copy.session.answered.yours(reveal.raw)}
      </p>
    ) : null}
  </div>
);

/**
 * SPEC §2.7: a near-miss is shown as a near-miss. SPEC §2.9: where the error
 * matches an Indonesian-L1 pattern, the contrastive note comes with it — in
 * Indonesian, with the L1 pattern named first.
 */
const Feedback = ({ reveal }: { reveal: Reveal }) => {
  const { result, decision, answer } = reveal;
  const tone =
    result.outcome === 'correct'
      ? 'bg-teal-50 text-teal-900 dark:bg-teal-950 dark:text-teal-100'
      : result.outcome === 'near-miss'
        ? 'bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100'
        : 'bg-stone-100 text-stone-900 dark:bg-slate-900 dark:text-slate-100';

  const message =
    result.outcome === 'correct'
      ? copy.session.feedback.correct
      : result.outcome === 'near-miss'
        ? copy.session.feedback.nearMiss(answer)
        : copy.session.feedback.wrong(answer);

  return (
    <div>
      <div className={`rounded-2xl p-4 ${tone}`} role="status" data-testid="feedback">
        <p className="font-semibold">{message}</p>
        {decision.leech ? (
          <p className="mt-1 text-sm">{copy.session.feedback.leech}</p>
        ) : decision.change === 'promoted' ? (
          <p className="mt-1 text-sm">{copy.session.feedback.promoted}</p>
        ) : decision.change === 'demoted' ? (
          <p className="mt-1 text-sm">{copy.session.feedback.demoted}</p>
        ) : null}
      </div>

      {/*
        What the word means, after the answer rather than before it.
        Every rung can show this safely once the card is graded — the gloss
        cannot give away an answer that has already been given — and it is the
        one place the meaning is useful on *every* card rather than just L0.
        Where there is no entry, that is said rather than left blank (D59).
      */}
      <div className="mt-3 rounded-2xl border-2 border-stone-200 p-3 dark:border-slate-800">
        <p className="text-xs tracking-wide text-stone-500 uppercase dark:text-slate-400">
          {copy.session.meaning.label}
        </p>
        <p className="mt-1">
          <span className="font-semibold">{reveal.headword}</span>
          {reveal.gloss.length > 0 ? (
            <span className="ml-2 text-stone-600 dark:text-slate-400" data-testid="feedback-gloss">
              {reveal.gloss.join('; ')}
            </span>
          ) : null}
        </p>
        {reveal.gloss.length === 0 ? (
          <p className="mt-1 text-sm text-stone-600 dark:text-slate-400" data-testid="feedback-no-gloss">
            {copy.session.meaning.none}
          </p>
        ) : null}
      </div>

      {reveal.interference.map((category) => (
        <div className="mt-3" key={category.id}>
          {/* No per-item explanation: this error happened in the wild rather
              than in an authored drill, so the category's own summary leads. */}
          <ContrastiveNote category={category} />
        </div>
      ))}
    </div>
  );
};

const DrillFeedback = ({ reveal }: { reveal: DrillReveal }) => (
  <div>
    <div
      className={`rounded-2xl p-4 ${
        reveal.correct
          ? 'bg-teal-50 text-teal-900 dark:bg-teal-950 dark:text-teal-100'
          : 'bg-stone-100 text-stone-900 dark:bg-slate-900 dark:text-slate-100'
      }`}
      role="status"
      data-testid="feedback"
    >
      <p className="font-semibold">
        {reveal.correct
          ? copy.session.feedback.correct
          : copy.session.feedback.wrong(reveal.task.drill.answer)}
      </p>
    </div>

    <div className="mt-3">
      <ContrastiveNote category={reveal.task.category} explain={reveal.task.drill.explain} />
    </div>
  </div>
);

/** SPEC §10: the end screen shows what got stronger, never points. */
const SessionSummary = ({ tally, onDone }: { tally: Tally; onDone: () => void }) => {
  const lines = [
    tally.strengthened > 0 ? copy.session.summary.strengthened(tally.strengthened) : null,
    tally.learned > 0 ? copy.session.summary.learned(tally.learned) : null,
    tally.promoted > 0 ? copy.session.summary.promoted(tally.promoted) : null,
    tally.drills > 0 ? copy.session.summary.drilled(tally.drills) : null,
  ].filter((line): line is string => line !== null);

  return (
    <Screen footer={<Button onClick={onDone}>{copy.session.summary.done}</Button>}>
      <h1 className="mt-8 text-2xl font-bold" data-testid="session-summary">
        {copy.session.summary.heading}
      </h1>
      <ul className="mt-4 flex flex-col gap-2 text-lg text-stone-700 dark:text-slate-300">
        {lines.length > 0 ? (
          lines.map((line) => <li key={line}>{line}</li>)
        ) : (
          <li>{copy.session.summary.nothing}</li>
        )}
      </ul>
    </Screen>
  );
};
