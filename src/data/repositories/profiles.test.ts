import { describe, expect, it } from 'vitest';
import { activateTarget, scriptModeOnSwitch } from './profiles.ts';

/**
 * Every consumer of a profile reads `targets[0]` as the language being taught:
 * the content loader, the item queue, the drill picker, the ability estimate and
 * the speech probe. So "which language am I learning right now" is a question
 * about the *head* of the array, and picking a language has to answer it.
 *
 * Appending instead — the original behaviour — left `targets[0]` untouched, so
 * tapping "Bahasa Jepang" changed the label on the home screen and nothing else.
 */
describe('activateTarget', () => {
  it('makes a newly chosen language the active one', () => {
    expect(activateTarget(['en'], 'ja')).toEqual(['ja', 'en']);
  });

  it('promotes an already-selected language rather than duplicating it', () => {
    expect(activateTarget(['en', 'ja'], 'ja')).toEqual(['ja', 'en']);
    expect(activateTarget(['ja', 'en'], 'ja')).toEqual(['ja', 'en']);
  });

  it('is a no-op when the language is already active', () => {
    expect(activateTarget(['en', 'ja'], 'en')).toEqual(['en', 'ja']);
  });

  it('never drops a language the learner had chosen', () => {
    expect(activateTarget(['en', 'ja'], 'ja')).toHaveLength(2);
  });

  it('never returns an empty list', () => {
    expect(activateTarget([], 'en')).toEqual(['en']);
  });
});

/**
 * SPEC §4.3: Japanese starts at kana. `scriptMode` was only ever computed when
 * the profile was created, so a learner who started in English and later
 * switched to Japanese carried `kanji` across — dropping an absolute beginner
 * into unfuriganated kanji, which is the one entry point M6 was built to avoid.
 */
describe('scriptModeOnSwitch', () => {
  it('starts a first-time Japanese learner at kana', () => {
    // They had English only, and `kanji` is merely the not-applicable default
    // a non-Japanese profile carries — not a mode they reached.
    expect(scriptModeOnSwitch(['en'], 'ja', 'kanji')).toBe('kana');
  });

  it('does not demote a learner who already had Japanese', () => {
    // `kanji` here *is* earned progress, and switching away and back must not
    // quietly send them to the start of the script ladder.
    expect(scriptModeOnSwitch(['en', 'ja'], 'ja', 'kanji')).toBe('kanji');
    expect(scriptModeOnSwitch(['ja'], 'ja', 'kanji')).toBe('kanji');
  });

  it('leaves the mode alone when switching to a language it does not describe', () => {
    expect(scriptModeOnSwitch(['ja'], 'en', 'kana')).toBe('kana');
    expect(scriptModeOnSwitch(['en'], 'en', 'kanji')).toBe('kanji');
  });
});
