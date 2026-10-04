import { useCallback, useEffect, useState } from 'react';
import { copy } from '../../i18n/id.ts';
import { Button } from '../../ui/Button.tsx';
import { Screen } from '../../ui/Screen.tsx';
import { TappableText, WORD_NAV_HINT_ID, type TextPart } from '../../ui/TappableText.tsx';
import {
  selectPassages,
  selectReading,
  tokensOf,
  type PassageItem,
  type ReaderItem,
} from '../../core/reader.ts';
import { knownItemIds, lexemeIdFor } from '../../core/coverage.ts';
import { isKanji, toHiragana } from '../../core/kana.ts';
import { furiganaFor, type RubySegment } from '../../core/furigana.ts';
import { kanjiStability } from '../../data/repositories/kanji.ts';
import { bandForAbility } from '../../core/placement.ts';
import { glossFor } from '../../data/glosses.ts';
import { loadPassages, type Passage } from '../../data/passages.ts';
import { PassageView } from './PassageView.tsx';
import { downloadCost, loadSentences, type AnchorSentence } from '../../data/content.ts';
import { db } from '../../data/db.ts';
import {
  connectionHint,
  holdBackDownloads,
  isAlreadyCached,
} from '../../platform/connection.ts';
import { vocabularyAbility } from '../../data/repositories/abilities.ts';
import { mineItem, minedItemIds, unmineItem } from '../../data/repositories/mining.ts';
import type { FrequencyBand } from '../../core/frequency.ts';
import type { Item, Profile, ScriptMode, TargetLang } from '../../data/types.ts';

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
/** Two passages a session: §2.13's four minutes is the constraint, not the shelf. */
const PASSAGE_LENGTH = 2;

interface ReaderScreenProps {
  profile: Profile;
  onBack: () => void;
}

interface Tapped {
  token: string;
  itemId: string;
  item: Item | null;
  /** Null when the word was tapped inside a passage rather than the feed. */
  sentence: AnchorSentence | null;
  /** What it was read in — a sentence id or a passage id. Mining's provenance. */
  source: string;
  mined: boolean;
  /** Indonesian senses, where this word has any (risk R3, partial by design). */
  senses: readonly string[];
}

/**
 * The feed's words, with §2.4's unknown-word highlight preserved per token.
 *
 * No separator between them: `tokensOf` returns words without the whitespace,
 * and the padding on each word is what has always spaced them apart.
 */
const tokenParts = (
  tokens: readonly string[],
  lang: TargetLang,
  unknown: readonly string[],
  /**
   * Japanese only: the ladder's verdict per token (SPEC §4.3). Absent for
   * English, and absent for a Japanese sentence the pipeline shipped without
   * readings — in both cases the token is drawn as it stands.
   */
  segments?: readonly RubySegment[],
): TextPart[] =>
  tokens.map((token, index) => {
    const segment = segments?.[index];
    return {
      kind: 'word',
      // What is drawn follows the rung; what the tap *means* does not. The
      // lookup and the §2.4 highlight both key off the token the sentence
      // actually contains, so neither changes when the script does.
      text: segment?.text ?? token,
      ...(segment && segment.text !== token ? { value: token } : {}),
      ...(segment?.ruby === undefined || segment.ruby === null ? {} : { ruby: segment.ruby }),
      className:
        'rounded px-0.5 text-left motion-safe:transition-colors ' +
        (unknown.includes(lexemeIdFor(lang, token.toLowerCase()))
          ? 'bg-amber-100 font-semibold hover:bg-amber-200 dark:bg-amber-950 dark:hover:bg-amber-900'
          : 'hover:bg-stone-100 dark:hover:bg-slate-800'),
    };
  });

/**
 * The ladder's verdict for one sentence, or nothing to say about it.
 *
 * SPEC §4.3 applies to every place Japanese is drawn, not only the practice
 * card — v1.23.0 wired the session and left the reader showing bare kanji, so a
 * learner who moved the control saw it take effect in one screen and not the
 * other. `undefined` means "draw the tokens as they are": English, or a
 * Japanese sentence the pipeline shipped without readings.
 */
const segmentsFor = (
  sentence: AnchorSentence,
  scriptMode: ScriptMode,
  stability: Record<string, number | null>,
): RubySegment[] | undefined => {
  const { tokens, readings } = sentence;
  if (tokens === undefined || readings === undefined) return undefined;
  return furiganaFor({
    tokens,
    readings,
    // `?? null` catches a kanji with no card, not one at zero stability.
    stabilityOf: (kanji) => stability[kanji] ?? null,
    scriptMode,
  });
};

