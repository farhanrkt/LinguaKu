import { useEffect, useState } from 'react';
import { copy } from '../../i18n/id.ts';
import { Button } from '../../ui/Button.tsx';
import { wordInfo, type WordInfo } from '../../data/repositories/wordInfo.ts';
import { WordBreakdown } from './WordBreakdown.tsx';

/**
 * The bottom sheet a tapped Japanese word opens, anywhere a sentence is shown.
 * A sheet rather than a screen, for the same reason as the reader's word
 * panel: a learner should not lose their card to read one word.
 */
export const WordSheet = ({
  token,
  reading,
  onClose,
}: {
  token: string;
  reading: string | null;
  onClose: () => void;
}) => {
  const [info, setInfo] = useState<WordInfo | null>(null);
  useEffect(() => {
    let live = true;
    void wordInfo(token, reading).then((result) => {
      if (live) setInfo(result);
    });
    return () => {
      live = false;
    };
  }, [token, reading]);

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md rounded-t-3xl border-t-2 border-stone-200 bg-white p-5 shadow-lg dark:border-slate-800 dark:bg-slate-950"
      role="dialog"
      aria-label={token}
      data-testid="word-sheet"
    >
      <p className="text-3xl font-bold">{token}</p>
      <div className="mt-2">{info ? <WordBreakdown info={info} /> : null}</div>
      <div className="mt-4">
        <Button variant="quiet" onClick={onClose} className="border-2 border-stone-300 dark:border-slate-700" data-testid="word-sheet-close">
          {copy.word.close}
        </Button>
      </div>
    </div>
  );
};
