import { useState } from 'react';
import { copy } from '../i18n/id.ts';
import { romajiToKana, toKatakana } from '../core/kana.ts';

/**
 * Japanese input without an IME headache (SPEC §10).
 *
 * The requirement is specific: *"on-screen kana keyboard + romaji input with
 * live conversion"*. Both halves are here because they fail differently — a
 * learner on a phone with no Japanese keyboard installed cannot type kana at
 * all, and a learner who has one still may not know how to switch to it
 * mid-session. Typing `neko` and watching ねこ appear needs neither.
 *
 * **It is an aid, not a gate.** Whatever is in the field is what gets answered,
 * so a learner with a real IME can ignore all of this and type Japanese
 * directly — the converter passes kana through untouched.
 */

/** Consonant rows, in the order a Japanese chart has them (あかさたな…). */
const ROWS: ReadonlyArray<readonly string[]> = [
  ['あ', 'い', 'う', 'え', 'お'],
  ['か', 'き', 'く', 'け', 'こ'],
  ['さ', 'し', 'す', 'せ', 'そ'],
  ['た', 'ち', 'つ', 'て', 'と'],
  ['な', 'に', 'ぬ', 'ね', 'の'],
  ['は', 'ひ', 'ふ', 'へ', 'ほ'],
  ['ま', 'み', 'む', 'め', 'も'],
  ['や', '', 'ゆ', '', 'よ'],
  ['ら', 'り', 'る', 'れ', 'ろ'],
  ['わ', '', 'を', '', 'ん'],
];

interface KanaInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  'data-testid'?: string;
  onSubmit?: () => void;
}

export const KanaInput = ({
  value,
  onChange,
  placeholder,
  onSubmit,
  'data-testid': testId,
}: KanaInputProps) => {
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [katakana, setKatakana] = useState(false);

  const append = (kana: string) => onChange(value + (katakana ? toKatakana(kana) : kana));

  return (
    <div>
      <input
        type="text"
        value={value}
        // Live conversion on every keystroke. A trailing `n` is deliberately
        // left as latin here and only becomes ん on commit — see romajiToKana.
        onChange={(event) => onChange(romajiToKana(event.target.value))}
        onBlur={() => onChange(romajiToKana(value, true))}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || !onSubmit) return;
          onChange(romajiToKana(value, true));
          onSubmit();
        }}
        placeholder={placeholder}
        data-testid={testId}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        className="w-full min-h-14 rounded-2xl border-2 border-stone-300 px-4 text-lg dark:border-slate-700 dark:bg-slate-950"
      />

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => setShowKeyboard((open) => !open)}
          data-testid="kana-keyboard-toggle"
          className="min-h-12 flex-1 rounded-xl border-2 border-stone-300 px-3 text-sm font-semibold text-teal-800 dark:border-slate-700 dark:text-teal-300"
        >
          {showKeyboard ? copy.kana.hideKeyboard : copy.kana.showKeyboard}
        </button>
        {showKeyboard ? (
          <button
            type="button"
            onClick={() => setKatakana((on) => !on)}
            aria-pressed={katakana}
            data-testid="kana-script-toggle"
            className="min-h-12 rounded-xl border-2 border-stone-300 px-3 text-sm font-semibold text-teal-800 dark:border-slate-700 dark:text-teal-300"
          >
            {katakana ? copy.kana.katakana : copy.kana.hiragana}
          </button>
        ) : null}
      </div>

      {showKeyboard ? (
        <div className="mt-2" data-testid="kana-keyboard">
          <p className="text-xs text-stone-500 dark:text-slate-500">{copy.kana.hint}</p>
          <div className="mt-2 grid grid-cols-5 gap-1">
            {ROWS.flat().map((kana, index) =>
              kana === '' ? (
                <span key={index} />
              ) : (
                <button
                  key={index}
                  type="button"
                  onClick={() => append(kana)}
                  // 56px+ tap targets (SPEC §10), even at five to a row.
                  className="min-h-14 rounded-lg bg-stone-100 text-lg font-semibold motion-safe:transition-colors hover:bg-teal-50 dark:bg-slate-900 dark:hover:bg-slate-800"
                >
                  {katakana ? toKatakana(kana) : kana}
                </button>
              ),
            )}
          </div>
          <div className="mt-1 grid grid-cols-5 gap-1">
            {['゛', '゜', 'っ', 'ー', '⌫'].map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  if (key === '⌫') return onChange([...value].slice(0, -1).join(''));
                  if (key === '゛' || key === '゜') return onChange(addDiacritic(value, key));
                  return append(key);
                }}
                className="min-h-14 rounded-lg bg-stone-100 text-lg font-semibold motion-safe:transition-colors hover:bg-teal-50 dark:bg-slate-900 dark:hover:bg-slate-800"
              >
                {key}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
};

/**
 * Applies ゛/゜ to the last character, the way a kana keyboard does.
 *
 * Dakuten is a codepoint offset of 1 on the rows that take it and 2 for
 * handakuten on the は row — cheaper and more correct than a 46-entry table,
 * and a character that takes neither is left alone rather than mangled.
 */
const addDiacritic = (value: string, mark: '゛' | '゜'): string => {
  const characters = [...value];
  const last = characters.pop();
  if (last === undefined) return value;

  const voiced = 'かきくけこさしすせそたちつてとはひふへほ';
  const semi = 'はひふへほ';
  if (mark === '゛' && voiced.includes(last)) {
    return [...characters, String.fromCharCode(last.charCodeAt(0) + 1)].join('');
  }
  if (mark === '゜' && semi.includes(last)) {
    return [...characters, String.fromCharCode(last.charCodeAt(0) + 2)].join('');
  }
  return value;
};
