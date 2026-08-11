import { useCallback, useEffect, useState } from 'react';
import { copy } from '../../i18n/id.ts';
import { Button } from '../../ui/Button.tsx';
import { Screen } from '../../ui/Screen.tsx';
import { selectReading, tokensOf, type ReaderItem } from '../../core/reader.ts';
import { knownItemIds, lexemeIdFor } from '../../core/coverage.ts';
import { isKanji, toHiragana } from '../../core/kana.ts';
import { bandForAbility } from '../../core/placement.ts';
import { loadSentences, type AnchorSentence } from '../../data/content.ts';
import { db } from '../../data/db.ts';
import { vocabularyAbility } from '../../data/repositories/abilities.ts';
import { mineItem, minedItemIds, unmineItem } from '../../data/repositories/mining.ts';
import type { FrequencyBand } from '../../core/frequency.ts';
import type { Item, Profile } from '../../data/types.ts';

/**
 * The graded reader (SPEC §8), which the spec calls "the retention engine" and
 * asks to make feel instant.
 *
 * Everything it needs is already on the device: the sentence shard for the
 * learner's band, the card table for the known-set, and the lexeme inventory for
 * the tap panel. No request is made when a word is tapped.
 *
 * ## What tap-to-gloss can honestly show
 *
 * §8 says "tap-to-gloss". We have no word-level Indonesian dictionary — no gloss
 * source is licence-cleared (risk R3), and inventing definitions is not an
 * option. So the panel shows what the app genuinely knows: the word's frequency
 * band, whether the learner knows it, its reading and kanji components for
 * Japanese, and the Indonesian translation of the sentence it appears in — which
 * is what §2.5 made meaning rest on in the first place. It says plainly that
 * there is no per-word dictionary rather than leaving a learner to wonder why
 * the gloss looks thin.
 */

const READING_LENGTH = 20;

interface ReaderScreenProps {
  profile: Profile;
  onBack: () => void;
}

interface Tapped {
  token: string;
  itemId: string;
  item: Item | null;
  sentence: AnchorSentence;
  mined: boolean;
}

export const ReaderScreen = ({ profile, onBack }: ReaderScreenProps) => {
  const lang = profile.targets[0] ?? 'en';
  const [items, setItems] = useState<ReaderItem<AnchorSentence>[] | null>(null);
  const [known, setKnown] = useState<ReadonlySet<string>>(new Set());
  const [mined, setMined] = useState<ReadonlySet<string>>(new Set());
  const [tapped, setTapped] = useState<Tapped | null>(null);

  useEffect(() => {
    void (async () => {
      const cards = await db.cards.where('profileId').equals(profile.id).toArray();
      const knownSet = knownItemIds(cards, Date.now());
      const ability = await vocabularyAbility(profile.id, lang);
      const frontier = bandForAbility(ability.theta);

      // The frontier band and the one below it: enough to read comfortably,
      // with the frontier supplying what is new.
      const bands: FrequencyBand[] =
        frontier > 1 ? [(frontier - 1) as FrequencyBand, frontier] : [frontier];
      const pool = (
        await Promise.all(bands.map((band) => loadSentences(lang, band)))
      ).flat();

      setKnown(knownSet);
      setMined(await minedItemIds(profile.id));
      setItems(
        selectReading({
          pool,
          known: knownSet,
          lang,
          limit: READING_LENGTH,
          seed: Math.floor(Date.now() / 86_400_000),
        }),
      );
    })();
  }, [profile.id, lang]);

  const handleTap = useCallback(
    async (token: string, sentence: AnchorSentence) => {
      const itemId = lexemeIdFor(lang, token.toLowerCase());
      const item = (await db.items.get(itemId)) ?? null;
      setTapped({
        token,
        itemId,
        item,
        sentence,
        mined: mined.has(itemId),
      });
    },
    [lang, mined],
  );

  const handleMine = useCallback(async () => {
    if (!tapped?.item) return;
    const next = new Set(mined);
    if (tapped.mined) {
      await unmineItem(profile.id, tapped.itemId);
      next.delete(tapped.itemId);
    } else {
      await mineItem(profile.id, tapped.itemId, tapped.sentence.id, Date.now());
      next.add(tapped.itemId);
    }
    setMined(next);
    setTapped({ ...tapped, mined: !tapped.mined });
  }, [tapped, mined, profile.id]);

  return (
    <Screen footer={<Button onClick={onBack}>{copy.progress.back}</Button>}>
      <h1 className="text-2xl font-bold">{copy.reader.heading}</h1>
      <p className="mt-1 text-sm text-stone-600 dark:text-slate-400">{copy.reader.intro}</p>

      {items === null ? (
        <p className="mt-8 text-stone-600 dark:text-slate-400">{copy.reader.loading}</p>
      ) : items.length === 0 ? (
        <p className="mt-8 text-stone-600 dark:text-slate-400">{copy.reader.empty}</p>
      ) : (
        <ul className="mt-6 flex flex-col gap-5" data-testid="reader-feed">
          {items.map((item) => (
            <li
              key={item.sentence.id}
              className="rounded-2xl border-2 border-stone-200 p-4 dark:border-slate-800"
            >
              <p className="text-xl leading-relaxed">
                {tokensOf(item.sentence).map((token, index) => {
                  const itemId = lexemeIdFor(lang, token.toLowerCase());
                  const isNew = item.unknown.includes(itemId);
                  return (
                    <button
                      key={`${item.sentence.id}-${index}`}
                      type="button"
                      onClick={() => void handleTap(token, item.sentence)}
                      data-testid="reader-token"
                      className={
                        'rounded px-0.5 text-left motion-safe:transition-colors ' +
                        (isNew
                          ? 'bg-amber-100 font-semibold hover:bg-amber-200 dark:bg-amber-950 dark:hover:bg-amber-900'
                          : 'hover:bg-stone-100 dark:hover:bg-slate-800')
                      }
                    >
                      {token}
                    </button>
                  );
                })}
              </p>
              <p className="mt-2 text-stone-600 dark:text-slate-400">{item.sentence.tr.text}</p>
            </li>
          ))}
        </ul>
      )}

      {tapped ? (
        <WordPanel
          tapped={tapped}
          known={known.has(tapped.itemId)}
          onMine={() => void handleMine()}
          onClose={() => setTapped(null)}
        />
      ) : null}
    </Screen>
  );
};

