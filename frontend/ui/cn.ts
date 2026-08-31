import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Tailwind class merger. UI-only — do not import from the financial engine. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
