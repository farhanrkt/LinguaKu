import { useEffect, useRef, useState } from 'react';
import { copy } from '../../i18n/id.ts';
import {
  isRecordingAvailable,
  startRecording,
  type Recording,
} from '../../platform/speechRecognition.ts';

/**
 * SPEC §8's shadowing exercise: **play → record → compare**.
 *
 * The platform half of this has existed since M7 — `startRecording` samples a
 * peak envelope while recording and hands back a playable URL — and so has every
 * line of Indonesian it needs. Nothing ever called either. `docs/PROGRESS.md`
 * recorded shadowing as shipped, the launch checklist has a manual step for it,
 * and the catalog was described as finished; the component was the one layer
 * missing, so the exercise was absent from the app while three documents said
 * otherwise.
 *
 * **No score, and that is the decision rather than the shortfall** (M7's
 * recorded deviation). A recognizer tells a learner whether a *machine*
 * understood them; their own ear tells them how far they are from the model,
 * which is the thing being trained. It also works on every device with a
 * microphone, which recognition does not.
 *
 * Entirely optional: §5.1 says never block progression on speech, so this
 * grades nothing, writes nothing, and simply does not appear where the device
 * cannot do it.
 */

interface ShadowingProps {
  /** Speaks the model sentence. Only passed where the engine is proven live. */
  onPlayModel: () => void;
}

type Phase = 'idle' | 'recording' | 'done';

export const Shadowing = ({ onPlayModel }: ShadowingProps) => {
  const [phase, setPhase] = useState<Phase>('idle');
  const [level, setLevel] = useState(0);
  const [mine, setMine] = useState<Recording | null>(null);
  const stopper = useRef<(() => Promise<Recording | null>) | null>(null);

  // A recording outlives the card unless it is released: the object URL holds
  // the blob, and a learner shadowing a whole session would accumulate every
  // take until the tab closed.
  useEffect(() => () => mine?.stop(), [mine]);

  if (!isRecordingAvailable()) {
    return (
      <p className="mt-3 text-sm text-stone-600 dark:text-slate-400">{copy.session.speech.noMic}</p>
    );
  }

  const begin = async () => {
    const session = await startRecording(setLevel);
    // Permission refused, or no microphone after all. Costs the learner nothing
    // and says so rather than leaving a dead button.
    if (!session) {
      setPhase('idle');
      return;
    }
    stopper.current = session.stop;
    setPhase('recording');
  };

  const end = async () => {
    const take = await stopper.current?.();
    stopper.current = null;
    setLevel(0);
    setMine(take ?? null);
    setPhase(take ? 'done' : 'idle');
  };

  const button =
    'min-h-12 rounded-full border-2 border-stone-300 px-4 text-sm font-semibold text-teal-800 ' +
    'motion-safe:transition-colors hover:border-teal-700 ' +
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ' +
    'dark:border-slate-700 dark:text-teal-300 dark:focus-visible:outline-teal-300';

  return (
    <div className="mt-3" data-testid="shadowing">
      <div className="flex flex-wrap items-center gap-2">
        {phase === 'recording' ? (
          <button type="button" onClick={() => void end()} className={button} data-testid="shadow-stop">
            {copy.session.speech.recording}
          </button>
        ) : (
          <button type="button" onClick={() => void begin()} className={button} data-testid="shadow-record">
            {copy.session.speech.record}
          </button>
        )}

        {phase === 'done' && mine ? (
          <>
            <button
              type="button"
              onClick={() => void new Audio(mine.url).play().catch(() => undefined)}
              className={button}
              data-testid="shadow-play-mine"
            >
              {copy.session.speech.playMine}
            </button>
            <button type="button" onClick={onPlayModel} className={button}>
              {copy.session.speech.playModel}
            </button>
          </>
        ) : null}
      </div>

      {/* A level meter, not a waveform: it exists so the learner can see the
          microphone is hearing them. Width, not animation — there is nothing
          here for `prefers-reduced-motion` to switch off. */}
      {phase === 'recording' ? (
        <div className="mt-2 h-1.5 w-full rounded-full bg-stone-200 dark:bg-slate-800">
          <div
            className="h-1.5 rounded-full bg-teal-700 dark:bg-teal-400"
            style={{ width: `${Math.round(Math.min(1, level) * 100)}%` }}
          />
        </div>
      ) : null}

      {phase === 'done' ? (
        <p className="mt-2 text-sm text-stone-600 dark:text-slate-400">
          {copy.session.speech.compare}
        </p>
      ) : null}
    </div>
  );
};
