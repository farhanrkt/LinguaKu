import { Fragment, useRef, useState, type KeyboardEvent } from 'react';

/**
 * Running text whose every word can be tapped, at the cost of **one** tab stop.
 *
 * SPEC §10 promises "full keyboard operation on desktop", and the reader kept
 * that promise in the most expensive way available: every word was a plain
 * `<button>`, so a screen carrying two passages and twenty sentences put on the
 * order of three hundred tab stops between the learner and anything else on it.
 * Reachable is not the same as operable — a learner who wants the "Kembali"
 * button pays for every word they are not interested in, and that cost lands
 * hardest on the switch-device and one-handed users §10 exists for.
 *
 * So the words become a **composite widget** (the WAI-ARIA roving tabindex
 * pattern): the block is one stop in the page's tab order, and Left/Right —
 * plus Home/End — move between words inside it. Tab enters and leaves; arrows
 * navigate. Tapping is unchanged, because a tap was never the problem.
 *
 * Arrows **clamp** rather than wrap. Wrapping from the last word of a paragraph
 * back to the first is disorienting in prose, where the reader's model is a
 * line of text rather than a ring of controls.
 */

/**
 * The id of the one hint that explains the arrow keys, rendered by the screen
 * that owns the text — this primitive stays free of learner-facing copy, which
 * lives in `src/i18n` and nowhere else.
 */
export const WORD_NAV_HINT_ID = 'reader-word-nav';

export type TextPart =
  /** Whitespace and punctuation between words: rendered, never focusable. */
  | { kind: 'gap'; text: string }
  | { kind: 'word'; text: string; className?: string };

/**
 * Where the caret goes for a key, or null when the key is not ours to handle.
 *
 * Pure, and separated from the component so the navigation rule is unit-tested
 * rather than inferred from a rendering test.
 */
export const nextWordIndex = (key: string, current: number, count: number): number | null => {
  if (count === 0) return null;
  switch (key) {
    case 'ArrowRight':
      return Math.min(current + 1, count - 1);
    case 'ArrowLeft':
      return Math.max(current - 1, 0);
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
};

/**
 * Each part's index *among the words*, or -1 for a gap.
 *
 * Precomputed rather than counted inside the render, because the roving
 * tabindex needs a word's position and a mutable counter walked during a map is
 * exactly the pattern that goes wrong on a re-render.
 */
export const wordPositions = (parts: readonly TextPart[]): number[] => {
  const positions: number[] = [];
  let next = 0;
  for (const part of parts) {
    positions.push(part.kind === 'word' ? next : -1);
    if (part.kind === 'word') next += 1;
  }
  return positions;
};

interface TappableTextProps {
  parts: readonly TextPart[];
  /** Names the block for a screen reader — what this text is, not how to move. */
  label: string;
  /** The id of the visually hidden hint that explains the arrow keys. */
  describedBy?: string;
  onTap: (word: string, index: number) => void;
  className?: string;
  wordTestId?: string;
  testId?: string;
}

export const TappableText = ({
  parts,
  label,
  describedBy,
  onTap,
  className = '',
  wordTestId,
  testId,
}: TappableTextProps) => {
  const container = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  const positions = wordPositions(parts);
  const wordCount = positions.reduce((count, position) => (position >= 0 ? count + 1 : count), 0);
  // The text can change under us — a new passage, a re-selected feed — and a
  // stale index would leave the block with no tab stop at all.
  const activeIndex = Math.min(active, Math.max(wordCount - 1, 0));

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = nextWordIndex(event.key, activeIndex, wordCount);
    if (next === null) return;
    // Home/End would otherwise scroll the page out from under the learner.
    event.preventDefault();
    setActive(next);
    container.current?.querySelectorAll<HTMLButtonElement>('[data-word]')[next]?.focus();
  };

  return (
    <div
      ref={container}
      role="group"
      aria-label={label}
      {...(describedBy === undefined ? {} : { 'aria-describedby': describedBy })}
      onKeyDown={handleKeyDown}
      className={className}
      data-testid={testId}
    >
      {parts.map((part, index) => {
        if (part.kind === 'gap') return <Fragment key={index}>{part.text}</Fragment>;
        const position = positions[index] ?? 0;
        return (
          <button
            key={index}
            type="button"
            data-word
            data-testid={wordTestId}
            // The roving part: exactly one word is in the tab order at a time.
            tabIndex={position === activeIndex ? 0 : -1}
            // Clicking a word makes it the block's entry point, so Tab returns
            // to where the learner last was rather than to the first word.
            onFocus={() => setActive(position)}
            onClick={() => onTap(part.text, position)}
            className={part.className ?? ''}
          >
            {part.text}
          </button>
        );
      })}
    </div>
  );
};
