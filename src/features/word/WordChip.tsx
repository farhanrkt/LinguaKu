import { useState } from 'react';
import { romajiOfWord } from '../../core/kana.ts';
import { WordSheet } from './WordSheet.tsx';

/** The romaji of a Japanese headword, or null for one written in Latin. */
export const romajiFor = (
  headword: string,
  reading?: string | null,
  romaji?: string | null,
): string | null => romajiOfWord(headword, reading, romaji);

/**
 * A word shown on its own, outside a sentence: the "slipping" lists on the home
 * and progress screens, the glossary's set-aside list.
 *
 * A Japanese word carries its romaji beside it and opens, on a tap, to its
 * meaning and its kanji (D111) — the same sheet a word in a sentence opens. A
 * word in Latin script is just the word: there is nothing to add to "house".
 */
export const WordChip = ({
  headword,
  reading,
  romaji: compiled,
  className,
}: {
  headword: string;
  reading?: string | null | undefined;
  /** A phrase's compiled romaji (a chunk), which keeps its word spacing. */
  romaji?: string | null | undefined;
  /** The chip's look, which differs between the screens that use it. */
  className: string;
}) => {
  const [open, setOpen] = useState(false);
  const romaji = romajiFor(headword, reading, compiled);
  if (romaji === null) return <span className={className}>{headword}</span>;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="word-chip"
        className={`${className} min-h-12 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 dark:focus-visible:outline-teal-300`}
      >
        {headword}
        <span className="ml-1.5 font-normal text-stone-600 dark:text-slate-400">{romaji}</span>
      </button>
      {open ? <WordSheet token={headword} reading={reading ?? null} onClose={() => setOpen(false)} /> : null}
    </>
  );
};
