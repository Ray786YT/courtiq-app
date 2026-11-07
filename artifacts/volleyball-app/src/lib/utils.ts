import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatAverage(value: number): string {
  if (isNaN(value) || !isFinite(value)) return ".000";
  const formatted = value.toFixed(3);
  return formatted.startsWith("0.") ? formatted.substring(1) : formatted;
}

export function formatPercent(value: number): string {
  if (isNaN(value) || !isFinite(value)) return "0.0%";
  return `${(value * 100).toFixed(1)}%`;
}
