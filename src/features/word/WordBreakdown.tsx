import { copy } from '../../i18n/id.ts';
import { romajiOf, type KanjiInfo, type WordInfo } from '../../data/repositories/wordInfo.ts';

/**
 * One Japanese word, explained: its reading and romaji, its meaning, and —
 * where it is written with kanji — what each character means on its own. For a
 * word of two or more kanji the word's meaning is labelled as the combined one,
 * because that is exactly the question a learner looking at 学校 is asking:
 * what is 学, what is 校, and what do they make together.
 */
export const WordBreakdown = ({ info }: { info: WordInfo }) => {
  const compound = info.kanji.length >= 2;
  return (
    <div data-testid="word-breakdown">
      <p className="text-lg text-stone-700 dark:text-slate-300">
        {info.reading ? <span className="mr-2">{info.reading}</span> : null}
        <span className="text-stone-600 dark:text-slate-400" data-testid="word-romaji">
          {info.romaji}
        </span>
      </p>
      {/* An inflected token is explained through its word: 読み is 読む's. */}
      {info.base !== null ? (
        <p className="mt-1 text-sm text-stone-600 dark:text-slate-400" data-testid="word-base">
          {copy.word.baseForm(info.base, info.baseRomaji ?? '')}
        </p>
      ) : null}

      <p className="mt-3 text-xs tracking-wide text-stone-500 uppercase dark:text-slate-400">
        {info.form ? copy.word.formNote : compound ? copy.word.combinedMeaning : copy.word.meaning}
      </p>
      {info.meaning.length > 0 ? (
        <p className="mt-1 text-base text-stone-800 dark:text-slate-200" data-testid="word-meaning">
          {info.meaning.join('; ')}
        </p>
      ) : (
        <p className="mt-1 text-sm text-stone-600 dark:text-slate-400" data-testid="word-meaning-none">
          {copy.word.noMeaning}
        </p>
      )}

      <KanjiBreakdown kanji={info.kanji} />
    </div>
  );
};

/**
 * What each kanji in a word means on its own, with its readings. Headed "per
 * character" for a compound, where the word's own meaning above it is the
 * combined one, and "the character" for a word with one kanji.
 */
export const KanjiBreakdown = ({ kanji }: { kanji: readonly KanjiInfo[] }) => {
  if (kanji.length === 0) return null;
  const compound = kanji.length >= 2;
  return (
    <>
      <p className="mt-4 text-xs tracking-wide text-stone-500 uppercase dark:text-slate-400">
        {compound ? copy.word.perKanji : copy.word.theKanji}
      </p>
      <ul className="mt-2 flex flex-col gap-2" data-testid="word-kanji">
        {kanji.map((entry) => (
          <li
            key={entry.literal}
            className="flex items-baseline gap-3 rounded-xl bg-stone-100 p-2 dark:bg-slate-900"
          >
            <span className="text-2xl font-bold">{entry.literal}</span>
            <span className="text-sm">
              {entry.readings.length > 0 ? (
                <span className="block text-stone-700 dark:text-slate-300">
                  {entry.readings.map((reading) => `${reading} (${romajiOf(reading)})`).join(', ')}
                </span>
              ) : null}
              <span className="block text-stone-600 dark:text-slate-400">
                {entry.meanings.length > 0
                  ? copy.word.englishMeaning(entry.meanings.slice(0, 4).join(', '))
                  : copy.word.noKanjiEntry}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </>
  );
};