/**
 * The tap panel. A sheet rather than a new screen: §8 asks for tap-to-gloss to
 * feel instant, and losing your place in the text to read one word is the
 * opposite of that.
 */
const WordPanel = ({
  tapped,
  known,
  onMine,
  onClose,
}: {
  tapped: Tapped;
  known: boolean;
  onMine: () => void;
  onClose: () => void;
}) => {
  const { item, sentence } = tapped;
  const kanji = [...tapped.token].filter(isKanji);

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-10 mx-auto max-w-md rounded-t-3xl border-t-2 border-stone-200 bg-white p-5 shadow-lg dark:border-slate-800 dark:bg-slate-950"
      role="dialog"
      aria-label={tapped.token}
      data-testid="word-panel"
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-2xl font-bold">{tapped.token}</p>
        <span className="text-sm text-stone-500 dark:text-slate-500">
          {known ? copy.reader.word.known : copy.reader.word.unknown}
        </span>
      </div>

      {item?.reading ? (
        <p className="mt-1 text-lg text-stone-600 dark:text-slate-400">
          {copy.reader.word.reading}: {toHiragana(item.reading)}
        </p>
      ) : null}

      {item ? (
        <p className="mt-1 text-sm text-stone-500 dark:text-slate-500">
          {copy.reader.word.band(item.band)}
        </p>
      ) : null}

      {kanji.length > 0 ? (
        <p className="mt-2 text-sm text-stone-600 dark:text-slate-400">
          {copy.reader.word.components}: {kanji.join(' · ')}
        </p>
      ) : null}

      {/* R3: no cleared per-word dictionary, so meaning rests on the sentence —
          which is what SPEC §2.5 chose deliberately, not a gap being papered. */}
      <p className="mt-3 text-sm text-stone-500 dark:text-slate-500">
        {copy.reader.word.noGloss}
      </p>
      <p className="mt-2 rounded-xl bg-stone-100 p-3 dark:bg-slate-900">
        <span className="block text-sm text-stone-500 dark:text-slate-500">
          {copy.reader.word.inSentence}
        </span>
        {sentence.tr.text}
      </p>

      <div className="mt-4 flex gap-3">
        {item ? (
          <Button onClick={onMine} data-testid="mine">
            {tapped.mined ? copy.reader.word.unmine : copy.reader.word.mine}
          </Button>
        ) : null}
        <Button
          variant="quiet"
          onClick={onClose}
          data-testid="word-close"
          className="border-2 border-stone-300 dark:border-slate-700"
        >
          {copy.reader.word.close}
        </Button>
      </div>

      {tapped.mined ? (
        <p className="mt-2 text-sm text-teal-800 dark:text-teal-300" role="status">
          {copy.reader.word.minedNote}
        </p>
      ) : null}
    </div>
  );
};
