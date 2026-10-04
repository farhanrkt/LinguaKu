import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../data/db.ts';
import { clearAnchorCache } from '../../data/content.ts';
import { gradeAnswer } from '../../core/grader.ts';
import { buildTask } from './task.ts';
import type { Card, Item, StoredFsrsState } from '../../data/types.ts';

/**
 * SPEC §2.7's acceptance criterion, at the seam where the grader meets the card.
 *
 * `KanaInput` is a kana keyboard — `romajiToKana`, a kana palette and a
 * katakana toggle — with no kanji conversion step. 71.9% of the Japanese
 * lexemes this app ships are written with kanji (4,963 of 6,904), and SPEC §4.3
 * starts a Japanese learner at `kana` script mode, the rung *below* kanji. The
 * production rung graded against the headword alone, so answering 私 with わたし
 * — the only form that input can produce — was marked wrong **and demoted**:
 * driven in a browser against the unfixed build, the verdict read
 * *"Jawabannya “私”. Kita pelan-pelan lagi untuk kata ini."* and the lapse went
 * into the append-only review log, where it cannot be taken back (invariant 1).
 *
 * The grader's own unit tests cover the normalization. This covers the wiring,
 * which is where the reading has to survive `buildTask` and reach `gradeAnswer`.
 */

const NOW = Date.UTC(2026, 9, 4, 9, 0, 0);
const PROFILE = 'p1';

const anchor = {
  id: 'tatoeba:jpn:1',
  text: '私はねこがすきです。',
  tokens: ['私', 'は', 'ねこ', 'が', 'すき', 'です', '。'],
  readings: ['ワタシ', 'ハ', 'ネコ', 'ガ', 'スキ', 'デス', '。'],
  tr: { id: 'tatoeba:ind:1', text: 'Saya suka kucing.' },
};

interface ItemOver {
  id?: string;
  lang?: Item['lang'];
  headword?: string;
  reading?: string;
  freqRank?: number;
}

const item = (over: ItemOver = {}): Item => {
  const row: Item = {
    id: over.id ?? 'ja:lex:私',
    lang: over.lang ?? 'ja',
    kind: 'lexeme',
    headword: over.headword ?? '私',
    anchorSentenceIds: [anchor.id],
    freqRank: over.freqRank ?? 3,
    band: 1,
    sourceRef: { dataset: 'tatoeba', externalId: over.id ?? 'ja:lex:私' },
  };
  return over.reading === undefined ? row : { ...row, reading: over.reading };
};

const fsrs = (): StoredFsrsState => ({
  dueAt: NOW,
  stability: 30,
  difficulty: 5,
  elapsedDays: 1,
  scheduledDays: 1,
  learningSteps: 0,
  reps: 5,
  lapses: 0,
  state: 2,
  lastReviewAt: NOW - 86_400_000,
});

/** A card at the typed production rung (SPEC §2.3 L5). */
const card = (itemId: string, level: number): Card => ({
  id: `${PROFILE}::${itemId}`,
  profileId: PROFILE,
  itemId,
  ladderLevel: level as Card['ladderLevel'],
  fsrs: fsrs(),
  dueAt: NOW,
  suspended: 0,
});

