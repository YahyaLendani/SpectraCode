"use client";

import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

export const PIPELINE_FPS = 30;
export const PIPELINE_DURATION_FRAMES = 240;

interface StageInfo {
  number: number;
  title: string;
  subtitle: string;
  color: string;
  borderColor: string;
  bgGlow: string;
}

const STAGES: StageInfo[] = [
  {
    number: 1,
    title: "Tree-Sitter AST Parsing",
    subtitle: "Syntax-aware chunking preserving functions, classes & decorators",
    color: "#60a5fa",
    borderColor: "rgba(96, 165, 250, 0.4)",
    bgGlow: "rgba(37, 99, 235, 0.15)",
  },
  {
    number: 2,
    title: "Dual-Track Vector & Lexical Index",
    subtitle: "384-d BGE dense embeddings + BM25 keyword inverted index",
    color: "#34d399",
    borderColor: "rgba(52, 211, 153, 0.4)",
    bgGlow: "rgba(16, 185, 129, 0.15)",
  },
  {
    number: 3,
    title: "Hybrid Reciprocal Rank Fusion",
    subtitle: "Dynamic rank score fusion: RRF(d) = Σ 1 / (60 + r(d))",
    color: "#38bdf8",
    borderColor: "rgba(56, 189, 248, 0.4)",
    bgGlow: "rgba(6, 182, 212, 0.15)",
  },
  {
    number: 4,
    title: "Deterministic Citation Gate",
    subtitle: "Exact AST line verification with line-grounded [file:start-end]",
    color: "#a78bfa",
    borderColor: "rgba(167, 139, 250, 0.4)",
    bgGlow: "rgba(139, 92, 246, 0.15)",
  },
];

