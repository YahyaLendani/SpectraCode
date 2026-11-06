"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { Player, PlayerRef } from "@remotion/player";
import {
  PipelineAnimation,
  PIPELINE_DURATION_FRAMES,
  PIPELINE_FPS,
} from "./PipelineAnimation";
import {
  Play,
  Pause,
  RotateCcw,
  Cpu,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

const STAGE_CONFIGS = [
  { index: 0, label: "1. AST Parsing", startFrame: 0, color: "#60a5fa", glow: "rgba(59,130,246,0.3)" },
  { index: 1, label: "2. Dual Index", startFrame: 60, color: "#34d399", glow: "rgba(16,185,129,0.3)" },
  { index: 2, label: "3. Hybrid RRF", startFrame: 120, color: "#38bdf8", glow: "rgba(6,182,212,0.3)" },
  { index: 3, label: "4. Citation Gate", startFrame: 180, color: "#a78bfa", glow: "rgba(167,139,250,0.3)" },
];

export const RemotionPipelinePlayer: React.FC = () => {
  const playerRef = useRef<PlayerRef>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMounted, setIsMounted] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [activeStage, setActiveStage] = useState(0);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Sync active frame and stage with animation player
  useEffect(() => {
    if (!playerRef.current) return;
    const interval = setInterval(() => {
      if (playerRef.current) {
        const frame = playerRef.current.getCurrentFrame() || 0;
        setCurrentFrame(frame);
        const stage = Math.min(3, Math.floor(frame / 60));
        setActiveStage(stage);
      }
    }, 100);

    return () => clearInterval(interval);
  }, []);

  const handleTogglePlay = useCallback(() => {
    if (!playerRef.current) return;
    if (isPlaying) {
      playerRef.current.pause();
      setIsPlaying(false);
    } else {
      playerRef.current.play();
      setIsPlaying(true);
    }
  }, [isPlaying]);

  const handleRestart = () => {
    if (!playerRef.current) return;
    playerRef.current.seekTo(0);
    playerRef.current.play();
    setIsPlaying(true);
    setCurrentFrame(0);
    setActiveStage(0);
  };

  const handleSeek = (frame: number) => {
    if (!playerRef.current) return;
    const target = Math.max(0, Math.min(PIPELINE_DURATION_FRAMES - 1, frame));
    playerRef.current.seekTo(target);
    setCurrentFrame(target);
    setActiveStage(Math.min(3, Math.floor(target / 60)));
  };

  const handleJumpToStage = (stageIdx: number) => {
    handleSeek(stageIdx * 60);
  };

  const handlePrevStage = () => {
    const prev = Math.max(0, activeStage - 1);
    handleJumpToStage(prev);
  };

  const handleNextStage = () => {
    const next = Math.min(3, activeStage + 1);
    handleJumpToStage(next);
  };

  const handleSetSpeed = (speed: number) => {
    setPlaybackSpeed(speed);
  };

  const currentStageInfo = STAGE_CONFIGS[activeStage] || STAGE_CONFIGS[0];
  const currentTimeSec = (currentFrame / PIPELINE_FPS).toFixed(1);
  const totalTimeSec = (PIPELINE_DURATION_FRAMES / PIPELINE_FPS).toFixed(1);

  if (!isMounted) {
    return (
      <div className="w-full h-80 rounded-2xl border border-white/[0.08] bg-[#070a12] flex items-center justify-center">
        <div className="flex items-center gap-2 text-xs font-mono text-slate-500">
          <div className="h-3 w-3 rounded-full border border-blue-500 border-t-transparent animate-spin" />
          <span>Initializing 60fps Remotion Engine...</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative overflow-hidden rounded-2xl border bg-[#070a12] shadow-2xl transition-all duration-300"
      style={{
        borderColor: currentStageInfo.color,
        boxShadow: `0 0 35px ${currentStageInfo.glow}`,
      }}
    >
      {/* Top Banner Control Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-white/[0.08] bg-slate-950/85 px-4 py-3 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg border transition-colors"
            style={{
              backgroundColor: `${currentStageInfo.color}15`,
              borderColor: `${currentStageInfo.color}40`,
              color: currentStageInfo.color,
            }}
          >
            <Cpu className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                Remotion Pipeline Engine
              </span>
              <span
                className="rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold transition-colors"
                style={{
                  backgroundColor: `${currentStageInfo.color}15`,
                  borderColor: `${currentStageInfo.color}35`,
                  color: currentStageInfo.color,
                }}
              >
                60 FPS • {currentStageInfo.label}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Interactive frame-accurate visualization of AST chunking, dual embeddings, and RRF
            </p>
          </div>
        </div>

        {/* Playback Controls & Speed Toggle */}
        <div className="flex items-center gap-2 mt-2 sm:mt-0">
          {/* Speed Selector */}
          <div className="flex items-center rounded-lg border border-white/[0.08] bg-white/[0.03] p-0.5 text-[11px] font-mono">
            {[0.5, 1, 1.5, 2].map((s) => (
              <button
                key={s}
                onClick={() => handleSetSpeed(s)}
                className={`rounded px-1.5 py-0.5 transition-colors ${
                  playbackSpeed === s
                    ? "bg-blue-600 font-bold text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {s}x
              </button>
            ))}
          </div>

          <div className="h-4 w-px bg-white/10 mx-1" />

          {/* Prev/Next Stage */}
          <button
            onClick={handlePrevStage}
            disabled={activeStage === 0}
            title="Previous Stage"
            className="rounded-lg border border-white/10 bg-white/[0.04] p-1.5 text-slate-300 hover:border-white/20 hover:text-white disabled:opacity-30 transition-colors"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>

          {/* Play/Pause */}
          <button
            onClick={handleTogglePlay}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 px-3.5 py-1.5 text-xs font-semibold text-white shadow-md shadow-blue-600/30 transition-all hover:scale-105"
          >
            {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            <span>{isPlaying ? "Pause" : "Play"}</span>
          </button>

          <button
            onClick={handleNextStage}
            disabled={activeStage === 3}
            title="Next Stage"
            className="rounded-lg border border-white/10 bg-white/[0.04] p-1.5 text-slate-300 hover:border-white/20 hover:text-white disabled:opacity-30 transition-colors"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>

          {/* Restart */}
          <button
            onClick={handleRestart}
            title="Restart to frame 0"
            className="rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] p-1.5 text-slate-300 transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Remotion Player Canvas */}
      <div className="relative w-full aspect-[16/7] min-h-[340px] max-h-[460px]">
        <Player
          ref={playerRef}
          component={PipelineAnimation}
          durationInFrames={PIPELINE_DURATION_FRAMES}
          compositionWidth={1040}
          compositionHeight={440}
          fps={PIPELINE_FPS}
          style={{
            width: "100%",
            height: "100%",
          }}
          controls={false}
          autoPlay
          loop
          playbackRate={playbackSpeed}
        />
      </div>

      {/* Bottom Interactive Scrubber Bar & Telemetry */}
      <div className="border-t border-white/[0.08] bg-slate-950/90 px-4 py-2.5 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] font-semibold text-slate-300 tabular-nums">
            {currentTimeSec}s / {totalTimeSec}s
          </span>

          {/* Interactive Scrub Slider */}
          <div className="relative flex-1 flex items-center">
            <input
              type="range"
              min={0}
              max={PIPELINE_DURATION_FRAMES - 1}
              value={currentFrame}
              onChange={(e) => handleSeek(Number(e.target.value))}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500 hover:bg-slate-700 transition-colors"
            />
          </div>

          <span
            className="font-mono text-[11px] font-bold px-2 py-0.5 rounded border tabular-nums"
            style={{
              backgroundColor: `${currentStageInfo.color}15`,
              borderColor: `${currentStageInfo.color}35`,
              color: currentStageInfo.color,
            }}
          >
            FRAME {String(currentFrame).padStart(3, "0")} / 240
          </span>
        </div>

        {/* 4 Interactive Stage Quick-Select Buttons */}
        <div className="mt-2.5 grid grid-cols-4 gap-2">
          {STAGE_CONFIGS.map((stage) => {
            const isSelected = activeStage === stage.index;
            return (
              <button
                key={stage.index}
                onClick={() => handleJumpToStage(stage.index)}
                className={`flex items-center justify-between rounded-lg px-2.5 py-1 text-left font-mono text-[11px] transition-all ${
                  isSelected
                    ? "border font-bold text-white shadow-sm"
                    : "border border-white/[0.06] bg-white/[0.02] text-slate-400 hover:border-white/15 hover:text-slate-200"
                }`}
                style={{
                  borderColor: isSelected ? stage.color : undefined,
                  backgroundColor: isSelected ? `${stage.color}18` : undefined,
                }}
              >
                <span>{stage.label}</span>
                {isSelected && (
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: stage.color, boxShadow: `0 0 6px ${stage.color}` }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
