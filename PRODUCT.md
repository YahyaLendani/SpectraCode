# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two audiences, weighted equally (confirmed by the owner, 2026-11-11):

- **Engineers reading an unfamiliar codebase.** They import a public GitHub repository, then spend a long session in the workspace: browsing files, searching, asking questions, and following each cited answer back to the exact lines.
- **Portfolio reviewers.** Recruiters and engineers judging the project itself. They arrive cold, skim for about a minute, and need to see what the product does and that it is carefully made.

## Product Purpose

SpectraCode indexes a source repository and answers questions about it with citations that point to a real file and line range. It exists so that an engineer can trust an answer about code they have not read, because every claim can be checked against the source in one click. Success is a reader who goes from question to the cited lines without doubting the reference.

## Positioning

Answers are checked before they are shown. Every `[file:start-end]` citation is verified against the retrieved code spans, out-of-range citations are clamped or rejected, and the assistant abstains when the repository does not support an answer. The project measures this with its own benchmark suite rather than asserting it.

## Operating Context

- Import a public GitHub repository by URL, or load the bundled FastAPI sample. Indexing progress streams live in four stages: clone, parse, embed, ready.
- Repo workspace: file explorer, code viewer with line highlighting, streaming chat with clickable citations, a step-through trace when an answer cites several spans, hybrid search (Ctrl/Cmd+K), and a module dependency graph.
- Benchmarks page: run the evaluation suite against an indexed repository and tune retrieval parameters.
- Runs locally (SQLite) or through Docker Compose (Postgres with pgvector, Redis).

## Capabilities and Constraints

- Languages parsed: Python, TypeScript, TSX, JavaScript.
- Chunking follows function, method, class, and interface boundaries (Tree-sitter), with 1-indexed inclusive line ranges.
- Retrieval fuses local vector search (`BAAI/bge-small-en-v1.5`, 384 dimensions, ONNX) with identifier-aware keyword search by Reciprocal Rank Fusion, then expands one hop along the call graph.
- Answer generation uses Gemini or OpenAI, with a mock provider when no key is set.
- Frontend: Next.js 14 App Router, TypeScript, Tailwind CSS 3, lucide-react, Remotion player for the pipeline animation.
- Terminology in use: workspace (an indexed repository), span (an indexed chunk of code), citation, trace, benchmark.

## Brand Commitments

- Name: SpectraCode.
- Copy is written in plain language. Technical facts stay accurate; no claim is added that the code or the evaluation report does not support (owner approved a plain-language rewrite, 2026-11-11).
- The earlier dark graphite, all-monospace look is retired; the owner asked for a new identity that does not read as machine-generated.

## Evidence on Hand

- Benchmark results in `docs/EVALUATION_REPORT.md` and the live `/evaluation` page.
- Architecture and pipeline notes in `docs/ARCHITECTURE.md`, `docs/RAG_PIPELINE.md`, `docs/SECURITY.md`.
- The bundled FastAPI sample repository for demonstrations.
- No customers, testimonials, pricing, or usage numbers exist. Do not invent them.

## Product Principles

1. The citation is the product. Anything that makes a reference easier to check outranks decoration.
2. Show the measurement, not the adjective. Numbers come from the benchmark suite or they are not shown.
3. Say it plainly. A reviewer with one minute and an engineer in hour three both read the same words.
4. The code is the content. Interface chrome stays out of the way of source text.
