"use client";

import React from "react";
import { cn } from "@/lib/utils";
import type { Repository } from "@/lib/api";

/* -------------------------------------------------------------------------
 * Roundel: the numbered station that stands for one cited span.
 * ---------------------------------------------------------------------- */

interface RoundelProps {
  n: number | string;
  color: string;
  /** "solid" for citations in text, "ring" for stations on a route. */
  variant?: "solid" | "ring" | "now";
  className?: string;
}

export const Roundel: React.FC<RoundelProps> = ({
  n,
  color,
  variant = "solid",
  className,
}) => (
  <span
    aria-hidden="true"
    className={cn(
      "inline-grid h-5 w-5 shrink-0 place-items-center rounded-full font-sans text-[0.6875rem] font-extrabold leading-none tabular-nums",
      variant === "solid" && "text-white",
      variant === "ring" && "border-[3px] bg-white text-ink",
      variant === "now" && "border-[3px] border-ink bg-signal text-ink",
      className
    )}
    style={
      variant === "solid"
        ? { backgroundColor: color }
        : variant === "ring"
        ? { borderColor: color }
        : undefined
    }
  >
    {/* Overpass numerals sit a hair high in a circle; nudge them down. */}
    <span className="translate-y-[0.5px]">{n}</span>
  </span>
);

/* -------------------------------------------------------------------------
 * Indexing line: clone → parse → embed → ready, drawn as four stops.
 * ---------------------------------------------------------------------- */

export const INDEXING_STOPS = ["Clone", "Parse", "Embed", "Ready"] as const;

/** Index of the stop being worked on; 4 means every stop is done. */
export function indexingStep(status: Repository["status"]): number {
  switch (status) {
    case "ready":
      return 4;
    case "embedding":
      return 2;
    case "parsing_ast":
      return 1;
    default:
      return 0;
  }
}

export function indexingLabel(status: Repository["status"]): string {
  switch (status) {
    case "ready":
      return "Ready";
    case "embedding":
      return "Embedding, step 3 of 4";
    case "parsing_ast":
      return "Parsing, step 2 of 4";
    case "cloning":
      return "Cloning, step 1 of 4";
    case "failed":
      return "Indexing failed";
    default:
      return "Queued";
  }
}

const STOP_GAP = 56;
const STOP_R = 6;
const LINE_W = STOP_GAP * 3 + STOP_R * 2 + 2;

export const IndexingLine: React.FC<{ status: Repository["status"] }> = ({
  status,
}) => {
  const failed = status === "failed";
  const step = indexingStep(status);
  const x = (i: number) => STOP_R + 1 + i * STOP_GAP;
  const doneTo = Math.min(step, 3);

  return (
    <svg
      role="img"
      aria-label={indexingLabel(status)}
      width={LINE_W}
      height={16}
      viewBox={`0 0 ${LINE_W} 16`}
      className="block shrink-0"
    >
      <line x1={x(0)} y1={8} x2={x(3)} y2={8} stroke="#C9CDD1" strokeWidth={4} strokeLinecap="round" />
      {!failed && doneTo > 0 && (
        <line x1={x(0)} y1={8} x2={x(doneTo)} y2={8} stroke="#007A41" strokeWidth={4} strokeLinecap="round" />
      )}
      {INDEXING_STOPS.map((stop, i) => {
        if (failed) {
          return (
            <circle key={stop} cx={x(i)} cy={8} r={STOP_R - 1.5} fill="#fff" stroke={i === 0 ? "#E2231A" : "#C9CDD1"} strokeWidth={3} />
          );
        }
        if (i < step) {
          return <circle key={stop} cx={x(i)} cy={8} r={STOP_R} fill="#007A41" />;
        }
        if (i === step) {
          return (
            <circle
              key={stop}
              cx={x(i)}
              cy={8}
              r={STOP_R - 1}
              fill="#FFD400"
              stroke="#15171A"
              strokeWidth={2}
              className={status === "pending" ? undefined : "station-now"}
            />
          );
        }
        return <circle key={stop} cx={x(i)} cy={8} r={STOP_R - 1.5} fill="#fff" stroke="#C9CDD1" strokeWidth={3} />;
      })}
    </svg>
  );
};

/** Column header that names each stop once, aligned over the stations. */
export const IndexingLineHeader: React.FC = () => (
  <span
    aria-hidden="true"
    className="relative block h-4"
    style={{ width: LINE_W }}
  >
    {INDEXING_STOPS.map((stop, i) => (
      <span
        key={stop}
        className={cn(
          "absolute top-0 whitespace-nowrap",
          i === 0 ? "left-0" : i === 3 ? "right-0" : "-translate-x-1/2"
        )}
        style={i === 1 || i === 2 ? { left: STOP_R + 1 + i * STOP_GAP } : undefined}
      >
        {stop}
      </span>
    ))}
  </span>
);

/* -------------------------------------------------------------------------
 * Route: an answer's citations as stations on a line. Each stop's segment
 * takes the colour of its file, and the bar under the path is as long as
 * the span is (2px per line, capped), so a 4-line span and a 40-line span
 * do not look alike.
 * ---------------------------------------------------------------------- */

export interface RouteStop {
  n: number;
  filePath: string;
  startLine: number;
  endLine: number;
  color: string;
}

interface RouteProps {
  stops: RouteStop[];
  activeIndex?: number;
  onSelect?: (index: number) => void;
  /** Extra text after the line range, e.g. "checked". */
  note?: React.ReactNode;
  className?: string;
}

export const Route: React.FC<RouteProps> = ({
  stops,
  activeIndex,
  onSelect,
  note,
  className,
}) => (
  <ol className={cn("relative", className)}>
    {stops.map((stop, i) => {
      const isActive = activeIndex === i;
      const lines = stop.endLine - stop.startLine + 1;
      const last = i === stops.length - 1;
      const body = (
        <>
          <span className="block truncate font-mono text-[0.8125rem] font-semibold text-ink" title={stop.filePath}>
            {stop.filePath}
          </span>
          <span className="mt-0.5 flex items-center gap-2 text-[0.8125rem] text-sub">
            <span className="tabular-nums">
              {lines === 1
                ? `line ${stop.startLine}`
                : `lines ${stop.startLine}–${stop.endLine}`}
            </span>
            <span
              aria-hidden="true"
              className="h-1 rounded-full"
              style={{
                width: Math.max(4, Math.min(lines * 2, 72)),
                backgroundColor: stop.color,
              }}
            />
            {note}
          </span>
        </>
      );

      return (
        <li key={`${stop.n}-${stop.filePath}-${stop.startLine}`} className="relative flex gap-3 pb-4 last:pb-0">
          {!last && (
            <span
              aria-hidden="true"
              className="absolute left-[7px] top-3 h-full w-1.5 rounded-full"
              style={{ backgroundColor: stop.color }}
            />
          )}
          <Roundel
            n={stop.n}
            color={stop.color}
            variant={isActive ? "now" : "ring"}
            className="relative z-10 mt-0.5"
          />
          {onSelect ? (
            <button
              type="button"
              onClick={() => onSelect(i)}
              aria-current={isActive ? "step" : undefined}
              className={cn(
                "-my-1 -ml-1.5 min-w-0 flex-1 cursor-pointer rounded px-1.5 py-1 text-left transition-colors duration-150 hover:bg-wash",
                isActive && "bg-signal-soft hover:bg-signal-soft"
              )}
            >
              {body}
            </button>
          ) : (
            <div className="min-w-0 flex-1">{body}</div>
          )}
        </li>
      );
    })}
  </ol>
);
