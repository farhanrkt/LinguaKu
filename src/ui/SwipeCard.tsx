import { useRef, useState, type ReactNode } from 'react';

/**
 * A card you can push away with your thumb.
 *
 * SPEC §10 puts primary actions in the thumb zone; this is the same idea one
 * step further, for the one screen a learner touches every day. It is
 * deliberately **additive**: every action reachable by swipe is still a real
 * button underneath, so nothing here is the only route to anything. A gesture
 * is a shortcut for the hand that is already holding the phone, and it is
 * invisible to a screen reader by design — the buttons are the accessible path
 * and they stay exactly as they were (§10's "full keyboard operation").
 *
 * Only ever attached to cards whose primary action is already a *tap*. On a
 * cloze or a production rung the learner is selecting text in an input, and a
 * horizontal drag there would fight them for the gesture.
 */

/** Past this fraction of the card's width, releasing commits. */
const COMMIT_RATIO = 0.28;
/** ...but never ask for more than this on a wide screen. */
const COMMIT_MAX_PX = 140;
/** Degrees of tilt at full commit distance. Small: this is paper, not a toy. */
const TILT_DEG = 6;

const prefersReducedMotion = (): boolean =>
  globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

export interface SwipeAction {
  /** Shown as the drag passes the commit threshold in this direction. */
  label: string;
  onCommit: () => void;
}

interface SwipeCardProps {
  children: ReactNode;
  /** Swipe right — the affirmative one. */
  right?: SwipeAction;
  /** Swipe left — the "not this" one. */
  left?: SwipeAction;
  className?: string;
}

export const SwipeCard = ({ children, right, left, className = '' }: SwipeCardProps) => {
  const origin = useRef<{ x: number; y: number } | null>(null);
  /** Null until the drag proves itself horizontal, so the page can still scroll. */
  const axis = useRef<'horizontal' | 'vertical' | null>(null);
  const [dx, setDx] = useState(0);
  const [settling, setSettling] = useState(false);
  /**
   * Measured when the drag starts rather than read during render: the commit
   * distance depends on how wide the card actually is, and a ref cannot be
   * consulted while rendering.
   */
  const [threshold, setThreshold] = useState(COMMIT_MAX_PX);
  const armed = Math.abs(dx) >= threshold;
  const action = dx > 0 ? right : left;
  const reachable = action !== undefined;

  const reset = () => {
    origin.current = null;
    axis.current = null;
    setDx(0);
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    // A press that starts on a control belongs to that control.
    if ((event.target as HTMLElement).closest('button, a, input, textarea, select')) return;
    origin.current = { x: event.clientX, y: event.clientY };
    axis.current = null;
    setThreshold(Math.min(COMMIT_MAX_PX, event.currentTarget.offsetWidth * COMMIT_RATIO));
    setSettling(false);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = origin.current;
    if (!start) return;
    const moveX = event.clientX - start.x;
    const moveY = event.clientY - start.y;

    if (axis.current === null) {
      // Wait for 10px before deciding, then commit to one axis for this drag.
      // Without this the page cannot be scrolled from anywhere on the card.
      if (Math.hypot(moveX, moveY) < 10) return;
      axis.current = Math.abs(moveX) > Math.abs(moveY) ? 'horizontal' : 'vertical';
      if (axis.current === 'horizontal') event.currentTarget.setPointerCapture(event.pointerId);
    }
    if (axis.current !== 'horizontal') return;

    // Resist a drag towards a side with nothing on it, rather than letting the
    // learner haul the card somewhere that will not do anything.
    const wanted = moveX > 0 ? right : left;
    setDx(wanted ? moveX : moveX * 0.25);
  };

  const onPointerUp = () => {
    if (axis.current !== 'horizontal') return reset();
    const committed = Math.abs(dx) >= threshold ? (dx > 0 ? right : left) : undefined;
    if (committed) {
      committed.onCommit();
      reset();
      return;
    }
    setSettling(true);
    reset();
  };

  const still = prefersReducedMotion();
  const offset = still ? 0 : dx;

  return (
    <div className="relative">
      {/*
        The hint reads from behind the card, in the action's own colour rather
        than a neutral grey — this is the one moment the learner needs to know
        what letting go will do, and it has to be legible against the ground it
        sits on in both themes.
      */}
      {reachable && Math.abs(dx) > 8 ? (
        <p
          aria-hidden
          className={
            'pointer-events-none absolute inset-y-0 flex items-center px-6 text-sm font-semibold ' +
            (dx > 0
              ? 'left-0 text-teal-800 dark:text-teal-300'
              : 'right-0 text-amber-800 dark:text-amber-300') +
            (armed ? ' opacity-100' : ' opacity-60')
          }
        >
          {action?.label}
        </p>
      ) : null}

      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onTransitionEnd={() => setSettling(false)}
        style={{
          transform: offset === 0 ? undefined : `translateX(${offset}px) rotate(${
            (Math.max(-1, Math.min(1, offset / (threshold || 1))) * TILT_DEG).toFixed(2)
          }deg)`,
          // Settling back is the only animated moment: the drag itself tracks
          // the thumb 1:1, because a lagging card feels broken rather than soft.
          transition: settling && !still ? 'transform 280ms cubic-bezier(0.22, 1, 0.36, 1)' : undefined,
          touchAction: 'pan-y',
        }}
        className={className}
      >
        {children}
      </div>
    </div>
  );
};
