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
      return "text-blue-300 bg-blue-500/10 border-blue-500/25";
    case "typescript":
    case "tsx":
    case "ts":
      return "text-sky-300 bg-sky-500/10 border-sky-500/25";
    case "javascript":
    case "jsx":
    case "js":
      return "text-amber-300 bg-amber-500/10 border-amber-500/25";
    case "rust":
    case "rs":
      return "text-orange-300 bg-orange-500/10 border-orange-500/25";
    case "go":
      return "text-cyan-300 bg-cyan-500/10 border-cyan-500/25";
    default:
      return "text-zinc-300 bg-white/[0.04] border-white/[0.09]";
  }
}

export function getSymbolBadgeStyle(kind: string): string {
  switch ((kind || "").toLowerCase()) {
    case "class":
    case "interface":
      return "text-amber-300 bg-amber-500/10 border-amber-500/25";
    case "function":
      return "text-blue-300 bg-blue-500/10 border-blue-500/25";
    case "method":
      return "text-sky-300 bg-sky-500/10 border-sky-500/25";
    default:
      return "text-zinc-300 bg-white/[0.05] border-white/[0.09]";
  }
}
