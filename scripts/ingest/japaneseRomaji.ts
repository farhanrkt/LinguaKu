/**
 * Build-time romaji for authored Japanese text (drills, notes, labels).
 *
 * The app never tokenizes at runtime (D10), and authored strings — unlike
 * corpus sentences — ship no token readings, so their romaji is worked out here
 * with the same IPAdic tokenizer the corpus pipeline uses, and spelled by the
 * same `romajiOfToken` the app uses, particles as they are said.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { latinPunctuation, romajiOfTokens } from '../../src/core/kana.ts';

interface KuromojiToken {
  surface_form: string;
  reading?: string;
}
interface Tokenizer {
  tokenize(text: string): KuromojiToken[];
}

const require = createRequire(import.meta.url);

export const loadTokenizer = (): Promise<Tokenizer> => {
  const kuromoji = require('@sglkc/kuromoji') as {
    builder(options: { dicPath: string }): {
      build(callback: (error: Error | null, tokenizer: Tokenizer) => void): void;
    };
  };
  const dicPath = join(dirname(require.resolve('@sglkc/kuromoji/package.json')), 'dict');
  return new Promise<Tokenizer>((resolve, reject) => {
    kuromoji.builder({ dicPath }).build((error, built) => (error ? reject(error) : resolve(built)));
  });
};

/** A run of Japanese, punctuation included so a sentence stays one run. */
const RUN = /[぀-ヿ一-鿿々〆][぀-ヿ一-鿿々〆ー、。？！・〜「」]*/gu;

export const hasJapanese = (text: string): boolean => /[぀-ヿ一-鿿]/u.test(text);

const romajiOfRun = (tokenizer: Tokenizer, run: string): string => {
  const tokens = tokenizer.tokenize(run);
  return romajiOfTokens(
    tokens.map((token) => token.surface_form),
    tokens.map((token) => (token.reading && token.reading !== '*' ? token.reading : token.surface_form)),
  );
};

/**
 * The whole string with its Japanese spelled in romaji, everything else kept —
 * and set as Latin text is set: 「 」 become quotation marks, and a full stop
 * that Japanese runs straight into the next character gets its space back.
 */
export const romajiLine = (tokenizer: Tokenizer, text: string): string =>
  latinPunctuation(text.replace(RUN, (run) => romajiOfRun(tokenizer, run)))
    .replace(/([.?!,])(?=[(\p{L}])/gu, '$1 ')
    .replace(/\s+/g, ' ')
    .trim();

/** Punctuation a run carries at its end, which its romaji does not repeat. */
const TRAILING_PUNCTUATION = /[、。？！・〜「」]+$/u;

/** Romaji reduced to its letters, for comparing two spellings of one reading. */
const squash = (romaji: string): string => romaji.toLowerCase().replace(/[^a-z]/g, '');

/** Romaji written by hand straight after the Japanese it reads: 人{nin}. */
const OVERRIDE = /^\{([a-z][a-z' -]*)\}/u;

/**
 * Indonesian prose with each Japanese run followed by its romaji: "は dipakai"
 * becomes "は (wa) dipakai".
 *
 * Three cases, so that a hand-written reading always wins over the tokenizer
 * and a gloss is never mistaken for one:
 *
 *  - `人{nin}` is a reading written by hand, for where IPAdic reads a lone
 *    character as the word rather than the counter. It becomes `人 (nin)`.
 *  - A parenthesis that already opens with this romaji — `本 (hon)`,
 *    `おばさん (obasan, bibi)` — is left as it is, so running this twice
 *    changes nothing.
 *  - Anything else gets the romaji inserted, including a run followed by a
 *    parenthesis that is something else: `おばさん (bibi)` is a gloss, and
 *    reading it as romaji is how a word ended up with no reading at all.
 */
export const annotate = (tokenizer: Tokenizer, text: string): string =>
  text
    .replace(RUN, (run, offset: number, whole: string) => {
      const after = whole.slice(offset + run.length);
      if (OVERRIDE.test(after)) return run;
      const romaji = romajiOfRun(tokenizer, run.replace(TRAILING_PUNCTUATION, ''));
      // A lone っ has no sound of its own to write.
      if (squash(romaji).length === 0) return run;
      const opened = /^\s*\(([^)]*)/u.exec(after);
      if (opened && squash(opened[1]!).startsWith(squash(romaji))) return run;
      return `${run} (${romaji})`;
    })
    .replace(/\{([a-z][a-z' -]*)\}/gu, ' ($1)');

/**
 * The romaji line under a Japanese sentence prompt — the sentence only. A
 * translation or an instruction the author put after it, "(Siapa yang
 * datang?)" or "— isi bagian pertama", is Indonesian already and is not
 * repeated underneath.
 */
export const sentenceRomaji = (tokenizer: Tokenizer, text: string): string => {
  const cut = text.search(/\s*(\(|—)/u);
  return romajiLine(tokenizer, cut === -1 ? text : text.slice(0, cut));
};

/** Whether a string opens with Japanese — a sentence, rather than prose about one. */
export const startsJapanese = (text: string): boolean => /^[぀-ヿ一-鿿々〆]/u.test(text.trim());
