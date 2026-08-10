import type { ButtonHTMLAttributes } from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'quiet';
};

const base =
  'w-full min-h-14 rounded-2xl px-5 text-base font-semibold ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ' +
  'disabled:opacity-50 motion-safe:transition-colors dark:focus-visible:outline-teal-300';

const variants = {
  // teal-700 / white clears WCAG AA (§10) in both directions.
  primary: 'bg-teal-700 text-white hover:bg-teal-800 dark:bg-teal-500 dark:text-slate-950',
  quiet: 'text-teal-800 hover:bg-teal-50 dark:text-teal-300 dark:hover:bg-slate-900',
} as const;

export const Button = ({ variant = 'primary', className = '', ...props }: ButtonProps) => (
  <button type="button" className={`${base} ${variants[variant]} ${className}`} {...props} />
);
