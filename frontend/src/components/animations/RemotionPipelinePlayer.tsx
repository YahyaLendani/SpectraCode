"use client";

import React, { useRef, useState, useEffect } from "react";
import { Player, PlayerRef } from "@remotion/player";
import {
  PipelineAnimation,
  PIPELINE_DURATION_FRAMES,
  PIPELINE_FPS,
} from "./PipelineAnimation";
import { Play, Pause, RotateCcw, Sparkles, Layers, Cpu, Compass } from "lucide-react";

export const RemotionPipelinePlayer: React.FC = () => {
  const playerRef = useRef<PlayerRef>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMounted, setIsMounted] = useState(false);
  const [activeStage, setActiveStage] = useState(0);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const handleTogglePlay = () => {
    if (!playerRef.current) return;
    if (isPlaying) {
      playerRef.current.pause();
      setIsPlaying(false);
    } else {
      playerRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleRestart = () => {
    if (!playerRef.current) return;
    playerRef.current.seekTo(0);
    playerRef.current.play();
    setIsPlaying(true);
    setActiveStage(0);
  };

  const handleJumpToStage = (stageIdx: number) => {
    if (!playerRef.current) return;
    const targetFrame = stageIdx * 60;
    playerRef.current.seekTo(targetFrame);
    setActiveStage(stageIdx);
  };

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
    <div className="relative overflow-hidden rounded-2xl border border-blue-500/30 bg-[#070a12] shadow-2xl shadow-blue-950/40">
      {/* Top Banner Control Header */}
      <div className="flex flex-wrap items-center justify-between border-b border-white/[0.08] bg-slate-950/80 px-4 py-3 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30">
            <Cpu className="h-3.5 w-3.5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-200">
                Remotion Pipeline Engine
              </span>
              <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-400">
                60 FPS PLAYBACK
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Interactive frame-accurate visualization of AST chunking, dual embeddings, and RRF
            </p>
          </div>
        </div>

        {/* Playback Controls & Stage Jumps */}
        <div className="flex items-center gap-2 mt-2 sm:mt-0">
          <button
            onClick={() => handleJumpToStage(0)}
            className="rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-mono font-medium text-slate-300 hover:border-blue-500/50 hover:text-white transition-colors"
          >
            AST
          </button>
          <button
            onClick={() => handleJumpToStage(1)}
            className="rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-mono font-medium text-slate-300 hover:border-emerald-500/50 hover:text-white transition-colors"
          >
            Index
          </button>
          <button
            onClick={() => handleJumpToStage(2)}
            className="rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-mono font-medium text-slate-300 hover:border-cyan-500/50 hover:text-white transition-colors"
          >
            RRF
          </button>
          <button
            onClick={() => handleJumpToStage(3)}
            className="rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-mono font-medium text-slate-300 hover:border-purple-500/50 hover:text-white transition-colors"
          >
            Gate
          </button>

          <div className="h-4 w-px bg-white/10 mx-1" />

          <button
            onClick={handleTogglePlay}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 px-3 py-1 text-xs font-semibold text-white shadow-md shadow-blue-600/30 transition-colors"
          >
            {isPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
            <span>{isPlaying ? "Pause" : "Play"}</span>
          </button>

          <button
            onClick={handleRestart}
            title="Restart playback"
            className="rounded-lg border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] p-1.5 text-slate-300 transition-colors"
          >
            <RotateCcw className="h-3 w-3" />
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
        />
      </div>
    </div>
  );
};

