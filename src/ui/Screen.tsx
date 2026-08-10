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
  <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5">
    <main className="flex-1 pt-[max(1.5rem,env(safe-area-inset-top))] pb-6">{children}</main>
    {footer ? (
      <div className="sticky bottom-0 bg-gradient-to-t from-stone-50 from-60% to-transparent pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] dark:from-slate-950">
        {footer}
      </div>
    ) : null}
  </div>
);