export const ReaderScreen = ({ profile, onBack }: ReaderScreenProps) => {
  const lang = profile.targets[0] ?? 'en';
  const [items, setItems] = useState<ReaderItem<AnchorSentence>[] | null>(null);
  /**
   * How well this learner knows each kanji in the feed (SPEC §10's per-kanji
   * fade). Read once over the whole feed rather than per sentence: the same
   * character turns up across sentences and the lookup is a database read.
   */
  const [stability, setStability] = useState<Record<string, number | null>>({});
  const [known, setKnown] = useState<ReadonlySet<string>>(new Set());
  const [mined, setMined] = useState<ReadonlySet<string>>(new Set());
  const [tapped, setTapped] = useState<Tapped | null>(null);
  /** SPEC §8's graded reader proper — running text, English only for now. */
  const [passages, setPassages] = useState<PassageItem<Passage>[]>([]);

  /**
   * SPEC §5.4. This screen is the one tap in the app that spends a noticeable
   * amount of the learner's data plan: its band's sentence shards are ~415 KB
   * gzipped for English and ~479 KB for Japanese. The architecture has deferred
   * that cost since M2 (D20) — what was missing is telling the learner about it.
   *
   * `null` means "not decided yet", which is not the same as "no cost": the
   * screen shows neither the gate nor an empty reader until the answer is known.
   */
  const [gate, setGate] = useState<{ kb: number } | null>(null);
  const [payAnyway, setPayAnyway] = useState(false);

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

      if (!payAnyway && holdBackDownloads(profile.dataSaver ?? 'auto', connectionHint())) {
        const cost = await downloadCost(
          lang,
          bands.flatMap((band) => [
            { kind: 'sentences' as const, band },
            { kind: 'passages' as const, band },
          ]),
        );
        // Only ask where there is something to pay for. A learner who fetched
        // this band last week already owns it, and warning them about a cost
        // that no longer exists would be a false alarm, not caution.
        const unpaid = await Promise.all(cost.urls.map((url) => isAlreadyCached(url)));
        if (unpaid.some((cached) => !cached) && cost.gzipBytes > 0) {
          setGate({ kb: Math.round(cost.gzipBytes / 1024) });
          return;
        }
      }
      setGate(null);

      const pool = (
        await Promise.all(bands.map((band) => loadSentences(lang, band)))
      ).flat();

      // The passage corpus is Simple English Wikipedia; there is no free,
      // licence-cleared graded corpus for Japanese, so Japanese keeps the feed
      // and the screen says so rather than implying parity.
      const passagePool = (
        await Promise.all(bands.map((band) => loadPassages(lang, band)))
      ).flat();

      setKnown(knownSet);
      setMined(await minedItemIds(profile.id));
      setPassages(
        selectPassages({
          pool: passagePool,
          known: knownSet,
          lang,
          limit: PASSAGE_LENGTH,
          seed: Math.floor(Date.now() / 86_400_000),
        }),
      );
      const feed = selectReading({
        pool,
        known: knownSet,
        lang,
        limit: READING_LENGTH,
        seed: Math.floor(Date.now() / 86_400_000),
      });
      setItems(feed);
      setStability(
        lang === 'ja'
          ? await kanjiStability(profile.id, feed.map((item) => item.sentence.text).join(''))
          : {},
      );
    })();
  }, [profile.id, lang, profile.dataSaver, payAnyway]);

  const handleTapToken = useCallback(
    async (token: string, passageId: string) => {
      const itemId = lexemeIdFor(lang, token.toLowerCase());
      const item = (await db.items.get(itemId)) ?? null;
      // A word tapped inside a passage has no sentence pair behind it — that is
      // what makes running text a different exercise — but it is still minable.
      // §8 calls mining the retention engine, and passages are the first thing
      // the reader shows; withholding it there would remove the feature from
      // the surface it matters most on. The passage id is the provenance.
      setTapped({
        token,
        itemId,
        item,
        sentence: null,
        source: passageId,
        mined: mined.has(itemId),
        senses: item ? await glossFor(lang, item.band, itemId) : [],
      });
    },
    [lang, mined],
  );

  const handleTap = useCallback(
    async (token: string, sentence: AnchorSentence) => {
      const itemId = lexemeIdFor(lang, token.toLowerCase());
      const item = (await db.items.get(itemId)) ?? null;
      setTapped({
        token,
        itemId,
        item,
        sentence,
        source: sentence.id,
        mined: mined.has(itemId),
        // Glossed where we have one, and honest where we do not — coverage is
        // 30% of English and 4% of Japanese, measured (src/data/glosses.ts).
        senses: item ? await glossFor(lang, item.band, itemId) : [],
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
      await mineItem(profile.id, tapped.itemId, tapped.source, Date.now());
      next.add(tapped.itemId);
    }
    setMined(next);
    setTapped({ ...tapped, mined: !tapped.mined });
  }, [tapped, mined, profile.id]);

  return (
    <Screen
      footer={
        // While the gate is up, "download" is the decision and "back" is the
        // way out of it — two full-width primaries would make the learner pick
        // between two things that look equally like the answer.
        <Button variant={gate === null ? 'primary' : 'quiet'} onClick={onBack}>
          {copy.progress.back}
        </Button>
      }
    >
      <h1 className="text-2xl font-bold">{copy.reader.heading}</h1>
      <p className="mt-1 text-sm text-stone-600 dark:text-slate-400">{copy.reader.intro}</p>
      {/* Referenced by every tappable block on this screen (D70). Once, because
          repeating it per paragraph is what makes a hint into noise — and not
          at all while the download gate is up, because there are no words yet
          and a screen reader would be told how to move between nothing. */}
      {gate !== null ? null : (
        <p id={WORD_NAV_HINT_ID} className="sr-only">
          {copy.reader.wordNav}
        </p>
      )}

      {gate !== null ? (
        <section
          className="mt-6 rounded-2xl border-2 border-stone-200 p-4 dark:border-slate-800"
          data-testid="reader-data-gate"
        >
          <h2 className="font-bold">{copy.reader.data.heading}</h2>
          <p className="mt-1 text-stone-600 dark:text-slate-400">
            {copy.reader.data.body(gate.kb)}
          </p>
          <div className="mt-4">
            <Button onClick={() => setPayAnyway(true)} data-testid="reader-data-download">
              {copy.reader.data.download}
            </Button>
          </div>
          <p className="mt-2 text-sm text-stone-500 dark:text-slate-400">
            {copy.reader.data.note}
          </p>
        </section>
      ) : null}

      {gate !== null ? null : passages.length > 0 ? (
        <section data-testid="passages">
          <h2 className="mt-8 text-lg font-bold">{copy.reader.passage.heading}</h2>
          {passages.map((item) => (
            <PassageView
              key={item.passage.id}
              item={item}
              profileId={profile.id}
              lang={lang}
              known={known}
              onTapWord={(token) => void handleTapToken(token, item.passage.id)}
            />
          ))}
        </section>
      ) : lang === 'ja' ? (
        <p className="mt-4 text-sm text-stone-500 dark:text-slate-400" data-testid="passages-absent">
          {copy.reader.passage.onlyEnglish}
        </p>
      ) : null}

      {gate !== null ? null : items === null ? (
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
              <TappableText
                parts={tokenParts(
                  tokensOf(item.sentence),
                  lang,
                  item.unknown,
                  segmentsFor(item.sentence, profile.scriptMode, stability),
                )}
                label={copy.reader.sentenceLabel}
                describedBy={WORD_NAV_HINT_ID}
                onTap={(token) => void handleTap(token, item.sentence)}
                className="text-xl leading-relaxed"
                wordTestId="reader-token"
              />
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
        <span className="text-sm text-stone-500 dark:text-slate-400">
          {known ? copy.reader.word.known : copy.reader.word.unknown}
        </span>
      </div>

      {item?.reading ? (
        <p className="mt-1 text-lg text-stone-600 dark:text-slate-400">
          {copy.reader.word.reading}: {toHiragana(item.reading)}
        </p>
      ) : null}

      {item ? (
        <p className="mt-1 text-sm text-stone-500 dark:text-slate-400">
          {copy.reader.word.band(item.band)}
        </p>
      ) : null}

      {kanji.length > 0 ? (
        <p className="mt-2 text-sm text-stone-600 dark:text-slate-400">
          {copy.reader.word.components}: {kanji.join(' · ')}
        </p>
      ) : null}

      {/* A gloss where one exists, and the honest empty state where none does.
          Glosses are reference only: they are never graded against, because
          coverage is partial and an unfair "wrong" is what §2.7 forbids. */}
      {tapped.senses.length > 0 ? (
        <p className="mt-3 text-base text-stone-800 dark:text-slate-200" data-testid="word-gloss">
          {tapped.senses.join('; ')}
        </p>
      ) : (
        <p className="mt-3 text-sm text-stone-500 dark:text-slate-400" data-testid="word-no-gloss">
          {copy.reader.word.noGloss}
        </p>
      )}
      {/* The feed's translation, where the tap came from the feed. A word
          tapped in a passage has no translation beside it — that is what makes
          running text a different exercise from a sentence pair. */}
      {sentence ? (
        <p className="mt-2 rounded-xl bg-stone-100 p-3 dark:bg-slate-900">
          <span className="block text-sm text-stone-600 dark:text-slate-400">
            {copy.reader.word.inSentence}
          </span>
          {sentence.tr.text}
        </p>
      ) : null}

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
