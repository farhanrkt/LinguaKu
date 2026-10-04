import { hasKanji, isKana, isKanji, toHiragana, toRomaji } from './kana.ts';
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
  /**
   * Whether the learner can read this kana character yet (SPEC §4.3).
   *
   * This is what makes romaji a **rung** rather than a setting. The romaji
   * branch does not transliterate everything forever: a token whose kana the
   * learner has all learned is shown in kana, and one with a character they
   * have not met is shown in latin. So the script fades in as the syllabary is
   * earned, character by character, and §4.3's "actively deprecated after kana
   * fluency" happens on its own instead of waiting for someone to notice a
   * setting.
   *
   * Defaults to "no" when absent, which is the state every learner starts in.
   */
  readsKana?: (character: string) => boolean;
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

    // Romaji: the bottom rung, and the one that climbs itself.
    //
    // It exists to get an Indonesian speaker producing sound on day one —
    // §3.2's positive transfer, since Japanese /a i u e o/ map cleanly onto
    // Indonesian vowels. But it is not a wall of latin forever: a token whose
    // kana the learner has already learned is shown **in kana**, so the script
    // arrives character by character as the syllabary is earned, and the latin
    // is left only where it is still doing work.
    if (input.scriptMode === 'romaji') {
      const asKana = hasKanji(token) ? reading : token;
      const readsKana = input.readsKana ?? (() => false);
      const readable = [...asKana].every(
        (character) => !isKana(character) || readsKana(character),
      );
      return { text: readable ? asKana : toRomaji(reading), ruby: null };
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

/**
 * The headword as the learner's current rung writes it (SPEC §4.3).
 *
 * The sentence and the word have to agree. Showing かれはよくがっこうをけっせき
 * する。 and then labelling the word 欠席 puts the learner at two rungs at once,
 * and the lower one is the one they chose.
 *
 * Falls back to the headword wherever there is no reading to fall back *to* —
 * a word already written in kana, or one of the 2.9% of kanji headwords the
 * pipeline ships without a reading. Inventing one is not an option, and the
 * kanji is at least the truth.
 */
export const headwordIn = (
  scriptMode: ScriptMode,
  headword: string,
  reading: string | null,
): string => {
  if (scriptMode === 'kanji' || reading === null || reading.length === 0) return headword;
  if (!hasKanji(headword)) return scriptMode === 'romaji' ? toRomaji(headword) : headword;
  return scriptMode === 'romaji' ? toRomaji(toHiragana(reading)) : toHiragana(reading);
};

/** The kanji a sentence would teach — what needs cards for fading to mean anything. */
export const kanjiIn = (text: string): string[] => [...new Set([...text].filter(isKanji))];
