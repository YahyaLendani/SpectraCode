"use client";

import React, { useState, useEffect } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Workflow,
  FileCode2,
  ExternalLink,
  Play,
  Pause,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface TraceStep {
  stepNumber: number;
  filePath: string;
  shortName: string;
  startLine: number;
  endLine: number;
}

interface ExecutionTraceStepperProps {
  steps: TraceStep[];
  onCitationClick: (filePath: string, startLine: number, endLine: number) => void;
}

export const ExecutionTraceStepper: React.FC<ExecutionTraceStepperProps> = ({
  steps,
  onCitationClick,
}) => {
  const [activeStep, setActiveStep] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  // Jump to step
  const handleSelectStep = (index: number) => {
    if (index < 0 || index >= steps.length) return;
    setActiveStep(index);
    const step = steps[index];
    onCitationClick(step.filePath, step.startLine, step.endLine);
  };

  // Auto-play walkthrough timer
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (isPlaying) {
      timer = setInterval(() => {
        setActiveStep((prev) => {
          const next = (prev + 1) % steps.length;
          const s = steps[next];
          onCitationClick(s.filePath, s.startLine, s.endLine);
          if (next === steps.length - 1) {
            setIsPlaying(false);
          }
          return next;
        });
      }, 2400);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isPlaying, steps, onCitationClick]);

  if (!steps || steps.length <= 1) return null;

  const current = steps[activeStep] || steps[0];

  return (
    <div className="mt-2.5 rounded-lg border border-white/[0.08] bg-[#0c0c0e] p-2.5 shadow-sm">
      {/* Stepper Header */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/[0.06]">
        <div className="flex items-center gap-1.5">
          <Workflow className="h-3.5 w-3.5 text-emerald-400" />
          <span className="font-mono text-[11px] font-semibold text-zinc-200">
            Multi-Hop Flow Stepper
          </span>
          <span className="rounded bg-white/[0.06] px-1.5 py-0.2 font-mono text-[10px] text-zinc-400">
            {activeStep + 1} of {steps.length}
          </span>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setIsPlaying(!isPlaying)}
            title={isPlaying ? "Pause walkthrough" : "Auto walkthrough trace"}
            className={cn(
              "flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-mono transition-colors",
              isPlaying
                ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300"
                : "border-white/[0.08] bg-white/[0.04] text-zinc-400 hover:text-zinc-200"
            )}
          >
            {isPlaying ? (
              <>
                <Pause className="h-2.5 w-2.5" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="h-2.5 w-2.5" />
                <span>Play</span>
              </>
            )}
          </button>

          <button
            type="button"
            disabled={activeStep === 0}
            onClick={() => handleSelectStep(activeStep - 1)}
            title="Previous trace step"
            className="rounded border border-white/[0.08] bg-white/[0.04] p-1 text-zinc-400 hover:text-zinc-100 disabled:opacity-30 disabled:pointer-events-none transition-colors"
          >
            <ChevronLeft className="h-3 w-3" />
          </button>

          <button
            type="button"
            disabled={activeStep === steps.length - 1}
            onClick={() => handleSelectStep(activeStep + 1)}
            title="Next trace step"
            className="rounded border border-white/[0.08] bg-white/[0.04] p-1 text-zinc-400 hover:text-zinc-100 disabled:opacity-30 disabled:pointer-events-none transition-colors"
          >
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Horizontal Step Timeline */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 pt-0.5 scrollbar-thin">
        {steps.map((st, idx) => {
          const isActive = idx === activeStep;
          const isPassed = idx < activeStep;

          return (
            <React.Fragment key={idx}>
              <button
                type="button"
                onClick={() => handleSelectStep(idx)}
                className={cn(
                  "group flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-left font-mono text-[10px] transition-all",
                  isActive
                    ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-200 shadow-[0_0_12px_rgba(16,185,129,0.15)] ring-1 ring-emerald-500/30"
                    : isPassed
                    ? "border-white/[0.12] bg-white/[0.05] text-zinc-300 hover:bg-white/[0.08]"
                    : "border-white/[0.06] bg-white/[0.02] text-zinc-400 hover:border-white/[0.12] hover:text-zinc-300"
                )}
              >
                <span
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold",
                    isActive
                      ? "bg-emerald-400 text-black font-semibold"
                      : isPassed
                      ? "bg-white/[0.12] text-zinc-200"
                      : "bg-white/[0.05] text-zinc-400"
                  )}
                >
                  {st.stepNumber}
                </span>

                <span className="truncate max-w-[110px]" title={st.filePath}>
                  {st.shortName}
                </span>

                <span className="opacity-60 text-[9px]">
                  :{st.startLine}
                  {st.endLine !== st.startLine ? `-${st.endLine}` : ""}
                </span>
              </button>

              {idx < steps.length - 1 && (
                <span className="text-zinc-400 text-[10px] font-mono shrink-0 select-none">
                  →
                </span>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Active Step Context Callout */}
      <div className="mt-2 flex items-center justify-between rounded bg-[#111113] border border-white/[0.05] px-2.5 py-1.5 text-[11px]">
        <div className="flex items-center gap-1.5 text-zinc-300 truncate">
          <FileCode2 className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
          <span className="font-mono text-zinc-400 text-[10px]">Active Span:</span>
          <span className="font-mono text-zinc-200 font-semibold truncate">
            {current.filePath}
          </span>
          <span className="font-mono text-emerald-400 text-[10px] shrink-0">
            (lines {current.startLine}–{current.endLine})
          </span>
        </div>

        <button
          type="button"
          onClick={() => onCitationClick(current.filePath, current.startLine, current.endLine)}
          className="flex items-center gap-1 text-[10px] font-mono text-emerald-400 hover:text-emerald-300 shrink-0 ml-2"
        >
          <span>Focus in Monaco</span>
          <ExternalLink className="h-2.5 w-2.5" />
        </button>
      </div>
    </div>
  );
};
