import type { ReactNode } from 'react';

interface ScreenProps {
  children: ReactNode;
  /**
   * Pinned to the bottom of the viewport. SPEC §10: primary actions live in
   * the thumb zone, one-handed, above the home indicator.
   */
  footer?: ReactNode;
}

export const Screen = ({ children, footer }: ScreenProps) => (
  // `overflow-x-clip`, not `hidden`: a swipeable card travelling off the edge
  // would otherwise widen the document and let the whole page scroll sideways
  // (measured: 464px of scroll width in a 375px viewport). `clip` does not
  // create a scroll container, so the sticky footer below still sticks —
  // `hidden` would silently break it.
  <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col overflow-x-clip px-5">
    <main className="flex-1 pt-[max(1.5rem,env(safe-area-inset-top))] pb-6">{children}</main>
    {footer ? (
      // A solid footer with a hairline above it. The gradient this replaced was
      // transparent along its top 40%, and any text the footer carried there —
      // the first screen's "Pilih dulu bahasa…" hint — was drawn straight over
      // the option card scrolling beneath it.
      <div className="sticky bottom-0 -mx-5 border-t border-stone-200 bg-stone-50 px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] dark:border-slate-800 dark:bg-slate-950">
        {footer}
      </div>
    ) : null}
  </div>
);
