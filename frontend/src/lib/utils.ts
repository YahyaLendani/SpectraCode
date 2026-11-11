import { ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number, decimals = 1) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

export function formatCompactNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}k`;
  return String(num);
}

export function getLanguageColor(lang: string): string {
  switch ((lang || "").toLowerCase()) {
    case "python":
    case "py":
      return "text-line-blue bg-line-blue-soft border-line-blue/40";
    case "typescript":
    case "tsx":
    case "ts":
      return "text-line-teal bg-line-teal-soft border-line-teal/40";
    case "javascript":
    case "jsx":
    case "js":
      return "text-line-orange bg-line-orange-soft border-line-orange/40";
    case "rust":
    case "rs":
      return "text-line-red bg-line-red-soft border-line-red/40";
    case "go":
      return "text-line-violet bg-line-violet-soft border-line-violet/40";
    default:
      return "text-ink-2 bg-wash border-rule-strong";
  }
}

export function getSymbolBadgeStyle(kind: string): string {
  switch ((kind || "").toLowerCase()) {
    case "class":
    case "interface":
      return "text-line-violet bg-line-violet-soft border-line-violet/40";
    case "function":
      return "text-line-blue bg-line-blue-soft border-line-blue/40";
    case "method":
      return "text-line-teal bg-line-teal-soft border-line-teal/40";
    default:
      return "text-ink-2 bg-wash border-rule-strong";
  }
}

/**
 * Line colours. In a route, each distinct file gets the next colour in
 * this order, so the first file cited is always blue, the second red, and
 * so on. All six hold white text at 4.5:1 or better.
 */
export const LINE_COLORS = [
  "#0A5FD9",
  "#E2231A",
  "#007A41",
  "#B84E00",
  "#7A3DB8",
  "#00788A",
] as const;

export function assignLineColors(filePaths: string[]): Record<string, string> {
  const colors: Record<string, string> = {};
  let next = 0;
  for (const path of filePaths) {
    if (!(path in colors)) {
      colors[path] = LINE_COLORS[next % LINE_COLORS.length];
      next += 1;
    }
  }
  return colors;
}
