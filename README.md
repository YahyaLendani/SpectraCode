# 🧠 SpectraCode: AI-Powered Codebase Intelligence Platform

> **Category:** Generative AI · LLM Engineering · Code RAG · Developer Tools  
> **Status:** Working prototype, live at spectracode.tech. Retrieval is benchmarked; answer quality is not yet measured.  
> **Website:** [spectracode.tech](https://spectracode.tech)  
> **Stack:** Next.js 15 (App Router), TypeScript, Tailwind CSS, FastAPI, PostgreSQL (`pgvector`) / SQLite, Tree-sitter, FastEmbed (ONNX), Pytest

[![FastAPI](https://img.shields.io/badge/FastAPI-0.136.3-009688.svg?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Next.js](https://img.shields.io/badge/Next.js-15.5.29-000000.svg?logo=next.js&logoColor=white)](https://nextjs.org)
[![Tree-sitter](https://img.shields.io/badge/Tree--sitter-AST%20Call--Graph-2b5b84.svg)](https://tree-sitter.github.io/tree-sitter/)
[![Vector Search](https://img.shields.io/badge/RAG-Hybrid%20RRF%20%2B%201--Hop%20AST-indigo.svg)](#2--hybrid-rrf-retrieval--1-hop-ast-call-graph-expansion)
[![Tests](https://img.shields.io/badge/Pytest-62%20Passed-brightgreen.svg)](#-automated-testing--benchmark-results)

---

## 📌 Executive Summary

**SpectraCode** is an intelligent developer platform that analyzes source-code repositories and empowers engineers to rapidly understand unfamiliar codebases. Users can import public GitHub repositories with live Server-Sent Events (SSE) indexing telemetry, search source code via hybrid semantic and lexical retrieval, explore syntax trees and module dependency graphs, and chat with an AI assistant that answers technical questions with **clickable file and line number citations, each checked against the retrieved code** (`[filepath:line_start-line_end]`) and an **interactive multi-file execution trace stepper**.

To avoid invented file references, single-file context and wrong line ranges, SpectraCode combines **Tree-sitter Concrete Syntax Tree (CST) chunking**, **Reciprocal Rank Fusion (RRF)**, **1-Hop AST Call-Graph Context Expansion**, and a **two-stage citation check**: it declines to answer when retrieval finds nothing relevant, and it removes any citation that points outside the retrieved code. The check confirms where a citation points, not that the answer's claims are correct.

---

## 📸 Visual Walkthrough: How SpectraCode Works

### 1. Developer Workspace with Grounded Citations & Multi-Hop Route Stepper
The core workspace features a synchronized three-pane layout: the **AST File Explorer** with symbol counts on the left, the **Code Viewer** highlighting cited line spans (`lines 6-8 in JWTAuthenticationError`) in the center, and the **Grounded AI Assistant** on the right. When an answer spans multiple files or execution hops, the **Route Stepper** renders an interactive transit map (`1 → 2`) with an auto-walkthrough mode that steps through cited files and highlights matching code spans automatically.

![SpectraCode Workspace](docs/images/workspace_code_view.png)

---

### 2. Clean Swiss Transit Dashboard & 4-Stage Indexing Line Map
The home dashboard provides an at-a-glance view of all imported workspaces, indexed file counts, total code spans, and live 4-stage ingestion status (`Clone` $\rightarrow$ `Parse` $\rightarrow$ `Embed` $\rightarrow$ `Ready`). Users can import any public GitHub repository or load the bundled sample with a single click.

![SpectraCode Dashboard](docs/images/dashboard.png)

---

### 3. Interactive Module Dependency Graph & Coupling Analysis
Switch to the **Dependency Graph** tab to explore repository architecture, inter-module imports, third-party library dependencies, coupling degrees, and circular import detection rendered as a clear transit station network.

![SpectraCode Dependency Graph](docs/images/dependency_graph.png)

---

### 4. Hybrid Search Modal (`Ctrl+K`)
Instant keyboard-driven code discovery powered by reciprocal rank fusion (dense vector cosine similarity + sparse identifier token matching).

![SpectraCode Search Modal](docs/images/search_modal.png)

---

### 5. Quantitative Benchmarking & Tailored AST Suites
SpectraCode includes an automated evaluation harness measuring retrieval recall, MRR, citation precision, and faithfulness against published engineering targets. For custom repositories, the **Dynamic AST Suite Generator** synthesizes targeted ground-truth queries directly from indexed classes and functions, accompanied by out-of-scope negative control checks.

![SpectraCode Benchmarks Dashboard](docs/images/evaluation_benchmarks.png)

---

### 6. Safe Workspace Deletion
Workspaces can be safely removed with immediate optimistic UI updates, background polling safety gates, and transit-themed confirmation dialogs.

![SpectraCode Delete Workspace Modal](docs/images/delete_modal.png)

---

## 🚀 Key Features

### 1. 🌲 AST-Aware Tree-sitter Chunking
- Parses Python, TypeScript, TSX, and JavaScript into Concrete Syntax Trees (CST).
- Chunks strictly along function, method, interface, and class boundaries rather than arbitrary character splits.
- Injects non-indexed structural metadata headers (`file_path`, `enclosing_scope`, `symbol_signature`, `imports`) so the retrieval model maintains full lexical and structural context.
- Guarantees 1-indexed, inclusive line number intervals matching GitHub and IDE conventions.

### 2. ⚡ Hybrid RRF Retrieval & 1-Hop AST Call-Graph Expansion
- **Dense Vector Search**: Generates 384-dimensional embeddings via local ONNX runtime (`BAAI/bge-small-en-v1.5`), with no external embedding API.
- **Sparse Code Lexical Search**: Okapi BM25 over code-aware tokens: file path, symbol name and code, with `camelCase`, `PascalCase`, and `snake_case` identifiers expanded (`verifyJWTToken` → `verify jwt token`).
- **Reciprocal Rank Fusion (RRF)**: Dynamically weights vector vs. keyword importance ($\alpha = 0.35$ for explicit code identifiers/paths, $\alpha = 0.55$ for conceptual architectural queries) followed by score calibration.
- **1-Hop AST Call-Graph Context Expansion**:
  - Automatically extracts referenced function calls and type identifiers from top-ranked primary chunks (`_extract_referenced_symbols`).
  - Resolves cross-file symbol definitions in two passes: fast in-memory lookup across scored chunks followed by a batched SQL join across `ASTSymbol` and `CodeChunk` (`_expand_one_hop_chunks`).
  - Attaches `is_linked_hop=True` and `linked_from_symbol` metadata and serializes definitions into `<linked_hop_chunk>` prompt blocks—providing cross-file architectural context to the LLM **without polluting primary retrieval rank metrics (`Recall@K`, `MRR`) or benchmark citation precision**.

### 3. 🧭 Interactive Multi-File Flow Stepper & Trace Timeline
- **Grounded Citation Engine**: Streaming LLM responses emit canonical citation tokens (`[filepath:line_start-line_end]`) that are verified against retrieved chunk boundaries (`EXACT_MATCH`, `CLAMPED_TO_BOUNDS`, `INVALID_LINE_RANGE`, or `HALLUCINATED_FILE` rejection). Rejected citations are removed from the answer. If none survive, the top retrieved chunk is attached as a reference, marked `FALLBACK_REFERENCE` so evaluation does not count it as a citation the model made.
- **Multi-Hop Flow Stepper (`ExecutionTraceStepper.tsx`)**: When an AI response cites multiple code spans across files or execution hops, an interactive visual trace timeline automatically renders beneath the answer:
  - **Step-by-Step Navigation**: Jump sequentially (`Previous` / `Next` or direct pill selection) across cited execution hops (`1 → 2 → 3`).
  - **Auto-Walkthrough Mode**: Toggle `Play` / `Pause` to automatically step through the multi-file execution trace on a 2.4-second cadence.
  - **Code Viewer Synchronization**: Clicking any citation badge or trace step immediately loads the target file in the code viewer, scrolls smoothly to the span, and highlights the exact line range.

### 4. 📡 Real-Time Indexing Progress via Server-Sent Events (SSE)
- **Live 4-Stage Telemetry (`IndexingProgressTracker`)**: Streams real-time repository ingestion progress over `GET /api/v1/repositories/{repo_id}/progress-stream`.
- **Animated Modal Tracker (`RepoImportModal.tsx`)**: Visualizes the 4-stage pipeline (`Git Clone` $\rightarrow$ `AST Parsing` $\rightarrow$ `ONNX Vectors` $\rightarrow$ `Ready`) with live completion percentages, active file path inspection, processed file counters, and generated AST chunk counts.

### 5. 📊 Quantitative Grounded Benchmarking & Synthetic Suite Generator
- **Offline retrieval benchmark** (`backend/scripts/eval_retrieval.py`): 255 hand-labelled questions, 155 of them real Stack Overflow titles and 53 real GitHub issue titles, against a real, pinned repository (`psf/requests` v2.32.3), comparing a BM25 baseline, dense-only, sparse-only and the production hybrid retriever with bootstrap confidence intervals. See [Retrieval benchmark](#retrieval-benchmark-real-repository) for results.
- **In-app `/evaluation` dashboard**: Recall@K, MRR, citation precision/recall/F1, citation grounding and abstention on the bundled sample repo (5 curated queries) or a symbol-lookup smoke test generated from any indexed repo. These are smoke tests, not quality measurements: the sample repo is generated by this project and the generated questions name the symbols they look for.

### 6. 🕸️ Interactive Dependency & Coupling Graph
- Static import analysis extracting file-to-file import relationships, third-party packages, fan-in (popularity), fan-out (coupling), and circular dependency detection, backed by a two-tier in-memory and persistent metadata cache.

---

## 🏛️ System Architecture

```text
+---------------------------------------------------------------------------------------+
|                                   NEXT.JS 15 FRONTEND                                 |
|  - Developer Workspace & code viewer   - Multi-Hop ExecutionTraceStepper       |
|  - Streaming SSE AI Chat with Citations       - Live 4-Stage SSE Import Progress      |
|  - Interactive Module Dependency Graph        - Quantitative Benchmark Dashboard      |
+-------------------------------------------+-------------------------------------------+
                                            | HTTP REST / Server-Sent Events (SSE)
                                            v
+---------------------------------------------------------------------------------------+
|                                FASTAPI BACKEND RUNTIME                                |
|                                                                                       |
|  +-----------------------+  +-----------------------+  +---------------------------+  |
|  | Git Importer & SSE    |  | Tree-sitter AST       |  | Hybrid RRF Retriever      |  |
|  | Progress Tracker      |  | Semantic Chunker      |  | + 1-Hop Call-Graph Expand |  |
|  +-----------+-----------+  +-----------+-----------+  +-------------+-------------+  |
|              |                          |                            |                |
|              v                          v                            v                |
|  +--------------------------------------------------+  +---------------------------+  |
|  |         PostgreSQL 16 (pgvector) / SQLite        |  | Grounded Citation Engine  |  |
|  | (Repos, Files, ASTSymbols, CodeChunks, Vectors)  |  | (Interval Clamp & Gate)   |  |
|  +--------------------------------------------------+  +---------------------------+  |
+---------------------------------------------------------------------------------------+
```

### End-to-End Retrieval & Grounded Generation Flow
1. **Query Normalization**: `CodeQueryNormalizer` splits `camelCase`, `PascalCase`, and `snake_case` tokens while `HybridCodeRetriever` computes dynamic $\alpha \in \{0.35, 0.55\}$.
2. **Parallel Hybrid Retrieval**: FastEmbed ONNX generates the query vector for batch cosine similarity alongside rapid token overlap + selective Levenshtein fuzzy matching, fused via Reciprocal Rank Fusion (RRF) and score calibration.
3. **1-Hop AST Call-Graph Expansion**: Referenced symbols in the top primary chunks are resolved against `ASTSymbol` definitions across the repository and appended with `is_linked_hop=True` (`<linked_hop_chunk>`).
4. **Pre-Generation Abstention Gate**: `GroundedCitationEngine.should_abstain_pre_generation` verifies both minimum chunk relevance score and stem-tolerant lexical query term coverage over primary chunks.
5. **Line-Numbered Grounded Generation & Verification**: The LLM streams explanations with `[filepath:start-end]` markers, which are verified/clamped against retrieved intervals and rendered into interactive citation badges and the `ExecutionTraceStepper`.

---

## 🛠️ Technology Stack

| Component | Technology | Rationale |
| :--- | :--- | :--- |
| **Frontend** | Next.js 15 (App Router), React 18, TypeScript | High-performance developer workspace, SSE streaming, and trace UI |
| **Code Viewer** | Custom React code viewer, Tailwind CSS | Syntax highlighting, cited-line highlights, and scrolling to the cited range |
| **Backend** | Python 3.11+, FastAPI, Uvicorn | Asynchronous, high-throughput REST and Server-Sent Events (SSE) API |
| **Source Parsing** | Tree-sitter (`python`, `typescript`, `javascript`) | C-compiled syntax tree analysis, symbol extraction, and 1-hop call-graph resolution |
| **Embeddings** | FastEmbed (`BAAI/bge-small-en-v1.5`) | Zero-cost, low-latency local ONNX vector inference (384 dimensions) |
| **Database** | PostgreSQL 16 (`pgvector`) / SQLite (`aiosqlite`) | Production `pgvector` support with zero-config SQLite local development fallback |
| **Testing** | Pytest, `pytest-asyncio`, HTTPX | 62 unit & integration tests, run in CI |
| **Deployment** | Docker, Docker Compose | Unified multi-container orchestration |

---

## 🔌 API Endpoints Overview

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/v1/repositories/import` | Import a GitHub repository or built-in sample (`sample:fastapi`) and trigger background indexing |
| `GET` | `/api/v1/repositories` | List all indexed and in-progress repositories |
| `GET` | `/api/v1/repositories/{repo_id}` | Retrieve repository metadata, indexing status, file count, and chunk count |
| `GET` | `/api/v1/repositories/{repo_id}/progress-stream` | **SSE Stream**: Live 4-stage indexing progress (`cloning` $\rightarrow$ `parsing_ast` $\rightarrow$ `embedding` $\rightarrow$ `ready`) |
| `GET` | `/api/v1/repositories/{repo_id}/tree` | Retrieve hierarchical file explorer tree with language and line metrics |
| `GET` | `/api/v1/repositories/{repo_id}/files/{file_id}` | Fetch raw source file content and extracted file-level AST symbols |
| `GET` | `/api/v1/repositories/{repo_id}/symbols` | Search extracted `ASTSymbol` definitions (`class`, `function`, `method`, `interface`) |
| `GET` | `/api/v1/repositories/{repo_id}/dependencies` | Compute or fetch cached static module dependency graph and coupling metrics |
| `POST` | `/api/v1/repositories/{repo_id}/search` | Execute Hybrid RRF search + 1-Hop AST Call-Graph expansion with score breakdown |
| `POST` | `/api/v1/repositories/{repo_id}/chat/stream` | **SSE Stream**: Grounded AI chat streaming tokens, verified citations, and 1-hop context |
| `POST` | `/api/v1/repositories/{repo_id}/evaluate` | Run the quantitative retrieval & citation grounding benchmark suite |
| `GET` | `/api/v1/repositories/{repo_id}/evaluations` | List historical benchmark evaluation runs and sample-level metrics |

---

## 🚦 Quick Start Guide

### Option 1: Local Development (Zero Docker Requirement)

#### 1. Backend Setup
```bash
# Navigate to backend
cd backend

# Create and activate a virtual environment
python -m venv .venv
# PowerShell:
.\.venv\Scripts\Activate.ps1
# macOS / Linux:
# source .venv/bin/activate

# Install dependencies
python -m pip install -r requirements.txt

# Run FastAPI server (runs on http://localhost:8000)
python -m uvicorn app.main:app --reload --port 8000
```
*Note: Running `python -m uvicorn` invokes Uvicorn directly through the active Python interpreter (preventing `PATH` lookup failures when global `Scripts` directories are not on `PATH`). On first startup, SpectraCode automatically seeds and indexes the built-in `fastapi-cloudflow` microservice sample repository.*

#### 2. Frontend Setup
```bash
# Navigate to frontend in a new terminal
cd frontend

# Install dependencies
npm install

# Start development server (runs on http://localhost:3000)
npm run dev
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.

---

### Import limits

Imports that exceed any of these limits stop with a readable error shown on the dashboard, instead of filling the disk or tying up the indexing worker. Override them as environment variables or in `backend/.env`:

| Setting | Default | What it bounds |
| :--- | :--- | :--- |
| `MAX_CHECKOUT_MB` | `250` | Working-tree size after cloning (`.git` excluded); an oversized checkout is deleted |
| `MAX_INDEXED_FILES` | `3000` | Source files indexed (files over 1 MB, binaries, hidden folders and dependency or build folders such as `node_modules` and `dist` are already skipped) |
| `MAX_CHUNKS` | `5000` | Code chunks embedded; roughly 15–20 minutes at the ~5 chunks/s measured on a laptop CPU |
| `INDEXING_TIMEOUT_SECONDS` | `1800` | Wall-clock time for the whole indexing run |

Re-importing a repository that is still indexing does nothing, and two simultaneous re-imports queue a single indexing run. Indexing runs inside the server process, so a restart interrupts it. On startup, any repository left mid-indexing is marked failed ("Indexing was interrupted…") so it can be imported again. This assumes a single server process, which is how the Dockerfile runs it.

### Option 2: Docker Compose (Full Production Stack)

```bash
# Start PostgreSQL (pgvector), Redis, Backend, and Frontend
docker-compose up --build
```

---

## 🧪 Automated Testing & Benchmark Results

SpectraCode includes a 62-test automated suite in `backend/tests/` (run in CI on every push):

```bash
cd backend
python -m pytest tests/ -v
```

### Test Suite Breakdown:
- `test_ast_chunker.py`: Verifies Tree-sitter Python & TypeScript parsing, symbol extraction, docstring binding, and 1-indexed line intervals.
- `test_hybrid_retriever.py`: Verifies `CodeQueryNormalizer` identifier splitting, dynamic $\alpha$ tuning, vectorized batch cosine similarity, 1-hop AST symbol extraction (`_extract_referenced_symbols`), and dense scores being scaled before the final blend with BM25.
- `test_citation_engine.py`: Verifies exact interval containment, clamped boundary overlaps, hallucinated file rejection, and pre-/post-generation abstention gates.
- `test_evaluator.py`: Verifies `Recall@K`, `MRR`, `Citation Precision`, `Citation Recall`, `Citation F1`, citation grounding (`faithfulness`), and dynamic AST benchmark suite generation.
- `test_llm_service.py`: Verifies Gemini grounded generation, visible fallback to template responses on API/network failures without leaking source code to logs, SSE generation-source reporting, and JSON log formatting.
- `test_api.py`: Verifies `/health`, `/`, and repository lifecycle API endpoints.
- `test_import_limits.py`: Checkout-size, file-count, chunk-count and indexing-timeout limits fail with a clear message.
- `test_import_concurrency.py`: Startup recovery of interrupted indexing, one indexing run per racing re-import, and a racing first import returning the existing row.
- `test_sample_identifier.py`: Only the exact `sample:fastapi` identifier selects the bundled demo repo.
- `test_retrieval_eval.py`: BM25 baseline, Recall@K / MRR / Answered@K relevance rules, bootstrap intervals and suite validation.

### Retrieval benchmark (real repository)

#### What we learned

255 hand-labelled questions against `psf/requests` v2.32.3, 208 of them real Stack Overflow and GitHub issue titles. Over the 208 real questions:

| Mode | Recall@10 (code) | Answered@10 (code or docs) | MRR@10 |
| :--- | :--- | :--- | :--- |
| BM25 | 0.38 | 0.62 | 0.21 |
| Dense only | **0.52** | 0.70 | **0.30** |
| **Hybrid (production)** | 0.48 | **0.72** | 0.28 |

- **Real questions are much harder than self-written ones.** On 31 questions written alongside the code, the hybrid reaches Recall@10 0.90. On real questions it reaches 0.48. Self-written benchmarks overstate retrieval quality.
- **The hybrid clearly beats keyword search** over all 255 questions: Recall@10 +0.11 [+0.07, +0.16].
- **The hybrid is not clearly better than dense-only search** over all 255 (Recall@10 −0.03 [−0.07, +0.02]). Each wins on different questions: dense-only finds more code for plain-language questions, and the hybrid finds changelog entries that share the question's exact wording (+0.30 Recall@10 on 23 change questions).
- **Most ideas did not survive a fair test.** Since the switch to BM25, every proposed change was tested on new questions committed before scoring. One was adopted (scaling dense scores before fusion, as a fix that did no harm). Two were rejected: routing plain questions to dense-only, and hiding tests and the changelog unless asked.

The details, each group's table and every test follow.

```bash
cd backend
python scripts/eval_retrieval.py eval/suites/requests_v2_32_3.json
```

The script clones `psf/requests` at commit `0e322af8` (tag v2.32.3), indexes it with the normal pipeline into its own database under `backend/data/eval/` (never the dev database), and scores 255 hand-labelled questions in eight groups, reported separately below. Indexing takes about 2–3 minutes the first time; later runs reuse it. Results are deterministic and saved to [`backend/eval/results/requests_v2_32_3.json`](backend/eval/results/requests_v2_32_3.json).

761 chunks (source, tests and docs are all indexed). The table covers the first 31 queries. Mean over queries, with 95% bootstrap intervals:

| Mode | Recall@5 | Recall@10 | MRR@10 |
| :--- | :--- | :--- | :--- |
| BM25 (keyword baseline) | 0.63 [0.47, 0.79] | 0.73 [0.58, 0.87] | 0.51 [0.37, 0.66] |
| Sparse signal only (BM25 inside the hybrid) | 0.63 [0.47, 0.79] | 0.73 [0.58, 0.87] | 0.50 [0.37, 0.66] |
| Dense only (`bge-small-en-v1.5`) | 0.71 [0.55, 0.85] | 0.85 [0.73, 0.97] | 0.57 [0.44, 0.70] |
| **Hybrid (production)** | **0.84** [0.71, 0.95] | **0.90** [0.81, 0.98] | **0.64** [0.51, 0.78] |

The hybrid's sparse signal is BM25 over the stored chunk tokens, so it nearly matches the BM25 baseline row; the small MRR difference comes from the stored tokens also including the symbol name.

What this does and does not show:
- **Hybrid beats BM25** on all three metrics. Paired differences: Recall@5 +0.21 [+0.08, +0.34], Recall@10 +0.18 [+0.06, +0.31], MRR@10 +0.13 [+0.04, +0.23].
- **Hybrid is not measurably better than dense-only**: Recall@10 +0.05 [−0.03, +0.16], MRR@10 +0.07 [−0.03, +0.18].
- 31 queries is small, hence the wide intervals. All of them were written by the same person who chose the ground truth after reading the function list, which favours lexical matching. These are the most optimistic numbers here; the Stack Overflow sets below are the realistic ones.
- Ground truth only counts implementation code, so a highly ranked docs page explaining the same behaviour is scored as a miss.

#### Held-out check (16 queries)

16 further queries (`author: claude-heldout`) were written after the BM25 change and not used to make it. They share the original queries' author bias. Means:

| Mode | Recall@5 | Recall@10 | MRR@10 |
| :--- | :--- | :--- | :--- |
| BM25 | 0.47 | 0.53 | 0.54 |
| Dense only | 0.66 | 0.84 | 0.48 |
| Hybrid before BM25 | 0.53 | 0.59 | 0.24 |
| Hybrid before the dense-scaling fix | 0.53 | 0.62 | 0.61 |
| **Hybrid (production)** | 0.62 | 0.72 | 0.62 |

- The BM25 change holds up for ranking: MRR@10 +0.36 [+0.19, +0.54] over the hybrid before it.
- These queries exposed the fusion problem described below. Even after the fix, the hybrid still recalls less than dense-only (Recall@10 −0.12 [−0.28, 0.00]).

#### Real user questions (Stack Overflow titles)

Question titles copied verbatim from the top-voted `python-requests` questions on Stack Overflow, in vote order, by a fixed rule recorded in the suite notes. Ground truth is the function that implements what the question asks about. **Answered@10** also accepts a user-docs section that directly answers the question (`docs_answers` in the suite); one accepted answer is enough.

Recall@10 is for code; Answered@10 also accepts docs.

| Mode | First 15: Recall@10 | First 15: Answered@10 | Second 40: Recall@10 | Second 40: Answered@10 | Third 40: Recall@10 | Third 40: Answered@10 | Fourth 60: Recall@10 | Fourth 60: Answered@10 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| BM25 | 0.27 | 0.53 | 0.28 | 0.65 | 0.28 | 0.57 | 0.32 | 0.60 |
| Dense only | 0.40 | 0.53 | **0.39** | **0.68** | **0.50** | 0.80 | **0.63** | **0.75** |
| **Hybrid (production)** | **0.53** | **0.67** | 0.26 | 0.60 | 0.47 | **0.88** | 0.50 | **0.75** |

- **Real questions score far lower than the Claude-written ones** (code Recall@10 0.26–0.53 vs 0.90). Treat the 0.90 as an upper bound, not as expected behaviour.
- For the first 15, the docs answers were picked after the retrieval results had been seen. For the second and third 40 and the fourth 60, the questions, code ground truth and docs answers were all fixed and committed before any retrieval run on them.
- **On the second 40, dense-only search finds more of the implementing code than the hybrid**: Recall@10 +0.12 [+0.03, +0.25]. That comparison was not planned in advance, so it is a lead to confirm on new questions, not a result. The routing test below checked it on the third 40, and it mostly did not repeat.
- **On the fourth 60 the gap appears again**: dense minus hybrid Recall@10 +0.13 [+0.02, +0.23], MRR@10 +0.08 [+0.01, +0.16], with no difference on Answered@10 (0.00 [−0.13, +0.12]). The fourth 60 were collected for the scope test below, not to test routing, so this is a second unplanned lead, not a result.

#### Identifier questions (GitHub issue titles, 30 queries)

Issue titles from `psf/requests`, copied verbatim in order of comment count. Only titles that the retriever's router treats as naming code (a dotted name, camelCase, snake_case or a path) were kept, under the same one-implementing-function rule. Labels were committed before any retrieval run.

| Mode | Recall@10 | Answered@10 | MRR@10 |
| :--- | :--- | :--- | :--- |
| BM25 | 0.57 | 0.60 | 0.30 |
| Dense only | **0.67** | **0.77** | 0.38 |
| **Hybrid (production)** | 0.60 | 0.67 | **0.45** |

The hybrid ranks the code higher than BM25: MRR@10 +0.15 [+0.06, +0.26] (Recall@10 +0.03 [0.00, +0.10]). Between dense-only and the hybrid there is no clear difference with 30 questions: dense minus hybrid Recall@10 +0.07 [−0.10, +0.23], MRR@10 −0.06 [−0.20, +0.06].

#### Routing test: dense-only search for plain questions

Written before the third 40 and the issue titles were collected ([eval/routing_preregistration.md](backend/eval/routing_preregistration.md)). The rule: send plain-language questions to dense-only search only if it clearly improves Recall@10, and decide separately for identifier questions.

- Plain questions (third 40): dense minus hybrid Recall@10 +0.03 [0.00, +0.07]. Only 1 of the 40 questions changed on Recall@10. The lower bound is not above 0, so **plain questions keep the hybrid**.
- Identifier questions (30 issue titles): Recall@10 +0.07 [−0.10, +0.23]. No clear difference either way, so **they keep the hybrid**.
- So the +0.12 gap on the second 40 looks mostly like chance. Dense-only was not worse on the fresh questions, but it was not clearly better, and it lost docs answers on 4 of the 40 plain questions (Answered@10 −0.07 [−0.20, +0.03]).

#### Change questions (GitHub issue titles, 23 queries)

Issue titles from `psf/requests` that report behaviour changing between versions, or name a test, where `HISTORY.md` at v2.32.3 has the matching entry or the test still exists. Ground truth is that changelog entry (21) or test function (2); the implementing code, where there is one, counts for Answered@10. Labels were committed before any retrieval run.

| Mode | Recall@10 | Answered@10 | MRR@10 |
| :--- | :--- | :--- | :--- |
| BM25 | **0.78** | **0.78** | **0.51** |
| Dense only | 0.35 | 0.48 | 0.25 |
| **Hybrid (production)** | 0.65 | 0.65 | 0.39 |

Changelog entries share the issue's exact wording (version numbers, option names), which suits keyword search. The hybrid beats dense-only here (Recall@10 +0.30 [+0.13, +0.52]) and trails BM25 without a clear difference (−0.13 [−0.30, 0.00]).

#### Scope test: searching tests and the changelog only when asked

An analysis of the 125 real questions before this test ([eval/miss_analysis.md](backend/eval/miss_analysis.md)) found that tests and `HISTORY.md` often push the implementing code out of the top 10. The plan ([eval/scope_gate_preregistration.md](backend/eval/scope_gate_preregistration.md)) was written before the fourth 60 and the change questions were collected. The candidate hides test files unless the question mentions tests, and hides the changelog and packaging files unless it mentions a version, a release or a change. It is adopted only if it clearly gains on code questions **and** the cost on change questions is shown to be under 0.10 Recall@10.

- Code questions (fourth 60): candidate minus hybrid Recall@10 +0.08 [+0.02, +0.15], 5 gains and no losses. **Gain rule passes.**
- Change questions (23): Recall@10 0.00 [−0.17, +0.17], 2 gains and 2 losses. Both losses were phrased without a trigger word ("no longer work", "are now"). The interval is too wide to show the cost is under 0.10. **Cost rule fails.**
- So **production keeps searching every file.** The test found no cost on average but could not rule one out with 23 questions; a retest would need a larger set of change questions, planned first.

#### Fusion fix: scaling dense scores before the final blend

The final scoring step used to add raw dense cosine scores (bunched between about 0.70 and 0.81) to BM25 scores scaled to [0, 1], so BM25 effectively decided the order. Dense scores are now min-max scaled over the repository's chunks first.

- First test ([eval/fusion_preregistration.md](backend/eval/fusion_preregistration.md)), written before the first 15 Stack Overflow questions were scored: the rule was to adopt the fix only if it clearly improved Recall@10. It measured +0.13 [0.00, +0.33], so the fix was not adopted.
- Second test ([eval/fusion_replication_preregistration.md](backend/eval/fusion_replication_preregistration.md)), committed before the second 40 were scored: the rule was to adopt the fix if it did not make retrieval worse. Recall@10 +0.00 [0.00, 0.00] (no question changed), MRR@10 +0.01 [−0.03, +0.05]. **Adopted.**
- So the fix corrects the scale mismatch without measurably hurting retrieval. It brought no measurable gain on fresh questions; the gains on the earlier sets did not repeat. It also lost the docs answer on 2 of the 40 questions (Answered@10 −0.05 [−0.13, 0.00]), which was reported but was not part of the decision.

#### History: replacing the custom sparse score with BM25

The first version of this benchmark showed that the original sparse score (substring token overlap + `rapidfuzz` partial ratio) was far weaker than BM25 (Recall@10 0.50 vs 0.73), and that the hybrid was not measurably better than either baseline (0.68 / 0.82 / 0.55 for Recall@5 / Recall@10 / MRR@10). Replacing it with BM25, with no other tuning, changed the hybrid by Recall@5 +0.10 [−0.03, +0.24], Recall@10 +0.05 [−0.06, +0.16] and MRR@10 +0.11 [+0.04, +0.19]: a clear ranking improvement, not a clear recall improvement. Three queries were fixed and one regressed (`bad_status_exception`). Mean query latency fell from about 385 ms to 320 ms.

The in-app `/evaluation` page's "citation grounding" metric (stored as `faithfulness`) only checks that cited line ranges fall inside retrieved chunks. It does **not** check that the generated answer's claims are true.

---

## 📁 Repository Structure

```text
SpectraCode/
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── routes/
│   │   │   │   ├── repositories.py    # Import, SSE progress-stream, tree, files, symbols, dependencies
│   │   │   │   ├── search.py          # Hybrid RRF + 1-hop AST search endpoint
│   │   │   │   ├── chat.py            # Streaming SSE chat with verified citations
│   │   │   │   └── evaluation.py      # Quantitative benchmark runner & tuning
│   │   │   └── router.py
│   │   ├── core/
│   │   │   ├── config.py              # Pydantic settings & environment configuration
│   │   │   └── logging.py             # Structured JSON logging formatter
│   │   ├── db/
│   │   │   ├── session.py             # Async engine & schema lifecycle
│   │   │   └── models.py              # SQLAlchemy models (pgvector + SQLite)
│   │   ├── ingestion/
│   │   │   ├── ast_chunker.py         # Tree-sitter AST parser & semantic chunker
│   │   │   ├── git_importer.py        # Safe sandboxed GitHub clone & sample generator
│   │   │   ├── dependency_analyzer.py # Module import graph & coupling metrics
│   │   │   └── worker.py              # Async indexing coordinator & IndexingProgressTracker
│   │   ├── retrieval/
│   │   │   ├── embeddings.py          # FastEmbed ONNX local vector inference
│   │   │   └── hybrid_retriever.py    # Dense + Sparse + RRF + 1-Hop AST Call-Graph expansion
│   │   ├── generation/
│   │   │   ├── citation_engine.py     # Grounded citation parser, <linked_hop_chunk> & interval gate
│   │   │   └── llm_service.py         # Streaming grounded answer generator
│   │   ├── evaluation/
│   │   │   ├── benchmark_dataset.py   # Curated test queries with ground-truth spans
│   │   │   └── evaluator.py           # Recall@K, MRR, Citation Precision/Recall/F1, citation grounding
│   │   └── main.py                    # FastAPI application entrypoint
│   ├── tests/                         # 62 unit & integration tests
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx               # Modern Developer Dashboard
│   │   │   ├── evaluation/page.tsx    # Quantitative Benchmark & Evaluation Dashboard
│   │   │   └── repos/[id]/page.tsx    # 3-Pane Intelligence Workspace
│   │   ├── components/
│   │   │   ├── Navbar.tsx
│   │   │   ├── FileExplorer.tsx       # Tree file hierarchy with language badges
│   │   │   ├── CodeViewer.tsx         # Code viewer with line range highlights
│   │   │   ├── ChatInterface.tsx      # Streaming AI chat with clickable citations
│   │   │   ├── ExecutionTraceStepper.tsx # Interactive multi-hop flow stepper & auto-walkthrough
│   │   │   ├── SearchModal.tsx        # Hybrid search modal (⌘K)
│   │   │   ├── DependencyGraph.tsx    # Interactive module coupling visualizer
│   │   │   └── RepoImportModal.tsx    # 1-Click import with live 4-stage SSE progress tracker
│   │   ├── lib/api.ts                 # Typed client for REST & SSE backend endpoints
│   │   └── styles/globals.css
│   ├── Dockerfile
│   └── package.json
├── docs/
│   ├── ARCHITECTURE.md                # Detailed system design
│   ├── RAG_PIPELINE.md                # Code chunking, RRF & 1-hop expansion details
│   ├── EVALUATION_REPORT.md           # Benchmark results & metrics
│   └── SECURITY.md                    # Untrusted input policy & sandboxing
├── docker-compose.yml
└── README.md
```

---

## 🎯 Recruiter Demonstration Walkthrough

When presenting SpectraCode to recruiters, hiring managers, or engineering teams:

1. **Live SSE Repository Ingestion**:
   - Launch SpectraCode (`http://localhost:3000`) and open the **Import Repository** modal.
   - Import a repository or click **"Load Sample Repository"** (`fastapi-cloudflow`).
   - Watch the **4-Stage SSE Progress Tracker** animate smoothly through `Git Clone` $\rightarrow$ `AST Parsing` $\rightarrow$ `ONNX Vectors` $\rightarrow$ `Ready`, streaming the active file name and chunk count in real time.
2. **AST Code Explorer & Code Viewer**:
   - Open the repository workspace. Browse the file tree (`src/auth/jwt_manager.py`, `src/services/job_scheduler.py`, `src/api/routes.py`).
   - Click AST Symbol badges (`TokenManager`, `verify_token`, `DistributedScheduler`) to jump directly to symbol definitions inside the code viewer.
3. **Grounded Multi-Hop AI Chat & Flow Stepper**:
   - Ask a cross-file architectural question, e.g.: *"How does request authentication verify JWT tokens and schedule background jobs?"*
   - Watch the AI response stream in real time with verified citations (`[src/api/routes.py:15-38]`, `[src/auth/jwt_manager.py:11-34]`) powered by **1-Hop AST Call-Graph Context Expansion**.
   - Use the **Multi-Hop Flow Stepper** (`ExecutionTraceStepper`) beneath the response: click **Play** (or step `1 → 2 → 3`) to automatically walk through each cited file and line span in the code viewer.
4. **Hybrid RRF Search (`⌘K`)**:
   - Press `⌘K` to launch the Hybrid Search modal.
   - Query `verify_token` or `schedule_job` and inspect the transparent score telemetry showing **Dense Vector Similarity**, **Sparse Lexical Match**, **RRF Fused Score**, and **1-Hop Linked Symbols**.
5. **Quantitative Grounded Evaluation (`/evaluation`)**:
   - Navigate to `/evaluation` and click **"Run Benchmark Suite"**.
   - Inspect the 6-metric ledger for the bundled sample repo (a smoke test on 5 curated queries; see the README's retrieval benchmark section for results on a real repository).
   - Point out the out-of-scope negative query (`Kubernetes Helm chart`), showing that the assistant declines to answer instead of citing unrelated code. This is one query, not an accuracy measurement.

---

## 🔒 Security Policy

SpectraCode treats repository contents as untrusted inputs. Static AST parsing via Tree-sitter never executes repository code, file paths are strictly normalized against directory traversal, and all citations pass through interval verification gates. See [SECURITY.md](docs/SECURITY.md) for details.

---

## 📄 License

MIT License.
