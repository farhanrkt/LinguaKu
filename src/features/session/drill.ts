import { mulberry32, shuffle } from '../../core/rng.ts';
import { loadContrastive, type Category, type Drill } from '../../data/contrastive.ts';
import type { TargetLang } from '../../data/types.ts';

/**
 * Turns a scheduled drill id into something answerable (SPEC §3.3).
 *
 * Drill ids are routed by prefix: the session queue holds item ids, and a drill
 * is not an item. `isDrillId` is the discriminator, and it works because drill
 * ids are `CATEGORY-n` while lexeme ids are `en:lex:word` — the pipeline
 * guarantees both shapes.
 */

export interface DrillTask {
  drill: Drill;
  category: Category;
  /** Shuffled per session, so the answer is not always in the same position. */
  options: string[];
}

/** Lexeme ids are namespaced `en:lex:…`; drill ids never contain a colon. */
export const isDrillId = (id: string): boolean => /^[A-Z][A-Z0-9_]*-\d+$/.test(id);

export const buildDrillTask = async (
  lang: TargetLang,
  drillId: string,
  seed: number,
): Promise<DrillTask | null> => {
  const pack = await loadContrastive(lang);
  const drill = pack.byDrillId.get(drillId);
  if (!drill) return null;
  const category = pack.byCategory.get(drill.categoryId);
  if (!category) return null;

  return {
    drill,
    category,
    options: drill.options ? shuffle(drill.options, mulberry32(seed)) : [],
  };
};
