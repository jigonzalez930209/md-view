import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Joins Tailwind classes resolving conflicts (shadcn utility). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
