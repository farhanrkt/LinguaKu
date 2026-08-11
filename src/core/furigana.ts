import { hasKanji, isKanji, toHiragana, toRomaji } from './kana.ts';
import type { ScriptMode } from '../data/types.ts';

/**
 * SCIENCE: furigana as a fading scaffold — SPEC §2.3 and §4.3. *"Furigana
 * auto-fades per-kanji as stability rises."*
 *
 * The mechanism it implements is the expertise-reversal / scaffolding-removal
 * effect: a phonological crutch that helps a beginner *stops* helping once the
 * orthographic form is known, because the reading is now the easy route and the
 * learner takes it instead of retrieving the character. Removing it is what
 * turns reading practice back into retrieval practice.
 *
 * ## Furigana attaches to the token, not the character — and why
 *
 * A per-character split of a reading is not generally possible, and pretending
 * otherwise produces wrong furigana rather than finer furigana:
 *
 *  - **Okurigana.** 行く is いく; the reading covers a kanji and a kana together.
 *  - **Rendaku.** In 手紙 (てがみ) the second character's reading is voiced by
 *    its position, so 紙 alone is かみ but here it is がみ.
 *  - **Jukujikun.** 今日 is きょう as a whole word. No split exists at all:
 *    neither character contributes a syllable of it.
 *
 * So a ruby span covers a whole token, which is also how furigana is set in real
 * Japanese text. The consequence for fading is stated rather than hidden: a
 * token's reading is dropped when **every** kanji in it is stable. 学校 loses its
 * reading once both 学 and 校 are known, not half of it when one is.
 */

/** SPEC §2.3: the stability at which a kanji no longer needs its reading. */
export const FURIGANA_FADE_STABILITY_DAYS = 21;

export interface RubySegment {
  /** The surface text — one token. */
  text: string;
  /**
   * The reading to show above it, in hiragana, or null when none should be
   * shown: pure kana, no kanji, or every kanji in it already stable.
   */
  ruby: string | null;
}

export interface FuriganaInput {
  tokens: readonly string[];
  /** Per-token readings from the pipeline, in katakana. */
  readings: readonly string[];
  /**
   * Stability in days for a single kanji, or null if the learner has no card for
   * it. Null means "never studied", which is exactly when furigana is needed.
   */
  stabilityOf: (kanji: string) => number | null;
  scriptMode: ScriptMode;
}

/** A kanji has faded once its own memory is strong enough to carry the reading. */
export const isFaded = (stability: number | null): boolean =>
  stability !== null && stability >= FURIGANA_FADE_STABILITY_DAYS;

/**
 * Builds the ruby segments for a sentence.
 *
 * The script mode decides the *base* text (SPEC §4.3's romaji → kana → kanji
 * ladder); stability decides whether a reading rides above it.
 */
export const furiganaFor = (input: FuriganaInput): RubySegment[] =>
  input.tokens.map((token, index) => {
    const katakana = input.readings[index] ?? token;
    const reading = toHiragana(katakana);

    // Romaji: the whole sentence is transliterated, so there is nothing for a
    // reading to sit above. This rung exists to get an Indonesian speaker
    // producing sound on day one, and §4.3 deprecates it as soon as kana lands.
    if (input.scriptMode === 'romaji') {
      return { text: toRomaji(reading), ruby: null };
    }

    // Kana: kanji are replaced by their readings outright rather than annotated.
    if (input.scriptMode === 'kana') {
      return { text: hasKanji(token) ? reading : token, ruby: null };
    }

    if (!hasKanji(token)) return { text: token, ruby: null };

    // Every kanji in the token must have faded before the reading goes; see the
    // header for why this cannot sensibly be done per character.
    const kanji = [...token].filter(isKanji);
    const allFaded = kanji.every((character) => isFaded(input.stabilityOf(character)));

    return { text: token, ruby: allFaded ? null : reading };
  });

/** The kanji a sentence would teach — what needs cards for fading to mean anything. */
export const kanjiIn = (text: string): string[] => [...new Set([...text].filter(isKanji))];