beforeEach(async () => {
  await db.delete();
  await db.open();
  clearAnchorCache();
  vi.stubGlobal('fetch', (url: string) => {
    if (url.includes('anchors.b1.json')) {
      return Promise.resolve(
        new Response(JSON.stringify({ sentences: [anchor] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    }
    return Promise.resolve(new Response('not found', { status: 404 }));
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a Japanese production card accepts the reading (SPEC §2.7, §4.3)', () => {
  it('offers the reading beside the kanji headword', async () => {
    await db.items.put(item({ reading: 'わたし' }));
    await db.cards.put(card('ja:lex:私', 5));

    const task = await buildTask(PROFILE, 'ja:lex:私', 1);
    expect(task).not.toBeNull();
    expect(task?.kind).toBe('production');
    // The kanji stays the answer, because it is what the verdict shows.
    expect(task?.answer).toBe('私');
    expect(task?.alsoAccepted).toEqual(['わたし']);
  });

  it('grades the reading correct through the forms the card carries', async () => {
    await db.items.put(item({ reading: 'わたし' }));
    await db.cards.put(card('ja:lex:私', 5));
    const task = await buildTask(PROFILE, 'ja:lex:私', 1);
    const forms = [task?.answer ?? '', ...(task?.alsoAccepted ?? [])];

    expect(gradeAnswer('わたし', forms).outcome).toBe('correct');
    // And romaji, on the same card: §4.3's rung below kana.
    expect(gradeAnswer('watashi', forms).outcome).toBe('correct');
    expect(gradeAnswer('私', forms).reason).toBe('exact');
    // Still wrong when it is wrong.
    expect(gradeAnswer('かのじょ', forms).outcome).toBe('wrong');
  });

  it('adds nothing for a Japanese word already written in kana', async () => {
    await db.items.put(
      item({ id: 'ja:lex:ねこ', headword: 'ねこ', reading: 'ねこ', freqRank: 900 }),
    );
    await db.cards.put(card('ja:lex:ねこ', 5));

    const task = await buildTask(PROFILE, 'ja:lex:ねこ', 1);
    expect(task?.answer).toBe('ねこ');
    expect(task?.alsoAccepted).toBeUndefined();
  });

  it('adds nothing for English', async () => {
    await db.items.put(
      item({ id: 'en:lex:try', lang: 'en', headword: 'try', freqRank: 263 }),
    );
    await db.cards.put(card('en:lex:try', 5));
    vi.stubGlobal('fetch', (url: string) =>
      Promise.resolve(
        url.includes('anchors.b1.json')
          ? new Response(JSON.stringify({ sentences: [{ ...anchor, id: 'tatoeba:jpn:1' }] }), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            })
          : new Response('not found', { status: 404 }),
      ),
    );

    const task = await buildTask(PROFILE, 'en:lex:try', 1);
    expect(task?.alsoAccepted).toBeUndefined();
  });
});

/**
 * SPEC §2.11's card, and the dictionary notation that was reaching it.
 *
 * KANJIDIC2 writes a kun reading with its okurigana attached and a dot where
 * the kanji stops — 会 is `あ.う` — and marks a prefix or suffix position with a
 * hyphen. The card printed that verbatim under "Dibaca", so **878 of the 1,748
 * shipped kanji (50.2%)** told an Indonesian beginner that 会 is read `あ.う`.
 *
 * Driven in a browser against the fix, 与 now reads: *Dibaca あた · Dipakai
 * dalam 与える, dibaca あたえる.* Both true; `あた.える` was neither.
 */
describe('a kanji card carries a reading, not dictionary notation (SPEC §2.11)', () => {
  const kanji = (literal: string, reading: string): Item => ({
    id: `ja:kanji:${literal}`,
    lang: 'ja',
    kind: 'kanji',
    headword: literal,
    reading,
    anchorSentenceIds: [],
    componentsOf: ['勹', '上'],
    freqRank: 500,
    band: 1,
    sourceRef: { dataset: 'kanjidic2', externalId: literal },
  });

  const faceOf = async (literal: string, reading: string) => {
    await db.items.put(kanji(literal, reading));
    await db.cards.put(card(`ja:kanji:${literal}`, 0));
    const task = await buildTask(PROFILE, `ja:kanji:${literal}`, 1);
    return task?.kanji;
  };

  it('splits the okurigana out instead of printing the dot', async () => {
    const face = await faceOf('与', 'あた.える');
    expect(face?.reading).toBe('あた');
    expect(face?.okurigana).toBe('える');
  });

  it('leaves a reading that needs no unpacking alone', async () => {
    const face = await faceOf('日', 'ひ');
    expect(face?.reading).toBe('ひ');
    expect(face?.okurigana).toBeUndefined();
  });

  it('drops the position hyphen', async () => {
    const face = await faceOf('一', 'ひと-');
    expect(face?.reading).toBe('ひと');
    expect(face?.okurigana).toBeUndefined();
  });

  it('never puts notation on a card, whatever the dictionary wrote', async () => {
    for (const raw of ['あた.える', 'ひと-', '-べ.き', 'ニチ']) {
      const face = await faceOf('与', raw);
      expect(face?.reading ?? '').not.toMatch(/[.-]/);
      expect(face?.okurigana ?? '').not.toMatch(/[.-]/);
    }
  });
});

/**
 * §2.11 teaches a kanji "by radical decomposition + an Indonesian-language
 * mnemonic", and KRADFILE lists a character among its own radicals.
 *
 * Measured over the shipped shard: **62 of 1,748** have a breakdown that is
 * nothing but the character itself, and **78 more** list it alongside real
 * components. So the card said *"日 tersusun dari 日"* — 日 is made up of 日 —
 * and *"見 tersusun dari 見 + 目 + 儿"*, and the baseline mnemonic then invited
 * the learner to "make up your own story from those parts".
 *
 * `baselineAtomic` was written for the first case — *"日 adalah bentuk dasar"* —
 * and could never fire, because it is guarded on `components.length > 0` and no
 * shipped kanji has an empty breakdown (0 of 1,748).
 *
 * One rule fixes both: a character is not one of its own components.
 */
describe('a kanji is not one of its own parts (SPEC §2.11)', () => {
  const withBreakdown = async (literal: string, breakdown: string[]) => {
    await db.items.put({
      id: `ja:kanji:${literal}`,
      lang: 'ja',
      kind: 'kanji',
      headword: literal,
      anchorSentenceIds: [],
      componentsOf: breakdown,
      freqRank: 500,
      band: 1,
      sourceRef: { dataset: 'kanjidic2', externalId: literal },
    });
    await db.cards.put(card(`ja:kanji:${literal}`, 0));
    return (await buildTask(PROFILE, `ja:kanji:${literal}`, 1))?.kanji;
  };

  it('drops the character from its own breakdown', async () => {
    // 見 ships as ['見', '目', '儿'] — 78 kanji list themselves beside real parts.
    expect((await withBreakdown('見', ['見', '目', '儿']))?.components).toEqual(['目', '儿']);
  });

  it('leaves a breakdown that does not mention it alone', async () => {
    expect((await withBreakdown('校', ['木', '交']))?.components).toEqual(['木', '交']);
  });

  it('calls a character with nothing but itself a basic form', async () => {
    // 62 kanji ship as [self]. The card used to say "日 tersusun dari 日".
    const face = await withBreakdown('日', ['日']);
    expect(face?.components).toEqual([]);
    // Which is what finally lets `baselineAtomic` fire — it never had before.
    expect(face?.mnemonic).toContain('bentuk dasar');
    expect(face?.mnemonic).not.toContain('tersusun dari');
  });
});

/**
 * What a beginner actually needs off a kanji card: what it means, and how to
 * say it in letters they can already read.
 *
 * The card showed neither. All 1,748 shipped kanji carry `meanings` from
 * KANJIDIC2 — 日 is `["day", "sun", "Japan", "counter for days"]` — and the
 * card rendered none of them; `toRomaji` has existed in `core/kana.ts` since M6
 * and the card never called it. So the learner met 与, its parts, and the
 * reading あた, with no way to know what any of it meant or how it sounded.
 *
 * The meanings are English, and there is no Indonesian source for them: the
 * id.wiktionary gloss shards cover 274 Japanese lexemes and **0 kanji**. Showing
 * them labelled as English is honest and useful; showing nothing was neither.
 */
describe('a kanji card says what it means and how it sounds (SPEC §2.11)', () => {
  const kanjiWith = async (over: { reading?: string; meanings?: string[] }) => {
    await db.items.put({
      id: 'ja:kanji:日',
      lang: 'ja',
      kind: 'kanji',
      headword: '日',
      anchorSentenceIds: [],
      componentsOf: ['日'],
      freqRank: 1,
      band: 1,
      sourceRef: { dataset: 'kanjidic2', externalId: '日' },
      ...(over.reading === undefined ? {} : { reading: over.reading }),
      ...(over.meanings === undefined ? {} : { meanings: over.meanings }),
    });
    await db.cards.put(card('ja:kanji:日', 0));
    return (await buildTask(PROFILE, 'ja:kanji:日', 1))?.kanji;
  };

  it('carries the meanings the shard has shipped all along', async () => {
    const face = await kanjiWith({ meanings: ['day', 'sun', 'Japan', 'counter for days'] });
    expect(face?.meanings).toEqual(['day', 'sun', 'Japan', 'counter for days']);
  });

  it('romanises the reading, so a day-one learner can say it', async () => {
    expect((await kanjiWith({ reading: 'ひ' }))?.romaji).toBe('hi');
    // Through the okurigana split, which runs first.
    expect((await kanjiWith({ reading: 'あた.える' }))?.romaji).toBe('ata');
  });

  it('says nothing rather than something empty', async () => {
    const face = await kanjiWith({});
    expect(face?.meanings).toEqual([]);
    expect(face?.romaji).toBeNull();
  });
});
