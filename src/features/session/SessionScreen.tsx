import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { copy } from '../../i18n/id.ts';
import { Button } from '../../ui/Button.tsx';
import { Screen } from '../../ui/Screen.tsx';
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
  /** SPEC §2.9: categories this wrong answer matched, with their authored notes. */
  interference: Category[];
}

interface DrillReveal {
  correct: boolean;
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

  const handleAnswer = useCallback(
    async (payload: AnswerPayload) => {
      if (entry?.kind !== 'item') return;
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
      setReveal({
        result,
        decision,
        answer: task.answer,
        interference: matched.flatMap((id) => {
          const category = pack.byCategory.get(id);
          return category ? [category] : [];
        }),
      });
    },
    [entry, profile.id, pack, lang, hasAudioFor],
  );

  const handleDrillAnswer = useCallback(
    async (raw: string) => {
      if (entry?.kind !== 'drill') return;
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
      setDrillReveal({ correct, task: entry.task });
    },
    [entry, profile.id, lang],
  );

  const handleNext = useCallback(async () => {
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
        onAnswer={(raw) => void handleDrillAnswer(raw)}
        onPlayAudio={playAudio}
      />
    ) : entry.task.kind === 'exposure' ? (
      <ExposureTask
        task={entry.task}
        onAnswer={(payload) => void handleAnswer(payload)}
        onPlayAudio={playAudio}
        audioAvailable={hasAudioFor(entry.task.sentence.id)}
      />
    ) : entry.task.kind === 'recognition' ? (
      <RecognitionTask
        task={entry.task}
        onAnswer={(payload) => void handleAnswer(payload)}
        onPlayAudio={playAudio}
        audioAvailable={hasAudioFor(entry.task.sentence.id)}
      />
    ) : entry.task.kind === 'kanji' ? (
      <KanjiTask
        key={entry.task.itemId}
        task={entry.task}
        onAnswer={(payload) => void handleAnswer(payload)}
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
        onAnswer={(payload) => void handleAnswer(payload)}
        onPlayAudio={playAudio}
        audioAvailable={false}
      />
    ) : entry.task.kind === 'free' ? (
      <FreeProductionTask
        key={entry.task.itemId}
        task={entry.task}
        onAnswer={(payload) => void handleAnswer(payload)}
        onPlayAudio={playAudio}
        audioAvailable={false}
      />
    ) : entry.task.kind === 'dictation' ? (
      <DictationTask
        key={entry.task.itemId}
        task={entry.task}
        onAnswer={(payload) => void handleAnswer(payload)}
        onPlayAudio={playAudio}
        audioAvailable
      />
    ) : (
      <ClozeTask
        key={entry.task.itemId}
        task={entry.task}
        onAnswer={(payload) => void handleAnswer(payload)}
        onPlayAudio={playAudio}
        audioAvailable={hasAudioFor(entry.task.sentence.id)}
      />
    );

  return (
    <Screen
      footer={
        reveal ? (
          <Feedback reveal={reveal} onNext={() => void handleNext()} />
        ) : drillReveal ? (
          <DrillFeedback reveal={drillReveal} onNext={() => void handleNext()} />
        ) : (
          <button
            type="button"
            onClick={() => void handleQuit()}
            className="min-h-12 w-full text-sm text-stone-500 underline-offset-4 hover:underline dark:text-slate-500"
          >
            {copy.session.quit}
          </button>
        )
      }
    >
      <p
        className="text-sm text-stone-500 dark:text-slate-500"
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

      <div className="mt-6">{view}</div>
    </Screen>
  );
};

/**
 * SPEC §2.7: a near-miss is shown as a near-miss. SPEC §2.9: where the error
 * matches an Indonesian-L1 pattern, the contrastive note comes with it — in
 * Indonesian, with the L1 pattern named first.
 */
const Feedback = ({ reveal, onNext }: { reveal: Reveal; onNext: () => void }) => {
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
    <div className="max-h-[60vh] overflow-y-auto">
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

      {reveal.interference.map((category) => (
        <div className="mt-3" key={category.id}>
          {/* No per-item explanation: this error happened in the wild rather
              than in an authored drill, so the category's own summary leads. */}
          <ContrastiveNote category={category} />
        </div>
      ))}

      <div className="mt-3">
        <Button onClick={onNext} data-testid="next">
          {copy.session.feedback.next}
        </Button>
      </div>
    </div>
  );
};

const DrillFeedback = ({ reveal, onNext }: { reveal: DrillReveal; onNext: () => void }) => (
  <div className="max-h-[60vh] overflow-y-auto">
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

    <div className="mt-3">
      <Button onClick={onNext} data-testid="next">
        {copy.session.feedback.next}
      </Button>
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
