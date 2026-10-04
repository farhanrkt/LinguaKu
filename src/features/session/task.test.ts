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
    interferenceTags: [],
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
