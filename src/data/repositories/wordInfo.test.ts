import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db.ts';
import { clearGlossCache } from '../glosses.ts';
import { baseFormOf, wordInfo } from './wordInfo.ts';
import type { Item } from '../types.ts';

/**
 * The tap-to-explain sheet (D111): reading, romaji, meaning, and what each
 * kanji means beside what they mean together.
 */

const lexeme = (headword: string, reading: string, freqRank = 100, band: Item['band'] = 1): Item => ({
  id: `ja:lex:${headword}`,
  lang: 'ja',
  kind: 'lexeme',
  headword,
  reading,
  anchorSentenceIds: [],
  freqRank,
  band,
  sourceRef: { dataset: 'tatoeba', externalId: headword },
});

const kanji = (literal: string, meanings: string[], readings: string[]): Item => ({
  id: `ja:kanji:${literal}`,
  lang: 'ja',
  kind: 'kanji',
  headword: literal,
  readings,
  meanings,
  anchorSentenceIds: [],
  freqRank: 100,
  band: 1,
  sourceRef: { dataset: 'kanjidic2', externalId: literal },
});

const shard = (body: unknown) => ({
  ok: true,
  status: 200,
  json: () => Promise.resolve(body),
  text: () => Promise.resolve(JSON.stringify(body)),
});

beforeEach(async () => {
  await db.delete();
  await db.open();
  clearGlossCache();
  // One authored meaning in band 1; no Wiktionary glosses at all.
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) =>
      Promise.resolve(
        String(url).includes('meanings.b1.json')
          ? shard({
              meanings: { 'ja:lex:学校': ['sekolah'], 'ja:lex:読む': ['membaca'], 'ja:lex:行く': ['pergi'] },
              forms: { は: ['penanda topik', 'dibaca wa'] },
            })
          : { ok: false, status: 404, json: () => Promise.resolve({}), text: () => Promise.resolve('') },
      ),
    ),
  );
});

describe('wordInfo', () => {
  it('opens a compound into each kanji and the combined meaning', async () => {
    await db.items.bulkPut([
      lexeme('学校', 'ガッコウ'),
      kanji('学', ['study', 'learning'], ['ガク', 'まな.ぶ']),
      kanji('校', ['school'], ['コウ']),
    ]);
    const info = await wordInfo('学校', 'ガッコウ');
    expect(info.reading).toBe('がっこう');
    expect(info.romaji).toBe('gakkou');
    expect(info.meaning).toEqual(['sekolah']);
    expect(info.base).toBeNull();
    expect(info.kanji.map((entry) => entry.literal)).toEqual(['学', '校']);
    expect(info.kanji[0]?.meanings).toEqual(['study', 'learning']);
    // KANJIDIC2's okurigana dot is unpacked, never printed.
    expect(info.kanji[0]?.readings).toEqual(['がく', 'まな']);
  });

  it('explains an inflected token through its dictionary form', async () => {
    await db.items.bulkPut([lexeme('読む', 'ヨム'), lexeme('読書', 'ドクショ'), kanji('読', ['read'], ['ドク'])]);
    const info = await wordInfo('読み', 'ヨミ');
    expect(info.base).toBe('読む');
    expect(info.baseRomaji).toBe('yomu');
    expect(info.meaning).toEqual(['membaca']);
    // The surface is what was tapped, and it is what is spelled.
    expect(info.romaji).toBe('yomi');
  });

  it('gives a phrase its authored meaning and its own spacing', async () => {
    await db.items.put({
      id: 'ja:chunk:お元気ですか',
      lang: 'ja',
      kind: 'chunk',
      headword: 'お元気ですか',
      reading: 'オゲンキデスカ',
      romaji: 'ogenki desu ka',
      gloss: 'apa kabar',
      anchorSentenceIds: [],
      freqRank: 250,
      band: 1,
      sourceRef: { dataset: 'linguaku-authored', externalId: 'お元気ですか' },
    });
    const info = await wordInfo('お元気ですか');
    expect(info.romaji).toBe('ogenki desu ka');
    expect(info.meaning).toEqual(['apa kabar']);
  });

  it('says what a particle does, and labels it as that rather than a meaning', async () => {
    const info = await wordInfo('は', 'ハ');
    expect(info.meaning).toEqual(['penanda topik', 'dibaca wa']);
    expect(info.form).toBe(true);
    expect(info.romaji).toBe('wa');
  });

  it('falls through to the word a token is a form of when its own entry is empty', async () => {
    // 行き is in the inventory as a noun with no meaning yet, and is also 行く's stem.
    await db.items.bulkPut([lexeme('行き', 'イキ', 3000, 4), lexeme('行く', 'イク', 40)]);
    const info = await wordInfo('行き', 'イキ');
    expect(info.base).toBe('行く');
    expect(info.meaning).toEqual(['pergi']);
    expect(info.form).toBe(false);
  });

  it('says it has no meaning rather than borrowing a wrong one', async () => {
    const info = await wordInfo('猫', 'ネコ');
    expect(info.meaning).toEqual([]);
    expect(info.item).toBeNull();
    expect(info.romaji).toBe('neko');
  });
});

describe('baseFormOf', () => {
  it('takes the word whose reading starts as the token does', async () => {
    await db.items.bulkPut([lexeme('行く', 'イク', 50), lexeme('行う', 'オコナウ', 900)]);
    expect((await baseFormOf('行っ', 'いっ'))?.headword).toBe('行く');
    await db.items.bulkPut([lexeme('食べる', 'タベル'), lexeme('高い', 'タカイ')]);
    expect((await baseFormOf('食べ', 'たべ'))?.headword).toBe('食べる');
    expect((await baseFormOf('高かっ', 'たかかっ'))?.headword).toBe('高い');
  });

  it('guesses nothing when the sounds part at the start', async () => {
    // 来 (き) and 来る (くる) share no first sound.
    await db.items.put(lexeme('来る', 'クル'));
    expect(await baseFormOf('来', 'き')).toBeNull();
  });

  it('leaves compounds and kana words alone', async () => {
    await db.items.put(lexeme('学校', 'ガッコウ'));
    expect(await baseFormOf('学生', 'がくせい')).toBeNull();
    expect(await baseFormOf('する', 'する')).toBeNull();
  });
});
