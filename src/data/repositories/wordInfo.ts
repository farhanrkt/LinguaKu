import { db } from '../db.ts';
import { formFor, glossFor } from '../glosses.ts';
import {
  hasKanji,
  isKanji,
  romajiOfToken,
  romajiOfWord,
  splitKanjiReading,
  toHiragana,
  toRomaji,
} from '../../core/kana.ts';
import type { Item } from '../types.ts';

/**
 * Everything the app knows about one Japanese word, for the tap-to-explain sheet.
 *
 * The rule this serves, in the learner's words: every Japanese character shown
 * must come with its romaji and its meaning, and a word of two or more kanji
 * must open to show what each character means and what they mean together
 * (D111). All of it is local — the lexeme, its gloss or authored meaning, and
 * the KANJIDIC2 rows the app already imports — so a tap costs no network.
 */

export interface KanjiInfo {
  literal: string;
  /** Hiragana, notation unpacked; the first few only. */
  readings: string[];
  /** KANJIDIC2's English meanings — labelled as English where shown (D106). */
  meanings: string[];
}

export interface WordInfo {
  surface: string;
  /** Hiragana reading, or null where the word is already written in kana. */
  reading: string | null;
  romaji: string;
  /**
   * The word this token is a form of, where it is not the dictionary form
   * itself: 読み is a form of 読む. Null when the token is the headword, and
   * when no lexeme could be matched to it.
   */
  base: string | null;
  baseRomaji: string | null;
  /** The lexeme the meaning came from — the token's own, or its base form's. */
  item: Item | null;
  /**
   * Indonesian senses: a Wiktionary gloss or an authored meaning — or, for a
   * token that is not a word (a particle, an ending), what it does.
   */
  meaning: readonly string[];
  /** The meaning explains a grammar token rather than defining a word (D112). */
  form: boolean;
  /** Each distinct kanji in the word, in order. */
  kanji: KanjiInfo[];
}

const READINGS_SHOWN = 3;
/** Enough to hold every lexeme sharing a kanji stem; 読 starts a few dozen. */
const CANDIDATES = 200;

const readingsOf = (raw: readonly string[] | undefined, fallback: string | undefined): string[] => {
  const source = raw ?? (fallback ? [fallback] : []);
  const forms = source.map((entry) => toHiragana(splitKanjiReading(entry).reading)).filter((form) => form.length > 0);
  return [...new Set(forms)].slice(0, READINGS_SHOWN);
};

/** The romaji of a kana reading, for a kanji's own readings. */
export const romajiOf = (kana: string): string => toRomaji(toHiragana(kana));

const commonPrefix = (a: string, b: string): number => {
  let length = 0;
  while (length < a.length && length < b.length && a[length] === b[length]) length += 1;
  return length;
};

const STEM = /^[一-鿿々]+/u;
const OKURIGANA = /^[ぁ-ゖ]*$/u;

/**
 * The dictionary form of an inflected token: 読み → 読む, 食べ → 食べる,
 * 高かっ → 高い.
 *
 * The sentences carry surface tokens and readings but no lemma (D10: there is
 * no tokenizer at runtime), so this looks among the imported lexemes that
 * share the token's kanji and differ only in their kana ending, and keeps the
 * one whose reading starts the way the token's does. Nothing is guessed past
 * that: 来 (き) and 来る (くる) share no first sound, and get no base form
 * rather than a wrong one — the sheet then says it has no entry, which is
 * true.
 */
export const baseFormOf = async (token: string, kana: string): Promise<Item | null> => {
  const stem = STEM.exec(token)?.[0];
  if (stem === undefined || !OKURIGANA.test(token.slice(stem.length))) return null;

  const candidates = await db.items.where('id').startsWith(`ja:lex:${stem}`).limit(CANDIDATES).toArray();
  const scored = candidates
    .filter(
      (item) =>
        item.kind === 'lexeme' &&
        item.headword !== token &&
        item.headword.startsWith(stem) &&
        OKURIGANA.test(item.headword.slice(stem.length)) &&
        item.reading !== undefined &&
        item.reading.length > 0,
    )
    .map((item) => {
      const reading = toHiragana(item.reading!);
      const shared = commonPrefix(reading, kana);
      // Inflection changes the end of a word, so the two readings may part
      // ways at the last sound of the shorter one, and nowhere earlier.
      const needed = Math.max(1, Math.min(reading.length, kana.length) - 1);
      return { item, shared, ok: shared >= needed };
    })
    .filter((entry) => entry.ok);

  scored.sort(
    (a, b) =>
      b.shared - a.shared || a.item.freqRank - b.item.freqRank || a.item.headword.localeCompare(b.item.headword),
  );
  return scored[0]?.item ?? null;
};

export const wordInfo = async (token: string, reading?: string | null): Promise<WordInfo> => {
  // A set phrase is an item of its own (SPEC §2.5): お元気ですか is opened
  // from the home screen's list as often as any single word.
  const exact =
    (await db.items.get(`ja:lex:${token}`)) ?? (await db.items.get(`ja:chunk:${token}`)) ?? null;
  // Unpacked: a kanji item's own reading is KANJIDIC2's notation (なが.い).
  const kana = toHiragana(
    splitKanjiReading(
      reading !== undefined && reading !== null && reading.length > 0 ? reading : (exact?.reading ?? token),
    ).reading,
  );
  // A chunk's meaning is authored onto it; a word's is looked up.
  const meaningOf = async (entry: Item | null): Promise<readonly string[]> =>
    entry?.gloss ? entry.gloss.split(/;\s*/u) : entry ? await glossFor('ja', entry.band, entry.id) : [];

  // The token's own entry first; then the word it is a form of (行き is in the
  // inventory as a noun with no meaning yet, and is also 行く's stem); then
  // what it does, for a token that is not a word at all.
  let item = exact;
  let meaning = await meaningOf(exact);
  if (meaning.length === 0) {
    const base = await baseFormOf(token, kana);
    const baseMeaning = await meaningOf(base);
    if (baseMeaning.length > 0 || item === null) {
      item = base ?? item;
      meaning = baseMeaning;
    }
  }
  const form = meaning.length === 0 ? await formFor('ja', token) : [];
  const characters = [...new Set([...token].filter(isKanji))];
  const rows = await db.items.bulkGet(characters.map((character) => `ja:kanji:${character}`));
  const base = item !== null && item.headword !== token ? item.headword : null;

  return {
    surface: token,
    reading: hasKanji(token) ? kana : null,
    romaji: romajiOfWord(token, kana, exact?.romaji) ?? romajiOfToken(token, kana),
    base,
    baseRomaji: base !== null && item !== null ? romajiOfToken(base, item.reading ?? base) : null,
    item,
    meaning: form.length > 0 ? form : meaning,
    form: form.length > 0,
    kanji: characters.map((literal, index) => {
      const row = rows[index];
      return {
        literal,
        readings: readingsOf(row?.readings, row?.reading),
        meanings: row?.meanings ?? [],
      };
    }),
  };
};
