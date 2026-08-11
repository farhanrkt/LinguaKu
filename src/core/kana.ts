/**
 * Kana conversion, for the script ladder (SPEC §4.3).
 *
 * SCIENCE: positive transfer — SPEC §3.2 notes that Japanese /a i u e o/ maps
 * cleanly onto Indonesian vowels and that mostly-open CV syllables match
 * Indonesian phonotactics. That is why romaji is a *usable* first rung for this
 * audience rather than a crutch that teaches the wrong sounds: an Indonesian
 * speaker reading `neko` produces something close to correct, where an English
 * speaker would not.
 *
 * It is still the rung the ladder is designed to leave. SPEC §4.3: "romaji is
 * actively deprecated after kana fluency".
 *
 * The pipeline ships readings in katakana (that is what the tokenizer produces),
 * so both conversions start there.
 */

const KATAKANA_START = 0x30a1;
const KATAKANA_END = 0x30f6;
const KANA_OFFSET = 0x60;

/** Katakana → hiragana. Anything else is passed through untouched. */
export const toHiragana = (text: string): string =>
  [...text]
    .map((character) => {
      const code = character.charCodeAt(0);
      return code >= KATAKANA_START && code <= KATAKANA_END
        ? String.fromCharCode(code - KANA_OFFSET)
        : character;
    })
    .join('');

const HIRAGANA_START = 0x3041;
const HIRAGANA_END = 0x3096;

export const toKatakana = (text: string): string =>
  [...text]
    .map((character) => {
      const code = character.charCodeAt(0);
      return code >= HIRAGANA_START && code <= HIRAGANA_END
        ? String.fromCharCode(code + KANA_OFFSET)
        : character;
    })
    .join('');

export const isKana = (character: string): boolean => {
  const code = character.charCodeAt(0);
  return (code >= HIRAGANA_START && code <= 0x309f) || (code >= 0x30a0 && code <= 0x30ff);
};

export const isKanji = (character: string): boolean => {
  const code = character.charCodeAt(0);
  return code >= 0x4e00 && code <= 0x9fff;
};

export const hasKanji = (text: string): boolean => [...text].some(isKanji);

// ------------------------------------------------------------------- romaji

/**
 * Hepburn romanization, which is the variety Indonesian learners will meet on
 * signage and in loanwords. Digraphs are matched before single kana, so きゃ
 * becomes `kya` rather than `kiya`.
 */
