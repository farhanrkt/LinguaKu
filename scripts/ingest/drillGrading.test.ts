import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { gradeDrill, type GradableDrill } from '../../src/core/drillGrade.ts';

/**
 * Every shipped drill, graded by the app's own grader (SPEC §3.3).
 *
 * The compiler already refuses a drill whose answer is not among its options.
 * This is the other direction: no option that is *not* the answer may grade as
 * correct, and no correction drill may accept its own faulty sentence. Before
 * `gradeDrill` existed, 20 of 97 English option drills and 6 of 29 correction
 * drills failed one of these, and the three word-stress drills accepted every
 * option because their options differ only by capitals.
 */
const pack = (lang: 'en' | 'ja'): Array<GradableDrill & { id: string }> =>
  (
    JSON.parse(readFileSync(`assets/content/${lang}/contrastive.json`, 'utf8')) as {
      categories: Array<{ drills: Array<GradableDrill & { id: string }> }>;
    }
  ).categories.flatMap((category) => category.drills);

describe('shipped drills grade only their answer', () => {
  for (const lang of ['en', 'ja'] as const) {
    describe(`every shipped ${lang} drill`, () => {
      const drills = pack(lang);

      it('accepts its own answer', () => {
        const rejected = drills.filter((drill) => !gradeDrill(drill, drill.answer).correct).map((d) => d.id);
        expect(rejected).toEqual([]);
      });

      it('rejects every option that is not the answer', () => {
        const leaks = drills.flatMap((drill) =>
          (drill.options ?? [])
            .filter((option) => option !== drill.answer && gradeDrill(drill, option).correct)
            .map((option) => `${drill.id}: "${option}"`),
        );
        expect(leaks).toEqual([]);
      });

      it('rejects a correction prompt retyped unchanged', () => {
        const leaks = drills
          .filter((drill) => drill.type === 'correction' && gradeDrill(drill, drill.prompt).correct)
          .map((drill) => drill.id);
        expect(leaks).toEqual([]);
      });
    });
  }
});
