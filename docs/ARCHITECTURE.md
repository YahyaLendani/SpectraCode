# RepoLens System Architecture

## 1. Architectural Overview

RepoLens is an AI-powered developer platform designed to analyze, parse, index, and explain complex source-code repositories with 100% grounded file and line number citations.

```
+-----------------------------------------------------------------------------------+
|                                 NEXT.JS FRONTEND                                  |
|   - Modern Developer Dashboard       - AST File Explorer & Code Viewer            |
|   - Streaming AI Chat with Citations - Interactive Module Dependency Graph        |
+------------------------------------------+----------------------------------------+
                                           | HTTP / Server-Sent Events (SSE)
                                           v
+-----------------------------------------------------------------------------------+
|                              FASTAPI BACKEND RUNTIME                              |
|                                                                                   |
|  +--------------------+  +----------------------+  +----------------------------+ |
|  |  Git Ingestion     |  | Tree-sitter AST      |  | Hybrid RRF Retriever       | |
|  |  Worker & Sandbox  |  | Semantic Chunker     |  | (Dense + Sparse + RRF)     | |
|  +--------------------+  +----------------------+  +----------------------------+ |
|            |                        |                           |                 |
|            |                        |                           v                 |
|            v                        v              +----------------------------+ |
|  +----------------------------------------------+  | Grounded Citation Engine   | |
|  |          PostgreSQL 16 / SQLite Engine       |  | (Interval Snapping & Gate) | |
|  |  (Repos, Files, Symbols, Chunks, Embeddings) |  +----------------------------+ |
+--+----------------------------------------------+---------------------------------+
```

---

## 2. Component Boundaries

### 2.1 Ingestion & Sandbox Layer (`app/ingestion/git_importer.py`)
- **Untrusted Code Isolation**: External repositories are treated as untrusted inputs. RepoLens never compiles, executes, or runs hooks from imported repositories.
- **Filtering**: Strips lockfiles, generated binaries, media, `.git/`, `node_modules/`, and ignores files exceeding 1 MB or containing binary null bytes (`\x00`).
- **Deterministic Checksumming**: Computes SHA-256 digests for all indexed files to track commit diffs.

### 2.2 AST Parsing & Semantic Chunking (`app/ingestion/ast_chunker.py`)
- Powered by compiled C-bindings for **Tree-sitter** (`tree-sitter-python`, `tree-sitter-typescript`, `tree-sitter-javascript`).
- Extracts **Classes**, **Methods**, **Functions**, **Interfaces**, and **Module Imports**.
- Preserves **1-indexed line intervals** `[start_line, end_line]` and byte offsets.
- Prepends every chunk with a **Structural Context Header**:
  ```python
  # [RepoLens AST Context] File: src/auth/jwt_manager.py | Lines: 12-35 | Lang: python
  # Scope: TokenManager.verify_token (method) | Doc: Decodes and validates JWT claims.
  # Imports: jwt; datetime; src.config
  # --- BEGIN SOURCE ---
  ```

### 2.3 Hybrid Retrieval & Reranking (`app/retrieval/hybrid_retriever.py`)
- **Dense Semantic Retrieval**: Generates 384-dimensional vector embeddings using local ONNX `FastEmbed` (`BAAI/bge-small-en-v1.5`), eliminating external embedding API dependencies and costs.
- **Sparse Code-Aware Lexical Search**: Normalizes `camelCase`, `PascalCase`, and `snake_case` identifiers (`parseASTNode` -> `parse ast node`) to overcome traditional NLP stemmer failures on code.
- **Reciprocal Rank Fusion (RRF)**:
  $$\text{Score}_{\text{RRF}}(d) = \alpha \cdot \frac{1}{60 + \text{rank}_{\text{dense}}(d)} + (1 - \alpha) \cdot \frac{1}{60 + \text{rank}_{\text{sparse}}(d)}$$
  Dynamic $\alpha$: Shifts to $\alpha = 0.35$ when regex detects explicit code identifiers, and $\alpha = 0.55$ for conceptual questions.

### 2.4 Grounded Citation Engine (`app/generation/citation_engine.py`)
- Prefixes every line in the LLM context prompt with its line number (`  42 | class TokenManager:`).
- Parses `[filepath:start-end]` citations from streaming tokens.
- **Validation Passes**:
  1. *Exact Containment*: Cited span is strictly within retrieved chunk bounds.
  2. *Clamped Overlap*: Snaps overlapping citations to retrieved boundaries.
  3. *Rejection / Stripping*: Invalid line ranges or hallucinated file names are stripped.
  4. *Abstention Gate*: If claims cannot be verified against indexed code, the engine triggers `INSUFFICIENT_REPOSITORY_CONTEXT`.

---

## 3. Database Schema

- **`repositories`**: GitHub owner, name, clone URL, indexing status, total files, total chunks, commit SHA.
- **`repository_files`**: Relative path, language, line count, byte size, SHA-256.
- **`ast_symbols`**: Symbol name, qualified name, kind (`class`, `function`, `method`, `interface`), signature, docstring, start_line, end_line.
- **`code_chunks`**: Chunk index, start_line, end_line, raw code, contextualized text, content hash, lexical tokens.
- **`chunk_embeddings`**: Vector embedding, model name, dimensions.
- **`conversations` & `messages`**: Multi-turn chat history, verified citations, rejected citations, latency, abstention status.
- **`evaluation_runs` & `evaluation_sample_results`**: Benchmark metric records (Recall@K, MRR, Citation Precision/Recall, Faithfulness).