const ROMAJI: ReadonlyArray<readonly [string, string]> = [
  ['きゃ', 'kya'], ['きゅ', 'kyu'], ['きょ', 'kyo'],
  ['しゃ', 'sha'], ['しゅ', 'shu'], ['しょ', 'sho'],
  ['ちゃ', 'cha'], ['ちゅ', 'chu'], ['ちょ', 'cho'],
  ['にゃ', 'nya'], ['にゅ', 'nyu'], ['にょ', 'nyo'],
  ['ひゃ', 'hya'], ['ひゅ', 'hyu'], ['ひょ', 'hyo'],
  ['みゃ', 'mya'], ['みゅ', 'myu'], ['みょ', 'myo'],
  ['りゃ', 'rya'], ['りゅ', 'ryu'], ['りょ', 'ryo'],
  ['ぎゃ', 'gya'], ['ぎゅ', 'gyu'], ['ぎょ', 'gyo'],
  ['じゃ', 'ja'], ['じゅ', 'ju'], ['じょ', 'jo'],
  ['びゃ', 'bya'], ['びゅ', 'byu'], ['びょ', 'byo'],
  ['ぴゃ', 'pya'], ['ぴゅ', 'pyu'], ['ぴょ', 'pyo'],
  ['あ', 'a'], ['い', 'i'], ['う', 'u'], ['え', 'e'], ['お', 'o'],
  ['か', 'ka'], ['き', 'ki'], ['く', 'ku'], ['け', 'ke'], ['こ', 'ko'],
  ['さ', 'sa'], ['し', 'shi'], ['す', 'su'], ['せ', 'se'], ['そ', 'so'],
  ['た', 'ta'], ['ち', 'chi'], ['つ', 'tsu'], ['て', 'te'], ['と', 'to'],
  ['な', 'na'], ['に', 'ni'], ['ぬ', 'nu'], ['ね', 'ne'], ['の', 'no'],
  ['は', 'ha'], ['ひ', 'hi'], ['ふ', 'fu'], ['へ', 'he'], ['ほ', 'ho'],
  ['ま', 'ma'], ['み', 'mi'], ['む', 'mu'], ['め', 'me'], ['も', 'mo'],
  ['や', 'ya'], ['ゆ', 'yu'], ['よ', 'yo'],
  ['ら', 'ra'], ['り', 'ri'], ['る', 'ru'], ['れ', 're'], ['ろ', 'ro'],
  ['わ', 'wa'], ['を', 'o'], ['ん', 'n'],
  ['が', 'ga'], ['ぎ', 'gi'], ['ぐ', 'gu'], ['げ', 'ge'], ['ご', 'go'],
  ['ざ', 'za'], ['じ', 'ji'], ['ず', 'zu'], ['ぜ', 'ze'], ['ぞ', 'zo'],
  ['だ', 'da'], ['ぢ', 'ji'], ['づ', 'zu'], ['で', 'de'], ['ど', 'do'],
  ['ば', 'ba'], ['び', 'bi'], ['ぶ', 'bu'], ['べ', 'be'], ['ぼ', 'bo'],
  ['ぱ', 'pa'], ['ぴ', 'pi'], ['ぷ', 'pu'], ['ぺ', 'pe'], ['ぽ', 'po'],
  ['ぁ', 'a'], ['ぃ', 'i'], ['ぅ', 'u'], ['ぇ', 'e'], ['ぉ', 'o'],
  ['ゃ', 'ya'], ['ゅ', 'yu'], ['ょ', 'yo'],
];

/** Vowels a long mark extends, for ー in katakana loanwords. */
const LONG_VOWEL = /[aiueo]$/;

/**
 * Kana → Hepburn romaji.
 *
 * Two Japanese-specific rules matter for an Indonesian learner and are handled
 * explicitly rather than approximated, because both are *meaning-bearing* and
 * Indonesian has neither (SPEC §3.2's `MORA_TIMING`):
 *
 *  - **っ** (small tsu) doubles the following consonant: きって → `kitte`. Drop
 *    it and you have きて, a different word.
 *  - **ー** and doubled vowels lengthen: おばあさん → `obaasan`, not `obasan`.
 */
export const toRomaji = (kana: string): string => {
  const source = toHiragana(kana);
  let result = '';

  for (let index = 0; index < source.length; ) {
    const character = source[index]!;

    // Small tsu: double whatever consonant comes next.
    if (character === 'っ') {
      const next = source.slice(index + 1);
      const match = ROMAJI.find(([kanaForm]) => next.startsWith(kanaForm));
      const romaji = match?.[1];
      if (romaji && /^[a-z]/.test(romaji) && !/^[aiueo]/.test(romaji)) {
        result += romaji[0];
      }
      index += 1;
      continue;
    }

    // Long vowel mark: repeat whatever vowel we just wrote.
    if (character === 'ー') {
      const previous = LONG_VOWEL.exec(result)?.[0];
      if (previous) result += previous;
      index += 1;
      continue;
    }

    const digraph = ROMAJI.find(([kanaForm]) => kanaForm.length === 2 && source.startsWith(kanaForm, index));
    if (digraph) {
      result += digraph[1];
      index += 2;
      continue;
    }

    const single = ROMAJI.find(([kanaForm]) => kanaForm.length === 1 && kanaForm === character);
    if (single) {
      result += single[1];
      index += 1;
      continue;
    }

    // Punctuation, latin, an unmapped character: passed through unchanged.
    result += character;
    index += 1;
  }

  return result;
};
