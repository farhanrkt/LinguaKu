import { type RubySegment } from '../core/furigana.ts';

/**
 * Japanese text with its readings above it (SPEC §10, §4.3).
 *
 * The decisions all live in `src/core/furigana.ts` — which script mode shows
 * what, and when a reading fades — so this is only the markup. It renders real
 * `<ruby>`, not a two-row layout: ruby is what the element exists for, it wraps
 * and reflows with the line, and it survives text zoom, which a hand-built
 * stack of absolutely positioned spans does not.
 *
 * `<rp>` brackets are there for the fallback path. A browser without ruby
 * support lays the whole thing out inline, and without them 私わたし runs
 * together into something that is neither the word nor the reading; with them it
 * reads 私(わたし). Browsers that do support ruby hide `<rp>` themselves.
 */
/**
 * The space before a segment, if there should be one. Never before the first,
 * and never before closing punctuation — `iku 。` is not how either script is
 * set, and the separator exists to make words readable, not to detach them
 * from their full stop.
 */
const gap = (separator: string, index: number, text: string): string =>
  index === 0 || separator === '' || CLOSING_PUNCTUATION.test(text) ? '' : separator;

/**
 * Japanese is set without spaces; romaji is not.
 *
 * `karehayokugakkouokessekisuru` is what joining romaji tokens with nothing
 * produces, and it defeats the only thing SPEC §4.3's romaji rung is for —
 * getting an Indonesian speaker producing sound on day one. `furigana.test.ts`
 * has asserted the spaced form since M6 (`.join(' ')`); nothing rendered it.
 */
const CLOSING_PUNCTUATION = /^[。、！？…」』）]/u;

export const Furigana = ({
  segments,
  separator = '',
}: {
  segments: readonly RubySegment[];
  /** `' '` for romaji, `''` for kana and kanji. */
  separator?: string;
}) => (
  <>
    {segments.map((segment, index) =>
      segment.ruby === null ? (
        // A plain token is plain text: wrapping it in <ruby> with an empty <rt>
        // would reserve the line space above it for nothing and make a sentence
        // with no kanji taller than one with kanji.
        <span key={index}>
          {gap(separator, index, segment.text)}
          {segment.text}
        </span>
      ) : (
        <ruby key={index}>
          {gap(separator, index, segment.text)}
          {segment.text}
          <rp>(</rp>
          <rt className="text-[0.5em] font-normal">{segment.ruby}</rt>
          <rp>)</rp>
        </ruby>
      ),
    )}
  </>
);
