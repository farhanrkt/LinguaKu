import { useCallback, useState } from 'react';
import { copy } from '../../i18n/id.ts';
import { Button } from '../../ui/Button.tsx';
import { makeCloze } from '../../core/cloze.ts';
import { gradeAnswer } from '../../core/grader.ts';
import { lexemeIdFor } from '../../core/coverage.ts';
import { recordReadingAttempt } from '../../data/repositories/reading.ts';
import type { PassageItem } from '../../core/reader.ts';
import type { Passage } from '../../data/passages.ts';
import type { TargetLang } from '../../data/types.ts';

/**
 * A passage, and the one check that turns reading into a measurement.
 *
 * SPEC §9's radar has had `reading` as a permanent `null` since M5, for the
 * honest reason that nothing measured it. The check here is deliberately the
 * smallest thing that could: a cloze over a word in the text the learner has
 * just read, which is the same retrieval mechanic §2.2 already requires,
 * applied to running text rather than to a sentence pair.
 *
 * **What it is not** is a comprehension quiz. Writing questions about a passage
 * needs authored questions per passage — there are 1,680 of them — or a model
 * to generate them, and D4 keeps that out. Inventing multiple-choice questions
 * from the text would produce items whose answer is findable by matching
 * strings, which measures scanning rather than comprehension.
 *
 * The word blanked is one the learner **already knows**: the check is whether
 * they can hold the sense of the sentence well enough to put it back, not
 * whether they can guess a word they were never taught.
 */

interface PassageViewProps {
  item: PassageItem<Passage>;
  profileId: string;
  lang: TargetLang;
  known: ReadonlySet<string>;
  onTapWord: (token: string) => void;
}

/** Picks a known content word to blank — long enough not to be a coin flip. */
const pickTarget = (text: string, known: ReadonlySet<string>, lang: string): string | null => {
  const seen = new Set<string>();
  for (const raw of text.split(/\s+/)) {
    const token = raw.replace(/[^\p{L}\p{N}'-]/gu, '').toLowerCase();
    if (token.length < 4 || seen.has(token)) continue;
    seen.add(token);
    if (!known.has(lexemeIdFor(lang, token))) continue;
    // One occurrence only: blanking a word that appears twice leaves the answer
    // printed elsewhere on the screen.
    if (text.toLowerCase().split(token).length - 1 !== 1) continue;
    return token;
  }
  return null;
};

export const PassageView = ({ item, profileId, lang, known, onTapWord }: PassageViewProps) => {
  const [checking, setChecking] = useState(false);
  const [answer, setAnswer] = useState('');
  const [result, setResult] = useState<'correct' | 'near' | 'wrong' | null>(null);

  const target = pickTarget(item.passage.text, known, lang);
  const cloze = target === null ? null : makeCloze(item.passage.text, target);

  const submit = useCallback(async () => {
    if (!cloze || target === null) return;
    const graded = gradeAnswer(answer, cloze.answer);
    setResult(
      graded.outcome === 'correct' ? 'correct' : graded.outcome === 'near-miss' ? 'near' : 'wrong',
    );
    await recordReadingAttempt({
      profileId,
      lang,
      passageId: item.passage.id,
      itemId: lexemeIdFor(lang, target),
      // A near miss is a typo, not a comprehension failure (SPEC §2.7).
      correct: graded.outcome !== 'wrong',
      answerRaw: answer,
      coverage: item.coverage,
      now: Date.now(),
    });
  }, [answer, cloze, item.coverage, item.passage.id, lang, profileId, target]);

  return (
    <article className="mt-6 rounded-2xl border-2 border-stone-200 p-4 dark:border-slate-800">
      <h2 className="text-sm font-semibold text-stone-500 dark:text-slate-500">
        {/* CC BY-SA attribution, per paragraph rather than per corpus. */}
        {copy.reader.passage.from(item.passage.title)}
      </h2>

      <p className="mt-3 text-lg leading-relaxed" data-testid="passage-text">
        {item.passage.text.split(/(\s+)/).map((chunk, index) =>
          /^\s+$/.test(chunk) ? (
            chunk
          ) : (
            <button
              key={index}
              type="button"
              onClick={() => onTapWord(chunk.replace(/[^\p{L}\p{N}'-]/gu, ''))}
              className="rounded underline-offset-4 hover:underline"
            >
              {chunk}
            </button>
          ),
        )}
      </p>

      {checking && cloze ? (
        <div className="mt-4 rounded-xl bg-stone-100 p-3 dark:bg-slate-900">
          <p className="text-sm text-stone-600 dark:text-slate-400">
            {copy.reader.passage.checkInstruction}
          </p>
          <p className="mt-2 text-base">
            {cloze.before}
            <span className="font-bold">____</span>
            {cloze.after}
          </p>
          {result === null ? (
            <>
              <input
                type="text"
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                aria-label={copy.reader.passage.checkPlaceholder}
                placeholder={copy.reader.passage.checkPlaceholder}
                data-testid="passage-check-input"
                autoComplete="off"
                className="mt-3 min-h-14 w-full rounded-2xl border-2 border-stone-300 px-4 text-lg dark:border-slate-700 dark:bg-slate-950"
              />
              <div className="mt-3">
                <Button
                  onClick={() => void submit()}
                  disabled={answer.trim().length === 0}
                  data-testid="passage-check-submit"
                >
                  {copy.session.drill.submit}
                </Button>
              </div>
            </>
          ) : (
            <p className="mt-3 font-semibold" data-testid="passage-check-result">
              {result === 'correct'
                ? copy.session.feedback.correct
                : result === 'near'
                  ? copy.session.feedback.nearMiss(cloze.answer)
                  : copy.session.feedback.wrong(cloze.answer)}
            </p>
          )}
        </div>
      ) : cloze ? (
        <button
          type="button"
          onClick={() => setChecking(true)}
          data-testid="passage-check-open"
          className="mt-4 min-h-12 w-full rounded-xl border-2 border-stone-300 px-4 text-sm font-semibold text-teal-800 dark:border-slate-700 dark:text-teal-300"
        >
          {copy.reader.passage.check}
        </button>
      ) : null}
    </article>
  );
};
