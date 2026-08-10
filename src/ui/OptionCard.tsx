interface OptionCardProps {
  label: string;
  hint?: string;
  selected: boolean;
  onToggle: () => void;
}

/**
 * A large, one-handed tap target (SPEC §10). `aria-pressed` keeps the toggle
 * state audible to screen readers and keyboard-operable for free.
 */
export const OptionCard = ({ label, hint, selected, onToggle }: OptionCardProps) => (
  <button
    type="button"
    aria-pressed={selected}
    onClick={onToggle}
    className={
      'flex w-full min-h-16 items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left ' +
      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ' +
      'motion-safe:transition-colors dark:focus-visible:outline-teal-300 ' +
      (selected
        ? 'border-teal-700 bg-teal-50 dark:border-teal-400 dark:bg-teal-950'
        : 'border-stone-300 hover:border-stone-400 dark:border-slate-700 dark:hover:border-slate-600')
    }
  >
    <span
      aria-hidden
      className={
        'grid size-6 shrink-0 place-items-center rounded-full border-2 ' +
        (selected
          ? 'border-teal-700 bg-teal-700 text-white dark:border-teal-400 dark:bg-teal-400 dark:text-slate-950'
          : 'border-stone-400 dark:border-slate-600')
      }
    >
      {selected ? '✓' : ''}
    </span>
    <span className="flex-1">
      <span className="block font-semibold">{label}</span>
      {hint ? (
        <span className="block text-sm text-stone-600 dark:text-slate-400">{hint}</span>
      ) : null}
    </span>
  </button>
);
