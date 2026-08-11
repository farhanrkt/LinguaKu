import { copy } from '../../i18n/id.ts';

/**
 * The baseline mnemonic a kanji card opens with (SPEC §2.11).
 *
 * Deliberately thin. §2.11's finding is that **self-generated mnemonics are
 * stronger than given ones**, so the job of this text is not to be a good
 * mnemonic — it is to be a scaffold obvious enough that the learner improves on
 * it. A polished one would discourage the editing that is the effective part.
 *
 * It is also never stored. An untouched default is content, not learner data;
 * only an edit reaches the `Mnemonic` table.
 */
export const baselineMnemonic = (literal: string, components: string[]): string =>
  components.length > 0
    ? copy.session.kanji.baseline(literal, components)
    : copy.session.kanji.baselineAtomic(literal);
