"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Play, Pause } from "lucide-react";
import { assignLineColors } from "@/lib/utils";
import { Route } from "@/components/LineMap";

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

/**
 * The route under an answer that cites more than one span. Each citation is
 * a station; stepping to it opens the code at those lines.
 */
export const ExecutionTraceStepper: React.FC<ExecutionTraceStepperProps> = ({
  steps,
  onCitationClick,
}) => {
  const [activeStep, setActiveStep] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  const handleSelectStep = (index: number) => {
    if (index < 0 || index >= steps.length) return;
    setActiveStep(index);
    const step = steps[index];
    onCitationClick(step.filePath, step.startLine, step.endLine);
  };

  // The parent may pass a new function on every render; read it through a ref
  // so the walk-through timer is not restarted each time.
  const onCitationClickRef = useRef(onCitationClick);
  useEffect(() => {
    onCitationClickRef.current = onCitationClick;
  }, [onCitationClick]);

  // Walk the route one stop at a time, then stop at the end of the line.
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (isPlaying) {
      timer = setInterval(() => {
        setActiveStep((prev) => {
          const next = (prev + 1) % steps.length;
          const s = steps[next];
          onCitationClickRef.current(s.filePath, s.startLine, s.endLine);
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
  }, [isPlaying, steps]);

  const stops = useMemo(() => {
    const colors = assignLineColors(steps.map((s) => s.filePath));
    return steps.map((s) => ({
      n: s.stepNumber,
      filePath: s.filePath,
      startLine: s.startLine,
      endLine: s.endLine,
      color: colors[s.filePath],
    }));
  }, [steps]);

  if (!steps || steps.length <= 1) return null;

  const fileCount = new Set(steps.map((s) => s.filePath)).size;

  return (
    <section
      aria-label="Route through the cited code"
      className="mt-3 border-t-[3px] border-ink pt-2.5"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h4 className="text-sm font-bold text-ink">
          Route
          <span className="ml-2 font-normal text-sub tabular-nums">
            stop {activeStep + 1} of {steps.length}
            {fileCount > 1 ? `, ${fileCount} files` : ""}
          </span>
        </h4>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setIsPlaying(!isPlaying)}
            aria-pressed={isPlaying}
            className="btn btn-sm"
          >
            {isPlaying ? (
              <Pause className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Play className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            <span>{isPlaying ? "Pause" : "Walk through"}</span>
          </button>
          <button
            type="button"
            disabled={activeStep === 0}
            onClick={() => handleSelectStep(activeStep - 1)}
            aria-label="Previous stop"
            title="Previous stop"
            className="btn-icon"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            disabled={activeStep === steps.length - 1}
            onClick={() => handleSelectStep(activeStep + 1)}
            aria-label="Next stop"
            title="Next stop"
            className="btn-icon"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <Route stops={stops} activeIndex={activeStep} onSelect={handleSelectStep} />
    </section>
  );
};
