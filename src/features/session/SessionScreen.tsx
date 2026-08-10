import { useCallback, useEffect, useRef, useState } from 'react';
import { copy } from '../../i18n/id.ts';
import { Button } from '../../ui/Button.tsx';
import { Screen } from '../../ui/Screen.tsx';
import { gradeAnswer, gradeForOutcome, type GradeResult } from '../../core/grader.ts';
import { speak } from '../../platform/speech.ts';
import { recordReview } from '../../data/repositories/reviews.ts';
import { advanceCursor, completeSession } from '../../data/repositories/sessions.ts';
import { buildTask, type Task } from './task.ts';
import { ClozeTask, ExposureTask, RecognitionTask, type AnswerPayload } from './TaskViews.tsx';
import type { Profile, Session } from '../../data/types.ts';
import type { LadderDecision } from '../../core/ladder.ts';

/**
 * SPEC §2.13: interruption-safe. The cursor is written after every answer and
 * awaited before the next item renders, so a mid-session kill resumes exactly
 * where it stopped with every review log intact.
 */

interface SessionScreenProps {
  profile: Profile;
  session: Session;
  audioAvailable: boolean;
  onFinish: () => void;
}

interface Reveal {
  result: GradeResult;
  decision: LadderDecision;
  answer: string;
}

interface Tally {
  strengthened: number;
  learned: number;
  promoted: number;
}

export const SessionScreen = ({
  profile,
  session,
  audioAvailable,
  onFinish,
}: SessionScreenProps) => {
  const [cursor, setCursor] = useState(session.resumeCursor);
  const [task, setTask] = useState<Task | null>(null);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [tally, setTally] = useState<Tally>({ strengthened: 0, learned: 0, promoted: 0 });
  const [finished, setFinished] = useState(cursor >= session.itemIds.length);
  // Set when the task actually renders, not during render — `latencyMs` is a
  // real measurement (SPEC §6) and must start from when the learner saw it.
  const shownAt = useRef(0);

  // Load the item at the cursor. Skipping unbuildable items keeps a single
  // missing sentence from stalling the whole session.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      for (let index = cursor; index < session.itemIds.length; index++) {
        const itemId = session.itemIds[index];
        if (!itemId) continue;
        const built = await buildTask(profile.id, itemId, session.startedAt + index);
        if (cancelled) return;
        if (built) {
          if (index !== cursor) setCursor(index);
          setTask(built);
          shownAt.current = Date.now();
          return;
        }
      }
      if (!cancelled) setFinished(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [cursor, profile.id, session.itemIds, session.startedAt]);

  const playAudio = useCallback(() => {
    if (task) void speak(task.sentence.text, profile.targets[0] ?? 'en');
  }, [task, profile.targets]);

  const handleAnswer = useCallback(
    async (payload: AnswerPayload) => {
      if (!task) return;

      const result = gradeAnswer(payload.raw, task.answer);
      // L0 is errorless exposure: the learner confirms, they do not answer.
      const grade = task.kind === 'exposure' ? 3 : gradeForOutcome(result.outcome);
      const wasNew = task.ladderLevel === 0;

      const { decision } = await recordReview({
        profileId: profile.id,
        itemId: task.itemId,
        grade,
        confidence: payload.confidence,
        latencyMs: Date.now() - shownAt.current,
        answerRaw: payload.raw,
        correct: result.outcome !== 'wrong',
        now: Date.now(),
      });

      setTally((current) => ({
        strengthened: current.strengthened + (result.outcome === 'wrong' ? 0 : 1),
        learned: current.learned + (wasNew ? 1 : 0),
        promoted: current.promoted + (decision.change === 'promoted' ? 1 : 0),
      }));
      setReveal({ result, decision, answer: task.answer });
    },
    [task, profile.id],
  );

  const handleNext = useCallback(async () => {
    const next = cursor + 1;
    setReveal(null);
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

  if (!task) {
    return (
      <Screen>
        <p className="mt-12 text-center text-stone-600 dark:text-slate-400">
          {copy.session.preparing}
        </p>
      </Screen>
    );
  }

  const view =
    task.kind === 'exposure' ? (
      <ExposureTask
        task={task}
        onAnswer={(payload) => void handleAnswer(payload)}
        onPlayAudio={playAudio}
        audioAvailable={audioAvailable}
      />
    ) : task.kind === 'recognition' ? (
      <RecognitionTask
        task={task}
        onAnswer={(payload) => void handleAnswer(payload)}
        onPlayAudio={playAudio}
        audioAvailable={audioAvailable}
      />
    ) : (
      <ClozeTask
        key={task.itemId}
        task={task}
        onAnswer={(payload) => void handleAnswer(payload)}
        onPlayAudio={playAudio}
        audioAvailable={audioAvailable}
      />
    );

  return (
    <Screen
      footer={
        reveal ? (
          <Feedback reveal={reveal} onNext={() => void handleNext()} />
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
 * SPEC §2.7: a near-miss is shown as a near-miss. SPEC §2.9's contrastive
 * explanations arrive with the interference engine in M4 — until then feedback
 * states the answer plainly and never scolds.
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
      <div className="mt-3">
        <Button onClick={onNext} data-testid="next">
          {copy.session.feedback.next}
        </Button>
      </div>
    </div>
  );
};

/** SPEC §10: the end screen shows what got stronger, never points. */
const SessionSummary = ({ tally, onDone }: { tally: Tally; onDone: () => void }) => {
  const lines = [
    tally.strengthened > 0 ? copy.session.summary.strengthened(tally.strengthened) : null,
    tally.learned > 0 ? copy.session.summary.learned(tally.learned) : null,
    tally.promoted > 0 ? copy.session.summary.promoted(tally.promoted) : null,
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
