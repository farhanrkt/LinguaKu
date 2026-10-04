import { db } from '../db.ts';
import { kanjiIn } from '../../core/furigana.ts';
import { cardIdFor } from './reviews.ts';

/**
 * How well the learner knows each kanji in a piece of text.
 *
 * SPEC §10: *"Furigana auto-fades per-kanji as stability rises."* `furiganaFor`
 * has implemented that since M6 and takes a synchronous `stabilityOf`, so the
 * lookup has to be resolved before anything renders — which is here, because it
 * is a database read and `src/core` does not do those.
 *
 * A kanji with no card maps to `null`, not to `0`. The difference is invariant
 * 18's: zero stability would be a claim that the learner has studied this
 * character and forgotten it, and null is the truth — never studied, which is
 * exactly when the reading is needed. `isFaded` reads null as "not faded", so a
 * missing card shows furigana rather than withholding it.
 */
export const kanjiStability = async (
  profileId: string,
  text: string,
): Promise<Record<string, number | null>> => {
  const characters = kanjiIn(text);
  if (characters.length === 0) return {};

  const cards = await db.cards.bulkGet(
    characters.map((character) => cardIdFor(profileId, `ja:kanji:${character}`)),
  );

  const stability: Record<string, number | null> = {};
  characters.forEach((character, index) => {
    stability[character] = cards[index]?.fsrs.stability ?? null;
  });
  return stability;
};
