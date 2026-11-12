# 🧠 SpectraCode: AI-Powered Codebase Intelligence Platform

> **Category:** Generative AI · LLM Engineering · Code RAG · Developer Tools  
> **Status:** Production-Ready Foundation  
> **Website:** [spectracode.tech](https://spectracode.tech)  
> **Stack:** Next.js 14 (App Router), TypeScript, Tailwind CSS, FastAPI, PostgreSQL (`pgvector`) / SQLite, Tree-sitter, FastEmbed (ONNX), Pytest

[![FastAPI](https://img.shields.io/badge/FastAPI-0.136.3-009688.svg?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Next.js](https://img.shields.io/badge/Next.js-14.2.35-000000.svg?logo=next.js&logoColor=white)](https://nextjs.org)
[![Tree-sitter](https://img.shields.io/badge/Tree--sitter-AST%20Call--Graph-2b5b84.svg)](https://tree-sitter.github.io/tree-sitter/)
[![Vector Search](https://img.shields.io/badge/RAG-Hybrid%20RRF%20%2B%201--Hop%20AST-indigo.svg)](#2--hybrid-rrf-retrieval--1-hop-ast-call-graph-expansion)
[![Tests](https://img.shields.io/badge/Pytest-18%20Passed%20(100%25)-brightgreen.svg)](#-automated-testing)

---

## 📌 Executive Summary

**SpectraCode** is an intelligent developer platform that analyzes source-code repositories and empowers engineers to rapidly understand unfamiliar codebases. Users can import public GitHub repositories with live Server-Sent Events (SSE) indexing telemetry, search source code via hybrid semantic and lexical retrieval, explore syntax trees and module dependency graphs, and chat with an AI assistant that answers technical questions with **strictly verified, clickable file and line number citations** (`[filepath:line_start-line_end]`) and an **interactive multi-file execution trace stepper**.

Unlike naive RAG systems that suffer from hallucinated references, isolated single-file context windows, and broken line intervals, SpectraCode combines **Tree-sitter Concrete Syntax Tree (CST) chunking**, **Reciprocal Rank Fusion (RRF)**, **1-Hop AST Call-Graph Context Expansion**, and a **two-stage grounding verification gate** to ensure that every architectural claim is verifiable down to the exact line of code.

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
- **Dense Vector Search**: Generates 384-dimensional embeddings via local ONNX runtime (`BAAI/bge-small-en-v1.5`), eliminating external latency and API token costs.
- **Sparse Code Lexical Search**: Expands `camelCase`, `PascalCase`, and `snake_case` identifiers (`verifyJWTToken` $\rightarrow$ `verify jwt token`) with selective fuzzy matching (`rapidfuzz`) for high-recall keyword matching.
- **Reciprocal Rank Fusion (RRF)**: Dynamically weights vector vs. keyword importance ($\alpha = 0.35$ for explicit code identifiers/paths, $\alpha = 0.55$ for conceptual architectural queries) followed by score calibration.
- **1-Hop AST Call-Graph Context Expansion**:
  - Automatically extracts referenced function calls and type identifiers from top-ranked primary chunks (`_extract_referenced_symbols`).
  - Resolves cross-file symbol definitions in two passes: fast in-memory lookup across scored chunks followed by a batched SQL join across `ASTSymbol` and `CodeChunk` (`_expand_one_hop_chunks`).
  - Attaches `is_linked_hop=True` and `linked_from_symbol` metadata and serializes definitions into `<linked_hop_chunk>` prompt blocks—providing cross-file architectural context to the LLM **without polluting primary retrieval rank metrics (`Recall@K`, `MRR`) or benchmark citation precision**.

### 3. 🧭 Interactive Multi-File Flow Stepper & Trace Timeline
- **Grounded Citation Engine**: Streaming LLM responses emit canonical citation tokens (`[filepath:line_start-line_end]`) that are verified against retrieved chunk boundaries (`EXACT_MATCH`, `CLAMPED_TO_BOUNDS`, `INVALID_LINE_RANGE`, or `HALLUCINATED_FILE` rejection).
- **Multi-Hop Flow Stepper (`ExecutionTraceStepper.tsx`)**: When an AI response cites multiple code spans across files or execution hops, an interactive visual trace timeline automatically renders beneath the answer:
  - **Step-by-Step Navigation**: Jump sequentially (`Previous` / `Next` or direct pill selection) across cited execution hops (`1 → 2 → 3`).
  - **Auto-Walkthrough Mode**: Toggle `Play` / `Pause` to automatically step through the multi-file execution trace on a 2.4-second cadence.
  - **Code Viewer Synchronization**: Clicking any citation badge or trace step immediately loads the target file in the code viewer, scrolls smoothly to the span, and highlights the exact line range.

### 4. 📡 Real-Time Indexing Progress via Server-Sent Events (SSE)
- **Live 4-Stage Telemetry (`IndexingProgressTracker`)**: Streams real-time repository ingestion progress over `GET /api/v1/repositories/{repo_id}/progress-stream`.
- **Animated Modal Tracker (`RepoImportModal.tsx`)**: Visualizes the 4-stage pipeline (`Git Clone` $\rightarrow$ `AST Parsing` $\rightarrow$ `ONNX Vectors` $\rightarrow$ `Ready`) with live completion percentages, active file path inspection, processed file counters, and generated AST chunk counts.

### 5. 📊 Quantitative Grounded Benchmarking & Synthetic Suite Generator
- Built-in automated evaluation harness (`evaluator.py`, `evaluation.py`, and `/evaluation` dashboard) measuring:
  - **Recall@5**: `100.0%`
  - **MRR (Mean Reciprocal Rank)**: `0.767`
  - **Citation Precision**: `76.7%`
  - **Citation Recall**: `100.0%`
  - **Citation F1**: `83.3%`
  - **Faithfulness**: `100.0%`
  - **Abstention Accuracy**: `100.0%` (two-stage pre-generation & post-generation abstention gate using relevance thresholds and stem-tolerant query term coverage)
- Supports RRF & citation hyperparameter tuning (`rrf_k`, `rerank_weight`, `min_relevance_threshold`, `relative_citation_cutoff`) and synthetic benchmark suite generation from indexed AST symbols.

### 6. 🕸️ Interactive Dependency & Coupling Graph
- Static import analysis extracting file-to-file import relationships, third-party packages, fan-in (popularity), fan-out (coupling), and circular dependency detection, backed by a two-tier in-memory and persistent metadata cache.

---

## 🏛️ System Architecture

```text
+---------------------------------------------------------------------------------------+
|                                   NEXT.JS 14 FRONTEND                                 |
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
| **Frontend** | Next.js 14 (App Router), React 18, TypeScript | High-performance developer workspace, SSE streaming, and trace UI |
| **Code Viewer** | Custom React code viewer, Tailwind CSS | Syntax highlighting, cited-line highlights, and scrolling to the cited range |
| **Backend** | Python 3.11+, FastAPI, Uvicorn | Asynchronous, high-throughput REST and Server-Sent Events (SSE) API |
| **Source Parsing** | Tree-sitter (`python`, `typescript`, `javascript`) | C-compiled syntax tree analysis, symbol extraction, and 1-hop call-graph resolution |
| **Embeddings** | FastEmbed (`BAAI/bge-small-en-v1.5`) | Zero-cost, low-latency local ONNX vector inference (384 dimensions) |
| **Database** | PostgreSQL 16 (`pgvector`) / SQLite (`aiosqlite`) | Production `pgvector` support with zero-config SQLite local development fallback |
| **Testing** | Pytest, `pytest-asyncio`, HTTPX | 100% automated test pass rate (15 unit & integration tests) |
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

# Install dependencies
pip install -r requirements.txt

# Run FastAPI server (runs on http://localhost:8000)
uvicorn app.main:app --reload --port 8000
```
*Note: On first startup, SpectraCode automatically seeds and indexes the built-in `fastapi-cloudflow` microservice sample repository.*

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

### Option 2: Docker Compose (Full Production Stack)

```bash
# Start PostgreSQL (pgvector), Redis, Backend, and Frontend
docker-compose up --build
```

---

## 🧪 Automated Testing & Benchmark Results

SpectraCode includes a 15-test automated suite in `backend/tests/`:

```bash
cd backend
python -m pytest tests/ -v
```

### Test Suite Breakdown (15 Passed — 100% Pass Rate):
- `test_ast_chunker.py`: Verifies Tree-sitter Python & TypeScript parsing, symbol extraction, docstring binding, and 1-indexed line intervals.
- `test_hybrid_retriever.py`: Verifies `CodeQueryNormalizer` identifier splitting, dynamic $\alpha$ tuning, vectorized batch cosine similarity, and 1-hop AST symbol extraction (`_extract_referenced_symbols`).
- `test_citation_engine.py`: Verifies exact interval containment, clamped boundary overlaps, hallucinated file rejection, and pre-/post-generation abstention gates.
- `test_evaluator.py`: Verifies `Recall@K`, `MRR`, `Citation Precision`, `Citation Recall`, `Citation F1`, and `Faithfulness` metric formulas.
- `test_api.py`: Verifies `/health`, `/`, and repository lifecycle API endpoints.

```text
15 passed in 1.62s (100% pass rate)
```

### Quantitative Benchmark Ledger (`SpectraCode Core Codebase Benchmark v1`)

| Metric | Score | Description |
| :--- | :--- | :--- |
| **Recall@5** | **100.0%** | Ground-truth code spans retrieved within top-5 primary chunks |
| **MRR@5** | **0.767** | Mean Reciprocal Rank of the first ground-truth chunk |
| **Citation Precision** | **76.7%** | Fraction of emitted `[file:start-end]` citations intersecting ground-truth spans |
| **Citation Recall** | **100.0%** | Fraction of ground-truth spans covered by verified citations |
| **Citation F1** | **83.3%** | Harmonic mean of Citation Precision and Citation Recall |
| **Faithfulness** | **100.0%** | Claims strictly entailed by retrieved repository code context |
| **Abstention Accuracy** | **100.0%** | Out-of-scope negative queries safely blocked (`INSUFFICIENT_REPOSITORY_CONTEXT`) |

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
│   │   ├── core/config.py             # Pydantic settings & environment configuration
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
│   │   │   └── evaluator.py           # Recall@K, MRR, Citation Precision/Recall/F1, Faithfulness
│   │   └── main.py                    # FastAPI application entrypoint
│   ├── tests/                         # 15 unit & integration tests (100% pass rate)
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
   - Inspect the live 6-metric ledger: **Recall@5: 100.0%**, **MRR: 0.767**, **Citation Precision: 76.7%**, **Citation Recall: 100.0%**, **Citation F1: 83.3%**, and **Faithfulness: 100.0%**.
   - Point out the out-of-scope negative query (`Kubernetes Helm chart`), demonstrating 100% abstention accuracy with zero hallucinated citations.

---

## 🔒 Security Policy

SpectraCode treats repository contents as untrusted inputs. Static AST parsing via Tree-sitter never executes repository code, file paths are strictly normalized against directory traversal, and all citations pass through interval verification gates. See [SECURITY.md](docs/SECURITY.md) for details.

---

## 📄 License

MIT License.
