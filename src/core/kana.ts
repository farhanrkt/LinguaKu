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

/** Katakana only — the half of `isKana` that says which script. */
export const isKatakana = (character: string): boolean => {
  const code = character.charCodeAt(0);
  return code >= KATAKANA_START && code <= KATAKANA_END;
};

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

    // Small tsu: double whatever consonant comes next — as "t" before "ch",
    // which is how Hepburn writes まっちゃ (matcha).
    if (character === 'っ') {
      const next = source.slice(index + 1);
      const match = ROMAJI.find(([kanaForm]) => next.startsWith(kanaForm));
      const romaji = match?.[1];
      if (romaji && /^[a-z]/.test(romaji) && !/^[aiueo]/.test(romaji)) {
        result += romaji.startsWith('ch') ? 't' : romaji[0];
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

// ------------------------------------------------------- romaji as it is said

/** Ideographic punctuation, as Latin text sets it. */
const LATIN_PUNCTUATION: Readonly<Record<string, string>> = {
  '。': '.',
  '、': ',',
  '？': '?',
  '！': '!',
  '「': '"',
  '」': '"',
  '『': '"',
  '』': '"',
  '（': '(',
  '）': ')',
  '：': ':',
  '・': ' ',
  '〜': '~',
  '　': ' ',
};

export const latinPunctuation = (text: string): string =>
  [...text].map((character) => LATIN_PUNCTUATION[character] ?? character).join('');

/**
 * Whole tokens whose spelling and sound part ways at a final は: two greetings,
 * and the particle pairs IPAdic keeps as one token (では is "dewa").
 */
const SPOKEN: Readonly<Record<string, string>> = {
  こんにちは: 'konnichiwa',
  こんばんは: 'konbanwa',
  では: 'dewa',
  には: 'niwa',
  とは: 'towa',
  へは: 'ewa',
};

/**
 * One token in romaji, the way it is pronounced.
 *
 * `toRomaji` spells kana; a learner reading romaji needs the sound. The topic
 * particle は is written with the kana for *ha* and said *wa*, the direction
 * particle へ is said *e*, and を is said *o*. Spelling them out put "kare ha
 * yoku gakkou …" in front of 49% of the shipped starter sentences — teaching a
 * beginner the wrong sound for the commonest particle in the language.
 *
 * A standalone は or へ token is the particle: IPADIC keeps the noun 葉 and
 * the like in kanji and folds kana words into a single token, so the bare
 * character only reaches here as a particle.
 */
export const romajiOfToken = (token: string, reading?: string | null): string => {
  const kana = toHiragana(reading !== undefined && reading !== null && reading.length > 0 ? reading : token);
  const spoken = SPOKEN[toHiragana(token)];
  if (spoken !== undefined) return spoken;
  if (token === 'は' && kana === 'は') return 'wa';
  if (token === 'へ' && kana === 'へ') return 'e';
  if (token === 'を') return 'o';
  return latinPunctuation(toRomaji(kana));
};

/** Closing punctuation takes no space before it. */
const ATTACHES = /^[.,?!)":~…]/u;

/**
 * Inflection the tokenizer splits off a verb or adjective. IPAdic cuts 読みました
 * into 読み + まし + た, and spaced out that reads "yomi mashi ta"; romaji
 * writes the word whole, "yomimashita". These are written onto whatever word
 * comes before them, kanji-only stems included (来 + ます is "kimasu").
 *
 * The app has the tokens and their readings but no part of speech (D10: no
 * tokenizer at runtime), so the rule is lexical, and the ambiguous tokens get
 * narrower rules below rather than a guess. Checked against IPAdic's own
 * part-of-speech tags over all 14,491 shipped anchor sentences, it agrees on
 * 98% of them; where it still differs from a textbook (急いで as "isoi de",
 * 出来ない as "deki nai") the difference is a space, never a sound.
 */
const INFLECTION: ReadonlySet<string> = new Set([
  'ます', 'まし', 'ませ', 'ましょ',
  'た', 'たら', 'たり', 'て', 'ば', 'う', 'ず', 'ぬ', 'ざる',
  'たい', 'たく', 'たかっ', 'たけれ', 'がる', 'がっ', 'がら', 'がり', 'がれ',
  'れる', 'れ', 'られる', 'られ', 'せる', 'せ', 'させる', 'させ', 'せよ', 'させよ',
  'てる', 'てた', 'ちゃう', 'ちゃっ', 'ちゃ',
]);

/**
 * The negative, onto the stem a verb or adjective takes before it — 知らない,
 * 食べない, よくない, and a one-kanji stem like 見ない — but not onto a noun or
 * an adverb: 問題ない is "mondai nai", 違いない "chigai nai", ことない "koto nai".
 */
const NEGATIVE: ReadonlySet<string> = new Set(['ない', 'なかっ', 'なく', 'なけれ', 'なきゃ', 'なくちゃ']);
const NEGATIVE_STEM = /[かがさたなばまらわきぎしじちにひびみりえけげせぜてでねべめれくこ]$/u;

/**
 * The voiced て and た after a verb's sound change — 読んで, 楽しんだ — which
 * are also the particle で and the copula だ. Only a stem with a kanji that ends
 * in ん is a verb's: 本で and ごはんで keep their space. The い of 急いで is
 * left out because 嫌いだ is as common and is a noun.
 */
const VOICED: ReadonlySet<string> = new Set(['で', 'だ', 'だら', 'だり', 'じゃう', 'じゃっ']);

/**
 * What an inflection never joins: a particle. IPAdic splits a hiragana name it
 * does not know — わたしはたなかです comes out as わたし は た なか です — and
 * joining that た to the particle read "watashi wata naka". A particle is never
 * the stem of a verb, so nothing is written onto one.
 */
const PARTICLES: ReadonlySet<string> = new Set([
  'は', 'が', 'を', 'に', 'で', 'と', 'も', 'へ', 'の', 'か', 'や', 'よ', 'ね', 'わ', 'な',
  'から', 'まで', 'より', 'って', 'けど', 'けれど', 'じゃ', 'では', 'には', 'とは',
  'ので', 'のに', 'など', 'だけ', 'しか', 'ほど', 'くらい', 'ぐらい',
]);

/** Whether `token` is written onto `previous` (read `previousKana`) in romaji. */
const joins = (previous: string | undefined, previousKana: string | undefined, token: string): boolean => {
  if (previous === undefined || PARTICLES.has(previous)) return false;
  if (![...previous].some((character) => isKana(character) || isKanji(character))) return false;
  // A small っ ends no word: what follows it is the rest of the word, so an
  // all-kana word the tokenizer split there is put back — がっ + こう is gakkou.
  if (previousKana?.endsWith('っ') === true) return true;
  // The polite prefix is written onto its word: お + 元気 is "ogenki", ご + 家族
  // "gokazoku".
  if (previous === 'お' || previous === 'ご') return true;
  if (INFLECTION.has(token)) return true;
  // ません: the negative ん. The explanatory ん of 行くんです stays apart.
  if (token === 'ん') return previous === 'ませ';
  // い is いる's stem — している's negative is "shite inai".
  if (NEGATIVE.has(token)) {
    return NEGATIVE_STEM.test(previous) || previous === 'い' || (previous.length === 1 && isKanji(previous));
  }
  if (VOICED.has(token)) return (hasKanji(previous) && previous.endsWith('ん')) || previous === 'ない';
  return false;
};

/** One token of a sentence in romaji, and whether it is written onto the word before it. */
export interface RomajiWord {
  text: string;
  attach: boolean;
}

/** The consonant a small っ doubles: matcha, not maccha (Hepburn). */
const geminate = (next: string): string => {
  if (next.startsWith('ch')) return 't';
  return /^[b-df-hj-np-tv-z]/.test(next) ? next[0]! : '';
};

/**
 * A sentence in romaji, token by token — what the romaji rung shows, one tap
 * target per token, and what `romajiOfTokens` joins into a line.
 *
 * Two things cross a token boundary and are handled here rather than per token:
 * an inflection is written onto its word (読み + まし + た → yomimashita), and a
 * small っ that ends a token doubles the consonant that starts the next one —
 * 高かっ + た is "takakatta", where spelling each token alone gave "takakata",
 * a different word.
 */
export const romajiWords = (
  tokens: readonly string[],
  readings: readonly (string | null | undefined)[],
): RomajiWord[] => {
  const kana = tokens.map((token, index) => {
    const reading = readings[index];
    return toHiragana(reading !== undefined && reading !== null && reading.length > 0 ? reading : token);
  });
  const spelled = tokens.map((token, index) => romajiOfToken(token, readings[index] ?? null));
  return tokens.map((token, index) => {
    const next = spelled[index + 1];
    const text = kana[index]!.endsWith('っ') && next !== undefined ? `${spelled[index]!}${geminate(next)}` : spelled[index]!;
    return { text, attach: joins(tokens[index - 1], kana[index - 1], token) };
  });
};

/**
 * A headword in romaji, or null where there is no honest way to spell it.
 *
 * A phrase compiled with its own romaji (a chunk: "o genki desu ka") keeps
 * that spacing. A word with kanji in it is spelled from its reading — and has
 * no romaji at all without one, because `toRomaji` passes kanji through and
 * "o元気desuka" is not a reading of anything. Latin headwords have none either:
 * there is nothing to add to "house".
 */
export const romajiOfWord = (
  headword: string,
  reading?: string | null,
  romaji?: string | null,
): string | null => {
  if (![...headword].some((character) => isKana(character) || isKanji(character))) return null;
  if (romaji !== undefined && romaji !== null && romaji.length > 0) return romaji;
  if (hasKanji(headword) && (reading === undefined || reading === null || reading.length === 0)) return null;
  // A kanji item's reading is KANJIDIC2's notation (なが.い); its own sound is
  // the part before the dot, and "naga.i" is not a reading of anything.
  return romajiOfToken(headword, reading ? splitKanjiReading(reading).reading : headword);
};

/**
 * A sentence in romaji: words separated by spaces, punctuation attached to the
 * word before it, particles as they are said.
 */
export const romajiOfTokens = (
  tokens: readonly string[],
  readings: readonly (string | null | undefined)[],
): string =>
  romajiWords(tokens, readings)
    .reduce((sentence, word) => {
      if (word.text.trim().length === 0) return sentence;
      if (sentence.length === 0) return word.text.trimStart();
      return ATTACHES.test(word.text) || word.attach ? `${sentence}${word.text}` : `${sentence} ${word.text}`;
    }, '')
    .replace(/\s+/g, ' ')
    .trim();

// ------------------------------------------------------------ romaji → kana

/**
 * The reverse table, longest romaji first.
 *
 * Built from `ROMAJI` rather than written out again, so the two directions
 * cannot drift. Ambiguity is resolved deliberately: several kana share a
 * romanization (じ/ぢ both `ji`, ず/づ both `zu`, を/お both `o`), and the first
 * entry in `ROMAJI` wins — which is the common spelling in every case.
 */
const KANA_BY_ROMAJI: ReadonlyArray<readonly [string, string]> = ([
  ...ROMAJI.map(([kana, romaji]) => [romaji, kana] as const),
  // Alternative spellings a learner may reasonably type. `si`/`ti`/`tu` are
  // Kunrei-shiki, which Indonesian keyboards and older textbooks still use.
  ['si', 'し'], ['ti', 'ち'], ['tu', 'つ'], ['hu', 'ふ'], ['zi', 'じ'],
  ['sya', 'しゃ'], ['syu', 'しゅ'], ['syo', 'しょ'],
  ['tya', 'ちゃ'], ['tyu', 'ちゅ'], ['tyo', 'ちょ'],
  ['jya', 'じゃ'], ['jyu', 'じゅ'], ['jyo', 'じょ'],
  ['nn', 'ん'], ['wo', 'を'],
] as ReadonlyArray<readonly [string, string]>)
  .filter(([romaji]) => /^[a-z]+$/.test(romaji))
  .sort((a, b) => b[0].length - a[0].length);

/** Romaji that could still grow into a longer syllable — held, not converted. */
const isPrefixOfSyllable = (text: string): boolean =>
  KANA_BY_ROMAJI.some(([romaji]) => romaji.length > text.length && romaji.startsWith(text));

/**
 * Romaji → kana, as an IME does it (SPEC §10: *"Japanese input without an IME
 * headache: on-screen kana keyboard + romaji input with live conversion"*).
 *
 * Written for **live** conversion, which is what makes it different from a
 * batch converter: it runs on every keystroke, so a trailing fragment that is
 * still on its way to being a syllable must be left alone. Typing `kyo` passes
 * through `k` and `ky`, and converting either of those early would fight the
 * learner's fingers.
 *
 * Two rules Indonesian has no analogue for, and both are meaning-bearing
 * (SPEC §3.2 `MORA_TIMING`):
 *
 *  - a **doubled consonant** becomes っ — `kitte` → きって, which is not きて;
 *  - **`n`** is held until the next character decides it: `na` → な, but `nka`
 *    → んか, and a trailing `n` stays latin until something follows, because
 *    the learner may be halfway through `na`.
 */
export const romajiToKana = (input: string, final = false): string => {
  const source = input.toLowerCase();
  let result = '';
  let buffer = '';

  const flush = (): void => {
    // Whatever is left that cannot become a syllable is passed through, so a
    // learner always sees what they typed rather than losing characters.
    result += buffer;
    buffer = '';
  };

  for (const character of source) {
    if (!/[a-z]/.test(character)) {
      flush();
      result += character;
      continue;
    }

    // A doubled consonant is っ plus the rest — but only where the doubling is
    // not itself a syllable: `nn` is ん, not っn.
    if (
      buffer.length === 1 &&
      buffer === character &&
      !/[aiueon]/.test(character)
    ) {
      result += 'っ';
      buffer = character;
      continue;
    }

    // `n` followed by a consonant that cannot continue it is ん.
    if (buffer === 'n' && /[bcdfghjkmpqrstvwxyz]/.test(character) && character !== 'y') {
      result += 'ん';
      buffer = character;
      continue;
    }

    buffer += character;

    const exact = KANA_BY_ROMAJI.find(([romaji]) => romaji === buffer);
    if (exact && !isPrefixOfSyllable(buffer)) {
      result += exact[1];
      buffer = '';
    } else if (buffer.length >= 3 && !isPrefixOfSyllable(buffer)) {
      // Nothing this can still become: emit the longest syllable inside it and
      // carry the remainder, rather than dropping keystrokes.
      const match = KANA_BY_ROMAJI.find(([romaji]) => buffer.startsWith(romaji));
      if (match) {
        result += match[1];
        buffer = buffer.slice(match[0].length);
      } else {
        flush();
      }
    }
  }

  // On commit, a trailing `n` is ん: the learner has stopped typing, so there
  // is no `na` still coming. Live conversion must not do this — it would turn
  // the first keystroke of `nani` into ん under their fingers.
  return final && buffer === 'n' ? `${result}ん` : result + buffer;
};

// ----------------------------------------------------- KANJIDIC2's notation

export interface KanjiReading {
  /** What the character itself is read as. */
  reading: string;
  /** Kana written after it in the word, where KANJIDIC2 marks any. */
  okurigana: string | null;
}

/**
 * Splits a KANJIDIC2 kun reading into the character's reading and its okurigana.
 *
 * KANJIDIC2 writes a kun reading with the okurigana attached and a dot marking
 * where the kanji stops — 会 is `あ.う`, meaning the character is read あ and
 * the う is written in kana after it — and marks a prefix or suffix position
 * with a hyphen: 一 is `ひと-`, 部 is `-べ`.
 *
 * That is dictionary notation, not a reading, and the kanji card rendered it
 * verbatim: **878 of the 1,748 shipped kanji (50.2%)** told the learner that
 * 会 is read `あ.う`, a string with a full stop in it that appears in no
 * Japanese word.
 *
 * **Stripping the dot would be worse than leaving it.** あう is the reading of
 * 会う, not of 会, so collapsing the two halves makes the card *false* rather
 * than merely cryptic. Both halves are kept and the card says each one plainly.
 *
 * The position hyphen is dropped — 13 of 1,748. The reading is correct either
 * way; what the hyphen adds is that the character sits at the front or back of
 * a compound, and inventing copy for that in thirteen cases buys less than it
 * costs the learner to decode.
 */
export const splitKanjiReading = (raw: string): KanjiReading => {
  const bare = raw.replace(/^-|-$/g, '');
  const dot = bare.indexOf('.');
  if (dot < 0) return { reading: bare, okurigana: null };
  return { reading: bare.slice(0, dot), okurigana: bare.slice(dot + 1) || null };
};

// ------------------------------------------------------------- the syllabary

/**
 * The gojūon, in teaching order, as rows.
 *
 * Written out rather than derived. `ROMAJI` is ordered for longest-match
 * conversion — digraphs first — which is the opposite of the order a learner
 * meets these in, and the row structure *is* the lesson: あいうえお names the
 * five vowels every other row is built from. This is the writing system, not a
 * dataset: no licence, no shard, no download.
 *
 * Base 46 first, then the voiced forms, then the contracted ones — which is
 * both the conventional order and a genuine difficulty gradient. 104 per
 * script.
 *
 * The small kana — ぁぃぅぇぉゃゅょ — are deliberately absent. They are never a
 * syllable on their own: they appear as the second half of a digraph, and the
 * digraphs are taught whole (きゃ, not き + ゃ). `ROMAJI` carries them because
 * the converter needs them; a learner does not meet them as characters.
 */
export const GOJUON: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['a', ['あ', 'い', 'う', 'え', 'お']],
  ['ka', ['か', 'き', 'く', 'け', 'こ']],
  ['sa', ['さ', 'し', 'す', 'せ', 'そ']],
  ['ta', ['た', 'ち', 'つ', 'て', 'と']],
  ['na', ['な', 'に', 'ぬ', 'ね', 'の']],
  ['ha', ['は', 'ひ', 'ふ', 'へ', 'ほ']],
  ['ma', ['ま', 'み', 'む', 'め', 'も']],
  ['ya', ['や', 'ゆ', 'よ']],
  ['ra', ['ら', 'り', 'る', 'れ', 'ろ']],
  ['wa', ['わ', 'を', 'ん']],
  ['ga', ['が', 'ぎ', 'ぐ', 'げ', 'ご']],
  ['za', ['ざ', 'じ', 'ず', 'ぜ', 'ぞ']],
  ['da', ['だ', 'ぢ', 'づ', 'で', 'ど']],
  ['ba', ['ば', 'び', 'ぶ', 'べ', 'ぼ']],
  ['pa', ['ぱ', 'ぴ', 'ぷ', 'ぺ', 'ぽ']],
  ['kya', ['きゃ', 'きゅ', 'きょ']],
  ['sha', ['しゃ', 'しゅ', 'しょ']],
  ['cha', ['ちゃ', 'ちゅ', 'ちょ']],
  ['nya', ['にゃ', 'にゅ', 'にょ']],
  ['hya', ['ひゃ', 'ひゅ', 'ひょ']],
  ['mya', ['みゃ', 'みゅ', 'みょ']],
  ['rya', ['りゃ', 'りゅ', 'りょ']],
  ['gya', ['ぎゃ', 'ぎゅ', 'ぎょ']],
  ['ja', ['じゃ', 'じゅ', 'じょ']],
  ['bya', ['びゃ', 'びゅ', 'びょ']],
  ['pya', ['ぴゃ', 'ぴゅ', 'ぴょ']],
];

export interface KanaSyllable {
  /** `ja:kana:あ` — the item id the scheduler knows it by. */
  id: string;
  /** The character as written. */
  kana: string;
  /** Its latin reading. */
  romaji: string;
  script: 'hiragana' | 'katakana';
  /** The gojūon row it belongs to, for grouping on screen. */
  row: string;
  /** Teaching position across the whole syllabary, hiragana before katakana. */
  order: number;
}

/**
 * Every kana a learner has to be able to read, in the order to meet them.
 *
 * Hiragana first and complete, then katakana — two sets of characters for the
 * same sounds, which is what makes the second half cheaper than the first and
 * why they are separate items rather than two faces of one: knowing あ is not
 * knowing ア, and the scheduler should be allowed to find that out.
 */
export const kanaSyllabary = (): KanaSyllable[] => {
  const out: KanaSyllable[] = [];
  for (const script of ['hiragana', 'katakana'] as const) {
    for (const [row, characters] of GOJUON) {
      for (const base of characters) {
        const kana = script === 'hiragana' ? base : toKatakana(base);
        out.push({
          id: `ja:kana:${kana}`,
          kana,
          romaji: toRomaji(base),
          script,
          row: script === 'hiragana' ? row : toKatakana(row),
          order: out.length,
        });
      }
    }
  }
  return out;
};

/**
 * Whether the learner can read every Japanese character in a piece of text.
 *
 * SPEC §2.9's drills are written in Japanese, and the composer picked them by
 * Elo difficulty alone — so a learner on day one was handed
 * `きのうのえいがは おもしろいでした。` and asked to rewrite it correctly. They
 * had not been taught a single character. That is not a hard question; it is an
 * unanswerable one, and getting it wrong teaches them the app is unfair rather
 * than teaching them adjectives.
 *
 * Latin and punctuation are always readable — an Indonesian-language multiple
 * choice about which script loanwords use needs no kana to answer, and those
 * drills stay available from the first session.
 */
export const canRead = (text: string, knows: (character: string) => boolean): boolean =>
  [...text].every(
    (character) => (!isKana(character) && !isKanji(character)) || knows(character),
  );