export const PipelineAnimation: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Determine active stage: 4 stages across 240 frames (60 frames each)
  const stageIndex = Math.min(3, Math.floor(frame / 60));
  const stageFrame = frame % 60;
  const currentStage = STAGES[stageIndex];

  // Stage entrance spring
  const stageSpring = spring({
    frame: stageFrame,
    fps,
    config: { damping: 14, stiffness: 120 },
  });

  // Overall timeline progress (0 to 1)
  const totalProgress = frame / (PIPELINE_DURATION_FRAMES - 1);

  // Stage 1: AST Node reveal progress
  const astNodeProgress = interpolate(stageFrame, [5, 45], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Stage 2: Dual-track particle flow
  const particleOffset = (frame * 3) % 100;

  // Stage 3: Fusion rank bars
  const rankFusionProgress = interpolate(stageFrame, [10, 50], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Stage 4: Radar scanner angle
  const radarAngle = (stageFrame * 6) % 360;
  const verificationPulse = spring({
    frame: Math.max(0, stageFrame - 20),
    fps,
    config: { damping: 10, stiffness: 160 },
  });

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        backgroundColor: "#070a12",
        color: "#f8fafc",
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        padding: "24px 32px",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        position: "relative",
        overflow: "hidden",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        borderRadius: "16px",
      }}
    >
      {/* Background Animated Gradient Spotlight */}
      <div
        style={{
          position: "absolute",
          top: "-50px",
          left: `${(stageIndex * 25) + 10}%`,
          width: "380px",
          height: "240px",
          borderRadius: "50%",
          backgroundColor: currentStage.bgGlow,
          filter: "blur(60px)",
          transition: "left 0.4s ease, background-color 0.4s ease",
          pointerEvents: "none",
        }}
      />

      {/* Top Header & Stage Stepper */}
      <div style={{ position: "relative", zIndex: 10 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "14px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "6px",
                backgroundColor: "rgba(59, 130, 246, 0.2)",
                border: "1px solid rgba(59, 130, 246, 0.4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#60a5fa",
                fontWeight: 700,
                fontSize: "13px",
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              ▶
            </div>
            <div>
              <span
                style={{
                  fontSize: "13px",
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: "#e2e8f0",
                }}
              >
                RepoLens Live Engine Pipeline
              </span>
              <span
                style={{
                  marginLeft: "8px",
                  fontSize: "11px",
                  color: "#64748b",
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                60fps Frame-Accurate Visualization
              </span>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: "11px",
              color: "#94a3b8",
            }}
          >
            <span
              style={{
                padding: "2px 8px",
                borderRadius: "4px",
                backgroundColor: "rgba(16, 185, 129, 0.15)",
                border: "1px solid rgba(16, 185, 129, 0.3)",
                color: "#34d399",
                fontWeight: 600,
              }}
            >
              FRAME {String(frame).padStart(3, "0")} / 240
            </span>
            <span
              style={{
                padding: "2px 8px",
                borderRadius: "4px",
                backgroundColor: "rgba(255, 255, 255, 0.05)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
              }}
            >
              STAGE {stageIndex + 1} OF 4
            </span>
          </div>
        </div>

        {/* 4-Step Interactive Progress Stepper Bar */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: "8px",
          }}
        >
          {STAGES.map((s, idx) => {
            const isActive = idx === stageIndex;
            const isCompleted = idx < stageIndex;

            return (
              <div
                key={s.number}
                style={{
                  padding: "8px 12px",
                  borderRadius: "8px",
                  backgroundColor: isActive
                    ? "rgba(17, 24, 39, 0.85)"
                    : "rgba(15, 22, 35, 0.45)",
                  border: isActive
                    ? `1px solid ${s.borderColor}`
                    : "1px solid rgba(255, 255, 255, 0.06)",
                  boxShadow: isActive
                    ? `0 0 16px ${s.bgGlow}`
                    : "none",
                  transition: "all 0.2s ease",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: "4px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "10px",
                      fontFamily: "'JetBrains Mono', monospace",
                      fontWeight: 700,
                      color: isActive
                        ? s.color
                        : isCompleted
                        ? "#10b981"
                        : "#64748b",
                    }}
                  >
                    {isCompleted ? "✓ DONE" : `0${s.number}`}
                  </span>
                  {isActive && (
                    <span
                      style={{
                        width: "6px",
                        height: "6px",
                        borderRadius: "50%",
                        backgroundColor: s.color,
                        boxShadow: `0 0 8px ${s.color}`,
                      }}
                    />
                  )}
                </div>
                <div
                  style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    color: isActive ? "#f8fafc" : "#94a3b8",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {s.title}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Animated Visual Canvas */}
      <div
        style={{
          position: "relative",
          zIndex: 10,
          flex: 1,
          margin: "16px 0",
          backgroundColor: "rgba(10, 15, 26, 0.7)",
          border: `1px solid ${currentStage.borderColor}`,
          borderRadius: "12px",
          padding: "20px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          boxShadow: `inset 0 0 30px ${currentStage.bgGlow}`,
          overflow: "hidden",
        }}
      >
        {/* Stage 1: Tree-Sitter AST Decomposition */}
        {stageIndex === 0 && (
          <div
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-around",
              opacity: stageSpring,
              transform: `scale(${0.95 + 0.05 * stageSpring})`,
            }}
          >
            {/* Raw Source File Input */}
            <div
              style={{
                width: "210px",
                padding: "12px 14px",
                backgroundColor: "rgba(15, 23, 42, 0.8)",
                border: "1px solid rgba(59, 130, 246, 0.3)",
                borderRadius: "8px",
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: "11px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  color: "#93c5fd",
                  marginBottom: "8px",
                  fontSize: "10px",
                  fontWeight: 700,
                  borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
                  paddingBottom: "4px",
                }}
              >
                <span>source.py</span>
                <span style={{ color: "#60a5fa" }}>AST IN</span>
              </div>
              <div style={{ color: "#94a3b8", lineHeight: 1.6 }}>
                <div>
                  <span style={{ color: "#f472b6" }}>@router</span>.get(
                  <span style={{ color: "#34d399" }}>&quot;/auth&quot;</span>)
                </div>
                <div>
                  <span style={{ color: "#60a5fa" }}>async def</span> verify(req):
                </div>
                <div style={{ paddingLeft: "12px" }}>
                  token = req.headers[<span style={{ color: "#34d399" }}>&quot;auth&quot;</span>]
                </div>
                <div style={{ paddingLeft: "12px" }}>
                  <span style={{ color: "#f59e0b" }}>return</span> decode(token)
                </div>
              </div>
            </div>

            {/* Tree-Sitter AST Transformer */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <div
                style={{
                  padding: "6px 12px",
                  borderRadius: "20px",
                  backgroundColor: "rgba(37, 99, 235, 0.2)",
                  border: "1px solid rgba(59, 130, 246, 0.4)",
                  color: "#93c5fd",
                  fontSize: "11px",
                  fontFamily: "'JetBrains Mono', monospace",
                  fontWeight: 600,
                }}
              >
                Tree-sitter Parser
              </div>
              <div style={{ color: "#60a5fa", fontSize: "18px" }}>➔</div>
            </div>

            {/* Structured AST Symbols Output */}
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <div
                style={{
                  padding: "8px 14px",
                  backgroundColor: "rgba(59, 130, 246, 0.12)",
                  border: "1px solid rgba(59, 130, 246, 0.35)",
                  borderRadius: "6px",
                  fontSize: "11px",
                  fontFamily: "'JetBrains Mono', monospace",
                  transform: `translateX(${(1 - astNodeProgress) * 30}px)`,
                  opacity: astNodeProgress,
                }}
              >
                <span
                  style={{
                    backgroundColor: "rgba(59, 130, 246, 0.3)",
                    padding: "2px 6px",
                    borderRadius: "4px",
                    color: "#93c5fd",
                    marginRight: "8px",
                    fontWeight: 700,
                  }}
                >
                  FUNCTION
                </span>
                <span style={{ color: "#f8fafc" }}>verify(req)</span>
                <span style={{ color: "#64748b", marginLeft: "10px" }}>L2–L8</span>
              </div>

              <div
                style={{
                  padding: "8px 14px",
                  backgroundColor: "rgba(16, 185, 129, 0.12)",
                  border: "1px solid rgba(16, 185, 129, 0.35)",
                  borderRadius: "6px",
                  fontSize: "11px",
                  fontFamily: "'JetBrains Mono', monospace",
                  transform: `translateX(${(1 - astNodeProgress) * 45}px)`,
                  opacity: Math.max(0, astNodeProgress - 0.2),
                }}
              >
                <span
                  style={{
                    backgroundColor: "rgba(16, 185, 129, 0.3)",
                    padding: "2px 6px",
                    borderRadius: "4px",
                    color: "#6ee7b7",
                    marginRight: "8px",
                    fontWeight: 700,
                  }}
                >
                  DECORATOR
                </span>
                <span style={{ color: "#f8fafc" }}>@router.get</span>
                <span style={{ color: "#64748b", marginLeft: "10px" }}>L1–L1</span>
              </div>
            </div>
          </div>
        )}

        {/* Stage 2: Dual-Track Indexing */}
        {stageIndex === 1 && (
          <div
            style={{
              width: "100%",
              display: "grid",
              gridTemplateColumns: "1fr auto 1fr",
              gap: "24px",
              alignItems: "center",
              opacity: stageSpring,
            }}
          >
            {/* Dense Vector Track */}
            <div
              style={{
                padding: "14px 16px",
                backgroundColor: "rgba(16, 185, 129, 0.08)",
                border: "1px solid rgba(16, 185, 129, 0.3)",
                borderRadius: "8px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "8px",
                }}
              >
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    color: "#34d399",
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  TRACK A: DENSE EMBEDDING
                </span>
                <span
                  style={{
                    fontSize: "10px",
                    backgroundColor: "rgba(16, 185, 129, 0.2)",
                    color: "#6ee7b7",
                    padding: "1px 6px",
                    borderRadius: "4px",
                  }}
                >
                  ONNX 384-d
                </span>
              </div>
              <div
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: "10px",
                  color: "#94a3b8",
                  lineHeight: 1.5,
                }}
              >
                <div>Model: BAAI/bge-small-en-v1.5</div>
                <div style={{ color: "#cbd5e1" }}>
                  Vector: [0.0482, -0.1923, 0.8124, ... +381]
                </div>
                <div style={{ color: "#34d399", marginTop: "4px" }}>
                  Cosine Cos-Sim Space (Normalized L2)
                </div>
              </div>
            </div>

            {/* Splitter Indicator */}
            <div
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: "12px",
                color: "#64748b",
                textAlign: "center",
              }}
            >
              DUAL
              <br />
              INDEX
            </div>

            {/* Lexical BM25 Track */}
            <div
              style={{
                padding: "14px 16px",
                backgroundColor: "rgba(59, 130, 246, 0.08)",
                border: "1px solid rgba(59, 130, 246, 0.3)",
                borderRadius: "8px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: "8px",
                }}
              >
                <span
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    color: "#60a5fa",
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  TRACK B: LEXICAL INVERTED
                </span>
                <span
                  style={{
                    fontSize: "10px",
                    backgroundColor: "rgba(59, 130, 246, 0.2)",
                    color: "#93c5fd",
                    padding: "1px 6px",
                    borderRadius: "4px",
                  }}
                >
                  BM25
                </span>
              </div>
              <div
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: "10px",
                  color: "#94a3b8",
                  lineHeight: 1.5,
                }}
              >
                <div>Tokens: verify, req, auth, decode</div>
                <div style={{ color: "#cbd5e1" }}>IDF Weights: [2.84, 1.12, 3.42, 2.19]</div>
                <div style={{ color: "#60a5fa", marginTop: "4px" }}>
                  Sub-token camelCase &amp; snake_case splits
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Stage 3: Hybrid Reciprocal Rank Fusion (RRF) */}
        {stageIndex === 2 && (
          <div
            style={{
              width: "100%",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
              opacity: stageSpring,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
                paddingBottom: "6px",
              }}
            >
              <div
                style={{
                  fontSize: "12px",
                  fontWeight: 700,
                  color: "#38bdf8",
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                RRF FUSION ENGINE • k = 60
              </div>
              <div
                style={{
                  fontSize: "11px",
                  color: "#94a3b8",
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                Score(d) = Σ [ 1 / (60 + rank_m(d)) ]
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              {/* Dense Rank Candidates */}
              <div
                style={{
                  backgroundColor: "rgba(15, 23, 42, 0.6)",
                  padding: "8px 12px",
                  borderRadius: "6px",
                  border: "1px solid rgba(255, 255, 255, 0.06)",
                }}
              >
                <div
                  style={{
                    fontSize: "10px",
                    fontWeight: 700,
                    color: "#34d399",
                    marginBottom: "4px",
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  Dense Vector Candidates
                </div>
                <div
                  style={{
                    fontSize: "10px",
                    fontFamily: "'JetBrains Mono', monospace",
                    color: "#cbd5e1",
                  }}
                >
                  #1 app/auth.py:L1-L24 (cos: 0.892)
                </div>
                <div
                  style={{
                    fontSize: "10px",
                    fontFamily: "'JetBrains Mono', monospace",
                    color: "#64748b",
                  }}
                >
                  #2 app/router.py:L40-L65 (cos: 0.831)
                </div>
              </div>

              {/* Lexical Rank Candidates */}
              <div
                style={{
                  backgroundColor: "rgba(15, 23, 42, 0.6)",
                  padding: "8px 12px",
                  borderRadius: "6px",
                  border: "1px solid rgba(255, 255, 255, 0.06)",
                }}
              >
                <div
                  style={{
                    fontSize: "10px",
                    fontWeight: 700,
                    color: "#60a5fa",
                    marginBottom: "4px",
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  Lexical BM25 Candidates
                </div>
                <div
                  style={{
                    fontSize: "10px",
                    fontFamily: "'JetBrains Mono', monospace",
                    color: "#cbd5e1",
                  }}
                >
                  #1 app/auth.py:L1-L24 (bm25: 14.8)
                </div>
                <div
                  style={{
                    fontSize: "10px",
                    fontFamily: "'JetBrains Mono', monospace",
                    color: "#64748b",
                  }}
                >
                  #2 app/security.py:L10-L32 (bm25: 11.2)
                </div>
              </div>
            </div>

            {/* Winner Fused Node */}
            <div
              style={{
                backgroundColor: "rgba(56, 189, 248, 0.12)",
                border: "1px solid rgba(56, 189, 248, 0.4)",
                padding: "8px 14px",
                borderRadius: "6px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: "11px",
                transform: `scale(${0.96 + 0.04 * rankFusionProgress})`,
              }}
            >
              <span style={{ color: "#38bdf8", fontWeight: 700 }}>
                ★ TOP 1 FUSED WINNER: app/auth.py (L1–L24)
              </span>
              <span
                style={{
                  backgroundColor: "rgba(56, 189, 248, 0.25)",
                  color: "#e0f2fe",
                  padding: "2px 8px",
                  borderRadius: "4px",
                  fontWeight: 700,
                }}
              >
                RRF: 0.0328
              </span>
            </div>
          </div>
        )}

        {/* Stage 4: Deterministic Citation Gate */}
        {stageIndex === 3 && (
          <div
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-around",
              opacity: stageSpring,
            }}
          >
            {/* Gate Radar Scanner */}
            <div
              style={{
                position: "relative",
                width: "90px",
                height: "90px",
                borderRadius: "50%",
                border: "2px dashed rgba(167, 139, 250, 0.4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "rgba(139, 92, 246, 0.08)",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  width: "100%",
                  height: "2px",
                  backgroundColor: "#a78bfa",
                  transform: `rotate(${radarAngle}deg)`,
                  boxShadow: "0 0 10px #a78bfa",
                }}
              />
              <span
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: "10px",
                  fontWeight: 700,
                  color: "#c4b5fd",
                }}
              >
                AST SCAN
              </span>
            </div>

            {/* Gate Evaluation Check */}
            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  fontSize: "12px",
                  fontWeight: 700,
                  color: "#a78bfa",
                  fontFamily: "'JetBrains Mono', monospace",
                  marginBottom: "4px",
                }}
              >
                LINE BOUNDARY VERIFICATION
              </div>
              <div style={{ fontSize: "11px", color: "#94a3b8" }}>
                Target Span [14, 38] matches AST Symbol &apos;decode_token&apos;
              </div>
              <div
                style={{
                  marginTop: "6px",
                  color: "#34d399",
                  fontWeight: 600,
                  fontSize: "10px",
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                STATUS: GROUNDED &amp; COMPLIANT
              </div>
            </div>

            {/* Emitted Verified Citation Badge */}
            <div
              style={{
                padding: "12px 18px",
                backgroundColor: "rgba(16, 185, 129, 0.15)",
                border: "1px solid rgba(16, 185, 129, 0.5)",
                borderRadius: "8px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "6px",
                transform: `scale(${0.9 + 0.1 * verificationPulse})`,
                boxShadow: "0 0 20px rgba(16, 185, 129, 0.25)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  color: "#34d399",
                  fontSize: "13px",
                  fontWeight: 700,
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                <span>✓</span>
                <span>[app/auth.py:14-38]</span>
              </div>
              <span
                style={{
                  fontSize: "9px",
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  color: "#a7f3d0",
                }}
              >
                Verified Line Citation
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Timeline Indicator */}
      <div
        style={{
          position: "relative",
          zIndex: 10,
          display: "flex",
          alignItems: "center",
          gap: "12px",
        }}
      >
        <div
          style={{
            flex: 1,
            height: "4px",
            backgroundColor: "rgba(255, 255, 255, 0.08)",
            borderRadius: "2px",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${totalProgress * 100}%`,
              height: "100%",
              backgroundColor: currentStage.color,
              boxShadow: `0 0 8px ${currentStage.color}`,
              transition: "background-color 0.3s ease",
            }}
          />
        </div>
        <span
          style={{
            fontSize: "10px",
            color: "#64748b",
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          {Math.round(totalProgress * 100)}% COMPLETE
        </span>
      </div>
    </div>
  );
};

